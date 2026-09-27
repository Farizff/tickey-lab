// Text is rendered on the phone and sent through the unchanged IMG1 receiver.
const TextCodec=(()=>{
  function validate(text,color){
    if(typeof text!=='string'||!text.trim()||text.length>18||!/^[\x20-\x7e]+$/.test(text))throw Error('Use 1–18 printable ASCII characters, with at least one non-space character.');
    if(!['black','red'].includes(color))throw Error('Choose black or red.');
  }
  function render(ctx,text,color){
    validate(text,color);
    ctx.fillStyle='white';ctx.fillRect(0,0,296,128);
    let size=24;ctx.font=`bold ${size}px monospace`;
    while(ctx.measureText(text).width>280&&size>8){size--;ctx.font=`bold ${size}px monospace`;}
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=color;
    ctx.fillText(text,148,64);
    const rgba=ctx.getImageData(0,0,296,128).data,codes=new Uint8Array(296*128);
    // Threshold anti-alias coverage; text uses only white and the selected ink.
    for(let i=0;i<codes.length;i++)if((color==='red'?rgba[i*4+1]:rgba[i*4])<128)codes[i]=color==='red'?2:1;
    return codes;
  }
  return {validate,render};
})();
if(typeof module!=='undefined')module.exports=TextCodec;
