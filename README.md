# TICKEY Lab — BLE connection gate

Independent learning prototype; not an official TICKEY app.

Open the GitHub Pages site in Bluefy on iPhone. With the existing TICKEY-BLE Nordic UART lab firmware, connect, read status, and explicitly send `B:Hello Fariz!`. The command replaces the current panel content. No photo transfer is implemented yet.

No dependencies, telemetry, credentials, photos or firmware are included. GitHub serves static files; BLE commands go directly from browser to the selected device. Firmware pairing is not authenticated. Keep the test nearby and supervised.

## Verification

Run `node --test app.test.cjs`. Tests use mocked browser/BLE objects and do not prove iPhone or hardware compatibility. Physical acceptance requires the user to connect in Bluefy, read a status, send the command, observe the correct text, and read FINISHED after refresh.

Discovery in the existing firmware lasts two minutes; disconnect nRF Connect first and reopen discovery through Serial Monitor (`b`) or reset while the display is idle. No new sketch is required.
