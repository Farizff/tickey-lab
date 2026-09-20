'use strict';
const SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const RX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
const TX = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';
const el = id => document.getElementById(id);
let device = null, rx = null, tx = null, working = false, pendingRefresh = false;
const supported = !!(window.isSecureContext && navigator.bluetooth);
function report(message) {
  el('status').textContent = message;
  el('log').textContent = (message + '\n' + el('log').textContent).slice(0, 6000);
}
function update() {
  const connected = !!(device && device.gatt.connected && rx && tx);
  el('connect').disabled = !supported || working || connected;
  el('read').disabled = working || !connected;
  el('send').disabled = working || !connected || pendingRefresh;
  el('disconnect').disabled = working || !connected;
}
function clearConnection() {
  rx = tx = null;
  pendingRefresh = false;
  report('Disconnected. Reopen discovery if needed, then connect again.');
  update();
}
function observe(value) {
  const status = new TextDecoder().decode(value);
  // Do not release a pending write on an old READY/CONNECTED read.
  if (status === 'FINISHED' || status.startsWith('ERROR:')) pendingRefresh = false;
  if (status === 'REFRESHING' || status === 'BUSY:REJECTED') pendingRefresh = true;
  report('Device status: ' + status);
  update();
}
async function run(action) {
  if (working) return;
  working = true; update();
  try { await action(); }
  catch (error) { report('Error: ' + error.message + ' — read status or reconnect before retrying.'); }
  finally { working = false; update(); }
}
el('connect').addEventListener('click', () => run(async () => {
  report('Choose TICKEY-BLE in the Bluetooth picker…');
  try {
    device = await navigator.bluetooth.requestDevice({filters: [{name: 'TICKEY-BLE'}], optionalServices: [SERVICE]});
    device.addEventListener('gattserverdisconnected', clearConnection);
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(SERVICE);
    rx = await service.getCharacteristic(RX);
    tx = await service.getCharacteristic(TX);
    observe(await tx.readValue());
  } catch (error) {
    if (device && device.gatt.connected) device.gatt.disconnect();
    rx = tx = null;
    throw error;
  }
}));
el('read').addEventListener('click', () => run(async () => observe(await tx.readValue())));
el('send').addEventListener('click', () => run(async () => {
  pendingRefresh = true;
  const bytes = new TextEncoder().encode('B:Hello Fariz!');
  // Write with response, matching the firmware's WRITE-only RX property.
  if (typeof rx.writeValueWithResponse === 'function') await rx.writeValueWithResponse(bytes);
  else await rx.writeValue(bytes); // Older Web Bluetooth implementations.
  report('Command written. Wait for the panel to finish, then tap Read device status.');
}));
el('disconnect').addEventListener('click', () => device.gatt.disconnect());
if (!supported) report('Web Bluetooth unavailable. Open this HTTPS page in Bluefy and allow Bluetooth access.');
update();
