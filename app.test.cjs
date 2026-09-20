const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function setup({supported=true,legacy=false,fail=false}={}) {
  const nodes = Object.fromEntries(['connect','read','send','disconnect','status','log'].map(id=>[id,{textContent:'',disabled:false,addEventListener(e,f){this[e]=f;}}]));
  const writes=[]; let status='READY', options;
  const rx = {[legacy?'writeValue':'writeValueWithResponse']:async value=>{writes.push(new TextDecoder().decode(value)); if(fail) throw Error('write failed'); status='REFRESHING';}};
  const tx = {readValue:async()=>new TextEncoder().encode(status)};
  const device={addEventListener(e,f){this[e]=f;},gatt:{connected:false,async connect(){this.connected=true;return {getPrimaryService:async uuid=>{assert.equal(uuid,'6e400001-b5a3-f393-e0a9-e50e24dcca9e');return {getCharacteristic:async id=>id.startsWith('6e400002')?rx:tx};}};},disconnect(){this.connected=false;device.gattserverdisconnected();}}};
  vm.runInNewContext(fs.readFileSync(__dirname+'/app.js','utf8'),{document:{getElementById:id=>nodes[id]},window:{isSecureContext:true},navigator:{bluetooth:supported?{requestDevice:async opts=>{options=opts;return device;}}:undefined},TextEncoder,TextDecoder});
  return {nodes,writes,device,setStatus:s=>status=s,getOptions:()=>options};
}
test('unsupported browser is blocked with Bluefy guidance',()=>{const s=setup({supported:false});assert.equal(s.nodes.connect.disabled,true);assert.match(s.nodes.status.textContent,/Bluefy/);});
test('connection is read-only; explicit write sends exact command once and locks during refresh',async()=>{const s=setup();await s.nodes.connect.click();assert.equal(s.getOptions().filters[0].name,'TICKEY-BLE');assert.equal(s.writes.length,0);assert.match(s.nodes.status.textContent,/READY/);await s.nodes.send.click();assert.deepEqual(s.writes,['B:Hello Fariz!']);assert.equal(s.nodes.send.disabled,true);await s.nodes.read.click();assert.equal(s.nodes.send.disabled,true);s.setStatus('FINISHED');await s.nodes.read.click();assert.equal(s.nodes.send.disabled,false);s.nodes.disconnect.click();assert.equal(s.nodes.send.disabled,true);assert.equal(s.nodes.connect.disabled,false);});
test('legacy write API works without write-without-response',async()=>{const s=setup({legacy:true});await s.nodes.connect.click();await s.nodes.send.click();assert.deepEqual(s.writes,['B:Hello Fariz!']);});
test('uncertain failed write is not automatically retried',async()=>{const s=setup({fail:true});await s.nodes.connect.click();await s.nodes.send.click();assert.equal(s.writes.length,1);assert.match(s.nodes.status.textContent,/write failed/);assert.equal(s.nodes.send.disabled,true);await s.nodes.read.click();assert.equal(s.nodes.send.disabled,true);});
