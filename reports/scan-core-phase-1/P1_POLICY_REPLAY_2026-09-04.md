# Adaptive policy — offline replay over the Phase 0 corpus

Outcome column = decode approximated by the recorded variant closest to the chosen path (see file header). "wrong" = the replayed confirmation disagrees with the scene reference (declared code on the P1 scenes, otherwise the scene majority).

## Realme  — Chrome 142.0 — chrome_tab (20260904T153533Z_scan-baseline_realme_chrome_20260904T152728Z)
| scene | dominant path (share) | 2nd path | reason (dominant) | replay confirmation | Phase 0 first hit | reference |
|---|---|---|---|---|---|---|
| ean-12cm | NATIVE_ROI (57 %) | LOW_MEDIUM (38 %) | fill 0.32, module 3.6 px: native crop, margin 0.15 (tables 2–3) | 389 ms (fast) 7622201492786 | 30 ms | 7622201492786 |
| ean-18cm | LOW_MEDIUM (49 %) | NATIVE_ROI (47 %) | fill 0.38 ≥ 0.35: module 2.2 px on MEDIUM (table 3) | 456 ms (fast) 7622201492786 | 31 ms | 7622201492786 |
| ean-25cm | LOW_MEDIUM (50 %) | NATIVE_ROI (36 %) | fill 0.52 ≥ 0.35: module 3.0 px on MEDIUM (table 3) | 5422 ms (fast) 7622201492786 | 1935 ms | 7622201492786 |
| ean-30cm | LOW_MEDIUM (67 %) | NATIVE_ROI (27 %) | fill 0.67 ≥ 0.35: module 3.8 px on MEDIUM (table 3) | 1288 ms (fast) 7622201492786 | 999 ms | 7622201492786 |
| ean-approach-40cm | LOW_MEDIUM (45 %) | NATIVE_ROI (44 %) | fill 0.36 ≥ 0.35: module 2.1 px on MEDIUM (table 3) | not confirmed | — | — |
| ean-small | NATIVE_ROI (30 %) | FAR_NATIVE_ROI (28 %) | fill 0.18, module 2.1 px: native crop, margin 0.25; unstable (tables 2–3) | not confirmed | — | 4305615614434 |
| ean-curved-can | NATIVE_ROI (77 %) | LOW_MEDIUM (21 %) | fill 0.34, module 3.9 px: native crop, margin 0.15 (tables 2–3) | 7416 ms (fast) 8411092731130 | 359 ms | 8411092731130 |
| ean-glare | NATIVE_ROI (88 %) | SKIP_BLUR (12 %) | fill 0.32, module 3.6 px: native crop, margin 0.15 (tables 2–3) | 1914 ms (consensus) 8426617014032 | 496 ms | 8426617014032 |
| ean-hand-motion | NATIVE_ROI (59 %) | SKIP_NO_CANDIDATE (13 %) | fill 0.33, module 3.8 px: native crop, margin 0.15 (tables 2–3) | 1606 ms (fast) 8426617014032 | 1460 ms | 8426617014032 |
| ean-low-light | NATIVE_ROI (55 %) | LOW_MEDIUM (19 %) | fill 0.21, module 2.3 px: native crop, margin 0.15 (tables 2–3) | 2292 ms (fast) 8426617014032 | 1986 ms | 8426617014032 |
| ean-two-codes | NATIVE_ROI (88 %) | SKIP_BLUR (8 %) | fill 0.21, module 2.4 px: native crop, margin 0.15 (tables 2–3) | 372 ms (fast) 8480000105745 | 177 ms | 8480000105745/8410297112386 |

