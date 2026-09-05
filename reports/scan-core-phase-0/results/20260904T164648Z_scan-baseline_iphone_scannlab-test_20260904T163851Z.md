# iPhone  — iOS 18.7 — Safari 26.6.1 — standalone_pwa

Bundle `20260904T164648Z_scan-baseline_iphone_scannlab-test_20260904T163851Z.zip` · session 89c942fd-ee6b-49cc-ba89-0e98bbc56591 · created 2026-09-04T16:38:51.640Z · exported 2026-09-04T16:46:44.413Z · harness scan-lab-baseline/0.1.0+ed94869f · session name Scannlab test

## Device + camera
| item | value |
|---|---|
| screen / dpr / cores / memory | 430×932 / 3 / 4 / — GB |
| requested | 1920×1080 @ 30 (environment) |
| delivered | 1080×1920 @ 30 · Tylny aparat · facing environment · open 252 ms · first frame 552 ms · autofocus not exposed · start sharpness 1313 / mean 110 |
| form factor | mobile |
| probe resolution_switch | 1: → 1280×720: apply 258 ms, gap 2 ms, 61 fr/2 s, 720×1280 z1, sharp 652→[647 619 620 632 613 673 653 694 689 803], mean 109→[110 110 109 107 108 109 109 110 109 111]<br>1: → 1920×1080: apply 264 ms, gap 2 ms, 56 fr/2 s, 1080×1920 z1, sharp 803→[921 1056 1161 1092 1096 1236 1519 1522 1348 1499], mean 111→[111 113 113 112 113 112 113 112 112 109]<br>2: → 1280×720: apply 259 ms, gap 1 ms, 61 fr/2 s, 720×1280 z1, sharp 1499→[1021 1232 1084 1128 851 2153 1444 448 353 829], mean 109→[105 101 104 110 117 114 113 114 119 116]<br>2: → 1920×1080: apply 267 ms, gap 1 ms, 55 fr/2 s, 1080×1920 z1, sharp 829→[150 182 86 185 219 1171 884 826 763 1574], mean 116→[122 108 101 101 116 112 111 112 112 111]<br>3: → 1280×720: apply 263 ms, gap 1 ms, 61 fr/2 s, 720×1280 z1, sharp 1574→[1526 1598 1841 1683 1970 1938 1692 1834 1946 1814], mean 111→[117 120 118 116 115 113 112 109 109 109]<br>3: → 1920×1080: apply 263 ms, gap 1 ms, 62 fr/2 s, 1080×1920 z1, sharp 1814→[2125 2118 2142 2052 1677 1936 1833 1558 1584 1955], mean 109→[111 111 112 112 112 114 114 113 113 112] |
| cameras seen | Tylny aparat r0; Tylny aparat trójobiektywowy r1; Tylny dwuobiektywowy aparat szerokokątny r1; Tylny aparat dwuobiektywowy r1; Tylny aparat ultraszerokokątny (ultra-wide?) r4; Tylny aparat długoogniskowy r5; Przedni aparat r6 |
| zoom | 1–10 · apply ok (1 → 2, 1 ms) |
| torch | exposed · apply ok (7 ms) |
| focusMode exposed | no |
| worker | zxing-wasm 3.1.3 · warm-up 265 ms · OffscreenCanvas yes |
| loop (last scene) | video_frame_callback · presented 1799 · processed 1261 · dropped(decode busy) 538 · cadence p50/p95 33.0 / 50.0 ms · visibility events 0 |
| transfer | rgba_buffer · main→worker p50/p95 0.0 / 1.0 ms · reply p50/p95 0.0 / 1.0 ms · buffer reuse 1261 / alloc 0 · round-trip minus worker-busy p50/p95 0.0/1.0 ms |
| main-thread capture→luma | 14.0 / 17.0 ms p50/p95 over 6365 processed frames |
| loop-60s frames | presented 1799 · surfaced 1799 (camera-side skipped 0) · processed 1261 · dropped(busy) 538 |
| client hints | none (Safari, or hints refused) — reduced UA only |
| camera auto-switch | re-opened on the ranked primary; first delivery was Tylny aparat trójobiektywowy 1080×1920 |

