// Phone-side layout; the preview and IMG1 payload use exactly the same pixels.
const TextCodec=(()=>{
  function validate(text,color){
    if(typeof text!=='string'||!text.trim())throw Error('Enter some text.');
    if(text.length>2000)throw Error('Use at most 2000 characters.');
    if(/[\x00-\x08\x0b-\x1f\x7f]/.test(text))throw Error('Unsupported control character.');
    if(!['black','red'].includes(color))throw Error('Choose black or red.');
  }
  function layout(ctx,text,options={}){
    const o={size:20,family:'sans-serif',align:'left',bold:false,italic:false,underline:false,strike:false,...options};
    if(!Number.isInteger(o.size)||o.size<8||o.size>48||!['sans-serif','serif','monospace'].includes(o.family)||!['left','center','right'].includes(o.align))throw Error('Invalid text settings.');
    ctx.font=`${o.italic?'italic ':''}${o.bold?'bold ':''}${o.size}px ${o.family}`;
    const lines=[],width=276,lineHeight=Math.ceil(o.size*1.35);
    // Preserve explicit line breaks; wrap at spaces where possible and split long words.
    for(const paragraph of text.replace(/\r\n?/g,'\n').replace(/\t/g,'    ').split('\n')){
      let line='';
      const chars=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(paragraph)].map(s=>s.segment):Array.from(paragraph);
      for(const char of chars){
        if(line&&ctx.measureText(line+char).width>width){
          const space=line.lastIndexOf(' ');
          if(space>0){lines.push(line.slice(0,space));line=line.slice(space+1);}
          else {lines.push(line);line='';}
          if(line&&ctx.measureText(line+char).width>width){lines.push(line);line='';}
        }
        line+=char;
      }
      lines.push(line);
    }
    const maxLines=Math.floor(112/lineHeight);
    return {o,lines,lineHeight,maxLines,overflow:lines.length>maxLines||lines.some(s=>ctx.measureText(s).width>width)};
  }
  function render(ctx,text,color,options={}){
    validate(text,color);const plan=layout(ctx,text,options),{o,lines,lineHeight,maxLines}=plan;
    ctx.fillStyle='white';ctx.fillRect(0,0,296,128);ctx.fillStyle=color;
    ctx.textAlign=o.align;ctx.textBaseline='alphabetic';
    const x=o.align==='left'?10:o.align==='right'?286:148;
    lines.slice(0,maxLines).forEach((line,i)=>{
      const y=8+i*lineHeight+o.size;ctx.fillText(line,x,y);
      const width=ctx.measureText(line).width,left=o.align==='left'?x:o.align==='right'?x-width:x-width/2;
      if(o.underline)ctx.fillRect(left,y+2,width,Math.max(1,Math.round(o.size/16)));
      if(o.strike)ctx.fillRect(left,y-o.size*.32,width,Math.max(1,Math.round(o.size/16)));
    });
    const rgba=ctx.getImageData(0,0,296,128).data,codes=new Uint8Array(296*128);
    for(let i=0;i<codes.length;i++)if((color==='red'?rgba[i*4+1]:rgba[i*4])<128)codes[i]=color==='red'?2:1;
    return {...plan,codes};
  }
  return {validate,layout,render};
})();
if(typeof module!=='undefined')module.exports=TextCodec;
