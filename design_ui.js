'use strict';
const DesignUI=(()=>{
  const ids=[...Object.keys(Designs.choices),...Designs.flags,'cropX','cropY','zoom','qrText'];
  function snapshot(){const controls={};for(const id of ids)controls[id]=Designs.flags.includes(id)?el(id).checked:el(id).value;return {state:Designs.validate({version:1,controls,document:Designs.pack(textDocument)}),photo:sourceBlob};}
  const history=new Designs.History(snapshot());
  const say=s=>{el('designStatus').textContent=s;};
  function buttons(){el('undo').disabled=history.index===0;el('redo').disabled=history.index===history.items.length-1;}
  function remember(key=''){if(localBusy)return;try{history.push(snapshot(),key);buttons();}catch(error){say('Cannot record edit: '+error.message);}}
  for(const id of ids.filter(id=>id!=='mode'))el(id).addEventListener('input',()=>remember(['qrText','cropX','cropY','zoom'].includes(id)?id:''));
  el('text').addEventListener('input',()=>remember('text'));
  el('mode').addEventListener('change',()=>remember());
  document.addEventListener('designphoto',()=>remember());
  async function restore(value){
    const state=Designs.validate(value.state),image=value.image===undefined?await Designs.decode(value.photo):value.image;
    // Validation and decode complete before editor mutation. Invalidate all old asynchronous renders.
    ++epoch;++textRevision;photoLoading=false;prepared=null;beforeEdit=null;
    for(const id of ids)if(Designs.flags.includes(id))el(id).checked=state.controls[id];else el(id).value=state.controls[id];
    textDocument=Designs.unpack(state.document);el('text').value=textDocument.text;selection={start:0,end:0};el('text').setSelectionRange(0,0);retainSelection();
    sourceBlob=value.photo;sourceImage=image;el('photo').value='';
    el('mode').dispatchEvent(new Event('change'));update();
  }
  async function action(fn){if(working||localBusy||photoLoading)return;localBusy=true;update();try{await fn();}catch(error){say('Error: '+error.message+' Your saved designs were not automatically removed.');}finally{localBusy=false;update();buttons();}}
  async function list(selected=el('savedDesigns').value){
    const rows=await Designs.store('list');el('savedDesigns').replaceChildren();
    for(const row of rows.sort((a,b)=>b.updated-a.updated)){const option=document.createElement('option');option.value=row.id;option.textContent=row.name;el('savedDesigns').appendChild(option);}
    if(rows.some(r=>r.id===selected))el('savedDesigns').value=selected;
    return rows;
  }
  async function chosen(){const id=el('savedDesigns').value;if(!id)throw Error('Select a saved design first.');const row=await Designs.store('get',id);if(!row)throw Error('Design no longer exists. Refresh the list.');return row;}
  async function save(label){const value=snapshot(),id=crypto.randomUUID(),row={id,name:Designs.name(label),updated:Date.now(),...value};await Designs.store('put',row);const saved=await Designs.store('get',id);if(!saved||JSON.stringify(saved.state)!==JSON.stringify(row.state)||saved.photo?.size!==row.photo?.size)throw Error('Storage verification failed. Export a backup.');await list(id);say('Saved on this browser only. Export a backup to keep a separate copy.');return id;}
  async function travel(delta){const target=history.target(delta);if(!target)return;await restore(target);history.moved(delta);say('Editor '+(delta<0?'undo':'redo')+'. The physical screen is unchanged.');}
  el('saveDesign').addEventListener('click',()=>action(()=>save(el('designName').value)));
  el('refreshDesigns').addEventListener('click',()=>action(()=>list()));
  el('loadDesign').addEventListener('click',()=>action(async()=>{const row=await chosen();await restore(row);history.push(snapshot());el('designName').value=row.name;say('Loaded editable design. Nothing sent.');}));
  el('renameDesign').addEventListener('click',()=>action(async()=>{const row=await chosen();row.name=Designs.name(el('designName').value);row.updated=Date.now();await Designs.store('put',row);if((await Designs.store('get',row.id))?.name!==row.name)throw Error('Rename verification failed.');await list(row.id);say('Saved design renamed.');}));
  el('deleteDesign').addEventListener('click',()=>action(async()=>{const row=await chosen();if(!confirm('Delete saved design “'+row.name+'”? Export a backup first if needed.'))return;await Designs.store('delete',row.id);if(await Designs.store('get',row.id))throw Error('Delete verification failed.');await list();say('Saved copy deleted. Current editor and physical screen unchanged.');}));
  el('exportDesign').addEventListener('click',()=>action(async()=>{const json=await Designs.exportBackup(snapshot(),el('designName').value||'Untitled'),url=URL.createObjectURL(new Blob([json],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='tickey-design.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);say('Backup download requested. Check Files/downloads before clearing browser data.');}));
  el('importDesign').addEventListener('change',()=>action(async()=>{const file=el('importDesign').files[0];if(!file)return;try{const value=await Designs.importBackup(file);await restore(value);history.push(snapshot());el('designName').value=value.name;say('Backup imported into editor, not yet saved here. Tap Save new design. Nothing sent.');}finally{el('importDesign').value='';}}));
  el('undo').addEventListener('click',()=>action(()=>travel(-1)));
  el('redo').addEventListener('click',()=>action(()=>travel(1)));
  document.addEventListener('keydown',event=>{if(!(event.ctrlKey||event.metaKey)||event.altKey||event.isComposing||!el('editor').contains(event.target))return;const k=event.key.toLowerCase();if(k==='z'||k==='y'){event.preventDefault();action(()=>travel(k==='y'||event.shiftKey?1:-1));}});
  buttons();list().catch(error=>say('Local storage unavailable: '+error.message+'. Export still works; private mode or browser cleanup can erase local designs.'));
  return {snapshot,restore,action,save,list,travel,history};
})();
