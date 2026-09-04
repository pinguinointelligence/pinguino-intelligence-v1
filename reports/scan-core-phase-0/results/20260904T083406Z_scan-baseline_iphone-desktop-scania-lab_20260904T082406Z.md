# iPhone desktop Scania lab — iOS 18.7 — Safari 26.6.1 — standalone_pwa

Bundle `20260904T083406Z_scan-baseline_iphone-desktop-scania-lab_20260904T082406Z.zip` · session 48d74dab-42bb-4006-970c-6d696af1139c · created 2026-09-04T08:24:06.404Z · exported 2026-09-04T08:31:32.706Z · harness scan-lab-baseline/0.1.0

## Device + camera
| item | value |
|---|---|
| screen / dpr / cores / memory | 430×932 / 3 / 4 / — GB |
| requested | 1920×1080 @ 30 (environment) |
| delivered | 1080×1920 @ 30 · Tylny aparat · facing environment · open 192 ms · first frame 490 ms |
| cameras seen | Tylny aparat r0; Tylny aparat trójobiektywowy r1; Tylny dwuobiektywowy aparat szerokokątny r1; Tylny aparat dwuobiektywowy r1; Tylny aparat ultraszerokokątny (ultra-wide?) r4; Tylny aparat długoogniskowy r5; Przedni aparat r6 |
| zoom | 1–10 · apply ok (1 → 2, 1 ms) |
| torch | exposed · apply ok (6 ms) |
| focusMode exposed | no |
| worker | zxing-wasm 3.1.3 · warm-up 521 ms · OffscreenCanvas yes |
| loop (last scene) | video_frame_callback · presented 1800 · processed 1360 · dropped(decode busy) 436 · cadence p50/p95 33.0 / 50.0 ms · visibility events 0 |
| transfer | rgba_buffer · main→worker p50/p95 0.0 / 1.0 ms · reply p50/p95 0.0 / 1.0 ms · buffer reuse 1360 / alloc 0 · round-trip minus worker-busy p50/p95 0.0/1.0 ms |
| main-thread capture→luma | 14.0 / 18.0 ms p50/p95 over 5768 processed frames |
| loop-60s frames | presented 1800 · surfaced 1796 (camera-side skipped 4) · processed 1360 · dropped(busy) 436 |
| client hints | none (Safari, or hints refused) — reduced UA only |
| camera auto-switch | re-opened on the ranked primary; first delivery was Tylny aparat trójobiektywowy 1080×1920 |