## Scenes
| scene | kind | att | verdict | 1st hit ms | confirmed ms | hits/att | misread | fps p50 | cadence p50 | worker RT p50/p95 | localize p50/p95 | full_cheap p50/p95 (hits) | full_harder p50/p95 (hits) | roi p50/p95 (hits) | rect p50/p95 (hits) | cand px / |°| | dropped |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ean-12cm | barcode | 1 | NO_DECODE | — | — | 0/528 | 0 | 30.3 | 33.0 | 18.0 / 20.0 | 4.0 / 4.0 | 3.0 / 4.0 (0/219) | 11.0 / 11.0 (0/109) | 0.0 / 1.0 (0/197) | 1.0 / 2.0 (0/3) | 49 / 1 | 8 % |
| ean-18cm | barcode | 1 | NO_DECODE | — | — | 0/558 | 0 | 30.3 | 33.0 | 18.0 / 20.0 | 4.0 / 4.0 | 3.0 / 4.0 (0/223) | 11.0 / 12.0 (0/112) | 0.0 / 1.0 (0/223) | — | 147 / 1 | 7 % |
| ean-25cm | barcode | 1 | DECODED_CONFIRMED | 12 | 123 7622201492786 | 209/498 | 0 | 30.3 | 33.0 | 8.0 / 19.0 | 4.0 / 4.0 | 3.0 / 4.0 (132/234) | 11.0 / 12.0 (22/30) | 0.0 / 1.0 (55/234) | — | 145 / 1 | 2 % |
| ean-30cm | barcode | 1 | DECODED_CONFIRMED | 102 | 193 7622201492786 | 172/497 | 0 | 30.3 | 33.0 | 8.0 / 20.0 | 4.0 / 4.0 | 3.0 / 4.0 (81/220) | 11.0 / 12.0 (46/57) | 0.0 / 1.0 (45/220) | — | 170 / 89 | 8 % |
| ean-approach-40cm | barcode | 1 | DECODED_UNCONFIRMED | 3546 | — | 1/534 | 0 | 30.3 | 33.0 | 18.0 / 20.0 | 4.0 / 4.0 | 3.0 / 4.0 (0/209) | 11.0 / 12.0 (1/104) | 0.0 / 1.0 (0/207) | 0.0 / 3.0 (0/14) | 52 / 89 | 30 % |
| ean-curved-can | barcode | 1 | DECODED_CONFIRMED | 373 | 473 8411092731130 | 93/547 | 0 | 30.3 | 33.0 | 17.0 / 21.0 | 3.0 / 4.0 | 3.0 / 4.0 (0/219) | 12.0 / 13.0 (93/109) | 0.0 / 1.0 (0/219) | — | 197 / 89 | 9 % |
| ean-enter-edge | barcode | 1 | NO_DECODE | — | — | 0/541 | 0 | 30.3 | 33.0 | 18.0 / 21.0 | 4.0 / 5.0 | 3.0 / 4.0 (0/246) | 11.0 / 12.0 (0/123) | 0.0 / 1.0 (0/171) | 1.0 / 1.0 (0/1) | 51 / 1 | 18 % |
| ean-glare | barcode | 1 | DECODED_CONFIRMED | 2342 | 2542 8426617014032 | 22/438 | 0 | 30.3 | 33.0 | 19.0 / 23.0 | 4.0 / 5.0 | 4.0 / 4.0 (4/178) | 12.0 / 13.0 (5/85) | 0.0 / 1.0 (13/151) | 0.0 / 1.0 (0/24) | 96 / 3 | 25 % |
| ean-hand-motion | barcode | 1 | DECODED_CONFIRMED | 859 | 2259 8426617014032 | 12/592 | 0 | 30.3 | 33.0 | 18.0 / 21.0 | 4.0 / 4.0 | 3.0 / 4.0 (1/251) | 11.0 / 13.0 (2/125) | 0.0 / 1.0 (9/207) | 0.0 / 1.0 (0/9) | 75 / 3 | 16 % |
| ean-human-digits | barcode | 1 | DECODED_CONFIRMED | 1979 | 2033 8410297112386 | 306/511 | 0 | 30.3 | 33.0 | 8.0 / 20.0 | 4.0 / 4.0 | 3.0 / 4.0 (126/231) | 11.0 / 13.0 (13/49) | 0.0 / 1.0 (167/231) | — | 242 / 3 | 3 % |
| ean-low-light | barcode | 1 | DECODED_CONFIRMED | 1407 | 1507 8426617014032 | 150/512 | 0 | 30.3 | 33.0 | 9.0 / 20.0 | 4.0 / 4.0 | 3.0 / 4.0 (48/216) | 12.0 / 13.0 (31/76) | 0.0 / 1.0 (71/209) | 0.0 / 1.0 (0/11) | 122 / 2 | 10 % |
| ean-partial | barcode | 1 | NO_DECODE | — | — | 0/531 | 0 | 30.3 | 33.0 | 18.0 / 20.0 | 4.0 / 4.0 | 3.0 / 4.0 (0/216) | 11.0 / 12.0 (0/108) | 0.0 / 1.0 (0/207) | — | 218 / 1 | 10 % |
| ean-scratched | barcode | 1 | DECODED_CONFIRMED | 1075 | 1175 8480000105745 | 283/483 | 0 | 30.3 | 33.0 | 10.0 / 18.0 | 4.0 / 5.0 | 4.0 / 5.0 (193/233) | 11.0 / 15.0 (3/18) | 0.0 / 1.0 (87/232) | — | 168 / 0 | 2 % |
| ean-small | barcode | 1 | DECODED_CONFIRMED | 2608 | 2774 4305615614434 | 5/532 | 0 | 30.3 | 33.0 | 19.0 / 20.0 | 4.0 / 4.0 | 3.0 / 4.0 (0/207) | 12.0 / 13.0 (5/103) | 0.0 / 1.0 (0/200) | 0.0 / 0.0 (0/22) | 49 / 9 | 12 % |
| ean-small-bottle | barcode | 1 | DECODED_CONFIRMED | 9 | 159 8480000235138 | 60/508 | 0 | 30.3 | 33.0 | 19.0 / 21.0 | 4.0 / 4.0 | 3.0 / 4.0 (0/210) | 12.0 / 13.0 (60/105) | 0.0 / 1.0 (0/189) | 0.0 / 1.0 (0/4) | 194 / 87 | 12 % |
| ean-two-codes | barcode | 1 | DECODED_CONFIRMED | 11 | 244 8480000105745 | 413/469 | 0 | 30.3 | 33.0 | 10.0 / 11.0 | 4.0 / 5.0 | 4.0 / 5.0 (207/233) | 11.0 / 16.0 (2/3) | 0.0 / 1.0 (204/233) | — | 196 / 4 | 2 % |
| ean-yaw-30 | barcode | 1 | DECODED_CONFIRMED | 7313 | 7353 7622201492786 | 22/575 | 0 | 30.3 | 33.0 | 19.0 / 21.0 | 4.0 / 4.0 | 3.0 / 4.0 (0/208) | 12.0 / 13.0 (7/104) | 0.0 / 1.0 (15/208) | 0.0 / 1.0 (0/55) | 173 / 8 | 13 % |
| ean-yaw-60 | barcode | 1 | DECODED_CONFIRMED | 2344 | 2544 7622201492786 | 137/501 | 0 | 30.3 | 33.0 | 18.0 / 23.0 | 4.0 / 5.0 | 4.0 / 4.0 (23/181) | 12.0 / 14.0 (39/77) | 0.0 / 1.0 (70/181) | 1.0 / 1.0 (5/62) | 177 / 8 | 24 % |
| loop-60s | object | 1 | NOT_APPLICABLE | 105 | 309 8426617014032 | 535/3109 | 0 | 30.3 | 33.0 | 19.0 / 23.0 | 4.0 / 4.0 | 3.0 / 4.0 (60/1261) | 12.0 / 14.0 (252/586) | 0.0 / 1.0 (223/1261) | 1.0 / 1.0 (0/1) | 192 / 4 | 30 % |
| obj-apple | object | 1 | NOT_APPLICABLE | — | — | 0/276 | 0 | 30.3 | 33.0 | 18.0 / 20.0 | 3.0 / 4.0 | 3.0 / 4.0 (0/184) | 11.0 / 13.0 (0/92) | — | — | — / — | 23 % |
| obj-banana | object | 1 | NOT_APPLICABLE | — | — | 0/279 | 0 | 30.3 | 33.0 | 18.0 / 20.0 | 3.0 / 4.0 | 3.0 / 4.0 (0/186) | 11.0 / 13.0 (0/93) | — | — | — / — | 22 % |
| obj-bottle | object | 1 | NOT_APPLICABLE | 4976 | 5076 8411902004089 | 12/467 | 0 | 30.3 | 33.0 | 19.0 / 21.0 | 4.0 / 4.0 | 3.0 / 4.0 (0/205) | 12.0 / 13.0 (5/102) | 0.0 / 1.0 (7/138) | 0.0 / 1.0 (0/22) | 210 / 85 | 14 % |
| obj-can | object | 1 | NOT_APPLICABLE | 6259 | 6359 8437019462024 | 32/441 | 0 | 30.3 | 33.0 | 19.0 / 21.0 | 4.0 / 4.0 | 3.0 / 4.0 (0/204) | 12.0 / 13.0 (17/102) | 0.0 / 1.0 (0/81) | 0.0 / 1.0 (15/54) | 147 / 59 | 15 % |
| obj-milk-carton | object | 1 | NOT_APPLICABLE | 97 | 159 8410297112386 | 52/443 | 0 | 30.3 | 33.0 | 19.0 / 22.0 | 4.0 / 4.0 | 4.0 / 4.0 (0/178) | 12.0 / 13.0 (35/89) | 0.0 / 1.0 (17/157) | 0.0 / 1.0 (0/19) | 96 / 3 | 25 % |
| obj-oreo | object | 1 | NOT_APPLICABLE | 5741 | 6574 7622201817794 | 5/523 | 0 | 30.3 | 33.0 | 19.0 / 21.0 | 3.0 / 4.0 | 3.0 / 4.0 (0/199) | 12.0 / 13.0 (5/99) | 0.0 / 1.0 (0/168) | 0.0 / 1.0 (0/57) | 97 / 7 | 17 % |

