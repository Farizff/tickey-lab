# TICKEY Lab — Bluetooth text + photos (IMG1)

Independent learning prototype, not an official TICKEY app.

Open https://farizff.github.io/tickey-lab/ in Bluefy on iPhone. Requires the separate **epaper_ble_images** firmware, not the older BLE text sketch. Firmware is kept locally and uploaded by the hardware owner; this repository contains only the sender and tests.

1. Upload the matching sketch once. Disconnect nRF Connect.
2. Keep Bluefy foreground and the phone awake. Connect to TICKEY-BLE. Discovery lasts two minutes; reopen with serial `b` or reset while the panel is idle.
3. Select Photo for JPEG/PNG (10 MiB, 20 megapixels maximum), crop/zoom and palette; or Text for multiline messages (2000-character input cap; actual capacity depends on screen space). Select a text range before changing font, preset size (8–48px dropdown), black/white/red colour or bold/italic/underline/strikethrough. Selection survives toolbar focus. With no selection, a formatting change affects the whole message; inserted/pasted plain text uses the toolbar style. Existing surrounding styles survive edits. Background and left/centre/right alignment are global. Invisible text or overflow blocks sending. Live pixel preview is reconstructed from the packed payload, shown in upright reading order.
   Text and photo each have independent 0/90/180/270 orientation controls relative to the corrected upright view. Both apply 180° compensation for the reported upside-down physical landscape. Portrait text reflows and photos crop at 128×296 without stretching; transport stays 296×128 / 9472 bytes. Preview is inverse-mapped from packed transmitted pixels. Existing epaper_ble_images firmware works unchanged: no reflash needed.
   Optional text auto-fit is **off by default**. It shrinks only overflowing text, proportionally reducing original mixed sizes with integer rounding and an 8px floor. Original styles are never overwritten, so disabling it or freeing space restores manual sizes. Effective sizing is shown; impossible overflow and invisible text still block Send.
   QR mode accepts text or links locally, with UTF-8 byte encoding, M error correction, black on white and a four-module quiet border. Integer module scaling is at least 2px; dense content is rejected. No smoothing, dithering, remote QR service or link navigation. Encoder: bundled qrcode-generator 1.4.4 by Kazuhiko Arase (MIT, `vendor/`). Test-only independent decoder: jsQR 1.4.0 (MIT, `tests/vendor/`). Scan both preview and physical output before relying on it.
   Three bundled fonts (Abel, Lobster, Pacifico) supplement system sans-serif/serif/monospace. Each TTF and its SIL Open Font License are in `fonts/`; runtime loading is same-origin, never CDN. Bold/italic are browser-synthesized for bundled regular faces. Font loading invalidates Send immediately, rejects unavailable fonts visibly, and ignores stale completions after edits/mode changes. System fonts and unsupported-glyph fallback vary by phone; Unicode/emoji coverage is not guaranteed.
4. Send text/photo/QR. All use the unchanged full image transfer and shared busy lock. Wait for **FINISHED**, not merely 100%. Transfer duration and panel refresh duration are separate.
5. Send a second image without reflashing. If a transfer fails, disconnect/reconnect before retrying. No automatic retries or background/resumable transfers.

Photo preparation stays in the browser. No backend, analytics, third-party scripts, credentials or photo storage. GitHub hosts static files; image bytes go straight over BLE. Lab firmware has no authenticated pairing; nearby clients may connect while discoverable. No battery/NFC/OTA/Wi-Fi integration in this milestone.

## IMG1 wire protocol

Nordic UART service `6e400001-b5a3-f393-e0a9-e50e24dcca9e`; RX `...0002...` WRITE with response, TX `...0003...` READ (notifications optional, not used by this sender). Every legacy-mode write is at most 20 bytes (optional FAST1 extension below). All integers are little endian; transfer IDs are nonzero random u32.

- BEGIN (17 bytes): opcode u8=1, id u32, width u16=296, height u16=128, palette u8=2 or 3, length u16=9472, CRC32 u32, version u8=1.
- DATA (8–20 bytes): opcode u8=2, id u32, byte offset u16, 1–13 payload bytes.
- COMMIT (5 bytes): opcode u8=3, id u32.
- ABORT (5 bytes): opcode u8=4, id u32. The UI cancels by disconnecting instead.

Packed row-major 2-bit pixels, most-significant pair first: white=0, black=1, red=2 (only palette3); code3 invalid. Standard reflected CRC32 polynomial 0xedb88320, initial/final xor 0xffffffff.

Sender waits for BEGIN acknowledgement and validates acknowledged offsets every 16 data frames plus final data frame. All GATT operations are serialized. Browser operations have an 8-second timeout; ACK wait 5 seconds; panel wait 45 seconds. Firmware discards partial transfer after 30 seconds without accepted data.

