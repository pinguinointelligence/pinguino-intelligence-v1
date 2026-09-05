# Samsung Chrome — Android 10 — Chrome 147.0 — chrome_tab

Bundle `20260904T082130Z_scan-baseline_samsung-chrome_20260904T081330Z.zip` · session 5e9e04ac-cdf6-444c-9d63-2cf2daaf8b39 · created 2026-09-04T08:13:30.848Z · exported 2026-09-04T08:21:25.799Z · harness scan-lab-baseline/0.1.0

## Device + camera
| item | value |
|---|---|
| screen / dpr / cores / memory | 412×869 / 2.625 / 8 / 8 GB |
| requested | 1920×1080 @ 30 (environment) |
| delivered | 1080×1920 @ 30 · camera 0, facing back · facing environment · open 711 ms · first frame 739 ms · autofocus not exposed · start sharpness — |
| form factor | unknown |
| cameras seen | camera 0, facing back r0; camera 2, facing back r1; camera 1, facing front r6; camera 3, facing front r6 |
| zoom | 1–8 · apply ok (1 → 2, 25 ms) |
| torch | exposed · apply ok (11 ms) |
| focusMode exposed | yes |
| worker | zxing-wasm 3.1.3 · warm-up 296 ms · OffscreenCanvas yes |
| loop (last scene) | video_frame_callback · presented 1800 · processed 324 · dropped(decode busy) 1185 · cadence p50/p95 33.4 / 66.8 ms · visibility events 0 |
| transfer | rgba_buffer · main→worker p50/p95 0.4 / 1.1 ms · reply p50/p95 0.6 / 4.6 ms · buffer reuse 324 / alloc 0 · round-trip minus worker-busy p50/p95 1.0/4.9 ms |
| main-thread capture→luma | 63.2 / 74.3 ms p50/p95 over 1612 processed frames |
| loop-60s frames | presented 1800 · surfaced 1509 (camera-side skipped 291) · processed 324 · dropped(busy) 1185 |
| client hints | Android 12.0.0 · model SM-N975F · Google Chrome 147.0.7727.49; Not.A/Brand 8.0.0.0; Chromium 147.0.7727.49 |
| camera auto-switch | re-opened on the ranked primary; first delivery was camera 2, facing back 1080×1920 |

