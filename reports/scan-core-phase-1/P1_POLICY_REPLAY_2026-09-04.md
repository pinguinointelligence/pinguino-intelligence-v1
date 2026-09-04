# Adaptive policy — offline replay over the Phase 0 corpus

Outcome column = decode approximated by the recorded variant closest to the chosen path (see file header). "wrong" = the replayed confirmation disagrees with the scene reference (declared code on the P1 scenes, otherwise the scene majority).

## Samsung  — Chrome 147.0 — chrome_tab (bundle-b10)
| scene | dominant path (share) | 2nd path | reason (dominant) | replay confirmation | Phase 0 first hit | reference |
|---|---|---|---|---|---|---|
| ean-12cm | NATIVE_ROI (70 %) | LOW_MEDIUM (23 %) | fill 0.34, module 2.5 px: native crop, margin 0.15 (tables 2–3) | 676 ms (fast) 7622210669315 | 188 ms | 7622210669315 |
| ean-18cm | FAR_NATIVE_ROI (92 %) | SKIP_MOTION (8 %) | module 1.03 px < 1.7 (table 2: 15 % wrong reads at ≤ 1.5 px): native crop, harder, slow lane | 529 ms (slow) 7622210669315 | 135 ms | 7622210669315 |
| ean-25cm | FAR_NATIVE_ROI (82 %) | SKIP_MOTION (18 %) | module 1.53 px < 1.7 (table 2: 15 % wrong reads at ≤ 1.5 px): native crop, harder, slow lane | 596 ms (slow) 7622210669315 | 18 ms | 7622210669315 |
| ean-30cm | FAR_NATIVE_ROI (64 %) | SKIP_MOTION (36 %) | module 1.01 px < 1.7 (table 2: 15 % wrong reads at ≤ 1.5 px): native crop, harder, slow lane | not confirmed | — | 7622210669315 |
| ean-approach-40cm | FAR_NATIVE_ROI (57 %) | SKIP_MOTION (43 %) | module 1.02 px < 1.7 (table 2: 15 % wrong reads at ≤ 1.5 px): native crop, harder, slow lane | not confirmed | — | 7622210669315 |
| ean-small | SKIP_MOTION (36 %) | FAR_NATIVE_ROI (28 %) | stability 0.67 ≥ 0.2 (table 7): MEDIUM crop only | 685 ms (fast) 40279787 | 283 ms | 40279787 |
| ean-curved-can | NATIVE_ROI (36 %) | LOW_MEDIUM (28 %) | fill 0.31, module 2.3 px: native crop, margin 0.15 (tables 2–3) | 589 ms (fast) 8411092731130 | 156 ms | 8411092731130 |
| ean-glare | FAR_NATIVE_ROI (60 %) | SKIP_MOTION (31 %) | module 1.55 px < 1.7 (table 2: 15 % wrong reads at ≤ 1.5 px): native crop, harder, slow lane | 1429 ms (slow) 8426617014032 | 291 ms | 8426617014032 |
| ean-hand-motion | SKIP_MOTION (49 %) | FAR_NATIVE_ROI (42 %) | stability 0.30 ≥ 0.2 (table 7): MEDIUM crop only | 1415 ms (slow) 8426617014032 | 711 ms | 8426617014032 |
| ean-low-light | SKIP_MOTION (44 %) | FAR_NATIVE_ROI (23 %) | stability 0.56 ≥ 0.2 (table 7): MEDIUM crop only | 3805 ms (fast) 8426617014032 | 550 ms | 8426617014032 |
| ean-two-codes | SKIP_MOTION (48 %) | FAR_NATIVE_ROI (31 %) | stability 0.55 ≥ 0.2 (table 7): MEDIUM crop only | 2321 ms (slow) 8480000105745 | 1707 ms | 8480000105745/7622210669315 |

