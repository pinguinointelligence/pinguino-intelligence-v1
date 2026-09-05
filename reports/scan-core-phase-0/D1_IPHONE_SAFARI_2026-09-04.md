# D1 — iPhone 15 Pro Max — iOS 26.6.1 — Safari tab — real-device run 2026-09-04

Bundle `20260904T081208Z_scan-baseline_iphone-safari_20260904T080104Z.zip` (45,114,790 B, 131 entries, CRC-verified), received 08:12:08 UTC via the collector. UA `Version/26.6.1 … Safari/604.1`, no CriOS → **Safari tab, `safari_tab`** (the UA's "iPhone OS 18_7" is WebKit's frozen platform token). Build `BaselinePage-Dmjgg1sL` (auto primary-camera switch, epoch timers, scene picker). Table: `results/20260904T081208Z_scan-baseline_iphone-safari_20260904T080104Z.md`.

## Coverage
24 scenes (obj-apple and obj-oreo not recorded — oreo attempt 2 empty), 250.1 s, 104 JPEGs. **Declared code typed: 7622210669315** (P1). Session 6ed800b9…, 08:01:04Z → 08:10:41Z.

## Camera
- Requested 1920×1080 @30 → **1080×1920 @30**. `facingMode: environment` first delivered „Tylny aparat trójobiektywowy”; the harness re-opened on the ranked primary **„Tylny aparat”** (single wide). Open 139 ms, first frame 436 ms (Chrome iOS: 1.9 s / 2.2 s). Zoom 1–10 ok (3 ms), **torch ok** (55 ms), focusMode not exposed. Seven cameras enumerated (Polish labels).
- **The single wide lens cannot focus below ~20 cm:** 12 cm frames were blur (Laplacian 301 vs 1509 at 25 cm; saliency found only 31-px slivers), 18 cm soft (1106) — **0 reads in 452 + 570 attempts**. The I1 run on the virtual Triple camera decoded 12 cm (3.9 s) and 18 cm (118 ms) because it auto-switches to the ultra-wide macro. Harness ranking corrected (virtual multi-lens first on iOS), committed, **not deployed until D2 is in** so D1 and D2 share one build.

## Loop / pipeline (60 s scene, native 2 MP)
Camera 30 fps (1799 presented, 3 skipped), rVFC 29.9/s. **Processed 24.8 fps** (min second 15), 310 dropped busy. Worker saliency 4 ms, full_cheap 3–4 ms, harder 11–14 ms, ROI ≤ 1 ms; duty 11 % + 12 % = 23 %; main-thread capture 14 / 19 ms ≈ 35 % → combined 57 %. Transfer 0–1 ms, buffers reused 1486 / 0 allocations.

## Decode evidence (rescored on the Mac; declared code applied to the P1 scenes only)
- **15 of 18 barcode scenes DECODED_CONFIRMED; 3 NO_DECODE: 12 cm, 18 cm (focus, above) and partial (correct).**
- P1 scenes: 25 cm 117 ms, 30 cm 292 ms, approach-40cm 3608 ms, enter-edge 2558 ms, yaw-30 7507 ms (2 hits only), yaw-60 4858 ms. Other products: two-codes 138 ms, small bottle 194 ms, glare 213 ms, can 292 ms, low-light 358 ms (no torch), hand-motion 439 ms, small EAN-8 807 ms, human-digits 3257 ms, scratched 7158 ms.
- Objects: milk carton 192 ms, bottle 4983 ms, can 6074 ms (codes visible on the packaging); banana none.
- **Wrong codes:** 0 confirmed against the declared code (0 MISREAD scenes). Raw single-frame misreads: 19, almost all in approach-40cm — at 40 cm the code is ~2 px/module and zxing produced **eight different checksum-valid wrong values** (1608180669315, 2627210669315, 4622180660315 …). **At frames 118/121 (100 ms apart) two consecutive frames agreed on the wrong value 1608180669315** — after the scene had already confirmed the right code at 3608 ms, but a live fast lane of "two agreeing decodes" would have accepted it had the scene not completed. Phase 1 input: gate the fast lane on module size / lineCount, or require three agreeing frames for small candidates.

## Phase 0 GATES — D1
| gate | measured | result |
|---|---|---|
| locate + ROI decode ≤ 40 ms p95 | 4 / 5 ms p50/p95 (n=3288) | PASS |
| ≥ 15 fps processed, 60 s | 24.8 fps, min second 15 | PASS |
| ≤ 60 % of one core | 23 % worker + 35 % main = 57 % | PASS |
| corpus ≥ 20 scenes × ≥ 3 s | 24 scenes, 250 s | PASS |

**D1 verdict: GO.**

## Phase 1 headline targets on this corpus (diagnostic, not gates)
completion 12–30 cm: p50 117 ms / p95 292 ms over the two confirmed distances, but **12 cm and 18 cm never confirmed → misses**; wrong codes: 0 confirmed, one consecutive wrong agreement observed at 40 cm → **misses**.
