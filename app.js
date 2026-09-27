'use strict';
const SERVICE='6e400001-b5a3-f393-e0a9-e50e24dcca9e',RX='6e400002-b5a3-f393-e0a9-e50e24dcca9e',TX='6e400003-b5a3-f393-e0a9-e50e24dcca9e';
const el=id=>document.getElementById(id);
let device=null,rx=null,tx=null,working=false,sourceImage=null,prepared=null,epoch=0;
const supported=!!(window.isSecureContext&&navigator.bluetooth);
function report(message){el('status').textContent=message;el('log').textContent=(message+'\n'+el('log').textContent).slice(0,6000);}
function update(){
  const ready=!!(device&&device.gatt.connected&&rx&&tx);
  el('connect').disabled=!supported||working||ready;
  el('read').disabled=working||!ready;
  el('send').disabled=working||!ready||!prepared;
  el('disconnect').disabled=!(device&&device.gatt.connected);
  el('editor').disabled=working;
}
function clearConnection(){rx=tx=null;if(!el('status').textContent.startsWith('Error:'))report('Disconnected. A partial transfer is discarded; an already-started refresh continues.');update();}
async function bounded(promise){
  let timer;
  try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Bluetooth operation timed out')),8000);})]);}
  finally{clearTimeout(timer);}
}
async function run(action){if(working)return;working=true;update();try{await action();}catch(error){
  if(device&&device.gatt.connected)device.gatt.disconnect();
  rx=tx=null;report('Error: '+error.message+' Reconnect before retrying.');
}finally{working=false;update();}}
el('connect').addEventListener('click',()=>run(async()=>{
  report('Choose TICKEY-BLE…');
  device=await navigator.bluetooth.requestDevice({filters:[{name:'TICKEY-BLE'}],optionalServices:[SERVICE]});
  device.addEventListener('gattserverdisconnected',clearConnection);
  const server=await bounded(device.gatt.connect()),service=await bounded(server.getPrimaryService(SERVICE));
  rx=await bounded(service.getCharacteristic(RX));tx=await bounded(service.getCharacteristic(TX));
  const s=new TextDecoder().decode(await bounded(tx.readValue()));
  if(!BLEImages.compatible(s))throw Error('Upload the new epaper_ble_images sketch first');
  report('Connected. Device status: '+s);
}));
el('disconnect').addEventListener('click',()=>{if(device)device.gatt.disconnect();});
el('read').addEventListener('click',()=>run(async()=>report('Device status: '+new TextDecoder().decode(await bounded(tx.readValue())))));
el('send').addEventListener('click',()=>run(async()=>{
  const bytes=prepared.bytes.slice(),palette=prepared.palette;
  let id;do{id=crypto.getRandomValues(new Uint32Array(1))[0];}while(!id);
  const currentDevice=device,currentRX=rx,currentTX=tx;
  function check(){if(device!==currentDevice||!currentDevice.gatt.connected)throw Error('Bluetooth disconnected');}
  const io={read:async()=>{check();return new TextDecoder().decode(await bounded(currentTX.readValue()));},write:async a=>{check();await bounded(typeof currentRX.writeValueWithResponse==='function'?currentRX.writeValueWithResponse(a):currentRX.writeValue(a));}};
  el('progress').value=0;report('Starting image transfer…');
  const result=await BLEImages.send(io,bytes,palette,id,p=>{
    el('progress').value=p.bytes;
    report(p.stage==='sending'?`Sending: ${p.bytes} / ${p.total} bytes`:`Image verified. Transfer ${(p.transferMs/1000).toFixed(1)} s. Waiting for panel…`);
  });
  report(`FINISHED. Transfer ${(result.transferMs/1000).toFixed(1)} s; panel refresh ${(result.panelMs/1000).toFixed(1)} s. You can send more text or another photo without reflashing.`);
}));
function photoError(message){prepared=null;el('message').textContent=message;update();}
function renderPhoto(){
  prepared=null;
  if(el('mode').value==='text'){renderText();return;}
  if(!sourceImage){update();return;}
  try{
    const box=PhotoCodec.crop(sourceImage.naturalWidth,sourceImage.naturalHeight,Number(el('cropX').value),Number(el('cropY').value),Number(el('zoom').value));
    const ctx=el('cropCanvas').getContext('2d',{willReadFrequently:true});ctx.fillStyle='white';ctx.fillRect(0,0,296,128);ctx.drawImage(sourceImage,...box,0,0,296,128);
    const red=el('palette').value==='red',codes=PhotoCodec.quantize(ctx.getImageData(0,0,296,128).data,red);
    const encoded=PhotoCodec.encode(codes),decoded=PhotoCodec.decode(encoded);
    if(!codes.every((c,i)=>c===decoded[i]))throw Error('Preview encoding failed');
    const bytes=Uint8Array.from(encoded.slice(22).match(/../g),b=>parseInt(b,16));
    prepared={bytes,palette:red?3:2};
    el('preview').getContext('2d').putImageData(new ImageData(PhotoCodec.preview(decoded),296,128),0,0);
    el('message').textContent='Preview ready. Tap Send photo when connected.';
  }catch(error){photoError(error.message);}
  update();
}
el('photo').addEventListener('change',async()=>{
  const revision=++epoch;sourceImage=null;prepared=null;update();
  for(const id of ['cropCanvas','preview'])el(id).getContext('2d').clearRect(0,0,296,128);
  const file=el('photo').files[0];if(!file){photoError('Choose a JPEG or PNG.');return;}
  el('message').textContent='Preparing on your phone…';let url;
  try{
    PhotoCodec.checkFile(file.size,new Uint8Array(await file.slice(0,8).arrayBuffer()));
    const image=new Image();url=URL.createObjectURL(file);image.src=url;await image.decode();
    if(revision!==epoch||el('mode').value!=='photo')return;
    if(image.naturalWidth<=0||image.naturalHeight<=0||image.naturalWidth*image.naturalHeight>20000000)throw Error('Use an image up to 20 megapixels');
    sourceImage=image;el('cropX').value='50';el('cropY').value='50';el('zoom').value='1';renderPhoto();
  }catch(error){if(revision===epoch)photoError('Cannot prepare photo: '+error.message);}
  finally{if(url)URL.revokeObjectURL(url);}
});
function renderText(){
  prepared=null;el('preview').getContext('2d').clearRect(0,0,296,128);
  try{
    const color=el('textColor').value;
    const result=TextCodec.render(el('cropCanvas').getContext('2d',{willReadFrequently:true}),el('text').value,color,{
      size:Number(el('textSize').value),family:el('textFont').value,align:el('textAlign').value,
      bold:el('textBold').checked,italic:el('textItalic').checked,underline:el('textUnderline').checked,strike:el('textStrike').checked});
    const codes=result.codes;
    const encoded=PhotoCodec.encode(codes),decoded=PhotoCodec.decode(encoded);
    prepared={bytes:Uint8Array.from(encoded.slice(22).match(/../g),b=>parseInt(b,16)),palette:color==='red'?3:2};
    el('preview').getContext('2d').putImageData(new ImageData(PhotoCodec.preview(decoded),296,128),0,0);
    if(result.overflow){prepared=null;el('message').textContent=`Text does not fit: ${result.lines.length} lines, room for ${result.maxLines}. Preview is clipped; reduce size or shorten text. Sending is blocked.`;}
    else el('message').textContent=`Text preview ready: ${result.lines.length}/${result.maxLines} lines. Tap Send text when ready.`;
  }catch(error){el('message').textContent=error.message;}
  update();
}
el('mode').addEventListener('change',()=>{
  ++epoch;prepared=null;
  const text=el('mode').value==='text';
  el('textControls').hidden=!text;el('photoControls').hidden=text;
  el(text?'textPreviewSlot':'photoPreviewSlot').appendChild(el('preview'));
  el('send').textContent=text?'Send text over Bluetooth':'Send photo over Bluetooth';
  el('preview').getContext('2d').clearRect(0,0,296,128);
  el('message').textContent='Choose a photo. Nothing is sent until you tap Send photo.';
  renderPhoto();
});
for(const id of ['text','textColor','textSize','textFont','textAlign','textBold','textItalic','textUnderline','textStrike'])el(id).addEventListener('input',renderText);
for(const id of ['cropX','cropY','zoom','palette'])el(id).addEventListener('input',renderPhoto);
if(!supported)report('Open this HTTPS page in Bluefy and allow Bluetooth access.');
update();
