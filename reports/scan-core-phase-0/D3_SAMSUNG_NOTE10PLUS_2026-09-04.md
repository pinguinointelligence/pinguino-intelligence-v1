# D3 — Samsung Galaxy Note10+ (SM-N975F/DS) — real-device run 2026-09-04

Bundle `20260904T072106Z_scan-baseline_galaxy-note-10_20260904T065146Z.zip` (25,829,533 B, 122 entries, CRC-verified), received 07:21:06 UTC through the tunnel collector after the tester pressed „Wyślij na komputer (tunel)”. Parsed table: `results/20260904T072106Z_scan-baseline_galaxy-note-10_20260904T065146Z.md`.

## Identity (from the bundle, not from the brief)
- Tester label „Galaxy Note 10+”. User agent `Android 10; K … SamsungBrowser/30.0 Chrome/143` → **Samsung Internet 30 (Chromium 143)**, not Android Chrome. Real Android version and model are not in the bundle (Chromium reduced UA); client hints are collected from the next build on.
- Session 3e99e282…, created 06:51:46Z, exported 07:20:59Z, 12.2 min span; harness scan-lab-baseline/0.1.0.

## Coverage
- 25 of 26 scenes (obj-apple skipped), 19 barcode + 6 object (incl. loop-60s); 258.5 s recorded; 94 JPEG frames; retries on approach-40cm, enter-edge, two-codes, small (attempt 2).
- No declared code typed → wrong-code accounting relies on cross-frame consistency only.

## Camera
- Requested 1920×1080 @30 ideal, facingMode environment → delivered **1080×1920 @30 portrait**, „camera 2, facing back”, `resizeMode: crop-and-scale`, open 430 ms, first frame 464 ms.
- Capabilities: width ≤ 4608 / height ≤ 3456 (**16 MP sensor = the Note10+ ultra-wide**; main is 12 MP), frameRate ≤ 60, zoom 1–8 (apply 1→2 OK, 24 ms), **focusMode [manual] only** while settings claimed „continuous”, exposure/WB [continuous, manual], **no torch**. Enumerated: camera 0 back (ranked primary, unused), camera 2 back (delivered), cameras 1/3 front.
- Consequence: candidate widths at 12–30 cm were 122–205 px of 1080 (fill 11–19 %), module ≈ 1.4–2.2 px → 12 cm and 30 cm never decoded, 18/25 cm one single-frame hit each.

## Loop / pipeline (60 s scene)
- Camera 30 fps sustained (1798 presented), rVFC callbacks 24.6/s, no decay (25.2 → 24.6). **Processed 4.7 fps flat** (282 frames; min second 4). 323 camera frames never surfaced (main thread busy), 1193 dropped while the worker was busy.
- Worker per frame: saliency 22 ms (360×640 plane), full_cheap 44 ms, full_harder 92 ms every 2nd miss, ROI decode 0.9 ms, rectified 3 ms → busy p50 117 ms. Duty 11 % localize + 43 % decode = 54 %.
- Main thread: getImageData + luminance on 1080×1920 = **67.6 / 85.6 ms p50/p95** per processed frame ≈ 32 % → combined CPU proxy ≈ 86 % of one core.
- Transfer: main→worker timer invalid (worker `performance.now()` has its own origin; fixed in the next build); round-trip minus worker-busy = 1.3 / 6.1 ms p50/p95 (transfer overhead is small).
- **Thermal/DVFS**: at ~117 s into the session every stage doubled (cheap 20→44 ms, saliency 17→23, harder 41→92) and stayed there for the remaining 10 min; frame size unchanged.

## Decode evidence
- Hits by variant over barcode scenes: full_cheap 1/802, full_harder 16/402, **roi_cheap 21/759**, rectified 0/294. ROI decode at 0.9 ms p50 found more than the 44 ms full-frame pass.
- Confirmed (two agreeing frames): human-digits 440 ms, yaw-30 1053 ms, hand-motion 1599 ms, scratched 2536 ms, low-light-torch 2930 ms (no torch); obj-oreo 4110 ms. Unconfirmed single hits: 18 cm, 25 cm, small, two-codes. NO_DECODE: 12 cm, 30 cm, approach-40cm, curved-can, enter-edge, glare, low-light, partial, small-bottle, yaw-60.
- Wrong codes: 0 confirmed. Raw single-frame reads contradicting the product (25 cm: 3410611014032, 2410612014032 vs confirmed 8426617014032 — checksum-valid aliasing) were rejected by the two-frame rule.
- False candidates on objects (frames with ≥1 candidate): banana 3/40, can 12/39, milk carton 21/37, bottle 31/37 (label text), Oreo 35/37 (barcode visible).

## Phase 0 criteria — D3
| criterion | measured | result | reason |
|---|---|---|---|
| locate + ROI decode ≤ 40 ms p95 | 23.4 / 33.4 ms p50/p95 pooled (n=589) | PASS | |
| 15 fps processed, 60 s | 4.7 fps flat | FAIL | 117 ms worker busy + 67 ms main-thread capture at 2 MP |
| ≤ 60 % of one core | worker 54 % + main 32 % = 86 % | FAIL | 2 MP capture on the main thread |
| corpus ≥ 20 × ≥ 3 s | 25 scenes, 258.5 s | PASS | |
| 0 wrong codes (headline) | 0 confirmed; 2 raw aliasing reads rejected | PASS | no declared code |
| completion 12–30 cm p50 ≤ 0.7 s / p95 ≤ 2 s (headline) | no confirmed 12–30 cm scene | FAIL | ultra-wide fixed-focus lens + 1.4–2.2 px modules |

**D3 verdict as configured: NO-GO.** Causes are configuration, not the phone: (1) `facingMode: environment` resolved to the fixed-focus ultra-wide; (2) 2 MP portrait analysis on the main thread; (3) saliency plane 4× the designed size. Harness changes shipped in the next build: auto re-open on the ranked primary back camera (first delivery kept on record), fixed-focus detection from capabilities, epoch-based cross-thread timers, client hints, „Rozdzielczość analizy” selector (native / 1280 / 960 / 640).

## Evidence that cannot be derived from this bundle
Real Android version + model (reduced UA), main→worker transfer time (clock origins), ImageBitmap / VideoFrame transfer paths (default path only), torch on camera 0, obj-apple, a 720p-class pass (B10).
