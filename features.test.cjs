const {test}=require('node:test'),assert=require('node:assert/strict');
const QR=require('./qr_codec.js'),Photo=require('./photo_codec.js'),Rich=require('./rich_text.js'),decode=require('./tests/vendor/jsQR.js');
for(const text of ['https://example.com/tickey','Hello TICKEY','Halo café 日本 😀','a'.repeat(180)])test('independent decoder reads actual packed raster: '+text.slice(0,30),()=>{
 const q=QR.render(text),encoded=Photo.encode(Rich.toWire(q.codes,0)),wire=Photo.decode(encoded),logical=Rich.fromWire(wire,0);
 assert.equal(Buffer.from(encoded.slice(22),'hex').length,9472);assert.ok(q.scale>=2);assert.ok(Number.isInteger(q.scale));
 assert.equal(decode(Photo.preview(logical),296,128).data,text);assert.ok(logical.every(p=>p===0||p===1));
 for(let y=0;y<128;y++)for(let x=0;x<296;x++)if(x<q.left+4*q.scale||x>=q.left+q.size-4*q.scale||y<q.top+4*q.scale||y>=q.top+q.size-4*q.scale)assert.equal(logical[y*296+x],0,'quiet border is white');
});
test('QR rejects empty or unreadable density instead of producing tiny modules',()=>{assert.throws(()=>QR.render(' '),/Enter/);assert.throws(()=>QR.render('a'.repeat(300)),/dense/);assert.throws(()=>QR.render('a'.repeat(2001)),/long/);});
test('portrait crop uses tall logical aspect without stretching and has bounded offsets',()=>{for(const angle of [0,90,180,270]){const {width,height}=Rich.dimensions(angle),[x,y,w,h]=Photo.crop(800,600,75,25,2,width,height);assert.ok(Math.abs(w/h-width/height)<1e-10);assert.ok(x>=0&&y>=0&&x+w<=800&&y+h<=600);const rgba=new Uint8ClampedArray(296*128*4).fill(255);assert.ok(Photo.quantize(rgba,true,width,height).every(p=>p===0));}});
const ctx={font:'',measureText(s){return {width:s.length*Number(this.font.match(/(\d+)px/)[1])*.6};}};
test('optional auto-fit preserves original mixed styles and restores when off or space returns',()=>{
 const doc=Rich.apply(Rich.create('BIG text\nsmall text\nlast line',{size:48}),9,19,{size:24,color:'red',bold:true,family:'Abel'}),original=JSON.stringify(doc);
 assert.equal(Rich.fit(ctx,doc).overflow,true);
 const fit=Rich.fit(ctx,doc,{autoFit:true});assert.equal(fit.overflow,false);assert.equal(fit.autoFitted,true);assert.ok(fit.effectiveMin>=8&&fit.effectiveMax<48);assert.equal(JSON.stringify(doc),original);
 assert.equal(Rich.fit(ctx,doc,{autoFit:false}).effectiveMax,48);
 const shorter={text:'BIG',styles:doc.styles.slice(0,3)};assert.equal(Rich.fit(ctx,shorter,{autoFit:true}).effectiveMax,48);
 assert.ok(fit.lines.flatMap(l=>l.items).some(g=>g.s.color==='red'&&g.s.bold&&g.s.family==='Abel'));
});
test('auto-fit still rejects impossible content at minimum size',()=>{const r=Rich.fit(ctx,Rich.create('x\n'.repeat(60),{size:48}),{autoFit:true});assert.equal(r.overflow,true);assert.equal(r.effectiveMin,8);assert.equal(r.effectiveMax,8);});
