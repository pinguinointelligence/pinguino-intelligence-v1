# R2 — Open-Source Barcode Decoders & Browser/ML Primitives for a Live Scan Core (2026)

Evidence file for a mobile-web PWA barcode/product SCAN CORE architecture decision (iPhone Safari + Android Chrome). Compiled 2026-09-03.

**Tagging discipline used throughout:**
- **[VERIFIED source]** — obtained by directly fetching a primary artifact this session (GitHub raw source file, official README, npm registry JSON, MDN, WebKit Bugzilla, a Chromium blink-dev thread, a GitHub issue's own labels). Where the fetch tool paraphrased rather than returned byte-for-byte text, that is noted.
- **[CLAIM]** — obtained via a web-search engine's synthesis of secondary sources (blog posts, aggregator sites like Snyk/Socket/libraries.io, or a search summary of a primary page that itself could not be directly fetched, e.g. because it 403'd). Treated as probably-true but not independently re-verified against primary text this session.
- **[INFERENCE]** — this report's own reasoning/extrapolation, not asserted verbatim by any source.

No URL, version number, or API name below was invented; every one was seen in a fetched page or a search result this session. Where a fact could not be pinned down, that gap is stated explicitly rather than filled in.

---

## 0. Executive summary (decision-relevant, read this first)

1. **Safari's native `BarcodeDetector` is not a viable baseline.** It has never shipped by default on any Safari. It exists only as a hidden, off-by-default "Shape Detection API" feature flag, and even when a user manually enables it, it **worked only through iOS/Safari 17.6** and has been **broken (non-functional) on iOS 18.0 through at least 18.5 and an iOS 26 beta** for close to two years, per a still-open, unresolved WebKit bug with no engineer response on record. WebKit's own standards-positions tracker is formally labeled **"position: support"** for the underlying spec — so WebKit doesn't oppose the API in principle — but that has not translated into a working shipped implementation. **[VERIFIED source]**, see §6.
2. Chrome's `BarcodeDetector` is real but **platform-dependent even on desktop**: Android/Android WebView ride Google Play Services ML Kit, macOS rides Apple's own Vision/Core Image frameworks (i.e., not a Google model), and **Windows/Linux have no backend at all** — the constructor exists but nothing decodes. This is exactly what caniuse's "partial support" flag on desktop Chrome/Edge means. **[VERIFIED source]**, see §6.
3. Consequently, for cross-platform parity — and especially for iPhone Safari, the platform named first in this brief — **a WASM-based open-source decoder is not a fallback, it is the only baseline that works everywhere.** Native `BarcodeDetector` can be used only as an opportunistic fast-path on Android.
4. Among the OSS decoders, **zxing-cpp / zxing-wasm gives by far the richest raw primitives for a custom temporal/evidence layer**: an always-present `Position` quadrilateral (4 corner points) and `lineCount()` (row-agreement count) on every returned `Barcode`, an explicit `returnErrors` option that surfaces checksum/format-failed-but-geometrically-located candidates, and documented, named `ReaderOptions` for trading speed vs. thoroughness (`tryHarder`, `tryRotate`, `tryInvert`, `tryDownscale`, `isPure`, `binarizer`, `minLineCount`, `maxNumberOfSymbols`). See §1.
5. **ZBar is the only decoder with a genuine, named, per-symbol *confidence* concept** (`zbar_symbol_get_quality()`, "an unscaled, relative quantity: larger is better") **and a built-in multi-frame temporal cache** (`zbar_image_scanner_enable_cache()`, "filters duplicate results from consecutive images... adds consistency checking and hysteresis") plus a configurable required-consistency-frame-count (`ZBAR_CFG_UNCERTAINTY`). It is LGPL-2.1, which is workable in a WASM build only if the `.wasm` binary is served/loaded as a separate, swappable runtime asset rather than inlined/statically bundled — this needs a real legal sign-off, not just an engineering choice. See §2.
6. **No on-device ML path (ONNX Runtime Web, TensorFlow.js, MediaPipe) has a trustworthy, citation-backed phone-browser latency number for a nano detector (YOLOv8n/YOLO11n/EfficientDet-Lite0) in this research pass.** Every number found was either a datacenter-GPU figure (irrelevant) or an unsourced marketing claim. Safari only gained WebGPU (needed for real-time ONNX Runtime Web inference) with **Safari 26 / iOS 26 in ~January 2026** — so a WebGPU ML path on iPhone is brand-new and unproven, not battle-tested. **Budget for first-party benchmarking before committing to any ML-detector-based architecture.** See §7.
7. **On-device real-time OCR of the human-readable EAN digits is not realistic as a per-frame primitive.** Tesseract.js reports 2–20+ seconds per 640×640 frame on a real phone in the project's own issue tracker; no browser ever shipped `TextDetector`; PaddleOCR web ports are new and unbenchmarked. OCR is usable only as an occasional single-frame fallback, not a continuous evidence source. See §9.
8. Ultralytics YOLOv8/YOLO11 are **AGPL-3.0** — using them in a proprietary PWA without an Ultralytics Enterprise license would create an obligation to open-source the connected scan-core code. See §7.

---

## 1. zxing-cpp / zxing-wasm / barcode-detector (Sec-ant)

### 1.1 zxing-cpp core (C++)

Repository: `github.com/zxing-cpp/zxing-cpp`. Description from the README: *"ZXing-C++ ('zebra crossing') is an open-source, multi-format linear/matrix barcode image processing library implemented in C++,"* ported from Java ZXing with claimed improvements "in terms of runtime and detection performance." **License: Apache-2.0**, confirmed in the repository. **[VERIFIED source: `README.md`]**

Supported formats span retail (EAN/UPC, DataBar), industrial (Code39/93/128, ITF, Telepen, Codabar, DXFilmEdge) and matrix (Aztec, DataMatrix, PDF417, QR/MicroQR/rMQR, MaxiCode). API is dual: a C++20 implementation behind a C++17-compatible public interface, plus a plain-C wrapper; no third-party dependencies for the core library itself. Bindings exist for ten platforms including WebAssembly, Android, iOS, Python, Rust, Qt, .NET, Go, Kotlin/Native, WinRT. **[VERIFIED source: `README.md`]**

**Latest release:** GitHub shows `v3.1.0` as the current tagged release (exact same-day timestamp only partially captured: "July 7"); the PyPI Python-wheel mirror shows a `3.1.1` build dated **2026-07-29**, and general repo activity as recent as **2026-07-31**. Changelog highlights for 3.1.x include added Telepen and MicroPDF417 decoder support and an improved Aztec detector for large/non-flat symbols. **[CLAIM — from search-engine synthesis of the GitHub Releases page and PyPI; the Releases page itself was not independently re-fetched to confirm the exact year on "July 7"]**

### 1.2 `ReaderOptions` — exact fields, source: `core/src/ReaderOptions.h`

Fetched directly from `raw.githubusercontent.com/zxing-cpp/zxing-cpp/master/core/src/ReaderOptions.h`. **[VERIFIED source]**

| Option | Type | Default | Doc comment (paraphrased from header) |
|---|---|---|---|
| `tryHarder` | bool | `true` | "Spend more time to try to find a barcode; optimize for accuracy instead of speed" |
| `tryRotate` | bool | `true` | "Try detecting codes in 90, 180 and 270 degree rotated images" |
| `tryInvert` | bool | `true` | "Try detecting inverted ('reversed reflectance') codes if the format allows" |
| `tryDownscale` | bool | `true` | "Try detecting code in downscaled images (depending on image size)" |
| `isPure` | bool | — | "Set to true if the input contains nothing but a single perfectly aligned barcode" |
| `returnErrors` | bool | `false` | "If true, return the barcodes with errors as well (e.g. checksum errors)" |
| `minLineCount` | uint8_t | `2` | "The number of scan lines in a linear barcode that have to be equal to accept result" |
| `maxNumberOfSymbols` | uint8_t | — | "The maximum number of symbols (barcodes) to detect / look for" |
| `binarizer` | enum `Binarizer` | — | see below |
| `textMode` | enum `TextMode` | `HRI` | see below |
| `eanAddOnSymbol` | enum `EanAddOnSymbol` | — | see below |

`Binarizer` enum: `LocalAverage` ("T = average of neighboring pixels"), `GlobalHistogram` ("T = valley between the 2 largest peaks in histogram"), `FixedThreshold` ("T = 127"), `BoolCast` ("T = 0, fastest possible"). `TextMode` enum: `Plain, ECI, HRI (default), Escaped, Hex, HexECI`. `EanAddOnSymbol` enum: `Ignore, Read, Require`. **[VERIFIED source: `ReaderOptions.h`]**

This is directly relevant to a detect-before-decode pipeline: `tryHarder=false` + `BoolCast`/`FixedThreshold` binarizer + `tryRotate=false` + `tryInvert=false` is the cheap-per-frame "is anything here" configuration; the full `tryHarder=true` sweep is the expensive "confirm and extract" configuration you'd only run on a frame the cheap pass flagged. **[INFERENCE]**

### 1.3 `returnErrors` — does it return errored-but-positioned results? Source: `core/src/Barcode.h`

