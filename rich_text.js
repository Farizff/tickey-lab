// UTF-16 ranges match textarea selectionStart/End; no HTML is accepted.
const RichText=(()=>{
  const families=['sans-serif','serif','monospace','Abel','Lobster','Pacifico'];
  const defaults={size:20,family:'sans-serif',color:'black',bold:false,italic:false,underline:false,strike:false};
  function style(value={}){
    const s={...defaults,...value};
    if(!Number.isInteger(s.size)||s.size<8||s.size>48||!families.includes(s.family)||!['black','white','red'].includes(s.color))throw Error('Invalid text settings.');
    return s;
  }
  function create(text='',s={}){return {text,styles:Array.from({length:text.length},()=>style(s))};}
  function apply(doc,start,end,patch){
    start=Math.max(0,start);end=Math.min(doc.text.length,end);
    return {text:doc.text,styles:doc.styles.map((s,i)=>i>=start&&i<end?style({...s,...patch}):s)};
  }
  function replace(doc,start,end,text,s){
    return {text:doc.text.slice(0,start)+text+doc.text.slice(end),styles:[...doc.styles.slice(0,start),...Array.from({length:text.length},()=>style(s)),...doc.styles.slice(end)]};
  }
  function edit(doc,text,s){
    let start=0,end=doc.text.length,nextEnd=text.length;
    while(start<end&&start<nextEnd&&doc.text[start]===text[start])start++;
    while(end>start&&nextEnd>start&&doc.text[end-1]===text[nextEnd-1]){end--;nextEnd--;}
    return replace(doc,start,end,text.slice(start,nextEnd),s);
  }
  function font(s){return `${s.italic?'italic ':''}${s.bold?'bold ':''}${s.size}px ${s.family}`;}
  function dimensions(angle){
    if(![0,90,180,270].includes(angle))throw Error('Invalid orientation.');
    return angle%180?{width:128,height:296}:{width:296,height:128};
  }
  // Shared logical-to-panel mapping includes 180-degree hardware compensation.
  function toWire(codes,angle=0){
    const {width:w,height:h}=dimensions(angle),rotation=(angle+180)%360,out=new Uint8Array(296*128);
    if(codes.length!==w*h)throw Error('Invalid pixel dimensions.');
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      let dx=x,dy=y;
      if(rotation===90){dx=h-1-y;dy=x;}
      if(rotation===180){dx=w-1-x;dy=h-1-y;}
      if(rotation===270){dx=y;dy=w-1-x;}
      out[dy*296+dx]=codes[y*w+x];
    }
    return out;
  }
  function fromWire(wire,angle=0){
    const {width:w,height:h}=dimensions(angle),rotation=(angle+180)%360,out=new Uint8Array(w*h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      let dx=x,dy=y;
      if(rotation===90){dx=h-1-y;dy=x;}
      if(rotation===180){dx=w-1-x;dy=h-1-y;}
      if(rotation===270){dx=y;dy=w-1-x;}
      out[y*w+x]=wire[dy*296+dx];
    }
    return out;
  }
  async function loadFonts(doc,fontSet){
    const needed=new Map();
    doc.styles.forEach(s=>{if(!s.family.includes('-')&&!['serif','monospace'].includes(s.family))needed.set(font(s),s);});
    if(needed.size&&!fontSet)throw Error('This browser cannot load bundled fonts.');
    for(const [spec] of needed){
      const faces=await fontSet.load(spec);
      if(!faces.length||!fontSet.check(spec))throw Error('Bundled font failed to load. Choose another font or reload.');
    }
  }
  function layout(ctx,doc,options={}){
    if(doc.styles.length!==doc.text.length)throw Error('Text styles do not match text.');
    const {width,height}=dimensions(options.orientation||0),available=width-20;
    const segments=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(doc.text)]:Array.from(doc.text).map((segment,i,a)=>({segment,index:a.slice(0,i).join('').length}));
    const lines=[];let line=[];
    const finish=(s=defaults)=>{line.emptySize=s.size;lines.push(line);line=[];};
    const measure=items=>items.reduce((sum,g)=>sum+g.width,0);
    for(const part of segments){
      const s=style(doc.styles[part.index]);
      if(part.segment==='\n'||part.segment==='\r\n'){finish(s);continue;}
      const text=part.segment==='\t'?'    ':part.segment;ctx.font=font(s);
      const metrics=ctx.measureText(text),g={text,s,width:metrics.width,ascent:Math.max(s.size,metrics.actualBoundingBoxAscent||0),descent:Math.max(Math.ceil(s.size*.35),metrics.actualBoundingBoxDescent||0)};
      if(line.length&&measure(line)+g.width>available){
        const space=line.map(a=>a.text).lastIndexOf(' ');
        if(space>0){const rest=line.slice(space+1);line=line.slice(0,space);finish();line=rest;}
        else finish();
        if(line.length&&measure(line)+g.width>available)finish();
      }
      line.push(g);
    }
    finish(doc.styles.at(-1)||defaults);
    let y=8;
    const plans=lines.map(items=>{
      const ascent=Math.max(0,...items.map(g=>g.ascent))||items.emptySize;
      const descent=Math.max(0,...items.map(g=>g.descent))||Math.ceil(items.emptySize*.35);
      const plan={items,width:measure(items),baseline:y+ascent,top:y,height:ascent+descent};y+=plan.height;return plan;
    });
    return {lines:plans,width,height,overflow:y>height-8||plans.some(l=>l.width>available)};
  }
  function fit(ctx,doc,options={}){
    let plan=layout(ctx,doc,options),effective=doc;
    const maximum=Math.max(8,...doc.styles.map(s=>s.size));
    // Recompute from originals on every render; never compound reductions or edit styles.
    if(options.autoFit&&plan.overflow)for(let cap=maximum-1;cap>=8;cap--){
      effective={text:doc.text,styles:doc.styles.map(s=>({...s,size:Math.max(8,Math.floor(s.size*cap/maximum))}))};
      plan=layout(ctx,effective,options);
      if(!plan.overflow)break;
    }
    const sizes=effective.styles.map(s=>s.size);
    return {...plan,autoFitted:effective!==doc,effectiveMin:Math.min(...sizes),effectiveMax:Math.max(...sizes)};
  }
  function render(ctx,doc,options={}){
    if(!doc.text.trim())throw Error('Enter some text.');
    if(doc.text.length>2000||/[\x00-\x08\x0b-\x1f\x7f]/.test(doc.text))throw Error('Invalid text (maximum 2000 characters; no control characters).');
    const background=options.background||'white',align=options.align||'left';
    if(!['white','black','red'].includes(background)||!['left','center','right'].includes(align))throw Error('Invalid text settings.');
    const plan=fit(ctx,doc,options),{width,height}=plan;
    ctx.canvas.width=width;ctx.canvas.height=height;
    ctx.fillStyle=background;ctx.fillRect(0,0,width,height);ctx.textBaseline='alphabetic';ctx.textAlign='left';
    for(const line of plan.lines){
      let x=align==='right'?width-10-line.width:align==='center'?(width-line.width)/2:10;
      for(const g of line.items){
        ctx.font=font(g.s);ctx.fillStyle=g.s.color;ctx.fillText(g.text,x,line.baseline);
        const thickness=Math.max(1,Math.round(g.s.size/16));
        if(g.s.underline)ctx.fillRect(x,line.baseline+2,g.width,thickness);
        if(g.s.strike)ctx.fillRect(x,line.baseline-g.s.size*.32,g.width,thickness);
        x+=g.width;
      }
    }
    const rgba=ctx.getImageData(0,0,width,height).data,codes=new Uint8Array(width*height),rgb=[[255,255,255],[0,0,0],[255,0,0]];
    const colors=['white','black','red'],allowed=new Set([colors.indexOf(background),...doc.styles.map(s=>colors.indexOf(s.color))]);
    for(let i=0;i<codes.length;i++){
      let best=colors.indexOf(background),distance=Infinity;
      for(const p of allowed){const d=rgb[p].reduce((sum,v,c)=>sum+(rgba[i*4+c]-v)**2,0);if(d<distance){best=p;distance=d;}}
      codes[i]=best;
    }
    const sameColor=plan.lines.some(l=>l.items.some(g=>g.text.trim()&&g.s.color===background));
    return {...plan,codes:toWire(codes,options.orientation||0),sameColor};
  }
  return {families,defaults,style,create,apply,replace,edit,font,dimensions,toWire,fromWire,loadFonts,layout,fit,render};
})();
if(typeof module!=='undefined')module.exports=RichText;
