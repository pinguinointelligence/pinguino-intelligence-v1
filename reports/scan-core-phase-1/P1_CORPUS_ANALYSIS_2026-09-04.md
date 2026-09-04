# Phase 0 corpus — correlations for the adaptive policy

Frames with evidence: 23342; checksum-valid reads: 16350; bundles: 7


## 1. Candidate size vs distance (median over the scene, native analysis plane)

| bundle | plane W | 12 cm w/fill/mod | 18 cm | 25 cm | 30 cm | first hit ms 12/18/25/30 |
|---|---|---|---|---|---|---|
| D3 Note10+ Chrome 2MP | 1080 | 367px / 0.34 / 4 | 121px / 0.11 / 3.0 | 218px / 0.20 / 2 | 169px / 0.16 / 2.0 | 266/11/1665/1862 |
| B10 Note10+ Chrome 1280 | 720 | 242px / 0.34 / 2 | 97px / 0.13 / 2 | 145px / 0.20 / 2.0 | 50px / 0.07 / 1 | 188/134/18/— |
| D1 iPhone Safari | 1080 | 31px / 0.03 / 4 | 108px / 0.10 / 4.0 | 216px / 0.20 / 2 | 96px / 0.09 / 2.0 | —/—/7/226 |
| D2 iPhone PWA | 1080 | 50px / 0.05 / 6 | 121px / 0.11 / 4.0 | 217px / 0.20 / 2 | 193px / 0.18 / 2 | —/7093/13/9 |
| I1 iPhone ChromeiOS | 1080 | 385px / 0.36 / 4 | 287px / 0.27 / 3 | 122px / 0.11 / 2 | 98px / 0.09 / 2 | 3524/12/98/11 |
| R1 Realme Chrome | 1080 | 434px / 0.40 / 4.0 | 337px / 0.31 / 3 | 241px / 0.22 / 3 | 121px / 0.11 / 2.0 | 33/9/59/208 |
| S0 Note10+ SamsungInternet | 1080 | 127px / 0.12 / 4.0 | 121px / 0.11 / 4.0 | 203px / 0.19 / 3 | 153px / 0.14 / 3 | —/355/42/— |

## 2. Decode success by estimated module width (px on the analysis plane), all barcode scenes, frames with a candidate

Success = at least one checksum-valid read by that variant in that frame. `any` = any variant.

| module px | frames | cheap | harder (when run) | roi | rectified (when run) | any | wrong-read frames |
|---|---|---|---|---|---|---|---|
| 0–1.5 | 477 | 11% (n=477) | 32% (n=205) | 5% (n=477) | 9% (n=23) | 27% | 4.0% |
| 2–2.5 | 5125 | 39% (n=5125) | 74% (n=1479) | 38% (n=5125) | 56% (n=617) | 69% | 0.2% |
| 3–4 | 3043 | 34% (n=3043) | 46% (n=943) | 28% (n=3043) | 43% (n=527) | 54% | 0.3% |
| 4–6 | 3408 | 20% (n=3408) | 16% (n=1320) | 18% (n=3408) | 1% (n=330) | 31% | 0.2% |
| 6–∞ | 513 | 9% (n=513) | 10% (n=236) | 0% (n=513) | 0% (n=30) | 14% | 0.2% |

## 3. Decode success by candidate width as a fraction of the plane width (fill)

| fill | frames | cheap | harder | roi | any |
|---|---|---|---|---|---|
| 0.00–0.08 | 2198 | 6% (n=2198) | 13% (n=1016) | 0% (n=2191) | 12% |
| 0.08–0.12 | 2809 | 14% (n=2809) | 22% (n=1128) | 0% (n=2809) | 24% |
| 0.12–0.18 | 2782 | 27% (n=2782) | 44% (n=953) | 27% (n=2782) | 50% |
| 0.18–0.25 | 3992 | 40% (n=3992) | 63% (n=1144) | 40% (n=3992) | 67% |
| 0.25–0.35 | 1316 | 47% (n=1316) | 60% (n=336) | 48% (n=1316) | 70% |
| 0.35–0.50 | 724 | 42% (n=724) | 54% (n=195) | 59% (n=724) | 74% |
| 0.50–1.01 | 173 | 0% (n=173) | 40% (n=90) | 0% (n=173) | 21% |

