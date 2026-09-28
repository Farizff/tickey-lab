const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const BLE=require('./ble_images.js');
function mock({capability='FAST1:180',probe='accept',failData=false,commitError='',stale=false}={}){
 let status='IMG1:READY',clock=0,offset=0;const writes=[],buffer=new Uint8Array(BLE.SIZE);
 const io={capability,read:async()=>status,write:async a=>{
  writes.push(a.slice());const v=new DataView(a.buffer,a.byteOffset,a.byteLength),tag=v.getUint32(1,true).toString(16).padStart(8,'0');
  if(a[0]===5){assert.equal(a.length,180);for(let i=5;i<180;i++)assert.equal(a[i],i^a[1+i%4]);
   if(probe instanceof Error)throw probe;
   status=probe==='accept'?`PROBE:${tag}:180`:probe==='refuse'?`ERR:${tag}:PROBE`:probe==='busy'?`ERR:${tag}:BUSY`:'PROBE:deadbeef:180';return;}
  if(a[0]===1){offset=0;status=`RECV:${tag}:0`;}
  if(a[0]===2){if(failData)throw Error('Bluetooth disconnected');assert.equal(v.getUint16(5,true),offset);buffer.set(a.subarray(7),offset);offset+=a.length-7;status=`RECV:${tag}:${offset}`;}
  if(a[0]===3)status=commitError?`ERR:${tag}:${commitError}`:stale?'DONE:deadbeef:1':`DONE:${tag}:1234`;
 }};
 return {io,writes,buffer,env:{now:()=>clock,sleep:async ms=>{clock+=ms;}},reset(){status='IMG1:READY';}};
}
const bytes=Uint8Array.from({length:BLE.SIZE},(_,i)=>[0,0x55,0xaa,0x18,0x61][i%5]);
async function send(m,id=0x12345678){return BLE.send(m.io,bytes,3,id,()=>{},m.env);}
for(const [label,options,size] of [['old firmware', {capability:''},20],['unknown capability',{capability:'FAST1:999'},20],['accepted probe',{},180],['refused probe',{probe:'refuse'},20],['stale probe ACK timeout',{probe:'stale'},20],['size rejected',{probe:Object.assign(Error('too long'),{name:'InvalidModificationError'})},20]]){
 test(label+' chooses only the proved frame size',async()=>{const m=mock(options),r=await send(m);assert.equal(r.frameSize,size);assert.deepEqual(m.buffer,bytes);assert.equal(m.writes.filter(a=>a[0]===2).length,Math.ceil(BLE.SIZE/(size-7)));assert.ok(m.writes.filter(a=>a[0]!==5).every(a=>a.length<=size));assert.equal(r.panelMs,1234);});
}
for(const error of [Error('Bluetooth operation timed out'),Error('Bluetooth disconnected'),Object.assign(Error('GATT server disconnected'),{name:'NetworkError'}),Error('Unexpected read failure')]){
 test('unsafe probe failure stops without BEGIN: '+error.message,async()=>{const m=mock({probe:error});await assert.rejects(send(m),e=>e===error);assert.deepEqual(m.writes.map(a=>a[0]),[5]);});
}
test('probe ACK read failure aborts before BEGIN',async()=>{const m=mock(),read=m.io.read;m.io.read=async()=>{if(m.writes.length)throw Object.assign(Error('read disconnected'),{name:'NetworkError'});return read();};await assert.rejects(send(m),/read disconnected/);assert.deepEqual(m.writes.map(a=>a[0]),[5]);});
test('probe busy is not downgraded into an image attempt',async()=>{const m=mock({probe:'busy'});await assert.rejects(send(m),/BUSY/);assert.deepEqual(m.writes.map(a=>a[0]),[5]);});
test('fast DATA disconnect is never retried; fresh send reprobes after reconnect',async()=>{const m=mock({failData:true});await assert.rejects(send(m),/disconnected/);assert.deepEqual(m.writes.map(a=>a[0]),[5,1,2]);m.reset();await Promise.resolve();assert.equal(m.writes.length,3);const fresh=mock();await send(fresh,2);assert.deepEqual(fresh.writes.slice(0,2).map(a=>a[0]),[5,1]);});
for(const code of ['CRC','ID','SEQ','BUSY'])test('fast '+code+' rejection cannot report success',async()=>{await assert.rejects(send(mock({commitError:code})),new RegExp(code));});
test('fast stale DONE cannot complete a different ID',async()=>{await assert.rejects(send(mock({stale:true})),/timed out/);});
test('real C++ receiver consumes actual sender frames, all 9472 bytes equal in both modes',async()=>{
 const exe=process.env.TICKEY_CROSS_EXE;
 assert.ok(exe,'Set TICKEY_CROSS_EXE to the compiled tests/cross_test.exe; this integration gate is never silently skipped');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tickey-cross-'));
 try{for(const capability of ['', 'FAST1:180']){const m=mock({capability});await send(m);const file=path.join(dir,capability?'fast.bin':'legacy.bin');fs.writeFileSync(file,Buffer.concat([Buffer.from(bytes),...m.writes.flatMap(a=>[Buffer.from([a.length]),Buffer.from(a)])]));const result=spawnSync(exe,[file],{encoding:'utf8'});assert.equal(result.status,0,result.error?.message||result.stderr);assert.match(result.stdout,/all 9472 bytes equal/);console.log(result.stdout.trim());}}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
