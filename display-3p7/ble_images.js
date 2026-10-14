// Full editor adapter: the isolated MON1 sender owns capability checks and framing.
const BLEImages={
  SIZE:Mono.SIZE,
  compatible:s=>s==='MON1:READY'||/^(RECV|VERIFIED|REFRESH|DONE|ABORT|ERR):[0-9a-f]{8}(?::[A-Z0-9]+)?$/.test(s),
  send:(io,bytes,palette,id,progress,env)=>{if(palette!==2)throw Error('Monochrome only');return Mono.send(io,bytes,id,progress,env);}
};
