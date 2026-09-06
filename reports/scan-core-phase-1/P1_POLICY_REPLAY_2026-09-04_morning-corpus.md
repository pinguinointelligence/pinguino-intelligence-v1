# Adaptive policy — offline replay over the Phase 0 corpus

Outcome column = decode approximated by the recorded variant closest to the chosen path (see file header). "wrong" = the replayed confirmation disagrees with the scene reference (declared code on the P1 scenes, otherwise the scene majority).

## Samsung  — Chrome 147.0 — chrome_tab (bundle-b10)
| scene | dominant path (share) | 2nd path | reason (dominant) | replay confirmation | Phase 0 first hit | reference |
|---|---|---|---|---|---|---|
| ean-12cm | NATIVE_ROI (75 %) | LOW_MEDIUM (25 %) | fill 0.33, module 2.5 px: native crop, margin 0.15 (tables 2–3) | 876 ms (fast) 7622210669315 | 509 ms | 7622210669315 |
| ean-18cm | NATIVE_ROI (88 %) | FAR_NATIVE_ROI (12 %) | fill 0.27, module 2.0 px: native crop, margin 0.15 (tables 2–3) | 529 ms (fast) 7622210669315 | 295 ms | 7622210669315 |
| ean-25cm | FAR_NATIVE_ROI (99 %) | NATIVE_ROI (1 %) | module 1.53 px < 1.7 (table 2: 15 % wrong reads at ≤ 1.5 px): native crop, harder, slow lane | 596 ms (slow) 7622210669315 | 18 ms | 7622210669315 |
| ean-30cm | FAR_NATIVE_ROI (100 %) | — | module 1.52 px < 1.7 (table 2: 15 % wrong reads at ≤ 1.5 px): native crop, harder, slow lane | not confirmed | — | 7622210669315 |
| ean-approach-40cm | FAR_NATIVE_ROI (100 %) | — | module 1.02 px < 1.7 (table 2: 15 % wrong reads at ≤ 1.5 px): native crop, harder, slow lane | not confirmed | — | 7622210669315 |
| ean-small | FAR_NATIVE_ROI (52 %) | NATIVE_ROI (33 %) | module 1.69 px < 1.7 (table 2: 15 % wrong reads at ≤ 1.5 px): native crop, harder, slow lane | 900 ms (fast) 40279787 | 500 ms | 40279787 |
| ean-curved-can | NATIVE_ROI (58 %) | LOW_MEDIUM (32 %) | fill 0.24, module 1.8 px: native crop, margin 0.15 (tables 2–3) | 808 ms (fast) 8411092731130 | 423 ms | 8411092731130 |
| ean-glare | FAR_NATIVE_ROI (68 %) | NATIVE_ROI (32 %) | module 0.84 px < 1.7 (table 2: 15 % wrong reads at ≤ 1.5 px): native crop, harder, slow lane; unstable | 2129 ms (slow) 8426617014032 | 291 ms | 8426617014032 |
| ean-hand-motion | FAR_NATIVE_ROI (68 %) | NATIVE_ROI (29 %) | module 1.54 px < 1.7 (table 2: 15 % wrong reads at ≤ 1.5 px): native crop, harder, slow lane; unstable | 1415 ms (slow) 8426617014032 | 711 ms | 8426617014032 |
| ean-low-light | NATIVE_ROI (31 %) | FAR_NATIVE_ROI (29 %) | fill 0.23, module 1.7 px: native crop, margin 0.15 (tables 2–3) | 3039 ms (fast) 8426617014032 | 550 ms | 8426617014032 |
| ean-two-codes | FAR_NATIVE_ROI (68 %) | NATIVE_ROI (28 %) | module 1.07 px < 1.7 (table 2: 15 % wrong reads at ≤ 1.5 px): native crop, harder, slow lane | 2037 ms (slow) 8480000105745 | 1520 ms | 8480000105745/7622210669315 |

