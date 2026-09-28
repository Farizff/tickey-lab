// Local QR encoder: Kazuhiko Arase qrcode-generator 1.4.4 (MIT).
const QRCodec=(()=>{
  const encoder=typeof module!=='undefined'?require('./vendor/qrcode.js'):qrcode;
  // Byte mode must encode Unicode as UTF-8, not truncate UTF-16 code units.
  encoder.stringToBytes=s=>Array.from(new TextEncoder().encode(s));
  function render(text){
    if(typeof text!=='string'||!text.trim())throw Error('Enter QR text or a link.');
    if(text.length>2000)throw Error('QR content is too long. Shorten the text or link.');
    // Version 9 is the largest fitting the 128px edge with quiet zone and >=2px modules.
    let qr=null;
    for(let version=1;version<=9;version++){
      const candidate=encoder(version,'M');candidate.addData(text,'Byte');
      try{candidate.make();qr=candidate;break;}catch(error){if(!String(error).includes('code length overflow'))throw error;}
    }
    if(!qr)throw Error('QR is too dense for this display. Shorten the text or link (minimum 2 pixels per module).');
    const modules=qr.getModuleCount(),scale=Math.floor(128/(modules+8));
    if(scale<2)throw Error('QR is too dense for this display.');
    const codes=new Uint8Array(296*128),size=(modules+8)*scale,left=Math.floor((296-size)/2),top=Math.floor((128-size)/2);
    for(let y=0;y<modules;y++)for(let x=0;x<modules;x++)if(qr.isDark(y,x)){
      for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++)codes[(top+(y+4)*scale+dy)*296+left+(x+4)*scale+dx]=1;
    }
    return {codes,modules,scale,left,top,size};
  }
  return {render};
})();
if(typeof module!=='undefined')module.exports=QRCodec;
