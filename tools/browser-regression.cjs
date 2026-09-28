// Dependency-free real Edge/Chromium regression runner. Isolated temporary profile.
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),profile=fs.mkdtempSync(path.join(os.tmpdir(),'tickey-test-'));
const mime={'.html':'text/html','.js':'text/javascript','.ttf':'font/ttf'};
const server=http.createServer((req,res)=>{const p=path.join(root,decodeURIComponent(new URL(req.url,'http://local').pathname==='/'?'/index.html':new URL(req.url,'http://local').pathname));if(!p.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(p,(e,b)=>{if(e)res.writeHead(404).end();else{res.setHeader('Content-Type',mime[path.extname(p)]||'application/octet-stream');res.end(b);}});});
let browser,ws;
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=spawn(process.env.TICKEY_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});
 const url=await new Promise((resolve,reject)=>{let s='';const timer=setTimeout(()=>reject(Error('Browser startup timeout')),20000);browser.on('error',reject);browser.stderr.on('data',b=>{s+=b;const m=s.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m){clearTimeout(timer);resolve(m[1]);}});});
 ws=new WebSocket(url);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let next=0;const pending=new Map();
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p.reject(Error(JSON.stringify(m.error)));else p.resolve(m.result);}};
 function cdp(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,sessionId}));});}
 const {targetId}=await cdp('Target.createTarget',{url:'about:blank'}),{sessionId}=await cdp('Target.attachToTarget',{targetId,flatten:true});
 await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},sessionId);
 await cdp('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`},sessionId);
 for(let i=0;i<100;i++){const r=await cdp('Runtime.evaluate',{expression:"document.readyState==='complete'&&typeof RichText!=='undefined'"},sessionId);if(r.result.value)break;await new Promise(r=>setTimeout(r,50));}
 const result=await cdp('Runtime.evaluate',{expression:"(async()=>await (0,eval)(await (await fetch('browser-tests.js')).text()))()",awaitPromise:true,returnByValue:true},sessionId);
 if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||JSON.stringify(result.exceptionDetails));
 console.log(JSON.stringify(result.result.value,null,2));
 await cdp('Browser.close');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{if(ws)ws.close();if(browser)browser.kill();server.close();setTimeout(()=>{try{fs.rmSync(profile,{recursive:true,force:true});}catch{}},500).unref();});
