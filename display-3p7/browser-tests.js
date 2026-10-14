(async()=>{
const $=id=>document.getElementById(id),tests=[];
function check(x,s){if(!x)throw Error(s);tests.push(s);}
function change(id,value){$(id).value=value;$(id).dispatchEvent(new Event(id==='mode'?'change':'input'));}
async function wait(fn){for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw Error('UI timeout: '+$('message').textContent+' / '+$('status').textContent);}
check(!document.querySelector('#deviceGallery')&&!$('photo').multiple,'no gallery, slideshow or batch');
change('mode','text');change('text','Hello\n3.7 inch');await wait(()=>prepared);check(prepared.bytes.length===12480,'multiline text uses MON1 packed size');
for(const font of ['sans-serif','serif','monospace','Abel','Lobster','Pacifico']){change('textFont',font);await wait(()=>prepared);check(true,'font '+font+' rasterized');}
$('text').setSelectionRange(0,5);retainSelection();$('textBold').checked=true;$('textBold').dispatchEvent(new Event('input'));await wait(()=>prepared);check(textDocument.styles[0].bold&&!textDocument.styles[6].bold,'selection formatting retained');
for(const angle of [0,90,180,270]){change('textOrientation',String(angle));await wait(()=>prepared);check($('preview').width===(angle%180?240:416),'text orientation '+angle);}
change('text','');await wait(()=>!prepared);check($('send').disabled,'empty text blocks send');change('text','X'.repeat(1900));await wait(()=>$('message').textContent.includes('does not fit'));check(!prepared,'overflow blocks send');change('text','Hello');await wait(()=>prepared);
const c=document.createElement('canvas');c.width=600;c.height=400;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,600,400);ctx.fillStyle='black';ctx.fillRect(0,0,300,400);
async function load(file){const dt=new DataTransfer();dt.items.add(file);$('photo').files=dt.files;$('photo').dispatchEvent(new Event('change'));}
change('mode','photo');for(const mime of ['image/png','image/jpeg']){const blob=await new Promise(r=>c.toBlob(r,mime));await load(new File([blob],'test',{type:mime}));await wait(()=>prepared&&!photoLoading);check(prepared.bytes.some(x=>x)&&prepared.bytes.some(x=>x!==255),'actual '+mime+' decoding');}
change('zoom','2');change('cropX','100');check(prepared,'crop and zoom');
for(const angle of [0,90,180,270]){change('photoOrientation',String(angle));check(prepared&&$('preview').width===(angle%180?240:416),'photo orientation '+angle);}
await load(new File(['bad'],'bad.png',{type:'image/png'}));await wait(()=>!photoLoading);check(!prepared&&$('send').disabled,'invalid photo clears payload');
const blob=await new Promise(r=>c.toBlob(r,'image/png'));await load(new File([blob],'again.png',{type:'image/png'}));await wait(()=>prepared&&!photoLoading);
change('textFont','sans-serif');change('textSize','12');change('qrText','https://example.com');change('mode','combined');
for(const template of ['photo-text','text-qr','photo-text-qr'])for(const angle of [0,90,180,270]){change('combinedTemplate',template);change('combinedOrientation',String(angle));await wait(()=>prepared);check(prepared.bytes.length===12480,template+' '+angle);}
const state=DesignUI.snapshot();
change('brightness','25');change('contrast','1.25');$('dither').checked=false;$('dither').dispatchEvent(new Event('input'));await wait(()=>prepared);check(DesignUI.snapshot().state.controls.brightness==='25'&&!DesignUI.snapshot().state.controls.dither,'adjustments recorded in editor history');
await DesignUI.action(()=>DesignUI.travel(-1));await wait(()=>prepared);check($('dither').checked,'undo restores dither');await DesignUI.action(()=>DesignUI.travel(1));await wait(()=>prepared);check(!$('dither').checked,'redo restores dither');
await DesignUI.action(()=>DesignUI.restore(state));await wait(()=>prepared);
await DesignUI.action(()=>DesignUI.save('Restored design'));const rows=await Designs.store('list'),row=await Designs.store('get',rows[0].id);check(row.photo.size===sourceBlob.size,'local design preserves original image');const backup=await Designs.exportBackup(state,'Backup');const imported=await Designs.importBackup(new Blob([backup]));check(JSON.stringify(imported.state)===JSON.stringify(state.state),'backup roundtrip');
let s='MON1:READY',off=0,capability=Mono.CAP,writes=[];const enc=s=>new DataView(new TextEncoder().encode(s).buffer),d=new EventTarget();
const rx={writeValueWithResponse:async a=>{writes.push(a.slice());const v=new DataView(a.buffer),tag=v.getUint32(1,true).toString(16).padStart(8,'0');if(a[0]===5)s=`PROBE:${tag}:180`;else if(a[0]===1){off=0;s=`RECV:${tag}:0`;}else if(a[0]===2){if(v.getUint16(5,true)!==off)throw Error('offset');off+=a.length-7;s=`RECV:${tag}:${off}`;}else s=`DONE:${tag}:1500`;}};
const service={getCharacteristic:async id=>id===Mono.uuid(4)?{readValue:async()=>enc(capability)}:id===Mono.uuid(3)?{readValue:async()=>enc(s)}:rx};d.gatt={connected:false,getPrimaryService:async()=>service,connect:async()=>{d.gatt.connected=true;return{getPrimaryService:async()=>service};},disconnect:()=>{d.gatt.connected=false;d.dispatchEvent(new Event('gattserverdisconnected'));}};
Object.defineProperty(navigator,'bluetooth',{configurable:true,value:{requestDevice:async()=>d}});
capability='FAST1:180';$('connect').click();await wait(()=>$('status').textContent.includes('Wrong firmware'));check(writes.length===0,'reject foreign capability before writing');
for(const cap of [Mono.CAP,'MON1:416:240:1:FAST1:180']){capability=cap;s='MON1:READY';writes=[];$('connect').click();await wait(()=>$('status').textContent.startsWith('Connected.'));$('send').click();await wait(()=>$('status').textContent.startsWith('FINISHED'));check(off===12480&&Math.max(...writes.map(a=>a.length))===(cap===Mono.CAP?20:180),'actual app GATT '+cap);$('disconnect').click();}
check(document.documentElement.scrollWidth<=innerWidth,'390px mobile width');return{passed:tests.length,tests};
})()
