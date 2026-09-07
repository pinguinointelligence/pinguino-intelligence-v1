# Galaxy — Android 10 — Samsung Internet 30.0 — browser_tab

Bundle `20260904T160033Z_scan-baseline_galaxy_internet-browser_20260904T155251Z.zip` · session 8880c735-ec7a-40cc-8b8f-075fba803178 · created 2026-09-04T15:52:51.659Z · exported 2026-09-04T16:00:27.746Z · harness scan-lab-baseline/0.1.0+ed94869f · session name Internet browser

## Device + camera
| item | value |
|---|---|
| screen / dpr / cores / memory | 412×869 / 2.625 / 8 / 8 GB |
| requested | 1920×1080 @ 30 (environment) |
| delivered | 1080×1920 @ 30 · camera 0, facing back · facing environment · open 727 ms · first frame 752 ms · autofocus yes · start sharpness 1798 / mean 57 |
| form factor | mobile |
| cameras seen | camera 0, facing back r0; camera 2, facing back r1; camera 1, facing front r6; camera 3, facing front r6 |
| zoom | 1–8 · apply ok (1 → 2, 42 ms) |
| torch | exposed · apply ok (18 ms) |
| focusMode exposed | yes |
| worker | zxing-wasm 3.1.3 · warm-up 52 ms · OffscreenCanvas yes |
| loop (last scene) | video_frame_callback · presented 1801 · processed 280 · dropped(decode busy) 1223 · cadence p50/p95 33.4 / 66.9 ms · visibility events 0 |
| transfer | rgba_buffer · main→worker p50/p95 0.5 / 1.9 ms · reply p50/p95 0.6 / 5.9 ms · buffer reuse 280 / alloc 0 · round-trip minus worker-busy p50/p95 1.2/6.1 ms |
| main-thread capture→luma | 65.6 / 79.7 ms p50/p95 over 1650 processed frames |
| loop-60s frames | presented 1801 · surfaced 1503 (camera-side skipped 298) · processed 280 · dropped(busy) 1223 |
| client hints | Android 12.0.0 · model SM-N975F · Samsung Internet 30.0.0.67; Chromium 143.0.7499.194; Not A(Brand 24.0.0.0 |
| camera auto-switch | re-opened on the ranked primary; first delivery was camera 2, facing back 1080×1920 |

## Scenes
| scene | kind | att | verdict | 1st hit ms | confirmed ms | hits/att | misread | fps p50 | cadence p50 | worker RT p50/p95 | localize p50/p95 | full_cheap p50/p95 (hits) | full_harder p50/p95 (hits) | roi p50/p95 (hits) | rect p50/p95 (hits) | cand px / |°| | dropped |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ean-12cm | barcode | 1 | DECODED_CONFIRMED | 246 | 442 7622201492786 | 109/119 | 0 | 29.9 | 33.5 | 48.6 / 96.4 | 18.0 / 36.9 | 23.0 / 38.0 (50/59) | 44.4 / 44.4 (1/1) | 1.9 / 5.5 (58/59) | — | 316 / 1 | 69 % |
| ean-18cm | barcode | 1 | DECODED_CONFIRMED | 11 | 188 7622201492786 | 69/130 | 0 | 29.9 | 33.5 | 45.3 / 60.2 | 16.2 / 22.3 | 22.4 / 29.9 (60/65) | — | 0.7 / 1.6 (9/65) | — | 122 / 0 | 66 % |
| ean-25cm | barcode | 1 | DECODED_CONFIRMED | 26 | 338 7622201492786 | 104/127 | 0 | 29.9 | 33.5 | 48.0 / 86.7 | 15.3 / 21.3 | 22.4 / 37.2 (38/59) | 39.3 / 42.3 (8/9) | 0.9 / 2.5 (58/59) | — | 216 / 0 | 68 % |
| ean-30cm | barcode | 1 | DECODED_CONFIRMED | 493 | 697 7622201492786 | 41/120 | 0 | 20.1 | 49.8 | 49.3 / 91.6 | 14.8 / 23.6 | 21.4 / 41.5 (35/56) | 39.8 / 47.5 (6/8) | 4.2 / 6.5 (0/56) | — | 501 / 87 | 69 % |
| ean-approach-40cm | barcode | 1 | NO_DECODE | — | — | 0/170 | 0 | 29.9 | 33.4 | 74.3 / 113.3 | 14.0 / 20.9 | 19.7 / 35.3 (0/68) | 38.6 / 47.7 (0/34) | 2.3 / 21.4 (0/68) | — | 361 / 87 | 71 % |
| ean-curved-can | barcode | 1 | DECODED_CONFIRMED | 154 | 583 8411092731130 | 26/138 | 0 | 29.9 | 33.4 | 72.7 / 106.4 | 15.0 / 20.5 | 20.3 / 29.7 (0/53) | 39.0 / 69.9 (22/26) | 2.2 / 6.2 (0/53) | 3.8 / 5.3 (4/6) | 364 / 84 | 72 % |
| ean-enter-edge | barcode | 1 | DECODED_CONFIRMED | 2477 | 2643 7622201492786 | 22/170 | 0 | 29.9 | 33.5 | 54.4 / 86.5 | 13.9 / 19.1 | 19.3 / 29.9 (15/73) | 37.1 / 38.9 (7/28) | 0.8 / 1.4 (0/68) | 11.4 / 11.4 (0/1) | 78 / 1 | 70 % |
| ean-glare | barcode | 1 | DECODED_CONFIRMED | 16 | 226 8426617014032 | 73/120 | 0 | 29.9 | 33.5 | 51.3 / 97.2 | 17.6 / 39.6 | 23.0 / 42.6 (35/56) | 39.0 / 47.0 (8/8) | 1.0 / 28.0 (30/56) | — | 223 / 2 | 70 % |
| ean-hand-motion | barcode | 1 | DECODED_CONFIRMED | 30 | 189 7622201492786 | 89/194 | 0 | 29.9 | 33.5 | 67.4 / 116.8 | 17.4 / 32.4 | 22.5 / 32.3 (22/67) | 38.5 / 44.7 (6/20) | 2.1 / 14.8 (38/67) | 3.9 / 24.5 (23/40) | 281 / 8 | 72 % |
| ean-human-digits | barcode | 1 | DECODED_CONFIRMED | 29 | 222 8410297112386 | 89/123 | 0 | 20.0 | 49.9 | 45.6 / 59.4 | 16.9 / 26.6 | 20.3 / 26.3 (59/61) | 38.1 / 38.1 (0/1) | 1.4 / 2.5 (30/61) | — | 312 / 1 | 66 % |
| ean-low-light | barcode | 1 | DECODED_CONFIRMED | 191 | 350 7622201492786 | 39/124 | 0 | 20.0 | 50.0 | 57.5 / 89.7 | 16.6 / 29.0 | 19.0 / 26.6 (14/54) | 36.3 / 40.5 (4/19) | 1.1 / 3.1 (21/51) | — | 245 / 2 | 66 % |
| ean-partial | barcode | 1 | NO_DECODE | — | — | 0/127 | 0 | 29.9 | 33.5 | 73.9 / 161.3 | 16.1 / 24.1 | 18.4 / 43.0 (0/51) | 39.5 / 103.9 (0/25) | 1.1 / 1.9 (0/51) | — | 313 / 1 | 72 % |
| ean-scratched | barcode | 1 | DECODED_CONFIRMED | 28 | 595 8480000105745 | 74/126 | 0 | 29.9 | 33.5 | 48.3 / 88.5 | 17.3 / 26.1 | 21.6 / 29.4 (44/60) | 37.0 / 40.2 (3/6) | 1.5 / 17.9 (27/60) | — | 244 / 2 | 69 % |
| ean-small | barcode | 1 | DECODED_CONFIRMED | 6793 | 7091 4305615614434 | 3/121 | 0 | 29.9 | 33.5 | 72.0 / 89.0 | 14.7 / 20.5 | 18.2 / 27.5 (0/55) | 37.3 / 40.4 (3/27) | 0.3 / 1.5 (0/39) | — | 120 / 88 | 70 % |
| ean-small-bottle | barcode | 1 | DECODED_CONFIRMED | 2862 | 3074 8411902004089 | 9/124 | 0 | 29.9 | 33.5 | 76.4 / 167.3 | 16.3 / 19.7 | 20.5 / 39.7 (0/53) | 38.9 / 94.1 (1/26) | 0.8 / 2.8 (8/39) | 2.2 / 6.6 (0/6) | 241 / 81 | 72 % |
| ean-two-codes | barcode | 1 | DECODED_CONFIRMED | 37 | 286 8480000105745 | 122/124 | 0 | 29.9 | 33.5 | 42.5 / 58.4 | 14.2 / 18.4 | 21.8 / 29.2 (62/62) | — | 1.6 / 2.3 (60/62) | — | 268 / 3 | 67 % |
| ean-yaw-30 | barcode | 1 | DECODED_CONFIRMED | 29 | 201 7622201492786 | 73/131 | 0 | 29.9 | 33.4 | 47.1 / 78.6 | 15.4 / 19.7 | 21.9 / 31.6 (43/62) | 37.2 / 44.2 (1/7) | 2.0 / 4.2 (29/62) | — | 360 / 2 | 67 % |
| ean-yaw-60 | barcode | 1 | DECODED_CONFIRMED | 391 | 659 7622201492786 | 64/132 | 0 | 29.7 | 33.7 | 49.5 / 104.1 | 16.5 / 19.4 | 22.7 / 33.4 (33/57) | 39.5 / 63.7 (6/9) | 1.2 / 4.5 (25/57) | 2.2 / 21.6 (0/9) | 259 / 4 | 69 % |
| loop-60s | object | 1 | NOT_APPLICABLE | 246 | 728 8426617014032 | 291/697 | 0 | 29.9 | 33.4 | 148.9 / 182.3 | 23.6 / 33.4 | 44.0 / 52.8 (0/279) | 92.4 / 98.4 (135/139) | 2.1 / 20.0 (156/279) | — | 206 / 1 | 81 % |
| obj-apple | object | 1 | NOT_APPLICABLE | — | — | 0/81 | 0 | 29.9 | 33.5 | 72.3 / 86.5 | 16.2 / 20.4 | 17.3 / 25.2 (0/54) | 40.0 / 41.2 (0/27) | — | — | — / — | 71 % |
| obj-banana | object | 1 | NOT_APPLICABLE | — | — | 0/87 | 0 | 29.9 | 33.4 | 72.2 / 84.0 | 13.6 / 19.4 | 16.3 / 26.5 (0/58) | 38.6 / 39.1 (0/29) | — | — | — / — | 70 % |
| obj-bottle | object | 1 | NOT_APPLICABLE | — | — | 0/88 | 0 | 29.9 | 33.4 | 161.0 / 200.6 | 22.4 / 27.0 | 43.8 / 55.4 (0/37) | 91.5 / 129.7 (0/18) | 1.4 / 3.7 (0/25) | 2.1 / 6.6 (0/8) | 173 / 75 | 81 % |
| obj-can | object | 1 | NOT_APPLICABLE | 6662 | 7167 8437019462024 | 3/107 | 0 | 29.9 | 33.5 | 145.2 / 168.6 | 20.8 / 31.2 | 41.0 / 43.8 (0/40) | 83.6 / 88.9 (2/20) | 0.7 / 15.4 (0/27) | 1.4 / 6.1 (1/20) | 91 / 49 | 78 % |
| obj-milk-carton | object | 1 | NOT_APPLICABLE | 30 | 283 8410297112386 | 14/116 | 0 | 29.9 | 33.5 | 116.2 / 172.5 | 19.1 / 21.7 | 36.8 / 48.7 (0/43) | 64.9 / 105.6 (6/22) | 0.5 / 1.1 (8/42) | 0.8 / 3.6 (0/9) | 99 / 70 | 77 % |
| obj-oreo | object | 1 | NOT_APPLICABLE | 3053 | 3457 7622201817794 | 7/149 | 0 | 29.9 | 33.5 | 82.8 / 121.1 | 17.2 / 20.8 | 22.7 / 35.8 (0/49) | 45.0 / 51.3 (5/25) | 1.2 / 2.9 (0/49) | 2.4 / 3.7 (2/26) | 162 / 13 | 73 % |

Events per scene: ean-12cm=59, ean-18cm=65, ean-25cm=59, ean-30cm=56, ean-approach-40cm=68, ean-curved-can=53, ean-enter-edge=73, ean-glare=56, ean-hand-motion=67, ean-human-digits=61, ean-low-light=54, ean-partial=51, ean-scratched=60, ean-small=55, ean-small-bottle=53, ean-two-codes=62, ean-yaw-30=62, ean-yaw-60=57, loop-60s=279, obj-apple=54, obj-banana=58, obj-bottle=37, obj-can=40, obj-milk-carton=43, obj-oreo=49

## Phase 0 GATES (decision package Phase 0 acceptance) — **NO-GO**
| gate | measured | result |
|---|---|---|
| locate+roi per-frame p95 ≤ 40 ms (pooled over barcode frames) | p50 17.5 / p95 30.2 ms (saliency p95 24.3 + roi p95 5.2, n=1033) | PASS |
| ≥ 15 fps PROCESSED sustained 60 s (loop-60s) | 4.7 fps processed (min second 4); camera presented 30.0 fps, rVFC callbacks 25.0/s (first 5 s 25.0 → last 5 s 26.0) | FAIL |
| CPU proxy ≤ 60 % of one core (worker duty + main-thread capture share) | worker 12 % localize + 42 % decode = 54 %; main-thread capture→luma 65.6/79.7 ms p50/p95 × 4.7 fps = 31 %; combined 85 % | FAIL |
| corpus ≥ 20 scenes × ≥ 3 s | 25 scenes ≥ 3 s (25 recorded, 95 frames stored) | PASS |

## Phase 1 headline targets measured on this corpus (diagnostic — NOT Phase 0 gates)
| target | measured | result |
|---|---|---|
| wrong codes = 0 (headline: CONFIRMED wrong values) | 0 confirmed wrong value(s); 0 MISREAD scene(s) (no declared code); 0 raw single-frame read(s) contradicting the scene majority | meets |
| EAN-13 completion 12–30 cm p50 ≤ 0.7 s / p95 ≤ 2.0 s (headline) | p50 338 ms / p95 697 ms over 4 confirmed scene(s) | meets |
| two consecutive frames agreeing on a WRONG value (fast-lane hazard) | none observed | meets |

Verdict counts (rescored on the Mac, declared code scoped to the P1 scenes): DECODED_CONFIRMED=16, NO_DECODE=2, NOT_APPLICABLE=7
