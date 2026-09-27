const {test}=require('node:test');const assert=require('node:assert/strict');
const Text=require('./text_codec.js'),Photo=require('./photo_codec.js'),BLE=require('./ble_images.js');
const context=()=>({fillRect(){},fillText(){},measureText(s){return {width:Array.from(s).length*10};},getImageData(){return {data:new Uint8ClampedArray(296*128*4).fill(255)};}});
test('multiline Unicode and longer text accepted; blank and control text rejected',()=>{
 Text.validate('Longer than eighteen characters\nCafé 中文','red');
 for(const s of ['', '  ','x'.repeat(2001),'bad\x00'])assert.throws(()=>Text.validate(s,'black'));
 assert.throws(()=>Text.validate('ok','blue'));
});
test('wrap respects explicit newlines, width, and breaks long words without dropping letters',()=>{
 const c=context();assert.deepEqual(Text.layout(c,'one\ntwo').lines,['one','two']);
 const s='abcdefghijklmnopqrstuvwxyz'.repeat(3),p=Text.layout(c,s);assert.equal(p.lines.join(''),s);assert.ok(p.lines.every(l=>c.measureText(l).width<=276));
 assert.deepEqual(Text.layout(c,'hello world hello world again').lines,['hello world hello world','again']);
});
test('overflow and invalid settings cannot silently fit',()=>{
 assert.equal(Text.layout(context(),'a\n'.repeat(20)).overflow,true);
 assert.equal(Text.layout(context(),'hello').overflow,false);
 for(const o of [{size:7},{size:49},{size:NaN},{family:'bad'},{align:'bad'}])assert.throws(()=>Text.layout(context(),'ok',o));
});
test('font styling alignment and decorations reach canvas',()=>{
 const c=context(),rects=[],draws=[];c.fillRect=(...a)=>rects.push(a);c.fillText=(...a)=>draws.push(a);
 Text.render(c,'Hello','red',{size:24,family:'serif',align:'right',bold:true,italic:true,underline:true,strike:true});
 assert.equal(c.font,'italic bold 24px serif');assert.equal(c.textAlign,'right');assert.equal(draws[0][1],286);assert.equal(rects.length,3);
});
test('selected ink survives preview packing and existing IMG1 metadata',()=>{
 for(const color of ['black','red']){const c=context(),rgba=c.getImageData().data;rgba.set(color==='red'?[255,0,0,255]:[0,0,0,255],0);c.getImageData=()=>({data:rgba});
 const {codes}=Text.render(c,'Hello',color);assert.equal(codes[0],color==='red'?2:1);assert.equal(codes[1],0);
 const encoded=Photo.encode(codes);assert.deepEqual(Photo.decode(encoded),codes);
 const bytes=Uint8Array.from(encoded.slice(22).match(/../g),b=>parseInt(b,16));assert.equal(bytes.length,9472);assert.equal(BLE.begin(1,bytes,color==='red'?3:2).length,17);}
});
