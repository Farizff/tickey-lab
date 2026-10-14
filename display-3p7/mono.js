// Standalone MON1 codec/transport. No dependency on the 2.9-inch app.
const Mono=(()=>{
  const W=416,H=240,SIZE=12480,CAP='MON1:416:240:1:20';
  const SERVICE='7e370001-b5a3-f393-e0a9-e50e24dcca9e';
  const uuid=n=>SERVICE.replace('0001',`000${n}`);
  const hex=id=>(id>>>0).toString(16).padStart(8,'0');
  function crc32(a){let c=0xffffffff;for(const b of a){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
  function pack(codes){if(codes.length!==W*H)throw Error('Expected 416 × 240');const a=new Uint8Array(SIZE);codes.forEach((v,i)=>{if(v!==0&&v!==1)throw Error('Monochrome only');a[i>>3]|=v<<(7-i%8);});return a;}
  function preview(a){if(a.length!==SIZE)throw Error('Invalid payload');const out=new Uint8ClampedArray(W*H*4);for(let i=0;i<W*H;i++){const v=(a[i>>3]>>(7-i%8))&1?0:255;out.set([v,v,v,255],i*4);}return out;}
  function quantize(rgba,dither=true){if(rgba.length!==W*H*4)throw Error('Invalid dimensions');const grey=new Float32Array(W*H),codes=new Uint8Array(W*H);for(let i=0;i<grey.length;i++){const a=rgba[i*4+3]/255;grey[i]=(rgba[i*4]*.2126+rgba[i*4+1]*.7152+rgba[i*4+2]*.0722)*a+255*(1-a);}for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x;codes[i]=grey[i]<128?1:0;const e=grey[i]-(codes[i]?0:255);if(dither){if(x+1<W)grey[i+1]+=e*7/16;if(y+1<H){if(x)grey[i+W-1]+=e*3/16;grey[i+W]+=e*5/16;if(x+1<W)grey[i+W+1]+=e/16;}}}return pack(codes);}
  function crop(w,h,x=50,y=50,zoom=1){if(![w,h,x,y,zoom].every(Number.isFinite)||w<=0||h<=0||x<0||x>100||y<0||y>100||zoom<1||zoom>3)throw Error('Invalid crop');const s=Math.min(w/W,h/H)/zoom;return[(w-W*s)*x/100,(h-H*s)*y/100,W*s,H*s];}
  function frame(op,id,n=5){const a=new Uint8Array(n);a[0]=op;new DataView(a.buffer).setUint32(1,id,true);return a;}
  function begin(id,bytes){if(!Number.isInteger(id)||id<=0||id>0xffffffff||!(bytes instanceof Uint8Array)||bytes.length!==SIZE)throw Error('Invalid image metadata');const a=frame(1,id,17),v=new DataView(a.buffer);v.setUint16(5,W,true);v.setUint16(7,H,true);a[9]=1;v.setUint16(10,SIZE,true);v.setUint32(12,crc32(bytes),true);a[16]=37;return a;}
  function requireCapability(s){if(s!==CAP&&s!=='MON1:416:240:1:FAST1:180')throw Error('Wrong firmware: requires TICKEY-3P7 MON1, not the 2.9-inch app.');}
  async function send(io,bytes,id,progress=()=>{},env={}){
    const now=env.now||(()=>performance.now()),sleep=env.sleep||(ms=>new Promise(r=>setTimeout(r,ms)));
    requireCapability(io.capability);bytes=bytes.slice();const header=begin(id,bytes),tag=hex(id),start=now();
    async function wait(accept,limit){const end=now()+limit;do{const s=await io.read();if(s.startsWith(`ERR:${tag}:`))throw Error(s);if(accept(s))return s;await sleep(50);}while(now()<end);throw Error('Acknowledgement timeout; disconnect, then retry manually.');}
    const initial=await io.read();if(initial==='MON1:FAULT')throw Error('Panel fault; check device.');if(/^(RECV|VERIFIED|REFRESH):/.test(initial))throw Error('Device busy');if(initial!=='MON1:READY'&&!/^(DONE|ABORT|ERR):/.test(initial))throw Error('Wrong protocol status');
    let frameSize=20;
    if(io.capability==='MON1:416:240:1:FAST1:180'){
      const probe=frame(5,id,180);for(let i=5;i<180;i++)probe[i]=i^probe[1+(i%4)];
      try{await io.write(probe);await wait(s=>s===`PROBE:${tag}:180`,1500);frameSize=180;}
      catch(error){if(!['InvalidModificationError','NotSupportedError'].includes(error.name)&&error.message!==`ERR:${tag}:PROBE`)throw error;}
    }
    const mode=frameSize===180?'fast':'legacy';progress({stage:'negotiated',mode,frameSize,bytes:0,total:SIZE});
    await io.write(header);await wait(s=>s===`RECV:${tag}:0`,5000);
    for(let off=0,n=0;off<SIZE;n++){const count=Math.min(frameSize-7,SIZE-off),a=frame(2,id,count+7);new DataView(a.buffer).setUint16(5,off,true);a.set(bytes.subarray(off,off+count),7);await io.write(a);off+=count;if(n%16===15||off===SIZE){await wait(s=>s===`RECV:${tag}:${off}`,5000);progress({stage:'sending',bytes:off,total:SIZE});}}
    await io.write(frame(3,id));const accepted=await wait(s=>s===`VERIFIED:${tag}`||s===`REFRESH:${tag}`||s.startsWith(`DONE:${tag}:`),5000);const transferMs=now()-start;progress({stage:'refreshing',bytes:SIZE,total:SIZE,transferMs});const done=accepted.startsWith('DONE:')?accepted:await wait(s=>s.startsWith(`DONE:${tag}:`),45000);const panelMs=Number(done.split(':')[2]);if(!Number.isFinite(panelMs))throw Error('Invalid timing');return{transferMs,panelMs,mode,frameSize};
  }
  return{W,H,SIZE,CAP,SERVICE,uuid,crc32,pack,preview,quantize,crop,frame,begin,requireCapability,send};
})();
if(typeof module!=='undefined')module.exports=Mono;
