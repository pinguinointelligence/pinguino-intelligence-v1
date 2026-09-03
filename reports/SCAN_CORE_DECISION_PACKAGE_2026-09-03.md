# SCAN CORE — Research, Architecture and Benchmark DECISION PACKAGE

Date: 2026-09-03 · Author: Claude (Fable 5.1) · Scope: **LIVE SCAN CORE only** (camera acquisition, target detection, tracking, guidance, temporal barcode evidence, scan artefact). Catalog, product identification, recipe Engine, nutrition, NextMe: **out of scope and untouched**.

Status: **DECISION PACKAGE — no production code written.** Throwaway spikes live outside the repo in `~/Developer/scan-core-spikes/` (Node + synthetic frames + two desktop-browser benches). Nothing here modifies staging. The six research files and the raw spike outputs are archived under `reports/scan-core-decision-2026-09-03/` (appendices A–F, spikes).

Evidence tags: **[VERIFIED]** fetched primary source or measured first-hand · **[VENDOR CLAIM]** · **[INFERENCE]** · **[SPIKE]** measured in this session's throwaway spikes — synthetic frames and desktop browsers, **not a phone**.

---

## 0. Executive summary

**Verdict.** The scanner feels dead for reasons that are structural, not tuning: the only visible feedback is wired to the *end* of a decode → network → catalogue chain, the loop blocks on every remote call, the decoder's geometry is thrown away before it reaches the UI, and frames are downscaled to a width at which a nominal EAN-13 is physically undecodable beyond ~11 cm. No amount of threshold repair fixes that. The recommended path is to **build a reusable Scan Core** on the open primitives we already ship (zxing-wasm 3.1.3 is already a dependency) using the architecture every world-class scanner converges on: cheap localization every frame → tracked identity → decode as a separate, retry-able stage on a rectified region → multi-frame confirmation → explicit guidance → one clean artefact out. Commercial SDKs are the benchmark, not the answer; the platform APIs that make native scanners feel alive (VisionKit, ML Kit) are not reachable from a PWA at all, and `BarcodeDetector` is absent/broken on iOS Safari through the iOS 26 betas.

**Why it feels dead — seven confirmed causes (details §1):**

1. **No feedback path independent of decode + catalogue.** The UI reacts only to `confirmed` / `unresolved` / `candidate`; `searching`, `ignored_low_quality`, `duplicate_suppressed` are silently dropped. Steady state is one static string, "Przesuwaj telefon nad produktami." (`LiveMultiScanner.tsx:106-119`, `liveScanSession.ts:35-49`).
2. **The loop is non-reentrant.** One `busy` flag covers cheap barcode reads *and* 1–5 s Vision/OCR calls; every frame during a remote call is dropped before decode (`liveScanController.ts:106,124-127`).
3. **Geometry is discarded.** The decoder wrapper keeps only `{rawValue, format}`; the ponyfill's `boundingBox`/`cornerPoints` never leave `barcodeDecoder.ts:9-12`. A live box is impossible with the current contract.
4. **Frames are downscaled to 640 px before any decode** (`liveScanController.ts:187`). At a 60° field of view a nominal EAN-13 module is 0.91 px at 20 cm and 1.22 px at 15 cm; all three decoders we benchmarked read 0 % of frames at 1.2 px/module (§1.8, §6). The current pipeline can only read a retail code held closer than roughly 11 cm — the iPhone wide camera's near-focus limit.
5. **No camera control at all.** The whole constraint set is `{facingMode:{ideal:'environment'}}`; no zoom, torch, focus, resolution (`LiveMultiScanner.tsx:82-85`). WebKit has shipped `zoom` since Safari 17.0 and `torch` by 17.5 [VERIFIED] — unused.
6. **On iPhone Safari the purpose-built fallback never runs.** `decodeWithTertiaryReader` requires an `HTMLCanvasElement`; the live loop only passes `ImageData` (`barcodeDecoder.ts:84`). Live scanning on Safari rests on zxing-wasm alone, with no rescue and no evidence below "fully decoded".
7. **Green requires the catalogue.** A perfect checksum-valid read of an uncatalogued product is indistinguishable from scanner failure (`liveScanSession.ts:258-270`). Correct as a *product* rule, wrong as a *scanner* signal.

Plus: zero real-device evidence exists in the repo (338 passing tests, all synthetic or mocked; `__fixtures__/real-product-scans/manifest.json` says the real images were deliberately not committed).

**What the best scanners do (§2).** Apple VisionKit, Google ML Kit, Dynamsoft and Scandit all: (a) localize before decoding and keep a tracked identity per target; (b) update highlight geometry every frame independently of decode; (c) trigger "too far → zoom" from the *localized-but-undecoded* state; (d) restrict compute to an aimer/ROI; (e) confirm across frames and de-duplicate; (f) feed back through visual + haptic + audio channels. None of that is exposed to a web page by the platform; every commercial web SDK re-implements it in WASM.

**The decision (§5, §7): "Tracked Evidence Pipeline" — build, on open primitives.** A Worker-hosted core with four stages and one state machine: **Acquire** (`requestVideoFrameCallback` → frame to Worker; full 1280×720 or 1920×1080, never 640) → **Locate** (classical bar-texture saliency every frame at ~15–30 fps, quality metrics, a small class-agnostic object localizer at low duty cycle for object mode) → **Track** (IoU/Kalman identities, geometry every frame) → **Decode** (zxing-wasm `readBarcodes` with `returnErrors`, `position`, `lineCount`, on the rectified tracked region; ROI first, full frame as fallback) → **Accumulate** (per-track confirmation: 2 agreeing full decodes = COMPLETE; guard-anchored per-slot evidence as the slow lane for blur/partial cases) → **Guide** (SEARCHING / FOUND / READING / HOLD / COMPLETE + direction, distance, steadiness, glare, light). Output is a `ScanArtefact` (§8) with no product identity in it.

**Temporal EAN (§4, §6).** Progressive reconstruction is feasible **only** as guard-anchored, module-indexed, per-slot probabilistic accumulation with a checksum-constrained best path, an explicit margin over the second-best valid string, and a consistency chain that refuses evidence sets that never overlap. The spike produced **0 wrong acceptances across 310 sequences** including chimera and mixed-code attacks, and completed codes where no single frame decoded (2/30 when the code was never more than 85 % visible; 7/30 in a full pan) — with a deliberately crude observation model. Naive digit concatenation, or checksum-as-repair, must never ship: 10 % of random 13-digit strings pass the EAN checksum.

**Build vs buy.** Build. The measured WASM decode cost is 10–14 ms per 1280×720 frame in Safari 26.5 on an M-series Mac [SPIKE], which leaves room for a 15–30 fps loop on an A16/A17-class phone in a Worker. STRICH is €99–249/month, Scandit/Dynamsoft are quote-priced with per-device/per-scan terms, all are lock-in, none exposes partial-evidence primitives richer than zxing-cpp's, and the core is the strategic asset for NextMe. Keep one commercial trial page as a reference benchmark during Phase 1 (no purchase).

