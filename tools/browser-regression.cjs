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
 const persisted=await cdp('Runtime.evaluate',{expression:"(async()=>{const id=await DesignUI.save('Reload persistence test');return {id,state:JSON.stringify(DesignUI.snapshot().state),size:sourceBlob?.size};})()",awaitPromise:true,returnByValue:true},sessionId);
 if(persisted.exceptionDetails)throw Error(persisted.exceptionDetails.exception?.description);
 await cdp('Page.reload',{},sessionId);
 for(let i=0;i<100;i++){const r=await cdp('Runtime.evaluate',{expression:"document.readyState==='complete'&&typeof DesignUI!=='undefined'&&el('savedDesigns').options.length>0"},sessionId);if(r.result.value)break;await new Promise(r=>setTimeout(r,50));}
 const verify=await cdp('Runtime.evaluate',{expression:`(async()=>{const expected=${JSON.stringify(persisted.result.value)},row=await Designs.store('get',expected.id);if(!row||JSON.stringify(row.state)!==expected.state||row.photo?.size!==expected.size)throw Error('Reload lost editable data');await DesignUI.action(()=>DesignUI.restore(row));if(JSON.stringify(DesignUI.snapshot().state)!==expected.state||!sourceImage)throw Error('Reloaded record cannot restore');await Designs.store('delete',expected.id);if(await Designs.store('get',expected.id))throw Error('Cleanup failed');return true;})()`,awaitPromise:true,returnByValue:true},sessionId);
 if(verify.exceptionDetails)throw Error(verify.exceptionDetails.exception?.description);
 result.result.value.tests.push('IndexedDB survives actual page reload and restores editable original image');result.result.value.passed++;
 console.log(JSON.stringify(result.result.value,null,2));
 await cdp('Browser.close');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{if(ws)ws.close();if(browser)browser.kill();server.close();setTimeout(()=>{try{fs.rmSync(profile,{recursive:true,force:true});}catch{}},500).unref();});
