// Bounded, versioned editable documents. No HTML or executable content.
const Designs=(()=>{
  const MAX_IMAGE=10*1024*1024,MAX_BACKUP=15*1024*1024;
  const choices={mode:['photo','text','qr'],textSize:['8','10','12','14','16','18','20','22','24','26','28','30','32','36','40','44','48'],textFont:['sans-serif','serif','monospace','Abel','Lobster','Pacifico'],textColor:['black','white','red'],textBackground:['white','black','red'],textAlign:['left','center','right'],textOrientation:['0','90','180','270'],photoOrientation:['0','90','180','270'],palette:['bw','red']};
  const flags=['textBold','textItalic','textUnderline','textStrike','textAutoFit'];
  function fail(){throw Error('Invalid or unsupported TICKEY design.');}
  function text(s,max){if(typeof s!=='string'||s.length>max||/[\x00-\x08\x0b-\x1f\x7f]/.test(s))fail();return s;}
  function name(s){text(s,80);if(!s.trim())fail();return s.trim();}
  function style(s){
    if(!s||!Number.isInteger(s.size)||s.size<8||s.size>48||!choices.textFont.includes(s.family)||!choices.textColor.includes(s.color))fail();
    const out={size:s.size,family:s.family,color:s.color};for(const k of ['bold','italic','underline','strike']){if(typeof s[k]!=='boolean')fail();out[k]=s[k];}return out;
  }
  function validate(v){
    if(!v||v.version!==1||!v.controls||!v.document)fail();
    const controls={};for(const [k,a] of Object.entries(choices)){if(!a.includes(v.controls[k]))fail();controls[k]=v.controls[k];}
    for(const k of flags){if(typeof v.controls[k]!=='boolean')fail();controls[k]=v.controls[k];}
    for(const [k,min,max] of [['cropX',0,100],['cropY',0,100],['zoom',1,3]]){const n=v.controls[k];if(typeof n!=='string'||!n.trim()||!Number.isFinite(Number(n))||Number(n)<min||Number(n)>max)fail();controls[k]=n;}
    controls.qrText=text(v.controls.qrText,2000);
    const t=text(v.document.text,2000),ranges=v.document.ranges;if(!Array.isArray(ranges)||ranges.length>2000)fail();
    let end=0;const clean=ranges.map(r=>{if(!r||r.start!==end||!Number.isInteger(r.end)||r.end<=end||r.end>t.length)fail();const out={start:end,end:r.end,style:style(r.style)};end=r.end;return out;});if(end!==t.length)fail();
    return {version:1,controls,document:{text:t,ranges:clean}};
  }
  function pack(doc){const ranges=[];doc.styles.forEach((s,i)=>{const last=ranges.at(-1);if(last&&JSON.stringify(last.style)===JSON.stringify(s))last.end=i+1;else ranges.push({start:i,end:i+1,style:{...s}});});return {text:doc.text,ranges};}
  function unpack(doc){const styles=[];for(const r of doc.ranges)for(let i=r.start;i<r.end;i++)styles.push({...r.style});return {text:doc.text,styles};}
  // Immutable Blobs are shared, never base64-copied per keystroke. Bound both steps and unique image bytes.
  class History {
    constructor(initial){this.items=[initial];this.index=0;this.key='';this.time=0;}
    push(state,key='',now=Date.now()){
      const old=this.items[this.index];if(old.photo===state.photo&&JSON.stringify(old.state)===JSON.stringify(state.state))return;
      this.items.splice(this.index+1);
      if(key&&key===this.key&&now-this.time<650&&this.index>0)this.items[this.index]=state;
      else {this.items.push(state);this.index++;}
      this.key=key;this.time=now;
      const bytes=()=>[...new Set(this.items.map(s=>s.photo).filter(Boolean))].reduce((n,b)=>n+b.size,0);
      while(this.items.length>40||bytes()>30*1024*1024){this.items.shift();this.index--;}
    }
    target(delta){return this.items[this.index+delta];}
    moved(delta){this.index+=delta;this.key='';}
  }
  function open(){return new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined'){reject(Error('Local storage unavailable. Export a backup instead.'));return;}
    const req=indexedDB.open('tickey-designs',1);
    req.onupgradeneeded=()=>req.result.createObjectStore('designs',{keyPath:'id'});
    req.onerror=()=>reject(req.error);req.onblocked=()=>reject(Error('Storage upgrade blocked. Close other TICKEY tabs.'));
    req.onsuccess=()=>resolve(req.result);
  });}
  async function store(action,value){const db=await open();try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction('designs',action==='list'||action==='get'?'readonly':'readwrite'),s=tx.objectStore('designs');
    const rows=[],req=action==='list'?s.openCursor():action==='get'?s.get(value):action==='put'?s.put(value):s.delete(value);
    if(action==='list')req.onsuccess=()=>{const cursor=req.result;if(cursor){const {id,name,updated}=cursor.value;rows.push({id,name,updated});cursor.continue();}};
    tx.oncomplete=()=>resolve(action==='list'?rows:req.result);tx.onabort=()=>reject(tx.error||Error('Storage transaction aborted'));tx.onerror=()=>reject(tx.error||req.error);
  });}finally{db.close();}}
  async function decode(blob){
    if(blob===null)return null;
    if(!(blob instanceof Blob)||!['image/png','image/jpeg'].includes(blob.type)||blob.size>MAX_IMAGE||!blob.size)fail();
    const h=new Uint8Array(await blob.slice(0,8).arrayBuffer()),png=h.length===8&&[137,80,78,71,13,10,26,10].every((v,i)=>h[i]===v),jpg=h[0]===255&&h[1]===216&&h[2]===255;
    if(blob.type==='image/png'?!png:!jpg)fail();
    const url=URL.createObjectURL(blob);try{const image=new Image();image.src=url;await image.decode();if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>20000000)fail();return image;}finally{URL.revokeObjectURL(url);}
  }
  async function exportBackup(snapshot,label){
    const state=validate(snapshot.state);let photo=null;
    if(snapshot.photo){await decode(snapshot.photo);const data=await new Promise((r,j)=>{const f=new FileReader();f.onload=()=>r(f.result.split(',')[1]);f.onerror=()=>j(f.error);f.readAsDataURL(snapshot.photo);});photo={mime:snapshot.photo.type,data};}
    return JSON.stringify({format:'tickey-design',version:1,name:name(label),state,photo});
  }
  async function importBackup(file){
    if(file.size>MAX_BACKUP)throw Error('Backup exceeds 15 MiB.');
    const v=JSON.parse(await file.text());if(v.format!=='tickey-design'||v.version!==1)fail();
    const state=validate(v.state),label=name(v.name);let photo=null;
    if(v.photo!==null){const p=v.photo;if(!p||!['image/png','image/jpeg'].includes(p.mime)||typeof p.data!=='string'||p.data.length>Math.ceil(MAX_IMAGE/3)*4||p.data.length%4||! /^[A-Za-z0-9+/]*={0,2}$/.test(p.data))fail();const raw=atob(p.data);photo=new Blob([Uint8Array.from(raw,c=>c.charCodeAt(0))],{type:p.mime});}
    const image=await decode(photo);return {name:label,state,photo,image};
  }
  return {choices,flags,validate,name,pack,unpack,History,store,decode,exportBackup,importBackup};
})();
if(typeof module!=='undefined')module.exports=Designs;