## Iphone — Chrome iOS 152.0 — browser_tab (bundle-iphone)
| scene | dominant path (share) | 2nd path | reason (dominant) | replay confirmation | Phase 0 first hit | reference |
|---|---|---|---|---|---|---|
| ean-12cm | LOW_MEDIUM (71 %) | NATIVE_ROI (24 %) | fill 0.36 ≥ 0.35: module 2.0 px on MEDIUM (table 3) | 5158 ms (fast) 8410297112386 | 5125 ms | 8410297112386 |
| ean-18cm | NATIVE_ROI (71 %) | SKIP_MOTION (20 %) | fill 0.25, module 2.8 px: native crop, margin 0.15 (tables 2–3) | 118 ms (fast) 8410297112386 | 12 ms | 8410297112386 |
| ean-25cm | SKIP_MOTION (49 %) | FAR_NATIVE_ROI (48 %) | stability 0.27 ≥ 0.2 (table 7): MEDIUM crop only | 389 ms (slow) 8410297112386 | 98 ms | 8410297112386 |
| ean-30cm | SKIP_MOTION (53 %) | FAR_NATIVE_ROI (41 %) | stability 0.21 ≥ 0.2 (table 7): MEDIUM crop only | 327 ms (slow) 8410297112386 | 110 ms | 8410297112386 |
| ean-approach-40cm | SKIP_MOTION (62 %) | FAR_NATIVE_ROI (23 %) | stability 0.44 ≥ 0.2 (table 7): MEDIUM crop only | 261 ms (slow) 8410297112386 | 11 ms | 8410297112386 |
| ean-small | SKIP_MOTION (40 %) | NATIVE_ROI (28 %) | stability 0.36 ≥ 0.2 (table 7): MEDIUM crop only | 487 ms (slow) 40279787 | 115 ms | 40279787 |
| ean-curved-can | NATIVE_ROI (81 %) | SKIP_MOTION (11 %) | fill 0.24, module 2.7 px: native crop, margin 0.15 (tables 2–3) | 422 ms (fast) 8411092731130 | 189 ms | 8411092731130 |
| ean-glare | SKIP_MOTION (45 %) | NATIVE_ROI (41 %) | stability 0.30 ≥ 0.2 (table 7): MEDIUM crop only | 646 ms (fast) 8426617014032 | 446 ms | 8426617014032 |
| ean-hand-motion | SKIP_MOTION (55 %) | NATIVE_ROI (32 %) | stability 1.42 ≥ 0.2 (table 7): MEDIUM crop only | 889 ms (fast) 8426617014032 | 289 ms | 8426617014032 |
| ean-low-light | SKIP_MOTION (52 %) | NATIVE_ROI (23 %) | stability 1.44 ≥ 0.2 (table 7): MEDIUM crop only | 1905 ms (slow) 8426617014032 | 905 ms | 8426617014032 |
| ean-two-codes | SKIP_MOTION (51 %) | NATIVE_ROI (48 %) | stability 0.34 ≥ 0.2 (table 7): MEDIUM crop only | 1125 ms (slow) 8411902004089 | 192 ms | 8411902004089/8480000235138 |

## iPhone desktop Scania lab — Safari 26.6.1 — standalone_pwa (bundle-iphone-pwa)
| scene | dominant path (share) | 2nd path | reason (dominant) | replay confirmation | Phase 0 first hit | reference |
|---|---|---|---|---|---|---|
| ean-12cm | SKIP_NO_CANDIDATE (32 %) | FAR_NATIVE_ROI (31 %) | no candidate | not confirmed | — | 8480000511461 |
| ean-18cm | FAR_NATIVE_ROI (82 %) | SKIP_MOTION (15 %) | module 1.28 px < 1.7 (table 2: 15 % wrong reads at ≤ 1.5 px): native crop, harder, slow lane | not confirmed | — | 8480000511461 |
| ean-25cm | NATIVE_ROI (100 %) | SKIP_MOTION (0 %) | fill 0.20, module 2.3 px: native crop, margin 0.15 (tables 2–3) | 130 ms (fast) 8480000511461 | 13 ms | 8480000511461 |
| ean-30cm | NATIVE_ROI (97 %) | SKIP_MOTION (2 %) | fill 0.18, module 2.0 px: native crop, margin 0.25 (tables 2–3) | 176 ms (fast) 8480000511461 | 9 ms | 8480000511461 |
| ean-approach-40cm | FAR_NATIVE_ROI (81 %) | NATIVE_ROI (11 %) | module 1.52 px < 1.7 (table 2: 15 % wrong reads at ≤ 1.5 px): native crop, harder, slow lane | 224 ms (slow) 8480000511461 | 100 ms | 8480000511461 |
| ean-small | SKIP_MOTION (32 %) | FAR_NATIVE_ROI (26 %) | stability 0.61 ≥ 0.2 (table 7): MEDIUM crop only | 1391 ms (slow) 40279787 | 1124 ms | 40279787 |
| ean-curved-can | NATIVE_ROI (92 %) | SKIP_MOTION (8 %) | fill 0.18, module 2.1 px: native crop, margin 0.25 (tables 2–3) | 408 ms (fast) 8411092731130 | 190 ms | 8411092731130 |
| ean-glare | SKIP_MOTION (42 %) | NATIVE_ROI (32 %) | stability 0.23 ≥ 0.2 (table 7): MEDIUM crop only | 4575 ms (fast) 8426617014032 | 4342 ms | 8426617014032 |
| ean-hand-motion | SKIP_MOTION (39 %) | SKIP_NO_CANDIDATE (24 %) | stability 1.37 ≥ 0.2 (table 7): MEDIUM crop only | 291 ms (slow) 8426617014032 | 197 ms | 8426617014032 |
| ean-low-light | SKIP_NO_CANDIDATE (45 %) | SKIP_MOTION (33 %) | no candidate | not confirmed | 725 ms | 8426617014032 |
| ean-two-codes | NATIVE_ROI (68 %) | SKIP_MOTION (26 %) | fill 0.18, module 2.1 px: native crop, margin 0.25 (tables 2–3) | 892 ms (fast) 8480000105745 | 192 ms | 8480000105745/8410297112386 |

