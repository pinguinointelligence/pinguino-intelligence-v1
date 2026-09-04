# Scan Core Phase 1 — adaptive multi-resolution, pipelined design (proposal, not final)

Evidence base: `P1_CORPUS_ANALYSIS_2026-09-04.md` (23,342 evidence frames, 16,350 checksum-valid reads, seven bundles, four phones). Every threshold below names the table it comes from; thresholds marked **[probe]** wait for the Phase 1 probe session on the Note10+.

## 1. One stream, three representations
| level | plane (1080×1920 source) | built | used for |
|---|---|---|---|
| LOW | 360×640 (÷3 box) | every frame | bar-texture localization (saliency), stability, sharpness, fill |
| MEDIUM | 540×960 (÷2) | every frame (cheap, from the same luma) | decode of LARGE candidates (fill ≥ 0.35) and the scheduled RESCUE full-frame pass |
| NATIVE ROI | crop of the 1080×1920 luma | only when the policy asks | decode of MEDIUM/SMALL candidates (fill < 0.35) |
The camera track is never reconfigured per frame. Physical resolution switching and zoom are measured by the probe before either is allowed into the policy **[probe]**.

## 2. Per-frame signals (all already in the evidence contract)
`fill` = candidate width / plane width (distance proxy, table 1); `module_native` = fill × 1080 / 95 (EAN-13; 67 for EAN-8); `sharp_rel` = frame Laplacian / running median of candidate frames (table 4); `stab` = |Δwidth|/width + |Δcentre|/width between consecutive frames (table 7); `lineCount`, module bin and variant of every read (table 6); confirmation state.

## 3. Adaptive state machine
```
SEARCH ──candidate (score ≥ θ, blocks ≥ 4)──► FOUND ──read──► READING ──agreement──► CONFIRMED
  ▲        (LOW plane saliency every frame)      │ path = f(fill, sharp_rel, stab)          │ emits ScanObservation
  └── lost 500 ms ◄────────────────────────────── ┘                                          └── forget window 1500 ms
RESCUE: in SEARCH, every 10th frame (≈3/s at 30 fps) a MEDIUM full-frame decode with tryDownscale+tryHarder; never every frame.
```
Path selection in FOUND/READING (evidence-derived):
| condition | path | why |
|---|---|---|
| `sharp_rel < 0.5` | **SKIP_BLUR** (no decode; after 500 ms → guidance: fill > 0.3 ⇒ „Oddal” (too close for this lens), else „Trzymaj nieruchomo”) | table 4: 13–15 % success below 0.5×; 12 cm focus-limit signature ratio 0.08–0.63 |
| `fill ≥ 0.35` | **LOW/MEDIUM**: decode the candidate crop on the MEDIUM plane, cheap options + tryDownscale | table 3: native cheap 0 % at fill > 0.5, 42 % at 0.35–0.5; harder-with-downscale 40 %; module still ≥ 2 px at half scale |
| `0.15 ≤ fill < 0.35` | **NATIVE ROI**: crop the 1080 luma with 25 % margin (15 % above fill 0.2), cheap options; after 2 consecutive misses on a stable candidate → harder options on the same crop | table 2/3: 2–3 px modules read 54–69 % of frames; ROI 0 % below fill 0.12 with the 12 % margin → wider margin |
| `fill < 0.15` (module_native < 1.7 px) | **FAR**: NATIVE ROI with harder options, slow-lane confirmation only, request optical help: track zoom ×2 if `zoom` is exposed (B5: applies in 1–97 ms on all four phones) **[probe: stall/focus cost]**, else guidance „Przybliż” | table 2: 1 px modules → 27 % success and **15 % wrong reads** |
| `stab ≥ 0.2` (moving) | decode on MEDIUM only; NATIVE ROI deferred until `stab < 0.1` | table 7: 33 % vs 59 %; the expensive path is wasted on motion blur |
| no candidate for 300 ms | RESCUE cadence 10 frames; object lane (Phase 4) may run at 2–5 fps | decision package §Locate; D3/D1 enter-edge scenes |
Thermal budget: if worker busy > 50 % of wall time over the last 2 s, halve the RESCUE cadence and drop the harder retry; the ROI path stays (≤ 2 ms).

