// Deterministic conversion shared by the embedded page and Node tests.
const PhotoCodec = (() => {
  const W = 296, H = 128, BYTES = W * H / 4;
  const palette = [[255,255,255],[0,0,0],[255,0,0]];
  function crop(w,h,x,y,zoom,width=W,height=H) {
    if (![w,h,x,y,zoom].every(Number.isFinite) || w<=0 || h<=0 || x<0 || x>100 || y<0 || y>100 || zoom<1 || zoom>3) throw Error('Invalid crop');
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>W||height>W||width*height>W*H)throw Error('Invalid crop dimensions');
    const scale = Math.min(w/width,h/height)/zoom;
    const sw=width*scale, sh=height*scale;
    return [(w-sw)*x/100,(h-sh)*y/100,sw,sh];
  }
  function quantize(rgba, useRed, width=W, height=H) {
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>W||height>W||width*height>W*H)throw Error('Invalid pixel dimensions');
    if (rgba.length!==width*height*4) throw Error('Invalid pixel dimensions');
    const rgb=new Float32Array(width*height*3), codes=new Uint8Array(width*height);
    for(let i=0;i<codes.length;i++) {
      const a=rgba[i*4+3]/255;
      for(let c=0;c<3;c++) rgb[i*3+c]=rgba[i*4+c]*a+255*(1-a);
    }
    for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
      const i=y*width+x;
      let best=0,dist=Infinity;
      for(let p=0;p<(useRed?3:2);p++) {
        let d=0;
        for(let c=0;c<3;c++) d+=(rgb[i*3+c]-palette[p][c])**2;
        if(d<dist){dist=d;best=p;}
      }
      codes[i]=best;
      for(let c=0;c<3;c++) {
        const e=rgb[i*3+c]-palette[best][c];
        if(x+1<width) rgb[(i+1)*3+c]+=e*7/16;
        if(y+1<height) {
          if(x>0) rgb[(i+width-1)*3+c]+=e*3/16;
          rgb[(i+width)*3+c]+=e*5/16;
          if(x+1<width) rgb[(i+width+1)*3+c]+=e/16;
        }
      }
    }
    return codes;
  }
  function crc32(bytes) {
    let crc=0xffffffff;
    for(const b of bytes){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
    return (crc^0xffffffff)>>>0;
  }
  function encode(codes) {
    if(codes.length!==W*H)throw Error('Invalid image dimensions');
    const bytes=new Uint8Array(BYTES);
    for(let i=0;i<codes.length;i++) {
      if(!Number.isInteger(codes[i]) || codes[i]<0 || codes[i]>2)throw Error('Invalid palette code');
      bytes[i>>2]|=codes[i]<<(6-2*(i%4));
    }
    return 'TKI1:296:128:'+crc32(bytes).toString(16).padStart(8,'0')+'\n'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  }
  function decode(payload) {
    if(payload.length!==22+BYTES*2 || !/^TKI1:296:128:[0-9a-f]{8}\n[0-9a-f]+$/.test(payload))throw Error('Invalid header or length');
    const bytes=Uint8Array.from(payload.slice(22).match(/../g),s=>parseInt(s,16));
    if(crc32(bytes)!==parseInt(payload.slice(13,21),16))throw Error('Checksum mismatch');
    const codes=new Uint8Array(W*H);
    for(let i=0;i<codes.length;i++) {
      codes[i]=(bytes[i>>2]>>(6-2*(i%4)))&3;
      if(codes[i]===3)throw Error('Invalid palette code');
    }
    return codes;
  }
  function preview(codes) {
    if(codes.length!==W*H)throw Error('Invalid preview dimensions');
    const rgba=new Uint8ClampedArray(W*H*4);
    for(let i=0;i<codes.length;i++) {
      if(!palette[codes[i]])throw Error('Invalid palette code');
      rgba.set([...palette[codes[i]],255],i*4);
    }
    return rgba;
  }
  function checkFile(size, signature) {
    if(size<=0 || size>10*1024*1024)throw Error('Choose a JPEG/PNG up to 10 MiB.');
    const jpeg=signature[0]===255&&signature[1]===216&&signature[2]===255;
    const png=[137,80,78,71,13,10,26,10].every((b,i)=>signature[i]===b);
    if(!jpeg&&!png)throw Error('JPEG/PNG only. HEIC is not supported; choose a screenshot or export as JPEG.');
  }
  return {W,H,BYTES,crop,quantize,encode,decode,preview,crc32,checkFile};
})();
if(typeof module!=='undefined')module.exports=PhotoCodec;
