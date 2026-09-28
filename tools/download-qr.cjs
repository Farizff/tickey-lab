// Build-time only. Pin upstream releases; retain their MIT licenses.
const fs=require('node:fs/promises'),path=require('node:path');
(async()=>{for(const [url,file] of [
 ['https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js','vendor/qrcode.js'],
 ['https://raw.githubusercontent.com/kazuhikoarase/qrcode-generator/master/LICENSE','vendor/qrcode-LICENSE.txt'],
 ['https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js','tests/vendor/jsQR.js'],
 ['https://cdn.jsdelivr.net/npm/jsqr@1.4.0/LICENSE','tests/vendor/jsQR-LICENSE.txt']
]){const r=await fetch(url);if(!r.ok)throw Error(`${r.status} ${url}`);const p=path.join(__dirname,'..',file);await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,await r.text());console.log(file);}})().catch(e=>{console.error(e);process.exitCode=1;});