## Iphone — Chrome iOS 152.0 — browser_tab (20260904T155038Z_scan-baseline_iphone_chrome_20260904T153706Z)
| scene | dominant path (share) | 2nd path | reason (dominant) | replay confirmation | Phase 0 first hit | reference |
|---|---|---|---|---|---|---|
| ean-12cm | NATIVE_ROI (94 %) | FAR_NATIVE_ROI (4 %) | fill 0.16, module 1.8 px: native crop, margin 0.25, harder after 2 misses (tables 2–3) | 6728 ms (fast) 7622201492786 | 4261 ms | 7622201492786 |
| ean-18cm | NATIVE_ROI (100 %) | — | fill 0.20, module 2.3 px: native crop, margin 0.15 (tables 2–3) | 243 ms (fast) 7622201492786 | 144 ms | 7622201492786 |
| ean-25cm | NATIVE_ROI (81 %) | FAR_NATIVE_ROI (15 %) | fill 0.16, module 1.8 px: native crop, margin 0.25; unstable (tables 2–3) | 412 ms (fast) 7622201492786 | 312 ms | 7622201492786 |
| ean-30cm | NATIVE_ROI (68 %) | FAR_NATIVE_ROI (30 %) | fill 0.25, module 2.8 px: native crop, margin 0.15; unstable (tables 2–3) | 1212 ms (consensus) 7622201492786 | 145 ms | 7622201492786 |
| ean-approach-40cm | FAR_NATIVE_ROI (76 %) | NATIVE_ROI (14 %) | module 0.28 px < 1.7 (table 2: 15 % wrong reads at ≤ 1.5 px): native crop, harder, slow lane | not confirmed | 6648 ms | 7622201492786 |
| ean-small | FAR_NATIVE_ROI (69 %) | NATIVE_ROI (24 %) | module 0.29 px < 1.7 (table 2: 15 % wrong reads at ≤ 1.5 px): native crop, harder, slow lane | 3624 ms (consensus) 4305615614434 | 3191 ms | 4305615614434 |
| ean-curved-can | NATIVE_ROI (81 %) | FAR_NATIVE_ROI (18 %) | fill 0.19, module 2.1 px: native crop, margin 0.25 (tables 2–3) | not confirmed | 7639 ms | 8411092731130 |
| ean-glare | NATIVE_ROI (69 %) | FAR_NATIVE_ROI (22 %) | fill 0.19, module 2.1 px: native crop, margin 0.25 (tables 2–3) | 4310 ms (consensus) 8426617014032 | 3977 ms | 8426617014032 |
| ean-hand-motion | NATIVE_ROI (53 %) | FAR_NATIVE_ROI (38 %) | fill 0.16, module 1.8 px: native crop, margin 0.25; unstable (tables 2–3) | 2111 ms (fast) 8426617014032 | 1544 ms | 8426617014032 |
| ean-low-light | NATIVE_ROI (73 %) | SKIP_BLUR (15 %) | fill 0.18, module 2.0 px: native crop, margin 0.25 (tables 2–3) | 962 ms (consensus) 8426617014032 | 12 ms | 8426617014032 |
| ean-two-codes | NATIVE_ROI (100 %) | — | fill 0.21, module 2.4 px: native crop, margin 0.15 (tables 2–3) | 114 ms (fast) 8480000105745 | 20 ms | 8480000105745/8410297112386 |

## Galaxy — Samsung Internet 30.0 — browser_tab (20260904T160033Z_scan-baseline_galaxy_internet-browser_20260904T155251Z)
| scene | dominant path (share) | 2nd path | reason (dominant) | replay confirmation | Phase 0 first hit | reference |
|---|---|---|---|---|---|---|
| ean-12cm | NATIVE_ROI (100 %) | — | fill 0.29, module 3.3 px: native crop, margin 0.15 (tables 2–3) | 442 ms (fast) 7622201492786 | 246 ms | 7622201492786 |
| ean-18cm | NATIVE_ROI (100 %) | — | fill 0.25, module 2.8 px: native crop, margin 0.15 (tables 2–3) | 1530 ms (fast) 7622201492786 | 1283 ms | 7622201492786 |
| ean-25cm | NATIVE_ROI (83 %) | LOW_MEDIUM (15 %) | fill 0.20, module 2.3 px: native crop, margin 0.15 (tables 2–3) | 438 ms (fast) 7622201492786 | 26 ms | 7622201492786 |
| ean-30cm | LOW_MEDIUM (98 %) | NATIVE_ROI (2 %) | fill 0.62 ≥ 0.35: module 3.5 px on MEDIUM (table 3) | 962 ms (fast) 7622201492786 | 493 ms | 7622201492786 |
| ean-approach-40cm | LOW_MEDIUM (84 %) | NATIVE_ROI (7 %) | fill 0.36 ≥ 0.35: module 2.0 px on MEDIUM (table 3) | not confirmed | — | — |
| ean-small | NATIVE_ROI (51 %) | SKIP_NO_CANDIDATE (24 %) | fill 0.16, module 1.8 px: native crop, margin 0.25; unstable (tables 2–3) | not confirmed | 7660 ms | 4305615614434 |
| ean-curved-can | LOW_MEDIUM (53 %) | NATIVE_ROI (43 %) | fill 0.39 ≥ 0.35: module 2.2 px on MEDIUM (table 3) | 802 ms (fast) 8411092731130 | 154 ms | 8411092731130 |
| ean-glare | NATIVE_ROI (93 %) | SKIP_BLUR (7 %) | fill 0.30, module 3.4 px: native crop, margin 0.15 (tables 2–3) | 226 ms (fast) 8426617014032 | 16 ms | 8426617014032 |
| ean-hand-motion | NATIVE_ROI (43 %) | LOW_MEDIUM (39 %) | fill 0.35, module 4.0 px: native crop, margin 0.15; unstable (tables 2–3) | 330 ms (fast) 7622201492786 | 189 ms | 7622201492786 |
| ean-low-light | NATIVE_ROI (52 %) | LOW_MEDIUM (20 %) | fill 0.33, module 3.7 px: native crop, margin 0.15; unstable (tables 2–3) | 350 ms (fast) 7622201492786 | 191 ms | 7622201492786 |
| ean-two-codes | LOW_MEDIUM (60 %) | NATIVE_ROI (39 %) | fill 0.56 ≥ 0.35: module 3.2 px on MEDIUM (table 3) | 411 ms (fast) 8480000105745 | 37 ms | 8480000105745/8410297112386 |

