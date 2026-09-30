'use strict';
const SERVICE='6e400001-b5a3-f393-e0a9-e50e24dcca9e',RX='6e400002-b5a3-f393-e0a9-e50e24dcca9e',TX='6e400003-b5a3-f393-e0a9-e50e24dcca9e';
const el=id=>document.getElementById(id);
let device=null,rx=null,tx=null,working=false,localBusy=false,sourceImage=null,sourceBlob=null,photoLoading=false,prepared=null,epoch=0;
const supported=!!(window.isSecureContext&&navigator.bluetooth);
function report(message){el('status').textContent=message;el('log').textContent=(message+'\n'+el('log').textContent).slice(0,6000);}
function update(){
  const ready=!!(device&&device.gatt.connected&&rx&&tx);
  el('connect').disabled=!supported||working||ready;
  el('read').disabled=working||!ready;
  el('send').disabled=working||localBusy||!ready||!prepared;
  el('disconnect').disabled=!(device&&device.gatt.connected);
  el('editor').disabled=working||localBusy;
  if(el('library'))el('library').disabled=working||localBusy||photoLoading;
  if(typeof updateGallery==='function')updateGallery();
}
function clearConnection(){rx=tx=null;if(!el('status').textContent.startsWith('Error:'))report('Disconnected. A partial transfer is discarded; an already-started refresh continues.');update();}
async function bounded(promise){
  let timer;
  try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Bluetooth operation timed out')),8000);})]);}
  finally{clearTimeout(timer);}
}
async function run(action){if(working||localBusy)return;working=true;update();try{await action();}catch(error){
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
el('send').addEventListener('click',()=>run(sendPrepared));
async function sendPrepared(payload=prepared){
  const bytes=payload.bytes.slice(),palette=payload.palette;
  let id;do{id=crypto.getRandomValues(new Uint32Array(1))[0];}while(!id);
  const currentDevice=device,currentRX=rx,currentTX=tx;
  function check(){if(device!==currentDevice||!currentDevice.gatt.connected)throw Error('Bluetooth disconnected');}
  // Optional capability: old firmware has no such characteristic and stays IMG1.
  let capability='';
  try {
    const service=await bounded(currentDevice.gatt.getPrimaryService(SERVICE));
    const cap=await bounded(service.getCharacteristic('6e400004-b5a3-f393-e0a9-e50e24dcca9e'));
    capability=new TextDecoder().decode(await bounded(cap.readValue()));
  } catch(error) { check(); if(error.name!=='NotFoundError')throw error; }
  const io={capability,read:async()=>{check();return new TextDecoder().decode(await bounded(currentTX.readValue()));},write:async a=>{check();await bounded(typeof currentRX.writeValueWithResponse==='function'?currentRX.writeValueWithResponse(a):currentRX.writeValue(a));}};
  el('progress').value=0;report('Starting image transfer…');
  const result=await BLEImages.send(io,bytes,palette,id,p=>{
    el('progress').value=p.bytes;
    if(p.stage==='negotiated'){report(p.mode==='fast'?'Fast transfer confirmed (180-byte writes).':'Compatible transfer (20-byte writes).');return;}
    report(p.stage==='sending'?`Sending: ${p.bytes} / ${p.total} bytes`:`Image verified. Transfer ${(p.transferMs/1000).toFixed(1)} s. Waiting for panel…`);
  });
  report(`FINISHED (${result.mode==='fast'?'fast':'compatible'}). Transfer ${(result.transferMs/1000).toFixed(1)} s; panel refresh ${(result.panelMs/1000).toFixed(1)} s. You can send more text or another photo without reflashing.`);
  return result;
}
function photoError(message){++textRevision;prepared=null;el('message').textContent=message;update();}
function renderPhoto(){
  prepared=null;
  if(el('mode').value==='combined'){renderCombined();return;}
  if(el('mode').value==='text'){renderText();return;}
  if(el('mode').value==='qr'){renderQR();return;}
  const angle=Number(el('photoOrientation').value),{width,height}=RichText.dimensions(angle);
  for(const id of ['cropCanvas','preview']){el(id).width=width;el(id).height=height;el(id).style.maxWidth=width===128?'256px':'';}
  if(!sourceImage){update();return;}
  try{
    const box=PhotoCodec.crop(sourceImage.naturalWidth,sourceImage.naturalHeight,Number(el('cropX').value),Number(el('cropY').value),Number(el('zoom').value),width,height);
    const ctx=el('cropCanvas').getContext('2d',{willReadFrequently:true});ctx.fillStyle='white';ctx.fillRect(0,0,width,height);ctx.drawImage(sourceImage,...box,0,0,width,height);
    const red=el('palette').value==='red',codes=RichText.toWire(PhotoCodec.quantize(ctx.getImageData(0,0,width,height).data,red,width,height),angle);
    const encoded=PhotoCodec.encode(codes),decoded=PhotoCodec.decode(encoded);
    if(!codes.every((c,i)=>c===decoded[i]))throw Error('Preview encoding failed');
    const bytes=Uint8Array.from(encoded.slice(22).match(/../g),b=>parseInt(b,16));
    prepared={bytes,palette:red?3:2};
    el('preview').getContext('2d').putImageData(new ImageData(PhotoCodec.preview(RichText.fromWire(decoded,angle)),width,height),0,0);
    el('message').textContent='Preview ready. Tap Send photo when connected.';
  }catch(error){photoError(error.message);}
  update();
}
el('photo').addEventListener('change',async()=>{
  if(el('photo').files.length>1){await prepareGalleryBatch(el('photo').files);return;}
  const revision=++epoch;sourceImage=null;sourceBlob=null;prepared=null;photoLoading=true;update();
  for(const id of ['cropCanvas','preview'])el(id).getContext('2d').clearRect(0,0,el(id).width,el(id).height);
  const file=el('photo').files[0];if(!file){photoLoading=false;photoError('Choose a JPEG or PNG.');document.dispatchEvent(new Event('designphoto'));return;}
  el('message').textContent='Preparing on your phone…';let url;
  try{
    const header=new Uint8Array(await file.slice(0,8).arrayBuffer());PhotoCodec.checkFile(file.size,header);
    const image=new Image();url=URL.createObjectURL(file);image.src=url;await image.decode();
    if(revision!==epoch||!['photo','combined'].includes(el('mode').value))return;
    if(image.naturalWidth<=0||image.naturalHeight<=0||image.naturalWidth*image.naturalHeight>20000000)throw Error('Use an image up to 20 megapixels');
    sourceImage=image;sourceBlob=new Blob([file],{type:header[0]===137?'image/png':'image/jpeg'});el('cropX').value='50';el('cropY').value='50';el('zoom').value='1';renderPhoto();
  }catch(error){if(revision===epoch)photoError('Cannot prepare photo: '+error.message);}
  finally{if(url)URL.revokeObjectURL(url);if(revision===epoch){photoLoading=false;update();document.dispatchEvent(new Event('designphoto'));}}
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
  if(el('mode').value==='combined')return renderCombined();
  const revision=++textRevision,modeEpoch=epoch;
  prepared=null;const preview=el('preview');preview.getContext('2d').clearRect(0,0,preview.width,preview.height);update();
  try{
    currentStyle(); // Reject incomplete/invalid toolbar values, never reuse an older valid payload.
    const doc=textDocument,options={background:el('textBackground').value,align:el('textAlign').value,orientation:Number(el('textOrientation').value),autoFit:el('textAutoFit').checked};
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
    else if(result.overflow)el('message').textContent='Text does not fit. '+(options.autoFit?'Even at the 8px minimum, ':'')+'Preview is clipped; reduce size or shorten text. Sending is blocked.';
    else {
      prepared={bytes:Uint8Array.from(encoded.slice(22).match(/../g),b=>parseInt(b,16)),palette:decoded.includes(2)?3:2};
      el('message').textContent=`Text preview ready: ${result.lines.length} lines, ${result.width} × ${result.height}. Tap Send text when ready.`;
      if(result.autoFitted)el('message').textContent+=` Auto-fit reduced sizes to ${result.effectiveMin}–${result.effectiveMax}px; original sizes are preserved.`;
    }
  }catch(error){if(revision===textRevision&&modeEpoch===epoch)el('message').textContent=error.message;}
  update();
}
function renderQR(){
  if(el('mode').value==='combined')return renderCombined();
  ++textRevision;prepared=null;
  const preview=el('preview');preview.width=296;preview.height=128;preview.style.maxWidth='';
  try{
    const result=QRCodec.render(el('qrText').value),encoded=PhotoCodec.encode(RichText.toWire(result.codes,0)),decoded=PhotoCodec.decode(encoded);
    preview.getContext('2d').putImageData(new ImageData(PhotoCodec.preview(RichText.fromWire(decoded,0)),296,128),0,0);
    prepared={bytes:Uint8Array.from(encoded.slice(22).match(/../g),b=>parseInt(b,16)),palette:2};
    el('message').textContent=`QR preview ready: ${result.modules} modules, ${result.scale}px per module, 4-module white border. Scan-check before use.`;
  }catch(error){el('message').textContent=error.message;}
  update();
}
function showControls(){
  const mode=el('mode').value,combined=mode==='combined',template=el('combinedTemplate').value;
  el('combinedControls').hidden=!combined;
  for(const name of ['text','photo','qr'])el(name+'Controls').hidden=combined?(name!=='text'&&!template.includes(name)):name!==mode;
  for(const id of ['textOrientation','photoOrientation'])el(id).disabled=combined;
}
async function renderCombined(){
  const revision=++textRevision,modeEpoch=epoch,preview=el('preview');prepared=null;
  preview.getContext('2d').clearRect(0,0,preview.width,preview.height);update();
  try{
    currentStyle();
    const doc=textDocument,options={template:el('combinedTemplate').value,orientation:Number(el('combinedOrientation').value),background:el('textBackground').value,align:el('textAlign').value,autoFit:el('textAutoFit').checked,cropX:Number(el('cropX').value),cropY:Number(el('cropY').value),zoom:Number(el('zoom').value),red:el('palette').value==='red',qrText:el('qrText').value};
    el('message').textContent='Loading fonts and preparing layout…';
    await RichText.loadFonts(doc,document.fonts);
    if(revision!==textRevision||modeEpoch!==epoch||el('mode').value!=='combined')return;
    const result=Combined.render(el('cropCanvas').getContext('2d',{willReadFrequently:true}),doc,sourceImage,options);
    const encoded=PhotoCodec.encode(result.codes),decoded=PhotoCodec.decode(encoded);
    preview.width=result.width;preview.height=result.height;preview.style.maxWidth=result.width===128?'256px':'';
    preview.getContext('2d').putImageData(new ImageData(PhotoCodec.preview(RichText.fromWire(decoded,options.orientation)),result.width,result.height),0,0);
    prepared={bytes:Uint8Array.from(encoded.slice(22).match(/../g),b=>parseInt(b,16)),palette:decoded.includes(2)?3:2};
    el('message').textContent='Combined preview ready. Tap Send combined when ready.';
    if(result.text.autoFitted)el('message').textContent+=` Auto-fit reduced sizes to ${result.text.effectiveMin}–${result.text.effectiveMax}px; original sizes are preserved.`;
    if(result.qr)el('message').textContent+=` QR: ${result.qr.scale}px modules, 4-module white border. Scan-check before use.`;
  }catch(error){if(revision===textRevision&&modeEpoch===epoch)el('message').textContent=error.message;}
  update();
}
el('mode').addEventListener('change',()=>{
  ++epoch;photoLoading=false;prepared=null;
  const mode=el('mode').value;
  showControls();
  el(mode+'PreviewSlot').appendChild(el('preview'));
  el('send').textContent=`Send ${mode==='qr'?'QR':mode} over Bluetooth`;
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
for(const id of ['textBackground','textAlign','textOrientation','textAutoFit'])el(id).addEventListener('input',renderText);
for(const id of ['cropX','cropY','zoom','palette','photoOrientation'])el(id).addEventListener('input',renderPhoto);
el('qrText').addEventListener('input',renderQR);
for(const id of ['combinedTemplate','combinedOrientation'])el(id).addEventListener('input',()=>{showControls();renderCombined();});
if(!supported)report('Open this HTTPS page in Bluefy and allow Bluetooth access.');
update();