## Scenes
| scene | kind | att | verdict | 1st hit ms | confirmed ms | hits/att | misread | fps p50 | cadence p50 | worker RT p50/p95 | localize p50/p95 | full_cheap p50/p95 (hits) | full_harder p50/p95 (hits) | roi p50/p95 (hits) | rect p50/p95 (hits) | cand px / |°| | dropped |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ean-12cm | barcode | 1 | NO_DECODE | — | — | 0/339 | 0 | 30.3 | 33.0 | 17.0 / 19.0 | 3.0 / 4.0 | 3.0 / 4.0 (0/159) | 10.0 / 11.0 (0/79) | 0.0 / 1.0 (0/101) | — | 50 / 2 | 33 % |
| ean-18cm | barcode | 1 | MISREAD | 7093 | — | 1/560 | 1 | 30.3 | 33.0 | 18.0 / 20.0 | 3.0 / 4.0 | 3.0 / 4.0 (0/224) | 11.0 / 12.0 (0/112) | 0.0 / 1.0 (1/224) | — | 121 / 1 | 6 % |
| ean-25cm | barcode | 1 | DECODED_CONFIRMED | 13 | 130 8480000511461 | 457/458 | 0 | 30.3 | 33.0 | 9.0 / 12.0 | 4.0 / 7.0 | 4.0 / 4.0 (228/229) | — | 0.0 / 1.0 (229/229) | — | 217 / 1 | 4 % |
| ean-30cm | barcode | 1 | DECODED_CONFIRMED | 9 | 176 8480000511461 | 440/472 | 0 | 30.3 | 33.0 | 8.0 / 10.0 | 4.0 / 4.0 | 4.0 / 4.0 (208/233) | 13.0 / 14.0 (4/6) | 0.0 / 1.0 (228/233) | — | 193 / 1 | 3 % |
| ean-approach-40cm | barcode | 1 | DECODED_CONFIRMED | 100 | 158 8480000511461 | 392/566 | 0 | 30.3 | 33.0 | 8.0 / 21.0 | 4.0 / 4.0 | 3.0 / 4.0 (90/250) | 12.0 / 14.0 (66/66) | 0.0 / 1.0 (236/250) | — | 145 / 1 | 17 % |
| ean-curved-can | barcode | 1 | DECODED_CONFIRMED | 190 | 324 8411092731130 | 71/382 | 0 | 30.3 | 33.0 | 18.0 / 22.0 | 4.0 / 4.0 | 3.0 / 4.0 (0/153) | 12.0 / 14.0 (71/76) | 0.0 / 1.0 (0/153) | — | 197 / 87 | 36 % |
| ean-enter-edge | barcode | 1 | NO_DECODE | — | — | 0/624 | 0 | 30.3 | 33.0 | 19.0 / 21.0 | 4.0 / 4.0 | 3.0 / 4.0 (0/251) | 12.0 / 13.0 (0/125) | 0.0 / 1.0 (0/248) | — | 97 / 2 | 16 % |
| ean-glare | barcode | 1 | DECODED_CONFIRMED | 4342 | 4442 8426617014032 | 87/467 | 0 | 30.3 | 33.0 | 9.0 / 22.0 | 4.0 / 4.0 | 3.0 / 4.0 (35/196) | 12.0 / 14.0 (20/74) | 0.0 / 1.0 (32/195) | 0.0 / 0.0 (0/2) | 123 / 1 | 18 % |
| ean-hand-motion | barcode | 1 | DECODED_CONFIRMED | 139 | 197 8426617014032 | 89/501 | 0 | 30.3 | 33.0 | 19.0 / 23.0 | 4.0 / 5.0 | 4.0 / 4.0 (20/222) | 13.0 / 14.0 (17/97) | 0.0 / 1.0 (41/159) | 1.0 / 1.0 (11/23) | 121 / 6 | 26 % |
| ean-human-digits | barcode | 1 | DECODED_CONFIRMED | 275 | 709 8410297112386 | 99/482 | 0 | 30.3 | 33.0 | 9.0 / 20.0 | 3.0 / 4.0 | 3.0 / 4.0 (43/203) | 12.0 / 13.0 (4/79) | 0.0 / 1.0 (52/198) | 0.0 / 1.0 (0/2) | 145 / 1 | 15 % |
| ean-low-light | barcode | 1 | DECODED_CONFIRMED | 725 | 7827 8426617014032 | 2/417 | 0 | 30.3 | 33.0 | 18.0 / 21.0 | 3.0 / 4.0 | 3.0 / 4.0 (1/208) | 11.0 / 13.0 (1/103) | 0.0 / 1.0 (0/98) | 0.0 / 1.0 (0/8) | 72 / 2 | 13 % |
| ean-partial | barcode | 1 | NO_DECODE | — | — | 0/475 | 0 | 30.3 | 33.0 | 19.0 / 21.0 | 4.0 / 4.0 | 3.0 / 4.0 (0/190) | 12.0 / 14.0 (0/95) | 0.0 / 1.0 (0/190) | — | 149 / 1 | 21 % |
| ean-scratched | barcode | 1 | DECODED_CONFIRMED | 7 | 131 8480000105745 | 173/335 | 0 | 30.3 | 33.0 | 8.0 / 19.0 | 3.0 / 4.0 | 3.0 / 4.0 (69/159) | 11.0 / 12.0 (11/40) | 0.0 / 1.0 (93/136) | — | 237 / 4 | 33 % |
| ean-small | barcode | 1 | DECODED_CONFIRMED | 1124 | 1224 40279787 | 64/508 | 0 | 30.3 | 33.0 | 19.0 / 21.0 | 4.0 / 4.0 | 3.0 / 4.0 (0/200) | 12.0 / 13.0 (47/100) | 0.0 / 1.0 (0/179) | 0.0 / 1.0 (17/29) | 98 / 86 | 16 % |
| ean-small-bottle | barcode | 1 | DECODED_CONFIRMED | 224 | 324 8402001022845 | 43/483 | 0 | 30.3 | 33.0 | 19.0 / 23.0 | 4.0 / 4.0 | 3.0 / 4.0 (0/181) | 12.0 / 14.0 (43/91) | 0.0 / 1.0 (0/179) | 2.0 / 3.0 (0/32) | 603 / 85 | 24 % |
| ean-two-codes | barcode | 1 | DECODED_CONFIRMED | 192 | 359 8410297112386 | 357/626 | 0 | 30.3 | 33.0 | 12.0 / 23.0 | 4.0 / 5.0 | 4.0 / 5.0 (90/198) | 12.0 / 13.0 (26/50) | 0.0 / 1.0 (118/195) | 1.0 / 1.0 (123/183) | 237 / 14 | 17 % |
| ean-yaw-30 | barcode | 1 | DECODED_CONFIRMED | 4478 | 5579 8480000511461 | 93/457 | 2 | 30.3 | 33.0 | 9.0 / 22.0 | 4.0 / 4.0 | 3.0 / 4.0 (49/194) | 12.0 / 15.0 (6/69) | 0.0 / 1.0 (38/194) | — | 123 / 1 | 18 % |
| ean-yaw-60 | barcode | 1 | DECODED_CONFIRMED | 107 | 178 8480000511461 | 323/458 | 0 | 30.3 | 33.0 | 8.0 / 22.0 | 4.0 / 4.0 | 3.0 / 4.0 (131/209) | 12.0 / 14.0 (20/31) | 0.0 / 1.0 (167/209) | 2.0 / 3.0 (5/9) | 222 / 5 | 13 % |
| loop-60s | object | 1 | NOT_APPLICABLE | 11 | 194 8426617014032 | 1699/3020 | 0 | 30.3 | 33.0 | 10.0 / 24.0 | 4.0 / 5.0 | 4.0 / 5.0 (606/1359) | 13.0 / 15.0 (246/300) | 0.0 / 1.0 (844/1350) | 0.0 / 1.0 (3/11) | 194 / 3 | 24 % |
| obj-banana | object | 1 | NOT_APPLICABLE | — | — | 0/2 | 0 | 30.3 | 33.0 | 28.0 / 28.0 | 7.0 / 7.0 | 5.0 / 5.0 (0/1) | 15.0 / 15.0 (0/1) | — | — | — / — | 50 % |
| obj-bottle | object | 1 | NOT_APPLICABLE | 3876 | 3929 8411902004089 | 90/468 | 0 | 30.3 | 33.0 | 18.0 / 21.0 | 4.0 / 4.0 | 3.0 / 4.0 (14/201) | 12.0 / 14.0 (32/91) | 0.0 / 1.0 (44/160) | 1.0 / 1.0 (0/16) | 171 / 4 | 16 % |
| obj-can | object | 1 | NOT_APPLICABLE | 4976 | 5110 8437019462024 | 32/399 | 0 | 30.3 | 33.0 | 19.0 / 22.0 | 4.0 / 4.0 | 3.0 / 4.0 (0/178) | 12.0 / 13.0 (23/89) | 0.0 / 1.0 (0/87) | 0.0 / 1.0 (9/45) | 156 / 78 | 25 % |
| obj-milk-carton | object | 1 | NOT_APPLICABLE | 258 | 358 8410297112386 | 34/429 | 0 | 30.3 | 33.0 | 19.0 / 21.0 | 4.0 / 4.0 | 3.0 / 4.0 (0/178) | 12.0 / 13.0 (26/89) | 0.0 / 1.0 (8/153) | 0.0 / 1.0 (0/9) | 95 / 8 | 26 % |
| obj-oreo | object | 1 | NOT_APPLICABLE | 2657 | 2791 7622201817794 | 21/453 | 0 | 30.3 | 33.0 | 19.0 / 23.0 | 4.0 / 5.0 | 3.0 / 4.0 (0/176) | 12.0 / 14.0 (21/88) | 0.0 / 1.0 (0/166) | 0.0 / 1.0 (0/23) | 134 / 5 | 26 % |

