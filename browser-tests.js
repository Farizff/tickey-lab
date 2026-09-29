// Run from a real browser on the local page:
// await (0,eval)(await (await fetch('browser-tests.js')).text())
(async()=>{
 const results=[],assert=(ok,message)=>{if(!ok)throw Error(message);},pause=()=>new Promise(r=>setTimeout(r,0));
 const change=(id,value)=>{const node=el(id);if(node.type==='checkbox')node.checked=value;else node.value=value;node.dispatchEvent(new Event('input',{bubbles:true}));};
 const mode=value=>{el('mode').value=value;el('mode').dispatchEvent(new Event('change'));};
 const type=value=>{el('text').value=value;el('text').dispatchEvent(new Event('input',{bubbles:true}));};
 const select=(a,b)=>{el('text').focus();el('text').setSelectionRange(a,b);el('text').dispatchEvent(new Event('select'));};
 async function check(name,fn){await fn();results.push(name);}
 function exact(){
  assert(prepared&&prepared.bytes.length===9472,'fixed wire bytes ready: '+el('message').textContent);
  const bytes=prepared.bytes,wire=new Uint8Array(296*128);for(let i=0;i<wire.length;i++)wire[i]=(bytes[i>>2]>>(6-2*(i%4)))&3;
  const angle=el('mode').value==='qr'?0:Number(el(el('mode').value+'Orientation').value);
  const logical=RichText.fromWire(wire,angle),expected=PhotoCodec.preview(logical),canvas=el('preview'),actual=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
  assert(actual.every((v,i)=>v===expected[i]),'every visible preview pixel equals inverse-mapped transmitted bytes');
  return wire;
 }
 mode('text');type('Hello world');await renderText();
 await check('selection survives toolbar focus; mixed styles rasterize and pack exactly',async()=>{
  select(6,11);el('textFont').focus();
  for(const [id,value] of Object.entries({textFont:'Abel',textSize:26,textColor:'red',textBold:true,textItalic:true,textUnderline:true,textStrike:true}))change(id,value);
  await renderText();
  assert(selection.start===6&&selection.end===11,'selection retained');
  assert(textDocument.styles.slice(0,6).every(s=>s.color==='black'&&s.size===20&&!s.bold),'unselected text unchanged');
  assert(textDocument.styles.slice(6).every(s=>s.family==='Abel'&&s.color==='red'&&s.size===26&&s.bold&&s.italic&&s.underline&&s.strike),'all selection styles applied');
  const wire=exact();assert(wire.includes(1)&&wire.includes(2),'black and red pixels present');
 });
 await check('all bundled fonts load locally and produce nonblank canvas',async()=>{
  select(0,0);type('Hello');
  for(const family of ['Abel','Lobster','Pacifico']){
   change('textFont',family);await renderText();const wire=exact();assert(wire.includes(1)||wire.includes(2),'font renders visible ink');assert(document.fonts.check(RichText.font(textDocument.styles[0])),'font loaded');
  }
  assert(performance.getEntriesByType('resource').filter(r=>r.name.endsWith('.ttf')).every(r=>new URL(r.name).origin===location.origin),'no font CDN');
 });
 await check('orientation uses portrait reflow and exact preview-byte mapping',async()=>{
  change('textFont','sans-serif');change('textSize',16);type('Hello world again');select(0,0);
  for(const angle of [0,90,180,270]){change('textOrientation',angle);await renderText();exact();assert(el('preview').width===(angle%180?128:296),'logical preview width');assert(el('preview').height===(angle%180?296:128),'logical preview height');}
 });
 await check('plain-text paste discards HTML and retains surrounding styles',async()=>{
  type('Hello world');select(6,11);const clip=new DataTransfer();clip.setData('text/plain','plain');clip.setData('text/html','<b>NOT PASTED</b>');
  el('text').dispatchEvent(new ClipboardEvent('paste',{clipboardData:clip,bubbles:true,cancelable:true}));await renderText();assert(el('text').value==='Hello plain','plain paste');assert(textDocument.text==='Hello plain','model paste');exact();
 });
 await check('font failure clears payload and tells user; next valid render recovers',async()=>{
  const original=RichText.loadFonts;RichText.loadFonts=async()=>{throw Error('Bundled font failed to load (test)');};
  try{await renderText();assert(prepared===null,'no stale payload');assert(/failed to load/.test(el('message').textContent),'visible failure');}finally{RichText.loadFonts=original;}
  await renderText();exact();
 });
 await check('stale font completion cannot overwrite a newer text preview',async()=>{
  const original=RichText.loadFonts;let release;RichText.loadFonts=()=>new Promise(resolve=>{release=resolve;});
  const old=renderText();assert(prepared===null,'pending fonts invalidate send');RichText.loadFonts=original;type('NEW');await renderText();const expected=Array.from(prepared.bytes).join(',');release();await old;assert(Array.from(prepared.bytes).join(',')===expected,'stale completion discarded');exact();
 });
 await check('switching away during font load cannot restore stale text bytes',async()=>{
  const original=RichText.loadFonts;let release;RichText.loadFonts=()=>new Promise(resolve=>{release=resolve;});const old=renderText();mode('photo');RichText.loadFonts=original;release();await old;
  assert(prepared===null,'photo remains empty');assert(el('preview').width===296&&el('preview').height===128,'photo dimensions restored');mode('text');await renderText();exact();
 });
 await check('global backgrounds and alignment; invisible selections and overflow block send',async()=>{
  select(0,0);change('textOrientation',0);type('Hi');change('textSize',20);
  for(const bg of ['white','black','red'])for(const fg of ['white','black','red']){
   change('textBackground',bg);change('textColor',fg);await renderText();if(bg===fg)assert(prepared===null,'matching colours blocked');else exact();
  }
  change('textBackground','white');change('textColor','black');change('textAlign','right');await renderText();exact();
  type('x\n'.repeat(30));await renderText();assert(prepared===null&&/does not fit/.test(el('message').textContent),'overflow blocked');type('Final preview');await renderText();exact();
 });
 await check('photo decoding and all four independent orientations preview exact compensated wire pixels',async()=>{
  change('textOrientation',90);await renderText();mode('photo');
  const fixture=document.createElement('canvas');fixture.width=296;fixture.height=128;const c=fixture.getContext('2d');c.fillStyle='white';c.fillRect(0,0,296,128);c.fillStyle='black';c.fillRect(0,0,50,50);c.fillStyle='red';c.fillRect(200,80,96,48);
  const blob=await new Promise(r=>fixture.toBlob(r,'image/png')),file=new File([blob],'fixture.png',{type:'image/png'}),transfer=new DataTransfer();transfer.items.add(file);el('photo').files=transfer.files;el('photo').dispatchEvent(new Event('change'));
  for(let i=0;i<100&&!prepared;i++)await new Promise(r=>setTimeout(r,10));assert(prepared,'photo prepared');assert(prepared.bytes.at(-1)===85,'logical top-left black maps to compensated bottom-right');
  for(const angle of [0,90,180,270]){change('photoOrientation',angle);exact();assert(el('preview').width===(angle%180?128:296),'photo logical dimensions');}
  change('photoOrientation',0);
  mode('text');await renderText();exact();
 });
 await check('auto-fit shrinks only overflowing text, preserves selection styles and restores originals',async()=>{
  select(0,0);change('textOrientation',0);change('textSize',48);type('Big text\nSecond line\nThird line');await renderText();assert(prepared===null,'manual overflow blocks');
  const original=JSON.stringify(textDocument);change('textAutoFit',true);await renderText();exact();assert(/Auto-fit reduced sizes/.test(el('message').textContent),'effective sizing is visible');assert(JSON.stringify(textDocument)===original,'original styles retained');
  change('textAutoFit',false);await renderText();assert(prepared===null,'off restores overflow');change('textAutoFit',true);type('Hi');await renderText();exact();assert(!/Auto-fit reduced/.test(el('message').textContent),'short text restores sizes');
  type('x\n'.repeat(60));await renderText();assert(prepared===null&&/8px minimum/.test(el('message').textContent),'minimum overflow stays blocked');change('textAutoFit',false);change('textSize',20);type('Final');await renderText();
 });
 await check('QR actual canvas independently decodes, invalid density clears payload, modes preserve text',async()=>{
  await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='tests/vendor/jsQR.js';s.onload=resolve;s.onerror=reject;document.head.appendChild(s);});
  const doc=JSON.stringify(textDocument);mode('qr');assert(prepared===null,'empty QR cannot send');change('qrText','https://example.com/tickey');exact();const c=el('preview');assert(jsQR(c.getContext('2d').getImageData(0,0,296,128).data,296,128).data==='https://example.com/tickey','real QR canvas decodes');
  change('qrText','a'.repeat(300));assert(prepared===null&&/dense/.test(el('message').textContent),'unreadable density rejected');change('qrText','Halo café 日本 😀');exact();assert(jsQR(c.getContext('2d').getImageData(0,0,296,128).data,296,128).data==='Halo café 日本 😀','Unicode preserved');
  mode('text');await renderText();assert(JSON.stringify(textDocument)===doc,'text survives QR');exact();
 });
 await check('QR cannot be overwritten by stale font completion; shared busy lock disables editor',async()=>{
  const original=RichText.loadFonts;let release;RichText.loadFonts=()=>new Promise(r=>{release=r;});const pending=renderText();RichText.loadFonts=original;mode('qr');const bytes=Array.from(prepared.bytes).join();release();await pending;assert(Array.from(prepared.bytes).join()===bytes,'QR payload wins');
  let done;const busy=run(()=>new Promise(r=>{done=r;}));assert(el('editor').disabled&&el('send').disabled,'all modes locked during transfer');done();await busy;assert(!el('editor').disabled,'editor unlocked');exact();
 });
 await check('IndexedDB save/list/read preserves full editable mixed state and photo original',async()=>{
  mode('text');type('Saved mixed');select(6,11);change('textColor','red');change('textFont','Abel');change('textAutoFit',true);change('photoOrientation',90);change('cropX',75);change('zoom',1.5);await renderText();
  const expected=DesignUI.snapshot(),id=await DesignUI.save('<img src=x onerror=alert(1)>');const row=await Designs.store('get',id);
  assert(JSON.stringify(row.state)===JSON.stringify(expected.state),'all controls and style ranges persisted');assert(row.photo instanceof Blob&&row.photo.size===sourceBlob.size,'original image blob persists');
  assert(el('savedDesigns').selectedOptions[0].textContent.includes('<img'),'name rendered as literal text');assert(!el('savedDesigns').querySelector('img'),'no HTML injection');
  type('changed');await DesignUI.action(()=>DesignUI.restore(row));await renderText();assert(JSON.stringify(DesignUI.snapshot().state)===JSON.stringify(expected.state),'full restore not flat raster');exact();
  row.name='Renamed';await Designs.store('put',row);await DesignUI.list(id);assert(el('savedDesigns').selectedOptions[0].textContent==='Renamed','rename persists');await Designs.store('delete',id);assert(!await Designs.store('get',id),'delete verified');
 });
 await check('backup round trip decodes original image before applying; corrupt imports leave editor unchanged',async()=>{
  const original=DesignUI.snapshot(),json=await Designs.exportBackup(original,'Backup'),value=await Designs.importBackup(new Blob([json]));assert(value.image.naturalWidth===296,'actual original image decoded');
  assert(JSON.stringify(value.state)===JSON.stringify(original.state),'settings and mixed styles survive backup');assert(Array.from(new Uint8Array(await value.photo.arrayBuffer())).join()===Array.from(new Uint8Array(await original.photo.arrayBuffer())).join(),'photo bytes exact');
  const bad=JSON.parse(json);bad.photo.data=btoa('not a real image');const before=JSON.stringify(DesignUI.snapshot().state);let rejected=false;try{await Designs.importBackup(new Blob([JSON.stringify(bad)]));}catch{rejected=true;}assert(rejected,'bad photo rejected');assert(JSON.stringify(DesignUI.snapshot().state)===before,'invalid import never changes editor');
  await DesignUI.action(async()=>{await DesignUI.restore(value);DesignUI.history.push(DesignUI.snapshot());});await renderText();exact();
 });
 await check('undo redo restores mixed styles, settings and modes without BLE sends',async()=>{
  const old=DesignUI.snapshot();change('textBackground','black');const changed=DesignUI.snapshot();await DesignUI.action(()=>DesignUI.travel(-1));assert(JSON.stringify(DesignUI.snapshot().state)===JSON.stringify(old.state),'undo settings');await DesignUI.action(()=>DesignUI.travel(1));assert(JSON.stringify(DesignUI.snapshot().state)===JSON.stringify(changed.state),'redo settings');
  mode('qr');await DesignUI.action(()=>DesignUI.travel(-1));assert(el('mode').value==='text','undo mode');assert(JSON.stringify(Designs.pack(textDocument))===JSON.stringify(old.state.document),'mixed styles survive history');await DesignUI.action(()=>DesignUI.travel(1));assert(el('mode').value==='qr','redo mode');exact();
  let release;const busy=run(()=>new Promise(r=>{release=r;}));const snapshot=JSON.stringify(DesignUI.snapshot().state);await DesignUI.action(()=>DesignUI.travel(-1));assert(el('library').disabled&&JSON.stringify(DesignUI.snapshot().state)===snapshot,'BLE busy prevents library mutation');release();await busy;
 });
 await check('storage failure is visible and never deletes editor; local action blocks BLE',async()=>{
  const original=Designs.store,before=JSON.stringify(DesignUI.snapshot().state);Designs.store=async()=>{throw Error('QuotaExceededError test');};try{await DesignUI.action(()=>DesignUI.save('Fail'));assert(/QuotaExceededError/.test(el('designStatus').textContent),'quota error visible');assert(JSON.stringify(DesignUI.snapshot().state)===before,'editor remains');}finally{Designs.store=original;}
  let release,called=false;const pending=DesignUI.action(()=>new Promise(r=>{release=r;}));await run(()=>{called=true;});assert(!called&&el('editor').disabled&&el('send').disabled,'local task prevents transfer');release();await pending;
 });
 await check('load invalidates a pending old font render',async()=>{
  mode('text');const original=RichText.loadFonts;let release;RichText.loadFonts=()=>new Promise(r=>{release=r;});const pending=renderText();RichText.loadFonts=original;const value=DesignUI.snapshot();value.state.controls.mode='qr';await DesignUI.action(()=>DesignUI.restore(value));const bytes=Array.from(prepared.bytes).join();release();await pending;assert(Array.from(prepared.bytes).join()===bytes,'old font completion cannot overwrite restored QR');exact();
 });
 await check('combined templates all orientations: exact packed pixels, mixed ink and independent QR decode',async()=>{
  mode('text');select(0,0);change('textBackground','white');change('textColor','black');change('textSize',16);change('textAutoFit',true);type('Hi red');select(3,6);change('textColor','red');change('textBold',true);change('qrText','https://example.com');mode('combined');
  const original=JSON.stringify(textDocument);
  for(const template of ['text-qr','photo-text','photo-text-qr'])for(const angle of [0,90,180,270]){
   change('combinedTemplate',template);change('combinedOrientation',angle);await renderCombined();const wire=exact();assert(wire.includes(1)&&wire.includes(2),'mixed ink survives composite');
   const plan=Combined.regions(template,angle),c=el('preview'),rgba=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
   if(plan.qr){assert(jsQR(rgba,c.width,c.height)?.data==='https://example.com','independent decode of combined packed raster');const q=QRCodec.render(el('qrText').value),logical=RichText.fromWire(wire,angle);for(let y=0;y<128;y++)for(let x=0;x<128;x++)assert(logical[(plan.qr.y+y)*c.width+plan.qr.x+x]===q.codes[y*296+84+x],'QR including quiet border is untouched');}
   assert(JSON.stringify(textDocument)===original,'original mixed styles unchanged');
  }
 });
 await check('combined overflow, density, font failures and stale mode completion cannot send',async()=>{
  type('x\n'.repeat(60));await renderCombined();assert(prepared===null&&/does not fit/.test(el('message').textContent),'region overflow blocks');type('Hi');change('qrText','a'.repeat(300));await renderCombined();assert(prepared===null&&/dense/.test(el('message').textContent),'density blocks');change('qrText','https://example.com');await renderCombined();exact();
  const load=RichText.loadFonts;RichText.loadFonts=async()=>{throw Error('Font test failure');};await renderCombined();assert(prepared===null,'failed fonts block');let release;RichText.loadFonts=()=>new Promise(r=>{release=r;});const pending=renderCombined();RichText.loadFonts=load;mode('qr');const bytes=Array.from(prepared.bytes).join();release();await pending;assert(Array.from(prepared.bytes).join()===bytes,'mode epoch discards combined result');
  mode('combined');await renderCombined();let releaseOld;RichText.loadFonts=()=>new Promise(r=>{releaseOld=r;});const old=renderCombined();RichText.loadFonts=load;change('combinedTemplate','text-qr');await renderCombined();const next=Array.from(prepared.bytes).join();releaseOld();await old;assert(Array.from(prepared.bytes).join()===next,'new template wins');exact();
 });
 await check('combined saved designs, backups and template undo redo retain editable sources',async()=>{
  change('combinedTemplate','photo-text-qr');await renderCombined();const expected=DesignUI.snapshot(),id=await DesignUI.save('Combined');const row=await Designs.store('get',id);assert(JSON.stringify(row.state)===JSON.stringify(expected.state),'combined save readback');
  const imported=await Designs.importBackup(new Blob([await Designs.exportBackup(expected,'Combined')]));mode('photo');await DesignUI.action(()=>DesignUI.restore(imported));await renderCombined();assert(JSON.stringify(DesignUI.snapshot().state)===JSON.stringify(expected.state),'combined backup restore');exact();
  // Seed history after direct restore, just as the import button does.
  DesignUI.history.push(DesignUI.snapshot());change('combinedTemplate','text-qr');await DesignUI.action(()=>DesignUI.travel(-1));assert(el('combinedTemplate').value==='photo-text-qr','undo template');await DesignUI.action(()=>DesignUI.travel(1));assert(el('combinedTemplate').value==='text-qr','redo template');await renderCombined();exact();
  const legacy=DesignUI.snapshot();delete legacy.state.controls.combinedTemplate;delete legacy.state.controls.combinedOrientation;legacy.state.controls.mode='text';await DesignUI.action(()=>DesignUI.restore(legacy));await renderText();assert(el('combinedTemplate').value==='text-qr'&&el('combinedOrientation').value==='0','old record defaults');exact();await Designs.store('delete',id);
  mode('combined');change('combinedTemplate','photo-text-qr');await renderCombined();exact();
 });
 await check('combined photo decode invalidates payload, stale completion cannot overwrite mode, busy lock remains shared',async()=>{
  const snapshot=DesignUI.snapshot(),decode=Image.prototype.decode;let release;
  Image.prototype.decode=function(){return new Promise(r=>{release=r;});};
  const file=new File([sourceBlob],'fixture.png',{type:'image/png'}),transfer=new DataTransfer();transfer.items.add(file);el('photo').files=transfer.files;el('photo').dispatchEvent(new Event('change'));
  for(let i=0;i<100&&!release;i++)await new Promise(r=>setTimeout(r,5));
  assert(release&&prepared===null&&photoLoading,'photo decode immediately invalidates composite');Image.prototype.decode=decode;
  mode('qr');const bytes=Array.from(prepared.bytes).join();release();await pause();assert(Array.from(prepared.bytes).join()===bytes&&sourceImage===null,'stale image ignored after mode switch');
  await DesignUI.action(()=>DesignUI.restore(snapshot));await renderCombined();exact();
  let done;const busy=run(()=>new Promise(r=>{done=r;}));assert(el('editor').disabled&&el('library').disabled&&el('send').disabled,'combined shares BLE busy interlock');done();await busy;exact();
 });
 await check('mobile-width layout has no horizontal overflow',async()=>{assert(document.documentElement.scrollWidth<=innerWidth,'mobile horizontal overflow');});
 window.browserTestResults={passed:results.length,tests:results};return window.browserTestResults;
})()
