const {test}=require('node:test');const assert=require('node:assert/strict');
const Text=require('./text_codec.js'),Photo=require('./photo_codec.js'),BLE=require('./ble_images.js');
test('text accepts printable ASCII only, 1–18 chars, black/red',()=>{
 for(const color of ['black','red']){Text.validate('Hello Fariz!',color);Text.validate('x'.repeat(18),color);}
 for(const s of ['', '   ','x'.repeat(19),'hi\n','é','😀'])assert.throws(()=>Text.validate(s,'black'));
 assert.throws(()=>Text.validate('ok','blue'));
});
test('black/red text generates valid IMG1 bytes and selected ink only',()=>{
 for(const color of ['black','red']){
 const rgba=new Uint8ClampedArray(296*128*4).fill(255);rgba.set(color==='red'?[255,0,0,255]:[0,0,0,255],0);
 const ctx={fillRect(){},measureText(){return {width:270};},fillText(text,x,y){assert.equal(text,'Hello');assert.equal(x,148);assert.equal(y,64);},getImageData(){return {data:rgba};}};
 const codes=Text.render(ctx,'Hello',color);assert.equal(codes[0],color==='red'?2:1);assert.equal(codes[1],0);
 const encoded=Photo.encode(codes);assert.deepEqual(Photo.decode(encoded),codes);
 const bytes=Uint8Array.from(encoded.slice(22).match(/../g),b=>parseInt(b,16));assert.equal(bytes.length,9472);assert.equal(BLE.begin(1,bytes,color==='red'?3:2).length,17);
 }
});
