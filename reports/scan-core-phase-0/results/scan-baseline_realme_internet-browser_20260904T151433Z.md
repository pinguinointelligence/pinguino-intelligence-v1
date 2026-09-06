# Realme  — Android 15 — Chrome 125.0 — chrome_tab

Bundle `scan-baseline_realme_internet-browser_20260904T151433Z.zip` · session 8816a7bf-ee2b-4a96-ab29-1b376958e85c · created 2026-09-04T15:14:33.229Z · exported 2026-09-04T15:23:56.235Z · harness scan-lab-baseline/0.1.0+ed94869f · session name Internet browser

## Device + camera
| item | value |
|---|---|
| screen / dpr / cores / memory | 424×946 / 2.549999952316284 / 8 / 8 GB |
| requested | 1920×1080 @ 30 (environment) |
| delivered | 1080×1920 @ 30 · camera2 0, facing back · facing environment · open 4061 ms · first frame 4105 ms · autofocus yes · start sharpness 3395 / mean 52 |
| form factor | mobile |
| cameras seen | camera2 0, facing back r0; camera2 1, facing front r6 |
| zoom | not exposed |
| torch | exposed · apply ok (86 ms) |
| focusMode exposed | yes |
| worker | zxing-wasm 3.1.3 · warm-up 370 ms · OffscreenCanvas yes |
| loop (last scene) | video_frame_callback · presented 1796 · processed 371 · dropped(decode busy) 1151 · cadence p50/p95 33.4 / 66.8 ms · visibility events 0 |
| transfer | rgba_buffer · main→worker p50/p95 0.6 / 1.8 ms · reply p50/p95 0.6 / 2.4 ms · buffer reuse 371 / alloc 0 · round-trip minus worker-busy p50/p95 1.3/6.2 ms |
| main-thread capture→luma | 61.9 / 88.1 ms p50/p95 over 1621 processed frames |
| loop-60s frames | presented 1796 · surfaced 1522 (camera-side skipped 274) · processed 371 · dropped(busy) 1151 |
| client hints | Android ? · model ? ·  |
| camera auto-switch | none |

