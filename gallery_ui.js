'use strict';
// Explicit opt-in discovery keeps legacy firmware's connection path unchanged.
let galleryCharacteristic=null,galleryState=null;
function updateGallery(){
  if(!el('deviceGallery'))return;
  const ready=!!(device&&device.gatt.connected&&rx&&tx),busy=working||localBusy||photoLoading;
  if(!ready){galleryCharacteristic=null;galleryState=null;}
  el('galleryProbe').disabled=!ready||busy;
  for(const id of ['galleryList','galleryShow','galleryDelete','galleryStart','galleryStop','gallerySlot','galleryInterval'])el(id).disabled=!ready||busy||!galleryCharacteristic;
  el('gallerySave').disabled=!ready||busy||!galleryCharacteristic||!prepared;
  if(typeof updateGalleryBatch==='function')updateGalleryBatch(ready,busy);
}
function galleryId(){let id;do{id=crypto.getRandomValues(new Uint32Array(1))[0];}while(!id);return id;}
async function galleryCommand(op,value,slot=Number(el('gallerySlot').value)){
  const c=galleryCharacteristic,d=device;
  const check=()=>{if(!c||device!==d||!d.gatt.connected)throw Error('Gallery disconnected');};
  galleryState=await GalleryBLE.command({write:async a=>{check();await bounded(c.writeValueWithResponse?c.writeValueWithResponse(a):c.writeValue(a));},read:async()=>{check();return new TextDecoder().decode(await bounded(c.readValue()));}},op,galleryId(),slot,value);
  el('galleryStatus').textContent=`Saved slots: ${Array.from({length:galleryState.slots},(_,i)=>galleryState.mask&(1<<i)?i+1:null).filter(Boolean).join(', ')||'none'}. Slideshow ${galleryState.running?'ON':'OFF'}.`;
  report('Device gallery command completed.');
}
el('galleryProbe').addEventListener('click',()=>run(async()=>{
  galleryCharacteristic=null;
  const service=await bounded(device.gatt.getPrimaryService(SERVICE));let cap;
  try{cap=await bounded(service.getCharacteristic(GalleryBLE.CAP));}catch(e){if(e.name!=='NotFoundError')throw e;el('galleryStatus').textContent='Gallery not supported by this firmware. Normal Send still works.';return;}
  const slots=GalleryBLE.capability(new TextDecoder().decode(await bounded(cap.readValue())));
  galleryCharacteristic=await bounded(service.getCharacteristic(GalleryBLE.CMD));
  el('gallerySlot').replaceChildren(...Array.from({length:slots},(_,i)=>new Option(`Slot ${i+1}`,String(i))));
  await galleryCommand(1);
}));
for(const [button,op] of [['galleryList',1],['galleryShow',3],['galleryDelete',4],['galleryStart',5],['galleryStop',6]])el(button).addEventListener('click',()=>run(async()=>{
  if(op===4&&!window.confirm('Delete the selected device slot?'))return;
  await galleryCommand(op,op===5?Number(el('galleryInterval').value):0);
}));
el('gallerySave').addEventListener('click',()=>run(async()=>{
  if(!window.confirm('Send and refresh this preview, then save it in the selected device slot (replacing any existing screen)?'))return;
  const result=await sendPrepared();await galleryCommand(2,result.id);
}));
updateGallery();
