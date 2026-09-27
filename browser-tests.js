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
  assert(prepared&&prepared.bytes.length===9472,'fixed wire bytes ready');
  const bytes=prepared.bytes,wire=new Uint8Array(296*128);for(let i=0;i<wire.length;i++)wire[i]=(bytes[i>>2]>>(6-2*(i%4)))&3;
  const logical=RichText.fromWire(wire,Number(el('textOrientation').value)),expected=PhotoCodec.preview(logical),canvas=el('preview'),actual=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
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
 await check('photo decoding after portrait text remains unrotated with original packing',async()=>{
  change('textOrientation',90);await renderText();mode('photo');
  const fixture=document.createElement('canvas');fixture.width=296;fixture.height=128;const c=fixture.getContext('2d');c.fillStyle='white';c.fillRect(0,0,296,128);c.fillStyle='black';c.fillRect(0,0,50,50);c.fillStyle='red';c.fillRect(200,80,96,48);
  const blob=await new Promise(r=>fixture.toBlob(r,'image/png')),file=new File([blob],'fixture.png',{type:'image/png'}),transfer=new DataTransfer();transfer.items.add(file);el('photo').files=transfer.files;el('photo').dispatchEvent(new Event('change'));
  for(let i=0;i<100&&!prepared;i++)await new Promise(r=>setTimeout(r,10));assert(prepared,'photo prepared');assert(prepared.bytes[0]===85,'top-left remains black, not text-rotated');assert(el('preview').width===296&&el('preview').height===128,'photo wire canvas');
  mode('text');await renderText();exact();
 });
 await check('mobile-width layout has no horizontal overflow',async()=>{assert(document.documentElement.scrollWidth<=innerWidth,'mobile horizontal overflow');});
 window.browserTestResults={passed:results.length,tests:results};return window.browserTestResults;
})()