## 4. Sharpness (frame Laplacian variance, normalised by the bundle's median over candidate frames) vs success

| relative sharpness | frames | any-variant success | note |
|---|---|---|---|
| 0–0.25 × median | 1027 | 13% | |
| 0.25–0.5 × median | 2197 | 15% | |
| 0.5–0.75 × median | 2356 | 32% | |
| 0.75–1.0 × median | 3164 | 52% | |
| 1.0–1.5 × median | 3061 | 66% | |
| 1.5–∞ × median | 2189 | 71% | |

Per-bundle: 12 cm scene Laplacian vs 25 cm scene Laplacian (focus-limit signature)

| bundle | lap 12 cm | lap 25 cm | ratio | 12 cm hits |
|---|---|---|---|---|
| D3 Note10+ Chrome 2MP | 2309 | 2329 | 0.99 | 26/53 |
| B10 Note10+ Chrome 1280 | 2885 | 2486 | 1.16 | 34/69 |
| D1 iPhone Safari | 946 | 1509 | 0.63 | 0/230 |
| D2 iPhone PWA | 245 | 3168 | 0.08 | 0/159 |
| I1 iPhone ChromeiOS | 1773 | 1730 | 1.03 | 81/173 |
| R1 Realme Chrome | 3037 | 2972 | 1.02 | 30/30 |
| S0 Note10+ SamsungInternet | 2740 | 3367 | 0.81 | 0/50 |

## 5. Glare: clipped-highlight ratio vs success (glare scene only, all bundles)

| clippedHighRatio | frames | any-variant success |
|---|---|---|
| 0–0.005 | 702 | 39% |
| 0.005–0.02 | 56 | 29% |

## 6. lineCount of checksum-valid reads: correct vs wrong (all bundles, scenes with a reference value)

| lineCount | correct reads | wrong reads | P(wrong) |
|---|---|---|---|
| 2 | 823 | 51 | 5.8% |
| 3 | 1095 | 24 | 2.1% |
| 4 | 1471 | 11 | 0.7% |
| 5 | 2367 | 5 | 0.2% |
| 6 | 1903 | 3 | 0.2% |
| 7 | 640 | 2 | 0.3% |
| 8 | 415 | 1 | 0.2% |
| 9 | 412 | 1 | 0.2% |
| 10+ | 475 | 1 | 0.2% |
| ≥10 | 7125 | 1 | 0.0% |

Wrong reads by variant: full_cheap: 4/5888, full_harder: 57/3375, roi_cheap: 32/6397, rectified_cheap: 6/690

Wrong reads by module bin: 0–1.5: 36/238, 1.5–2: 0/0, 2–2.5: 40/11438, 2.5–3: 0/0, 3–4: 13/2861, 4–6: 9/1666, 6–99: 1/78

## 7. Candidate stability (frame-to-frame |Δwidth|/width + |Δcentre|/planeWidth) vs success, barcode scenes

| stability score | frames | any-variant success |
|---|---|---|
| 0–0.02 | 4838 | 59% |
| 0.02–0.05 | 1421 | 47% |
| 0.05–0.1 | 1084 | 56% |
| 0.1–0.2 | 1398 | 45% |
| 0.2–∞ | 5127 | 33% |

## 8. Partial-decode evidence (zxing returnErrors with geometry) before the first hit

frames with error-with-geometry: 5 frames before first hit 4% (n=233) vs earlier frames 3% (n=1463)

## 9. Variant cost by plane (p50 ms, barcode scenes, pre-throttle = first 150 s of the run)