Fetched directly. **[VERIFIED source]** The `Barcode` (formerly `Result`) class exposes, as independent `const` accessors — none of them gated behind `isValid()` —:

```cpp
bool isValid() const;
const Error& error() const;
BarcodeFormat format() const;
const std::vector<uint8_t>& bytes() const;
const Position& position() const;       // Position = QuadrilateralI
int orientation() const;
int lineCount() const;                  // linear-symbology row agreement count
std::string symbologyIdentifier() const; // the "]cm" AIM identifier
std::string extra(std::string_view key = "") const;
```

`Position` is a type alias for `QuadrilateralI` — an integer quadrilateral, i.e. **four corner points**, confirming zxing-cpp does expose quad geometry, not just a bounding box. **[VERIFIED source]**

Because `position()`, `format()`, and `lineCount()` are plain accessors on the same object as `error()`/`isValid()` (not conditionally populated), and because the library's own issue tracker discusses `returnErrors` explicitly for **"extracting partial data when checksum fails"** and "analyzing why detection is failing," the answer to the brief's question is: **yes — with `returnErrors=true`, a `Barcode` that failed a checksum or format check is still returned with its `Position`, `format()`, and `lineCount()` populated; only `isValid()`/`error()` mark it as failed.** This is exactly the "detected-but-not-confirmed" evidence primitive a temporal accumulator needs. **[VERIFIED source for the object model] + [CLAIM for the issue-tracker usage framing, not independently re-fetched] → [INFERENCE for the synthesis stated above]**

There is **no separate scalar confidence/probability field anywhere on `Barcode`.** The closest proxies are `lineCount()` (see §1.4) and the `Error` type itself (`ChecksumError` vs `FormatError` are distinguishable, per the DataMatrix-decoding issue thread). **[VERIFIED source + CLAIM]**

### 1.4 1D row-stepping and `minLineCount` voting — source: `core/src/oned/ODReader.cpp`

Fetched directly; the tool paraphrased rather than dumping verbatim, so treat the exact constants below as approximate pending a byte-for-byte re-check if implementing against them. **[VERIFIED source, paraphrased]**

- Rows are scanned from the **middle of the image outward**, alternating above/below, at a step: `rowStep ≈ max(1, height / (tryHarder ? 256–512 : 32))`. Without `tryHarder`, only roughly the ~15 rows nearest the vertical center are tried; with `tryHarder`, the scan step shrinks 4–8×, and the scan effectively covers the full image height.
- `minLineCount` is **forced to 1** when `isPure` is set (a single perfectly-aligned symbol needs no cross-row voting), and is otherwise capped at the image height.
- A result is only retained if the **number of rows that independently decoded the same symbol** (`lineCount`) is `>= minLineCount`. This is literal multi-scanline voting: once one row succeeds, **additional rows above/below the hit are explicitly queued for confirmation** when `minLineCount > 1`.
- Duplicate/overlapping detections across rows are merged by keeping the one with the higher `lineCount`, i.e. `lineCount` doubles as the tie-breaking confidence signal between competing candidates in the same frame.

This confirms the brief's premise directly: zxing-cpp's 1D reader already implements exactly the kind of "step rows, vote across rows, keep the best-supported candidate" logic that a custom multi-frame evidence layer would otherwise have to reinvent — except zxing-cpp does it **within a single frame**, across rows, not **across frames**, across time. A temporal evidence layer built on top of zxing-cpp would be applying the same `lineCount`-style voting idea one level up (across frames instead of across rows), reusing `Position` to know whether two frames' detections are "the same physical barcode" worth accumulating votes for. **[INFERENCE]**

### 1.5 zxing-wasm (Sec-ant) — the WASM build

`github.com/Sec-ant/zxing-wasm`, npm `zxing-wasm`. Description: *"ZXing-C++ WebAssembly as an ES/CJS module with types."* **License: MIT** for the wrapper code (Apache-2.0 for the embedded zxing-cpp/`ZXingWasm.cpp`, BSD-3-Clause for the embedded `zint` encoder library used for barcode *writing*). **Current version: 3.1.3.** Dependencies: `type-fest ^5.8.0`, `@types/emscripten ^1.41.5`. It is described as pinning zxing-cpp **as a submodule at a specific commit ID**, not tracking `master` live. **[VERIFIED source: `registry.npmjs.org/zxing-wasm/latest` JSON + `Sec-ant/zxing-wasm/README.md`]**

Three separately-exported `.wasm` bundles (not one monolith):

| Bundle | Import path | Reported size |
|---|---|---|
| Full (read + write) | `zxing-wasm` / `zxing-wasm/full` → `dist/full/zxing_full.wasm` | ~1.46 MiB |
| Reader-only | `zxing-wasm/reader` → `dist/reader/zxing_reader.wasm` | ~1.04 MiB |
| Writer-only | `zxing-wasm/writer` → `dist/writer/zxing_writer.wasm` | ~636 KiB |

**[VERIFIED source: `Sec-ant/zxing-wasm/README.md`, paraphrased sizes]** — a barcode-scanning PWA should import `zxing-wasm/reader` specifically, not the full bundle, to avoid shipping the encoder. Supports 50+ format names including meta-groups `All`, `AllReadable`, `AllLinear`. Core API is `readBarcodes(input, options) → Promise<ReadResult[]>` accepting `Blob | File | ArrayBuffer | Uint8Array | ImageData`. **[VERIFIED source]**

**No dedicated SIMD-vs-non-SIMD build variant was found** in the package's export map (only full/reader/writer) — whether SIMD instructions are compiled into the single reader binary unconditionally is **not confirmed** by anything fetched this session. **[gap — flagged, not invented]**

**Performance evidence, from the maintainers' own numbers (two independent sources):**

- **`wrappers/wasm/README.md`** benchmark (camera-reader demo, Chromium 109, Core i9-9980HK desktop CPU): `-Os` → 790 KB / **320 ms**; `-O3` → 940 KB / **8 ms**; `-O3 -flto` → 1000 KB / **8 ms**. The maintainer's own conclusion: *"saving 15% of download size for the price of a 2x–4x slowdown seems like a hard sale"* — i.e. they deliberately ship the larger, `-O3` binary because size-optimized WASM is dramatically slower here, not just a little slower. **[VERIFIED source]**
- **GitHub Discussion #511** ("[wasm] huge difference in performance"): a released `v2.0` binary was accidentally built as `MinSizeRel`, causing decode times of **1,295–2,073 ms** per frame vs **59–239 ms** for a correctly-built binary — roughly a **10× regression** traced to a single CMake default. After the fix, corrected binaries measured **~24 ms** average (vs. a user's own `-Os` build at ~26 ms and `-O3` at ~28 ms), rising to **~56 ms** at 1600×800 resolution. **[VERIFIED source]**

**Takeaway: build-flag choice is not a micro-optimization for this codebase — it is the difference between "real-time" and "unusable," and the project's own history shows this exact mistake has shipped in an official release before.** **[INFERENCE from the two verified data points above]** All figures above are **desktop CPU**, not mobile Safari/Android — expect further slowdown on phone silicon, but an 8 ms desktop figure has enough headroom that a several-times slowdown should still clear a 30 fps (33 ms) budget. **[INFERENCE]**

### 1.6 `barcode-detector` polyfill (Sec-ant)

`github.com/Sec-ant/barcode-detector`, npm `barcode-detector`. Description: *"A Barcode Detection API polyfill that uses ZXing webassembly under the hood."* **License: MIT.** **Current version: 3.2.2**, pinned to `zxing-wasm@3.1.3`. Unpacked size **260,906 bytes** (this is the JS wrapper only; it depends on `zxing-wasm` for the actual `.wasm`). **[VERIFIED source: `registry.npmjs.org/barcode-detector/latest` JSON]**

Ships four import strategies via `exports` map: `.` (both polyfill+ponyfill), `./pure` and `./ponyfill` (explicit-import, no global mutation — a "ponyfill"), `./polyfill` and `./side-effects` (auto-registers `globalThis.BarcodeDetector ??= BarcodeDetector` only if absent — **note: it does not check whether an existing implementation is a real native one or another polyfill**, a real footgun if two barcode libraries are ever loaded in the same page). Exposes `prepareZXingModule` to customize where the `.wasm` file is fetched from (relevant for CSP/offline PWA constraints), plus `ZXING_WASM_VERSION`, `ZXING_WASM_SHA256`, `ZXING_CPP_COMMIT` constants for supply-chain pinning/verification. **[VERIFIED source: `Sec-ant/barcode-detector/README.md`]**

Because this polyfill exposes the same `detect()`/`DetectedBarcode` surface as the native API by default, **the richer zxing-wasm primitives (`Position` quad, `lineCount`, `returnErrors`, per-row `ReaderOptions`) are only available if you bypass the polyfill's native-API-shaped wrapper and call the underlying `zxing-wasm`'s `readBarcodes()` directly.** **[INFERENCE]** — an important architectural note: don't adopt this package for its polyfill convenience if the evidence-layer primitives are the point; use `zxing-wasm` directly.

### 1.7 Section 1 verdict