## Scenes
| scene | kind | att | verdict | 1st hit ms | confirmed ms | hits/att | misread | fps p50 | cadence p50 | worker RT p50/p95 | localize p50/p95 | full_cheap p50/p95 (hits) | full_harder p50/p95 (hits) | roi p50/p95 (hits) | rect p50/p95 (hits) | cand px / |°| | dropped |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ean-12cm | barcode | 1 | DECODED_CONFIRMED | 36 | 439 7622201492786 | 97/127 | 1 | 29.9 | 33.4 | 58.3 / 119.4 | 15.4 / 36.1 | 30.6 / 45.0 (41/60) | 43.1 / 61.2 (5/7) | 2.1 / 4.7 (51/60) | — | 288 / 1 | 72 % |
| ean-18cm | barcode | 1 | DECODED_CONFIRMED | 5492 | 7078 7622201492786 | 4/150 | 0 | 29.9 | 33.4 | 86.2 / 112.4 | 14.9 / 24.6 | 28.7 / 41.3 (1/56) | 42.6 / 54.9 (1/28) | 2.0 / 4.1 (2/56) | 3.7 / 19.0 (0/10) | 275 / 81 | 74 % |
| ean-25cm | barcode | 1 | NO_DECODE | — | — | 0/127 | 0 | 29.9 | 33.5 | 88.7 / 148.2 | 17.1 / 28.7 | 33.7 / 55.8 (0/48) | 45.1 / 60.8 (0/24) | 4.4 / 8.5 (0/48) | 5.1 / 12.9 (0/7) | 445 / 86 | 74 % |
| ean-30cm | barcode | 1 | NO_DECODE | — | — | 0/129 | 0 | 29.9 | 33.4 | 92.2 / 125.3 | 17.2 / 24.9 | 31.5 / 41.9 (0/49) | 45.4 / 53.2 (0/24) | 3.7 / 6.5 (0/49) | 3.4 / 5.3 (0/7) | 439 / 86 | 75 % |
| ean-approach-40cm | barcode | 1 | NO_DECODE | — | — | 0/146 | 0 | 29.9 | 33.5 | 95.8 / 142.6 | 17.9 / 27.0 | 34.1 / 50.0 (0/58) | 45.4 / 63.7 (0/29) | 1.8 / 4.5 (0/58) | 3.3 / 3.3 (0/1) | 314 / 87 | 74 % |
| ean-curved-can | barcode | 1 | DECODED_CONFIRMED | 605 | 1025 8411092731130 | 11/109 | 0 | 20.0 | 50.1 | 82.0 / 418.2 | 12.4 / 51.2 | 31.8 / 89.2 (1/43) | 48.2 / 153.5 (8/21) | 1.2 / 3.3 (2/37) | 2.6 / 7.2 (0/8) | 241 / 9 | 71 % |
| ean-enter-edge | barcode | 1 | DECODED_CONFIRMED | 3034 | 3794 7622201492786 | 29/159 | 0 | 29.9 | 33.4 | 72.8 / 121.3 | 14.9 / 26.8 | 28.1 / 46.1 (10/69) | 41.8 / 50.7 (5/29) | 2.1 / 5.1 (14/61) | — | 350 / 1 | 73 % |
| ean-glare | barcode | 1 | DECODED_CONFIRMED | 338 | 473 8426617014032 | 69/140 | 0 | 29.9 | 33.4 | 59.4 / 109.1 | 14.9 / 27.8 | 26.7 / 38.8 (21/60) | 43.9 / 51.7 (10/13) | 1.6 / 3.1 (33/60) | 13.9 / 19.8 (5/7) | 302 / 5 | 70 % |
| ean-hand-motion | barcode | 1 | DECODED_CONFIRMED | 191 | 1250 7622201492786 | 37/159 | 0 | 29.9 | 33.4 | 71.1 / 116.9 | 16.8 / 25.7 | 28.7 / 44.5 (13/67) | 44.7 / 53.2 (5/25) | 1.6 / 4.2 (19/67) | — | 181 / 1 | 74 % |
| ean-human-digits | barcode | 1 | DECODED_CONFIRMED | 3244 | 3443 8480000399007 | 30/118 | 0 | 29.9 | 33.4 | 70.2 / 118.2 | 17.4 / 25.8 | 31.0 / 45.5 (17/52) | 43.6 / 66.7 (0/14) | 1.5 / 4.3 (13/52) | — | 272 / 2 | 72 % |
| ean-low-light | barcode | 1 | DECODED_CONFIRMED | 1103 | 1275 7622201492786 | 18/113 | 0 | 20.0 | 50.1 | 75.3 / 117.6 | 17.1 / 23.9 | 30.9 / 42.8 (7/49) | 43.2 / 50.7 (3/20) | 1.6 / 4.3 (8/43) | 1.1 / 1.1 (0/1) | 197 / 3 | 68 % |
| ean-partial | barcode | 1 | NO_DECODE | — | — | 0/108 | 0 | 29.9 | 33.4 | 80.4 / 109.3 | 16.8 / 28.5 | 28.4 / 42.4 (0/49) | 44.9 / 50.0 (0/24) | 1.1 / 2.9 (0/35) | — | 149 / 2 | 74 % |
| ean-scratched | barcode | 1 | DECODED_CONFIRMED | 25 | 204 8480000105745 | 73/120 | 0 | 29.9 | 33.4 | 53.1 / 100.2 | 17.0 / 29.3 | 27.7 / 47.1 (49/58) | 42.6 / 49.5 (0/4) | 2.1 / 5.6 (24/58) | — | 278 / 0 | 71 % |
| ean-small | barcode | 1 | DECODED_UNCONFIRMED | 6766 | — | 1/120 | 0 | 29.9 | 33.4 | 87.0 / 115.9 | 17.7 / 24.3 | 30.5 / 44.9 (0/48) | 44.8 / 55.2 (1/24) | 0.5 / 1.5 (0/48) | — | 134 / 88 | 75 % |
| ean-small-bottle | barcode | 1 | DECODED_CONFIRMED | 1853 | 5576 8480000235138 | 6/135 | 0 | 29.9 | 33.4 | 76.0 / 119.2 | 17.4 / 32.0 | 27.4 / 41.5 (0/54) | 42.2 / 58.0 (6/27) | 0.6 / 1.5 (0/54) | — | 145 / 89 | 74 % |
| ean-two-codes | barcode | 1 | DECODED_CONFIRMED | 23 | 249 8480000105745 | 91/115 | 0 | 29.9 | 33.4 | 54.8 / 85.4 | 17.3 / 26.4 | 29.8 / 44.8 (52/57) | 56.5 / 56.5 (0/1) | 1.3 / 3.1 (39/57) | — | 241 / 1 | 69 % |
| ean-yaw-30 | barcode | 1 | DECODED_CONFIRMED | 41 | 473 7622201492786 | 71/131 | 0 | 29.9 | 33.4 | 66.2 / 113.1 | 16.3 / 25.1 | 30.5 / 46.9 (25/57) | 44.8 / 57.8 (8/13) | 3.0 / 6.0 (35/57) | 5.7 / 7.8 (3/4) | 384 / 4 | 72 % |
| ean-yaw-60 | barcode | 1 | DECODED_CONFIRMED | 220 | 556 7622201492786 | 62/138 | 0 | 29.9 | 33.4 | 62.7 / 128.2 | 17.2 / 25.3 | 33.8 / 52.2 (28/53) | 48.8 / 53.1 (3/7) | 2.1 / 5.3 (20/53) | 4.5 / 7.0 (11/25) | 313 / 8 | 74 % |
| loop-60s | object | 1 | NOT_APPLICABLE | 208 | 2179 8426617014032 | 99/929 | 0 | 29.9 | 33.4 | 82.9 / 123.8 | 18.5 / 30.3 | 31.0 / 44.4 (3/371) | 43.5 / 56.0 (49/182) | 0.8 / 1.9 (47/371) | 2.0 / 3.5 (0/5) | 194 / 1 | 76 % |
| obj-banana | object | 1 | NOT_APPLICABLE | — | — | 0/86 | 0 | 29.9 | 33.4 | 82.9 / 140.2 | 16.7 / 25.9 | 25.7 / 37.6 (0/50) | 46.7 / 71.1 (0/25) | 0.3 / 1.0 (0/10) | 0.7 / 0.7 (0/1) | 28 / 87 | 74 % |
| obj-bottle | object | 1 | NOT_APPLICABLE | — | — | 0/137 | 0 | 29.9 | 33.4 | 81.0 / 108.3 | 14.8 / 29.3 | 26.1 / 38.6 (0/55) | 44.0 / 52.0 (0/27) | 0.5 / 1.2 (0/44) | 1.3 / 3.0 (0/11) | 145 / 41 | 73 % |
| obj-can | object | 1 | NOT_APPLICABLE | 5127 | 5527 8437019462024 | 6/123 | 0 | 29.9 | 33.4 | 78.3 / 115.8 | 18.6 / 32.4 | 25.7 / 41.8 (0/48) | 41.5 / 51.6 (6/24) | 0.6 / 1.8 (0/31) | 4.3 / 16.6 (0/20) | 160 / 70 | 75 % |
| obj-milk-carton | object | 1 | NOT_APPLICABLE | — | — | 0/94 | 0 | 20.0 | 50.0 | 81.3 / 115.3 | 16.1 / 23.2 | 26.7 / 41.0 (0/41) | 41.5 / 51.9 (0/21) | 0.3 / 0.8 (0/25) | 0.6 / 5.0 (0/7) | 48 / 86 | 71 % |
| obj-oreo | object | 1 | NOT_APPLICABLE | 5648 | 6318 7622201817794 | 4/135 | 0 | 29.9 | 33.4 | 87.8 / 141.2 | 16.9 / 25.9 | 28.4 / 41.3 (0/48) | 46.7 / 65.5 (3/24) | 1.0 / 3.6 (0/46) | 5.8 / 22.1 (1/17) | 139 / 8 | 76 % |

