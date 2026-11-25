# Repository Guidelines

## Project Overview

USB picture badge for the Waveshare ESP32-S3-Touch-AMOLED-1.75C. Firmware owns storage, playback, and device controls. The static Web Serial console prepares images locally and talks directly to the badge; no backend, native bridge, or PWA.

## Architecture & Data Flow

- `src/main.cpp` boots the hardware, loads Preferences/NVS settings, and rebuilds the LittleFS catalog. Its cooperative `loop()` polls serial, touch/buttons, power, slideshow, gravity, and animation. Serial commands, native controls, and slideshow share the same playback path; playback continues without the browser.
- The console crops and encodes 466×466 JPEGs, then `BadgeSerial` sends them over USB CDC at 115200 baud. `PUT` uses `READY`, one `ACK` per 4096-byte chunk, and `OK <slot>`. Downloads use `DATA <length> <crc>`, exact bytes, a separator, and `OK`. Update both ends for wire changes, including status/catalog fields.
- Uploads validate CRC and JPEG decoding in `/upload.tmp` before renaming to `/slotN.jpg` and publishing the catalog. Slot IDs identify images, not catalog positions. LittleFS mounts without auto-format; v1 RGB565 images are not read by v2.

## Key Directories

- `src/`: Arduino runtime, hardware adapters, and host-testable C++ logic.
- `docs/`: Pages staging tree; `docs/console/` is the only console source. `web/index.html` is a legacy redirect. Production Pages requires reviewed sync to the separate hosting repository.
- `tests/`: host tests and embedded API substitutes in `tests/host_stubs/`. `vendor/waveshare/` is an ignored upstream checkout; `backups/` and `verification/` are local artifacts, not fixtures.

## Development Commands

- Build: `pio run -e picture-badge` → `.pio/build/picture-badge/firmware.bin`; follow `README.md` for first-time vendor setup.
- Preview: `python3 -m http.server 8000 --bind 127.0.0.1 --directory docs`, then open `http://localhost:8000/console/`. Use localhost or HTTPS for Web Serial.
- Test: use the host commands below. No repository lint/format command or aggregate test runner is configured.
- Flash only with authorization. Existing devices: write only APP at `0x10000`, max `0x300000` bytes; there is no OTA rollback. Full `upload` and `uploadfs` are blank-device initialization only; never erase or format to troubleshoot.

## Code Conventions & Common Patterns

- Match nearby C++ style (`camelCase`, `kConstant`, two-space indentation). Keep hardware orchestration in `main.cpp`, deterministic logic in focused helpers, and dependencies explicit through arguments or callbacks. Firmware command helpers return `nullptr` on success or a short error code for `ERR`; keep debug output off the protocol stream.
- Preserve stage/commit boundaries: advance playback and promote the front frame only on success. Reuse PSRAM RGB565 buffers; render outputs cannot alias sources. Keep interrupts minimal and preserve panel TE timing and input-idle gating for PMIC shutdown. USB/unknown-power screen-off keeps serial online; battery shutdown is not ESP32 deep sleep.
- In the console, queue async serial transactions through `BadgeSerial.run()` and retain deadlines and stream cleanup on disconnect. Keep user-facing console strings in Chinese and the port picker/firmware flash user-initiated.

## Important Files

- `src/jpeg_image.h` and `src/jpeg_decoder.h`: stored-image integrity and ESP32-S3 ROM JPEG decoding.
- `src/picture_player.h`, `src/picture_animation.h`, and `src/animation_renderer.cpp`: selection/history, PSRAM frame lifecycle, and pixel transforms.
- `docs/console/index.html`: UI and application serial protocol. `docs/console/firmware_update.mjs`: separate ROM-mode updater validation and APP-only write options; keep bounds aligned with `partitions.csv`.
- `platformio.ini`: board/build settings. `.github/workflows/release-firmware.yml`: stable-tag builds and release assets, not PR tests or Pages deployment.

## Runtime/Tooling Preferences

Use Python/PlatformIO Core with the pinned pioarduino `55.03.312-1` platform and Waveshare revision in `README.md`. Releases use PlatformIO `6.2.0`. The console is native browser HTML/CSS/ES modules with no npm/Bun install or frontend build. Use Node for updater tests and a host C++ compiler for firmware logic tests.

## Testing & QA

C++ `tests/test_*.cpp` files use standalone `main()` and `assert`; don't build them with `NDEBUG`. Compile with `-Isrc` and add `-Itests/host_stubs` if needed. Link `src/animation_renderer.cpp` for renderer, gravity-motion, and animation-buffer tests.

```sh
g++ -std=c++17 -Isrc tests/test_animation_renderer.cpp src/animation_renderer.cpp -o /tmp/badge-renderer-test
/tmp/badge-renderer-test
node --test tests/test_firmware_update.mjs
```

Run the affected host tests and build firmware for firmware changes. No numeric coverage gate is configured. Host tests don't prove Web Serial, panel/touch timing, or PMIC behavior on hardware; report board/browser checks separately and don't flash as a routine test.
