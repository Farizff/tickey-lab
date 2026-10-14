// Fixed logical regions; composite once, then rotate the whole design to wire order.
const Combined=(()=>{
  const Rich=typeof module!=='undefined'?require('./rich_text.js'):RichText;
  const Photo=typeof module!=='undefined'?require('./photo_codec.js'):PhotoCodec;
  const QR=typeof module!=='undefined'?require('./qr_codec.js'):QRCodec;
  function regions(template,orientation=0){
    if(!['text-qr','photo-text','photo-text-qr'].includes(template))throw Error('Invalid combined template.');
    const {width,height}=Rich.dimensions(orientation),portrait=width<height;
    const box=(x,y,width,height)=>({x,y,width,height});
    let text,photo,qr;
    if(template==='text-qr'){
      text=portrait?box(0,0,240,176):box(0,0,176,240);
      qr=portrait?box(0,176,240,240):box(176,0,240,240);
    }else if(template==='photo-text'){
      photo=portrait?box(0,0,240,208):box(0,0,208,240);
      text=portrait?box(0,208,240,208):box(208,0,208,240);
    }else{
      photo=portrait?box(0,0,240,88):box(0,0,88,240);
      text=portrait?box(0,88,240,88):box(88,0,88,240);
      qr=portrait?box(0,176,240,240):box(176,0,240,240);
    }
    return {width,height,text,photo,qr};
  }
  function render(ctx,doc,image,options){
    const plan=regions(options.template,options.orientation),{width,height}=plan,codes=new Uint8Array(width*height);
    const place=(pixels,b)=>{for(let y=0;y<b.height;y++)codes.set(pixels.subarray(y*b.width,(y+1)*b.width),(b.y+y)*width+b.x);};
    const text=Rich.render(ctx,doc,{...options,region:plan.text});
    if(text.sameColor)throw Error('Some text matches the background colour. Sending is blocked.');
    if(text.overflow)throw Error('Text does not fit its region. Shorten text or enable auto-fit; minimum 8px. Sending is blocked.');
    place(text.codes,plan.text);
    if(plan.photo){
      if(!image)throw Error('Choose a JPEG or PNG for this layout.');
      const b=plan.photo,crop=Photo.crop(image.naturalWidth,image.naturalHeight,options.cropX,options.cropY,options.zoom,b.width,b.height);
      ctx.canvas.width=b.width;ctx.canvas.height=b.height;ctx.fillStyle='white';ctx.fillRect(0,0,b.width,b.height);ctx.drawImage(image,...crop,0,0,b.width,b.height);
      place(Photo.quantize(ctx.getImageData(0,0,b.width,b.height).data,options.red,b.width,b.height,options),b);
    }
    let qr;
    if(plan.qr){
      // Extract the central 128px square, including its complete white quiet zone.
      qr=QR.render(options.qrText);const square=new Uint8Array(240*240);
      for(let y=0;y<240;y++)square.set(qr.codes.subarray(y*416+88,y*416+328),y*240);
      place(square,plan.qr);
    }
    return {...plan,codes:Rich.toWire(codes,options.orientation),text,qr};
  }
  return {regions,render};
})();
if(typeof module!=='undefined')module.exports=Combined;