## iPhone safari — Safari 26.6.1 — safari_tab (bundle-iphone-safari)
| scene | dominant path (share) | 2nd path | reason (dominant) | replay confirmation | Phase 0 first hit | reference |
|---|---|---|---|---|---|---|
| ean-12cm | SKIP_NO_CANDIDATE (49 %) | SKIP_MOTION (22 %) | no candidate | not confirmed | — | 7622210669315 |
| ean-18cm | FAR_NATIVE_ROI (95 %) | SKIP_MOTION (5 %) | module 1.14 px < 1.7 (table 2: 15 % wrong reads at ≤ 1.5 px): native crop, harder, slow lane | not confirmed | — | 7622210669315 |
| ean-25cm | NATIVE_ROI (54 %) | FAR_NATIVE_ROI (25 %) | fill 0.18, module 2.1 px: native crop, margin 0.25 (tables 2–3) | 174 ms (fast) 7622210669315 | 7 ms | 7622210669315 |
| ean-30cm | SKIP_MOTION (58 %) | FAR_NATIVE_ROI (42 %) | stability 0.82 ≥ 0.2 (table 7): MEDIUM crop only | 392 ms (slow) 7622210669315 | 226 ms | 7622210669315 |
| ean-approach-40cm | SKIP_MOTION (55 %) | FAR_NATIVE_ROI (45 %) | stability 1.42 ≥ 0.2 (table 7): MEDIUM crop only | 5541 ms (slow) 7622210669315 | 3374 ms | 7622210669315 |
| ean-small | SKIP_MOTION (37 %) | FAR_NATIVE_ROI (33 %) | stability 0.36 ≥ 0.2 (table 7): MEDIUM crop only | 1607 ms (slow) 40279787 | 674 ms | 40279787 |
| ean-curved-can | NATIVE_ROI (91 %) | SKIP_MOTION (9 %) | fill 0.21, module 2.3 px: native crop, margin 0.15 (tables 2–3) | 358 ms (fast) 8411092731130 | 192 ms | 8411092731130 |
| ean-glare | SKIP_MOTION (52 %) | NATIVE_ROI (23 %) | stability 0.97 ≥ 0.2 (table 7): MEDIUM crop only | 559 ms (slow) 8426617014032 | 213 ms | 8426617014032 |
| ean-hand-motion | SKIP_MOTION (51 %) | NATIVE_ROI (30 %) | stability 0.38 ≥ 0.2 (table 7): MEDIUM crop only | 1573 ms (slow) 8426617014032 | 439 ms | 8426617014032 |
| ean-low-light | SKIP_MOTION (65 %) | NATIVE_ROI (16 %) | stability 0.86 ≥ 0.2 (table 7): MEDIUM crop only | 725 ms (fast) 8426617014032 | 191 ms | 8426617014032 |
| ean-two-codes | SKIP_MOTION (53 %) | NATIVE_ROI (31 %) | stability 0.68 ≥ 0.2 (table 7): MEDIUM crop only | 592 ms (slow) 8411902004089 | 9 ms | 8410297112386/8411902004089 |