## Iphone — Chrome iOS 152.0 — browser_tab (bundle-iphone)
| scene | dominant path (share) | 2nd path | reason (dominant) | replay confirmation | Phase 0 first hit | reference |
|---|---|---|---|---|---|---|
| ean-12cm | LOW_MEDIUM (78 %) | NATIVE_ROI (22 %) | fill 0.40 ≥ 0.35: module 2.3 px on MEDIUM (table 3) | 5158 ms (fast) 8410297112386 | 5125 ms | 8410297112386 |
| ean-18cm | NATIVE_ROI (99 %) | SKIP_BLUR (1 %) | fill 0.25, module 2.8 px: native crop, margin 0.15 (tables 2–3) | 118 ms (fast) 8410297112386 | 12 ms | 8410297112386 |
| ean-25cm | NATIVE_ROI (82 %) | FAR_NATIVE_ROI (18 %) | fill 0.20, module 2.3 px: native crop, margin 0.15 (tables 2–3) | 323 ms (fast) 8410297112386 | 189 ms | 8410297112386 |
| ean-30cm | NATIVE_ROI (73 %) | FAR_NATIVE_ROI (27 %) | fill 0.18, module 2.0 px: native crop, margin 0.25 (tables 2–3) | 1027 ms (slow) 8410297112386 | 260 ms | 8410297112386 |
| ean-approach-40cm | NATIVE_ROI (71 %) | FAR_NATIVE_ROI (29 %) | fill 0.16, module 1.8 px: native crop, margin 0.25 (tables 2–3) | 427 ms (slow) 8410297112386 | 11 ms | 8410297112386 |
| ean-small | NATIVE_ROI (56 %) | FAR_NATIVE_ROI (32 %) | fill 0.16, module 1.8 px: native crop, margin 0.25; unstable (tables 2–3) | 487 ms (slow) 40279787 | 115 ms | 40279787 |
| ean-curved-can | NATIVE_ROI (65 %) | LOW_MEDIUM (27 %) | fill 0.24, module 2.7 px: native crop, margin 0.15 (tables 2–3) | 289 ms (fast) 8411092731130 | 189 ms | 8411092731130 |
| ean-glare | NATIVE_ROI (78 %) | FAR_NATIVE_ROI (12 %) | fill 0.27, module 3.0 px: native crop, margin 0.15 (tables 2–3) | 1012 ms (fast) 8426617014032 | 646 ms | 8426617014032 |
| ean-hand-motion | NATIVE_ROI (70 %) | FAR_NATIVE_ROI (25 %) | fill 0.23, module 2.6 px: native crop, margin 0.15; unstable (tables 2–3) | 889 ms (fast) 8426617014032 | 389 ms | 8426617014032 |
| ean-low-light | NATIVE_ROI (76 %) | FAR_NATIVE_ROI (12 %) | fill 0.16, module 1.9 px: native crop, margin 0.25 (tables 2–3) | 1905 ms (fast) 8426617014032 | 1471 ms | 8426617014032 |
| ean-two-codes | NATIVE_ROI (64 %) | LOW_MEDIUM (30 %) | fill 0.25, module 2.8 px: native crop, margin 0.15 (tables 2–3) | 792 ms (slow) 8411902004089 | 192 ms | 8411902004089/8480000235138 |

## iPhone desktop Scania lab — Safari 26.6.1 — standalone_pwa (bundle-iphone-pwa)
| scene | dominant path (share) | 2nd path | reason (dominant) | replay confirmation | Phase 0 first hit | reference |
|---|---|---|---|---|---|---|
| ean-12cm | FAR_NATIVE_ROI (55 %) | SKIP_NO_CANDIDATE (32 %) | module 0.29 px < 1.7 (table 2: 15 % wrong reads at ≤ 1.5 px): native crop, harder, slow lane | not confirmed | — | 8480000511461 |
| ean-18cm | NATIVE_ROI (100 %) | — | fill 0.24, module 2.8 px: native crop, margin 0.15 (tables 2–3) | not confirmed | 7093 ms | 8480000511461 |
| ean-25cm | NATIVE_ROI (100 %) | — | fill 0.20, module 2.3 px: native crop, margin 0.15 (tables 2–3) | 130 ms (fast) 8480000511461 | 13 ms | 8480000511461 |
| ean-30cm | NATIVE_ROI (100 %) | SKIP_BLUR (0 %) | fill 0.18, module 2.0 px: native crop, margin 0.25 (tables 2–3) | 176 ms (fast) 8480000511461 | 9 ms | 8480000511461 |
| ean-approach-40cm | FAR_NATIVE_ROI (70 %) | NATIVE_ROI (30 %) | module 1.52 px < 1.7 (table 2: 15 % wrong reads at ≤ 1.5 px): native crop, harder, slow lane | 224 ms (slow) 8480000511461 | 100 ms | 8480000511461 |
| ean-small | NATIVE_ROI (54 %) | FAR_NATIVE_ROI (29 %) | fill 0.16, module 1.8 px: native crop, margin 0.25; unstable (tables 2–3) | 1291 ms (fast) 40279787 | 1124 ms | 40279787 |
| ean-curved-can | NATIVE_ROI (99 %) | FAR_NATIVE_ROI (1 %) | fill 0.32, module 3.6 px: native crop, margin 0.15 (tables 2–3) | 858 ms (fast) 8411092731130 | 408 ms | 8411092731130 |
| ean-glare | NATIVE_ROI (84 %) | FAR_NATIVE_ROI (15 %) | fill 0.20, module 2.3 px: native crop, margin 0.15; unstable (tables 2–3) | 4675 ms (slow) 8426617014032 | 4342 ms | 8426617014032 |
| ean-hand-motion | NATIVE_ROI (45 %) | SKIP_NO_CANDIDATE (24 %) | fill 0.18, module 2.1 px: native crop, margin 0.25; unstable (tables 2–3) | 224 ms (fast) 8426617014032 | 139 ms | 8426617014032 |
| ean-low-light | SKIP_NO_CANDIDATE (45 %) | FAR_NATIVE_ROI (36 %) | no candidate | not confirmed | 7827 ms | 8426617014032 |
| ean-two-codes | NATIVE_ROI (61 %) | LOW_MEDIUM (28 %) | fill 0.17, module 1.9 px: native crop, margin 0.25 (tables 2–3) | 659 ms (slow) 8480000105745 | 425 ms | 8480000105745/8410297112386 |

