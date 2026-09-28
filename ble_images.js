// IMG1 transport. No browser globals: exercised with deterministic mock GATT.
const BLEImages=(()=>{
  const SIZE=9472;
  const hex=id=>(id>>>0).toString(16).padStart(8,'0');
  function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
  function frame(op,id,n=5){const a=new Uint8Array(n);a[0]=op;new DataView(a.buffer).setUint32(1,id,true);return a;}
  function begin(id,bytes,palette){
    if(!Number.isInteger(id)||id<=0||id>0xffffffff||bytes.length!==SIZE||![2,3].includes(palette))throw Error('Invalid image metadata');
    for(const b of bytes)for(let s=0;s<=6;s+=2)if(((b>>s)&3)>=palette)throw Error('Invalid image palette');
    const a=frame(1,id,17),v=new DataView(a.buffer);v.setUint16(5,296,true);v.setUint16(7,128,true);a[9]=palette;v.setUint16(10,SIZE,true);v.setUint32(12,crc32(bytes),true);a[16]=1;return a;
  }
  function compatible(s){return s==='IMG1:READY'||/^(RECV|VERIFIED|REFRESH|DONE|ABORT|ERR):[0-9a-f]{8}(?::[A-Z0-9]+)?$/.test(s);}
  async function send(io,bytes,palette,id,progress=()=>{},env={}) {
    const now=env.now||(()=>performance.now()),sleep=env.sleep||(ms=>new Promise(r=>setTimeout(r,ms)));
    bytes=bytes.slice(); // Own immutable bytes across asynchronous GATT operations.
    const start=now(),tag=hex(id),header=begin(id,bytes,palette);
    const initial=await io.read();
    if(!compatible(initial))throw Error('Photo firmware required. Upload epaper_ble_images, then reconnect.');
    if(/^(REFRESH|VERIFIED|RECV):/.test(initial))throw Error('Device busy. Wait for the panel or reconnect to clear a partial transfer.');
    async function wait(accept,limit){
      const deadline=now()+limit;
      do {const s=await io.read();if(s.startsWith(`ERR:${tag}:`))throw Error(s);if(accept(s))return s;await sleep(50);}while(now()<deadline);
      throw Error('Device acknowledgement timed out; disconnect and retry.');
    }
    let frameSize=20;
    if(io.capability==='FAST1:180') {
      const probe=frame(5,id,180);
      for(let i=5;i<probe.length;i++)probe[i]=i^probe[1+(i%4)];
      // No image has begun. Only the nonmutating probe may fail into fallback.
      // An operation timeout can leave GATT pending: abort instead of overlapping.
      try {
        await io.write(probe);
        await wait(s=>s===`PROBE:${tag}:180`,1500);
        frameSize=180;
      } catch(error) {
        const safe=error.name==='InvalidModificationError'||error.name==='NotSupportedError'||error.message===`ERR:${tag}:PROBE`||error.message==='Device acknowledgement timed out; disconnect and retry.';
        if(!safe)throw error;
      }
    }
    const mode=frameSize===180?'fast':'legacy';
    progress({stage:'negotiated',mode,frameSize,bytes:0,total:SIZE});
    await io.write(header); await wait(s=>s===`RECV:${tag}:0`,5000);
    let sinceAck=0;
    for(let offset=0;offset<SIZE;){
      const count=Math.min(frameSize-7,SIZE-offset),a=frame(2,id,7+count);
      new DataView(a.buffer).setUint16(5,offset,true);a.set(bytes.subarray(offset,offset+count),7);
      await io.write(a);offset+=count;sinceAck++;
      if(sinceAck===16||offset===SIZE) {await wait(s=>s===`RECV:${tag}:${offset}`,5000);sinceAck=0;progress({stage:'sending',bytes:offset,total:SIZE});}
    }
    await io.write(frame(3,id));
    const accepted=await wait(s=>s===`VERIFIED:${tag}`||s===`REFRESH:${tag}`||s.startsWith(`DONE:${tag}:`),5000);
    const transferMs=now()-start;progress({stage:'refreshing',bytes:SIZE,total:SIZE,transferMs});
    const done=accepted.startsWith('DONE:')?accepted:await wait(s=>s.startsWith(`DONE:${tag}:`),45000);
    const panelMs=Number(done.split(':')[2]);
    if(!Number.isFinite(panelMs))throw Error('Invalid panel timing');
    return {transferMs,panelMs,id,mode,frameSize};
  }
  return {SIZE,crc32,frame,begin,compatible,send};
})();
if(typeof module!=='undefined')module.exports=BLEImages;