Events per scene: ean-12cm=60, ean-18cm=56, ean-25cm=48, ean-30cm=49, ean-approach-40cm=58, ean-curved-can=43, ean-enter-edge=69, ean-glare=60, ean-hand-motion=67, ean-human-digits=52, ean-low-light=49, ean-partial=49, ean-scratched=58, ean-small=48, ean-small-bottle=54, ean-two-codes=57, ean-yaw-30=57, ean-yaw-60=53, loop-60s=371, obj-banana=50, obj-bottle=55, obj-can=48, obj-milk-carton=41, obj-oreo=48

## Phase 0 GATES (decision package Phase 0 acceptance) — **NO-GO**
| gate | measured | result |
|---|---|---|
| locate+roi per-frame p95 ≤ 40 ms (pooled over barcode frames) | p50 18.8 / p95 29.9 ms (saliency p95 26.9 + roi p95 5.2, n=953) | PASS |
| ≥ 15 fps PROCESSED sustained 60 s (loop-60s) | 6.2 fps processed (min second 5); camera presented 29.9 fps, rVFC callbacks 25.4/s (first 5 s 25.8 → last 5 s 25.0) | FAIL |
| CPU proxy ≤ 60 % of one core (worker duty + main-thread capture share) | worker 12 % localize + 34 % decode = 46 %; main-thread capture→luma 61.9/88.1 ms p50/p95 × 6.2 fps = 38 %; combined 84 % | FAIL |
| corpus ≥ 20 scenes × ≥ 3 s | 24 scenes ≥ 3 s (24 recorded, 98 frames stored) | PASS |

## Phase 1 headline targets measured on this corpus (diagnostic — NOT Phase 0 gates)
| target | measured | result |
|---|---|---|
| wrong codes = 0 (headline: CONFIRMED wrong values) | 0 confirmed wrong value(s); 0 MISREAD scene(s) vs declared 7622201492786 (P1 scenes only, 1 raw hit(s) differ); 2 raw single-frame read(s) contradicting the scene majority (ean-12cm: 7622201492786×96 vs 2627201492786×1; ean-curved-can: 8411092731130×10 vs 4431437890777×1) | meets |
| EAN-13 completion 12–30 cm p50 ≤ 0.7 s / p95 ≤ 2.0 s (headline) | p50 439 ms / p95 7078 ms over 2 confirmed scene(s); NEVER confirmed: ean-25cm, ean-30cm | misses |
| two consecutive frames agreeing on a WRONG value (fast-lane hazard) | none observed | meets |

Verdict counts (rescored on the Mac, declared code scoped to the P1 scenes): DECODED_CONFIRMED=13, NO_DECODE=4, DECODED_UNCONFIRMED=1, NOT_APPLICABLE=6