## iPhone safari — Safari 26.6.1 — safari_tab (bundle-iphone-safari)
| scene | dominant path (share) | 2nd path | reason (dominant) | replay confirmation | Phase 0 first hit | reference |
|---|---|---|---|---|---|---|
| ean-12cm | SKIP_NO_CANDIDATE (49 %) | FAR_NATIVE_ROI (43 %) | no candidate | not confirmed | — | 7622210669315 |
| ean-18cm | NATIVE_ROI (92 %) | FAR_NATIVE_ROI (8 %) | fill 0.21, module 2.4 px: native crop, margin 0.15 (tables 2–3) | not confirmed | — | 7622210669315 |
| ean-25cm | NATIVE_ROI (100 %) | — | fill 0.18, module 2.1 px: native crop, margin 0.25 (tables 2–3) | 117 ms (fast) 7622210669315 | 7 ms | 7622210669315 |
| ean-30cm | FAR_NATIVE_ROI (100 %) | — | module 1.01 px < 1.7 (table 2: 15 % wrong reads at ≤ 1.5 px): native crop, harder, slow lane | 559 ms (slow) 7622210669315 | 292 ms | 7622210669315 |
| ean-approach-40cm | FAR_NATIVE_ROI (100 %) | — | module 1.01 px < 1.7 (table 2: 15 % wrong reads at ≤ 1.5 px): native crop, harder, slow lane | 5608 ms (slow) 7622210669315 | 3374 ms | 7622210669315 |
| ean-small | FAR_NATIVE_ROI (59 %) | NATIVE_ROI (21 %) | module 0.52 px < 1.7 (table 2: 15 % wrong reads at ≤ 1.5 px): native crop, harder, slow lane | 1607 ms (slow) 40279787 | 674 ms | 40279787 |
| ean-curved-can | NATIVE_ROI (95 %) | LOW_MEDIUM (5 %) | fill 0.34, module 3.9 px: native crop, margin 0.15 (tables 2–3) | 558 ms (fast) 8411092731130 | 292 ms | 8411092731130 |
| ean-glare | NATIVE_ROI (66 %) | FAR_NATIVE_ROI (20 %) | fill 0.20, module 2.3 px: native crop, margin 0.15; unstable (tables 2–3) | 492 ms (fast) 8426617014032 | 159 ms | 8426617014032 |
| ean-hand-motion | NATIVE_ROI (72 %) | FAR_NATIVE_ROI (20 %) | fill 0.17, module 1.9 px: native crop, margin 0.25; unstable (tables 2–3) | 539 ms (slow) 8426617014032 | 339 ms | 8426617014032 |
| ean-low-light | NATIVE_ROI (67 %) | FAR_NATIVE_ROI (30 %) | fill 0.16, module 1.8 px: native crop, margin 0.25; unstable (tables 2–3) | 591 ms (fast) 8426617014032 | 358 ms | 8426617014032 |
| ean-two-codes | NATIVE_ROI (53 %) | LOW_MEDIUM (33 %) | fill 0.16, module 1.8 px: native crop, margin 0.25 (tables 2–3) | 759 ms (fast) 8410297112386 | 9 ms | 8410297112386/8411902004089 |

