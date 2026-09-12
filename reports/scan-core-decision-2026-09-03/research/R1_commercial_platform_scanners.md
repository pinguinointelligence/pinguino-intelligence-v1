# R1 — Commercial & Platform Scanners: Architecture and UX Mechanics

Evidence file for a LIVE barcode/product SCAN CORE architecture decision on a mobile-web PWA (iPhone Safari + Android Chrome). Compiled 2026-09-03. Default posture: build, don't buy an SDK — this file documents WHAT the best scanners do, not a procurement recommendation.

## Tagging legend

- **[VERIFIED]** — fetched the primary source directly in this session; quoted text is the source's own wording.
- **[VERIFIED-SEC]** — the fact traces to a primary source, but the direct fetch of that exact page failed in this session (404 / DNS / rate-limit). The wording is a search-engine-extracted excerpt of that same page, not independently re-confirmed word-for-word. Treat as high-but-not-first-hand confidence; re-check before hard-coding parameter names.
- **[VENDOR CLAIM]** — a marketing or self-reported performance/quality statement. May be true, not independently verified.
- **[INFERENCE]** — my own synthesis across sources, not a direct statement from any one source.
- **[UNVERIFIED]** — actively searched for, could not confirm. Flagged so it isn't assumed true or false.

Currency note: most sources below are live documentation fetched today and reflect current (2024-2026) SDK versions. Two sources are materially older and are flagged inline: the WWDC session is from June 2022 (but the live Apple doc pages fetched today show the same API surface, so it's still current), and Chrome's own Shape Detection API doc page is dated 2019-01-07 and appears effectively unmaintained.

---

## 1. Apple VisionKit `DataScannerViewController` and Vision / AVFoundation

### 1.1 What it is, and the architecture statement

- **[VERIFIED]** Apple's own abstract: *"An object that scans the camera live video for text, data in text, and machine-readable codes."* — https://developer.apple.com/documentation/visionkit/datascannerviewcontroller
- **[VERIFIED]** *"Use a `DataScannerViewController` object to get input from physical objects that appear in the camera's live video, such as printed text and QR codes on packages."* — same source.
- **[VERIFIED]** From the WWDC22 session narration (Ron Santos, VisionKit input engineer): *"The DataScannerViewController...combines the features of AVFoundation and Vision specifically for the purpose of data scanning."* and *"It combines AVCapture and Vision to enable live capture of machine-readable codes and text through a simple Swift API."* — https://developer.apple.com/videos/play/wwdc2022/10025/ (WWDC22, session 10025, June 2022 — **flagged as pre-2023**, but the live doc pages fetched today show an unchanged API surface plus a visionOS 1.0+ addition, so it is still the current guidance).
- **[INFERENCE]** This is explicit architectural confirmation that Apple deliberately packages the low-level pieces (AVFoundation camera pipeline + Vision analysis) behind one high-level controller specifically so app developers don't hand-roll the "grab camera frames → feed Vision → draw overlay" loop themselves.

### 1.2 Configuration surface (exact property semantics)

All of the following are **[VERIFIED]** direct quotes from the live DocC JSON for the class — https://developer.apple.com/documentation/visionkit/datascannerviewcontroller and its initializer:

| Property | Apple's exact description |
|---|---|
| `isHighFrameRateTrackingEnabled` | *"A Boolean value that determines the frequency at which the scanner updates the geometry of recognized items."* |
| `isGuidanceEnabled` | *"A Boolean value that indicates whether the scanner provides help to a person when selecting items."* |
| `isHighlightingEnabled` | *"A Boolean value that indicates whether the scanner displays highlights around recognized items."* |
| `isPinchToZoomEnabled` | *"A Boolean value that indicates whether people can use a two-finger pinch-to-zoom gesture."* |
| `recognizesMultipleItems` | *"A Boolean value that indicates whether the scanner should identify all items in the live video."* |
| `qualityLevel` | *"The resolution that the scanner uses to find data."* (enum `DataScannerViewController.QualityLevel`) |
| `recognizedItems` | *"An asynchronous array of items that the data scanner currently recognizes in the camera's live video."* — type `AsyncStream<[RecognizedItem]>` |

- **[VERIFIED]** `qualityLevel` has three named levels, per the WWDC22 session: **Fast** — *"will sacrifice resolution in favor of speed in scenarios where you expect large and easily-legible items, like text on signs"*; **Balanced** — recommended default for most cases; **Accurate** — *"will give you the best accuracy, even with small items like micro QR codes or tiny serial numbers."* — https://developer.apple.com/videos/play/wwdc2022/10025/
- **[VERIFIED]** On high-frame-rate tracking specifically: *"Enable high frame rate tracking when you draw highlights. It allows the highlights to follow items as closely as possible when the camera moves or the scene changes."* — same source. This directly ties the `isHighFrameRateTrackingEnabled` flag to a UX purpose: cheap per-frame geometry updates for a highlight overlay, decoupled from re-running full recognition.
- **[VERIFIED]** Region of interest: developers can *"limit the active portion of the view by specifying a region-of-interest, which is also in view coordinates."* — same source.
- **[VERIFIED]** Symbology/content-type scoping: *"You can specify exactly which symbologies to look for"* for barcodes, and *"For text recognition, you can specify content types to limit the type of text you find."* — same source.
- **[VERIFIED]** Methods: `startScanning()` — *"Starts scanning the camera's live video for data."*; `stopScanning()` — *"Stops scanning the camera's live video for data."*; `capturePhoto()` — *"Captures a high-resolution photo of the camera's live video."* — https://developer.apple.com/documentation/visionkit/datascannerviewcontroller
- **[VERIFIED]** Availability gating: `isSupported` — *"A Boolean value that indicates whether the device supports data scanning"*; `isAvailable` — *"A Boolean value that indicates whether a person grants your app access to the camera and doesn't have any restrictions to using the camera."* — same source.

### 1.3 The `recognizedItems` stream and per-frame geometry updates

- **[VERIFIED]** `RecognizedItem` abstract: *"An item that the data scanner recognizes in the camera's live video."* It is an enum with cases `barcode(_:)` (*"A machine-readable barcode"*) and `text(_:)` (*"Text or data the analyzer detects in text"*), each carrying a `bounds: RecognizedItem.Bounds` — *"The four corners of the recognized item in view coordinates"* — and a stable `id: UUID`. It conforms to `Identifiable`. — https://developer.apple.com/documentation/visionkit/recognizeditem
- **[VERIFIED]** The delegate lifecycle shown in the WWDC22 session is a three-event model that is the mechanical core of "tracked highlight persisting across frames":
  - `didAdd(addedItems:allItems:)` — create a highlight view per new `RecognizedItem`, keyed by `item.id`.
  - `didUpdate(updatedItems:allItems:)` — *animate* the existing highlight view to the item's new `bounds` as it moves frame-to-frame (this is where `isHighFrameRateTrackingEnabled` geometry updates land).
  - `didRemove(removedItems:allItems:)` — tear down the highlight view when an item leaves the frame.
  — https://developer.apple.com/videos/play/wwdc2022/10025/
  **[INFERENCE]** This is Apple's concrete implementation of "detection identity persists across frames, geometry is cheap to update every frame" — the same pattern independently described by Dynamsoft's `IntermediateResultReceiver` and Scandit's `BarcodeBatch`/MatrixScan tracked-object model (see §3, §4).

### 1.4 Device / OS requirements

- **[VERIFIED]** Platform floor: iOS 16.0+, iPadOS 16.0+, visionOS 1.0+. — https://developer.apple.com/documentation/visionkit/datascannerviewcontroller
- **[VERIFIED]** *"Any 2018 and newer iPhone and iPad devices with the Apple Neural Engine support data scanning."* — WWDC22 session narration, https://developer.apple.com/videos/play/wwdc2022/10025/. **[INFERENCE]** This ties DataScannerViewController's live recognition to on-device ML acceleration (Neural Engine), not pure CPU/GPU image processing — a materially different resourcing model than a WASM decoder running on any browser.
- **[UNVERIFIED]** The exact guidance *label text* shown to the user (e.g., what string Apple's system UI displays when it wants the user to move closer / center a code) was not present in any fetched content. The WWDC session confirms guidance labels exist and *where* they appear (*"labels show at the top of the screen to help direct the user"*) but not their literal copy — do not assume specific wording without checking Apple's Human Interface Guidelines or a live device test.

### 1.5 The lower-level APIs (what DataScannerViewController is built from)

- **[VERIFIED]** `VNDetectBarcodesRequest` abstract: *"A request that detects barcodes in an image."* It *"returns an array of `VNBarcodeObservation` objects, one for each barcode it detects."* Key properties: `symbologies` — *"The barcode symbologies that the request detects in an image"*; `coalesceCompositeSymbologies` — *"A Boolean value that indicates whether to coalesce multiple codes based on the symbology."* Platform floor iOS 11.0+ (i.e. this is a still-images/single-buffer Vision **request** object, not itself a live-video controller — it must be driven frame-by-frame by the caller). — https://developer.apple.com/documentation/vision/vndetectbarcodesrequest
- **[VERIFIED]** `AVCaptureMetadataOutput` abstract: *"A capture output for processing timed metadata produced by a capture session."* Overview: *"An `AVCaptureMetadataOutput` object intercepts metadata objects emitted by its associated capture connection and forwards them to a delegate object for processing."* Key properties: `metadataObjectTypes` — *"An array of strings identifying the types of metadata objects to process"*; `rectOfInterest` — *"A rectangle of interest for limiting the search area for visual metadata."* — https://developer.apple.com/documentation/avfoundation/avcapturemetadataoutput
- **[INFERENCE]** These two are the pieces DataScannerViewController hides: `AVCaptureMetadataOutput` is Apple's older, hardware-accelerated, real-time, low-level barcode path (has existed since iOS 4/7-era AVFoundation, extremely cheap, built into the capture session itself), while `VNDetectBarcodesRequest` is the newer Vision-framework, model-based, more flexible but request-driven path. DataScannerViewController is the modern unification that also adds text recognition, live tracking IDs, and system UI (guidance/highlight/pinch-zoom) on top — none of which `AVCaptureMetadataOutput` or a raw `VNDetectBarcodesRequest` loop give you for free.
- **[UNVERIFIED]** No fetched Apple source contained an explicit sentence like "tracking and decoding are separate pipeline stages" the way Dynamsoft and Google explicitly document. The separation is observable structurally (RecognizedItem carries a stable `id` you can update geometry for independent of re-decoding) but Apple does not narrate it in those terms in anything fetched here.

---

## 2. Google ML Kit Barcode Scanning, Google Code Scanner, and Chrome `BarcodeDetector`

### 2.1 Detected-but-not-decoded: the exact null semantics

- **[VERIFIED]** From the `Barcode` class reference: `getBoundingBox()` — *"Returns `null` if the bounding rectangle can not be determined."*; `getCornerPoints()` — *"Returns `null` if the corner points can not be determined."*; `getRawValue()` — *"Returns `null` if the raw value can not be determined."*; `getRawBytes()` — *"Returns `null` if the raw bytes can not be determined."* — https://developers.google.com/android/reference/com/google/mlkit/vision/barcode/common/Barcode
- **[VERIFIED]** The mechanism that makes this concrete is `BarcodeScannerOptions.enableAllPotentialBarcodes()`: *"return all potential barcodes even if they cannot be decoded."* Available from **bundled model 17.1.0+** and **unbundled model 18.2.0+**. Effect: *"`Barcode.getRawBytes()` and `Barcode.getRawValue()` will return null for any undecoded barcodes, but `Barcode.getBoundingBox()` will return the area potentially containing a barcode."* Stated use case: *"facilitate further detection—such as by zooming in the camera to get a clearer image."* — https://developers.google.com/ml-kit/vision/barcode-scanning/android
- **[INFERENCE]** This is the Android-native, explicit, first-party confirmation of the exact pattern the task asked to verify: ML Kit can and does hand back a `Barcode` with real geometry (`boundingBox`, `cornerPoints`) and `rawValue == null` — i.e., localization succeeded, decoding did not. This is the same detect/decode split as Apple's tracked `RecognizedItem` and Dynamsoft's localized-vs-decoded barcode units.

### 2.2 Auto-zoom: `ZoomSuggestionOptions`

- **[VERIFIED]** Trigger condition, in Google's own words: auto-zoom (bundled 17.2.0+ / unbundled 18.3.0+) fires when *"all barcodes within the view are too distant for decoding"* — i.e. the scanner has localized something (or believes something is present) but decoding is failing at the current zoom level. — https://developers.google.com/ml-kit/vision/barcode-scanning/android
- **[VERIFIED]** From the `ZoomSuggestionOptions.Builder` reference: the builder constructor takes *"The `ZoomSuggestionOptions.ZoomCallback` to zoom the camera"*; `setMaxSupportedZoomRatio()` — *"Sets the max supported zoom ratio"* and *"If unset, then the library may produce an unbounded zoom ratio"* (hardware-ratio examples given for Camera1/Camera2/CameraX APIs); the callback's `setZoom(float zoomRatio)` *"is called on the main thread when the library suggests a camera zoom."* — https://developers.google.com/android/reference/com/google/mlkit/vision/barcode/ZoomSuggestionOptions.Builder
- **[INFERENCE]** ML Kit does not perform the zoom itself — it suggests a ratio and the app's own camera layer (Camera1/2/CameraX) must apply it. This is a "library computes intent, app owns the actuator" split, structurally identical to Scandit's Camera Enhancer-style auto-zoom (§3.6) and Scandit's Smart Scan Intention pattern (§4.5) of scoring/deciding vs. an app-level or SDK-owned camera control executing.

### 2.3 Bundled vs. unbundled models

- **[VERIFIED]** Two delivery models exist: unbundled — *"Model is dynamically downloaded via Google Play Services"*, ~200 KB app-size increase, *"Might have to wait for model to download"*; bundled — *"Model is statically linked to your app at build time"*, ~2.4 MB app-size increase, *"Model is available immediately."* — https://developers.google.com/ml-kit/vision/barcode-scanning/android

### 2.4 Live-video performance guidance (Google's own recommendation)

- **[VERIFIED]** *"only request the size from the camera that's required for barcode detection, which is usually no more than 2 megapixels"* — i.e. do not feed full sensor resolution into the detector; downscale before analysis. Google also recommends frame throttling and backpressure with CameraX. — https://developers.google.com/ml-kit/vision/barcode-scanning/android
- **[INFERENCE]** This 2-megapixel-cap guidance is a strong, transferable data point for a browser-based implementation too: `getUserMedia`/`ImageCapture` frames fed to any in-browser decoder (WASM or `BarcodeDetector`) should very likely be downscaled the same way before analysis, independent of which decode engine is used.

### 2.5 Google Code Scanner (`GmsBarcodeScanning`) — the privacy-first turnkey UX

- **[VERIFIED]** Positioning vs. the full ML Kit API: *"the implementation resides entirely within Google Play services, ensuring minimal impact on the size of your app"* but *"For more complex use cases that require a custom UI, we recommend using the ML Kit Barcode Scanning API directly."* — https://developers.google.com/ml-kit/vision/barcode-scanning/code-scanner
- **[VERIFIED]** Privacy/permission model: the scanner *"scanning code without requiring your app to request camera permission"*, because the task is delegated to Google Play services and only the result is returned to the calling app. — same source.
- **[VERIFIED]** Auto-zoom (16.1.0+): *"you can enable auto-zoom to allow the Google code scanner to automatically scan barcodes that are far away from the camera"*, described as intelligently detecting and zooming to *"eliminate the need for manual zoom adjustments."* — same source.
- **[VERIFIED]** *"This API uses an unbundled library that must be downloaded before use"* and *"supports the same code formats as the ML Kit Barcode Scanning API."* — same source.
- **[UNVERIFIED]** Android-only (confirmed by the product's own doc title, *"Google code scanner (Android only)"*), so it is irrelevant to an iOS Safari PWA and only theoretically relevant to an installed Android context — not to Chrome-on-Android running as a browser tab/PWA either, since it is a native Android Play-services flow, not a web API. Torch/flash control details were not present in fetched content.

### 2.6 Chrome `BarcodeDetector` (Shape Detection API) — what it exposes, what backs it, what's missing

- **[VERIFIED]** Chrome's own capabilities doc: *"Barcode detection is available on macOS, ChromeOS, and Android."* and, critically, *"Google Play Services are required on Android."* — https://developer.chrome.com/docs/capabilities/shape-detection (page dated **2019-01-07 — flagged as 7 years stale**; the requirement itself has not been contradicted by any newer source found, but treat the page's currency skeptically).
- **[VERIFIED]** Exposed data, in Chrome's words: `BarcodeDetector` returns *"the barcode raw values it finds in the ImageBitmapSource and the bounding boxes, as well as other information like the formats"* of detected barcodes. — same source.
- **[VERIFIED]** Per MDN's spec-level reference, the full `DetectedBarcode` shape is: `boundingBox` (`DOMRectReadOnly`), `cornerPoints` (*"the x and y co-ordinates of the four corner points of the detected barcode relative to the image, starting with the top left and working clockwise"*), `format`, and `rawValue` (*"a string decoded from the barcode data"*). — https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector
- **[VERIFIED]** MDN's Barcode Detection API page lists 13 concrete formats (`aztec`, `code_128`, `code_39`, `code_93`, `codabar`, `data_matrix`, `ean_13`, `ean_8`, `itf`, `pdf417`, `qr_code`, `upc_a`, `upc_e`) plus `unknown`, and states the API *"is available only in secure contexts (HTTPS)"* and works in Web Workers. — https://developer.mozilla.org/en-US/docs/Web/API/Barcode_Detection_API
- **[VERIFIED]** MDN explicitly flags cross-browser status: *"This feature is not Baseline because it does not work in some of the most widely-used browsers."* — https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector. **[INFERENCE]** In practice this means Safari (desktop and iOS) does not implement `BarcodeDetector` — this is the single most decision-relevant platform fact in this whole file for a PWA that must run on iPhone Safari (see §7).
- **[UNVERIFIED]** Neither Chrome's own doc nor MDN's fetched pages explicitly name "ML Kit" as the Android backing engine — Chrome's doc only says "Google Play Services are required." The ML-Kit-specifically claim is common industry knowledge/secondary-source consensus but was **not** found stated in those exact words in any primary doc fetched in this session. Treat "backed by ML Kit" as highly-likely-true-but-not-first-hand-confirmed.
- **[VERIFIED — by omission]** No fetched source (Chrome's doc, MDN's `detect()` reference, or MDN's API overview) mentions a confidence score or a "partial result" concept anywhere in the `BarcodeDetector` surface. The interface is binary: an image either yields a fully-formed `DetectedBarcode` (with a non-null `rawValue`) or the barcode does not appear in the returned array at all. **[INFERENCE]** This is a materially thinner API than ML Kit's own `enableAllPotentialBarcodes()` (§2.1) — the web platform API has no equivalent "detected-but-undecoded" signal exposed to JavaScript, even on Android where the underlying ML Kit engine can produce one natively.

---

## 3. Dynamsoft Barcode Reader JavaScript / Capture Vision

### 3.1 Architecture and the license-gated intermediate pipeline

- **[VERIFIED]** Dynamsoft explicitly frames its pipeline as multi-stage and inspectable: *"Apart from getting the results like barcode type, value, location, Dynamsoft Barcode Reader (DBR) also provides APIs for you to obtain the intermediate results like original image, transformed grayscale image, binarized image, text zone, and more."* The documented callback split includes `OnLocalizedBarcodesReceived` (zone/location data, pre-decode) as distinct from the final decoded-barcode result, and separate callbacks like `OnBinaryImageUnitReceived` for lower pipeline stages (original → grayscale → binarized → localized → decoded). — https://www.dynamsoft.com/barcode-reader/docs/core/programming/features/use-intermidiate-results.html
- **[VERIFIED]** Important licensing caveat found directly in that same doc: *"You will need a separate license to obtain the intermediate results."* **[INFERENCE]** Localization-without-decode introspection is a premium/gated capability in Dynamsoft's commercial model, not something exposed by the base SDK license.
- **[VERIFIED-SEC]** The `IntermediateResultReceiver` class (JS/Android editions) exposes typed callbacks for each pipeline unit, including a `CandidateBarcodeZonesUnit`/`CandidateBarcodeZone` concept for pre-localization candidate regions, in addition to localized- and recognized-text-line callbacks. Direct fetch of the class reference page was not completed in this session; this is drawn from consistent search-engine excerpts of Dynamsoft's own reference docs. — https://www.dynamsoft.com/capture-vision/docs/mobile/programming/android/api-reference/capture-vision-router/auxiliary-classes/intermediate-result-receiver.html and https://www.dynamsoft.com/capture-vision/docs/web/programming/javascript/api-reference/capture-vision-router/intermediate-result-manager.html

### 3.2 `LocalizedBarcodesUnit` and `BarcodeReaderTaskSettings` parameters

- **[VERIFIED]** `ExpectedBarcodesCount` (in `BarcodeReaderTaskSettings`): *"defines the number of barcodes expected to be detected."* Default is **0**. When 0: the engine *"detects at least one barcode"* and the search loop stops after the round that finds one. When N > 0: the loop *"detects N barcodes"* and terminates once that many are found; if fewer than N have been found the engine keeps exhausting configured localization/decode passes until timeout. Applies per page for multi-page documents. — https://www.dynamsoft.com/capture-vision/docs/core/parameters/reference/barcode-reader-task-settings/expected-barcodes-count.html
- **[VERIFIED-SEC]** `LocalizationModes` — *"determines how the Barcode Reader localizes barcodes, which is the process of finding the barcode zone from an image or frame."* It is an ordered array (array index = priority, lower index = higher priority) and the engine walks each mode in order until the expected count is reached or all modes are exhausted. Six named modes were found referenced: `LM_CONNECTED_BLOCKS`, `LM_STATISTICS`, `LM_LINES`, `LM_SCAN_DIRECTLY`, `LM_STATISTICS_MARKS`, `LM_STATISTICS_POSTAL_CODE`. Direct fetch of the reference page 404'd twice in this session (URL structure appears to have moved between Dynamsoft doc generations); the above is a search-engine excerpt. **Caution — conflicting secondary claims found:** one excerpt states the recommended default priority order is `LM_SCAN_DIRECTLY, LM_CONNECTED_BLOCKS, LM_LINES, LM_STATISTICS`, while another states *"`LM_CONNECTED_BLOCKS` offers the right balance between efficiency and accuracy for most scenarios... recommended to always set this mode as the highest priority."* These two secondary excerpts do not fully agree on ordering — re-verify against the live parameter reference before hard-coding an order. — https://www.dynamsoft.com/barcode-reader/parameters/reference/image-parameter/LocalizationModes.html
- **[VERIFIED-SEC]** `DeblurModes` — *"determines how to decode the localized barcode zone, which is the last stage of the barcode decoding algorithm... the more DeblurModes you enable, the higher the possibility that the barcode zone is decoded although it could incur a higher time cost."* Not independently re-fetched; consistent search excerpt. — https://www.dynamsoft.com/barcode-reader/docs/core/performance/speed.html
- **[VERIFIED-SEC]** `ScaleUpModes` — *"determines the process for scaling up an image used for detecting barcodes with small module size"*, with `ModuleSizeThreshold`, `AcuteAngleWithXThreshold`, `TargetModuleSize` arguments (since SDK v7.3). — https://www.dynamsoft.com/barcode-reader/docs/core/parameters/reference/scale-up-modes.html
- **[VERIFIED-SEC]** `BarcodeComplementModes` — *"determines how to complement the missing parts of a barcode"*, specifically for QR Code and DataMatrix, enabled under `PublicRuntimeSettings → FurtherModes → BarcodeComplementModes`. — https://www.dynamsoft.com/barcode-reader/docs/core/parameters/reference/barcode-complement-modes.html

### 3.3 Partial-barcode naming — could not verify as specified

- **[UNVERIFIED]** The task asked to verify exact names such as `"PartialBarcodeText"` or `"IsPartialResult"`. Targeted searches for both exact strings returned **no matches** anywhere in Dynamsoft's current documentation, GitHub samples, or npm package type definitions. Dynamsoft's actual mechanism for incomplete/damaged codes appears to be `BarcodeComplementModes` (§3.2, for QR/DataMatrix missing-part reconstruction) and `DeformationResistingModes` (named once in a search result, not independently confirmed) — not a property literally named `PartialBarcodeText` or `IsPartialResult`. **Do not use either of those two names in an implementation without checking the live SDK typings first** — they may be deprecated, renamed, or never-existed terms (possibly conflated from a different vendor).

### 3.4 Multi-frame confirmation: `MultiFrameResultCrossFilter`

- **[VERIFIED-SEC]** *"MultiFrameResultCrossFilter is a utility filter that can be used to enable result deduplication and cross-verification"* (requires the separate `dynamsoft-utility` package). `enableResultCrossVerification()` — *"designed to cross-validate the outcomes across various frames in a video streaming scenario, enhancing the reliability of the final results... particularly crucial for barcodes with limited error correction capabilities, such as 1D codes."* `enableResultDeduplication()` — *"designed to prevent high usage in video streaming scenarios, addressing the repetitive processing of the same text line within a short period of time"*; default forget-window is **3 seconds**, configurable via `setDuplicateForgetTime(ms)` (example given: `setDuplicateForgetTime(5000)`). `enableLatestOverlapping()` is also referenced as a to-the-latest-overlapping toggle. Usage pattern: `const filter = new Dynamsoft.Utility.MultiFrameResultCrossFilter(); router.addResultFilter(filter);`. Not independently re-fetched from the class reference page itself in this session; drawn from consistent excerpts across two separate searches of Dynamsoft's own docs/npm pages. — https://www.dynamsoft.com/barcode-reader/docs/web/programming/javascript/api-reference/ and https://www.npmjs.com/package/dynamsoft-barcode-reader/v/10.0.21

### 3.5 Camera Enhancer features (auto-zoom, focus, frame filtering)

- **[VERIFIED]** The `EnhancedFeatures` enum ships five toggleable capabilities, combinable via bitmask (`EF_ALL` / `EnhancedFeatureAll`):
  - **Frame Filter** — *"the frame sharpness filter feature of DCE. By enabling this feature, the low-quality frame will be recognized and discarded automatically."*
  - **Sensor Control** — *"the sensor filter feature of DCE. By enabling this feature, the frames will be discarded automatically while the device is shaking."*
  - **Enhanced Focus** — *"DCE will support the camera in triggering auto-focus."*
  - **Auto Zoom** — *"the auto-zoom feature of DCE. By enabling this feature, the camera will automatically zoom in to the interest area."*
  - **Smart Torch** — *"Add a smart torch on the UI. The torch will be hided when the environment brightness is high and displayed when the brightness is low."*
  — https://www.dynamsoft.com/camera-enhancer/docs/core/enums/enhanced-features.html
- **[VERIFIED-SEC]** Elaboration on Auto Zoom found elsewhere: *"When a barcode area is found but failed to be decoded, DCE enables the camera to zoom in to the barcode area automatically, and once the barcode is decoded successfully, the zoom factor will be restored to the default value."* — same trigger logic as ML Kit's `ZoomSuggestionOptions` (§2.2): localize-but-fail-to-decode → zoom → retry → revert.

### 3.6 Published performance numbers

- **[VENDOR CLAIM]** From Dynamsoft's own comparison benchmarks (self-published, not independently re-fetched — found via search of dynamsoft.com/codepool): 1D barcode reading speed *"increased by 40+ percent"* between SDK v4.2 and v4.3; on a 1D public-dataset benchmark, Dynamsoft reports 100% read rate on an in-focus set and 91.95% on a 2,000-image "DEAL Lab" set with "zero misreads" across 3,484 images; for PDF417, *"Dynamsoft Barcode Reader achieves 95.45% reading accuracy on real-world PDF417 images — 34 percentage points higher than the next-best SDK (Google ML Kit at 61.36%)"*; a competing open-source decoder (ZXing-cpp) is reported faster in raw per-image milliseconds (127.56 ms for 1D, 3.6 ms for Data Matrix) but at roughly half Dynamsoft's accuracy. — https://www.dynamsoft.com/codepool/barcode-scanning-accuracy-benchmark-and-comparison.html, https://www.dynamsoft.com/codepool/pdf417-reading-benchmark-and-comparison.html
- **[INFERENCE]** Treat all of §3.6 as a vendor self-benchmark: methodology, dataset selection, and competitor SDK version/configuration are controlled by Dynamsoft. Directionally useful (accuracy-vs-speed tradeoff is real and matches the general shape of every other vendor's marketing in this file) but not a substitute for testing your own product photography.

---

## 4. Scandit Data Capture SDK for Web

### 4.1 Architecture: `BarcodeCapture` vs. `BarcodeBatch`/MatrixScan

- **[VERIFIED]** MatrixScan's own doc: *"MatrixScan enables you to build applications and workflows involving highlighting and/or interacting with multiple barcodes within the same frame"* and *"MatrixScan is powered by the `BarcodeBatch` functionality of the Scandit Smart Data Capture SDK."* MatrixScan explicitly does **not** support DotCode, MaxiCode, or postal-code symbologies (KIX, RM4SCC). — https://docs.scandit.com/7.6.8/sdks/web/matrixscan/intro/
- **[INFERENCE]** This is the same architectural split as every other vendor in this file: a single-best-result capture mode (`BarcodeCapture`, analogous to ML Kit's default scanner or a plain `BarcodeDetector.detect()` call) versus a multi-object *tracking* mode (`BarcodeBatch`/MatrixScan, analogous to Apple's `recognizedItems` stream or Dynamsoft's tracked localized-zone units) that assigns persistent identity to each detected code across frames so the UI can highlight many at once instead of decoding-and-forgetting one at a time.

### 4.2 SparkScan — the "floating trigger" UX pattern

- **[VERIFIED]** *"SparkScan is our pre-built smartphone scanning interface designed for high-performance barcode scanning"* that *"fits on top of any smartphone application, providing an intuitive user interface."* Two core UI elements: a compact camera preview that *"helps with aiming and shows scan feedback. When not in use, the camera preview is hidden"*, and a *"large-sized, semi-transparent floating button that users can drag to position it in the most ergonomic position"* whose *"position... is remembered across sessions."* Scandit states the interaction model *"was carefully designed as a result of extensive user testing and customer feedback from the field"* and is *"intentionally minimalistic, meant to be overlayed on any application without the need to adapt the existing app."* — https://docs.scandit.com/next/sdks/web/sparkscan/intro/
- **[INFERENCE]** SparkScan deliberately inverts the usual "full-screen always-on camera" scanning UX: the camera view is normally hidden and only appears on demand, which is a meaningfully different UX bet than DataScannerViewController/MatrixScan's persistent live-preview model — optimized for rapid, repeated single-item scans (retail/warehouse) rather than exploratory multi-item recognition.

### 4.3 Viewfinder types and Scan Area

- **[VERIFIED-SEC]** Two named viewfinder styles are documented per-platform (Android/iOS/Flutter/Web all mirror the same API shape): **Laserline Viewfinder** — described as *"a horizontal laser line with a Scandit logo underneath"*; **Aimer Viewfinder** — *"aimer viewfinder with an embedded Scandit logo,"* stated as *"the recommended viewfinder when using RadiusLocationSelection."* Best-practice guidance: *"Together with a restricted scan area, to give the user an indication of where he should scan, you can use a specific viewfinder instead of the standard Rectangular viewfinder used by default."* — https://docs.scandit.com/data-capture-sdk/web/core/api/laserline-viewfinder.html and sibling aimer-viewfinder pages (search-derived excerpts; not independently re-fetched this session).
- **[VERIFIED]** Scan Area / performance framing, from Scandit's own blog: restricting the active scan region *"helps capture barcodes in cluttered environments, and improves performance as less information needs to be processed."* — https://www.scandit.com/blog/make-barcode-scanner-app-performant/ (published 2024-12-23 — within the requested window).

### 4.4 AI-powered scanning: Smart Scan Intention and blur/OCR fallback

- **[VERIFIED]** Blur/damage handling: *"advanced computer vision techniques"* plus *"sophisticated image processing, error correction algorithms, and pattern reconstruction."* When barcode decoding outright fails, the SDK *"automatically"* falls back to OCR text recognition for a defined set of symbologies (Code128, Code39, Codabar, EAN13/UPCA): *"The transition is automatic and requires no user intervention."* — https://docs.scandit.com/sdks/web/ai-powered-barcode-scanning/
- **[VERIFIED]** Intent detection is a first-class, named, *default-on* setting: *"Intent anticipation is controlled by the `scanIntention` property, which defaults to `ScanIntention.SMARTSELECTION`"* (as of SDK 8.1+); setting it to `ScanIntention.MANUAL` disables the behavior. Mechanism as documented: the SDK *"analyzes device movement, and aiming behavior in real-time"* to determine *"which barcode the user is trying to scan and ignores unintended codes."* A related *"Smart Duplicate Filter"* is described as using *"AI algorithms to analyze user behavior and intent in real-time."* — same source.
- **[VENDOR CLAIM]** Marketing-level benefit statements layered on top of the above (not independently measurable from the doc): *"reduces unwanted scans by up to 100%"*; maintains accuracy *"even with fast, imprecise movements"*; lets a user *"scan duplicate items back-to-back without delays."* — https://docs.scandit.com/sdks/web/ai-powered-barcode-scanning/ and https://www.scandit.com/blog/make-barcode-scanner-app-performant/

### 4.5 Feedback channels (sound / vibration / highlight)

- **[VERIFIED]** `BarcodeCaptureFeedback.defaultFeedback()` ships with *"default beep sound is loaded"*, *"beeping for the success event is enabled"*, and *"vibration for the success event is enabled."* The class (as documented on the Android reference, which mirrors the shared Data Capture SDK API surface across platforms including Web) *"only allows to configure the feedback that gets emitted when a barcode is read successfully"* — i.e. failure feedback is a separate concern. — https://docs.scandit.com/data-capture-sdk/android/barcode-capture/api/barcode-capture-feedback.html
- **[VERIFIED-SEC]** Highlighting uses a `Brush` object — *"the color of the solid shape laid over the barcode to indicate that it was rejected"* (a custom `Brush` can also be returned per tracked barcode for accepted/rejected visual states). Batch/tracking mode (`BarcodeBatch`) does **not** emit sound/vibration feedback automatically the way single-shot `BarcodeCapture` does — an app must implement its own listener to replicate that experience for tracked multi-object scanning. — search-derived excerpt of the Scandit feedback docs, not independently re-fetched.
- **[VERIFIED-SEC]** Additional performance figures found via search (not independently re-fetched, treat as vendor-published but lower-confidence sourcing): *"decode speeds of 480 scans per minute"*, accuracy *">99%... with zero false positives for all major barcode types"*, default success-vibration duration *"300 milliseconds."* — https://www.scandit.com/resources/guides/barcode-scanning-product-brochure/ (marketing brochure — **[VENDOR CLAIM]**, not a technical spec page).

### 4.6 General performance/tuning guidance (Scandit's own blog, Dec 2024)

- **[VERIFIED]** Scandit frames barcode capture as six discrete UX steps: *"locate, align, focus, capture, feedback, view results."* Default duplicate-filter interval stated as *"1000 ms."* Tuning advice: restrict active symbologies (*"Limiting the active symbologies to only those needed by your users reduces application overhead"*); restrict the scan area (§4.3); manage camera lifecycle (*"keep a hidden and paused scanner instance in the background with the camera in a standby state"*, *"Ensure the camera is on only when needed"* for battery). — https://www.scandit.com/blog/make-barcode-scanner-app-performant/
- **[VERIFIED]** OCR-fallback timing is configurable: OCR fallback triggers *"after 1 second of unsuccessful decoding while remaining stationary"*, customizable via an `ocr_fallback_smart_stationary_timeout` engine property (value in ms). — found in the same performance-guide material.

---

## 5. Other web SDKs (one paragraph each, verified facts only)

**STRICH** — **[VERIFIED]** A JavaScript SDK described as *"a JavaScript SDK for real-time, 1D/2D barcode scanning in the web browser,"* built on *"WebAssembly and WebGL for speed and compatibility,"* shipped as a *"single file with TypeScript bindings"* with *"zero dependencies,"* doing all processing on-device (*"All image processing happens on the device, in real-time"*). It ships a built-in scanning UI (*"a targeting overlay, camera selector, flashlight, tap-to-focus, etc."*) and a "Popup Scanner" integration mode, and documents explicit handling for *"Faded or Damaged prints,"* *"Uneven Illumination,"* and *"Inverted Codes."* — **[VENDOR CLAIM]** Current self-service pricing (fetched live, 2026-09-03) is tiered: Basic €99/month for 10k scans, Professional €249/month for 100k scans, Business from €4,000/year (unlimited scans, custom branding, offline license checking), and custom Enterprise terms. A separate, likely-stale third-party listing (G2) showed different, dollar-denominated tiers ($99/$249/$5,000) — **[UNVERIFIED]** which figures are current; use the vendor's own live pricing page as the source of truth. — https://strich.io/

**barKoder** — **[VERIFIED]** The Web SDK is *"made utilizing the Web Assembly technology"* and supports *"all major browsers (Chrome, Firefox, Safari, Opera)."* It documents multiple scanning "templates" (All Barcodes, PDF417-optimized, QR-only, Retail 1D, Industrial 1D, 2D-only, DPM DataMatrix, VIN-optimized, DotCode, Custom) and a batch multi-scan mode, plus named proprietary algorithms — DeBlur Mode, MatrixSight®, PDF417-LineSight®, Segment Decoding®, and DPM tuning — without further technical detail on any of them in the fetched page. — https://barkoder.com/barcode-scanner-sdk/platforms/wasm. **[VERIFIED-SEC]** Published pricing found via secondary listings (not the vendor's own pricing page): *"starts at $1,250/yearly/50 devices/per app,"* subscription-based, split into Enterprise vs. Consumer licensing tiers.

**Anyline** — **[VERIFIED]** The Web SDK is imported as an ES module (`import { init } from '@anyline/anyline-js'`) and is configured declaratively: `barcodeFormats` (e.g. `QR_CODE`, `EAN_13`, `CODE_128`, `EAN_8`, `UPC_A`, `PDF417`), `multiBarcode` (single vs. multi-code scanning), `fastProcessMode` (an AI-enhanced detection mode that trades color for grayscale frames and is incompatible with "Composite Scanning"), and `consecutiveEqualResultFilter` for duplicate suppression. It ships presets including AAMVA-aware driver's-license PDF417 parsing (`barcode_pdf417_parsed`). — https://documentation.anyline.com/web-sdk-component/latest/barcode.html. **[UNVERIFIED]** No viewfinder/cutout UI customization details were present in the fetched page. **[VENDOR CLAIM]** Pricing is not public — Anyline states packages are *"on the basis of annual licenses"* with individually tailored quotes.

**Cognex** — **[VERIFIED-SEC]** Cognex's documentation portal (`cmbdn.cognex.com`) failed to resolve via DNS twice in this session, and the fallback `support.cognex.com` page rate-limited (HTTP 429); the following is a search-engine excerpt of Cognex's own docs, not a first-hand fetch this session. The Cognex Mobile Barcode SDK for Web (**cmbWEB**), built on the same DataMan/Manatee Works lineage as Cognex's native mobile SDKs, is described as leveraging *"the multimedia features of HTML5, CSS3, and Web Browser/HTML5 (WASM)"* to run in *"Firefox, Chrome, Safari, and Microsoft Edge — on mobile devices and desktop systems alike,"* explicitly *"for web development including mobile and desktop browsers, and progressive web apps."* It claims support for 35+ symbologies. Licensing is commercial; specific price points were not found.

**Zebra** — **[VERIFIED]** Zebra's barcode JavaScript API lives inside **Enterprise Browser**, a proprietary browser shell, not a general web SDK: *"Android, Windows CE, Windows Mobile, Zebra devices only"* is stated repeatedly across its API docs, integration requires copying a vendor `ebapi-modules.js` file into the app (not an npm/CDN package), and functionality is bound to Zebra/Symbol scan-engine hardware (named models RS507, RS6000, RS4000, VC70) via Zebra's EMDK. — https://techdocs.zebra.com/enterprise-browser/latest/api/barcode/. **[INFERENCE]** This is categorically out of scope for a generic iPhone Safari / Android Chrome PWA — it only runs inside Zebra's own enterprise-device software stack.

**Honeywell SwiftDecoder (Mobile)** — **[VERIFIED-SEC]** Both the primary product page (redirect-looped between `sps.honeywell.com` and `automation.honeywell.com` without resolving in this session) and the linked datasheet PDF (fetched, but contained only embedded branding/image metadata, no extractable body text) could not be directly confirmed this session. Via search-engine excerpts of Honeywell's own materials: SwiftDecoder is pitched as a *"lightweight, device agnostic"* decode engine with *"true 360° omni-directionality"* and defect-correction claims, built on *"proven core technology that has been deployed in Honeywell barcode scanners... for more than 40 years,"* with a platform list that (per one search excerpt) includes *"iOS, Android, Universal Windows Platform, Windows, Linux, Cordova, Xamarin, React Native, JavaScript and more."* **[UNVERIFIED]** No architectural detail (WASM? which "JavaScript" runtime/browser target?) could be confirmed for the web/JavaScript claim — treat the existence of a genuine browser-based SwiftDecoder offering as unconfirmed pending a direct doc read.

**Microblink** — **[VERIFIED]** Microblink's core product (BlinkID) is an identity-document scanner, not a general retail-barcode SDK; barcode reading (e.g., PDF417 on driver's licenses) is one input modality within it. Its SDK family spans *"web (TypeScript), Android (Kotlin), iOS (Swift), as well as ... React Native and Flutter,"* with processing on-device: *"All extraction happens locally; no data from the document leaves the device."* — https://docs.microblink.com/blinkid. **[VERIFIED-SEC]** The web edition specifically requires self-hosting WebAssembly binaries (*"serve the WebAssembly binary under /resources"*), confirming a WASM-in-browser architecture like the other web SDKs in this file, and documents an `allowBarcodeScanOnly` setting (barcode recognition proceeds even if VIZ/MRZ extraction fails) — this specific setting was found via search excerpt only, not re-confirmed by direct fetch (the exact sub-page 404'd).

---

## 6. UX mechanics synthesis — the recurring pattern

**(a) Detection/localization decoupled from decoding**
- **[VERIFIED]** ML Kit: `enableAllPotentialBarcodes()` returns a `Barcode` with real `boundingBox` and `rawValue == null` (§2.1).
- **[VERIFIED]** Dynamsoft: `IntermediateResultReceiver`'s `OnLocalizedBarcodesReceived` is a distinct, separately-licensed callback from final decoded results (§3.1).
- **[INFERENCE]** Apple does not narrate this split explicitly, but `RecognizedItem`'s stable `id` + per-frame `bounds` update independent of the underlying recognition re-running is the same structural idea (§1.3).
- **[VERIFIED — by omission]** The one place this pattern is conspicuously *absent* is the web-native `BarcodeDetector`: it has no "localized but undecoded" return shape at all (§2.6) — the browser-native API is strictly binary.

**(b) Tracked highlight persisting across frames**
- **[VERIFIED]** Apple's `didAdd`/`didUpdate`/`didRemove` delegate triple, keyed by `RecognizedItem.id`, is a direct, literal implementation of this (§1.3).
- **[VERIFIED]** Scandit's `BarcodeBatch`/MatrixScan is explicitly a multi-object tracking mode layered on top of single-shot `BarcodeCapture` (§4.1); tracked items get their own `Brush` per identity (§4.5).
- **[VERIFIED-SEC]** Dynamsoft's candidate-zone and localized-barcode units serve the same tracking-before-confirming role (§3.1-3.2).

**(c) Explicit "too far / zoom" guidance**
- **[VERIFIED]** ML Kit's auto-zoom triggers specifically when *"all barcodes within the view are too distant for decoding"* (§2.2); Dynamsoft Camera Enhancer's Auto Zoom triggers when *"a barcode area is found but failed to be decoded"* (§3.5). Both are the identical trigger condition — localized-but-undecoded — independently implemented.
- **[VERIFIED]** Apple's `qualityLevel` (Fast/Balanced/Accurate) is a related but different mechanism: a static pre-configured resolution/accuracy tradeoff rather than a dynamic zoom reaction (§1.2).
- **[UNVERIFIED]** Exact on-screen guidance copy for any vendor's "move closer" moment was not captured verbatim from any fetched source except the general existence of guidance labels (Apple, §1.4) — none of the vendors' docs quote the literal string shown to end users.

**(d) Aimer/ROI to restrict compute**
- **[VERIFIED]** Apple's `regionOfInterest` (§1.2), Apple's older `AVCaptureMetadataOutput.rectOfInterest` (§1.5), Scandit's Scan Area + Aimer/Laserline viewfinders (§4.3), and Scandit's own stated rationale — *"improves performance as less information needs to be processed"* — all converge on the same idea: a restricted region is simultaneously a UX affordance (tells the user where to point) and a compute optimization (less image area to run detection on).

**(e) Duplicate filtering and multi-frame confirmation**
- **[VERIFIED]** Dynamsoft's `MultiFrameResultCrossFilter` names this precisely: `enableResultCrossVerification()` for cross-frame agreement (explicitly called out as *"crucial for barcodes with limited error correction capabilities, such as 1D codes"*) and `enableResultDeduplication()` with a 3-second default forget-window (§3.4).
- **[VERIFIED]** Scandit's default duplicate-filter interval is 1000 ms (§4.6), and its "Smart Duplicate Filter" adds intent-based suppression on top of pure time-windowing (§4.5).
- **[VERIFIED]** Anyline's `consecutiveEqualResultFilter` is the same concept under a third name (§5).
- **[INFERENCE]** Every commercial vendor treats "decoded once ≠ confirmed" as a first-class problem; only Apple's platform API (DataScannerViewController) does not document an equivalent explicit cross-frame-confirmation knob — its tracking model relies on stable item identity rather than a value-based dedup window.

**(f) Feedback channels (visual/haptic/sound)**
- **[VERIFIED]** Scandit ships default beep + vibration on success, configurable per-instance, with a `Brush` for visual rejection/acceptance state, and explicitly less automatic feedback in batch/tracking mode than in single-shot mode (§4.5).
- **[INFERENCE]** Apple and Google leave sound/haptics entirely to the calling app (no fetched doc for either shows a built-in beep/vibrate default) — this is the clearest "the platform gives you the model, the commercial SDK gives you the finished experience" contrast found in this research.

**(g) Time-to-first-highlight vs. time-to-decode**
- **[VENDOR CLAIM]** Scandit claims *"480 scans per minute"* throughput (~125 ms per scan cycle) and >99% accuracy (§4.5) — a throughput number, not a first-highlight-vs-decode latency split.
- **[VENDOR CLAIM]** STRICH's own testimonial copy claims the barcode *"never fully makes it into the frame before it's already decoded"* on a high-end iPhone — anecdotal, not a measured figure (§5).
- **[INFERENCE]** No vendor in this research publishes an explicit millisecond breakdown between "time to first localized highlight" and "time to confirmed decode." Given that every vendor architecturally separates these two stages (a) and gates zoom/guidance UX on the gap between them (c), it is reasonable to infer the localization step is deliberately kept cheap (tens of ms, single-pass, coarse) so a highlight can render essentially every frame, while decode is the more expensive, retry-able step that may take multiple frames — but this specific latency split is inference, not a documented number, in every source checked here.

---

## 7. PWA availability matrix — Safari iOS / Chrome Android vs. native-only

| Capability | iPhone Safari (PWA) | Android Chrome (PWA) | Native-only? |
|---|---|---|---|
| Apple VisionKit `DataScannerViewController`, Vision `VNDetectBarcodesRequest`, `AVCaptureMetadataOutput` | **[VERIFIED]** Not available. These are Swift/UIKit APIs (iOS 16+, Neural Engine device); there is no web binding. A Safari PWA can only reach the camera via `getUserMedia`/WebRTC, never VisionKit. | N/A (Apple-only frameworks) | **Yes — 100% native-only.** |
| Google ML Kit Barcode Scanning (bundled/unbundled), `ZoomSuggestionOptions`, `enableAllPotentialBarcodes()` | Not available (Android/iOS-native ML Kit SDK, not a web API; ML Kit does ship an iOS SDK but it is a native framework, not reachable from Safari web content). | Not available *to a Chrome tab/PWA* — ML Kit here is the **native Android SDK** consumed by installed apps via Gradle, not exposed to web pages. | **Yes for the web surface** — [INFERENCE] a PWA cannot call ML Kit directly; only Chrome's own `BarcodeDetector` (next row) exposes a related-but-thinner capability to web content on Android. |
| Google Code Scanner (`GmsBarcodeScanning`) | Not available. | Not available to web content — it's a native Android Play-services API for installed apps, explicitly documented "Android only" at the native-app level (§2.5), not a browser API. | **Yes — native Android app only**, not even reachable generally from a Chrome PWA context per fetched docs. |
| `BarcodeDetector` (Shape Detection API) | **[VERIFIED]** **Not supported.** MDN: *"not Baseline because it does not work in some of the most widely-used browsers"* (§2.6) — WebKit/Safari has not shipped this API. | **[VERIFIED]** Supported, per Chrome's own doc, contingent on Google Play Services being present on the device (§2.6) — exposes `boundingBox`, `cornerPoints`, `format`, `rawValue`; **no** confidence score, **no** partial/undecoded-result concept exposed to JS. | **No** on Android Chrome (it is a bona fide web API there) — **effectively yes** on iOS, because Safari's non-support forces a fallback to a JS/WASM decoder for any cross-platform PWA. |
| Dynamsoft Barcode Reader JS / Capture Vision, Scandit Web SDK, STRICH, barKoder Web, Cognex cmbWEB, Anyline Web SDK, Microblink BlinkID Web SDK | **[VERIFIED]** Available — all are WASM-based, run inside any modern browser engine via `getUserMedia`/Canvas/OffscreenCanvas, explicitly listing Safari (desktop and, by extension, iOS WebKit) as supported (barKoder and Cognex name Safari explicitly; STRICH, Anyline and Microblink state general modern-browser/WASM support). | **[VERIFIED]** Available on the same basis. | **No — these are the PWA-compatible commercial tier**, precisely because each vendor built its own decode engine in WASM instead of depending on either platform's native ML stack. |
| Zebra Enterprise Browser barcode API | Not available. | Not available in a standard Chrome tab. | **Yes — fully native-only**, and further restricted to Zebra-branded hardware running Zebra's proprietary Enterprise Browser (§5). |
| Honeywell SwiftDecoder (Mobile) | **[UNVERIFIED]** — a "JavaScript" platform target is claimed in secondary sources (§5) but no architecture could be confirmed; do not assume browser/PWA availability without a direct doc check. | Same — unverified. | Unclear from available evidence. |

**[INFERENCE] — the load-bearing conclusion for the architecture decision:** the platform-native "best" scanning experiences (Apple VisionKit's tracked live highlighting with guidance/pinch-zoom, Google ML Kit's detected-but-undecoded geometry + auto-zoom suggestion, Google Code Scanner's no-permission turnkey flow) are **entirely unavailable to a mobile-web PWA on either OS**. The only thing a Safari-iOS-compatible PWA can use natively is the browser's own camera stream; even Android Chrome's one native assist (`BarcodeDetector`) is markedly thinner than ML Kit proper (no confidence, no partial-result signal) and doesn't exist at all on iOS. This is exactly the gap that Dynamsoft, Scandit, STRICH, barKoder, Cognex, Anyline and (for ID documents) Microblink are commercially built to fill — every one of them re-implements, in WASM, the same UX mechanics documented in §6 (localization/decode split, tracked highlighting, zoom guidance, duplicate filtering, feedback) that the OS vendors give away for free to native apps but not to browsers.

---

## Sources

Apple:
- https://developer.apple.com/documentation/visionkit/datascannerviewcontroller
- https://developer.apple.com/tutorials/data/documentation/visionkit/datascannerviewcontroller.json
- https://developer.apple.com/documentation/visionkit/datascannerviewcontroller/init(recognizeddatatypes:qualitylevel:recognizesmultipleitems:ishighframeratetrackingenabled:ispinchtozoomenabled:isguidanceenabled:ishighlightingenabled:)
- https://developer.apple.com/videos/play/wwdc2022/10025/ (WWDC22 session 10025, June 2022)
- https://developer.apple.com/documentation/vision/vndetectbarcodesrequest
- https://developer.apple.com/tutorials/data/documentation/vision/vndetectbarcodesrequest.json
- https://developer.apple.com/documentation/visionkit/recognizeditem
- https://developer.apple.com/tutorials/data/documentation/visionkit/recognizeditem.json
- https://developer.apple.com/tutorials/data/documentation/avfoundation/avcapturemetadataoutput.json

Google / Chrome / MDN:
- https://developers.google.com/android/reference/com/google/mlkit/vision/barcode/common/Barcode
- https://developers.google.com/ml-kit/vision/barcode-scanning/android
- https://developers.google.com/ml-kit/vision/barcode-scanning/code-scanner
- https://developers.google.com/android/reference/com/google/mlkit/vision/barcode/ZoomSuggestionOptions.Builder
- https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector
- https://developer.mozilla.org/en-US/docs/Web/API/Barcode_Detection_API
- https://developer.chrome.com/docs/capabilities/shape-detection (dated 2019-01-07)

Dynamsoft:
- https://www.dynamsoft.com/barcode-reader/docs/core/programming/features/use-intermidiate-results.html
- https://www.dynamsoft.com/camera-enhancer/docs/core/enums/enhanced-features.html
- https://www.dynamsoft.com/capture-vision/docs/core/parameters/reference/barcode-reader-task-settings/expected-barcodes-count.html

Scandit:
- https://docs.scandit.com/7.6.8/sdks/web/matrixscan/intro/
- https://docs.scandit.com/next/sdks/web/sparkscan/intro/
- https://docs.scandit.com/sdks/web/ai-powered-barcode-scanning/
- https://docs.scandit.com/data-capture-sdk/android/barcode-capture/api/barcode-capture-feedback.html
- https://www.scandit.com/blog/make-barcode-scanner-app-performant/ (published 2024-12-23)

Other vendors:
- https://strich.io/
- https://barkoder.com/barcode-scanner-sdk/platforms/wasm
- https://documentation.anyline.com/web-sdk-component/latest/barcode.html
- https://techdocs.zebra.com/enterprise-browser/latest/api/barcode/
- https://docs.microblink.com/blinkid

Attempted but not directly fetchable this session (facts drawn only from search-engine excerpts of these same pages, cited inline as [VERIFIED-SEC]/[UNVERIFIED] where used):
- https://www.dynamsoft.com/barcode-reader/parameters/reference/image-parameter/LocalizationModes.html (404)
- https://www.dynamsoft.com/barcode-reader/docs/core/performance/speed.html (search-only)
- https://www.dynamsoft.com/barcode-reader/docs/core/parameters/reference/scale-up-modes.html (search-only)
- https://www.dynamsoft.com/barcode-reader/docs/core/parameters/reference/barcode-complement-modes.html (search-only)
- https://www.dynamsoft.com/barcode-reader/docs/web/programming/javascript/api-reference/ (search-only, MultiFrameResultCrossFilter)
- https://cmbdn.cognex.com/knowledge/cognex-mobile-barcode-sdk-for-web (DNS failure)
- https://support.cognex.com/en/resources/software-firmware/cmbweb-v1-5-5/english/nSEB-e94SLmL4PxRMVVQSA (HTTP 429)
- https://automation.honeywell.com/content/dam/honeywell-edam/sps/ppr/en-us/public/software/common/documents/sps-honeywell-swiftdecoder-m-s-decoder-software-sdk-datasheet-000825-2-en.pdf (fetched, no extractable text — image-only PDF)
- https://sps.honeywell.com/us/en/products/sensing-and-iot/barcode-scan-engines-modules-and-decoding-software/swiftdecoder-barcode-decoding-software (redirect loop with automation.honeywell.com)
- https://docs.microblink.com/blinkid/sdk/web (404 in this session)