Events per scene: ean-12cm=219, ean-18cm=223, ean-25cm=234, ean-30cm=220, ean-approach-40cm=209, ean-curved-can=219, ean-enter-edge=246, ean-glare=178, ean-hand-motion=251, ean-human-digits=231, ean-low-light=216, ean-partial=216, ean-scratched=233, ean-small=207, ean-small-bottle=210, ean-two-codes=233, ean-yaw-30=208, ean-yaw-60=181, loop-60s=1261, obj-apple=184, obj-banana=186, obj-bottle=205, obj-can=204, obj-milk-carton=178, obj-oreo=199

## Phase 0 GATES (decision package Phase 0 acceptance) — **GO**
| gate | measured | result |
|---|---|---|
| locate+roi per-frame p95 ≤ 40 ms (pooled over barcode frames) | p50 4.0 / p95 5.0 ms (saliency p95 4.0 + roi p95 1.0, n=3719) | PASS |
| ≥ 15 fps PROCESSED sustained 60 s (loop-60s) | 21.0 fps processed (min second 15); camera presented 30.0 fps, rVFC callbacks 30.0/s (first 5 s 30.0 → last 5 s 30.0) | PASS |
| CPU proxy ≤ 60 % of one core (worker duty + main-thread capture share) | worker 8 % localize + 20 % decode = 28 %; main-thread capture→luma 14.0/17.0 ms p50/p95 × 21.0 fps = 29 %; combined 57 % | PASS |
| corpus ≥ 20 scenes × ≥ 3 s | 25 scenes ≥ 3 s (25 recorded, 103 frames stored) | PASS |