## Galaxy Note 10+ — Samsung Internet 30.0 — chrome_tab (bundle-note10)
| scene | dominant path (share) | 2nd path | reason (dominant) | replay confirmation | Phase 0 first hit | reference |
|---|---|---|---|---|---|---|
| ean-12cm | FAR_NATIVE_ROI (62 %) | NATIVE_ROI (34 %) | module 1.43 px < 1.7 (table 2: 15 % wrong reads at ≤ 1.5 px): native crop, harder, slow lane; unstable | not confirmed | — | — |
| ean-18cm | FAR_NATIVE_ROI (92 %) | NATIVE_ROI (8 %) | module 1.34 px < 1.7 (table 2: 15 % wrong reads at ≤ 1.5 px): native crop, harder, slow lane | not confirmed | 355 ms | 8426617014032 |
| ean-25cm | LOW_MEDIUM (77 %) | NATIVE_ROI (19 %) | fill 0.40 ≥ 0.35: module 2.3 px on MEDIUM (table 3) | not confirmed | 42 ms | 3410611014032 |
| ean-30cm | FAR_NATIVE_ROI (43 %) | LOW_MEDIUM (28 %) | module 1.23 px < 1.7 (table 2: 15 % wrong reads at ≤ 1.5 px): native crop, harder, slow lane | not confirmed | — | — |
| ean-curved-can | NATIVE_ROI (89 %) | FAR_NATIVE_ROI (11 %) | fill 0.16, module 1.8 px: native crop, margin 0.25, harder after 2 misses (tables 2–3) | not confirmed | — | — |
| ean-glare | FAR_NATIVE_ROI (72 %) | NATIVE_ROI (25 %) | module 1.29 px < 1.7 (table 2: 15 % wrong reads at ≤ 1.5 px): native crop, harder, slow lane | not confirmed | — | — |
| ean-hand-motion | NATIVE_ROI (93 %) | FAR_NATIVE_ROI (5 %) | fill 0.17, module 1.9 px: native crop, margin 0.25 (tables 2–3) | 3201 ms (fast) 8410297112386 | 1099 ms | 8410297112386 |
| ean-low-light | SKIP_NO_CANDIDATE (51 %) | FAR_NATIVE_ROI (41 %) | no candidate | not confirmed | — | — |

## Realme — Chrome 142.0 — chrome_tab (bundle-realme)
| scene | dominant path (share) | 2nd path | reason (dominant) | replay confirmation | Phase 0 first hit | reference |
|---|---|---|---|---|---|---|
| ean-12cm | LOW_MEDIUM (97 %) | NATIVE_ROI (3 %) | fill 0.45 ≥ 0.35: module 2.5 px on MEDIUM (table 3) | 496 ms (fast) 8410297112386 | 33 ms | 8410297112386 |
| ean-18cm | NATIVE_ROI (100 %) | — | fill 0.31, module 3.5 px: native crop, margin 0.15 (tables 2–3) | 193 ms (fast) 8410297112386 | 9 ms | 8410297112386 |
| ean-25cm | NATIVE_ROI (100 %) | — | fill 0.22, module 2.5 px: native crop, margin 0.15 (tables 2–3) | 309 ms (fast) 8410297112386 | 59 ms | 8410297112386 |
| ean-30cm | NATIVE_ROI (86 %) | FAR_NATIVE_ROI (14 %) | fill 0.18, module 2.0 px: native crop, margin 0.25 (tables 2–3) | not confirmed | — | 8410297112386 |
| ean-approach-40cm | NATIVE_ROI (81 %) | FAR_NATIVE_ROI (19 %) | fill 0.16, module 1.8 px: native crop, margin 0.25 (tables 2–3) | not confirmed | 3176 ms | 8410297112386 |
| ean-small | NATIVE_ROI (66 %) | LOW_MEDIUM (20 %) | fill 0.27, module 3.0 px: native crop, margin 0.15; unstable (tables 2–3) | 659 ms (fast) 40279787 | 32 ms | 40279787 |
| ean-curved-can | NATIVE_ROI (55 %) | LOW_MEDIUM (45 %) | fill 0.35, module 3.9 px: native crop, margin 0.15 (tables 2–3) | 6134 ms (fast) 8411092731130 | 257 ms | 8411092731130 |
| ean-glare | NATIVE_ROI (93 %) | SKIP_BLUR (3 %) | fill 0.23, module 2.6 px: native crop, margin 0.15 (tables 2–3) | 1308 ms (slow) 8426617014032 | 203 ms | 8426617014032 |
| ean-hand-motion | NATIVE_ROI (59 %) | FAR_NATIVE_ROI (21 %) | fill 0.23, module 2.6 px: native crop, margin 0.15 (tables 2–3) | 1606 ms (slow) 8426617014032 | 273 ms | 8426617014032 |
| ean-low-light | NATIVE_ROI (61 %) | SKIP_NO_CANDIDATE (14 %) | fill 0.17, module 1.9 px: native crop, margin 0.25; unstable (tables 2–3) | 1539 ms (fast) 8426617014032 | 687 ms | 8426617014032 |
| ean-two-codes | LOW_MEDIUM (63 %) | NATIVE_ROI (37 %) | fill 0.38 ≥ 0.35: module 2.1 px on MEDIUM (table 3) | 618 ms (slow) 8410297112386 | 26 ms | 8410297112386/8411092731130 |

