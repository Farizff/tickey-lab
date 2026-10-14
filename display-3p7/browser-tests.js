(async()=>{
const $=id=>document.getElementById(id),tests=[];
function check(x,s){if(!x)throw Error(s);tests.push(s);}
function change(id,value){$(id).value=value;$(id).dispatchEvent(new Event(id==='mode'?'change':'input'));}
async function wait(fn){for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw Error('UI timeout: '+$('status').textContent);}
const black=()=>{const a=$('preview').getContext('2d').getImageData(0,0,416,240).data;let n=0;for(let i=0;i<a.length;i+=4)if(a[i]===0&&a[i+3]===255)n++;return n;};
check(black()>0,'initial text rasterized');change('text','New text\nSecond line');check(black()>0&&$('status').textContent==='Preview ready.','edited multiline text');change('text','');check($('send').disabled&&$('status').textContent.includes('Enter some text'),'empty text invalidates');change('text','X'.repeat(1500));check($('status').textContent.includes('does not fit'),'overflow rejected');change('mode','photo');
const c=document.createElement('canvas');c.width=600;c.height=400;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,600,400);ctx.fillStyle='black';ctx.fillRect(0,0,300,400);
async function load(file){const dt=new DataTransfer();dt.items.add(file);$('photo').files=dt.files;$('photo').dispatchEvent(new Event('change'));}
for(const mime of ['image/png','image/jpeg']){const blob=await new Promise(r=>c.toBlob(r,mime));await load(new File([blob],'test',{type:mime}));await wait(()=>$('status').textContent==='Preview ready.');check(black()>40000&&black()<60000,'actual '+mime+' decoding');}
change('zoom','2');change('x','100');check($('status').textContent==='Preview ready.','crop and zoom render');await load(new File(['bad'],'bad.png',{type:'image/png'}));await wait(()=>$('status').textContent.includes('JPEG/PNG only'));check($('send').disabled&&black()===0,'invalid photo clears stale preview');
const blob=await new Promise(r=>c.toBlob(r,'image/png'));await load(new File([blob],'again.png',{type:'image/png'}));await wait(()=>$('status').textContent==='Preview ready.');check(true,'valid photo recovers');
let s='MON1:READY',off=0,capability=Mono.CAP,writes=0;
const enc=s=>new DataView(new TextEncoder().encode(s).buffer),d=new EventTarget();
const rx={writeValueWithResponse:async a=>{writes++;const v=new DataView(a.buffer),tag=v.getUint32(1,true).toString(16).padStart(8,'0');if(a[0]===1){off=0;s=`RECV:${tag}:0`;}else if(a[0]===2){if(v.getUint16(5,true)!==off)throw Error('offset');off+=a.length-7;s=`RECV:${tag}:${off}`;}else{s=`DONE:${tag}:1500`;}}};
const service={getCharacteristic:async id=>id===Mono.uuid(4)?{readValue:async()=>enc(capability)}:id===Mono.uuid(3)?{readValue:async()=>enc(s)}:rx};
d.gatt={connected:false,connect:async()=>{d.gatt.connected=true;return{getPrimaryService:async()=>service};},disconnect:()=>{d.gatt.connected=false;d.dispatchEvent(new Event('gattserverdisconnected'));}};
Object.defineProperty(navigator,'bluetooth',{configurable:true,value:{requestDevice:async()=>d}});
capability='FAST1:180';$('connect').click();await wait(()=>$('status').textContent.includes('Wrong firmware'));check(writes===0&&$('send').disabled,'actual app rejects old capability');capability=Mono.CAP;$('connect').click();await wait(()=>$('status').textContent.includes('Connected to matching'));$('send').click();await wait(()=>$('status').textContent.startsWith('Done.'));check(off===12480,'actual app sends complete image through mock GATT');$('disconnect').click();check($('send').disabled,'disconnect disables sending');check(document.documentElement.scrollWidth<=innerWidth,'390px mobile width has no overflow');return{passed:tests.length,tests};
})()