## Note — Chrome 147.0 — chrome_tab (20260904T163605Z_scan-baseline_note_chrome_20260904T162825Z)
| scene | dominant path (share) | 2nd path | reason (dominant) | replay confirmation | Phase 0 first hit | reference |
|---|---|---|---|---|---|---|
| ean-12cm | LOW_MEDIUM (68 %) | NATIVE_ROI (27 %) | fill 0.36 ≥ 0.35: module 2.1 px on MEDIUM (table 3) | 321 ms (fast) 7622201492786 | 23 ms | 7622201492786 |
| ean-18cm | NATIVE_ROI (100 %) | — | fill 0.24, module 2.7 px: native crop, margin 0.15 (tables 2–3) | 204 ms (fast) 7622201492786 | 30 ms | 7622201492786 |
| ean-25cm | NATIVE_ROI (62 %) | LOW_MEDIUM (36 %) | fill 0.32, module 3.7 px: native crop, margin 0.15 (tables 2–3) | 3244 ms (fast) 7622201492786 | 202 ms | 7622201492786 |
| ean-30cm | LOW_MEDIUM (98 %) | NATIVE_ROI (2 %) | fill 0.64 ≥ 0.35: module 3.7 px on MEDIUM (table 3) | 615 ms (consensus) 7622201492786 | 14 ms | 7622201492786 |
| ean-approach-40cm | LOW_MEDIUM (97 %) | SKIP_BLUR (1 %) | fill 0.52 ≥ 0.35: module 2.9 px on MEDIUM (table 3) | not confirmed | 1329 ms | 0011121162720 |
| ean-small | NATIVE_ROI (87 %) | FAR_NATIVE_ROI (8 %) | fill 0.25, module 2.8 px: native crop, margin 0.15 (tables 2–3) | not confirmed | 782 ms | 4305615614434 |
| ean-curved-can | NATIVE_ROI (69 %) | LOW_MEDIUM (27 %) | fill 0.33, module 3.7 px: native crop, margin 0.15 (tables 2–3) | 3423 ms (fast) 8411092731130 | 1229 ms | 8411092731130 |
| ean-glare | NATIVE_ROI (95 %) | FAR_NATIVE_ROI (3 %) | fill 0.34, module 3.9 px: native crop, margin 0.15 (tables 2–3) | 388 ms (fast) 8426617014032 | 15 ms | 8426617014032 |
| ean-hand-motion | NATIVE_ROI (90 %) | SKIP_BLUR (7 %) | fill 0.21, module 2.4 px: native crop, margin 0.15 (tables 2–3) | 6391 ms (fast) 8426617014032 | 727 ms | 8426617014032 |
| ean-low-light | NATIVE_ROI (78 %) | SKIP_BLUR (15 %) | fill 0.21, module 2.4 px: native crop, margin 0.15 (tables 2–3) | 3154 ms (consensus) 8426617014032 | 1664 ms | 8426617014032 |
| ean-two-codes | NATIVE_ROI (100 %) | — | fill 0.25, module 2.9 px: native crop, margin 0.15 (tables 2–3) | 698 ms (fast) 8480000105745 | 16 ms | 8480000105745/8410297112386 |