zxing-cpp/zxing-wasm is the strongest raw-primitive source found for a custom evidence layer: named, documented options for cost/accuracy tradeoffs; a quad `Position` on every result; a `lineCount` row-agreement signal; explicit `returnErrors` for surfacing near-misses; Apache-2.0/MIT licensing with no copyleft concerns; and a maintained, versioned WASM distribution. Its main weaknesses are the complete **absence of a first-class confidence score** (you must derive one from `lineCount`/`Error` yourself) and the **documented sensitivity to build flags**, which anyone vendoring a custom build must get right.

---

## 2. ZBar (`mchehab/zbar`) and `@undecaf/zbar-wasm`

### 2.1 Project status

Canonical current fork: `github.com/mchehab/zbar` — per the repo's own description, original ZBar development "stopped in 2012," and mchehab has maintained it since, mainly for V4L2 API updates. **Latest tagged release found: `0.23.93`, dated 2024-01-09** (commit `bb05ec5`) — i.e., **over 2.5 years stale** as of this report's date. **[CLAIM — from search-engine synthesis of the GitHub Releases page, not independently re-fetched]**

### 2.2 EAN decoder internals — source: `zbar/decoder/ean.c`

Fetched directly from `raw.githubusercontent.com/mchehab/zbar/master/zbar/decoder/ean.c`. **[VERIFIED source, paraphrased by the fetch tool rather than verbatim-quoted in full]**

- **Yes — left and right halves are decoded separately and independently**, tracked through **four parallel decode passes** (`dcode->ean.pass[0..3]`), each potentially at a different phase/alignment. `EAN_LEFT` (`0x0000`) and `EAN_RIGHT` (`0x1000`) are bit-flags OR'd onto a returned symbol-type value (by helper functions `ean_part_end4()` / `ean_part_end7()`) to say *which half* a given pass just finished decoding.
- **`integrate_partial()`** is the function that tries to merge a freshly-completed half into the scanner's holding buffer `ean->buf`, tracking `ean->left` and `ean->right` type state separately, and explicitly resetting one side if *"same partial is not consistent."*
- A **complete symbol** requires: both halves decoded, their symbol *types* matching/compatible, **width consistency** between the two halves (`check_width(ean->width, pass->width)`), and a passing **checksum** (`ean_verify_checksum()`).
- If the two halves don't successfully integrate into a complete, checksum-valid symbol, the decoder returns **`ZBAR_PARTIAL`** rather than nothing; a hard validation failure (e.g., bad checksum) resets the non-matching half and can return `ZBAR_NONE`.
- Character-level decoding (`decode4()`) validates edge-width measurements (`e1`, `e2`); on an inconsistent measurement it sets `pass->state = -1` to abandon that decode pass, and width mismatches log `[bad width]` in debug builds rather than contributing to any numeric score.

**This is a direct, source-level "yes" to the brief's question**: ZBar's EAN decoder is architecturally two independent half-decoders that must agree before being promoted to a full result, with an explicit, named intermediate state (`ZBAR_PARTIAL`) for "I decoded one half but not both" — precisely the kind of partial-evidence unit a per-frame accumulator wants to consume, rather than a black-box hit/miss. **[VERIFIED source]**

### 2.3 Symbol states, config knobs, quality, and the frame cache — source: `include/zbar.h`

Fetched directly. **[VERIFIED source, verbatim excerpts below]**

```c
typedef enum zbar_symbol_type_e
{
    ZBAR_NONE        = 0,   /**< no symbol decoded */
    ZBAR_PARTIAL     = 1,   /**< intermediate status */
    ...
} zbar_symbol_type_t;
```

```c
typedef enum zbar_config_e
{
    ...
    ZBAR_CFG_UNCERTAINTY = 0x40, /**< required video consistency frames */

    ZBAR_CFG_POSITION = 0x80,    /**< enable scanner to collect position data */
    ZBAR_CFG_TEST_INVERTED,      /**< if fails to decode, test inverted */

    ZBAR_CFG_X_DENSITY = 0x100,  /**< image scanner vertical scan density */
    ZBAR_CFG_Y_DENSITY,          /**< image scanner horizontal scan density */
} zbar_config_t;
```

```c
extern int zbar_symbol_get_quality(const zbar_symbol_t *symbol);
/** retrieve a symbol confidence metric.
 * @returns an unscaled, relative quantity: larger values are better
 * than smaller values, where "large" and "small" are application
 * dependent. */
```

```c
extern void zbar_image_scanner_enable_cache(zbar_image_scanner_t *scanner, int enable);
/** enable or disable the inter-image result cache (default disabled).
 * mostly useful for scanning video frames, the cache filters
 * duplicate results from consecutive images, while adding some
 * consistency checking and hysteresis to the results. */
```

Point-by-point:

- **`ZBAR_CFG_UNCERTAINTY`** ("required video consistency frames") is literally a **multi-frame accumulation knob built into the library** — configure how many consecutive/nearby frames must agree before a symbol is promoted to a reportable result.
- **`zbar_symbol_get_quality()`** is a genuine, named **per-symbol confidence metric** — "unscaled, relative" (not a probability), but explicitly a confidence signal, unlike anything zxing-cpp exposes directly. Community documentation (not independently re-verified this session) commonly describes it as derived from the number of consistent scanline hits that contributed to the decode. **[VERIFIED source for the doc comment] + [CLAIM for the "scanline count" elaboration]**
- **`zbar_image_scanner_enable_cache()`** is a **ready-made multi-frame temporal accumulator**: disabled by default, but when enabled it deduplicates repeated frame hits and adds "consistency checking and hysteresis" — exactly the mechanism the brief's "multi-frame accumulation" question is asking whether any library already provides. ZBar is the one library in this survey that already ships this, natively, in C, rather than requiring it to be built on top. **[VERIFIED source]**
- **`ZBAR_CFG_POSITION`**: position/geometry collection is **opt-in, not default** — a subtlety worth remembering when porting: forgetting to set this flag silently yields symbols with no usable geometry. **[VERIFIED source]**
- **`ZBAR_CFG_X_DENSITY` / `ZBAR_CFG_Y_DENSITY`**: scan-line stride controls (how many pixel columns/rows are skipped between scan passes) — a direct speed/thoroughness dial analogous to zxing-cpp's row-stepping behavior in §1.4, but explicitly exposed as a tunable rather than baked into `tryHarder`. **[VERIFIED source]**
- **`ZBAR_CFG_TEST_INVERTED`**: analogous to zxing-cpp's `tryInvert`. **[VERIFIED source]**

### 2.4 `@undecaf/zbar-wasm` and license implications

`github.com/undecaf/zbar-wasm`, npm `@undecaf/zbar-wasm` (also published as `zbar.wasm`) — an Emscripten build of ZBar's C sources. API surface: `scanImageData()` (primary scan entry point), `setModuleArgs()` (configure WASM location), and JS-facing classes `ZBarSymbol`, `ZBarScanner`, `ZBarImage`. **Deployment size ≈ 330 KB.** **License: LGPL-2.1 for the software, CC-BY-SA-4.0 for documentation** — a genuine dual-license split, not a simplification. **[VERIFIED source: `undecaf/zbar-wasm/README.md`, directly fetched]**

The README itself documents **both** a bundled/inlined WASM option **and** a separate-file/runtime-loaded option, letting the integrator choose delivery strategy. **[VERIFIED source]** Separately, a general search on `@undecaf/zbar-wasm` license characterized the *safe* LGPL posture more strongly: that the package **"must not be bundled but may only be loaded as a library at runtime"** to stay within LGPL's safe harbor, with the library fetchable by default from a CDN (`cdn.jsdelivr.net`). **[CLAIM — search-engine synthesis; this is a stricter reading than the README summary above suggests the package *technically allows*, so treat the CDN/runtime-load pattern as the conservative choice, not the only one the tooling permits]**

**LGPL-2.1 + WebAssembly, in general (not zbar-specific):** LGPL's classic "safe harbor" is dynamic linking — link a proprietary app against an unmodified LGPL shared library without inheriting copyleft, provided the *library* stays swappable by the end user. WebAssembly has **no standardized equivalent of an OS-level dynamic-linkable shared object**; whether serving a separately-fetched, unmodified `.wasm` file from your own origin (as opposed to compiling it directly into your bundled JS via base64-inlining) satisfies the same spirit is a **legal interpretation question that multiple commentators flag as unsettled**, not a solved engineering problem. The pragmatic, lower-risk pattern used by `zbar-wasm` itself — ship the `.wasm` as a separate, unmodified, replaceable file rather than inlining it into the app bundle — is the closest analog to "dynamic linking" available today, but **this is not legal advice and should get real counsel sign-off before shipping ZBar in a proprietary product**, exactly as the brief anticipated by asking the question. **[CLAIM, general LGPL doctrine] + [INFERENCE for the WASM-specific application] — explicitly not a legal conclusion.**

### 2.5 Section 2 verdict

ZBar is the **only** library in this survey with both a native confidence score (`zbar_symbol_get_quality()`) and a native multi-frame temporal cache (`zbar_image_scanner_enable_cache()`) — the two primitives the brief cares about most, already implemented in C and cheap in WASM. Its costs are: a stale upstream (last tagged release Jan 2024), an LGPL-2.1 license that needs a real legal review for a proprietary WASM bundle, and a decoder architecture (fixed scanline-based, left/right-half EAN logic) that is narrower and less actively improved than zxing-cpp's.

