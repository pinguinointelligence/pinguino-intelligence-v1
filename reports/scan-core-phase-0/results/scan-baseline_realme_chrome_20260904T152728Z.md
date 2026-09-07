# Realme  — Android 10 — Chrome 142.0 — chrome_tab

Bundle `scan-baseline_realme_chrome_20260904T152728Z.zip` · session ccb0b44f-3e69-44eb-bf31-a933d5eceb61 · created 2026-09-04T15:27:28.897Z · exported 2026-09-04T15:35:16.934Z · harness scan-lab-baseline/0.1.0+ed94869f · session name Chrome

## Device + camera
| item | value |
|---|---|
| screen / dpr / cores / memory | 424×946 / 2.549999952316284 / 8 / 8 GB |
| requested | 1920×1080 @ 30 (environment) |
| delivered | 1080×1920 @ 30 · camera 0, facing back · facing environment · open 1766 ms · first frame 1826 ms · autofocus yes · start sharpness 1508 / mean 72 |
| form factor | mobile |
| cameras seen | camera 0, facing back r0; camera 1, facing front r6 |
| zoom | 1–10 · apply ok (1 → 2, 29 ms) |
| torch | exposed · apply ok (31 ms) |
| focusMode exposed | yes |
| worker | zxing-wasm 3.1.3 · warm-up 1210 ms · OffscreenCanvas yes |
| loop (last scene) | video_frame_callback · presented 1781 · processed 379 · dropped(decode busy) 1154 · cadence p50/p95 33.4 / 66.8 ms · visibility events 0 |
| transfer | rgba_buffer · main→worker p50/p95 0.5 / 2.4 ms · reply p50/p95 0.5 / 4.0 ms · buffer reuse 379 / alloc 0 · round-trip minus worker-busy p50/p95 1.2/4.9 ms |
| main-thread capture→luma | 60.9 / 79.4 ms p50/p95 over 1738 processed frames |
| loop-60s frames | presented 1781 · surfaced 1533 (camera-side skipped 248) · processed 379 · dropped(busy) 1154 |
| client hints | Android 15.0.0 · model RMX3840 · Chromium 142.0.7444.159; Google Chrome 142.0.7444.159; Not_A Brand 99.0.0.0 |
| camera auto-switch | none |