## 4. Confirmation (wrong-code policy, table 6 + Phase 0 hazards)
- A read counts only if checksum-valid and **not from the rectified crop alone** (D3 can: 6 consecutive aliases from rectification).
- **Fast lane** (COMPLETE on two reads): two reads from **different frames** agreeing, each `lineCount ≥ 4`, `module_native ≥ 2 px`, no contradicting read in between. P(wrong read) at these gates ≤ 0.7 % (table 6) and the observed wrong pairs (D1 40 cm, D3 can) all violate one of them.
- **Slow lane** (everything else): three agreeing reads from different frames, evidence margin ≥ 3:1 over any other value, within 1500 ms.
- One product per window: a second value while READING resets the agreement counter (two-codes scenes confirm both because they alternate frames; the observation contract carries all confirmed values with their frames).

## 5. Concurrency (what can run in parallel in a browser)
| stage | thread | cost today (Note10+) | target |
|---|---|---|---|
| acquire: rVFC → `VideoFrame` (Chrome) / `createImageBitmap` (Safari) → transfer | main | 63 ms with getImageData on main | ≤ 3 ms **[probe: image_bitmap / video_frame loops]** |
| L: readback (OffscreenCanvas in worker) → luma → LOW/MEDIUM planes → saliency → policy → ROI crop | worker L | saliency 13–16 ms; readback unknown in worker **[probe]** | ≤ 25 ms |
| D: zxing on crops, RESCUE on MEDIUM, confirmation | worker D | ROI 1–2 ms, MEDIUM full 13 ms | ≤ 5 ms typical |
Frame N+1 is acquired while L works on N and D decodes N−1: main never waits; L drops frames when busy (no queue); D is fed crops (≤ 100 kB) by transfer. Expected Note10+ throughput = 1000 / max(L, D) ≈ 30–40 fps cold, 15–20 fps throttled, versus 5.4 today — to be measured, not assumed. Safari path: `createImageBitmap(video)` (async, GPU copy) + OffscreenCanvas 2D in the worker (iOS ≥ 16.4); `MediaStreamTrackProcessor` is Chrome-only and stays optional.

## 6. Physical resolution / lens switching — measured before adopted **[probe]**
The harness gains two probes in „Diagnostyka”: (a) `applyConstraints` 1920×1080 ↔ 1280×720 three times, recording apply time, delivered settings, the rVFC gap, frames in the next 2 s, and the sharpness / mean-luma series over 2 s (focus and exposure recovery proxies); (b) zoom 1 → 2 → 1 with the same measurements. Adoption rule: a switch is viable only if apply ≤ 100 ms, no rVFC gap > 100 ms, and sharpness recovers to ≥ 0.8× within 500 ms; otherwise Scan Core derives all levels from one stream and uses zoom only as the FAR remedy if it passes the same rule. Lens handoff (iPhone virtual camera does it internally) stays out of Scan Core; single-camera path is universal.

## 7. Instrumentation contract (per frame, extends `FrameEvidence`)
`decision: { sourceW, sourceH, lowW, lowH, mediumW, mediumH, path: 'SKIP_NO_CANDIDATE' | 'SKIP_BLUR' | 'SKIP_MOTION' | 'LOW_MEDIUM' | 'NATIVE_ROI' | 'FAR_NATIVE_ROI' | 'RESCUE_FULL', reason: string, fill, moduleNative, sharpRel, stab, roi: { x, y, w, h, plane }, decodeMs, read: { text, lineCount, variant } | null, confirmation: { state, agreeing, value } }` — so every choice can be audited against tables 2–7.

## 8. Boundary
Scan Core lives in `src/scan-core/` (new, isolated), imports nothing from the catalog, Mapper, Solver, recipes or the product scanner, and emits only `ScanObservation { kind: 'barcode', value, format, confirmedAt, evidence: { frames, lineCounts, moduleNative, fill } } | { kind: 'none' }`. Scan Import is audited and integrated later.

## 9. What the probe session must answer before implementation freezes
1. main-thread cost and processed fps of the `image_bitmap` and `video_frame` transfer paths (60 s loop each, Note10+ Chrome); 2. readback cost inside the worker; 3. resolution-switch and zoom stall / focus / exposure behaviour; 4. whether zoom ×2 doubles `fill` for a 30–40 cm code without a stall. The harness probes for 3–4 ship in the next build; 1–2 are already selectable (transfer path) and recorded per attempt.
