# D2 — iPhone 15 Pro Max — iOS 26.6.1 — standalone Home-Screen PWA — real-device run 2026-09-04

Bundle `20260904T083406Z_scan-baseline_iphone-desktop-scania-lab_20260904T082406Z.zip` (48,040,136 B, 134 entries, CRC-verified), received 08:34:06 UTC via the collector **from inside the standalone app** (the upload survived this time; the earlier attempt never arrived). Label „iPhone desktop Scania lab”, **executionMode `standalone_pwa`**, Safari 26.6.1 engine (`Version/26.6.1 … Safari/604.1`). Build `BaselinePage-Dmjgg1sL` — identical to D1. Table: `results/20260904T083406Z_scan-baseline_iphone-desktop-scania-lab_20260904T082406Z.md`.

## PWA-specific evidence (A4 / B8 / B18)
- The route-scoped manifest worked: the Home-Screen icon launched `/scan-lab/baseline?mode=pwa` in standalone mode (`display-mode: standalone` detected). No other page of the app carries the manifest.
- Camera opened in **192 ms** (first frame 490 ms) inside the PWA; no measurable permission re-prompt cost beyond the tab run (139 ms). Torch ok (6 ms), zoom ok (1 ms).
- 0 visibility events during the 60 s loop (the app stayed foreground); the 48 MB upload completed from the PWA.

## Coverage
24 scenes (obj-apple + one skipped), 242.2 s (23 scenes ≥ 3 s; one ended early), 107 JPEGs. **Declared code 8480000511461** (a different P1 than D1). Session 48d74dab…, 08:24:06Z → 08:31:32Z.

## Camera
Requested 1920×1080 @30 → **1080×1920 @30**; facingMode delivered „Tylny aparat trójobiektywowy”, the harness re-opened on the single „Tylny aparat” (same as D1; corrected ranking deployed after this run). 7 cameras enumerated.

## Loop / pipeline (60 s scene, native 2 MP)
Camera 30 fps (1800 presented, 4 skipped), rVFC 29.9/s, **processed 22.7 fps** (min second 16), 436 dropped busy. Worker saliency 4 ms, full_cheap 3–4 ms, harder 11–14 ms, ROI ≤ 1 ms; duty 9 % + 16 % = 25 %; main-thread capture 14 / 18 ms ≈ 32 % → combined 57 %. Transfer 0–1 ms, buffers reused 1360 / 0.

## Decode evidence (rescored, declared code on the P1 scenes only)
- **14 of 18 barcode scenes DECODED_CONFIRMED.** NO_DECODE: 12 cm (single-lens focus limit, as in D1), enter-edge (code never entered in time), partial (correct). 18 cm: no correct read; one aliased single-frame read (`0016100004510`) → MISREAD verdict by the rule „every read wrong”, in substance the same focus limit.
- Confirmed at: 25 cm 130 ms, scratched 131 ms, approach-40cm 158 ms, 30 cm 176 ms, yaw-60 178 ms, hand-motion 197 ms, can 324 ms, small bottle 324 ms, two-codes 359 ms (both products), human-digits 709 ms, small EAN-8 1224 ms, glare 4.4 s, yaw-30 5.6 s, low-light 7.8 s (2 hits, no torch).
- **Wrong codes: 0 confirmed; no consecutive wrong agreement.** Raw single-frame aliases: human-digits ×2, yaw-30 ×2, loop-60s ×3, oreo ×2, milk carton ×1, bottle ×1 — all rejected by the two-frame rule.

## Phase 0 GATES — D2
| gate | measured | result |
|---|---|---|
| locate + ROI decode ≤ 40 ms p95 | 4 / 5 ms p50/p95 (n=3370) | PASS |
| ≥ 15 fps processed, 60 s | 22.7 fps, min second 16 | PASS |
| ≤ 60 % of one core | 25 % worker + 32 % main = 57 % | PASS |
| corpus ≥ 20 scenes × ≥ 3 s | 23 scenes, 242 s | PASS |

**D2 verdict: GO.** Behaviour in the standalone PWA is indistinguishable from the Safari tab (D1: 24.8 fps / 57 %; D2: 22.7 fps / 57 %). Phase 1 headline (diagnostic): completion p50 130 ms / p95 176 ms over 25–30 cm; 12 and 18 cm never confirmed (single lens) → misses.
