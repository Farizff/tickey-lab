// Sequential batch orchestration; no retries or implicit replacement.
(function(root){
 const api={
  slots(state,count){
   if(!state||!Number.isInteger(state.slots)||state.slots<1||state.slots>8||!Number.isInteger(state.mask)||state.mask<0||state.mask>=(1<<state.slots))throw Error('Invalid device slot list');
   if(!Number.isInteger(count)||count<1||count>8)throw Error('Choose 1–8 photos');
   const free=Array.from({length:state.slots},(_,i)=>i).filter(i=>!(state.mask&(1<<i)));
   if(free.length<count)throw Error(`Need ${count} empty slots; only ${free.length} available. Delete unwanted slots explicitly first.`);
   return free.slice(0,count);
  },
  async save(items,io){
   const slots=api.slots(await io.list(),items.length);
   await io.stop();
   for(let i=0;i<items.length;i++){
    const slot=slots[i],state=await io.list();
    if(state.slots<=slot||(state.mask&(1<<slot)))throw Error('Device slots changed. Stopped without replacing a saved screen.');
    io.progress(i,slot,'sending');
    const result=await io.send(items[i]);
    await io.save(slot,result.id);
    io.progress(i,slot,'saved');
   }
   return slots;
  }
 };
 if(typeof module==='object'&&module.exports)module.exports=api;else root.GalleryBatch=api;
})(typeof globalThis!=='undefined'?globalThis:this);
