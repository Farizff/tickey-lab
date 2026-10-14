const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const M=require('./mono');
function mock(probe='ok',capability='MON1:416:240:1:FAST1:180'){
 let status='MON1:READY',off=0,clock=0;const frames=[],pixels=new Uint8Array(M.SIZE);
 return{frames,pixels,env:{now:()=>clock,sleep:async ms=>clock+=ms},io:{capability,read:async()=>status,write:async a=>{
 frames.push(a.slice());const v=new DataView(a.buffer,a.byteOffset,a.byteLength),tag=v.getUint32(1,true).toString(16).padStart(8,'0');
 if(a[0]===5){assert.equal(a.length,180);for(let i=5;i<180;i++)assert.equal(a[i],i^a[1+i%4]);if(probe instanceof Error)throw probe;status=probe==='ok'?`PROBE:${tag}:180`:probe==='reject'?`ERR:${tag}:PROBE`:'PROBE:deadbeef:180';return;}
 if(a[0]===1)status=`RECV:${tag}:0`;
 if(a[0]===2){assert.equal(v.getUint16(5,true),off);pixels.set(a.subarray(7),off);off+=a.length-7;status=`RECV:${tag}:${off}`;}
 if(a[0]===3)status=`DONE:${tag}:1234`;
 }}};
}
const pixels=Uint8Array.from({length:M.SIZE},(_,i)=>(i*37+13)&255);
for(const [label,probe,cap,size]of [['negotiated','ok','MON1:416:240:1:FAST1:180',180],['legacy','ok',M.CAP,20],['probe refused','reject','MON1:416:240:1:FAST1:180',20],['size refused',Object.assign(Error('size'),{name:'InvalidModificationError'}),'MON1:416:240:1:FAST1:180',20]])test(label,async()=>{const m=mock(probe,cap),r=await M.send(m.io,pixels,42,()=>{},m.env);assert.equal(r.frameSize,size);assert.deepEqual(m.pixels,pixels);assert.equal(m.frames.filter(a=>a[0]===2).length,Math.ceil(M.SIZE/(size-7)));if(process.env.MONO_FAST_FIXTURE&&size===180)fs.writeFileSync(process.env.MONO_FAST_FIXTURE,Buffer.concat(m.frames.flatMap(a=>[Buffer.from([a.length]),a])));});
for(const probe of ['stale',Error('Bluetooth operation timed out'),Object.assign(Error('disconnected'),{name:'NetworkError'})])test('unsafe probe failure aborts: '+String(probe),async()=>{const m=mock(probe);await assert.rejects(M.send(m.io,pixels,42,()=>{},m.env));assert.deepEqual(m.frames.map(a=>a[0]),[5]);});
const P=require('./photo_codec'),R=require('./rich_text'),C=require('./combined');
test('actual editor packing equals MON1 and orientations invert',()=>{const codes=Uint8Array.from({length:M.W*M.H},(_,i)=>i%7===0?1:0);const encoded=P.encode(codes);assert.deepEqual(Buffer.from(encoded.slice(22),'hex'),Buffer.from(M.pack(codes)));assert.deepEqual(P.decode(encoded),codes);for(const a of [0,90,180,270])assert.deepEqual(R.fromWire(R.toWire(codes,a),a),codes);assert.throws(()=>R.style({color:'red'}));});
test('combined regions cover full panel with no overlap in all orientations',()=>{for(const t of ['text-qr','photo-text','photo-text-qr'])for(const a of [0,90,180,270]){const p=C.regions(t,a),seen=new Uint8Array(M.W*M.H);for(const key of ['photo','text','qr'])if(p[key]){const b=p[key];for(let y=b.y;y<b.y+b.height;y++)for(let x=b.x;x<b.x+b.width;x++){assert.ok(x<p.width&&y<p.height);assert.equal(seen[y*p.width+x]++,0);}}assert.ok(seen.every(x=>x===1));}});