## Galaxy Note 10+ — Samsung Internet 30.0 — chrome_tab (bundle-note10)
| scene | dominant path (share) | 2nd path | reason (dominant) | replay confirmation | Phase 0 first hit | reference |
|---|---|---|---|---|---|---|
| ean-12cm | FAR_NATIVE_ROI (58 %) | NATIVE_ROI (22 %) | module 1.33 px < 1.7 (table 2: 15 % wrong reads at ≤ 1.5 px): native crop, harder, slow lane | not confirmed | — | — |
| ean-18cm | FAR_NATIVE_ROI (88 %) | SKIP_MOTION (12 %) | module 1.34 px < 1.7 (table 2: 15 % wrong reads at ≤ 1.5 px): native crop, harder, slow lane | not confirmed | 355 ms | 8426617014032 |
| ean-25cm | NATIVE_ROI (64 %) | SKIP_MOTION (30 %) | fill 0.23, module 2.6 px: native crop, margin 0.15 (tables 2–3) | not confirmed | 42 ms | 3410611014032 |
| ean-30cm | FAR_NATIVE_ROI (42 %) | SKIP_MOTION (32 %) | module 1.23 px < 1.7 (table 2: 15 % wrong reads at ≤ 1.5 px): native crop, harder, slow lane | not confirmed | — | — |
| ean-curved-can | SKIP_MOTION (63 %) | FAR_NATIVE_ROI (37 %) | stability 0.35 ≥ 0.2 (table 7): MEDIUM crop only | not confirmed | — | — |
| ean-glare | SKIP_MOTION (56 %) | FAR_NATIVE_ROI (42 %) | stability 0.23 ≥ 0.2 (table 7): MEDIUM crop only | not confirmed | — | — |
| ean-hand-motion | SKIP_MOTION (48 %) | NATIVE_ROI (43 %) | stability 0.72 ≥ 0.2 (table 7): MEDIUM crop only | 4257 ms (fast) 8410297112386 | 1099 ms | 8410297112386 |
| ean-low-light | SKIP_NO_CANDIDATE (51 %) | SKIP_MOTION (22 %) | no candidate | not confirmed | — | — |

## Realme — Chrome 142.0 — chrome_tab (bundle-realme)
| scene | dominant path (share) | 2nd path | reason (dominant) | replay confirmation | Phase 0 first hit | reference |
|---|---|---|---|---|---|---|
| ean-12cm | LOW_MEDIUM (63 %) | SKIP_MOTION (27 %) | fill 0.42 ≥ 0.35: module 2.4 px on MEDIUM (table 3) | 1384 ms (fast) 8410297112386 | 496 ms | 8410297112386 |
| ean-18cm | NATIVE_ROI (100 %) | — | fill 0.31, module 3.5 px: native crop, margin 0.15 (tables 2–3) | 193 ms (fast) 8410297112386 | 9 ms | 8410297112386 |
| ean-25cm | NATIVE_ROI (96 %) | SKIP_MOTION (4 %) | fill 0.22, module 2.5 px: native crop, margin 0.15 (tables 2–3) | 309 ms (fast) 8410297112386 | 59 ms | 8410297112386 |
| ean-30cm | FAR_NATIVE_ROI (62 %) | SKIP_MOTION (33 %) | module 1.27 px < 1.7 (table 2: 15 % wrong reads at ≤ 1.5 px): native crop, harder, slow lane | not confirmed | 208 ms | 8410297112386 |
| ean-approach-40cm | SKIP_MOTION (57 %) | NATIVE_ROI (43 %) | stability 0.78 ≥ 0.2 (table 7): MEDIUM crop only | not confirmed | 3176 ms | 8410297112386 |
| ean-small | NATIVE_ROI (51 %) | SKIP_MOTION (36 %) | fill 0.32, module 3.6 px: native crop, margin 0.15 (tables 2–3) | 1684 ms (fast) 40279787 | 659 ms | 40279787 |
| ean-curved-can | NATIVE_ROI (100 %) | — | fill 0.22, module 2.5 px: native crop, margin 0.15 (tables 2–3) | 6134 ms (fast) 8411092731130 | 794 ms | 8411092731130 |
| ean-glare | NATIVE_ROI (78 %) | SKIP_MOTION (17 %) | fill 0.23, module 2.6 px: native crop, margin 0.15 (tables 2–3) | 1308 ms (fast) 8426617014032 | 760 ms | 8426617014032 |
| ean-hand-motion | NATIVE_ROI (44 %) | SKIP_MOTION (25 %) | fill 0.23, module 2.6 px: native crop, margin 0.15 (tables 2–3) | 1706 ms (fast) 8426617014032 | 1139 ms | 8426617014032 |
| ean-low-light | SKIP_MOTION (48 %) | NATIVE_ROI (21 %) | stability 0.23 ≥ 0.2 (table 7): MEDIUM crop only | 1539 ms (fast) 8426617014032 | 687 ms | 8426617014032 |
| ean-two-codes | NATIVE_ROI (84 %) | SKIP_MOTION (16 %) | fill 0.22, module 2.5 px: native crop, margin 0.15 (tables 2–3) | 851 ms (fast) 8410297112386 | 752 ms | 8410297112386/8411092731130 |