Status fits 20 bytes: `IMG1:READY`, `RECV:hhhhhhhh:offset`, `VERIFIED:hhhhhhhh`, `REFRESH:hhhhhhhh`, `DONE:hhhhhhhh:ms`, `ERR:hhhhhhhh:code`, `ABORT:hhhhhhhh`. IDs in status are lowercase hexadecimal. `VERIFIED` may be immediately replaced by `REFRESH` before a read; either proves commit accepted. Only matching-ID DONE reports completion. Panel duration is firmware-measured; transfer duration includes protocol acknowledgement overhead.

Strict order: duplicate/missing/out-of-order offsets discard partial transfer. Invalid size/palette/checksum/premature commit never schedules a refresh. Wrong IDs and competing BEGIN leave the owning buffer intact and return an error. Queued/refreshing buffers ignore all incoming writes and retain status, so new IDs cannot obtain BEGIN acknowledgement. Disconnect clears receiving/queued state; a physical refresh already in progress runs to completion. Rejected transfers do not touch the physical panel. A panel hardware fault blocks new updates until reset; physical partial refresh cannot be rolled back.

## Optional FAST1 prototype

The existing `epaper_ble_images` sketch still works, using 20-byte writes. The separate, manually installed `epaper_ble_fast` sketch advertises read-only characteristic `6e400004-b5a3-f393-e0a9-e50e24dcca9e` with exact value `FAST1:180`. Before each image the sender writes a non-image 180-byte probe: opcode 5, transfer ID u32 LE, then byte `i ^ idByte[i % 4]` for indices 5–179 (idByte starts at frame offset 1). Only matching `PROBE:hhhhhhhh:180` enables 180-byte frames (173 image bytes each). BEGIN/COMMIT, CRC, IDs, palette, refresh and timeout rules are unchanged. The receiver also accepts legacy DATA without a probe, preserving old-page compatibility.

Absent/unknown capability uses legacy mode. Explicit probe-size rejection, `ERR:<id>:PROBE`, or missing/stale application probe ACK falls back before BEGIN. Operation timeouts, disconnects, network errors and other unexpected errors stop; no overlapping GATT retry or replay. Missing characteristic alone permits capability-discovery fallback. Fast mode is never remembered across reconnects. The page logs negotiated mode and reports it with separate transfer/panel timings. Transfer timing includes the probe, but not capability lookup. There is no measured phone/radio speed claim; panel refresh is unchanged.

## Verification and limitations

Build the native receivers from the local `epaper_ble_fast` directory (Windows Git Bash):

```sh
uv run --with ziglang python -m ziglang c++ -std=c++11 -I . tests/protocol_test.cpp -o tests/protocol_test.exe
uv run --with ziglang python -m ziglang c++ -std=c++11 tests/cross_test.cpp -o tests/cross_test.exe
./tests/protocol_test.exe
```

From the sender repository:

```sh
TICKEY_CROSS_EXE='C:/Users/fariz/AppData/Local/hermes/research/tickey/epaper_ble_fast/tests/cross_test.exe' node --test app.test.cjs text.test.cjs rich_text.test.cjs fast_ble.test.cjs features.test.cjs
```

Current local verification: **56 Node tests pass, none skipped.** The earlier native protocol suite recorded 47 checks; firmware was not rebuilt for these sender-only features. The integration test runs real JS sender output through the actual C++ receiver and compares every one of 9472 bytes in legacy and fast modes (731 and 58 total writes respectively, including protocol overhead/probe). The test fails rather than silently skipping if its receiver executable is absent. Tests cover accepted/refused/stale probes, capability failures, operation timeout/disconnect, no replay, CRC/ID/sequence/busy errors, selected style/edit preservation, graphemes, rotation mappings, portrait wrapping and font failures. No mocked test proves radio/iPhone/panel behavior.

Real Chromium regression: serve locally (`python -m http.server 8765 --bind 127.0.0.1`), open the page, then run `await (0,eval)(await (await fetch('browser-tests.js')).text())` in the browser console. Ten checks passed at a verified 390×844 viewport, including actual bundled TTF loading, exact pixel-to-payload comparison, all four orientations, selected styling across toolbar focus, plain paste, stale/rejected font loads, nine colour combinations, overflow, and real PNG decode after portrait text. Test fixtures do not communicate with hardware. `tools/download-fonts.cjs` is an optional build-time vendoring utility; downloaded binaries/licenses are already included and no build is required.

User previously verified multiple photo uploads and reconnects. **New selected formatting, native iPhone selection retention, font appearance and corrected physical orientation remain pending Bluefy/ESP32 confirmation.** Combined text → photo → text and reconnect acceptance also remain pending physical testing. Interrupted-transfer recovery remains deferred, not passed. Earlier firmware sketches remain preserved locally and unchanged.
