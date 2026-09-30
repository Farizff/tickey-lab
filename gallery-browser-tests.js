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
 connect();missing=false;capability='GAL1:UNAVAILABLE';await click('galleryProbe');assert(!device.gatt.connected&&el('status').textContent.includes('provisioning'),'unavailable fails visibly');assert(!galleryCharacteristic&&el('galleryStart').disabled,'no unsafe gallery access');tests.push('unavailable filesystem reports owner provisioning and disables commands');
 return {passed:tests.length,tests};
 }finally{device=saved.device;rx=saved.rx;tx=saved.tx;prepared=saved.prepared;working=saved.working;localBusy=saved.localBusy;photoLoading=saved.photoLoading;window.confirm=saved.confirm;galleryCharacteristic=null;galleryState=null;update();}
})()
