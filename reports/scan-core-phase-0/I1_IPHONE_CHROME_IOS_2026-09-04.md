# I1 — iPhone (label „Iphone”, iOS 26.6.1) — Chrome for iOS 152 — real-device run 2026-09-04

**Not D1 and not D2.** The bundle's user agent is `CriOS/152.0.7977.64` = Chrome for iOS (WebKit engine inside the Chrome app, `browser_tab`). D1 requires a Safari tab and D2 the standalone Home-Screen PWA (Chrome for iOS cannot install one). Recorded as extra class I1; the WebKit numbers are indicative for Safari, the PWA behaviours (permission re-prompt, standalone lifecycle) remain unmeasured.

Bundle `20260904T074950Z_scan-baseline_iphone_20260904T073815Z.zip` (50,338,916 B, 124 entries, CRC-verified), received 07:49:50 UTC via the collector (upload took ~10 min). Table: `results/20260904T074950Z_scan-baseline_iphone_20260904T073815Z.md`. Ran the 07:31 build (auto camera switch + client hints present; no hints on iOS by design).

## Identity
- Label „Iphone” (model not typed; iOS 26.6.1 matches the owner's 15 Pro Max), 430×932 @3, 4 cores reported, no memory hint. Session 057d2ca4…, created 07:38:15Z, exported 07:47:22Z.
- 24 scenes (two skipped: obj-apple + one), 250.1 s, 97 JPEGs; no declared code.

## Camera
- Requested 1920×1080 @30 → **1080×1920 @30**, „Tylny aparat trójobiektywowy” (Back Triple Camera, Apple's virtual multi-lens), open 1927 ms, first frame 2247 ms. Capabilities: 4032×3024, frameRate ≤ 60, **zoom 0.5–10** (apply 1→2 ok), **torch exposed and works** (27 ms), focusMode not exposed (iOS), powerEfficient/backgroundBlur exposed. Seven cameras enumerated with Polish labels (trójobiektywowy, dwuobiektywowy, tylny aparat, długoogniskowy, dwuobiektywowy szerokokątny, ultraszerokokątny, przedni). The ranking heuristics did not know the Polish names (all back lenses ranked 1; fixed after this run: „tylny aparat” = primary single wide).
- Consequence at 12 cm: the virtual Triple camera sits at the edge of the main lens's focus range — candidate stable at 385–413 px (fill 0.36), sharp by Laplacian, yet no valid read for 3.5 s; full-frame cheap 0/173 in that scene, ROI 81/173 once the hand drifted. Every other distance decoded in 6–98 ms.

## Loop / pipeline (60 s scene)
- Camera 30 fps (1799 presented, 1798 surfaced — one skipped), rVFC 30/s steady. **Processed 20.0 fps** (1201 frames, min second 17), 597 dropped while busy.
- Worker per frame at 1080×1920: saliency 4 ms, full_cheap 3–4 ms, full_harder 11–14 ms, ROI 0–1 ms, rectified ~1 ms (timers are 1 ms-quantised on iOS). Duty 8 % + 21 % = 30 %. Main-thread capture→luma 14 / 17 ms p50/p95 ≈ 28 % → combined ≈ 58 %.
- Transfer: main→worker 0–1 ms, reply 0–1 ms (epoch timers valid on this build), buffers reused 1201 / 0 allocations.

## Decode evidence
- **16 of 18 barcode scenes DECODED_CONFIRMED**; ean-partial NO_DECODE (correct); ean-enter-edge unconfirmed (one hit at 9.2 s — the code entered the frame late). Confirmed at: 18 cm 118 ms, 25 cm 189 ms, 30 cm 193 ms, approach-40cm 125 ms, yaw-30 121 ms, yaw-60 120 ms, small bottle 121 ms, human-digits 154 ms, two-codes 308 ms (both products), curved can 289 ms, small EAN-8 354 ms, hand-motion 389 ms, glare 488 ms, low-light 1071 ms (no torch), scratched 1089 ms, 12 cm 3958 ms.
- Hits by variant over barcode scenes: full_cheap 1280/3653, full_harder 539/1095, roi_cheap 1034/3598, rectified 195/390.
- **Wrong codes: 0 confirmed.** Five raw checksum-valid misreads rejected by the two-frame rule: 30 cm `0420287112386` ×1, scratched `3222000115745` ×1 and `0400860105745` ×1, small `40279121` ×2 (again from frames that also carried the correct read).
- Object scenes: banana 0 candidates-with-hits, can/bottle/oreo/milk carton confirmed the visible codes on the packaging (3.2–4.8 s).

## Phase 0 criteria — I1
| criterion | measured | result |
|---|---|---|
| locate + ROI ≤ 40 ms p95 | 4 / 5 ms p50/p95 (n=3598) | PASS |
| 15 fps processed, 60 s | 20.0 fps, min second 17, no decay | PASS |
| ≤ 60 % of one core | 30 % worker + 28 % main = 58 % | PASS |
| corpus ≥ 20 × ≥ 3 s | 24 scenes, 250 s | PASS |
| 0 wrong codes (headline) | 0 confirmed; 5 raw rejected | PASS |
| completion 12–30 cm p50 ≤ 0.7 s / p95 ≤ 2 s (headline) | p50 189 ms / p95 3958 ms | p50 PASS, p95 FAIL (12 cm focus edge) |

**I1 verdict: GO on all four Phase 0 criteria** (Chrome for iOS, virtual Triple camera, 2 MP native analysis). D1 (Safari tab) and D2 (standalone PWA) remain to be run.
