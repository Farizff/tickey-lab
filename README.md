# TICKEY Lab — Bluetooth text + photos (IMG1)

Independent learning prototype, not an official TICKEY app.

Open https://farizff.github.io/tickey-lab/ in Bluefy on iPhone. Requires the separate **epaper_ble_images** firmware, not the older BLE text sketch. Firmware is kept locally and uploaded by the hardware owner; this repository contains only the sender and tests.

1. Upload the matching sketch once. Disconnect nRF Connect.
2. Keep Bluefy foreground and the phone awake. Connect to TICKEY-BLE. Discovery lasts two minutes; reopen with serial `b` or reset while the panel is idle.
3. Select Photo for JPEG/PNG (10 MiB, 20 megapixels maximum), crop/zoom and palette; or Text for 1–18 printable ASCII characters in black or red. Text is centered on white and rendered into pixels on the phone. Existing epaper_ble_images firmware works unchanged: no new flash needed.
4. Send text/photo. Both use the full image transfer and shared busy lock. Wait for **FINISHED**, not merely 100%. Transfer duration and panel refresh duration are separate.
5. Send a second image without reflashing. If a transfer fails, disconnect/reconnect before retrying. No automatic retries or background/resumable transfers.

Photo preparation stays in the browser. No backend, analytics, third-party scripts, credentials or photo storage. GitHub hosts static files; image bytes go straight over BLE. Lab firmware has no authenticated pairing; nearby clients may connect while discoverable. No battery/NFC/OTA/Wi-Fi integration in this milestone.

## IMG1 wire protocol

Nordic UART service `6e400001-b5a3-f393-e0a9-e50e24dcca9e`; RX `...0002...` WRITE with response, TX `...0003...` READ (notifications optional, not used by this sender). Every write is at most 20 bytes. All integers are little endian; transfer IDs are nonzero random u32.

- BEGIN (17 bytes): opcode u8=1, id u32, width u16=296, height u16=128, palette u8=2 or 3, length u16=9472, CRC32 u32, version u8=1.
- DATA (8–20 bytes): opcode u8=2, id u32, byte offset u16, 1–13 payload bytes.
- COMMIT (5 bytes): opcode u8=3, id u32.
- ABORT (5 bytes): opcode u8=4, id u32. The UI cancels by disconnecting instead.

Packed row-major 2-bit pixels, most-significant pair first: white=0, black=1, red=2 (only palette3); code3 invalid. Standard reflected CRC32 polynomial 0xedb88320, initial/final xor 0xffffffff.

Sender waits for BEGIN acknowledgement and validates acknowledged offsets every 16 data frames plus final data frame. All GATT operations are serialized. Browser operations have an 8-second timeout; ACK wait 5 seconds; panel wait 45 seconds. Firmware discards partial transfer after 30 seconds without accepted data.

Status fits 20 bytes: `IMG1:READY`, `RECV:hhhhhhhh:offset`, `VERIFIED:hhhhhhhh`, `REFRESH:hhhhhhhh`, `DONE:hhhhhhhh:ms`, `ERR:hhhhhhhh:code`, `ABORT:hhhhhhhh`. IDs in status are lowercase hexadecimal. `VERIFIED` may be immediately replaced by `REFRESH` before a read; either proves commit accepted. Only matching-ID DONE reports completion. Panel duration is firmware-measured; transfer duration includes protocol acknowledgement overhead.

Strict order: duplicate/missing/out-of-order offsets discard partial transfer. Invalid size/palette/checksum/premature commit never schedules a refresh. Wrong IDs and competing BEGIN leave the owning buffer intact and return an error. Queued/refreshing buffers ignore all incoming writes and retain status, so new IDs cannot obtain BEGIN acknowledgement. Disconnect clears receiving/queued state; a physical refresh already in progress runs to completion. Rejected transfers do not touch the physical panel. A panel hardware fault blocks new updates until reset; physical partial refresh cannot be rolled back.

## Verification and limitations

`node --test app.test.cjs text.test.cjs` exercises binary sender, mocked GATT/UI, text validation/packing, palette conversion and failures. No mocked test proves radio/iPhone/panel behavior. Local companion firmware has native C++ receiver tests, JS-to-C++ byte-for-byte integration tests and Arduino compilation. Combined UI was exercised in desktop Chromium at mobile width with real canvas rendering/photo decoding and mocked send completion; no overflow, correct red-only text pixels, invalidation, busy locking and persistent errors were checked.

User previously verified multiple photo uploads and reconnects. **Combined text → photo → text and reconnect acceptance remain pending physical iPhone/ESP32 testing.** Interrupted-transfer recovery remains deferred, not passed. Earlier firmware sketches remain preserved locally and unchanged.
