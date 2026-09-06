# D3 (canonical) — Samsung Galaxy Note10+ SM-N975F — Android 12 — Google Chrome 147 — 2026-09-04

Bundle `20260904T082130Z_scan-baseline_samsung-chrome_20260904T081330Z.zip` (24,736,248 B, 127 entries, CRC-verified), received 08:21:30 UTC via the collector. **Identity from client hints:** platform Android 12.0.0, model **SM-N975F**, brands Google Chrome 147.0.7727.49 / Chromium 147 (the reduced UA still says "Android 10; K"). Mode `chrome_tab`. Build `BaselinePage-Dmjgg1sL` (same as D1). Table: `results/20260904T082130Z_scan-baseline_samsung-chrome_20260904T081330Z.md`. Supersedes the Samsung Internet run of 07:21 as the canonical D3; that run stays on record as hardware evidence.

## Coverage
24 scenes (obj-apple + one skipped), 250.7 s, 100 JPEGs, **declared code 7622210669315**. Session 5e9e04ac…, 08:13:30Z → 08:21:25Z.

## Camera
- Requested 1920×1080 @30 → **1080×1920 @30**, `crop-and-scale`. `facingMode: environment` first delivered **camera 2 (the fixed-focus ultra-wide)**; the harness re-opened on **camera 0** (main, 4032-px sensor, focusMode [manual, single-shot, continuous]) — the auto-switch shipped after the first run did its job. Open 711 ms, first frame 739 ms. **Zoom 1–8 ok (25 ms), torch ok (11 ms)**, focusMode exposed. 4 cameras enumerated.

## Loop / pipeline (60 s scene)
Camera 30 fps (1800 presented), rVFC 25.1/s, **291 camera frames never surfaced**, **processed 324 = 5.4 fps** (min second 4), 1185 dropped busy. Worker (throttled regime, see below): saliency 23 ms, full_cheap 44 ms, harder 94 ms, ROI 1 ms; duty 13 % + 38 % = 51 %. **Main-thread capture→luma 63.2 / 74.3 ms** ≈ 34 % → combined 85 %. Transfer main→worker 0.4 ms, reply 0.6 ms (epoch timers valid), buffers reused 324 / 0.

**Thermal:** cheap decode held 18–23 ms and saliency 16 ms for the first ~5.5 min, then doubled from obj-milk-carton onward (36 → 44 ms, saliency 20 → 23) through the 60 s loop; main-thread capture was 60–65 ms throughout. Same pattern as the 07:21 run (which throttled at ~2 min).

## Decode evidence (rescored, declared code on the P1 scenes only)
- **17 of 18 barcode scenes DECODED_CONFIRMED**; ean-partial NO_DECODE (correct).
- P1 (Oreo 7622210669315): 12 cm 650 ms, 18 cm 290 ms, 25 cm 2049 ms, 30 cm 2246 ms, approach-40cm 316 ms, enter-edge 8352 ms, yaw-30 1477 ms, yaw-60 951 ms. Others: scratched 232 ms, low-light 508 ms (no torch), small EAN-8 509 ms, small bottle 361 ms, hand-motion 361 ms, can 317 ms, two-codes 594 ms (both products), glare 1381 ms, human-digits 3635 ms.
- At 12–30 cm every hit came from **full_harder** (e.g. 12 cm 26/26 harder vs 0/53 cheap, 0/53 ROI): on this camera's crop-and-scale frames the cheap pass and the ROI crop never read the code; tryHarder's denser scanlines did. Realme and both iPhones decoded the same distances with the cheap/ROI passes.
- **Wrong codes:** 0 MISREAD vs the declared code. Raw single-frame aliases: hand-motion `5130150516023` ×1, small bottle `8720181292095` ×1, yaw-60 ×2. **Curved can: `0141200001098` ×6, all from `rectified_cheap`** (lineCount 3–7), with consecutive-frame agreement at 5.7/5.9 s after the correct code (8411092731130 ×40) had confirmed at 317 ms — the homography-rectified crop of a cylinder manufactured a stable checksum-valid alias. Phase 1: rectified-variant reads must never confirm on their own.

## Phase 0 GATES — D3
| gate | measured | result | reason |
|---|---|---|---|
| locate + ROI decode ≤ 40 ms p95 | 17.0 / 22.7 ms p50/p95 (n=1015) | PASS | |
| ≥ 15 fps processed, 60 s | 5.4 fps, min second 4 | FAIL | worker ~80 ms/frame (throttled) + 63 ms main-thread capture at 2 MP |
| ≤ 60 % of one core | 51 % worker + 34 % main = 85 % | FAIL | 2 MP getImageData on the main thread |
| corpus ≥ 20 × ≥ 3 s | 24 scenes, 250.7 s | PASS | |

**D3 verdict as configured: NO-GO** on the processed-fps and CPU gates; decode quality on camera 0 is good (17/18). Phase 1 headline (diagnostic): completion 12–30 cm p50 650 ms / p95 2246 ms (misses p95 by 12 %), wrong codes 0 confirmed against ground truth but the can alias hazard above.

## Still missing on this device
A 720p-class pass (B10: the „Rozdzielczość analizy = 1280” selector, expected to cut capture and decode 2–3×), the ImageBitmap / VideoFrame transfer paths (B9), visibility/backgrounding (B8), obj-apple.