## Samsung Chrome — Chrome 147.0 — chrome_tab (bundle-samsung-chrome)
| scene | dominant path (share) | 2nd path | reason (dominant) | replay confirmation | Phase 0 first hit | reference |
|---|---|---|---|---|---|---|
| ean-12cm | NATIVE_ROI (87 %) | LOW_MEDIUM (13 %) | fill 0.34, module 3.9 px: native crop, margin 0.15 (tables 2–3) | 1185 ms (fast) 7622210669315 | 650 ms | 7622210669315 |
| ean-18cm | NATIVE_ROI (65 %) | FAR_NATIVE_ROI (33 %) | fill 0.23, module 2.6 px: native crop, margin 0.15 (tables 2–3) | 692 ms (fast) 7622210669315 | 290 ms | 7622210669315 |
| ean-25cm | NATIVE_ROI (81 %) | FAR_NATIVE_ROI (19 %) | fill 0.20, module 2.3 px: native crop, margin 0.15; unstable (tables 2–3) | 2334 ms (fast) 7622210669315 | 1665 ms | 7622210669315 |
| ean-30cm | NATIVE_ROI (98 %) | FAR_NATIVE_ROI (2 %) | fill 0.18, module 2.0 px: native crop, margin 0.25 (tables 2–3) | not confirmed | 1862 ms | 7622210669315 |
| ean-approach-40cm | FAR_NATIVE_ROI (93 %) | NATIVE_ROI (7 %) | module 1.52 px < 1.7 (table 2: 15 % wrong reads at ≤ 1.5 px): native crop, harder, slow lane | 718 ms (slow) 7622210669315 | 16 ms | 7622210669315 |
| ean-small | NATIVE_ROI (77 %) | LOW_MEDIUM (18 %) | fill 0.19, module 2.1 px: native crop, margin 0.25 (tables 2–3) | 879 ms (fast) 40279787 | 509 ms | 40279787 |
| ean-curved-can | NATIVE_ROI (63 %) | LOW_MEDIUM (37 %) | fill 0.29, module 3.3 px: native crop, margin 0.15 (tables 2–3) | 1156 ms (slow) 8411092731130 | 14 ms | 8411092731130 |
| ean-glare | NATIVE_ROI (96 %) | SKIP_BLUR (2 %) | fill 0.27, module 3.1 px: native crop, margin 0.15 (tables 2–3) | 1967 ms (fast) 8426617014032 | 1614 ms | 8426617014032 |
| ean-hand-motion | NATIVE_ROI (59 %) | FAR_NATIVE_ROI (30 %) | fill 0.19, module 2.2 px: native crop, margin 0.25 (tables 2–3) | 3130 ms (fast) 8426617014032 | 219 ms | 8426617014032 |
| ean-low-light | NATIVE_ROI (59 %) | LOW_MEDIUM (24 %) | fill 0.21, module 2.4 px: native crop, margin 0.15 (tables 2–3) | 508 ms (fast) 8426617014032 | 145 ms | 8426617014032 |
| ean-two-codes | NATIVE_ROI (70 %) | LOW_MEDIUM (22 %) | fill 0.21, module 2.4 px: native crop, margin 0.15; unstable (tables 2–3) | 693 ms (slow) 8411902004089 | 44 ms | 8410297112386/8411902004089 |

Replayed confirmations: 57; wrong confirmations: 0.
