const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('./combined.js'),R=require('./rich_text.js'),D=require('./designs.js');
const ctx={font:'',measureText(t){return {width:t.length*Number(this.font.match(/(\d+)px/)[1])*.6};}};
for(const template of ['text-qr','photo-text','photo-text-qr'])for(const angle of [0,90,180,270])test(`fixed ${template} ${angle}: disjoint complete logical regions`,()=>{
 const p=C.regions(template,angle),pixels=new Uint8Array(p.width*p.height);
 for(const b of [p.text,p.photo,p.qr].filter(Boolean))for(let y=b.y;y<b.y+b.height;y++)for(let x=b.x;x<b.x+b.width;x++){assert.ok(x<p.width&&y<p.height);assert.equal(pixels[y*p.width+x]++,0);}
 assert.ok(pixels.every(n=>n===1));if(p.qr)assert.deepEqual([p.qr.width,p.qr.height],[128,128]);
});
test('region-aware wrapping and auto-fit preserve mixed ranges, block impossible content',()=>{
 const doc=R.apply(R.create('Hello mixed words',{size:32}),6,11,{color:'red',family:'Abel',bold:true}),before=JSON.stringify(doc),region=C.regions('photo-text-qr').text;
 assert.ok(R.fit(ctx,doc,{region}).overflow);const fit=R.fit(ctx,doc,{region,autoFit:true});assert.equal(fit.overflow,false);assert.ok(fit.autoFitted);assert.equal(JSON.stringify(doc),before);assert.ok(fit.lines.flatMap(l=>l.items).some(g=>g.s.color==='red'&&g.s.bold));
 assert.ok(R.fit(ctx,R.create('x\n'.repeat(60)),{region,autoFit:true}).overflow);assert.throws(()=>C.regions('freeform'),/Invalid/);
});
function state(){const controls=Object.fromEntries(Object.entries(D.choices).map(([k,v])=>[k,v[0]]));for(const k of D.flags)controls[k]=false;Object.assign(controls,{cropX:'50',cropY:'50',zoom:'1',qrText:'Hi'});return {version:1,controls,document:D.pack(R.create('Mixed'))};}
test('old version-1 backups default combined controls; new templates roundtrip imports and history',async()=>{
 const old=state();delete old.controls.combinedTemplate;delete old.controls.combinedOrientation;
 const imported=await D.importBackup(new Blob([JSON.stringify({format:'tickey-design',version:1,name:'Old',state:old,photo:null})]));assert.equal(imported.state.controls.combinedTemplate,'text-qr');assert.equal(imported.state.controls.combinedOrientation,'0');
 const h=new D.History({state:imported.state,photo:null});for(const template of D.choices.combinedTemplate){const s=state();Object.assign(s.controls,{mode:'combined',combinedTemplate:template,combinedOrientation:'270'});const json=await D.exportBackup({state:s,photo:null},'New');assert.deepEqual((await D.importBackup(new Blob([json]))).state,s);h.push({state:s,photo:null});assert.deepEqual(D.validate(s),s);}
 h.moved(-1);assert.equal(h.target(1).state.controls.combinedTemplate,'photo-text-qr');assert.equal(h.target(-1).state.controls.combinedTemplate,'text-qr');
});
test('corrupt combined schema values never fall back to defaults',()=>{for(const [key,value] of [['combinedTemplate','drag'],['combinedOrientation',90],['combinedOrientation','45'],['combinedTemplate',null],['mode','layout']]){const s=state();s.controls[key]=value;assert.throws(()=>D.validate(s),/Invalid/);}});