## Scenes
| scene | kind | att | verdict | 1st hit ms | confirmed ms | hits/att | misread | fps p50 | cadence p50 | worker RT p50/p95 | localize p50/p95 | full_cheap p50/p95 (hits) | full_harder p50/p95 (hits) | roi p50/p95 (hits) | rect p50/p95 (hits) | cand px / |°| | dropped |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ean-12cm | barcode | 1 | DECODED_CONFIRMED | 30 | 389 7622201492786 | 116/132 | 0 | 29.9 | 33.4 | 50.8 / 115.7 | 15.3 / 40.4 | 27.7 / 42.2 (56/65) | 38.5 / 52.7 (0/2) | 3.0 / 5.7 (60/65) | — | 313 / 4 | 71 % |
| ean-18cm | barcode | 1 | DECODED_CONFIRMED | 31 | 177 7622201492786 | 60/128 | 0 | 29.9 | 33.4 | 56.4 / 108.6 | 17.2 / 25.7 | 29.4 / 41.0 (28/59) | 43.8 / 55.3 (8/10) | 1.6 / 3.0 (24/59) | — | 133 / 3 | 72 % |
| ean-25cm | barcode | 1 | DECODED_CONFIRMED | 1787 | 1935 0602002492786 | 39/141 | 0 | 29.9 | 33.4 | 73.7 / 118.3 | 14.1 / 26.2 | 29.3 / 45.0 (7/58) | 42.3 / 55.1 (12/25) | 1.4 / 3.9 (20/58) | — | 217 / 3 | 73 % |
| ean-30cm | barcode | 1 | DECODED_CONFIRMED | 999 | 1288 7622201492786 | 13/130 | 0 | 20.0 | 50.0 | 82.0 / 115.9 | 16.5 / 28.9 | 30.4 / 42.4 (1/52) | 42.5 / 51.6 (10/26) | 1.7 / 4.4 (2/52) | — | 240 / 88 | 71 % |
| ean-approach-40cm | barcode | 1 | NO_DECODE | — | — | 0/166 | 0 | 29.9 | 33.5 | 78.5 / 121.8 | 16.4 / 24.3 | 31.1 / 42.4 (0/66) | 43.7 / 54.7 (0/33) | 0.9 / 4.4 (0/66) | 19.4 / 19.4 (0/1) | 99 / 88 | 71 % |
| ean-curved-can | barcode | 1 | DECODED_CONFIRMED | 153 | 359 8411092731130 | 15/130 | 0 | 29.9 | 33.4 | 77.1 / 114.3 | 16.7 / 24.8 | 28.6 / 42.9 (0/52) | 42.9 / 59.9 (15/26) | 1.1 / 2.6 (0/52) | — | 246 / 88 | 74 % |
| ean-enter-edge | barcode | 1 | NO_DECODE | — | — | 0/164 | 0 | 29.9 | 33.4 | 76.7 / 121.6 | 14.5 / 23.5 | 29.2 / 45.2 (0/70) | 43.1 / 56.3 (0/35) | 0.4 / 2.9 (0/58) | 17.1 / 17.1 (0/1) | 48 / 3 | 74 % |
| ean-glare | barcode | 1 | DECODED_CONFIRMED | 496 | 650 8426617014032 | 16/133 | 0 | 29.9 | 33.4 | 75.0 / 128.2 | 17.5 / 26.1 | 30.1 / 45.0 (4/50) | 41.6 / 55.8 (8/22) | 1.2 / 2.3 (4/50) | 2.8 / 5.0 (0/11) | 219 / 3 | 74 % |
| ean-hand-motion | barcode | 1 | DECODED_CONFIRMED | 1460 | 1606 8426617014032 | 29/153 | 0 | 29.9 | 33.4 | 75.5 / 133.2 | 18.8 / 29.0 | 28.8 / 45.0 (10/63) | 46.4 / 62.4 (7/24) | 1.3 / 2.8 (9/54) | 3.8 / 4.9 (3/12) | 229 / 3 | 75 % |
| ean-human-digits | barcode | 1 | DECODED_CONFIRMED | 168 | 333 8410297112386 | 89/127 | 0 | 29.9 | 33.4 | 55.7 / 102.5 | 16.2 / 26.5 | 30.9 / 45.9 (51/62) | 47.4 / 55.1 (0/3) | 2.6 / 5.5 (38/62) | — | 385 / 1 | 71 % |
| ean-low-light | barcode | 1 | DECODED_CONFIRMED | 982 | 1328 8426617014032 | 33/114 | 0 | 20.0 | 50.1 | 57.5 / 115.9 | 16.4 / 23.1 | 28.6 / 42.5 (23/53) | 42.5 / 51.5 (2/11) | 1.0 / 2.3 (8/50) | — | 194 / 2 | 62 % |
| ean-partial | barcode | 1 | NO_DECODE | — | — | 0/123 | 0 | 29.9 | 33.4 | 87.6 / 122.6 | 17.6 / 25.8 | 30.2 / 44.3 (0/49) | 47.0 / 56.6 (0/25) | 1.4 / 2.5 (0/49) | — | 260 / 2 | 76 % |
| ean-scratched | barcode | 1 | DECODED_CONFIRMED | 183 | 341 8480000105745 | 102/125 | 0 | 29.9 | 33.4 | 55.5 / 79.4 | 16.8 / 23.6 | 28.6 / 44.1 (59/62) | 40.6 / 40.6 (0/1) | 2.8 / 5.0 (43/62) | — | 391 / 2 | 70 % |
| ean-small | barcode | 1 | DECODED_UNCONFIRMED | 5640 | — | 1/144 | 0 | 20.0 | 50.1 | 79.5 / 123.0 | 17.0 / 23.6 | 28.4 / 41.7 (0/47) | 42.0 / 53.3 (0/23) | 0.5 / 3.2 (0/40) | 1.4 / 7.1 (1/34) | 100 / 79 | 70 % |
| ean-small-bottle | barcode | 1 | NO_DECODE | — | — | 0/141 | 0 | 29.9 | 33.4 | 90.0 / 122.6 | 16.4 / 26.8 | 30.6 / 41.5 (0/50) | 45.6 / 50.3 (0/25) | 0.9 / 3.3 (0/50) | 3.7 / 7.5 (0/16) | 221 / 85 | 75 % |
| ean-two-codes | barcode | 1 | DECODED_CONFIRMED | 177 | 372 8480000105745 | 64/137 | 0 | 29.9 | 33.4 | 66.5 / 102.9 | 16.7 / 27.4 | 28.5 / 49.6 (16/52) | 40.6 / 52.9 (10/17) | 1.3 / 3.6 (25/51) | 4.3 / 5.6 (13/17) | 224 / 5 | 73 % |
| ean-yaw-30 | barcode | 1 | DECODED_CONFIRMED | 196 | 364 7622201492786 | 78/143 | 0 | 29.9 | 33.4 | 62.9 / 117.5 | 14.8 / 24.3 | 29.7 / 42.9 (29/64) | 43.1 / 51.6 (13/15) | 3.5 / 6.4 (36/64) | — | 476 / 1 | 71 % |
| ean-yaw-60 | barcode | 1 | DECODED_CONFIRMED | 16 | 314 7622201492786 | 71/146 | 0 | 29.9 | 33.4 | 54.1 / 108.9 | 15.1 / 22.3 | 27.7 / 40.1 (37/64) | 42.2 / 53.4 (6/9) | 2.3 / 4.3 (27/64) | 5.7 / 55.3 (1/9) | 353 / 3 | 71 % |
| loop-60s | object | 1 | NOT_APPLICABLE | 4378 | 15915 8426617014032 | 46/947 | 0 | 29.9 | 33.4 | 83.9 / 120.2 | 18.3 / 29.5 | 29.0 / 43.0 (0/379) | 43.3 / 53.7 (28/189) | 0.9 / 2.0 (18/379) | — | 199 / 2 | 75 % |
| obj-apple | object | 1 | NOT_APPLICABLE | — | — | 0/75 | 0 | 29.9 | 33.4 | 85.6 / 111.0 | 16.3 / 25.7 | 25.4 / 35.7 (0/50) | 46.1 / 54.3 (0/25) | — | — | — / — | 72 % |
| obj-banana | object | 1 | NOT_APPLICABLE | — | — | 0/75 | 0 | 20.0 | 50.0 | 81.9 / 116.7 | 16.6 / 25.5 | 24.8 / 36.4 (0/50) | 45.1 / 56.7 (0/25) | — | — | — / — | 71 % |
| obj-bottle | object | 1 | NOT_APPLICABLE | — | — | 0/137 | 0 | 29.9 | 33.4 | 81.0 / 116.6 | 16.5 / 26.6 | 28.9 / 41.1 (0/54) | 43.7 / 51.7 (0/27) | 0.7 / 1.4 (0/45) | 1.1 / 3.8 (0/11) | 145 / 10 | 75 % |
| obj-can | object | 1 | NOT_APPLICABLE | 6270 | 6555 8437019462024 | 9/144 | 0 | 29.9 | 33.4 | 84.8 / 124.0 | 15.9 / 22.5 | 27.6 / 42.8 (0/52) | 45.0 / 62.3 (5/26) | 0.6 / 1.8 (0/41) | 0.8 / 4.1 (4/25) | 79 / 57 | 74 % |
| obj-milk-carton | object | 1 | NOT_APPLICABLE | 2051 | 2550 8410297112386 | 8/135 | 0 | 29.9 | 33.4 | 79.5 / 112.0 | 16.0 / 24.1 | 28.6 / 44.7 (0/52) | 42.8 / 52.9 (4/26) | 0.6 / 2.1 (4/49) | 1.0 / 3.3 (0/8) | 145 / 3 | 74 % |
| obj-oreo | object | 1 | NOT_APPLICABLE | 3098 | 4584 7622201817794 | 10/144 | 0 | 29.9 | 33.4 | 87.2 / 120.9 | 18.7 / 25.3 | 30.6 / 45.5 (0/47) | 44.4 / 55.6 (2/24) | 1.3 / 2.8 (0/46) | 2.7 / 6.4 (8/27) | 170 / 16 | 76 % |