## iPhone  — Safari 26.6.1 — standalone_pwa (20260904T164648Z_scan-baseline_iphone_scannlab-test_20260904T163851Z)
| scene | dominant path (share) | 2nd path | reason (dominant) | replay confirmation | Phase 0 first hit | reference |
|---|---|---|---|---|---|---|
| ean-12cm | FAR_NATIVE_ROI (90 %) | SKIP_NO_CANDIDATE (9 %) | module 0.30 px < 1.7 (table 2: 15 % wrong reads at ≤ 1.5 px): native crop, harder, slow lane | not confirmed | — | — |
| ean-18cm | NATIVE_ROI (80 %) | FAR_NATIVE_ROI (19 %) | fill 0.21, module 2.4 px: native crop, margin 0.15 (tables 2–3) | not confirmed | — | — |
| ean-25cm | NATIVE_ROI (72 %) | FAR_NATIVE_ROI (24 %) | fill 0.20, module 2.3 px: native crop, margin 0.25 (tables 2–3) | 123 ms (fast) 7622201492786 | 12 ms | 7622201492786 |
| ean-30cm | NATIVE_ROI (54 %) | LOW_MEDIUM (44 %) | fill 0.23, module 2.6 px: native crop, margin 0.15 (tables 2–3) | 293 ms (consensus) 7622201492786 | 102 ms | 7622201492786 |
| ean-approach-40cm | NATIVE_ROI (56 %) | FAR_NATIVE_ROI (42 %) | fill 0.16, module 1.8 px: native crop, margin 0.25, harder after 2 misses (tables 2–3) | not confirmed | — | 8426617014032 |
| ean-small | FAR_NATIVE_ROI (80 %) | NATIVE_ROI (16 %) | module 0.36 px < 1.7 (table 2: 15 % wrong reads at ≤ 1.5 px): native crop, harder, slow lane | 2974 ms (consensus) 4305615614434 | 2608 ms | 4305615614434 |
| ean-curved-can | NATIVE_ROI (96 %) | LOW_MEDIUM (2 %) | fill 0.33, module 3.8 px: native crop, margin 0.15 (tables 2–3) | 1073 ms (fast) 8411092731130 | 940 ms | 8411092731130 |
| ean-glare | FAR_NATIVE_ROI (53 %) | NATIVE_ROI (30 %) | module 0.58 px < 1.7 (table 2: 15 % wrong reads at ≤ 1.5 px): native crop, harder, slow lane | 4776 ms (consensus) 8426617014032 | 3842 ms | 8426617014032 |
| ean-hand-motion | FAR_NATIVE_ROI (61 %) | NATIVE_ROI (20 %) | module 0.53 px < 1.7 (table 2: 15 % wrong reads at ≤ 1.5 px): native crop, harder, slow lane; unstable | 2359 ms (consensus) 8426617014032 | 2192 ms | 8426617014032 |
| ean-low-light | NATIVE_ROI (87 %) | FAR_NATIVE_ROI (10 %) | fill 0.18, module 2.1 px: native crop, margin 0.25; unstable (tables 2–3) | 1507 ms (fast) 8426617014032 | 1407 ms | 8426617014032 |
| ean-two-codes | NATIVE_ROI (95 %) | FAR_NATIVE_ROI (3 %) | fill 0.18, module 2.1 px: native crop, margin 0.25 (tables 2–3) | 378 ms (fast) 8480000105745 | 344 ms | 8480000105745/8410297112386 |

## Iphone — Safari 26.6.1 — safari_tab (20260904T165758Z_scan-baseline_iphone_safari_20260904T165020Z)
| scene | dominant path (share) | 2nd path | reason (dominant) | replay confirmation | Phase 0 first hit | reference |
|---|---|---|---|---|---|---|
| ean-12cm | FAR_NATIVE_ROI (83 %) | NATIVE_ROI (17 %) | module 0.29 px < 1.7 (table 2: 15 % wrong reads at ≤ 1.5 px): native crop, harder, slow lane; unstable | not confirmed | — | — |
| ean-18cm | NATIVE_ROI (89 %) | FAR_NATIVE_ROI (11 %) | fill 0.20, module 2.3 px: native crop, margin 0.15; unstable (tables 2–3) | 6308 ms (consensus) 7622201492786 | 2773 ms | 7622201492786 |
| ean-25cm | NATIVE_ROI (91 %) | FAR_NATIVE_ROI (7 %) | fill 0.16, module 1.8 px: native crop, margin 0.25 (tables 2–3) | 356 ms (fast) 7622201492786 | 156 ms | 7622201492786 |
| ean-30cm | NATIVE_ROI (66 %) | FAR_NATIVE_ROI (34 %) | fill 0.20, module 2.3 px: native crop, margin 0.15 (tables 2–3) | 324 ms (consensus) 7622201492786 | 159 ms | 7622201492786 |
| ean-approach-40cm | FAR_NATIVE_ROI (91 %) | NATIVE_ROI (7 %) | module 0.48 px < 1.7 (table 2: 15 % wrong reads at ≤ 1.5 px): native crop, harder, slow lane | 5320 ms (consensus) 7622201492786 | 3886 ms | 7622201492786 |
| ean-small | FAR_NATIVE_ROI (62 %) | NATIVE_ROI (29 %) | module 0.29 px < 1.7 (table 2: 15 % wrong reads at ≤ 1.5 px): native crop, harder, slow lane | not confirmed | 2841 ms | 4305615614434 |
| ean-curved-can | NATIVE_ROI (94 %) | LOW_MEDIUM (4 %) | fill 0.18, module 2.0 px: native crop, margin 0.25 (tables 2–3) | 1606 ms (consensus) 8411092731130 | 939 ms | 8411092731130 |
| ean-glare | NATIVE_ROI (72 %) | FAR_NATIVE_ROI (27 %) | fill 0.17, module 2.0 px: native crop, margin 0.25; unstable (tables 2–3) | 4577 ms (consensus) 8426617014032 | 2393 ms | 8426617014032 |
| ean-hand-motion | NATIVE_ROI (41 %) | FAR_NATIVE_ROI (30 %) | fill 0.16, module 1.8 px: native crop, margin 0.25; unstable (tables 2–3) | not confirmed | 706 ms | 8426617014032 |
| ean-low-light | NATIVE_ROI (76 %) | FAR_NATIVE_ROI (19 %) | fill 0.16, module 1.8 px: native crop, margin 0.25; unstable (tables 2–3) | 460 ms (fast) 8426617014032 | 360 ms | 8426617014032 |
| ean-two-codes | NATIVE_ROI (70 %) | LOW_MEDIUM (30 %) | fill 0.23, module 2.7 px: native crop, margin 0.15 (tables 2–3) | 274 ms (fast) 8480000105745 | 8 ms | 8480000105745/8410297112386 |

