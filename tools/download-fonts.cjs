// Build-time vendoring only. The application never requests a font CDN.
const fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
 const root=path.join(__dirname,'..','fonts');await fs.mkdir(root,{recursive:true});
 for(const name of ['Abel','Lobster','Pacifico']){
  for(const file of [`${name}-Regular.ttf`,'OFL.txt']){
   const url=`https://raw.githubusercontent.com/google/fonts/main/ofl/${name.toLowerCase()}/${file}`;
   const response=await fetch(url);if(!response.ok)throw Error(`${response.status}: ${url}`);
   const data=Buffer.from(await response.arrayBuffer());
   if(file.endsWith('.ttf')&&data.readUInt32BE(0)!==0x00010000)throw Error('Invalid TTF');
   await fs.writeFile(path.join(root,file==='OFL.txt'?`${name}-OFL.txt`:file),data);
   console.log(`${name}/${file}: ${data.length} bytes`);
  }
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