Events per scene: ean-12cm=65, ean-18cm=59, ean-25cm=58, ean-30cm=52, ean-approach-40cm=66, ean-curved-can=52, ean-enter-edge=70, ean-glare=50, ean-hand-motion=63, ean-human-digits=62, ean-low-light=53, ean-partial=49, ean-scratched=62, ean-small=47, ean-small-bottle=50, ean-two-codes=52, ean-yaw-30=64, ean-yaw-60=64, loop-60s=379, obj-apple=50, obj-banana=50, obj-bottle=54, obj-can=52, obj-milk-carton=52, obj-oreo=47

## Phase 0 GATES (decision package Phase 0 acceptance) — **NO-GO**
| gate | measured | result |
|---|---|---|
| locate+roi per-frame p95 ≤ 40 ms (pooled over barcode frames) | p50 18.3 / p95 28.5 ms (saliency p95 26.1 + roi p95 4.4, n=1006) | PASS |
| ≥ 15 fps PROCESSED sustained 60 s (loop-60s) | 6.3 fps processed (min second 5); camera presented 29.7 fps, rVFC callbacks 25.5/s (first 5 s 27.0 → last 5 s 25.6) | FAIL |
| CPU proxy ≤ 60 % of one core (worker duty + main-thread capture share) | worker 12 % localize + 34 % decode = 46 %; main-thread capture→luma 60.9/79.4 ms p50/p95 × 6.3 fps = 38 %; combined 84 % | FAIL |
| corpus ≥ 20 scenes × ≥ 3 s | 25 scenes ≥ 3 s (25 recorded, 97 frames stored) | PASS |