## Realme  — Chrome 125.0 — chrome_tab (scan-baseline_realme_internet-browser_20260904T151433Z)
| scene | dominant path (share) | 2nd path | reason (dominant) | replay confirmation | Phase 0 first hit | reference |
|---|---|---|---|---|---|---|
| ean-12cm | LOW_MEDIUM (75 %) | NATIVE_ROI (23 %) | fill 0.41 ≥ 0.35: module 2.3 px on MEDIUM (table 3) | 784 ms (fast) 7622201492786 | 36 ms | 7622201492786 |
| ean-18cm | LOW_MEDIUM (73 %) | NATIVE_ROI (16 %) | fill 0.55 ≥ 0.35: module 3.1 px on MEDIUM (table 3) | not confirmed | 5492 ms | 7622201492786 |
| ean-25cm | LOW_MEDIUM (100 %) | — | fill 0.48 ≥ 0.35: module 2.7 px on MEDIUM (table 3) | not confirmed | — | 7622201492786 |
| ean-30cm | LOW_MEDIUM (90 %) | NATIVE_ROI (8 %) | fill 0.59 ≥ 0.35: module 3.4 px on MEDIUM (table 3) | not confirmed | — | 7622201492786 |
| ean-approach-40cm | LOW_MEDIUM (72 %) | NATIVE_ROI (26 %) | fill 0.37 ≥ 0.35: module 2.1 px on MEDIUM (table 3) | not confirmed | — | 7622201492786 |
| ean-small | NATIVE_ROI (50 %) | LOW_MEDIUM (25 %) | fill 0.25, module 2.8 px: native crop, margin 0.15; unstable (tables 2–3) | not confirmed | 6766 ms | 4305615614434 |
| ean-curved-can | NATIVE_ROI (44 %) | SKIP_BLUR (21 %) | fill 0.27, module 3.0 px: native crop, margin 0.15 (tables 2–3) | not confirmed | 1317 ms | 8411092731130 |
| ean-glare | NATIVE_ROI (100 %) | — | fill 0.32, module 3.6 px: native crop, margin 0.15 (tables 2–3) | 473 ms (fast) 8426617014032 | 338 ms | 8426617014032 |
| ean-hand-motion | NATIVE_ROI (45 %) | LOW_MEDIUM (30 %) | fill 0.25, module 2.8 px: native crop, margin 0.15; unstable (tables 2–3) | 1349 ms (fast) 7622201492786 | 1250 ms | 7622201492786 |
| ean-low-light | LOW_MEDIUM (41 %) | SKIP_BLUR (27 %) | fill 0.55 ≥ 0.35: module 3.1 px on MEDIUM (table 3) | 2025 ms (fast) 7622201492786 | 1275 ms | 7622201492786 |
| ean-two-codes | NATIVE_ROI (100 %) | — | fill 0.22, module 2.5 px: native crop, margin 0.15 (tables 2–3) | 249 ms (fast) 8480000105745 | 23 ms | 8480000105745 |

Replayed confirmations: 57; wrong confirmations: 0.
