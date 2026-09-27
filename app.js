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
function photoError(message){++textRevision;prepared=null;el('message').textContent=message;update();}
function renderPhoto(){
  prepared=null;
  if(el('mode').value==='text'){renderText();return;}
  for(const id of ['cropCanvas','preview']){el(id).width=296;el(id).height=128;el(id).style.maxWidth='';}
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
let textDocument=RichText.create(),selection={start:0,end:0},textRevision=0;
const styleControls={textSize:'size',textFont:'family',textColor:'color',textBold:'bold',textItalic:'italic',textUnderline:'underline',textStrike:'strike'};
function currentStyle(){return RichText.style({size:Number(el('textSize').value),family:el('textFont').value,color:el('textColor').value,bold:el('textBold').checked,italic:el('textItalic').checked,underline:el('textUnderline').checked,strike:el('textStrike').checked});}
function retainSelection(){
  selection={start:el('text').selectionStart,end:el('text').selectionEnd};
  const count=selection.end-selection.start;
  el('selectionStatus').textContent=count?`${count} selected characters: formatting applies only to this selection.`:'No selection: formatting applies to the whole message and new text.';
}
async function renderText(){
  const revision=++textRevision,modeEpoch=epoch;
  prepared=null;const preview=el('preview');preview.getContext('2d').clearRect(0,0,preview.width,preview.height);update();
  try{
    currentStyle(); // Reject incomplete/invalid toolbar values, never reuse an older valid payload.
    const doc=textDocument,options={background:el('textBackground').value,align:el('textAlign').value,orientation:Number(el('textOrientation').value)};
    el('message').textContent='Loading fonts and preparing text…';
    await RichText.loadFonts(doc,document.fonts);
    if(revision!==textRevision||modeEpoch!==epoch||el('mode').value!=='text')return;
    const result=RichText.render(el('cropCanvas').getContext('2d',{willReadFrequently:true}),doc,options);
    const encoded=PhotoCodec.encode(result.codes),decoded=PhotoCodec.decode(encoded);
    // Preview is reconstructed from transmitted bytes, inverse-mapped to upright reading view.
    const logical=RichText.fromWire(decoded,options.orientation);
    preview.width=result.width;preview.height=result.height;
    preview.style.maxWidth=result.width===128?'256px':'';
    preview.getContext('2d').putImageData(new ImageData(PhotoCodec.preview(logical),result.width,result.height),0,0);
    if(result.sameColor)el('message').textContent='Some text matches the background colour. Choose contrasting colours before sending.';
    else if(result.overflow)el('message').textContent='Text does not fit. Preview is clipped; reduce size or shorten text. Sending is blocked.';
    else {
      prepared={bytes:Uint8Array.from(encoded.slice(22).match(/../g),b=>parseInt(b,16)),palette:decoded.includes(2)?3:2};
      el('message').textContent=`Text preview ready: ${result.lines.length} lines, ${result.width} × ${result.height}. Tap Send text when ready.`;
    }
  }catch(error){if(revision===textRevision&&modeEpoch===epoch)el('message').textContent=error.message;}
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
for(const event of ['select','keyup','pointerup','touchend','blur'])el('text').addEventListener(event,retainSelection);
document.addEventListener('selectionchange',()=>{if(document.activeElement===el('text'))retainSelection();});
// Capture before focus moves to native iPhone selects/number inputs.
el('textControls').addEventListener('pointerdown',()=>{if(document.activeElement===el('text'))retainSelection();},true);
let beforeEdit=null;
el('text').addEventListener('beforeinput',()=>{beforeEdit={start:el('text').selectionStart,end:el('text').selectionEnd,text:textDocument.text};});
el('text').addEventListener('input',()=>{
  try{
    const text=el('text').value,s=currentStyle(),b=beforeEdit;
    const added=b?text.length-(b.text.length-(b.end-b.start)):-1;
    if(b&&added>=0&&text.slice(0,b.start)===b.text.slice(0,b.start)&&text.slice(b.start+added)===b.text.slice(b.end))textDocument=RichText.replace(textDocument,b.start,b.end,text.slice(b.start,b.start+added),s);
    else textDocument=RichText.edit(textDocument,text,s);
    beforeEdit=null;retainSelection();renderText();
  }catch(error){photoError(error.message);}
});
el('text').addEventListener('paste',event=>{
  if(!event.clipboardData)return;
  event.preventDefault();
  const text=event.clipboardData.getData('text/plain').replace(/\r\n?/g,'\n');
  const input=el('text'),start=input.selectionStart,end=input.selectionEnd;
  if(input.value.length-(end-start)+text.length>2000){photoError('Use at most 2000 characters.');return;}
  beforeEdit={start,end,text:textDocument.text};input.setRangeText(text,start,end,'end');input.dispatchEvent(new Event('input',{bubbles:true}));
});
for(const [id,key] of Object.entries(styleControls))el(id).addEventListener('input',()=>{
  try{
    const value=currentStyle()[key],{start,end}=selection;
    textDocument=RichText.apply(textDocument,start===end?0:start,start===end?textDocument.text.length:end,{[key]:value});
    renderText();
  }catch(error){++textRevision;photoError(error.message);}
});
for(const id of ['textBackground','textAlign','textOrientation'])el(id).addEventListener('input',renderText);
for(const id of ['cropX','cropY','zoom','palette'])el(id).addEventListener('input',renderPhoto);
if(!supported)report('Open this HTTPS page in Bluefy and allow Bluetooth access.');
update();