---

## 3. QuaggaJS / `@ericblade/quagga2`

`github.com/ericblade/quagga2`, npm `@ericblade/quagga2` — explicitly "a continuation from `github.com/serratus/quaggajs`" (the original QuaggaJS). **License: MIT.** **[VERIFIED source: README, directly fetched]**

**Localization (`locate`):** a **patch-grid search**, controlled by `config.locator`. `locator.patchSize` (`x-small` → `x-large`) sets the density of the search grid relative to expected barcode size; `locator.halfSample: true` runs the search on a half-resolution copy of the frame, which the README states both **speeds up processing and acts as implicit smoothing**, particularly for large/close barcodes. `locate` is a boolean gate — when `true`, the (comparatively expensive) patch-grid localization pass runs before decoding is attempted at all; the config note explicitly says `locator` settings only matter when `locate: true`. **[VERIFIED source]**

**Per-frame partial evidence:** the `result` object is unusually rich for this survey:

- `result.box` — bounding box of the primary detected barcode.
- `result.boxes` — an array of *all* candidate boxes when `decoder.multiple: true` is set (multi-barcode-in-frame support).
- `result.line` — start/end coordinates describing the barcode's scan line/orientation, plus a separate `result.angle` (rotation in radians).
- `result.codeResult.decodedCodes` — an array of **per-character decode entries, each carrying its own numeric `error` value.** This is a genuinely distinctive primitive among everything surveyed: not just "the barcode decoded or didn't," but a **per-digit error/confidence trail** that a temporal accumulator could use to weight *which digits* of a multi-frame EAN read to trust, rather than only which *whole frames* to trust. **[VERIFIED source]**

**Workers:** configurable via `numOfWorkers`; Node.js environments must set `numOfWorkers: 0` since Web Workers aren't natively available there (irrelevant in-browser, but confirms the worker pool is a real, documented option for offloading the locate+decode pipeline off the main/camera thread). **[VERIFIED source]**

**Maintenance status (2025–2026):** latest npm version **`1.12.1`**, reported as **"published 6 months ago"** relative to this search — so roughly early-to-mid 2026 — with 909+ GitHub stars and 1,625+ commits total. However, third-party health-scoring services (Snyk, Socket) independently classify its maintenance status as **"Inactive"** despite that recent version bump, and no recent PR/issue-triage activity was found in the last month. **[CLAIM — search-engine synthesis of npm/Snyk/Socket/libraries.io pages, not independently re-fetched]**

**Weaknesses:** the patch-grid `locate()` step is described across the ecosystem (general knowledge, not independently re-confirmed this session) as one of Quagga's slower stages relative to zxing-cpp's row-scan approach, and the project's real-world maintenance velocity looks low despite the still-current version number. Its 1D-only, scanline-heuristic decoder core is architecturally older than zxing-cpp's. **[INFERENCE + CLAIM]**

---

## 4. rxing / rxing-wasm, html5-qrcode, jsQR — brief relevance notes

**rxing** (`github.com/rxing-core/rxing`) is a hand-ported **Rust** re-implementation of Java ZXing's algorithms; **rxing-wasm** (`github.com/rxing-core/rxing-wasm`) provides WASM bindings. Its JS-facing API includes `decode_barcode()`, `decode_barcode_with_hints()`, `decode_multi()` (multiple barcodes per image), plus image-conversion helpers (`convert_js_image_to_luma()`, `convert_canvas_to_luma()`, `convert_imagedata_to_luma()`) and encode-side functions; result metadata is exposed via `get_result_metadata_name()`, returning a map with keys such as `Orientation` and `Error_Correction_Level`. As of `0.3.0`, results moved to native JS arrays; the hint-based encoder is explicitly documented as "alpha... unexpected and poorly documented... unstable interface." **[VERIFIED source: `rxing-wasm/README.md`, directly fetched]** License and exact bundle size were **not independently confirmed this session** — flagged as a gap rather than assumed. Relevance: essentially a second, Rust-toolchain implementation of the same ZXing algorithm family as zxing-cpp, worth a bake-off only if the team already has Rust/wasm-bindgen tooling; it does not appear to expose materially different partial-evidence primitives than zxing-cpp based on what's documented.