## Phase 1 headline targets measured on this corpus (diagnostic — NOT Phase 0 gates)
| target | measured | result |
|---|---|---|
| wrong codes = 0 (headline: CONFIRMED wrong values) | 0 confirmed wrong value(s); 0 MISREAD scene(s) (no declared code); 27 raw single-frame read(s) contradicting the scene majority (ean-30cm: 7622201492786×150 vs 2627201492786×22; ean-curved-can: 8411092731130×90 vs 3458092731130×2 vs 4232237790713×1; ean-hand-motion: 8426617014032×11 vs 2400651014032×1; ean-low-light: 8426617014032×149 vs 7232410116023×1) | meets |
| EAN-13 completion 12–30 cm p50 ≤ 0.7 s / p95 ≤ 2.0 s (headline) | p50 123 ms / p95 193 ms over 2 confirmed scene(s); NEVER confirmed: ean-12cm, ean-18cm | misses |
| two consecutive frames agreeing on a WRONG value (fast-lane hazard) | ean-30cm: 2627201492786 at 4394 ms (frames 129/131) | misses |

Verdict counts (rescored on the Mac, declared code scoped to the P1 scenes): NO_DECODE=4, DECODED_CONFIRMED=13, DECODED_UNCONFIRMED=1, NOT_APPLICABLE=7
