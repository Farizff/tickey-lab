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
      text=portrait?box(0,0,128,168):box(0,0,168,128);
      qr=portrait?box(0,168,128,128):box(168,0,128,128);
    }else if(template==='photo-text'){
      photo=portrait?box(0,0,128,148):box(0,0,148,128);
      text=portrait?box(0,148,128,148):box(148,0,148,128);
    }else{
      photo=portrait?box(0,0,128,80):box(0,0,80,128);
      text=portrait?box(0,80,128,88):box(80,0,88,128);
      qr=portrait?box(0,168,128,128):box(168,0,128,128);
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
      place(Photo.quantize(ctx.getImageData(0,0,b.width,b.height).data,options.red,b.width,b.height),b);
    }
    let qr;
    if(plan.qr){
      // Extract the central 128px square, including its complete white quiet zone.
      qr=QR.render(options.qrText);const square=new Uint8Array(128*128);
      for(let y=0;y<128;y++)square.set(qr.codes.subarray(y*296+84,y*296+212),y*128);
      place(square,plan.qr);
    }
    return {...plan,codes:Rich.toWire(codes,options.orientation),text,qr};
  }
  return {regions,render};
})();
if(typeof module!=='undefined')module.exports=Combined;