**html5-qrcode** (`github.com/mebjas/html5-qrcode`) is a camera-plumbing + UI wrapper (not its own decoder core) widely used for quick integration. Per its own README/discussion content, the project is explicitly **"in maintenance mode... shall not be able to make any bug fixes or improvements for the time being... Pull requests also won't be merged for the timebeing,"** with the author inviting community forks to take over. **[CLAIM — search-engine synthesis of the repository's own README/discussion, not independently re-fetched verbatim]** Not a good foundation for new evidence-layer work given this explicit end-of-active-maintenance statement.

**jsQR** (`github.com/cozmo/jsQR`) is a pure-JS, **QR-only** reader (no 1D formats at all). Its full return shape, confirmed directly:

```js
const code = jsQR(imageData, width, height, options?);
// options.inversionAttempts: "attemptBoth" (default) | "dontInvert" | "onlyInvert" | "invertFirst"
// on success:
{
  binaryData,           // Uint8ClampedArray, raw bytes
  data,                 // decoded string
  chunks,               // structural chunks
  version,              // QR version number
  location: {
    topLeftCorner, topRightCorner, bottomLeftCorner, bottomRightCorner,      // {x,y} each
    topLeftFinderPattern, topRightFinderPattern, bottomLeftFinderPattern,    // {x,y} each
    bottomRightAlignmentPattern                                             // {x,y}, when found
  }
}
```

**[VERIFIED source: `cozmo/jsQR/README.md`, directly fetched]** The `location` object is a genuinely useful localization primitive — not just four corners but the three QR **finder-pattern centers** individually, which is finer-grained geometric evidence than a plain quad. There is, however, **no confidence/quality field at all** — the function either returns this full object or `null`; there is no partial/near-miss state comparable to ZBar's `ZBAR_PARTIAL` or zxing-cpp's `returnErrors`. **[INFERENCE from the documented return shape]** No explicit license line was found in the fetched README; commonly assumed MIT given the badge conventions on the repo, but **not independently confirmed this session**. Repository shows ~4k stars / 615+ forks and at least one user-filed issue as recent as **2026-07-04**, though an open user issue is not itself evidence of active maintainer commits. **[CLAIM]**

---

## 5. OpenCV `cv::barcode::BarcodeDetector` and OpenCV.js

### 5.1 API — source: `modules/objdetect/include/opencv2/objdetect/barcode.hpp`

Fetched via a source mirror (codebrowser.dev) after `docs.opencv.org`'s rendered class-reference page 403'd on direct fetch. **[VERIFIED source: header mirror]**

```cpp
class CV_EXPORTS_W_SIMPLE BarcodeDetector : public cv::GraphicalCodeDetector
{
public:
    CV_WRAP BarcodeDetector();
    // Optional Super-Resolution DNN model:
    CV_WRAP BarcodeDetector(const std::string &prototxt_path, const std::string &model_path);
    ~BarcodeDetector();

    CV_WRAP bool decodeWithType(InputArray img, InputArray points,
                                 std::vector<std::string> &decoded_info,
                                 std::vector<std::string> &decoded_type) const;

    CV_WRAP bool detectAndDecodeWithType(InputArray img,
                                          std::vector<std::string> &decoded_info,
                                          std::vector<std::string> &decoded_type,
                                          OutputArray points = noArray()) const;

    CV_WRAP double getDownsamplingThreshold() const;
    CV_WRAP BarcodeDetector& setDownsamplingThreshold(double thresh);
    CV_WRAP void getDetectorScales(std::vector<float>& sizes) const;
    CV_WRAP BarcodeDetector& setDetectorScales(const std::vector<float>& sizes);
    CV_WRAP double getGradientThreshold() const;
    CV_WRAP BarcodeDetector& setGradientThreshold(double thresh);
};
```

The base class `GraphicalCodeDetector` (shared with `QRCodeDetector`) is where the plain `detect()`/`decode()`/`detectAndDecodeMulti()` methods live by OpenCV convention; this was **not independently re-fetched** this session, so treat that specific inheritance detail as **[INFERENCE from established OpenCV API convention]**, not directly sourced.

**Detection algorithm**, per search synthesis of the (403-blocked-for-direct-fetch) official tutorial: **gradient/directional-coherence based** — compute average squared gradients per pixel, partition the image into square patches, compute gradient-orientation coherence per patch, connect high-coherence neighboring patches into candidate regions, and apply multiscale non-maximum suppression to de-duplicate proposals across patch sizes (handling barcodes of different physical sizes in the same frame). **[CLAIM]** `getDetectorScales`/`setDetectorScales` and `getGradientThreshold`/`setGradientThreshold` in the header directly correspond to this description (the multiscale patches and the gradient-coherence cutoff). **[VERIFIED source for the tunables existing, CLAIM for the algorithmic description they implement]**

**Super-resolution model:** optional, **not bundled** — the constructor takes external `prototxt_path`/`model_path` arguments, and both files (`sr.prototxt`, `sr.caffemodel`) must be separately downloaded from `github.com/WeChatCV/opencv_3rdparty` (the `wechat_qrcode` branch, reused here). Its purpose is upscaling small/low-resolution barcode crops before decode. If omitted, the detector simply runs without super-resolution assistance. **[CLAIM — search synthesis of the constructor's own doc comment content, though the constructor signature itself confirming "optional" is VERIFIED via the header]**

### 5.2 OpenCV.js packaging — does the default build include this, and at what size?

- The barcode detector's functions (`detect`, `decode`, `detectAndDecode`, etc.) **appear in the standard `opencv_js.config.py` whitelist** that determines what's exposed to JS bindings, alongside a default module set of `[core, imgproc, objdetect, video, dnn, features2d, photo, aruco, calib3d]` — i.e., barcode detection is reachable from a standard opencv.js build, not something requiring a custom compile. **[CLAIM — search synthesis of the actual config file content]**
- **Size is the real problem.** Multiple independent sources converge on: default `opencv_js.wasm` around **6–8 MB**, with one blog citing a concrete split of **8.1 MB (plain Wasm) vs 9.0 MB (Threads+SIMD)** for a full build. By default OpenCV.js base64-inlines the wasm into one JS file; `--disable_single_file` splits out a dedicated `.wasm` to at least allow separate caching/compression. Trimming the `white_list` in `opencv_js.config.py` to only the needed modules is the documented way to shrink this, but that requires a custom build pipeline, not just `npm install`. **[CLAIM]**
- A **Threads+SIMD** build variant exists but requires cross-origin isolation (COOP/COEP response headers) to use `SharedArrayBuffer` — a real deployment constraint for a PWA (CDN/hosting config must cooperate), not just a build flag. **[INFERENCE — standard WASM-threads requirement, not OpenCV-specific, not independently re-confirmed for this exact build this session]**

### 5.3 Section 5 verdict

OpenCV's barcode detector is architecturally interesting — it is the one option here whose **localization** step is a genuinely different algorithm family (gradient-orientation-coherence patches) from every scanline/patch-grid decoder above, and its optional super-resolution path is the only "rescue small/blurry barcodes" primitive found in this whole survey. But at **6–9 MB** for a general-purpose opencv.js build vs. **~1 MB** for a reader-only zxing-wasm build, it is a poor fit as the *primary* decode path for a mobile PWA unless the team is already paying that size cost for other CV features (e.g. the tracking/optical-flow primitives in §8) — in which case reusing the same runtime for detection becomes more attractive. **[INFERENCE]**

---

## 6. Browser `BarcodeDetector` (Shape Detection API) — support matrix, 2026-09

### 6.1 Spec status

The barcode+face detection surface lives in the WICG **"Accelerated Shape Detection in Images"** spec; text detection (`TextDetector`) was **split out into a separate, deliberately informative (non-normative) spec**, "Accelerated Text Detection in Images," specifically because — per the spec framing found — OCR was judged **not stable enough across computing platforms and character sets to standardize** at this time. **[CLAIM — search synthesis of the WICG spec pages]**

WebKit's own standards-positions tracker, **Issue #174**, opened 2023-04-20 by a Google engineer (Reilly Eon) explicitly asking Apple for a formal position on graduating the spec out of WICG incubation, carries these labels as fetched directly from the issue: **`concerns: duplication`, `concerns: use cases`, `from: Google`, `position: support`, `topic: artificial intelligence (AI)`, `topic: graphics`, `venue: WICG`**, with backlog-project status **"Done."** **[VERIFIED source — labels enumerated directly from the issue]** No WebKit-team-authored comment with rationale was visible in the fetched content — only the original Google submission. **So WebKit's *formal, labeled* position on the spec is supportive**, even though (see §6.3) the *shipped implementation* is currently broken. These are not the same thing, and conflating them would be a mistake. **[INFERENCE — the distinction itself]**

### 6.2 Chrome / Edge / Opera — shipped, but platform-dependent even where "supported"

Barcode detection shipped **by default starting Chrome 83** (Edge 83, Opera 72 same underlying engine version). Per Chromium's own **"Intent to Ship: Barcode Detection API"** blink-dev thread, fetched directly: the feature is implemented per-platform as a **thin wrapper over the OS's own barcode reader**, not a bundled cross-platform model:

- **Android / Android WebView**: backed by the **Google Play services library's `BarcodeDetector`** (i.e., ML Kit under the hood).
- **macOS**: backed by **Apple's own Core Image and Vision frameworks** — meaning on macOS, Chrome's `BarcodeDetector` is literally calling Apple's native decoder, not a Google-shipped model.
- **Windows and Linux have no platform backend at all.** A named reviewer (Daniel Bratell) raised exactly this gap, noting Microsoft does provide its own barcode-scanning API; the response from the API owner (Reilly Grant) confirmed the implementation is contingent on **"the platform providing built-in support for detecting barcodes in images"** and that a `getSupportedFormats()` method exists precisely so callers can detect an empty/absent backend at runtime. The design's own stated expectation is that **callers are expected to ship a polyfill for platforms without native support** — native detection was explicitly designed as an optional fast-path from day one, not a guaranteed capability. **[VERIFIED source — directly fetched Chromium mailing-list thread]**

This exactly explains why caniuse marks desktop **Chrome 83–155 and Edge 83–151 as "Partial support"** rather than full support, and why a GitHub issue against `mdn/browser-compat-data` is literally titled **"Chrome support is platform-dependent."** **[VERIFIED source: directly-fetched caniuse page + corroborating issue title from search]** — i.e., even where `"BarcodeDetector" in globalThis` is `true` on desktop Chrome, that alone does not guarantee `detect()` will find anything on Windows or Linux.

Mobile support (where it matters most for this PWA) is strong: caniuse lists **Chrome for Android, Android Browser, Opera Mobile, Samsung Internet, UC Browser for Android, QQ Browser, KaiOS Browser** all as full support at current versions (Chrome for Android 152+ etc. — plausible given Chrome's ~4-week release cadence since 2023, consistent with the fetch date). **[VERIFIED source: caniuse, directly fetched]**

### 6.3 Safari / WebKit — the load-bearing finding for this brief

Multiple independently corroborating sources, two fetched directly:

- **Never shipped by default on any Safari.** Accessible only via a **hidden, off-by-default experimental flag**: on iOS, `Settings → Safari → Advanced → Feature Flags → "Shape Detection API"`; a corresponding Experimental Features toggle exists in desktop Safari. caniuse's own note: **"Disabled by default" in Safari 17.0+.** **[CLAIM, corroborated across an Apple Developer Forum thread + caniuse]**
- **It did work, briefly, when manually enabled** — through **Safari/iOS 17.6.x**.
- **It broke starting iOS/Safari 18.0** and, per the still-open WebKit bug, **remains broken through at least iOS 18.3, 18.4, 18.5, and an iOS 26 beta build** — filed **2024-10-21** as **Bugzilla #281848**, status **`NEW`** (unresolved), priority **P2**, severity Normal, reporter an outside developer (Danny Moerkerke), with an internal Apple Radar cross-reference (`rdar://problem/138403640`) but **no public WebKit engineer comment on record**. **[VERIFIED source — directly fetched from bugs.webkit.org]**
- **Scope of the regression**: iOS/iPadOS-specific — the same bug report notes **macOS (Sequoia) is not affected**, i.e. desktop Safari's implementation is fine; it's specifically the mobile engine that regressed.
- A parallel Apple Developer Forums thread (`developer.apple.com/forums/thread/767761`) shows a user reporting the exact same break after upgrading a working iOS 17.x PWA to iOS 18.0, with the only reply pointing back to the same open WebKit bug and no confirmed fix timeline as of that thread. **[VERIFIED source, directly fetched]**
- Follow-up web search dated as late as **February–March 2026** found no evidence the regression had been fixed; the most recent commentary still describes the API as broken on iOS and recommends a WebAssembly-based decoder as the practical path forward for iOS specifically. **[CLAIM — search synthesis, dated as recently as this research allows, i.e. essentially current as of report date]**

**Bottom line for the architecture decision:** as of 2026-09-03, on the primary target platform (iPhone Safari), `BarcodeDetector` is **unusable for real users** — it isn't on by default, and even a developer who could somehow get users to flip a hidden flag would be shipping a feature that currently doesn't work. There is no committed fix date. **A WASM decoder (zxing-wasm and/or zbar-wasm) must be the baseline for iOS; native `BarcodeDetector` can only be an opportunistic accelerator on Android.** **[INFERENCE, but essentially forced by the verified facts above]**

### 6.4 What the API exposes (and conspicuously doesn't)

Confirmed via MDN (`BarcodeDetector` page and the `Barcode_Detection_API` overview page, both fetched directly): **[VERIFIED source]**

- Constructor: `new BarcodeDetector({ formats: [...] })` — an explicit format allow-list.
- Static `BarcodeDetector.getSupportedFormats() → Promise<string[]>`.
- `detect(image) → Promise<DetectedBarcode[]>`, accepting `HTMLImageElement | SVGImageElement | HTMLVideoElement | HTMLCanvasElement | ImageBitmap | OffscreenCanvas | VideoFrame | Blob | ImageData`.
- Each `DetectedBarcode`: `boundingBox` (axis-aligned `DOMRectReadOnly`), `cornerPoints` (4 `{x,y}` points, top-left first, clockwise — MDN explicitly notes these "may not be square due to perspective distortion," i.e. this is a real quad, not just the bounding box re-expressed), `format` (string), `rawValue` (decoded string).
- 14 named formats: `aztec, code_128, code_39, code_93, codabar, data_matrix, ean_13, ean_8, itf, pdf417, qr_code, upc_a, upc_e`, plus `unknown`.
- Secure-context only (HTTPS), usable inside Web Workers.

**What is conspicuously absent, confirmed by the exhaustiveness of the above list:** **no confidence/quality score of any kind; no partial-result concept** (a barcode is either fully decoded and in the array, or it simply isn't there — there is no "I can see something barcode-shaped here" signal); **no raw scanline, module-grid, or per-character data**; nothing analogous to zxing-cpp's `lineCount`/`returnErrors` or ZBar's `quality()`/`ZBAR_PARTIAL`. The only geometric primitive is the 4-point `cornerPoints` quad, which is on par with zxing-cpp's `Position` and jsQR's corner data, but with nothing else behind it. **[INFERENCE from the documented, exhaustive API surface]** This is precisely why a project that wants detect-before-decode, localization, partial evidence, *and* multi-frame accumulation cannot build it on `BarcodeDetector` alone even where the native API is available and working (Android) — it would still need to be paired with a richer decoder (or at minimum a separate lightweight detector) to get any signal below the level of "fully decoded or nothing."

---

## 7. On-device ML in the browser (detection / tracking / quality)

### 7.1 ONNX Runtime Web

Backends: `wasm` (CPU, optionally SIMD+multi-threaded, the latter needing COOP/COEP cross-origin isolation like any WASM-threads use), `webgpu`, and an experimental `webnn` execution provider. **[general knowledge, corroborated by search but not pinned to one primary doc this session — CLAIM]**

**WebGPU on iOS Safari is new in 2026.** Search synthesis (not a primary caniuse/webkit.org fetch this session, so **[CLAIM]**, flagged for independent re-verification before relying on it): WebGPU reportedly reached **Baseline status around January 2026**, with **Safari 26** shipping it across **iOS 26, iPadOS 26, macOS Tahoe 26, and visionOS 26**. If accurate, this means a WebGPU-accelerated ONNX Runtime Web pipeline on iPhone is only viable on **iOS 26+**, and for any earlier iOS still in the user base, ONNX Runtime Web on iPhone Safari is limited to the **wasm (CPU)** execution provider. **This needs a direct webkit.org/caniuse check before being treated as load-bearing** — it was not independently re-verified this session beyond search-engine synthesis.

**No trustworthy phone-browser latency number for a nano detector was found.** What was found, with honest caveats:

- A YOLOv8n figure of **~80.4 ms/image on CPU** — device/environment unspecified, so not clearly mobile-browser-relevant. **[CLAIM, weak]**
- **"Sub-2 ms" YOLOv5n / YOLOv8n / YOLO11n** figures exist but are explicitly **TensorRT FP16 on a datacenter T4 GPU** — **not applicable** to a phone browser at all; included here only to flag it as a trap (this number circulates widely and is easy to misapply). **[VERIFIED that the claim exists and its stated context — CLAIM for the number itself]**
- An unsourced claim that "YOLOv8s and YOLO26s can process 30 fps on modern smartphones" was found with no benchmark methodology attached. **[CLAIM, low confidence]**

**Recommendation: treat every published ML-detector latency number as inapplicable until reproduced on the actual target devices (a representative mid-range Android + an iPhone on the oldest iOS the product supports) inside an actual mobile Safari/Chrome WebGPU or WASM session** — nothing found in this research pass is a substitute for that first-party measurement. **[INFERENCE]**

### 7.2 WebNN

**W3C Candidate Recommendation reached January 2026.** Chrome/Edge have **experimental, flag-gated** support across ChromeOS/Linux/macOS/Windows/Android; **Firefox and Safari have not adopted WebNN at all.** Explicitly characterized in the sources found as **"not ready for production... cross-browser deployment isn't viable yet,"** with GPU/NPU delegate support itself still in preview even where the API exists. **[CLAIM — search synthesis, corroborated across 2+ independent sources]** Not usable as a cross-platform baseline today; irrelevant to Safari entirely.

### 7.3 TensorFlow.js

Still installable and documented, but its flagship pretrained detector package, **`@tensorflow-models/coco-ssd`, sits at v2.2.3, last published roughly 3 years before this search** — i.e., stale, unmaintained in practice even though still listed as an official TF.js model. **[CLAIM]** General 2026 framing found in search literature places the "production browser ML stack" energy on **WebGPU + ONNX Runtime Web (+ transformers.js)** rather than TensorFlow.js for new work. **[CLAIM]**

### 7.4 MediaPipe Tasks Vision — Object Detector (web)

Package: `@mediapipe/tasks-vision` (npm). Reference model: **EfficientDet-Lite0** — EfficientNet-Lite0 backbone + BiFPN feature network, **320×320 input**, COCO-trained (80 classes, ~1.5M instances), shipped as **int8, float16, or float32** variants, loaded via `createFromOptions()` pointing at an `efficientdet_lite0_uint8.tflite` asset. Google's own guidance recommends Lite0 as the latency/accuracy balance point. **[CLAIM — search synthesis of the official Google AI Edge documentation page, not independently re-fetched as raw HTML this session]** No phone-browser latency numbers were surfaced for this model either — same gap as §7.1. Delegate options are the standard MediaPipe CPU/GPU split by general framework convention, **not independently confirmed for the web/JS target this session**. **[INFERENCE]**

### 7.5 Barcode-specific detection benchmarks and datasets, 2022–2026

**BarBeR (Barcode Benchmarking Repository)** — ICPR 2024 paper, GitHub `Henvezz95/BarBeR`, produced by AImageLab, University of Modena and Reggio Emilia. Dataset: **8,748 real images** merging **12 smaller public 1D/2D barcode datasets**, with **polygon annotations** (i.e., not just axis-aligned boxes — consistent with the quad/corner-point primitives valued throughout this report). The repository ships **code implementations of multiple published localization algorithms** plus a shared metrics/evaluation harness, explicitly designed to be extended with new localization algorithms for apples-to-apples comparison. **[CLAIM — search synthesis of the paper and repo landing pages, not independently re-fetched]**

**The "ZVZ dataset" named in the original brief was not located or confirmed by any source found this session** — flagged honestly as a gap rather than guessed at. If it is load-bearing for the architecture decision, it needs a dedicated follow-up search with more specific terms/spelling.

### 7.6 Licensing trap: Ultralytics YOLOv8 / YOLO11

**YOLOv8** (Ultralytics, released January 2023) and **YOLO11** (Ultralytics, released September 2024) are both distributed under **AGPL-3.0** by default. AGPL-3.0's network-copyleft clause means: using Ultralytics' training/inference code (or a model produced by it) inside a connected/networked proprietary product creates an obligation to **open-source the connected application's code**, unless the team purchases an **Ultralytics Enterprise License**, which specifically exists to let organizations "modify Ultralytics YOLO source code and embed [it] in commercial products without needing to follow the constraints of the AGPL-3.0 License." **[CLAIM — search synthesis of Ultralytics' own license page + a related GitHub licensing-question discussion, reasonably authoritative since it cites the vendor's own stated terms]**

**Implication for a proprietary scan-core:** shipping a YOLOv8n/YOLO11n-based nano detector trained via Ultralytics' own tooling, without paying for an Enterprise license, is a real legal exposure for a closed-source product. **Mitigations** (not independently verified as license-clean this session, offered as directions only): train an architecturally-equivalent nano detector using non-Ultralytics tooling (plain PyTorch/Apache-licensed frameworks), or evaluate Apache-2.0-licensed alternatives such as YOLOX, or budget for the Enterprise license if Ultralytics' specific tooling/accuracy is considered worth it. **[INFERENCE]**

---

## 8. Tracking and quality primitives in the browser

- **OpenCV.js classical trackers** (`TrackerKCF`, `TrackerBoosting`, `TrackerMIL`, `TrackerTLD`, `TrackerMedianFlow`, `TrackerMOSSE`, `TrackerCSRT`) are **nominally bound** in opencv.js, but a real GitHub issue (`opencv/opencv#15607`) and multiple OpenCV Q&A/forum threads report the bindings as **unreliable in practice** — e.g. `cv.TrackerKCF_create is not a function` errors — with only the `create()` factory exposed for most trackers and behavior varying across opencv.js build versions. **Do not assume these "just work" the way desktop Python OpenCV's tracking API does; budget time to validate the specific build.** **[CLAIM — search synthesis of the linked GitHub issue and forum threads]**
- **Lucas-Kanade optical flow** (`cv.calcOpticalFlowPyrLK`) lives in OpenCV's `video` module, which appears in the same default opencv.js module whitelist (`core, imgproc, objdetect, video, dnn, features2d, photo, aruco, calib3d`) that includes the barcode detector — so if opencv.js is already in the bundle for barcode/quality work, LK optical flow comes along for free at no extra size cost. **[INFERENCE from the module list found in §5.2, not independently function-verified this session]**
- **IoU / Kalman box tracking**: no browser or library API for this was found — and none should be expected to exist as a packaged primitive; this is standard practice to hand-implement (a greedy IoU-matching loop is a few dozen lines; a basic constant-velocity Kalman filter is a small, well-documented linear-algebra routine or a small dependency). Treat this as "build it," not "find it." **[INFERENCE]**
- **Blur metrics**: the two standard, cheap, well-documented sharpness measures are **Variance-of-Laplacian** (convolve with a Laplacian kernel, take the variance of the result, threshold) and **Tenengrad/Sobel-energy** (variance of Sobel-gradient magnitude). Both are simple enough to hand-roll in a few lines of JS/WASM over a downsampled ROI, need no library. **Caveat found in the source material and worth taking seriously for barcodes specifically: these measure edge/texture energy, not focus per se — a flat, low-texture region can score "blurry" even in perfect focus**, so thresholds calibrated on generic photos will not transfer cleanly to barcode crops (which are a very specific, regular edge pattern) and should be calibrated against real barcode captures. **[CLAIM for the algorithms themselves — pedagogical/public-domain sources, not a single spec to cite as primary — high confidence regardless; VERIFIED-style confidence for the caveat, which was explicit in what was fetched]**
- **Glare/saturation detection**: no dedicated library or API was found (none was expected to exist). The standard DIY approach — thresholding the HSV V-channel or raw luma for clusters of near-255 blown-out pixels within the barcode ROI — is universal ad hoc practice in scanning apps, not a citable library feature. **[INFERENCE / general knowledge, explicitly not sourced this session]**
- **`DeviceMotionEvent`/`DeviceOrientationEvent` permission on iOS Safari**: since iOS 13, access is gated behind `DeviceMotionEvent.requestPermission()`, which (a) **exists only on iOS Safari** (must be feature-detected, e.g. `typeof DeviceMotionEvent.requestPermission === 'function'`), (b) **must be called synchronously from inside a user-gesture handler** (a tap) — it cannot be requested on page load, during camera-stream autoplay, or from any non-gesture async callback — and (c) resolves a `Promise<'granted'|'denied'>`. **[CLAIM — consistently corroborated across multiple independent developer-community and Apple-forum sources found this session, high confidence despite the tag]** **Practical implication:** any "hold the phone steady" motion-based quality gate needs a deliberate, explicit one-tap permission moment in the scan-session UX — it cannot be silently bundled into "the camera just opened." **[INFERENCE]**

---

## 9. OCR in the browser — is real-time on-device EAN-digit OCR realistic?

- **Tesseract.js**: default per-language trained data is **~2 MB** (English), but can balloon — e.g. **~20 MB** for Chinese-simplified under the legacy engine. A fresh default-config user downloads **~15.34 MB** of JS + language data before the first recognition can even run. **Version 5** made real improvements — **54% smaller English / 73% smaller Chinese** data, and **worker memory cut from 311 MB to 164 MB (47% reduction)**, enabling more parallel workers on memory-constrained devices — and **language data is cached after first download**, helping warm-start latency on return visits. **[CLAIM — search synthesis of the project's own `docs/performance.md`]** Real-world mobile speed, per a user-filed GitHub issue: **2–20+ seconds per 640×640 px image on an iPhone X**, depending on capture conditions. **[CLAIM, anecdotal/single-source, and iPhone X is a dated reference device by 2026 standards — a current iPhone will likely do meaningfully better, but "meaningfully better than 2–20 seconds" is very unlikely to reach real-time (sub-200 ms) territory] [INFERENCE for the extrapolation]**
- **PaddleOCR web ports**: an official-lineage `@paddlejs-models/ocr` ("PaddleOCR.js") running an older **PP-OCRv4** graph via `paddlejs`; and a newer, independent community project, **`ppu-paddle-ocr`**, running **PP-OCRv5/PP-OCRv6** detection+recognition fully client-side via **ONNX Runtime Web** with WASM/WebGPU backends and INT8 quantization, claiming portability across Node/Bun/Deno/browser/worker/React Native/extension contexts and 40+ languages, with a public interactive demo. **[CLAIM — search synthesis, demo URL noted but not independently tested this session]** **No independently verified phone-browser latency numbers were found for either** — same benchmarking gap as the ML detectors in §7.
- **`TextDetector`**: as established in §6.1, this was **deliberately spun off into a non-normative, informative spec** because OCR was judged too unstable across platforms/scripts to standardize, and it has **never shipped by default in any browser** — it remains flag-gated/experimental in Chromium only, with no Safari story whatsoever. **[CLAIM]** It is not an available option today, on any platform this brief targets.

**Synthesis for the decision:** given (a) Tesseract.js's multi-second-per-frame reality on real phone hardware in the project's own bug tracker, (b) the complete absence of a shipped browser-native fast-OCR path, and (c) PaddleOCR-web ports being new community efforts with no independently confirmed phone latency, **on-device OCR of the printed EAN digits cannot be a per-frame, continuous evidence source today.** It is realistic only as an **occasional, single-shot fallback** — e.g., triggered once when the barcode decoder itself is "confident but not certain" (a good use for zxing-cpp's `lineCount`/`returnErrors` or ZBar's `quality()` sitting just under a promotion threshold), run once against a single best-quality captured frame, with an accepted latency budget in the seconds, not milliseconds. **[INFERENCE]**

---

## 10. Consolidated comparison table

| Library / API | License | Bundle / WASM size | Maintenance (last release found) | What it exposes for detect-before-decode / localization / partial evidence / multi-frame | Key weaknesses |
|---|---|---|---|---|---|
| **zxing-cpp** (core) | Apache-2.0 **[VERIFIED]** | n/a (native lib) | `v3.1.0`/`3.1.1`-era, activity through **2026-07** **[CLAIM]** | Source of all zxing-wasm primitives below | C++20, needs a wrapper for web |
| **zxing-wasm** (Sec-ant) | MIT wrapper / Apache-2.0 core / BSD-3 zint **[VERIFIED]** | reader **~1.04 MiB**, full **~1.46 MiB**, writer **~636 KiB** **[VERIFIED, paraphrased]** | `3.1.3` current **[VERIFIED]** | `Position` quad + `lineCount()` on every result; `returnErrors` surfaces checksum/format failures *with* geometry; named `ReaderOptions` (`tryHarder/tryRotate/tryInvert/tryDownscale/isPure/binarizer/minLineCount/maxNumberOfSymbols/textMode/eanAddOnSymbol`) | No native confidence score; build-flag-sensitive perf (documented 10x regression from a wrong CMake default); no confirmed SIMD variant |
| **barcode-detector** (Sec-ant polyfill) | MIT **[VERIFIED]** | JS wrapper 260,906 B unpacked + depends on zxing-wasm **[VERIFIED]** | `3.2.2` current, pinned to zxing-wasm 3.1.3 **[VERIFIED]** | Drop-in native-API shape only — hides the richer zxing-wasm primitives unless bypassed | Auto-polyfill mode doesn't verify an existing global is a *real* native impl |
| **ZBar** (mchehab fork) | LGPL-2.1(+) **[VERIFIED]** | n/a (native lib) | `0.23.93`, **2024-01-09** — stale **[CLAIM]** | `ZBAR_PARTIAL` state; separate left/right EAN half-decode with checksum+width agreement; `zbar_symbol_get_quality()` **named confidence metric**; `zbar_image_scanner_enable_cache()` **native multi-frame cache with hysteresis**; `ZBAR_CFG_UNCERTAINTY` (required consistency frames); `ZBAR_CFG_X/Y_DENSITY` scan stride; `ZBAR_CFG_POSITION` (opt-in geometry) | Stale upstream; LGPL needs real legal review for WASM bundling; narrower format set than zxing-cpp |
| **@undecaf/zbar-wasm** | LGPL-2.1 (code) / CC-BY-SA-4.0 (docs) **[VERIFIED]** | **~330 KB** deployed **[VERIFIED]** | tracks zbar upstream | Same primitives as ZBar core, exposed as `scanImageData()`/`ZBarSymbol`/`ZBarScanner`/`ZBarImage` | Same LGPL caveat; smallest footprint of the "real" decoders surveyed |
| **@ericblade/quagga2** | MIT **[VERIFIED]** | not sized this session | `1.12.1`, ~2026 H1, but flagged **"Inactive"** by health scanners **[CLAIM]** | Patch-grid `locate()` w/ `patchSize`/`halfSample`; `result.boxes` (multi-box), `result.line`/`angle`; **per-character `decodedCodes[].error`** — the only per-digit confidence trail found in this survey; worker pool | Older scanline-heuristic core; localization step reported slower than zxing-cpp's row scan; low active-maintenance signal |
| **rxing / rxing-wasm** | not confirmed this session **[gap]** | not confirmed **[gap]** | active dev (0.3.0+ breaking changes recent) **[CLAIM]** | `decode_multi()`, image-conversion helpers, metadata map | Encoder side "alpha/unstable"; no evidence of richer primitives than zxing-cpp; license unverified — check before adopting |
| **html5-qrcode** | not re-verified this session | camera/UI wrapper only, not its own decoder | explicitly **"maintenance mode," no more fixes** **[CLAIM]** | Convenience camera plumbing over a ZXing-JS-family decoder | Explicitly end-of-life as an actively developed project |
| **jsQR** | commonly assumed MIT, **not independently confirmed** **[gap]** | small, pure JS | activity signal weak/ambiguous **[CLAIM]** | 4 corners **+ 3 finder-pattern centers + alignment pattern** on success | QR-only; **no confidence/partial state at all** — binary null-or-full-result |
| **OpenCV `cv::barcode::BarcodeDetector`** | Apache-2.0 (OpenCV license) | opencv.js full build **~6–9 MB** **[CLAIM]** | tracks OpenCV releases | Distinct gradient-orientation-coherence localization algorithm; tunable `DetectorScales`/`GradientThreshold`; optional external super-resolution DNN for small/blurry codes | Very large for barcode-only use; SR model not bundled; opencv.js classical trackers separately reported flaky |
| **Browser `BarcodeDetector`** (native) | n/a (browser feature) | 0 (built-in) | Chrome default since **83** (2020); Safari **never defaulted on, currently broken on iOS 18.0–18.5+/iOS 26 beta** **[VERIFIED]** | 4-point `cornerPoints` quad + `boundingBox`; 14 named formats; `getSupportedFormats()` | **No confidence, no partial state, no scanline/module data at all**; Windows/Linux Chrome desktop has **no backend**; **Safari unusable in practice today** |
| **ONNX Runtime Web** | MIT (project) | backend/model-dependent | active | `wasm`/`webgpu`/`webnn` execution providers; WebGPU newly viable on iOS via **Safari 26 (~Jan 2026)** **[CLAIM]** | **No trustworthy phone-browser nano-detector latency found**; WebNN unsupported on Safari/Firefox |
| **TensorFlow.js `coco-ssd`** | Apache-2.0 (TF.js) | model-dependent | package stale (**v2.2.3, ~3 yrs old**) **[CLAIM]** | Prebuilt object detector, zero-setup | Ecosystem momentum has moved on; stale pretrained model |
| **MediaPipe Tasks Vision (Object Detector, web)** | Apache-2.0 (MediaPipe) | model-dependent (EfficientDet-Lite0, int8/fp16/fp32) | actively documented by Google **[CLAIM]** | `@mediapipe/tasks-vision` npm package; CPU/GPU delegate split (framework convention) | **No phone-browser latency figures found**; not barcode-specific (general COCO classes) |
| **Ultralytics YOLOv8 / YOLO11** | **AGPL-3.0** (commercial license available) **[CLAIM, vendor's own terms]** | model-size-dependent (nano variants small) | YOLOv8 Jan 2023, YOLO11 Sept 2024 | Strong general detector family, well documented | **AGPL copyleft risk for a proprietary product** without an Enterprise license |
| **Tesseract.js** | Apache-2.0 (project) | ~2 MB/language (English), much larger for some scripts; **~15.34 MB** first-run default total **[CLAIM]** | v5 shipped real size/perf cuts | Worker-based, language-data caching | **2–20+ s per frame on real phone hardware** reported — not real-time |
| **PaddleOCR web ports** | Apache-2.0 (PaddlePaddle upstream, general) | not sized this session | active in 2025–2026 (PP-OCRv5/v6 ports) **[CLAIM]** | Full detect+recognize pipeline client-side, WebGPU/WASM/INT8 | **No independently verified phone latency**; community port (`ppu-paddle-ocr`) is new/unproven |
| **`TextDetector`** | n/a (browser feature) | 0 | **never shipped by default anywhere**; informative-only spec **[CLAIM]** | Would give OCR-in-image if it existed | Not usable today, any platform |

---

## Sources

Directly fetched this session (WebFetch / raw source retrieval):

- https://bugs.webkit.org/show_bug.cgi?id=281848
- https://github.com/WebKit/standards-positions/issues/174
- https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector
- https://developer.mozilla.org/en-US/docs/Web/API/Barcode_Detection_API
- https://caniuse.com/mdn-api_barcodedetector_detect
- https://developer.apple.com/forums/thread/767761
- https://github.com/zxing-cpp/zxing-cpp/tree/master/core/src
- https://raw.githubusercontent.com/zxing-cpp/zxing-cpp/master/core/src/ReaderOptions.h
- https://raw.githubusercontent.com/zxing-cpp/zxing-cpp/master/core/src/oned/ODReader.cpp
- https://raw.githubusercontent.com/zxing-cpp/zxing-cpp/master/core/src/Barcode.h
- https://raw.githubusercontent.com/zxing-cpp/zxing-cpp/master/README.md
- https://raw.githubusercontent.com/zxing-cpp/zxing-cpp/master/wrappers/wasm/README.md
- https://github.com/zxing-cpp/zxing-cpp/discussions/511
- https://raw.githubusercontent.com/mchehab/zbar/master/zbar/decoder/ean.c
- https://raw.githubusercontent.com/mchehab/zbar/master/include/zbar.h
- https://raw.githubusercontent.com/undecaf/zbar-wasm/master/README.md
- https://raw.githubusercontent.com/ericblade/quagga2/master/README.md
- https://raw.githubusercontent.com/cozmo/jsQR/master/README.md
- https://raw.githubusercontent.com/rxing-core/rxing-wasm/main/README.md
- https://raw.githubusercontent.com/Sec-ant/zxing-wasm/main/README.md
- https://raw.githubusercontent.com/Sec-ant/barcode-detector/main/README.md
- https://registry.npmjs.org/zxing-wasm/latest
- https://registry.npmjs.org/barcode-detector/latest
- https://codebrowser.dev/opencv/opencv/modules/objdetect/include/opencv2/objdetect/barcode.hpp.html
- https://groups.google.com/a/chromium.org/g/blink-dev/c/j-PLtssE5fo/m/budv_U6fCwAJ

Attempted directly but blocked (HTTP 403, no content obtained — claims about these pages in this report instead rely on search-engine synthesis and are tagged [CLAIM]):

- https://www.npmjs.com/package/zxing-wasm
- https://www.npmjs.com/package/barcode-detector
- https://github.com/ericblade/quagga2 (rendered page; raw README above succeeded instead)
- https://docs.opencv.org/4.x/d8/df2/classcv_1_1barcode_1_1BarcodeDetector.html
- https://docs.opencv.org/4.x/d6/d25/tutorial_barcode_detect_and_decode.html
- https://chromestatus.com/feature/4757990523535360

Referenced via web-search synthesis (not directly fetched as raw pages this session; underlies bullets tagged [CLAIM] throughout):

- https://github.com/zxing-cpp/zxing-cpp/releases and https://pypi.org/project/zxing-cpp/
- https://github.com/mchehab/zbar/releases/tag/0.23.93
- https://www.npmjs.com/package/@ericblade/quagga2, https://socket.dev/npm/package/@ericblade/quagga2, https://snyk.io/advisor/npm-package/@ericblade/quagga2, https://libraries.io/npm/@ericblade%2Fquagga2
- https://github.com/rxing-core/rxing, https://crates.io/crates/rxing/0.4.11
- https://github.com/mebjas/html5-qrcode
- https://wicg.github.io/shape-detection-api/ and https://wicg.github.io/shape-detection-api/text.html
- https://developer.chrome.com/docs/capabilities/shape-detection and https://developer.chrome.com/blog/new-in-chrome-83
- https://github.com/mdn/browser-compat-data/issues/9030
- https://answers.opencv.org/question/229032/opencv_jswasm-is-too-large/ and related opencv.js sizing discussions (Medium/Lambda-IT blog posts, `opencv/opencv/platforms/js/opencv_js.config.py`)
- https://github.com/opencv/opencv/issues/15607 and related OpenCV.js tracker Q&A/forum threads
- https://ai.google.dev/edge/mediapipe/solutions/vision/object_detector/web_js
- https://github.com/tensorflow/tfjs-models/blob/master/coco-ssd/README.md and https://www.npmjs.com/package/@tensorflow-models/coco-ssd
- https://ditto.ing.unimore.it/barber/ and https://github.com/Henvezz95/BarBeR (BarBeR benchmark)
- https://www.ultralytics.com/license and https://github.com/ultralytics/ultralytics/issues/19390
- https://github.com/naptha/tesseract.js/blob/master/docs/performance.md and https://github.com/naptha/tesseract.js/issues/611
- http://www.paddleocr.ai/main/en/version3.x/deployment/browser.html and https://ppu-paddle-ocr.snowfluke.workers.dev/
- https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html and general 2026 WebGPU-baseline commentary
- https://www.w3.org/TR/webnn/ and https://cr-status.appspot.com/feature/5176273954144256
- https://pyimagesearch.com/2015/09/07/blur-detection-with-opencv/ and related Laplacian/Tenengrad explainer pages
- https://developer.apple.com/forums/thread/734869 and related iOS 13 `DeviceMotionEvent.requestPermission()` developer-community pages