## Scenes
| scene | kind | att | verdict | 1st hit ms | confirmed ms | hits/att | misread | fps p50 | cadence p50 | worker RT p50/p95 | localize p50/p95 | full_cheap p50/p95 (hits) | full_harder p50/p95 (hits) | roi p50/p95 (hits) | rect p50/p95 (hits) | cand px / |°| | dropped |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ean-12cm | barcode | 1 | DECODED_CONFIRMED | 266 | 650 7622210669315 | 26/132 | 0 | 29.9 | 33.4 | 78.9 / 141.2 | 16.9 / 45.6 | 19.5 / 41.6 (0/53) | 41.7 / 97.8 (26/26) | 1.6 / 3.6 (0/53) | — | 367 / 88 | 74 % |
| ean-18cm | barcode | 1 | DECODED_CONFIRMED | 11 | 290 7622210669315 | 17/135 | 0 | 29.9 | 33.4 | 71.8 / 136.4 | 15.9 / 21.6 | 18.7 / 35.7 (0/54) | 38.1 / 94.0 (17/27) | 0.4 / 1.2 (0/54) | — | 121 / 89 | 72 % |
| ean-25cm | barcode | 1 | DECODED_CONFIRMED | 1665 | 2049 7622210669315 | 20/130 | 0 | 29.9 | 33.4 | 73.8 / 142.0 | 16.4 / 20.9 | 23.2 / 40.2 (0/52) | 42.4 / 97.4 (20/26) | 0.5 / 1.1 (0/52) | — | 218 / 89 | 73 % |
| ean-30cm | barcode | 1 | DECODED_CONFIRMED | 1862 | 2246 7622210669315 | 6/130 | 0 | 29.9 | 33.4 | 77.9 / 133.7 | 16.3 / 20.2 | 19.8 / 33.0 (0/52) | 39.2 / 120.1 (6/26) | 0.4 / 0.6 (0/52) | — | 169 / 90 | 73 % |
| ean-approach-40cm | barcode | 1 | DECODED_CONFIRMED | 16 | 316 7622210669315 | 29/168 | 0 | 29.8 | 33.6 | 73.3 / 111.8 | 16.1 / 19.3 | 21.7 / 34.5 (0/67) | 39.1 / 92.9 (29/34) | 0.3 / 3.2 (0/67) | — | 97 / 89 | 71 % |
| ean-curved-can | barcode | 1 | DECODED_CONFIRMED | 14 | 317 8411092731130 | 46/179 | 0 | 29.9 | 33.4 | 78.9 / 141.8 | 16.5 / 22.5 | 21.7 / 34.4 (0/51) | 38.9 / 93.8 (0/26) | 0.9 / 1.4 (0/51) | 2.7 / 11.2 (46/51) | 232 / 78 | 73 % |
| ean-enter-edge | barcode | 1 | DECODED_CONFIRMED | 8164 | 8352 7622210669315 | 7/144 | 0 | 29.9 | 33.5 | 73.3 / 103.0 | 16.4 / 23.2 | 19.1 / 35.9 (4/66) | 37.9 / 45.9 (0/31) | 0.2 / 4.0 (3/47) | — | 48 / 1 | 72 % |
| ean-glare | barcode | 1 | DECODED_CONFIRMED | 327 | 1381 8426617014032 | 53/132 | 0 | 29.9 | 33.4 | 82.8 / 135.8 | 17.2 / 21.5 | 22.7 / 36.8 (4/52) | 41.8 / 95.9 (18/23) | 0.9 / 1.8 (28/52) | 2.8 / 4.7 (3/5) | 223 / 4 | 73 % |
| ean-hand-motion | barcode | 1 | DECODED_CONFIRMED | 219 | 361 8426617014032 | 60/165 | 0 | 29.6 | 33.7 | 47.8 / 100.9 | 16.2 / 21.8 | 21.4 / 29.6 (25/71) | 39.6 / 87.6 (10/18) | 0.9 / 2.0 (24/71) | 2.0 / 3.6 (1/5) | 198 / 5 | 69 % |
| ean-human-digits | barcode | 1 | DECODED_CONFIRMED | 1796 | 3635 8410297112386 | 3/128 | 0 | 29.9 | 33.4 | 81.0 / 142.2 | 17.1 / 22.5 | 22.8 / 37.2 (0/51) | 41.4 / 98.4 (3/26) | 0.9 / 2.9 (0/51) | — | 175 / 1 | 73 % |
| ean-low-light | barcode | 1 | DECODED_CONFIRMED | 145 | 508 8426617014032 | 46/131 | 0 | 29.9 | 33.5 | 49.1 / 90.4 | 16.5 / 22.1 | 21.9 / 36.5 (24/59) | 39.5 / 46.4 (8/13) | 0.8 / 2.2 (14/59) | — | 220 / 1 | 68 % |
| ean-partial | barcode | 1 | NO_DECODE | — | — | 0/137 | 0 | 29.9 | 33.4 | 71.1 / 84.5 | 14.2 / 18.3 | 18.0 / 30.4 (0/55) | 37.3 / 45.3 (0/27) | 0.8 / 1.4 (0/55) | — | 263 / 1 | 71 % |
| ean-scratched | barcode | 1 | DECODED_CONFIRMED | 27 | 232 8480000105745 | 94/131 | 0 | 29.9 | 33.5 | 45.5 / 68.1 | 15.7 / 20.4 | 21.9 / 29.8 (60/64) | 37.7 / 40.2 (1/2) | 1.6 / 4.0 (32/64) | 7.6 / 7.6 (1/1) | 337 / 2 | 66 % |
| ean-small | barcode | 1 | DECODED_CONFIRMED | 209 | 509 40279787 | 28/140 | 0 | 29.9 | 33.5 | 73.1 / 98.3 | 15.4 / 20.8 | 20.3 / 32.5 (0/56) | 37.3 / 45.6 (28/28) | 0.6 / 1.0 (0/56) | — | 212 / 86 | 70 % |
| ean-small-bottle | barcode | 1 | DECODED_CONFIRMED | 31 | 361 8402001022845 | 25/128 | 0 | 29.9 | 33.5 | 85.8 / 140.3 | 17.2 / 22.3 | 21.2 / 38.3 (0/51) | 44.1 / 97.6 (25/26) | 1.3 / 2.8 (0/51) | — | 316 / 89 | 73 % |
| ean-two-codes | barcode | 1 | DECODED_CONFIRMED | 44 | 594 8411902004089 | 93/144 | 0 | 29.9 | 33.4 | 42.3 / 93.8 | 13.9 / 20.8 | 19.3 / 35.7 (45/67) | 40.5 / 45.9 (3/7) | 1.0 / 1.6 (44/67) | 2.1 / 3.2 (1/3) | 264 / 4 | 66 % |
| ean-yaw-30 | barcode | 1 | DECODED_CONFIRMED | 1127 | 1477 7622210669315 | 13/140 | 0 | 29.9 | 33.4 | 70.6 / 94.2 | 16.2 / 21.6 | 21.3 / 30.4 (0/56) | 38.0 / 43.3 (13/28) | 0.4 / 0.6 (0/56) | — | 98 / 89 | 70 % |
| ean-yaw-60 | barcode | 1 | DECODED_CONFIRMED | 21 | 951 7622210669315 | 25/143 | 0 | 29.6 | 33.8 | 70.8 / 91.5 | 16.1 / 22.8 | 18.7 / 32.4 (0/57) | 35.9 / 41.7 (25/29) | 0.4 / 0.7 (0/57) | — | 125 / 89 | 68 % |
| loop-60s | object | 1 | NOT_APPLICABLE | 171 | 525 8426617014032 | 257/734 | 0 | 29.9 | 33.4 | 80.9 / 189.0 | 23.5 / 31.2 | 44.2 / 54.0 (112/323) | 93.5 / 122.0 (79/86) | 1.2 / 12.6 (66/323) | 3.0 / 4.7 (0/2) | 168 / 1 | 79 % |
| obj-banana | object | 1 | NOT_APPLICABLE | — | — | 0/90 | 0 | 29.9 | 33.5 | 72.4 / 85.0 | 15.6 / 18.7 | 16.4 / 25.8 (0/59) | 37.8 / 44.0 (0/30) | 0.2 / 0.2 (0/1) | — | 37 / 8 | 70 % |
| obj-bottle | object | 1 | NOT_APPLICABLE | 4649 | 5439 8411902004089 | 8/98 | 0 | 29.9 | 33.4 | 153.2 / 208.2 | 23.0 / 33.5 | 44.1 / 63.0 (3/39) | 90.8 / 141.7 (3/17) | 1.6 / 6.2 (2/37) | 4.9 / 12.7 (0/5) | 222 / 87 | 80 % |
| obj-can | object | 1 | NOT_APPLICABLE | 4839 | 5676 8437019462024 | 7/99 | 0 | 29.9 | 33.5 | 106.0 / 179.9 | 20.1 / 31.1 | 39.2 / 47.7 (0/42) | 80.1 / 110.8 (7/21) | 0.5 / 1.4 (0/30) | 1.2 / 3.4 (0/6) | 130 / 85 | 78 % |
| obj-milk-carton | object | 1 | NOT_APPLICABLE | 192 | 415 8410297112386 | 7/114 | 0 | 29.9 | 33.4 | 100.1 / 178.2 | 19.2 / 24.2 | 35.6 / 46.3 (0/43) | 62.8 / 117.4 (5/21) | 0.6 / 1.3 (2/43) | 0.9 / 2.6 (0/7) | 120 / 9 | 77 % |
| obj-oreo | object | 1 | NOT_APPLICABLE | 3737 | 4055 7622201817794 | 8/144 | 0 | 29.9 | 33.5 | 78.2 / 147.6 | 16.5 / 20.0 | 23.1 / 34.7 (0/52) | 41.6 / 102.4 (6/26) | 0.4 / 2.1 (0/52) | 1.1 / 2.5 (2/14) | 123 / 74 | 72 % |