## Phase 1 headline targets measured on this corpus (diagnostic — NOT Phase 0 gates)
| target | measured | result |
|---|---|---|
| wrong codes = 0 (headline: CONFIRMED wrong values) | 1 confirmed wrong value(s); 0 MISREAD scene(s) (no declared code); 15 raw single-frame read(s) contradicting the scene majority (ean-12cm: 7622201492786×115 vs 8622262492786×1; ean-18cm: 7622201492786×59 vs 8622262492786×1; ean-25cm: 7622201492786×35 vs 0602002492786×2 vs 0621201492786×1 vs 0602101492786×1; ean-30cm: 7622201492786×12 vs 2627201492786×1; ean-glare: 8426617014032×11 vs 7134410276083×2 vs 4134010216987×1 vs 7034450116083×1 vs 4134010476923×1; ean-yaw-30: 7622201492786×75 vs 4622167492786×1 vs 8622262492786×1 vs 4622181492786×1) | misses |
| EAN-13 completion 12–30 cm p50 ≤ 0.7 s / p95 ≤ 2.0 s (headline) | p50 389 ms / p95 1935 ms over 4 confirmed scene(s) | meets |
| two consecutive frames agreeing on a WRONG value (fast-lane hazard) | ean-25cm: 0602002492786 at 1935 ms (frames 46/50) | misses |

Verdict counts (rescored on the Mac, declared code scoped to the P1 scenes): DECODED_CONFIRMED=13, NO_DECODE=4, DECODED_UNCONFIRMED=1, NOT_APPLICABLE=7
