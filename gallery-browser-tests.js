// Real DOM integration with mock GATT only; no radio/hardware claims.
(async()=>{
 const tests=[],assert=(v,m)=>{if(!v)throw Error(m);};
 const saved={device,rx,tx,prepared,working,localBusy,photoLoading,confirm:window.confirm};
 let reply='',writes=[],missing=false,capability='GAL1:8:180',running=false;
 const command={async writeValueWithResponse(a){writes.push(Array.from(a));const v=new DataView(a.buffer,a.byteOffset,a.byteLength),id=v.getUint32(1,true);if(a[0]===5)running=true;if(a[0]===6)running=false;reply=`G:${id.toString(16).padStart(8,'0')}:OK:1:8:${running?1:0}`;},async readValue(){return new TextEncoder().encode(reply);}};
 function connect(){device={gatt:{connected:true,disconnect(){this.connected=false;},async getPrimaryService(){return {async getCharacteristic(uuid){if(missing)throw new DOMException('not found','NotFoundError');return uuid===GalleryBLE.CAP?{async readValue(){return new TextEncoder().encode(capability);}}:command;}};}}};rx={};tx={};galleryCharacteristic=null;working=localBusy=photoLoading=false;update();}
 async function click(id){el(id).click();for(let i=0;i<100&&working;i++)await new Promise(r=>setTimeout(r,5));assert(!working,'UI operation settled');}
 try{
 connect();assert(!el('galleryProbe').disabled&&el('galleryStart').disabled,'explicit discovery gate');await click('galleryProbe');assert(el('gallerySlot').options.length===8&&!el('galleryStart').disabled,'discovery exposes slots');assert(writes.length===1&&writes[0][0]===1,'probe lists only');tests.push('gallery explicit discovery, list acknowledgement and eight slot DOM options');
 working=true;update();assert(el('galleryShow').disabled&&el('gallerySave').disabled,'BLE lock');working=false;localBusy=true;update();assert(el('galleryStart').disabled,'local lock');localBusy=false;update();tests.push('gallery shares BLE and local editor busy interlocks');
 el('galleryInterval').value='180';await click('galleryStart');assert(running&&el('galleryStatus').textContent.includes('ON'),'start ACK');await click('galleryStop');assert(!running&&el('galleryStatus').textContent.includes('OFF'),'stop ACK');tests.push('gallery start and stop render correlated acknowledged state');
 window.confirm=()=>false;const count=writes.length;await click('galleryDelete');await click('gallerySave');assert(writes.length===count,'cancel prevents write');tests.push('cancelled destructive/save confirmation sends nothing');
 connect();missing=true;await click('galleryProbe');assert(device.gatt.connected&&!galleryCharacteristic&&el('galleryStatus').textContent.includes('not supported'),'legacy connection preserved');tests.push('unsupported legacy gallery leaves normal BLE connection usable');
 connect();missing=false;capability='GAL1:UNAVAILABLE';await click('galleryProbe');assert(device.gatt.connected&&el('status').textContent.includes('provisioning'),'unavailable fails visibly without unnecessary disconnect');assert(!galleryCharacteristic&&el('galleryStart').disabled,'no unsafe gallery access');tests.push('unavailable filesystem reports owner provisioning and disables commands');
 for(const failure of ['native string failure',{code:17,description:'native failure'},undefined]){
  connect();device.gatt.getPrimaryService=async()=>{throw failure;};await click('galleryProbe');
  assert(device.gatt.connected&&!galleryCharacteristic&&el('galleryStart').disabled,'discovery failure retains link but disables gallery');assert(el('galleryStatus').textContent.includes('service discovery')&&!el('status').textContent.includes('undefined'),'stage and normalized error shown');
 }
 tests.push('string/object/undefined discovery rejections keep connection and identify failure stage');
 connect();device.gatt.getPrimaryService=async()=>{throw Object.assign(Error('timed out'),{code:'GATT_TIMEOUT'});};await click('galleryProbe');assert(!device.gatt.connected&&!rx,'timeout invalidates transport');tests.push('uncertain timed-out discovery still disconnects before another GATT operation');
 connect();missing=false;capability='GAL1:8:180';const originalWrite=command.writeValueWithResponse;
 try{command.writeValueWithResponse=async()=>{throw 'native list write failure';};await click('galleryProbe');assert(!device.gatt.connected&&!galleryCharacteristic&&el('galleryStatus').textContent.includes('slot list command/acknowledgement')&&el('status').textContent.includes('native list write failure'),'uncertain command failure retains detail and disconnects');}finally{command.writeValueWithResponse=originalWrite;}
 tests.push('slot-list write failure identifies command stage and invalidates uncertain session');
 return await (async()=>{
  connect();missing=false;capability='GAL1:8:180';await click('galleryProbe');
  const canvas=document.createElement('canvas');canvas.width=400;canvas.height=300;const ctx=canvas.getContext('2d');ctx.fillStyle='red';ctx.fillRect(0,0,200,300);
  const blob=await new Promise(r=>canvas.toBlob(r,'image/png')),files=[new File([blob],'one.png',{type:'image/png'}),new File([blob],'two.png',{type:'image/png'})];
  const dt=new DataTransfer();for(const f of files)dt.items.add(f);el('photo').files=dt.files;el('photo').dispatchEvent(new Event('change'));
  for(let i=0;i<200&&localBusy;i++)await new Promise(r=>setTimeout(r,5));
  assert(el('photo').multiple&&el('batchPhotos').multiple&&batchItems.length===2,'native multiselect routes to batch');
  assert(el('batchPreviews').querySelectorAll('canvas').length===2,'two previews');
  const angle=Number(el('photoOrientation').value),dims=RichText.dimensions(angle);
  for(const item of batchItems){const bytes=item.bytes;assert(bytes.length===9472,'bounded payload');const wire=new Uint8Array(296*128);for(let p=0;p<wire.length;p++)wire[p]=(bytes[p>>2]>>(6-2*(p%4)))&3;const expected=PhotoCodec.preview(RichText.fromWire(wire,angle)),actual=item.label.previousSibling.getContext('2d').getImageData(0,0,dims.width,dims.height).data;assert(expected.every((v,i)=>v===actual[i]),'preview equals packed payload');}
  tests.push('multi-photo input decodes both files and previews exact queued bytes');
  const originalSend=sendPrepared;let sent=0;window.confirm=()=>true;
  try{sendPrepared=async payload=>{assert(payload===batchItems[sent],'sends queued payload');sent++;return {id:77+sent};};await click('batchSave');assert(sent===2&&el('batchStatus').textContent.includes('All 2 photos saved'),'batch completes');assert(el('batchSave').disabled,'completed queue cannot replay');assert(writes.filter(w=>w[0]===2).slice(-2).map(w=>w[5]).join(',')==='1,2','empty slots only');}
  finally{sendPrepared=originalSend;}
  tests.push('batch button sequentially saves queued photos to empty slots without replay');
  await prepareGalleryBatch([files[0],new File(['not an image'],'bad.heic')]);assert(batchItems.length===0&&el('batchSave').disabled&&el('batchStatus').textContent.includes('rejected'),'invalid batch atomic');
  tests.push('invalid member rejects entire batch before any transfer');
  return {passed:tests.length,tests};
 })();
 }finally{device=saved.device;rx=saved.rx;tx=saved.tx;prepared=saved.prepared;working=saved.working;localBusy=saved.localBusy;photoLoading=saved.photoLoading;window.confirm=saved.confirm;galleryCharacteristic=null;galleryState=null;update();}
})()
