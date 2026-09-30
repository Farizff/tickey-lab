'use strict';
const GalleryBLE=(()=>{
  const CAP='6e400005-b5a3-f393-e0a9-e50e24dcca9e',CMD='6e400006-b5a3-f393-e0a9-e50e24dcca9e';
  function capability(s){if(s==='GAL1:UNAVAILABLE')throw Error('Device storage unavailable. No automatic formatting; owner provisioning is required.');const m=/^GAL1:([1-8]):180$/.exec(s);if(!m)throw Error('Unsupported gallery firmware');return Number(m[1]);}
  function frame(op,id,slot=0,value=0){
    if(!Number.isInteger(id)||id<1||id>0xffffffff||![1,2,3,4,5,6].includes(op))throw Error('Invalid gallery command');
    if([2,3,4].includes(op)&&(!Number.isInteger(slot)||slot<0||slot>7))throw Error('Invalid slot');
    if(op===2&&(!Number.isInteger(value)||value<1||value>0xffffffff))throw Error('Missing completed image identity');
    if(op===5&&(!Number.isInteger(value)||value<180||value>86400))throw Error('Interval must be 180–86400 seconds');
    const a=new Uint8Array(op===2?10:op===3||op===4?6:op===5?9:5),v=new DataView(a.buffer);a[0]=op;v.setUint32(1,id,true);
    if([2,3,4].includes(op))a[5]=slot;if(op===2)v.setUint32(6,value,true);if(op===5)v.setUint32(5,value,true);return a;
  }
  async function command(io,op,id,slot,value,env={}){
    const now=env.now||Date.now,sleep=env.sleep||(ms=>new Promise(r=>setTimeout(r,ms))),tag=id.toString(16).padStart(8,'0');
    await io.write(frame(op,id,slot,value));const end=now()+50000;
    do{const s=await io.read();if(s.startsWith(`G:${tag}:`)){
      if(s===`G:${tag}:PENDING`){await sleep(100);continue;}
      const m=/^G:[0-9a-f]{8}:([A-Z]+):(\d+):([1-8]):([01])$/.exec(s);if(!m)throw Error('Malformed gallery acknowledgement');
      if(m[1]!=='OK')throw Error('Device gallery: '+m[1]);
      const mask=Number(m[2]),slots=Number(m[3]);if(mask>=(1<<slots))throw Error('Invalid gallery mask');return {mask,slots,running:m[4]==='1'};
    }await sleep(100);}while(now()<end);throw Error('Gallery acknowledgement timed out. No automatic retry.');
  }
  return {CAP,CMD,capability,frame,command};
})();
if(typeof module!=='undefined')module.exports=GalleryBLE;
