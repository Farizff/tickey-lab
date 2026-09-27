const {test}=require('node:test'),assert=require('node:assert/strict');
const Rich=require('./rich_text.js'),Photo=require('./photo_codec.js'),BLE=require('./ble_images.js');
const context=()=>({canvas:{width:296,height:128},fillRect(){},fillText(){},measureText(s){return {width:Array.from(s).length*10};},getImageData(){return {data:new Uint8ClampedArray(296*128*4).fill(255)};}});
test('selection changes only its UTF-16 range and later edits preserve surrounding styles',()=>{
 let d=Rich.create('One two three');d=Rich.apply(d,4,7,{color:'red',bold:true,size:30,family:'Abel',italic:true,underline:true,strike:true});
 assert.equal(d.styles[3].color,'black');assert.equal(d.styles[4].color,'red');assert.equal(d.styles[7].bold,false);
 d=Rich.replace(d,4,7,'NEW!',{color:'white'});assert.equal(d.text,'One NEW! three');assert.equal(d.styles[4].color,'white');assert.equal(d.styles[8].color,'black');
 d=Rich.edit(d,'One NEW! three!',{bold:true});assert.equal(d.styles.at(-1).bold,true);assert.equal(d.styles[4].color,'white');
});
test('surrogate pairs and combining graphemes are not split during layout',()=>{
 const text='A👩‍💻éB',plan=Rich.layout(context(),Rich.create(text));assert.equal(plan.lines.flatMap(l=>l.items).map(g=>g.text).join(''),text);assert.equal(plan.lines[0].items.length,4);
});
test('all four rotations map asymmetrical corners with hardware compensation, exact inverse and fixed wire',()=>{
 for(const angle of [0,90,180,270]){
  const {width:w,height:h}=Rich.dimensions(angle),codes=new Uint8Array(w*h);codes[0]=1;codes[w-1]=2;codes[(h-1)*w]=2;codes[w*h-1]=1;codes[w+2]=2;
  const wire=Rich.toWire(codes,angle);assert.equal(wire.length,296*128);
  const expected={0:296*128-1,90:127*296,180:0,270:295}[angle];assert.equal(wire[expected],1);
  const off={0:(127-1)*296+295-2,90:(127-2)*296+1,180:296+2,270:2*296+294}[angle];assert.equal(wire[off],2);
  const encoded=Photo.encode(wire),decoded=Photo.decode(encoded);assert.deepEqual(Rich.fromWire(decoded,angle),codes);
  const bytes=Buffer.from(encoded.slice(22),'hex');assert.equal(bytes.length,9472);const begin=BLE.begin(7,bytes,3);assert.equal(new DataView(begin.buffer).getUint16(5,true),296);assert.equal(new DataView(begin.buffer).getUint16(7,true),128);
 }
 assert.throws(()=>Rich.dimensions(45));
});
test('portrait reflows instead of stretching; mixed sizes determine line heights',()=>{
 const d=Rich.create('abcdefghijklmno');assert.equal(Rich.layout(context(),d).lines.length,1);assert.equal(Rich.layout(context(),d,{orientation:90}).lines.length,2);
 const mixed=Rich.apply(Rich.create('big\nsmall'),0,3,{size:48});const p=Rich.layout(context(),mixed);assert.ok(p.lines[0].height>p.lines[1].height);
 assert.equal(Rich.layout(context(),Rich.create('x\n'.repeat(30))).overflow,true);
});
test('mixed font, colour, emphasis and decorations reach the raster; invisible runs fail loud',()=>{
 const c=context(),draws=[],rects=[];c.fillText=(...args)=>draws.push({args,font:c.font,color:c.fillStyle});c.fillRect=(...args)=>rects.push(args);
 let d=Rich.apply(Rich.create('AB'),1,2,{color:'red',family:'Lobster',size:30,bold:true,italic:true,underline:true,strike:true});
 const result=Rich.render(c,d);assert.equal(draws[0].color,'black');assert.equal(draws[1].color,'red');assert.equal(draws[1].font,'italic bold 30px Lobster');assert.equal(rects.length,3);assert.equal(result.sameColor,false);
 d=Rich.apply(d,1,2,{color:'white'});assert.equal(Rich.render(c,d).sameColor,true);
});
test('font loading is explicit, deduplicated, and failures reject rather than fall back silently',async()=>{
 const calls=[],fonts={load:async spec=>{calls.push(spec);return [{}];},check:()=>true};
 await Rich.loadFonts(Rich.create('abcdef',{family:'Abel'}),fonts);assert.equal(calls.length,1);
 await Rich.loadFonts(Rich.create('system'),null);
 await assert.rejects(Rich.loadFonts(Rich.create('x',{family:'Pacifico'}),{load:async()=>[],check:()=>false}),/failed/);
 await assert.rejects(Rich.loadFonts(Rich.create('x',{family:'Lobster'}),null),/cannot load/);
});
