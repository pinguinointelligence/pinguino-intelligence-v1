# R1 — Realme (model not typed) — Android Chrome 142 — real-device run 2026-09-04

Extra device class, outside the D1–D3 list. Bundle `20260904T073624Z_scan-baseline_realme_20260904T072559Z.zip` (23,997,662 B, 117 entries, CRC-verified), received 07:36:24 UTC via the tunnel collector. Table: `results/20260904T073624Z_scan-baseline_realme_20260904T072559Z.md`. Ran the pre-fix build (no auto camera switch, no client hints, cross-clock transfer timer) — the camera choice was right anyway.

## Identity
- Tester label „Realme”; UA `Android 10; K … Chrome/142.0.0.0 Mobile Safari/537.36` → **Android Chrome 142** (real Chrome). Real Android version/model hidden by the reduced UA. 8 cores, 8 GB, 424×946 @2.55.
- Session 1a90aeff…, created 07:25:59Z, exported 07:35:50Z; 24 scenes (obj-apple and one more skipped), 250.4 s recorded, 90 JPEGs; no declared code.

## Camera
- Requested 1920×1080 @30 → delivered **1080×1920 @30**, „camera 0, facing back” (the main 12 MP sensor: capabilities 4096×3072), `resizeMode: none`, focusMode [manual, single-shot, continuous], zoom 1–10 (apply 1→2 ok, 97 ms), **torch exposed and works** (85 ms). **Camera open 4402 ms, first frame 4462 ms** (Note10+: 430 ms). Worker wasm warm-up 592 ms (Note10+: 24 ms).

## Time profile — the run has two regimes
| offset | regime | full_cheap p50 | saliency p50 | note |
|---|---|---|---|---|
| 0–170 s (12/18/25/30 cm, approach, edge, yaw, can, small bottle) | slow | 50–108 ms | 21–56 ms | p95 up to 255 / 170 ms |
| 183 s → end (glare … loop-60s) | fast | 24–31 ms | 11–18 ms | steady |
Opposite of the Note10+ (which was fast first, then throttled at ~117 s). Cause not in the bundle (background load after unlock, or cooling after prior use).

## Loop (60 s scene, fast regime)
Camera 30 fps (1801 presented), rVFC 27.3/s, 163 camera frames never surfaced, processed **394 = 6.6 fps** (min second 5), 1244 dropped while the worker was busy. Worker duty 12 % localize + 38 % decode = 50 %; main-thread capture→luma 43.0 / 70.3 ms p50/p95 ≈ 28 % → combined ≈ 79 %. Round-trip minus worker-busy 1.1 / 7.8 ms.

## Decode evidence
- 16 of 18 barcode scenes DECODED_CONFIRMED; ean-partial NO_DECODE (correct: half the code outside the frame); approach-40cm unconfirmed (2 hits, one an aliasing misread).
- 12–30 cm confirmed at 496 / 193 / 309 / 5474 ms (30 cm: only 2 hits in 52 attempts, small code); human-digits 187 ms, two-codes 183 ms (both products read: 8410297112386 ×67, 8411092731130 ×65), scratched 208 ms, yaw-30 218 ms, yaw-60 410 ms, glare 487 ms, small (EAN-8) 659 ms, hand-motion 1011 ms, low-light 1539 ms (no torch used), curved can 794 ms, small bottle 2653 ms, enter-edge 4918 ms (code entered late).
- Hits by variant (barcode scenes): full_cheap 341/…, full_harder strong on small/low-contrast codes (ean-small 26/30 harder vs 0/59 cheap), ROI decode 1.6/4.4 ms p50/p95.
- **Wrong codes: 0 confirmed.** Raw checksum-valid misreads: approach-40cm `2446292112386` (aliasing of 8410297112386), ean-small `40279121` ×2, loop-60s `8428617012032` ×1, obj-oreo `2127718788780` ×1, obj-bottle `2427947004089` vs `3458902004089` (1 each, unresolved). In ean-small both wrong reads came **from the same frames as the correct read** (frames 140 and 205: zxing returned two symbols, one right, one wrong, `maxNumberOfSymbols: 4`). The two-frame rule rejected all of them; a rule that confirmed on two results from one frame would have confirmed a wrong EAN-8.

## Phase 0 criteria — R1
| criterion | measured | result | reason |
|---|---|---|---|
| locate + ROI ≤ 40 ms p95 | whole run 18.5 / 79.6 ms; after 120 s 15.6 / 36.4 ms (n=557) | FAIL whole run / PASS steady state | slow first regime |
| 15 fps processed, 60 s | 6.6 fps | FAIL | worker ~50 ms/frame + 43 ms main-thread capture at 2 MP |
| ≤ 60 % of one core | 50 % + 28 % = 79 % | FAIL | 2 MP capture on the main thread |
| corpus ≥ 20 × ≥ 3 s | 24 scenes, 250 s | PASS | |
| 0 wrong codes (headline) | 0 confirmed; 5 raw single-frame misreads rejected | PASS | no declared code |
| completion 12–30 cm p50 ≤ 0.7 s / p95 ≤ 2 s (headline) | p50 309 ms / p95 5474 ms (4 scenes) | p50 PASS, p95 FAIL | 30 cm scene |

**R1 verdict as configured: NO-GO** on processed fps and CPU proxy; decode quality on the main camera is strong (16/18 confirmed, sub-second at 12–25 cm).