**Headline targets after research (§10):** first visible reaction to a target ≤ 100 ms (Nielsen's direct-manipulation limit); tracked box stable within 2 frames; EAN-13 completion p50 ≤ 0.7 s / p95 ≤ 2.0 s at 12–30 cm with hand jitter; 0 wrong codes in 500 scans; ≥ 15 fps sustained for 60 s on an iPhone 13 / mid-range Android without thermal collapse; identical behaviour on iPhone Safari and Android Chrome.

**Next step:** Phase 0 (§9) — one week of *instrumented real-device baseline* with a throwaway harness before any production code, because the repository contains no phone measurement at all.

---

## 1. CURRENT FORENSIC — what the existing scanner does and why it feels dead

Basis: read-only audit of `origin/staging` @ `285f15ed` in a fresh worktree (`~/Developer/pinguino-scan-core-decision`), file:line references throughout; full report in Appendix F (`research/F1_current_scanner_forensic.md`). Test run: `npx vitest run src/features/product-scanner` → 37 files passed / 1 skipped, 338 tests passed / 1 skipped, 6.66 s.

### 1.1 Two scanners, one camera loop

| Component | What it really is | Entry |
|---|---|---|
| `LiveMultiScanner.tsx` | the **only** `getUserMedia` loop in `src/` (`:82-85`) | HOME creator "Zeskanuj" (`HomeCreatorPage.tsx:478`, label `homeCreatorCopy.ts:182`) |
| `LiveProductScanner.tsx` | **not live** — a native `<input type="file" capture="environment">` one-photo form (`:540-551`) plus gallery/drag/paste, feeding the analyze→finalize Edge flow | route `/products/scan` (`router.tsx:262`) and inline in `ProductPickerPopover.tsx:1074` ("Skanuj produkt") |

They share leaf utilities (barcode validation, image preparation, the shared decoder) and nothing else — no controller, session or camera code. Any redesign must treat them separately.

### 1.2 What the user sees

Phases `starting → scanning → review / deep / no_camera` (`LiveMultiScanner.tsx:44`). While scanning: black background, `object-cover` video, a **decorative** reticle (`inset-8 rounded-3xl border-4`, white/40, emerald only while a `flash` is set — `:239-244`), a status line showing either "Dodano: {name}" or `hint ?? 'Przesuwaj telefon nad produktami.'`, and a bottom bar "Anuluj / Zebrane: N / Koniec". Handled events: `confirmed` → green pill 1400 ms; `unresolved` → "Zapisaliśmy ten produkt — dokończysz go po skanowaniu."; `candidate` → static "Przytrzymaj chwilę." even though the event carries `evidence`/`needed` counts (`liveScanSession.ts:40`) that the UI never reads. Unhandled: `searching`, `ignored_low_quality`, `duplicate_suppressed`. There is **no bounding box, no tracking, no progress, no directional guidance** anywhere in the live loop. A complete guidance vocabulary already exists — `liveCapture.ts:60-67` ("Za ciemno — doświetl etykietę.", "Zmniejsz odblask na etykiecie.", `unstable/blurred/glare/too_dark/no_text/settling`) — and is **orphaned**: imported only by its own test.

### 1.3 The pipeline as built

- Constraints: `{ video: { facingMode: { ideal: 'environment' } }, audio: false }` — nothing else; repo-wide grep for `torch|zoom|focusMode|applyConstraints|getCapabilities|ImageCapture` in the feature returns zero hits.
- Frame pump: `createLiveFrameSource` uses `requestVideoFrameCallback` when present, else `requestAnimationFrame` (`liveFrameSource.ts:28,39-57`) — correct and reusable.
- Grab: `createVideoFrameGrabber(video, maxWidth = 640)` draws the **whole** frame into a reused canvas scaled to ≤ 640 px wide and reads it back with `getImageData` (`liveScanController.ts:185-204`). No ROI, no crop, no Worker (`new Worker|OffscreenCanvas|postMessage` → zero hits in the feature).
- Per frame (`liveScanController.ts:105-128`): bail if `busy` → grab → `scoreRgbaFrame` → offer to a 700 ms `RollingBestFrameWindow` (thumbnail only) → `busy = true` → `identify()` → `LiveRecognizer.observe()` (barcode, then a fallback rung) → `liveScanSession.observeFrame` → `onUpdate` → `busy = false`.
- Constants: `VISION_MIN_INTERVAL_MS 1200`, `VISION_MAX_CALLS 12`, `PRODUCTIVE_ROUTE_TTL_MS 4500`, `OCR_MIN_INTERVAL_MS 1500` (`liveRecognition.ts:82-99`); `EVIDENCE_WINDOW_MS 4000` (`liveScanSession.ts:146`); no explicit fps cap.

### 1.4 The barcode path and the dead fallback

Decoder order (`barcodeDecoder.ts:132-149`): native `BarcodeDetector` if it supports all of `ean_13, ean_8, upc_a, upc_e` → else the `barcode-detector` ponyfill (zxing-wasm 3.1.3, `zxing_reader.wasm` 1.09 MB, warmed on scanner open) → checksum validation → `decodeWithTertiaryReader`. The tertiary reader (`barcodeScanline.ts`, a pure scanline EAN-13/EAN-8/UPC-A reader written *because Safari has no BarcodeDetector*) is guarded by `source instanceof HTMLCanvasElement` (`:84`); the live loop passes `ImageData` (`liveScanController.ts:200` → `liveRecognition.ts:277` → `liveScanCapabilities.ts:123-126`). **It never executes live.** The scanline reader itself is full-decode-or-null per row (all three guards + 12 digits on one horizontal row, per-row min/max midpoint threshold, no orientation handling beyond reversal) — it exposes no partial evidence either.

`barcodePerformance.test.ts` ("< 500 ms") times only this unreachable path against a perfect synthetic bitmap. Dedup is identity-scoped (`BARCODE_EVIDENCE_REQUIRED = 1`, suppression `for_the_whole_sweep`); catalogue lookups are memoised per identity, including misses, in a recognizer that is rebuilt on every "Skanuj dalej".

### 1.5 Quality gating

`scoreRgbaFrame` (`frameQuality.ts:12-73`): exposure = share of luminance in [0.16, 0.92]; glare = share > 0.96; sharpness = mean |Laplacian| × 5 on a strided sample; `labelFill = 0.72` is a **hard-coded literal**, not a measurement (`:61`); `acceptableForAutoCapture = score ≥ 62 && sharpness ≥ 0.35 && glare ≤ 0.18` (`:71`). That single boolean both **gates whether any decode is attempted** (`liveRecognition.ts:128-132` returns `'NONE'`) and selects the thumbnail (`rollingBestFrame.ts:18-22`). A frame at sharpness 0.34 is never offered to the decoder at all, silently.

### 1.6 The ladder and its remote dependency

Barcode → `CATALOG_MATCH` (Supabase RPC `search_products_v1`, `services/productScanner.ts:99-118`) → `VISION_FALLBACK` (`product-identify-live` Edge → OpenAI → catalogue RPC; 401 for signed-out users, `index.ts:135-136`) → lazy OCR escalation (one Tesseract worker per sweep, `liveScanCapabilities.ts:82-90`). Every UI-affecting event requires a non-null `identityKey`, which for barcodes requires the **network** catalogue round trip; until then the session emits only `{kind:'searching'}`, which the UI ignores. The live feedback pipeline and the network recognition pipeline are literally the same pipeline. With `busy` held for the whole `observe()` promise, two Vision round trips (1.5–3 s each, ≥ 1.2 s apart) freeze *all* recognition for 4–8 s with no visible sign beyond the static hint.

### 1.7 Session and the catalogue gate

`liveScanSession.observeFrame` (`:214-282`) gates: quality → identity → not-yet-accepted → qualifies (validated barcode or confidence ≥ 0.7) → enough evidence in the 4000 ms window → then, quoting the code: *"GREEN belongs to the catalogue, not to the decoder."* `acceptance = catalogResolved ? 'confirmed' : 'needs_resolution'` (`:258-270`). The session policy itself is sound and well tested; it belongs **downstream** of a scan core, not inside it.

### 1.8 The physics gap [SPIKE + INFERENCE]

EAN-13 nominal X-dimension is 0.330 mm and the symbol is 95 modules wide [VERIFIED, GS1]. Pixels per module = 0.33 mm × f / d with f = (W/2)/tan(HFOV/2). For a phone main camera (≈ 60° horizontal FOV at 16:9):

| distance | 640 px wide (current) | 1280 px | 1920 px | full code width @1280 |
|---|---|---|---|---|
| 10 cm | 1.83 | 3.66 | 5.49 | 348 px |
| 15 cm | 1.22 | 2.44 | 3.66 | 232 px |
| 20 cm | 0.91 | 1.83 | 2.74 | 174 px |
| 25 cm | 0.73 | 1.46 | 2.19 | 139 px |
| 30 cm | 0.61 | 1.22 | 1.83 | 116 px |
| 40 cm | 0.46 | 0.91 | 1.37 | 87 px |

Spike A (§6.3) measured the decode floor of zxing-wasm, zbar-wasm and the repo reader on realistically blurred synthetic frames: **100 % at 2.0 px/module, 75–92 % at 1.5, 0 % at 1.2**. Combined: at 640 px the current loop can only read a nominal code closer than ≈ 11 cm, and an 80 %-magnification code (common on small packs) closer than ≈ 9 cm — inside the near-focus limit of most phone main cameras. This single design constant explains a large share of "real-device scanning currently fails", before any of the UX defects are counted. (Actual delivered resolution also depends on what the browser picks for an unconstrained `getUserMedia`; the 640 px downscale caps it regardless.)

### 1.9 Ranked failure causes

| # | cause | status | evidence |
|---|---|---|---|
| 1 | no feedback path independent of decode + catalogue | CONFIRMED | `LiveMultiScanner.tsx:106-119`, `liveScanSession.ts:35-49` |
| 2 | guidance computed then discarded (quality → silence) | CONFIRMED | `frameQuality.ts`, orphaned `liveCapture.ts:60-67` |
| 3 | 640 px downscale → sub-module resolution beyond ~11 cm | CONFIRMED constant + SPIKE floor | `liveScanController.ts:187`, §6.3 |
| 4 | non-reentrant controller blocks barcode reads during Vision/OCR | CONFIRMED | `liveScanController.ts:106,124-127` |
| 5 | geometry discarded — no box possible | CONFIRMED | `barcodeDecoder.ts:9-12` |
| 6 | no ROI/aimer tied to decode; reticle decorative | CONFIRMED | `LiveMultiScanner.tsx:239-244`, `liveScanController.ts:196-200` |
| 7 | Safari fallback never runs live | CONFIRMED | `barcodeDecoder.ts:84` |
| 8 | no camera control (zoom/torch/focus/resolution) | CONFIRMED | `LiveMultiScanner.tsx:82-85` |
| 9 | catalogue gate hides successful decodes | CONFIRMED | `liveScanSession.ts:258-270` |
| 10 | main-thread contention (grab + score + decode + React) | PLAUSIBLE | zero Workers in feature |
| 11 | one threshold gates decode and thumbnail | CONFIRMED | `frameQuality.ts:71`, `liveRecognition.ts:128-132` |
| 12 | no visibility handling, no wake lock | CONFIRMED absence | grep |
| 13 | Vision rung needs sign-in, silently | CONFIRMED | `product-identify-live/index.ts:135-136` |
| 14 | zero real-device evidence | CONFIRMED | `__fixtures__/real-product-scans/manifest.json` |

### 1.10 Reusable components

| verdict | component | why |
|---|---|---|
| KEEP | `barcode.ts` | pure GTIN/UPC checksum + UPC-E expansion |
| KEEP | `liveFrameSource.ts` | correct rVFC/rAF pump; add visibility handling |
| KEEP | `rollingBestFrame.ts`, `barcodeTiming.ts` | small, pure, tested |
| KEEP (downstream) | `liveScanSession.ts`, `liveScanHandoff.ts` | sound basket/acceptance policy — lives **outside** the Scan Core, consuming its artefacts |
| KEEP (static flow) | `validation.ts`, `imagePreparation.ts`, `resultPresentation.ts`, `customerProductGapGuidance.ts`, `contracts.ts`, `scannerErrors.ts`, `autonomousScanLoop.ts` | analyze/finalize flow, untouched by this decision |
| KEEP WITH CHANGES | `frameQuality.ts` | split "worth decoding" from "best reference"; measure `labelFill`; add glare *location* |
| KEEP WITH CHANGES | zxing-wasm dependency | call `readBarcodes()` directly (position, `lineCount`, `returnErrors`), not through the `BarcodeDetector`-shaped ponyfill |
| REVIVE | `liveCapture.ts` vocabulary, `evidenceState.ts` "ask for exactly the one missing view" | orphaned previous generation; directly applicable |
| REPLACE | `liveScanController.ts` busy-gate design, `barcodeDecoder.ts` wrapper contract | the two most consequential architectural choices |
| RETIRE | `barcodeScanline.ts` as a hidden fallback | keep as a test oracle for the evidence layer, or drop |
| DELETE | `pipeline.ts`, `scanRouting.ts`, `liveFieldState.ts` | orphaned, superseded |

### 1.11 Assumptions to challenge (each embodied in code)

1. "A frame either fully decodes or contributes nothing" (`barcodeScanline.ts`, `liveScanSession.ts:178-181`).
2. "Green requires the catalogue" — true for the product, false for the *scanner's own* feedback (`:258-270`).
3. "Identification belongs in the live per-frame loop" (`liveRecognition.ts:8-12`) — it makes "live" mean "occasionally remote".
4. "OCR is a rung below Vision" — an escalation order, not a live-loop capability.
5. "`BarcodeDetector` is the primary decoder and the scanline reader the net" — the net is inert where it matters.
6. "One quality score can gate decoding *and* pick the reference frame."
7. "A cosmetic reticle is enough aiming UI."
8. "Silence is acceptable for 'nothing recognized yet'."
9. "Evidence-window constants tuned against Vision intervals generalise to hand jitter" — never measured on a device.
10. "`LiveProductScanner` is part of the live scanner" — it is not.

---

## 2. EXTERNAL RESEARCH

Six research files (Appendices A–F) hold the full evidence with per-bullet tags and every fetched URL. This section keeps the decision-relevant findings.

### 2.1 Platform and commercial scanners (Appendix A, R1)

**The recurring architecture** — each mechanic and where it is verified:

| mechanic | Apple VisionKit | Google ML Kit | Dynamsoft (web) | Scandit (web) |
|---|---|---|---|---|
| localize before / separate from decode | `RecognizedItem` with stable `id` + per-frame `bounds`; `isHighFrameRateTrackingEnabled` = "frequency at which the scanner updates the geometry" [VERIFIED] | `enableAllPotentialBarcodes()` returns a `Barcode` with `boundingBox` and `rawValue == null` — "even if they cannot be decoded" [VERIFIED] | `IntermediateResultReceiver` / `OnLocalizedBarcodesReceived`, separately licensed [VERIFIED] | `BarcodeBatch`/MatrixScan tracked identities [VERIFIED] |
| tracked highlight across frames | `didAdd / didUpdate / didRemove` keyed by id [VERIFIED] | app-side | localized-zone units [VERIFIED-SEC] | per-tracked-barcode `Brush` [VERIFIED-SEC] |
| "too far → zoom" | pinch-to-zoom + `qualityLevel` | `ZoomSuggestionOptions` fires when "all barcodes within the view are too distant for decoding" [VERIFIED] | Camera Enhancer Auto Zoom "when a barcode area is found but failed to be decoded" [VERIFIED] | camera zoom API |
| aimer / ROI | `regionOfInterest`; `AVCaptureMetadataOutput.rectOfInterest` [VERIFIED] | recommended ≤ 2 MP frames [VERIFIED] | — | Scan Area + laserline/aimer viewfinders; "improves performance as less information needs to be processed" [VERIFIED] |
| multi-frame confirmation / dedup | identity-based | app-side | `MultiFrameResultCrossFilter`: cross-verification "crucial for barcodes with limited error correction capabilities, such as 1D codes", dedup forget window 3 s [VERIFIED-SEC] | duplicate filter default 1000 ms; Smart Scan Intention default-on [VERIFIED] |
| feedback | system highlight + guidance labels | app-side | — | default beep + vibration + brush [VERIFIED] |

Two facts decide the platform question: **none of the native pieces is reachable from a PWA** (VisionKit/ML Kit/Code Scanner are native SDKs), and the web's own `BarcodeDetector` is *thinner* than ML Kit — no confidence, no partial result, binary decoded-or-absent [VERIFIED, MDN] — and on Android depends on Google Play Services [VERIFIED, Chrome doc]. Every commercial web SDK (Dynamsoft, Scandit, STRICH, barKoder, Cognex cmbWEB, Anyline, Microblink) is a WASM engine re-implementing the table above [VERIFIED]. Public pricing: STRICH €99/month (10 k scans) → €249/month (100 k) → from €4 000/year business [VENDOR PAGE, 2026-09-03]; barKoder from ≈ $1 250/year/50 devices [VERIFIED-SEC]; Scandit, Dynamsoft, Anyline, Cognex: quote-based. Scandit's throughput claim "480 scans per minute, > 99 % accuracy, zero false positives" is a brochure figure [VENDOR CLAIM]. Two Dynamsoft names from the brief — `PartialBarcodeText`, `IsPartialResult` — could not be found in current docs or typings; do not design around them [UNVERIFIED].

### 2.2 Open-source decoders and browser primitives (Appendix B, R2)

| library | license | wasm size | maintained | exposes for an evidence layer | weaknesses |
|---|---|---|---|---|---|
| **zxing-cpp / zxing-wasm 3.1.3** | Apache-2.0 / MIT | reader 1.04 MiB | v3.1.x, 2026-07 | `position` quad and `lineCount` on every result; `returnErrors` returns checksum/format-failed candidates *with* geometry; `ReaderOptions` cost dials (`tryHarder`, `tryRotate`, `tryInvert`, `tryDownscale`, `binarizer`, `minLineCount`, `isPure`) [VERIFIED source `ReaderOptions.h`, `Barcode.h`, `ODReader.cpp`] | no scalar confidence; build flags decide 10× speed (a MinSizeRel build once shipped at 1.3–2 s/frame) [VERIFIED] |
| **ZBar / @undecaf/zbar-wasm 0.11** | LGPL-2.1 | ≈ 330 KB | upstream last release 2024-01 | `zbar_symbol_get_quality()`, inter-image cache with "consistency checking and hysteresis", `ZBAR_CFG_UNCERTAINTY` ("required video consistency frames"), `ZBAR_PARTIAL`, EAN halves decoded and merged separately in `ean.c` [VERIFIED source] | LGPL in a WASM bundle needs legal sign-off; stale; slow on noisy frames (129–199 ms in Spike A) |
| barcode-detector (Sec-ant) | MIT | wrapper 261 KB + zxing-wasm | 3.2.2 | `BarcodeDetector`-shaped only — hides position/lineCount/errors [INFERENCE] | we currently use exactly this shape |
| quagga2 | MIT | JS | community | per-digit `error` values in `decodedCodes`, localization boxes | JS-only, older reputation |
| OpenCV barcode module | Apache-2.0 | not in default opencv.js | 4.8+ | gradient-coherence detection, optional super-resolution CNN for small codes (WeChat lineage, single-crop, no paper) [VERIFIED] | custom build required |
| browser `BarcodeDetector` | — | 0 | Chrome 83+ Android (GMS), macOS (Vision), **Windows/Linux no backend**, Safari flag-only and broken on iOS 18.0–26 betas (WebKit #281848, open) [VERIFIED] | no confidence, no partial | opportunistic Android accelerator at most |

Other verified facts: ONNX Runtime Web has WASM/WebGPU backends and Safari 26 shipped WebGPU, but **no citation-backed phone-browser latency exists for any nano detector** (YOLOv8n/YOLO11n/EfficientDet-Lite0) — first-party benchmarking is required; Ultralytics YOLO is AGPL-3.0 (SaaS-reaching copyleft) [VERIFIED]; OpenCV.js standard builds ship Lucas–Kanade but **not** KCF/MOSSE/CSRT trackers [VERIFIED]; Tesseract.js is multi-second-class on phones and `tesseract-wasm` (BSD-2, 2.1 MB, SIMD) is the faster port but unbenchmarked on label crops [VERIFIED/CLAIM].

### 2.3 Literature (Appendix C, R3)

- **Detect at distance, then guide, then decode** has a 15-year precedent: Tekin & Coughlan (WACV 2009) cascade-filter localization with "closer" guidance; **BLaDE** (2012/13, open source on SourceForge) runs at video rate, works "even when only part of the barcode is visible", and guides with two independent channels — tone continuity = centring, volume = distance; user study 82 % success with feedback vs 65 % without (n = 90 trials, p = 0.056) [VERIFIED].
- **Probabilistic per-digit decoding with the checksum as a constraint** is proven: Gallo & Manduchi (TPAMI 2011) deformable per-digit templates on gray-level scanlines with dynamic programming across digits; Tekin & Coughlan (CRV 2009) Bayesian scanline model with checksum-constrained correction — 42/44 clean vs 39/44 and 13/44 for two commercial readers, 2/35 hard vs 0/35, but "tens of seconds" in MATLAB [VERIFIED].
- **Cross-frame fusion of 1D barcodes is not in the peer-reviewed literature** as an end-to-end method; the existence proof is patent literature ("signal-aided voting": quality-mapped, guard-aligned, symbol-wise voting across scanlines to recover a code no single scanline recovered, US 6,454,168) and the transferable architecture is video-OCR's **ROVER** align-then-vote (Fiscus 1997) and row-based multi-frame integration (up to 98 % character accuracy) [VERIFIED]. **No source quantifies the false-accept risk of stitching partial reads** — a genuine gap that our spike addresses directly (§4, §6).
- **Deep learning owns localization, not decoding**: YOLO-family and segmentation detectors reach 0.99 on Muenster/ArTe-Lab and 0.87–0.91 mAP on hard small-code sets (ParcelBar); decoding is still handed to ZXing/ZBar; no citable CTC/CRNN 1D-barcode *decoder* exists [VERIFIED/INFERENCE].
- **Quantitative anchors**: ≈ 2 px/module is the practical industry baseline, 1–2 "sometimes possible", < 1 undecodable without reconstruction [industry sources]; Nielsen 0.1 s / 1 s / 10 s response limits [VERIFIED]; EAN-13 = 95 modules, guards 101/01010/101, 7 modules per digit, first digit via left parity pattern, mod-10 with weights 1/3 detecting every single substitution and every adjacent transposition except pairs differing by 5, quiet zones 11/7 modules, nominal 37.29 × 27.85 mm [VERIFIED].

### 2.4 Object mode, frame quality, OCR (Appendix E, R5)

- MediaPipe Tasks-Vision `ObjectDetector` (Apache-2.0, WASM+WebGL, EfficientDet-Lite0 320×320: 29–61 ms CPU / 28 ms GPU on Pixel 6 **native**, no browser number published) knows banana/apple/orange/bottle/cup/bowl but **no box, carton, package or can class** — verified from the label map. A class-agnostic localizer is mandatory for packaged goods: U2-Netp saliency (4.7 MB, Apache-2.0) or a centre-prior + edge-density objectness heuristic [VERIFIED/INFERENCE].
- No tracker ships in the modern web Tasks API; the reference pattern (MediaPipe Box Tracking) runs the detector at 0.5 fps and a cheap tracker every frame; SORT-style IoU + Kalman in plain JS is the realistic browser tracker [VERIFIED/INFERENCE].
- Quality signals that are cheap and reliable: Laplacian variance / Tenengrad (blur), histogram clipping (exposure), HSV high-V/low-S clusters (glare), box-area ratio (distance), edge contact (cut-off), quad-fit deviation (angle). No learned IQA model is justified [INFERENCE].
- OCR does not belong in the live loop; run text *detection* live at most, recognition once on the best frame. Coarse categories (banana, Granny Smith, orange, lemon, pineapple, strawberry, pop bottle, beer bottle, milk can, carton, packet) exist in stock ImageNet classifiers; brand/SKU identity needs retrieval (SigLIP-base is the one CLIP-family model with a browser ONNX export; MobileCLIP's sub-2 ms numbers are native CoreML/ANE) or a cloud VLM — downstream [VERIFIED/INFERENCE]. Apple's own Visual Look Up draws the same line: coarse on-device, landmarks via encrypted server-side embedding match [VERIFIED].
- Consumer scanners (Vivino, Amazon Lens Live, Yuka, Open Food Facts) share one pattern: forgiving live capture, no hard multi-angle gate, always a manual fallback [VERIFIED/CLAIM].

### 2.5 Mobile browser reality (Appendix D, R4 + first-hand probe)

First-hand probe, 2026-09-03, same page in two engines on this Mac [VERIFIED]:

| capability | Safari 26.5 (WebKit 605) | Chromium 148 (in-app pane) |
|---|---|---|
| `BarcodeDetector` (window / worker) | **absent / absent** | present (ean_13, ean_8, upc_e… **no upc_a** in list) |
| `MediaStreamTrackProcessor` | **absent** | present |
| `VideoFrame`, `VideoDecoder` | present | present |
| `ImageCapture` constructor | present | present |
| `requestVideoFrameCallback` | present | present |
| `OffscreenCanvas` (window; worker 2D; worker WebGL2) | present / present / present | present / present / present |
| WebGPU adapter (window / worker) | ok / ok | ok / ok |
| WebNN | absent | absent |
| `SharedArrayBuffer` (page not cross-origin isolated) | absent | absent |
| WASM SIMD / threads-validate / relaxed-SIMD | yes / yes / **no** | yes / yes / yes |
| `getSupportedConstraints` | aspectRatio, backgroundBlur, deviceId, facingMode, frameRate, groupId, height, powerEfficient, **torch**, whiteBalanceMode, width, **zoom** — **no focusMode, focusDistance, exposureMode, pointsOfInterest** | all of those plus focusMode, focusDistance, exposureMode, exposureTime, iso, pointsOfInterest |
| `navigator.vibrate` | absent | present |
| Wake Lock | present | present |

Documentation-backed matrix for the phone targets (R4): `zoom` shipped in Safari 17.0 [VERIFIED WebKit notes], `torch` by 17.5 [VERIFIED]; `ImageCapture.grabFrame()` only from Safari 26 (stub before) [VERIFIED BCD]; `MediaStreamTrackProcessor` disputed on shipping Safari 18 and absent in 26.5 [VERIFIED] — never build on it; `OffscreenCanvas` 2D in Workers 16.4+, WebGL 17+ [VERIFIED]; WebGPU Safari 26.0 / Chrome Android 121 [VERIFIED]; WASM threads need COOP/COEP cross-origin isolation, which breaks third-party subresources unless scoped per route on Vercel [VERIFIED]; standalone Home-Screen PWAs still re-prompt camera permission across relaunches (WebKit #215884, evidence through Jan 2025) [VERIFIED]; iOS kills a page silently around 100 MB (iPhone SE 3) / 200 MB (iPad 8) with no exception (tested iOS 26.2) [VERIFIED]; Samsung/Chrome frequently resolve `facingMode: environment` to a fixed-focus ultrawide — the `enumerateDevices()` label-sort heuristic is the known workaround [REPORTED]; no thermal API exists on either engine [INFERENCE]; no vendor publishes continuous-scan power figures [gap].

**The safest acquisition pipeline that works on both engines in 2026:** `getUserMedia` (explicit width/height/frameRate ideals, back camera by label heuristic) → `<video playsinline muted>` → `requestVideoFrameCallback` → `createImageBitmap(video)` or `new VideoFrame(video)` on the main thread → transfer to a Worker → `OffscreenCanvas`/`getImageData` or `VideoFrame.copyTo` → WASM. Threads are optional; SIMD is available.

### 2.6 How to read the evidence

Every bullet in Appendices A–F is tagged. Items tagged VERIFIED were fetched from the primary page; VERIFIED-SEC came from a search excerpt of a primary page that could not be fetched (Dynamsoft parameter pages 404, Cognex DNS, Honeywell redirect loop); numbers extracted from PDFs the fetch tool could not render (Gallo–Manduchi tables, BarBeR results) are explicitly marked as *not reproduced*. Nothing in this package rests on a VENDOR CLAIM.
---

## 3. PROBLEM MAP — every failure class in the brief

| # | problem | how world-class systems solve it | our options (PWA) | what remains difficult |
|---|---|---|---|---|
| 1 | **Frame quality** — blur, motion, glare, focus, distance, angle, cropping, low light, curved packaging | Frame filters that discard low-quality frames before decode (Dynamsoft "Frame Filter", "Sensor Control" — discard while shaking); zoom/torch actuation on the localized-but-undecoded state; template/deformable decoders that tolerate blur (Gallo–Manduchi); two-stage quality: *decodable?* vs *best reference?* | Classical metrics per frame in the Worker (Laplacian/Tenengrad on the ROI, clipped-histogram exposure, HSV glare clusters *with location*, quad-fit angle, box/edge geometry); inter-frame displacement of the tracked box as motion proxy; `torch` and `zoom` constraints on both engines; distinguish "bad frame" (no usable structure: no bar texture, glare over the code, blur > module width) from "useful partial evidence" (guards found, ≥ 2 anchors, slots scored) — the evidence layer decides, not a global score | No native thermal/focus-state signal on iOS (`focusMode` absent); curved surfaces need rectification from the quad, which needs a localizer that returns a quad even on cans; motion blur > 1 module is unrecoverable per frame and must be waited out ("HOLD") |
| 2 | **Target detection** — barcode / object / label text / nothing, cheaply, before expensive recognition | Cascade rejection of regions (Tekin–Coughlan), gradient-coherence bar saliency (OpenCV barcode, Sörös GPU saliency at 6 fps HD in 2013), detector at low duty cycle + tracker every frame (MediaPipe Box Tracking), aimer ROI to bound cost | Classical bar-texture saliency (structure tensor / oriented gradient energy on a 320-px pyramid) every frame ≈ 1–3 ms; zxing `returnErrors` as a second "something barcode-shaped is here" signal; text-likeness by stroke-density heuristic; object localizer (EfficientDet-Lite0 or U2-Netp/centre-prior) at 2–5 fps only when no bar texture is present | Browser-side detector latency on phones is unmeasured in any citation — must be benchmarked first-party (Phase 0); "nothing useful" must be declared quickly without flapping |
| 3 | **Barcode acquisition** — partial, small, perspective, rotation, curved, damaged, motion blur, low resolution | Multi-row voting (`lineCount`, ZBar quality), left/right half decoding (ZBar), auto-zoom on localized-undecoded, super-resolution of small crops (OpenCV/WeChat SR), rotation-invariant localization, deblur modes (Dynamsoft `DeblurModes`), duplicate filters | Decode on the rectified tracked quad at full resolution (crop, not downscale); `tryRotate`/`tryHarder` only on the ROI; zoom actuation when module estimate < 1.6 px; slow-lane guard-anchored per-slot accumulation for partial/blurred codes; never emit a code without ≥ 2 agreeing frames or a margin-gated evidence path | Sub-1.2 px/module stays unreadable without SR; damaged codes (scratch across all rows) resist all three decoders (Spike A); curved + tilted cans need the quad from a detector, not from zxing (which only returns geometry when it decodes) |
| 4 | **Product without barcode** — localize and track before semantic recognition | Detector at low fps + tracker at full fps with IoU association; centre-prior; class-agnostic saliency; coarse on-device category; SKU by retrieval or cloud, triggered once | Same Worker; object lane activates when bar saliency is absent for ~300 ms; SORT tracker; quality + framing guidance (fill 40–80 % of frame, not cut, not blurred, glare not on label); coarse category optional | No COCO class for box/carton/can — class-agnostic path is mandatory; no verified browser latency for any small detector; identity belongs downstream |
| 5 | **Label / text** — accumulate evidence across frames instead of one perfect photo | Text tracking with per-instance homography (Merino-Gracia), ROVER voting, row-based multi-frame integration; native Live Text/ML Kit throttle to frames | Text *detection* signal live (heuristic or a tiny DB model later); best-frame retention per tracked label region; recognition once, in a Worker, on the best crop; character-level voting only across crops of the same tracked region | Real-time OCR in the loop is not realistic (Tesseract.js seconds per frame); PaddleOCR-web unbenchmarked; multi-frame text fusion is a Phase 4 item |
| 6 | **Recognition vs downstream identity** | Apple Visual Look Up: coarse on-device, hard cases via embedding match server-side; commercial SDKs stop at the decoded value | Scan Core returns a `ScanArtefact` (verified code or partial evidence + crops + geometry + quality + reasons); catalogue, SKU, nutrition, Gellatti/NextMe consume it | Keeping "green" honest in the product while the scanner already says COMPLETE — two different lights (§8) |
| 7 | **Confidence / orchestration** — finish fast without false positives | Duplicate filters of 1000 ms (Scandit) / 3 s forget window (Dynamsoft); cross-frame verification for 1D codes; `minLineCount` voting; auto-zoom instead of waiting | Fast lane: two agreeing full decodes on the same tracked target within 400 ms → COMPLETE (one decode already carries a checksum; the second removes the 10 % aliasing tail and camera-line artefacts); slow lane: evidence margin ≥ 20:1 + coverage + consistency; never wait for a remote call to show anything; timeouts per state (FOUND > 1.5 s without READING → guidance escalates: zoom, torch, "move closer") | Choosing thresholds on real devices (Phase 0/2 benchmark), not on synthetic frames |
| 8 | **Network dependency** | On-device processing for all live mechanics (every vendor); remote only for identity | Everything in the Scan Core is local; the only network in the whole flow is downstream identity, after COMPLETE, off the live loop and never blocking it | Vision/VLM identification of objects stays remote and slow (1–5 s) — the UI must show local progress meanwhile |
| 9 | **Device / browser reality** | Native SDKs | `getUserMedia` with explicit ideals, label-sorted back camera, `zoom`/`torch` where present, rVFC pacing, Worker + OffscreenCanvas + WASM SIMD, WebGPU optional, visibility/wake-lock handling, memory discipline (< 60 MB), permission re-prompt UX on standalone iOS | No `focusMode` on Safari; `MediaStreamTrackProcessor` absent; threads need COOP/COEP; iOS standalone permission re-prompts; iOS memory kill is silent |
| 10 | **Live user feedback** | Highlight glued to target at frame rate; guidance labels; beep + haptic; aimer | State machine drives copy, colour and geometry every frame from *local* signals only; box + direction arrows + distance meter + steadiness ring; Polish copy from the revived vocabulary; audio unlocked on the first tap; haptics on Android, none on iOS | Guidance must not flap (hysteresis, 3-frame debounce); the honest split between "scanner has it" and "product identified" |

---

## 4. TEMPORAL EAN STUDY

### 4.1 Why a per-frame decoder is not enough

A retail scan is a moving hand, a small code and a rolling-shutter camera. Spike A (§6.3) shows what a modern decoder can and cannot do on one frame: at ≥ 2 px/module and mild blur it is essentially perfect; at 1.5 px it is 75–92 %; at 1.2 px, or with blur ≥ 1.2 px, or with 4 px of motion blur, or with the code cut anywhere, it is 0 %. zxing-cpp already votes across *rows* of one frame (`minLineCount`, `lineCount` — `ODReader.cpp` [VERIFIED]); ZBar already decodes the *left and right halves* separately and keeps an inter-frame cache with hysteresis (`ean.c`, `zbar.h` [VERIFIED]). Neither carries evidence across frames at the digit level. The literature proves the per-digit probabilistic representation (Gallo–Manduchi; Tekin–Coughlan) and the align-then-vote architecture (ROVER, patent voting) separately; nobody has published the combination, and nobody has published its false-accept rate. So the question is not "can we accumulate" but "what can be accumulated *safely*".

### 4.2 What can safely be accumulated

Only evidence that is **indexed by physical module position on the same tracked code**. An EAN-13 is 95 modules; each of the 12 encoded digits owns a fixed 7-module slot (slot k starts at module 3 + 7k on the left and 50 + 7(k − 6) on the right); the guards sit at modules 0–2, 45–49 and 92–94; the first digit is not printed as bars but implied by the parity pattern of the six left slots. Therefore a scanline observation is safe to fold into the running belief when, and only when:

1. its **module frame** (origin and module width) is anchored on **at least two guard patterns** (start+middle, middle+end or start+end) — with one anchor the scale estimate from three bars is too weak and the spike showed slots drifting into confident nonsense (§6.4);
2. the code is **rectified** through the quad the localizer/tracker gives (perspective makes module width vary along the code; the spike's image-space scanlines failed at 35° yaw and the rectified ones locked correctly);
3. each slot yields a **posterior over classes** (20 for a left slot — digit × L/G parity — 10 for a right slot), not a hard digit, scored by correlation with blur-matched templates on the slot's interior;
4. scanlines **within one frame are averaged** (their blur errors are correlated) and only **across frames** are posteriors multiplied.

What must never be accumulated: hard digits, digits without an anchor pair, evidence from a different tracked target, and OCR strings — see 4.5.

### 4.3 Alignment across frames

Alignment is not image registration; it is **index alignment**: every observation is converted into the code's own module coordinates before it touches the belief. The tracker supplies target identity and the quad; the anchors supply the module frame; sub-pixel anchor refinement (parabolic interpolation on the correlation peak) and damped per-slot shift chaining absorb residual drift. Two frames therefore align even if the code moved, rotated or was cut differently — as long as both saw two guards.

### 4.4 Conflicting evidence and the chimera problem

The dangerous case is not noise; it is **stitching halves of two different codes**. If frames of code A show only the left half and frames of code B only the right, a naive accumulator assembles a 13-digit string that passes the checksum with probability 10 % (measured: 9.98 % of random 13-digit strings pass). The defence in the spike, and in the recommended design:

- **Consistency chain**: frames are nodes; an edge exists when they overlap on ≥ 1 slot and agree on ≥ 80 % of overlapping slot decisions; only the largest connected component votes. A-left + B-right have **no overlap** → two components → no acceptance, ever. Frames that overlap but disagree stay separate.
- **Coverage**: every slot needs evidence from ≥ 2 frames of the same component.
- **Best valid path with a margin**: the decoder runs a Viterbi over the 12 slots with the checksum residue as state, for each of the 10 parity patterns, and keeps the two best *checksum-valid* strings; the best is accepted only if it beats the second by ≥ 20:1 (log-margin ≥ 3) and the parity pattern (first digit) has the same margin over the next pattern.
- **Marginals**: every slot's posterior for the chosen class must be ≥ 0.5; digits are *displayed* only at ≥ 0.95 with ≥ 2 frames.
- **Tracker identity** gates everything above; a lost track resets the belief.

Result in the spike: 0 chimeras and 0 wrong acceptances in 80 A/B chimera trials, 30 alternating A/B trials (8 accepted, every one a real code), 40 no-barcode trials, 30 blur trials and 90 panning trials — 310 sequences in all (§6.4).

### 4.5 The role of OCR

The printed digits under the bars are a **cross-check channel, not a stitching source**. They are useful in two places: (1) downstream, once on the best crop, to corroborate a completed code (agreement raises confidence, disagreement flags a re-scan); (2) as the Scandit-style fallback when bars are destroyed but digits are legible — a triggered single-crop recognition, never a per-frame source. Fusing OCR characters into the bar-evidence belief would import a second, uncalibrated error model into a process whose whole safety rests on calibrated per-slot posteriors. On-device real-time OCR is not realistic anyway (§2.4).

### 4.6 Checksum: constraint and verifier, never a repair tool

The mod-10 check catches every single-digit error and every adjacent transposition except pairs differing by 5 [VERIFIED]. It is used twice: as a **hard constraint inside the path search** (only valid strings compete) and as a **final verifier**. It is never used to "fix" one uncertain digit — with one free digit the check *always* has a solution, which is exactly how a confidently wrong code is manufactured.

### 4.7 Preventing false reconstruction — the six rules

1. Index by module position; never concatenate strings.
2. Two guard anchors or no evidence.
3. Average inside a frame, multiply across frames.
4. Consistency chain: no overlap, no vote.
5. Accept only a checksum-valid best path with a 20:1 margin over the second-best valid path, full coverage from ≥ 2 frames, and per-slot marginals ≥ 0.5.
6. Display a digit only when its own slot marginal is ≥ 0.95 from ≥ 2 frames and it agrees with the current best path; otherwise show coverage, never a guess.

### 4.8 Progressive feedback that is technically honest

The user needs to see progress before the code is complete. Two representations are both honest under the rules above:

- **Coverage bar**: 12 slot cells (plus the parity cell) filling as slots gain ≥ 2-frame evidence, coloured by marginal; "45 % useful evidence" is simply resolved-slots / 13. This exists as soon as one two-anchor observation lands.
- **Digit reveal**: `8411•••••••••` → `84110927•••••` → `8411092731130 ✓`, populated only by slots meeting rule 6. In the spike, every digit ever displayed under these rules was correct (E0: 21/21; all E1–E5 sequences: no wrong displayed digit after the two-frame gate).

The fast lane makes most scans skip all of this: on a clean frame zxing decodes in one shot and the second agreeing frame confirms within ~70 ms; the coverage bar is what the user sees in the hard cases, replacing silence.

### 4.9 Prior art the design stands on

ZBar half-symbol integration and `ZBAR_CFG_UNCERTAINTY` (inter-frame consistency frames); zxing-cpp row voting (`lineCount`) and `returnErrors` geometry; Gallo–Manduchi deformable per-digit templates with dynamic programming; Tekin–Coughlan checksum-constrained Bayesian scanline decoding; ROVER align-then-vote; US 6,454,168 signal-aided, quality-mapped symbol voting across scanlines; BLaDE's two-channel guidance. None of them is a drop-in; each is a proven piece of the pattern.

### 4.10 Feasibility verdict

Feasible and safe as a **slow lane**, not as the primary completion path. The spike's precision is 100 % (0 wrong in 310 sequences) but its sensitivity is low with a deliberately crude correlation matcher (2/30 never-fully-visible sequences, 7/30 pan sequences, 0/30 at 1.2 px/module). Raising sensitivity is a bounded R&D task — a Gallo–Manduchi-style blur-parameterised template matcher on rectified scanlines, calibrated on real frames — and must be *measured* before it is trusted. The recommended product rule is therefore: the fast lane (two agreeing zxing decodes) completes; the slow lane may complete only under the six rules; everything else produces guidance.
---

## 5. CANDIDATE ARCHITECTURES

Four genuinely different shapes were evaluated. The brief's A/B/C were starting points, not the menu.

### 5.1 A — Monolithic engine (commercial SDK, or an in-house imitation of one)

One black box from camera to decoded value with UI callbacks (Scandit `BarcodeCapture`, Dynamsoft `CaptureVisionRouter`, STRICH). Fastest route to a barcode demo with vendor-grade aiming UI. But: the box hides exactly the intermediate signals this brief is about (localized-but-undecoded, per-row/per-slot evidence) — Dynamsoft even licenses them separately; object and label modes are outside its scope; on iOS it is WASM like ours; the cost is recurring and per-scan/device; and nothing in it becomes NextMe's asset. An in-house monolith inherits the opacity without the vendor's tuning. **Rejected as the architecture; retained as the benchmark.**

### 5.2 B — Parallel evidence lanes feeding one tracker/state machine

Barcode decoder, object detector and text detector all run on every frame; a fusion state machine arbitrates. Everything feels alive, but a phone cannot afford three lanes per frame (a nano detector is tens to hundreds of ms in WASM, unmeasured in any citation; full-frame zxing is 10–14 ms on desktop Safari and several times that on a phone); thermal collapse within a minute is the realistic outcome, the lanes duplicate localization work, and their guidance conflicts. **Rejected as a data flow; its tracker + state machine is kept.**

### 5.3 C — Fast local detector → specialized decoder → temporal fusion

Cheap localization first (bar-texture saliency, class-agnostic object localizer), the specialized decoder only on localized, rectified regions, then fusion over time. This is the pattern verified in every reference system (§2.1) and in the literature (§2.3), it makes compute proportional to what is in view, and partial evidence falls out naturally. On its own it is a pipeline without identity: without a tracker and a state machine it cannot keep a box glued to a moving code or say "hold". **Chosen, with B's tracker and state machine added.**

### 5.4 D — Native-first thin layer

`BarcodeDetector` where it exists, WASM fallback elsewhere, minimal UI. Least code on Android Chrome; nothing on iOS (absent/broken through the iOS 26 betas), a binary API with no confidence or partial result even where it works, two behaviours to support, no object mode, nothing reusable. **Rejected.**

### 5.5 The chosen design — "Tracked Evidence Pipeline"

```
main thread                         │ Worker (WASM SIMD; WebGPU optional later)
────────────────────────────────────┼──────────────────────────────────────────────────────────
Camera session ── rVFC ── frame ──▶ │ 1 LOCATE   bar saliency + quality (every frame, 320-px pyramid)
  constraints, lens, zoom, torch,   │            object localizer lane (2–5 fps, only when no bars)
  visibility, wake lock, permission │ 2 TRACK    IoU/Kalman identities; geometry predicted every frame
                                    │ 3 DECODE   zxing-wasm readBarcodes on the rectified crop
UI ◀── state + guidance + geometry ─┤            (fast options → tryHarder; returnErrors; lineCount)
UI ◀── ScanArtefact ────────────────┤ 4 ACCUMULATE per track: fast lane (2 agreeing decodes)
                                    │              slow lane (guard-anchored slots, §4) · best crops
                                    │ 5 GUIDE    state machine → copy key, colour, arrows, progress
```

**Stage responsibilities**

1. **Acquire** (main thread, thin): `getUserMedia` with explicit ideals (1920×1080 or 1280×720, 30 fps, back camera chosen by the label heuristic on Android), `applyConstraints({zoom})`/`{torch}` when capabilities allow, `requestVideoFrameCallback` pacing, `createImageBitmap`/`VideoFrame` transfer to the Worker, adaptive frame budget per lane (never one global busy flag), `visibilitychange` pause/resume, Wake Lock, standalone-iOS permission re-prompt UX, memory discipline (reuse buffers; < 60 MB).
2. **Locate** (Worker, every frame): structure-tensor bar saliency on a 320-px pyramid → oriented candidate regions (quad + orientation + module-width estimate from edge spacing); classical quality on each candidate (Laplacian/Tenengrad, clipped histogram, HSV glare clusters and whether they sit on the target, edge contact, quad-fit tilt); zxing `returnErrors` results also count as candidates. When no bar texture is present for ~300 ms, the object lane runs at 2–5 fps (MediaPipe EfficientDet-Lite0 for named produce/bottles; U2-Netp or centre-prior objectness for boxes/cartons/cans), and a text-likeness heuristic marks label regions.
3. **Track** (Worker): SORT-style association, persistent ids, Kalman prediction so the box moves every frame even when Locate is skipped, loss after 500 ms.
4. **Decode** (Worker): for each barcode track, crop + rectify from the quad at native resolution and call `readBarcodes` with cheap options first, `tryHarder` on failure, `returnErrors: true`; every Nth frame a full-frame pass catches what saliency missed. Results — value, `isValid`, `error`, `position`, `lineCount` — attach to the track.
5. **Accumulate** (Worker): fast lane — two checksum-valid decodes of the same value on the same track within 400 ms → COMPLETE (a single decode already carries the checksum; the second removes the 10 % aliasing tail and merged-code artefacts such as the wrong value zxing produced with two adjacent codes in Spike A); slow lane — the six rules of §4.7; object tracks — rolling best frame per view, view-sufficiency rule; label tracks — best crop.
6. **Guide** (Worker computes, main thread renders): one state machine per primary target plus a global one; 3-frame debounce and hysteresis; outputs a copy key, a colour, box geometry, arrows, a distance meter and a steadiness ring; escalations after timeouts (FOUND > 1.5 s → zoom step / "Przybliż"; low light → torch; persistent glare → "Zmniejsz odblask"; object without label seen → "Pokaż etykietę").
7. **Artefact**: the contract in §8; emitted on COMPLETE (barcode) or on view sufficiency (object/label). Downstream (Gellatti's `liveScanSession`, catalogue, Vision identification, NextMe) consumes it and never talks to the camera.

**State machine (per primary target)**

| state | meaning | user sees | exits |
|---|---|---|---|
| `SEARCHING` | no candidate | neutral reticle, "Skieruj kamerę na kod kreskowy lub produkt." | candidate ≥ 3 frames → `FOUND` |
| `FOUND` | localized, not readable yet | **amber** box tracking the target; arrows / "Przybliż" / "Oddal" / "Obróć lekko" | evidence arrives → `READING`; 1.5 s → escalate (zoom/torch); lost 500 ms → `LOST` |
| `READING` | evidence accumulating (error-results, lineCount, slots, quality frames) | amber→green progress on the box, coverage bar or digit reveal | framing good → `HOLD`; complete → `COMPLETE` |
| `HOLD` | framing is good; keep still 300–600 ms | steadiness ring, "Trzymaj nieruchomo" | motion → `READING`; complete → `COMPLETE` |
| `COMPLETE` | artefact emitted | **green** check on the target, tick sound + haptic (Android), then auto-advance | next target → `SEARCHING` |
| `LOST` | track lost | box fades, "Wróć do produktu" | candidate → `FOUND`; 2 s → `SEARCHING` |
| persistent block (`too dark`, `glare`, `blur` > 1 s) | cannot read as is | **red** hint with the one action that fixes it | condition clears |

The intermediate amber state is deliberate: it is the localized-but-undecoded state that ML Kit and Dynamsoft use to trigger auto-zoom, and it is what turns "is anything happening?" into "it sees it, get closer". Red is reserved for a persistent, actionable blocker — never for frame-to-frame flicker.

**Two lights, one truth.** The scanner's green means *the code is read* (or the object is well captured). The product's green — catalogue-confirmed — is a separate downstream state with its own copy ("Odczytano kod → Szukam produktu… → Dodano" or "Nowy produkt — dokończysz później"). The current single-light design is the reason a working decode looks like failure.

---

## 6. BENCHMARK / SPIKE RESULTS

All spikes are throwaway and live in `~/Developer/scan-core-spikes/` (Node harness) — archived outputs in `reports/scan-core-decision-2026-09-03/spikes/`. **No phone was available in this session; every number below is synthetic-frame or desktop-browser evidence and is labelled as such.** The real-device benchmark is defined in §10 and is the first deliverable of Phase 0.

### 6.1 Browser capability probe [VERIFIED, first-hand]

Reproduced in §2.5. Decisive: Safari 26.5 has **no `BarcodeDetector`** and **no `MediaStreamTrackProcessor`**, but has `VideoFrame`, `OffscreenCanvas` (2D + WebGL2 in Workers), `requestVideoFrameCallback`, WebGPU, WASM SIMD, and `zoom`/`torch` constraints; `focusMode`/`focusDistance` are absent.

### 6.2 WASM decoder cost in real browser engines [SPIKE]

Same seven 1280×720 synthetic frames, `zxing-wasm` 3.1.3 reader and `@undecaf/zbar-wasm` 0.11 loaded as ES modules, median of 6 runs per frame:

| engine | warm-up (zxing / zbar) | `getImageData` 720p | zxing `tryHarder` | zxing fast | zbar |
|---|---|---|---|---|---|
| Safari 26.5, M-series (JavaScriptCore) | 86 ms / 16 ms | 1–2 ms | **10–14 ms** | 1–3 ms | 13–27 ms |
| Chromium 148 in the desktop app's hidden Browser pane (V8, background surface — **not representative**) | 194 ms / 22 ms | 4–10 ms | 36–78 ms | 17–31 ms | 60–94 ms |

Node (V8, foreground) on the same machine — Spike C, median of 8:

| frame | zxing `tryHarder` | zxing fast | zbar | repo scanline | Laplacian (4× subsampled) |
|---|---|---|---|---|---|
| 1920×1080 | 30.1 ms | 8.7 ms | 51.5 ms | 1.1 ms | 5.0 ms |
| 1280×720 | 19.3 ms | 3.3 ms | 20.2 ms | 2.9 ms | 0.6 ms |
| 960×540 | 13.6 ms | 2.2 ms | 15.1 ms | 1.1 ms | 3.7 ms |
| 640×360 | 5.9 ms | 0.8 ms | 4.8 ms | 0.7 ms | 0.8 ms |
| ROI 640×288 crop of 720p | 6.3 ms | – | 4.5 ms | – | – |

Reading: a phone core is roughly 2–4× slower than an M-series core in WASM; a 720p `tryHarder` pass lands around 30–50 ms, a fast pass around 5–10 ms, and an ROI decode well under 20 ms — a 15–30 fps Worker loop with locate + track + ROI decode is within budget, a full-frame `tryHarder` on every frame is not. The zxing-cpp project's own history shows the same binary at 8 ms or 320 ms depending on build flags [VERIFIED]; the shipped npm build is the fast one.

### 6.3 Spike A — what single-frame decoders can and cannot read [SPIKE, synthetic]

1280×720 frames, 60° HFOV, nominal 0.33 mm EAN-13 with human-readable digits, baseline lens blur σ 0.5 px on every frame, 3× supersampling, N = 12 random EANs per condition, Node on Apple Silicon. Percent = frames decoded to the correct value; ✗n = frames with a **wrong** 13-digit value; last column = frames where zxing returned an error-result with geometry (detect-without-decode).

| condition | zxing `tryHarder` | zxing fast | zbar | repo scanline | zxing error-results |
|---|---|---|---|---|---|
| 12 cm ≈ 3.0 px/module | 100 % | 100 % | 100 % | 100 % | 0/12 |
| 18 cm ≈ 2.0 px/module | 100 % | 100 % | 100 % | 100 % | 0/12 |
| 24 cm ≈ 1.5 px/module | 92 % | 92 % | 75 % | 92 % | 0/12 |
| 30 cm ≈ 1.2 px/module | 0 % | 0 % | 0 % | 0 % | 0/12 |
| 36 cm ≈ 1.0 px/module | 0 % | 0 % | 0 % | 100 %* | 0/12 |
| 42 cm ≈ 0.86 px/module | 0 % | 0 % | 0 % | 0 % | 0/12 |
| small code 80 % @ 24 cm ≈ 1.2 px | 0 % | 0 % | 0 % | 0 % | 0/12 |
| blur +σ0.7 @ 18 cm (σ 1.2 total) | 0 % | 0 % | 0 % (✗1) | 75 % | 2/12 |
| blur +σ1.2 @ 18 cm | 0 % | 0 % | 0 % | 0 % | 0/12 |
| blur +σ1.8 @ 18 cm | 0 % | 0 % | 0 % | 0 % | 0/12 |
| motion 4 / 7 / 11 px @ 18 cm | 0 % | 0 % | 0 % | 0 % | 0/12 |
| roll 20° / 45° / 80° | 100 / 0 / 100 % | 100 / 0 / 100 % | 100 / 100 / 100 % | 100 / 0 / 0 % | 0/12 |
| yaw 30° / 45° / 60° | 100 / 17 / 0 % | 100 / 17 / 0 % | 100 / 25 / 0 % | 100 / 17 / 0 % | 0 / **5** / 0 of 12 |
| pitch 45° | 100 % | 100 % | 100 % | 100 % | 0/12 |
| can r = 33 mm, yaw 20° | 100 % | 100 % | 100 % | 100 % | 0/12 |
| bottle r = 20 mm, yaw 25° | 75 % | 75 % | 42 % | 75 % | 0/12 |
| glare blob on code | 100 % | 100 % | 100 % | 100 % | 0/12 |
| low contrast 0.35 + noise 6 | 100 % | 42 % | 100 % (121 ms) | 100 % | 0/12 |
| noise σ15 / σ25 | 100 / 50 % | 58 / 0 % | 100 / 83 % (140 ms) | 100 / 92 % | 0/12 |
| blur σ1.0 + noise 8 + yaw 25° @ 20 cm | 0 % | 0 % | 0 % | 0 % | 0/12 |
| cut: left 55 % / left 80 % / right 55 % visible | 0 % | 0 % | 0 % | 0 % | 0/12 |
| right quiet zone missing (bars 100 % visible) | 100 % | 100 % | 100 % | 100 % | 0/12 |
| 5 px light scratch across the code | 0 % | 0 % | 0 % | 0 % | 0/12 |
| 14 px dark blot on the code | 100 % | 100 % | 100 % | 100 % | 0/12 |
| two codes side by side | 100 % (✗1) | 100 % | 100 % | 100 % | 0/12 |

\* the repo scanline reader's 100 % at exactly 1.0 px/module is a synthetic artefact (integer module width, no sub-pixel phase) and vanishes at 0.86 px and at 1.2 px; it is not a real capability.

What the table says:

- **The decodable window is narrow**: ≥ 1.5 px/module *and* total blur ≤ ≈ 1 px *and* motion blur < 1 module. A phone hunting for focus at 20 cm routinely violates the blur condition. This is why per-frame decode "sometimes works" and why zoom (raising px/module) and temporal evidence are the two levers that matter.
- **Cut codes are 0 % for every decoder** — no per-frame decoder yields partial evidence; only the evidence layer can (§4).
- **Decoders do emit wrong values**: zbar under blur (1/12), zxing with two adjacent codes (1/12 — a merged read). Two-frame agreement is not paranoia.
- **`returnErrors` produced geometry-only results in the yaw-45° case (5/12)** — the detect-without-decode primitive exists in zxing-wasm and is usable as a FOUND signal, but it is not a reliable localizer on its own (0/12 on cut or blurred frames); a dedicated saliency locator is required.
- Rotation, pitch, cylindrical cans and moderate yaw are fine at 2 px/module; zxing's `tryRotate` covers 90° steps, hence 0 % at 45° roll where zbar's omnidirectional scan still reads — rectification from the tracked quad removes the difference.
- zbar is 5–10× slower on noisy frames (121–143 ms) — a cost cliff a Worker loop cannot absorb.

### 6.4 Spike B — temporal, guard-anchored evidence accumulation [SPIKE, synthetic, oracle localization]

A prototype of §4 in ≈ 400 lines: matched-filter guard anchoring with sub-pixel refinement, two-anchor module frames, blur-matched per-slot correlation posteriors (20 classes left / 10 right), within-frame averaging, across-frame products, consistency components, checksum-constrained top-2 Viterbi over parity patterns, margin ≥ 3.0 (20:1), ≥ 2 frames per slot, per-slot marginals ≥ 0.5, digits displayed only at ≥ 0.95. Scanlines are sampled along the barcode axis from the known quad (oracle localization — a real system gets the quad from the tracker). 7 scanlines per frame; ≈ 50–200 ms per frame in Node.

| experiment (10 frames per sequence unless stated) | accumulator accepted (correct / WRONG) | any single frame fully decoded by zxing / zbar / repo | wrong values from per-frame decoders |
|---|---|---|---|
| E0 single frame, m ≈ 1.8 px, blur 0.8, noise 5, roll ±10°, N = 40 | 0 / 0 (two-frame gate by design); **21 digits displayed, 21 correct** | – | – |
| E1 pan through full view, m ≈ 1.61, blur 0.9, noise 6, N = 30 | **7 / 0**, median at frame 5 | 11 / 0 / 12 of 30 | 0 |
| E1 pan, never more than 85 % visible, N = 30 | **2 / 0**, median at frame 6 | **0 / 0 / 0** of 30 | 0 |
| E1 pan far, m ≈ 1.21, N = 30 | 0 / 0 | 0 / 0 / 0 | 0 |
| E2 blur σ1.3 at m ≈ 1.5 with hand jitter, N = 30 | 0 / 0 | 0 / 0 / 0 | 0 |
| E3 chimera: code A left 62 % ×4 + code B right 62 % ×4, N = 40, consistency chain ON | 0 / 0 — **0 chimeras** | – | – |
| E3 same, consistency chain OFF | 0 / 0 — **0 chimeras** | – | – |
| E4 no barcode (blank + noise σ25), 6 frames, N = 40 | 0 / 0 | – | – |
| E5 two full codes alternating A/B/A/B, 8 frames, N = 30 | **8 / 0** — all 8 were A or B (real codes), **0 chimeras**; the consistency chain split A and B into separate groups in 30/30 | – | – |

Findings:

1. **Precision held at 100 %**: 310 sequences, 0 wrong acceptances, 0 chimeras, 0 wrong displayed digits after the two-frame gate. The rules of §4.7 are sufficient in every attack the spike tried; the consistency chain was not even needed in E3 because coverage/margin gates already refused half-only evidence — it stays as defence in depth.
2. **Real gain exists where per-frame decoding is impossible**: 2/30 sequences completed when the code was never more than 85 % in frame — no single frame could be decoded by any decoder. Modest, but it is the proof that guard-anchored accumulation is sound.
3. **Sensitivity is the R&D item, not safety**: the crude correlation matcher loses to zxing on frames zxing *can* read (7 vs 11 of 30 in the full pan) and cannot beat σ1.3 blur at 1.5 px/module. Every earlier iteration that tried to be more sensitive (single-anchor evidence, period estimation, greedy chaining, multiplicative within-frame combination) produced *confidently wrong digits* before the gates caught them — those failure mechanisms are now documented in §4 as rules, which is the most valuable output of the spike.
4. **Rectification matters**: image-space scanlines at 35° yaw locked onto a wrong module frame; rectified sampling through the quad locked correctly on every scanline.

### 6.5 What was not measured

No real phone (none available to this session), so no camera defaults, autofocus behaviour, real blur statistics, thermal curves, or Worker frame-transfer cost on iOS/Android. No commercial SDK trial was run (no accounts created; benchmarks stay as vendor claims). No on-device ML detector latency (no trustworthy citation exists either — Phase 0 must measure it).
---

## 7. RECOMMENDATION

**Build the Tracked Evidence Pipeline (§5.5) as an owned, reusable Scan Core, borrowing zxing-wasm as the decoder primitive and MediaPipe/U2-Netp-class open models for the object lane. Do not buy a scanning SDK. Keep one commercial demo page as a benchmark reference only.**

### 7.1 Why this architecture

- It is the pattern every reference system converged on independently (§2.1) and the only one that yields the *intermediate* signals the UX needs: localized-but-undecoded (amber), tracked geometry every frame (the box), evidence progress (coverage), and confirmation (green) — all from local computation, so feedback latency is bounded by our own frame loop, not by a network.
- Compute is proportional: saliency on a 320-px pyramid costs ~1–3 ms, ROI decodes cost < 20 ms on a phone, full-frame `tryHarder` runs only as a periodic fallback. A 15–30 fps Worker loop fits the budget measured in §6.2.
- Partial evidence is structural, not bolted on: the tracker gives identity, the quad gives rectification, the decoder gives `position`/`lineCount`/error-results, and the accumulator gives coverage and margins.
- It reuses what is proven here: zxing-wasm (already shipped), `liveFrameSource`, `frameQuality` (split), `barcode.ts`, `liveScanSession` downstream, and the orphaned guidance vocabulary — and it deletes the two structural mistakes (busy gate, geometry-less decoder contract) rather than patching around them.
- The same core serves Gellatti today and NextMe later, because the output is a `ScanArtefact` with no product identity in it.

### 7.2 Why not the alternatives

| option | performance | browser coverage | complexity | maintainability | licensing | lock-in | bundle | CPU / battery | privacy / offline | NextMe reuse | ownership |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **BUILD (recommended)** | bounded by our loop; measured decode cost fits | Safari 15.4+/Chrome 83+ via rVFC + Worker + WASM SIMD | highest up-front (est. 6–9 engineering weeks to Phase 2) | ours; small surface once the contract is fixed | Apache-2.0 / MIT only (zxing-wasm, MediaPipe, U2-Net) | none | +1.04 MB zxing reader (already shipped) + optional 4–5 MB object model, lazy | proportional; adaptive | 100 % on-device, offline-capable | full | full |
| BORROW only (zbar-wasm cache/quality, quagga2, OpenCV.js) | zbar has a native multi-frame cache but is 5–10× slower on noisy frames | same | medium | stale upstream (ZBar 2024-01) | **LGPL-2.1** needs legal sign-off for a WASM bundle | low | +330 KB | worse | same | partial | shared |
| COMMERCIAL SDK (Scandit / Dynamsoft / STRICH) | vendor-grade decode; UX polished | all modern browsers (WASM) | lowest for barcodes | vendor's | subscription: STRICH €99–249/month tiers, others quote-based per device/scan | high | 2–6 MB vendor bundles | vendor-tuned | on-device decode; licence checks online (offline tiers cost more) | none (per-product licence) | none |
| HYBRID (own core + vendor decoder inside) | vendor decode where it wins | same | medium | two contracts to maintain | subscription persists | medium | largest | — | — | core reusable, decoder not | partial |

Commercial SDKs solve the *decode* problem excellently and the *identity* problem not at all; they do not expose partial evidence beyond what zxing-cpp already gives us, and their price buys us nothing on the object/label side or for NextMe. If, after Phase 1, our fast-lane completion is materially behind a vendor demo on the same devices, HYBRID is the fallback — the contract in §8 makes the decoder swappable on purpose.

### 7.3 Risks that remain

1. **No phone numbers yet.** Every latency in this package is desktop or synthetic. Phase 0 exists to retire this risk before any production code; the go/no-go criterion is explicit (§9).
2. **Object-lane latency in the browser is uncited anywhere.** EfficientDet-Lite0 in WASM/WebGL on a mid-range Android may be 100–300 ms; the design tolerates that (2–5 fps lane, tracker in between) but the user experience for objects will be slower than for barcodes. Measure in Phase 0; fall back to the heuristic localizer if needed.
3. **Slow-lane sensitivity.** The temporal EAN lane is proven safe and only modestly sensitive; it ships only if real-frame calibration keeps precision at zero wrong. The product does not depend on it — the fast lane and zoom guidance carry the mainstream case.
4. **iOS platform traps** that are structural, not bugs: standalone-PWA permission re-prompts, silent memory kills (~100 MB on small devices), `focusMode` absent, no vibration. Mitigations are UX and discipline, not code cleverness.
5. **Cross-origin isolation** for WASM threads would break third-party scripts on the Vercel host; the design assumes single-threaded WASM with SIMD and does not need threads.
6. **The busy-gate mindset in the existing tests.** 338 tests pass against mocks that never see a frame; they will not catch pipeline regressions. The acceptance contract (§10) is device-first by design.

---

## 8. REUSABLE MODULE BOUNDARY AND OUTPUT CONTRACT

### 8.1 Where the Scan Core ends

```
┌──────────────────────────── SCAN CORE (reusable package) ────────────────────────────┐
│ camera session · frame transfer · locate · track · decode · accumulate · guide       │
│ in : a <video>/MediaStream + capability hints + policy (formats, modes, timeouts)    │
│ out: state + guidance + geometry (every frame) · ScanArtefact (on completion)        │
│ never: network, catalogue, product identity, nutrition, prices, recipes, accounts     │
└───────────────────────────────────────────────────────────────────────────────────────┘
                 │ ScanArtefact                                   │ ScanArtefact
    ┌────────────▼──────────────┐                    ┌────────────▼──────────────┐
    │ GELLATTI ADAPTER          │                    │ NEXTME ADAPTER (future)    │
    │ liveScanSession (basket)  │                    │ food/nutrition flows       │
    │ lookupExactBarcode        │                    │ its own identity authority │
    │ product-identify-live     │                    └────────────────────────────┘
    │ deep flow /products/scan  │
    └───────────────────────────┘
```

Semantic identity — "banana", brand, SKU — belongs downstream. The one semantic thing the core may optionally attach is a **coarse category** (produce / bottle / can / carton / box / label-present) from a small on-device classifier, off by default, because it costs nothing structurally and helps downstream choose a cheaper route; it is never a product identity.

### 8.2 The minimal contract

```ts
// scan-core/contract.ts — the only thing downstream is allowed to depend on
export type ScanTargetKind = 'barcode' | 'object' | 'label';
export type ScanState = 'SEARCHING' | 'FOUND' | 'READING' | 'HOLD' | 'COMPLETE' | 'LOST';
export type GuidanceCode =
  | 'aim' | 'move_left' | 'move_right' | 'move_up' | 'move_down'
  | 'move_closer' | 'move_farther' | 'hold_steady' | 'rotate_slightly'
  | 'show_more' | 'show_other_side' | 'reduce_glare' | 'more_light' | 'wait';

export interface Point { x: number; y: number }                    // normalised 0..1 in frame space
export interface ScanGeometry { quad: [Point, Point, Point, Point]; orientationDeg: number }
export interface ScanQuality {
  sharpness: number; exposure: number; glare: number; glareOnTarget: boolean;
  motionPx: number; fillRatio: number; cutEdges: Array<'top' | 'right' | 'bottom' | 'left'>;
  tiltDeg?: number; modulePx?: number;                              // barcode only
}
export interface Guidance { code: GuidanceCode; copyKey: string; severity: 'info' | 'warn' | 'block'; progress?: number }

export interface BarcodeEvidence {
  format: 'EAN-13' | 'EAN-8' | 'UPC-A' | 'UPC-E';
  value?: string;                 // present only when verified
  verified: boolean;              // checksum-valid AND ≥2 agreeing frames (fast lane) or §4.7 rules (slow lane)
  agreeingFrames: number;
  coverage: number;               // 0..1 share of digit slots with ≥2-frame evidence
  resolvedDigits?: string;        // e.g. '84110927•••••' — only digits that pass rule 6, never a guess
  margin?: number;                // log-odds over the second-best checksum-valid string
  lane: 'fast' | 'slow';
}

export interface ScanArtefact {
  id: string; trackId: string; kind: ScanTargetKind;
  geometry: ScanGeometry; quality: ScanQuality;
  barcode?: BarcodeEvidence;
  crops: { best: ImageBitmap; supporting: ImageBitmap[]; label?: ImageBitmap };
  coarseCategory?: { label: string; confidence: number };           // optional, off by default
  reasons: GuidanceCode[];                                          // why more evidence would help, if incomplete
  timing: { firstSeenAt: number; completedAt?: number; framesObserved: number };
}

export interface ScanCoreEvents {
  onFrameState(s: { state: ScanState; guidance: Guidance; targets: Array<{ trackId: string; kind: ScanTargetKind; geometry: ScanGeometry; progress: number }> }): void;
  onArtefact(a: ScanArtefact): void;
  onCapabilities(c: { zoom?: { min: number; max: number }; torch: boolean; resolution: { width: number; height: number }; fps: number; decoder: 'zxing-wasm'; worker: boolean }): void;
  onError(e: { code: 'no_camera' | 'permission_denied' | 'unsupported' | 'memory_pressure'; recoverable: boolean }): void;
}
export interface ScanCorePolicy { formats: BarcodeEvidence['format'][]; modes: ScanTargetKind[]; completeOn: 'first' | 'continuous'; slowLane: boolean; coarseCategory: boolean; timeouts: { found: number; hold: number; lost: number } }
export interface ScanCore { start(video: HTMLVideoElement, policy: ScanCorePolicy, events: ScanCoreEvents): Promise<void>; pause(): void; resume(): void; stop(): void; setZoom(z: number): Promise<void>; setTorch(on: boolean): Promise<void> }
```

Design notes: geometry is normalised so the UI can draw at any size; `value` is absent until verified so no consumer can accidentally use an unverified string; `resolvedDigits` is the only progressive representation and it is rule-bound; crops are `ImageBitmap`s so downstream can send them to Vision/OCR without the core knowing; the decoder name in capabilities is informational — the contract does not change if the decoder does.

### 8.3 Where Gellatti begins

`liveScanSession.observeFrame` becomes `observeArtefact`: a verified `barcode.value` is an identity candidate → `lookupExactBarcode` (network, outside the core) → `confirmed` or `needs_resolution`; an object artefact's `crops.best` goes to the existing `product-identify-live` rung; label crops go to the existing OCR session. The catalogue rule ("green belongs to the catalogue") stays exactly where it is — it just no longer suppresses the scanner's own feedback. `LiveProductScanner` (static deep flow) is untouched.

---

## 9. IMPLEMENTATION PLAN (phased, measurable)

Estimates assume one engineer full time plus the owner's real devices (iPhone with Safari 17.5+ ideally 18/26, one mid-range Android with Chrome). No production code before Phase 0's go/no-go.

| phase | scope | acceptance criteria (measured, not asserted) |
|---|---|---|
| **0 — Real-device baseline** (≈ 1 week) | A throwaway `/scan-lab/baseline` page deployed to a Vercel preview (HTTPS): enumerates cameras, tries constraint sets, reports delivered resolution/fps, zoom/torch capabilities, rVFC cadence, frame-transfer cost to a Worker, zxing 720p/1080p full-frame and ROI times, saliency time, and records the benchmark scenes (§10.1) as raw frame sequences (JPEG-90 or raw Y planes) into IndexedDB → downloadable corpus. | Table of numbers for iPhone Safari and Android Chrome; a corpus of ≥ 20 scenes × ≥ 3 s each per device; **go**: locate + ROI decode ≤ 40 ms p95 on both devices and a 15 fps loop at ≤ 60 % of one core; **no-go** → revisit resolution/ROI strategy before Phase 1. |
| **1 — Scan Core v0, barcode lane** (≈ 2 weeks) | Worker pipeline: acquire → saliency locate → SORT track → rectified ROI zxing decode (`returnErrors`, `lineCount`) → fast-lane confirmation → state machine + guidance + box overlay; dev route `/scan-lab` only. Corpus replay harness (offline, deterministic) for CI. | On the Phase 0 corpus: first visible reaction ≤ 100 ms after the code enters view; box within 2 frames of FOUND; EAN-13 completion p50 ≤ 0.7 s / p95 ≤ 2.0 s across the 12–30 cm scenes; **0 wrong codes** in 500 sequences; identical states on Safari and Chrome replays. Live: same on both phones, hand-held. |
| **2 — Camera control, guidance, Gellatti integration** (≈ 1–2 weeks) | Zoom/torch escalation, steadiness/direction/distance guidance, visibility + wake lock + permission UX, memory discipline; replace `LiveMultiScanner` internals with the core behind the existing `liveScanSession`; two-light UI; delete orphaned modules; keep `LiveProductScanner` untouched. | Real-device acceptance contract §10.2 items 1–9 pass on both phones; 60 s continuous session with no thermal collapse (fps ≥ 15 throughout); no regression in the 338 existing tests plus the corpus replay suite in CI. |
| **3 — Slow lane (temporal EAN) R&D** (≈ 2–3 weeks, parallel to 2) | Real-frame calibration of the guard-anchored accumulator (blur-parameterised templates on rectified scanlines), coverage bar UI, digit reveal under rule 6. | On the hard-case corpus (blur, cut, small): precision 100 % (0 wrong in ≥ 300 sequences), sensitivity reported honestly; ships only behind `policy.slowLane` if precision holds. |
| **4 — Object and label mode** (≈ 2–3 weeks) | Class-agnostic localizer benchmark (EfficientDet-Lite0 vs U2-Netp vs heuristic) on Phase 0 numbers; object tracks, framing guidance, best-frame retention, view-sufficiency, label text-likeness, artefact crops; optional coarse category; downstream identity unchanged (existing Vision rung consumes `crops.best`). | Banana / apple / Oreo / milk carton / can / bottle scenes: FOUND ≤ 300 ms, HOLD reached ≤ 2 s p95, artefact crop sharp (Laplacian above the corpus threshold) in ≥ 95 % of attempts; no camera-loop stall while Vision runs. |
| **5 — Extraction for NextMe** (≈ 1 week) | Package `scan-core` with the §8 contract, no Gellatti imports; Gellatti adapter; docs and a demo page. | Boundary test: the package builds and runs its replay suite with zero imports from `src/features`, `src/services`, Supabase or the catalogue. |

Total to a shipped barcode scanner that feels alive: Phases 0–2, ≈ 4–5 weeks; object mode adds 2–3; the temporal slow lane is a parallel research track that never blocks release.

---

## 10. REAL-DEVICE ACCEPTANCE CONTRACT

### 10.1 Benchmark scenes (recorded in Phase 0, replayed in CI, re-run live at each phase gate)

Barcodes (nominal EAN-13 unless stated): normal package at 12 / 18 / 25 / 30 cm; small 80 % code; code far (40 cm) then approaching; code entering from the frame edge; code at 30° and 60° yaw; curved can (r ≈ 33 mm) and small bottle (r ≈ 20 mm); glossy foil with glare; hand-held motion (deliberate pan at ~10 cm/s); low light (< 50 lux) with and without torch; scratched code; code with human-readable digits visible; two codes in the scene. Objects: banana, apple, Oreo package, milk carton, can, bottle — each hand-held, centred and off-centre, near and far, front and side. Each scene: both devices, ≥ 3 s, ≥ 5 repetitions.

Measured per scene (p50 / p95): camera ready; first target detection; first visible feedback; stable box (jitter < 2 % of frame width over 10 frames); first useful barcode evidence; complete barcode; usable artefact. Plus: wrong codes, false FOUND on empty scenes, frames per second over the session, CPU/thermal proxy (fps decay over 60 s).

### 10.2 READY means all of the following on a real iPhone (Safari) and a real Android (Chrome)

1. Camera view appears with the prompt "Skieruj kamerę na kod kreskowy lub produkt." within 1.0 s of tapping SKANUJ (warm) / 2.5 s (cold, WASM download excluded from the budget only on first-ever use).
2. When any barcode or product enters the view, the UI changes within 100 ms (amber box or hint) — never a static screen while a target is visible.
3. The box follows the target while the phone moves at hand speed, with no more than 2 frames of lag and no flicker (state changes debounced over 3 frames).
4. Direction/distance guidance is shown and is correct in ≥ 95 % of the 12–30 cm scenes; "move closer" triggers auto-zoom where zoom exists.
5. EAN-13 completion: p50 ≤ 0.7 s, p95 ≤ 2.0 s across the 12–30 cm scenes; ≤ 3.5 s p95 for the far-approaching and curved scenes.
6. Zero wrong codes in ≥ 500 scans across the scene list; zero FOUND states on ≥ 100 empty-scene seconds.
7. Every state is visibly distinct: SEARCHING / FOUND (amber) / READING (progress) / HOLD (ring) / COMPLETE (green + sound; haptic on Android) / persistent blocker (red with one action).
8. Continuous use for 60 s keeps ≥ 15 fps and the page alive (no iOS memory kill); backgrounding and returning resumes within 1 s; standalone iOS re-permission is handled with a one-tap explanation.
9. Object scenes reach HOLD within 2 s p95 with a sharp best crop and the correct "show the label" escalation when the label was never in view.
10. The Scan Core emits artefacts with no network access at all (verified by a network log during the run); Gellatti's own catalogue step happens visibly *after* the scanner's green.
11. Progressive barcode feedback never shows a digit that later changes.
12. The same corpus replayed in CI produces byte-identical state sequences on both engines' replays — determinism is part of READY.

---

## 11. Blockers, skips and open items

1. **No phone in this session** — the real-device benchmark is defined (§10) but not executed; all timings are desktop or synthetic. This is the single most important gap and is Phase 0.
2. **No iOS Simulator** installed on this Mac (`xcrun simctl` lists no devices); Safari 26.5 desktop was used as the WebKit proxy for API presence, not for performance.
3. **The desktop app's Browser pane is a hidden surface** — its Chromium timings (36–78 ms) are throttled and should not be quoted as Chrome performance.
4. **Subagent rate limit** — the six research agents were terminated once by a session limit and relaunched on a smaller model; all six completed on the second run with the same briefs.
5. **Not verifiable**: Dynamsoft `PartialBarcodeText`/`IsPartialResult` names (not found in current docs); Gallo–Manduchi and BarBeR numeric result tables (PDFs unreadable to the fetch tool); ZVZ dataset attribution.
6. **Spike limits**: oracle localization in Spike B (the quad came from the renderer); synthetic blur/noise models; N = 12–40 per condition; the consistency chain's necessity was not exercised because upstream gates already refused half-only evidence.
7. **Commercial trials not run** — no accounts were created; vendor numbers remain vendor claims.
8. **Codex branch naming**: the main checkout's `codex/live-product-scanner` branch is production-recovery work (49 files under production-workspace/engine), not scanner work — no in-flight collision, but the name misleads.
9. **Owner decisions needed before Phase 1**: (a) confirm the two-light UX (scanner green ≠ product green); (b) confirm object-mode coarse category stays off by default; (c) confirm the slow lane is research-gated (`policy.slowLane`) and not a release dependency; (d) approve the Phase 0 device set.

## 12. Evidence ledger

- Worktree: `~/Developer/pinguino-scan-core-decision` on branch `claude/scan-core-decision` from `origin/staging` @ `285f15ed`; **no source file modified**; only `reports/SCAN_CORE_DECISION_PACKAGE_2026-09-03.md` and `reports/scan-core-decision-2026-09-03/**` added.
- Read-only test runs in the worktree: `npx vitest run src/features/product-scanner --reporter=dot` → 37 files passed / 1 skipped, 338 tests passed / 1 skipped (6.66 s); `barcodeScanline.test.ts` + `barcodePerformance.test.ts` → 12 passed.
- Spikes (outside the repo): `~/Developer/scan-core-spikes/src/{ean13,evidence,decoders,lib_frames,run_a,run_b,run_c,smoke}.mjs`; dependencies `zxing-wasm@3.1.3`, `@undecaf/zbar-wasm@0.11.0`, `tsx`; outputs archived to `reports/scan-core-decision-2026-09-03/spikes/` (`spike_a_results.md`, `spike_b_results.md`, `spike_c_results.md`, `probe-results/*.json`, sample PNG frames). Re-run: `cd ~/Developer/scan-core-spikes && N=12 npx tsx src/run_a.mjs && npx tsx src/run_b.mjs && npx tsx src/run_c.mjs`.
- Browser probes: capability probe and WASM bench pages served from `127.0.0.1:48731`, opened in Safari 26.5 and in the in-app Chromium pane; results posted back as JSON (archived).
- Research: Appendices A–F (`reports/scan-core-decision-2026-09-03/research/R1…R5, F1`), each with per-bullet tags and a fetched-sources list.
- Deployments: none. Production `main`: untouched. Staging: untouched.