| bundle | plane | saliency | cheap | harder | roi | rectified | main capture (from ticks, whole run) |
|---|---|---|---|---|---|---|---|
| D3 Note10+ Chrome 2MP | 1080×1920 | 16.3 | 21.1 | 39.2 | 0.7 | 2.7 | 63.3 / 74.3 |
| B10 Note10+ Chrome 1280 | 720×1280 | 13.1 | 13.4 | 30.6 | 0.5 | 2.7 | 50.3 / 60.7 |
| D1 iPhone Safari | 1080×1920 | 4.0 | 3.0 | 12.0 | 0.0 | 1.0 | 14.0 / 19.0 |
| D2 iPhone PWA | 1080×1920 | 4.0 | 3.0 | 12.0 | 0.0 | 1.0 | 14.0 / 18.0 |
| I1 iPhone ChromeiOS | 1080×1920 | 4.0 | 3.0 | 12.0 | 0.0 | 1.0 | 14.0 / 17.0 |
| R1 Realme Chrome | 1080×1920 | 16.1 | 32.8 | 48.1 | 1.8 | 3.7 | 43.1 / 70.3 |
| S0 Note10+ SamsungInternet | 1080×1920 | 22.3 | 43.6 | 91.0 | 1.0 | 1.9 | 67.6 / 85.6 |

## Reading the tables (what is evidence, what is not)
- **Module estimates are integers** (25th percentile of run lengths on the native plane), so the 1.5–2 and 2.5–3 bins are empty by construction; read the bins as 1 px / 2 px / 3 px / 4–5 px / ≥ 6 px.
- **Distance proxy = fill** (candidate width ÷ plane width). At 25 cm every phone lands at 0.20 on a 1080-wide portrait plane; 12 cm ≈ 0.34–0.40 when the lens can focus; 30 cm ≈ 0.09–0.18 (tester distance varies). Module ≈ fill × plane width ÷ 95 for EAN-13 (0.20 × 1080 ÷ 95 = 2.3 px, matching the measured 2 px).
- **Large codes fail the native cheap pass** (fill > 0.5: cheap 0 %, harder-with-downscale 40 %; fill 0.35–0.50: cheap 42 %, ROI 59 %): a close code wants a smaller plane, not a bigger one — the adaptive LOW/MEDIUM path is evidence-backed.
- **Small codes need native pixels and still alias**: at 1 px modules only 27 % of frames read (harder 32 %) and **15 % of the checksum-valid reads are wrong** (36/238); at 2 px 0.35 %; at ≥ 3 px 0.45 %. Below ~1.7 px on the native plane no plane can help — that is the zoom / „Przybliż” regime.
- **ROI at small fill reads nothing (0 % below fill 0.12)** while the full-frame passes read 6–22 %: the 12 % crop margin cuts the quiet zone or the quad is imprecise on small candidates; the native-ROI path needs a wider margin (≥ 25 %) below fill 0.2.
- **lineCount is a strong wrongness gate**: P(wrong) 5.8 % at 2 lines, 2.1 % at 3, 0.7 % at 4, ≤ 0.2 % from 5 up; wrong reads come from the harder pass (1.7 % of its reads), ROI (0.5 %) and rectified crops (0.9 %), almost never from the plain cheap pass (0.07 %).
- **Sharpness**: relative Laplacian < 0.5 × session median → 13–15 % success; ≥ 1.0 → 66–71 %. The 12 cm focus-limit signature is a ratio of 0.08–0.63 against the 25 cm scene with zero reads (D1, D2, Samsung Internet), versus ≈ 1.0 with reads (D3, B10, I1, R1).
- **Stability** (Δwidth + Δcentre per frame): ≤ 0.02 → 59 % success, ≥ 0.2 → 33 %; moderate effect, useful to defer the expensive path, not to gate reads.
- **Glare** via the global clipped-highlight ratio is not discriminative (too few clipped frames); a candidate-local glare measure is needed before it can drive policy.
- **Partial-decode evidence** (`returnErrors` with geometry) shows no lift before the first hit (4 % vs 3 %); dropped from the policy.
- **Costs**: on the Androids saliency (13–22 ms on a 360×640 plane) and main-thread capture (43–68 ms) dominate; ROI decodes cost ≤ 2 ms everywhere; the A17 Pro makes every stage ≤ 4 ms except the harder pass (12 ms).