Events per scene: ean-12cm=53, ean-18cm=54, ean-25cm=52, ean-30cm=52, ean-approach-40cm=67, ean-curved-can=51, ean-enter-edge=66, ean-glare=52, ean-hand-motion=71, ean-human-digits=51, ean-low-light=59, ean-partial=55, ean-scratched=64, ean-small=56, ean-small-bottle=51, ean-two-codes=67, ean-yaw-30=56, ean-yaw-60=57, loop-60s=323, obj-banana=59, obj-bottle=39, obj-can=42, obj-milk-carton=43, obj-oreo=52

## Phase 0 GATES (decision package Phase 0 acceptance) — **NO-GO**
| gate | measured | result |
|---|---|---|
| locate+roi per-frame p95 ≤ 40 ms (pooled over barcode frames) | p50 17.0 / p95 22.7 ms (saliency p95 21.3 + roi p95 2.3, n=1015) | PASS |
| ≥ 15 fps PROCESSED sustained 60 s (loop-60s) | 5.4 fps processed (min second 4); camera presented 30.0 fps, rVFC callbacks 25.1/s (first 5 s 24.2 → last 5 s 25.2) | FAIL |
| CPU proxy ≤ 60 % of one core (worker duty + main-thread capture share) | worker 13 % localize + 38 % decode = 51 %; main-thread capture→luma 63.2/74.3 ms p50/p95 × 5.4 fps = 34 %; combined 85 % | FAIL |
| corpus ≥ 20 scenes × ≥ 3 s | 24 scenes ≥ 3 s (24 recorded, 100 frames stored) | PASS |

## Phase 1 headline targets measured on this corpus (diagnostic — NOT Phase 0 gates)
| target | measured | result |
|---|---|---|
| wrong codes = 0 (headline: CONFIRMED wrong values) | 0 confirmed wrong value(s); 0 MISREAD scene(s) vs declared 7622210669315 (P1 scenes only, 0 raw hit(s) differ); 8 raw single-frame read(s) contradicting the scene majority (ean-curved-can: 8411092731130×40 vs 0141200001098×6; ean-hand-motion: 8426617014032×59 vs 5130150516023×1; ean-small-bottle: 8402001022845×24 vs 8720181292095×1) | meets |
| EAN-13 completion 12–30 cm p50 ≤ 0.7 s / p95 ≤ 2.0 s (headline) | p50 650 ms / p95 2246 ms over 4 confirmed scene(s) | misses |
| two consecutive frames agreeing on a WRONG value (fast-lane hazard) | ean-curved-can: 0141200001098 at 5861 ms (frames 139/142) | misses |

Verdict counts (rescored on the Mac, declared code scoped to the P1 scenes): DECODED_CONFIRMED=17, NO_DECODE=1, NOT_APPLICABLE=6
