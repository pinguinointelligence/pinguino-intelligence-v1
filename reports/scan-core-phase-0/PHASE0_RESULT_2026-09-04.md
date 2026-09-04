# SCAN CORE PHASE 0 — RESULT (D5: GO / NO-GO per device class) — 2026-09-04

Source of truth: six corpus bundles received on the Mac through the tunnel collector, parsed by `scripts/scan-lab/parseBaselineBundle.mjs` (tables in `results/`, ledgers D1/D2/D3/I1/R1 + the Samsung Internet run). Gates = the decision package's Phase 0 acceptance: locate + ROI decode ≤ 40 ms p95 · ≥ 15 fps processed for 60 s · ≤ 60 % of one core (worker duty + main-thread capture share) · corpus ≥ 20 scenes × ≥ 3 s. Completion and wrong-code targets are Phase 1 acceptance, reported here as diagnostics.

## Canonical matrix
| class | device / browser | locate+ROI p95 | processed fps | CPU proxy | corpus | confirmed scenes | **Phase 0** |
|---|---|---|---|---|---|---|---|
| **D1** | iPhone 15 Pro Max · Safari tab | 5 ms | 24.8 | 57 % | 24 | 15/18 | **GO** |
| **D2** | iPhone 15 Pro Max · standalone PWA | 5 ms | 22.7 | 57 % | 23 | 14/18 | **GO** |
| **D3** | Galaxy Note10+ SM-N975F · Android 12 · Chrome 147 | 22.7 ms | 5.4 | 85 % | 24 | 17/18 | **NO-GO as configured** |

Extra classes: I1 iPhone · Chrome for iOS 152 → GO (20 fps, 58 %); R1 Realme · Chrome 142 → NO-GO (6.6 fps, 79 %); Note10+ · Samsung Internet 30 → NO-GO (4.7 fps, 86 %, ultra-wide lens).

## What the numbers say
1. **The decoder is not the problem on any device.** With the right camera, 14–17 of 18 barcode scenes confirm on every phone; sub-second at 18–30 cm on iPhone (117–292 ms) and 290 ms–2.2 s on the Note10+. ROI decode costs ≤ 1–2 ms everywhere; full-frame cheap decode 3–4 ms (A17 Pro) vs 20–44 ms (Android).
2. **Android fails only the throughput gates, and for one reason:** the harness captures 1080×1920 frames through `getImageData` on the main thread (43–67 ms per frame) and runs full-frame passes on 2 MP (20–94 ms). Processed rate collapses to 5–7 fps while the camera delivers 30. Phase 1 must move capture off the main thread (ImageBitmap/VideoFrame transfer) and decode ROIs at 720p-class planes; a 720p run on the Note10+ (selector „Rozdzielczość analizy = 1280”) is the cheapest confirmation and is optional for Phase 0.
3. **Camera selection is a first-order effect.** Android `facingMode: environment` handed out the fixed-focus ultra-wide on the Note10+ (0 reads at 12–30 cm) — auto re-open on the ranked primary fixed it in the canonical run. On iPhone Pro the single „Tylny aparat” cannot focus below ~20 cm (12/18 cm: 0 reads in D1 and D2) while the virtual multi-lens camera switches to macro and decodes (I1: 12 cm 3.9 s, 18 cm 118 ms). Ranking corrected: virtual multi-lens first on iOS, primary single sensor on Android.
4. **Thermal regimes exist and are device-specific:** Note10+ doubles every stage after 2–5.5 min; Realme ran slow for ~3 min then fast; iPhone flat for 10 min. Report steady-state and whole-run separately.
5. **Aliasing is real and fast:** checksum-valid wrong values appear in every run (5–20 per run). Two consecutive frames agreed on a wrong value at 40 cm on D1 (three distinct values, 100 ms apart) and on the curved can in D3 (six reads, all from the rectified crop). The Phase 1 fast lane („two agreeing decodes”) must require agreement across different frames, exclude rectified-crop reads from confirming alone, and gate on module size / lineCount (or three frames) for small candidates.
6. **Standalone PWA ≡ Safari tab** on iOS 26.6.1: same camera open time class, no re-prompt cost measurable, same throughput; the route-scoped manifest install works.
7. Corpus: six bundles, 145 scene recordings, ~600 JPEG frames, ~25k processed-frame evidence rows, all on the Mac; nothing left the phones automatically.

## Verdict
Phase 0 delivered its acceptance table for both target classes. **iPhone Safari and PWA: GO.** **Android Chrome (Note10+): NO-GO as configured**, with the cause isolated to the harness's capture/decode configuration rather than the device or the decoder; the decision package's „no-go → revisit resolution/ROI strategy before Phase 1” branch applies, and the strategy is already identified above.

Owner QA sign-off (D6) is outstanding and is not self-approved here.