## Samsung Chrome — Chrome 147.0 — chrome_tab (bundle-samsung-chrome)
| scene | dominant path (share) | 2nd path | reason (dominant) | replay confirmation | Phase 0 first hit | reference |
|---|---|---|---|---|---|---|
| ean-12cm | NATIVE_ROI (64 %) | SKIP_MOTION (23 %) | fill 0.34, module 3.9 px: native crop, margin 0.15 (tables 2–3) | 1185 ms (fast) 7622210669315 | 650 ms | 7622210669315 |
| ean-18cm | FAR_NATIVE_ROI (67 %) | SKIP_MOTION (22 %) | module 1.30 px < 1.7 (table 2: 15 % wrong reads at ≤ 1.5 px): native crop, harder, slow lane | 692 ms (slow) 7622210669315 | 11 ms | 7622210669315 |
| ean-25cm | NATIVE_ROI (79 %) | FAR_NATIVE_ROI (17 %) | fill 0.20, module 2.3 px: native crop, margin 0.15, harder after 2 misses (tables 2–3) | 2334 ms (fast) 7622210669315 | 1665 ms | 7622210669315 |
| ean-30cm | NATIVE_ROI (62 %) | SKIP_MOTION (27 %) | fill 0.18, module 2.0 px: native crop, margin 0.25 (tables 2–3) | not confirmed | 1862 ms | 7622210669315 |
| ean-approach-40cm | SKIP_MOTION (57 %) | FAR_NATIVE_ROI (43 %) | stability 0.52 ≥ 0.2 (table 7): MEDIUM crop only | 718 ms (slow) 7622210669315 | 16 ms | 7622210669315 |
| ean-small | SKIP_MOTION (46 %) | NATIVE_ROI (34 %) | stability 0.54 ≥ 0.2 (table 7): MEDIUM crop only | 675 ms (fast) 40279787 | 209 ms | 40279787 |
| ean-curved-can | NATIVE_ROI (71 %) | SKIP_MOTION (18 %) | fill 0.22, module 2.6 px: native crop, margin 0.15 (tables 2–3) | not confirmed | — | 8411092731130 |
| ean-glare | NATIVE_ROI (75 %) | SKIP_MOTION (23 %) | fill 0.27, module 3.1 px: native crop, margin 0.15 (tables 2–3) | 1967 ms (fast) 8426617014032 | 327 ms | 8426617014032 |
| ean-hand-motion | NATIVE_ROI (42 %) | SKIP_MOTION (41 %) | fill 0.19, module 2.2 px: native crop, margin 0.25 (tables 2–3) | 3130 ms (fast) 8426617014032 | 219 ms | 8426617014032 |
| ean-low-light | NATIVE_ROI (53 %) | SKIP_MOTION (31 %) | fill 0.21, module 2.4 px: native crop, margin 0.15 (tables 2–3) | 508 ms (fast) 8426617014032 | 145 ms | 8426617014032 |
| ean-two-codes | NATIVE_ROI (69 %) | SKIP_MOTION (24 %) | fill 0.23, module 2.6 px: native crop, margin 0.15 (tables 2–3) | 842 ms (slow) 8411902004089 | 44 ms | 8410297112386/8411902004089 |

Replayed confirmations: 56; wrong confirmations: 0.