Events per scene: ean-12cm=159, ean-18cm=224, ean-25cm=229, ean-30cm=233, ean-approach-40cm=250, ean-curved-can=153, ean-enter-edge=251, ean-glare=196, ean-hand-motion=222, ean-human-digits=203, ean-low-light=208, ean-partial=190, ean-scratched=159, ean-small=200, ean-small-bottle=181, ean-two-codes=198, ean-yaw-30=194, ean-yaw-60=209, loop-60s=1359, obj-banana=1, obj-bottle=201, obj-can=178, obj-milk-carton=178, obj-oreo=176

## Phase 0 GATES (decision package Phase 0 acceptance) — **GO**
| gate | measured | result |
|---|---|---|
| locate+roi per-frame p95 ≤ 40 ms (pooled over barcode frames) | p50 4.0 / p95 5.0 ms (saliency p95 4.0 + roi p95 1.0, n=3370) | PASS |
| ≥ 15 fps PROCESSED sustained 60 s (loop-60s) | 22.7 fps processed (min second 16); camera presented 30.0 fps, rVFC callbacks 29.9/s (first 5 s 30.0 → last 5 s 30.0) | PASS |
| CPU proxy ≤ 60 % of one core (worker duty + main-thread capture share) | worker 9 % localize + 16 % decode = 25 %; main-thread capture→luma 14.0/18.0 ms p50/p95 × 22.7 fps = 32 %; combined 57 % | PASS |
| corpus ≥ 20 scenes × ≥ 3 s | 23 scenes ≥ 3 s (24 recorded, 107 frames stored) | PASS |

## Phase 1 headline targets measured on this corpus (diagnostic — NOT Phase 0 gates)
| target | measured | result |
|---|---|---|
| wrong codes = 0 (headline: CONFIRMED wrong values) | 0 confirmed wrong value(s); 1 MISREAD scene(s) vs declared 8480000511461 (P1 scenes only, 3 raw hit(s) differ); 4 raw single-frame read(s) contradicting the scene majority (ean-human-digits: 8410297112386×97 vs 0470787112386×2; ean-yaw-30: 8480000511461×91 vs 0016100004510×1 vs 0016100001151×1) | misses |
| EAN-13 completion 12–30 cm p50 ≤ 0.7 s / p95 ≤ 2.0 s (headline) | p50 130 ms / p95 176 ms over 2 confirmed scene(s); NEVER confirmed: ean-12cm, ean-18cm | misses |
| two consecutive frames agreeing on a WRONG value (fast-lane hazard) | none observed | meets |

Verdict counts (rescored on the Mac, declared code scoped to the P1 scenes): NO_DECODE=3, MISREAD=1, DECODED_CONFIRMED=14, NOT_APPLICABLE=6
