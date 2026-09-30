'use strict';
let batchItems=[],batchAttempted=false;
function updateGalleryBatch(ready,busy){
 el('batchPhotos').disabled=busy;
 el('batchSave').disabled=!ready||busy||!galleryCharacteristic||!batchItems.length||batchAttempted;
}
async function prepareGalleryBatch(files){
 if(working||localBusy||photoLoading)return;
 localBusy=true;batchItems=[];batchAttempted=false;el('batchPreviews').replaceChildren();el('deviceGallery').open=true;update();
 const chosen=Array.from(files),angle=Number(el('photoOrientation').value),red=el('palette').value==='red';
 try{
  if(chosen.length<1||chosen.length>8)throw Error('Choose 1–8 photos. Nothing was queued.');
  const next=[],views=[],{width,height}=RichText.dimensions(angle);
  for(const file of chosen){
   el('batchStatus').textContent=`Preparing ${next.length+1}/${chosen.length}: ${file.name}`;
   PhotoCodec.checkFile(file.size,new Uint8Array(await file.slice(0,8).arrayBuffer()));
   const url=URL.createObjectURL(file),image=new Image();
   try{
    image.src=url;await image.decode();
    if(image.naturalWidth<=0||image.naturalHeight<=0||image.naturalWidth*image.naturalHeight>20000000)throw Error('Use images up to 20 megapixels.');
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='white';ctx.fillRect(0,0,width,height);
    ctx.drawImage(image,...PhotoCodec.crop(image.naturalWidth,image.naturalHeight,50,50,1,width,height),0,0,width,height);
    const codes=RichText.toWire(PhotoCodec.quantize(ctx.getImageData(0,0,width,height).data,red,width,height),angle),encoded=PhotoCodec.encode(codes),decoded=PhotoCodec.decode(encoded);
    ctx.putImageData(new ImageData(PhotoCodec.preview(RichText.fromWire(decoded,angle)),width,height),0,0);
    canvas.style.maxWidth='100%';canvas.style.width=width===128?'96px':'222px';
    const view=document.createElement('div'),label=document.createElement('p');label.textContent=`${next.length+1}. ${file.name} — ready`;view.append(canvas,label);views.push(view);
    next.push({bytes:Uint8Array.from(encoded.slice(22).match(/../g),b=>parseInt(b,16)),palette:red?3:2,label});
   }finally{URL.revokeObjectURL(url);}
  }
  batchItems=next;el('batchPreviews').replaceChildren(...views);
  el('batchStatus').textContent=`${next.length} photos ready, ${angle}° orientation, ${red?'black/white/red':'black/white'}, centered crop. Check device gallery, then save batch. Changes to editor settings do not change these previews; reselect to rebuild.`;
 }catch(error){batchItems=[];el('batchPreviews').replaceChildren();el('batchStatus').textContent='Batch rejected: '+error.message;}
 finally{localBusy=false;update();}
}
el('batchPhotos').addEventListener('change',()=>prepareGalleryBatch(el('batchPhotos').files));
el('batchSave').addEventListener('click',()=>run(async()=>{
 if(batchAttempted||!batchItems.length)return;
 if(!window.confirm(`Save ${batchItems.length} photos into empty device slots? Each will refresh the panel. Keep Bluefy foreground; slideshow stays OFF until you start it.`))return;
 const items=batchItems.slice();let saved=0;
 batchAttempted=true;
 try{
  await GalleryBatch.save(items,{
   list:async()=>{await galleryCommand(1);return galleryState;},
   stop:()=>galleryCommand(6),send:item=>sendPrepared(item),save:(slot,id)=>galleryCommand(2,id,slot),
   progress:(i,slot,stage)=>{if(stage==='saved')saved++;items[i].label.textContent=`Photo ${i+1} — slot ${slot+1}: ${stage==='saved'?'saved':'sending / save not yet confirmed'}`;el('batchStatus').textContent=`${saved}/${items.length} saved. Keep Bluefy foreground.`;}
  });
  el('batchStatus').textContent=`All ${saved} photos saved. Set the interval and tap Start slideshow. Playback includes all occupied device slots.`;
 }catch(error){el('batchStatus').textContent=`Stopped: ${saved}/${items.length} saves confirmed. ${error.message} Reconnect and list slots before selecting any remaining photos again; the interrupted save may have completed. No automatic retry.`;throw error;}
}));
update();
