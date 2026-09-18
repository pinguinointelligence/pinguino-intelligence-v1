# Forensic audit: existing product scanner

Checkout: `/Users/tomaszboro22/Developer/pinguino-scan-core-decision`, branch `staging`, commit `285f15ed`. Read-only (Read/Grep/Bash `cat`/`sed`/`grep`, plus two read-only `vitest run` invocations). No files modified.

Already established by the lead and taken as given (not re-derived): `barcodeScanline.ts` full-decode-or-null per-row EAN reader; `barcodeDecoder.ts` native→ponyfill(zxing-wasm 3.1.3, 1.09MB)→scanline chain whose `DetectedBarcodeLike` discards `boundingBox`/`cornerPoints`; `liveFrameSource.ts` rVFC/rAF pump; `frameQuality.ts` constants (`labelFill=0.72`, `acceptableForAutoCapture = score>=62 && sharpness>=0.35 && glare<=0.18`); `rollingBestFrame.ts` 700ms window. This report cites these again only where a new consequence is being drawn from them.

---

## 1. Entry points & UI

**There are two genuinely different scanners, and only one of them is "live" in the literal sense.**

### 1a. `LiveMultiScanner` — the only real `getUserMedia` camera loop in the app

- Mounted in `src/pages/home/HomeCreatorPage.tsx:40` (import), rendered fullscreen at lines 672-696: `<div className="fixed inset-0 z-50 bg-white"><LiveMultiScanner .../></div>`.
- Opened by the HOME creator's "Zeskanuj" affordance: `HomeCreatorPage.tsx:478` — `onScan={() => setScannerOpen(true)}` — wired into `src/features/home-creator/ui/HomeIntentSection.tsx:194` (`onClick={onScan}`), whose label is `homeCreatorCopy.intent.addByScan` = `'Zeskanuj'` (`src/features/home-creator/homeCreatorCopy.ts:182`).
- Confirmed by repo-wide grep: `navigator.mediaDevices.getUserMedia` appears **exactly once** in all of `src/` — `LiveMultiScanner.tsx:82-85`.

### 1b. `LiveProductScanner` — despite its name, NOT a live camera; a single-photo capture/upload form

- Mounted two ways:
  - Standalone route `/products/scan` → `ProductScannerV1Page` (`src/pages/products/ProductScannerV1Page.tsx:2,52`), registered `src/app/router.tsx:262`. Two legacy redirects to the same path exist (`router.tsx:247,265`), and a DEV-only `/products/scan/legacy` → `ProductScanPage` (`router.tsx:267`).
  - Inline inside the ingredient picker: `src/features/ingredient-builder/ProductPickerPopover.tsx:1074`, toggled by a "Skanuj produkt" / "Skanuj" icon button (`data-testid="product-picker-scan"`, lines 1013-1029) that flips a local `scanning` boolean — no navigation, rendered inline in the picker panel (lines 1073-1081), not fullscreen.
  - `ProductScannerV1Page.tsx:8-12` states the intended architecture explicitly: *"the scanning itself lives in `LiveProductScanner`, because the same session ... is what the recipe's „Dodaj składnik" opens. There is one scanner, entered from two places."* This is aspirational/naming continuity with `LiveMultiScanner`, not actual shared code — the two components share no controller, session, or camera logic.
- It never calls `getUserMedia`. Its "camera" is a native file input: `<input type="file" accept={PRODUCT_SCAN_ACCEPT} capture="environment" .../>` (`LiveProductScanner.tsx:540-551`), which opens the phone's native camera app for **one photo**, plus a multi-file gallery picker (`552-563`), drag-drop (`565-572`) and paste (`498-502`). This is the flow detailed in §7.

### What the user sees at mount (LiveMultiScanner)

`Phase` = `'starting' | 'scanning' | 'review' | 'deep' | 'no_camera'` (`LiveMultiScanner.tsx:44`). On mount: `'starting'` while `getUserMedia` resolves, then `'scanning'` (lines 59-128). The scanning view (`234-277`):

- Full-bleed black background, `<video>` `object-cover` (line 236).
- A cosmetic reticle: `absolute inset-8 rounded-3xl border-4`, `border-white/40` by default, `border-emerald-400` **only** while `flash` is set (lines 239-244). This box has **no connection to any decode ROI** — see §2/§8.
- A status region (`role="status" aria-live="polite"`, 246-260): shows `"Dodano: {flash}"` in a green pill when a product just confirmed; otherwise shows `hint ?? 'Przesuwaj telefon nad produktami.'` ("Move the phone over the products"). This literal string is the *entire* steady-state guidance vocabulary of the live scanner.
- Bottom bar (262-275): "Anuluj" / "Zebrane: N" (collected count) / "Koniec" (disabled while `session.accepted.length === 0`).
- `'no_camera'` phase (getUserMedia rejected, lines 86-89): plain apology — *"Nie mamy dostępu do aparatu."* / *"Włącz go w ustawieniach przeglądarki i spróbuj ponownie."* / "Wróć" button (183-194).

### Exact sequence of visible state changes

The controller's `onUpdate` callback (`LiveMultiScanner.tsx:106-119`) is the **only** place UI state reacts to recognition, and it only branches on 3 of the 6 `LiveScanEvent` kinds defined in `liveScanSession.ts:34-49`:

```
onUpdate: ({ event, state }) => {
  if (cancelled) return;
  setSession(state);
  if (event.kind === 'confirmed') {
    setFlash(event.product.label);
    setHint(null);
  } else if (event.kind === 'unresolved') {
    setFlash(null);
    setHint('Zapisaliśmy ten produkt — dokończysz go po skanowaniu.');
  } else if (event.kind === 'candidate') {
    setHint('Przytrzymaj chwilę.');
  }
},
```

- `'confirmed'` → emerald reticle + green "Dodano: {name}" pill, auto-cleared after 1400ms (`LiveMultiScanner.tsx:146-150`).
- `'unresolved'` → no color change at all; hint becomes "We saved this product — you'll finish it after scanning."
- `'candidate'` → hint becomes the **static** string "Przytrzymaj chwilę." (Hold still a moment) — even though `LiveScanEvent`'s `candidate` variant carries real progress numbers, `evidence: number` and `needed: number` (`liveScanSession.ts:40`), the handler never reads them. There is no "2 of 3" anywhere in the UI.
- `'searching'`, `'ignored_low_quality'`, `'duplicate_suppressed'` (`liveScanSession.ts:36,37,49`) are **not handled at all** — the `if/else if` chain falls through silently, leaving whatever hint was last set. A rejected-for-quality frame produces zero UI change.

### Bounding box / tracking / progress / directional guidance

None exist in the live loop. Specifically:

- No bounding box: `DetectedBarcodeLike` (`barcodeDecoder.ts:9-12`) is `{ rawValue: string; format?: string }` only — already established by the lead.
- No tracking highlight: the reticle above is fixed-position CSS, never repositioned or resized to a detected region.
- No progress indicator during scanning. The only progress UI in the whole feature — `PROGRESS_STEPS`, 5 named Polish stages — exists solely in `LiveProductScanner.tsx:82-88,604-625` (the static single-photo flow, §7), never in `LiveMultiScanner`.
- No directional guidance ("move closer", "turn the package", "hold steady", "too dark") anywhere in `LiveMultiScanner.tsx`. A fully-written vocabulary for exactly this — `unstable`/`blurred`/`glare`/`too_dark`/`no_text`/`settling` reasons with strings like *"Zmniejsz odblask na etykiecie."* (reduce glare) — exists in `src/features/product-scanner/liveCapture.ts:60-67`, but that module is **not imported by any production component** (§9/§10).

### What "green" requires

`observeFrame` (`liveScanSession.ts:214-282`) gates, in order: (1) `quality.acceptableForAutoCapture` (else `ignored_low_quality`, line 220-222); (2) a non-null `identityKey` (else `searching`, 224-227); (3) not already accepted this sweep (else `duplicate_suppressed`, 230-232, permanent for the whole sweep — `DUPLICATE_SUPPRESSION = 'for_the_whole_sweep'`, line 158); (4) "qualifies" — barcode-validated OR confidence ≥ `RECOGNITION_CONFIDENCE_FLOOR` 0.7 (lines 133,178-181); (5) enough timestamped evidence inside a 4000ms window (`EVIDENCE_WINDOW_MS`, line 146) — 1 for a validated barcode, 3 for weak recognition, 2 for confident (≥0.85) catalogue-confirmed recognition, or 1 if that confident recognition is text-corroborated (`evidenceRequired`, 189-206).

Then, decisively (lines 258-270, comment quoted verbatim):

```
// GREEN belongs to the catalogue, not to the decoder. An exact SKU resolution is the
// only thing that turns a reading into a product the customer can be shown.
...
const resolved = observation.catalogResolved === true;
const product: AcceptedProduct = {
  ...
  needsDeepScan: !resolved,
  acceptance: resolved ? 'confirmed' : 'needs_resolution',
};
```

A syntactically perfect, checksum-valid barcode read for a real product the catalogue doesn't yet carry **never turns green**, no matter how much evidence accumulates.

---

## 2. Frame pipeline

**`getUserMedia` constraints** (`LiveMultiScanner.tsx:82-85`) — the entire constraint object:

```js
navigator.mediaDevices.getUserMedia({
  video: { facingMode: { ideal: 'environment' } },
  audio: false,
});
```

No `width`/`height`/`frameRate` ideal/min/max. No `zoom`, `torch`, `focusMode`/`focusDistance`. Repo-wide grep across `src/features/product-scanner/*.ts(x)` for `torch|zoom|focusMode|ImageCapture|applyConstraints|getCapabilities` returns **zero hits**. There is no post-open `track.applyConstraints()`/`track.getCapabilities()` call anywhere. Whatever default resolution/lens/AF the browser+device combination picks for `facingMode: environment` is what the app gets, with no in-app way to zoom to fill the frame or light a torch in low light.

**Frame acquisition & resolution.** `createLiveFrameSource` (`liveFrameSource.ts`) drives the loop via `video.requestVideoFrameCallback` when present (line 28) else `requestAnimationFrame` (39-57); `LiveMultiScanner.tsx:125` constructs it with the default scheduler. Each tick calls `controller.onFrame()`. `createVideoFrameGrabber(video, maxWidth = 640)` (`liveScanController.ts:185-204`) draws the **whole** current video frame into a reused `<canvas>` downscaled to at most 640px wide (`scale = Math.min(1, maxWidth / width)`), then reads it back synchronously with `context.getImageData(...)`. No ROI/crop: the entire frame is drawn and read, not just the area inside the on-screen reticle.

**Main thread vs Worker.** Everything is main-thread. Grep for `new Worker|OffscreenCanvas|postMessage` inside `src/features/product-scanner/*` returns nothing. `getImageData`, the per-pixel quality scoring in `scoreRgbaFrame`, and all decode orchestration run synchronously on the page's JS thread. The only Worker anywhere near this feature is Tesseract.js's own internal one (`Tesseract.createWorker`, `src/features/ocr-intake/ocrEngine.ts:214`), used solely once the OCR rung actually runs — not for capture/quality/decode.

**Per-frame processing order** (`LiveScanController.onFrame`, `liveScanController.ts:105-128`):
1. Bail if `!running || busy` (single-flight — see §5/§8).
2. Grab frame via the canvas grabber.
3. `scoreRgbaFrame` quality score.
4. Offer the frame to the 700ms `RollingBestFrameWindow` — this only picks a *reference/thumbnail image*, it does not gate recognition (`liveScanController.ts:113-122`).
5. Set `busy = true`, call `identify()` → `LiveRecognizer.observe()` (barcode attempt, then a fallback rung if no barcode).
6. Fold the resulting `ScanObservation` into `liveScanSession.observeFrame`.
7. Call `onUpdate`.
8. Clear `busy`.

**Throttles/intervals/constants:** `RollingBestFrameWindow` window = 700ms (`rollingBestFrame.ts:16`); frame downscale `maxWidth = 640` (`liveScanController.ts:187`); `VISION_MIN_INTERVAL_MS = 1_200`, `VISION_MAX_CALLS = 12`, `PRODUCTIVE_ROUTE_TTL_MS = 4_500`, `OCR_MIN_INTERVAL_MS = 1_500` (`liveRecognition.ts:82,84,91,99`); `EVIDENCE_WINDOW_MS = 4_000` (`liveScanSession.ts:146`). There is no explicit fps cap beyond the busy-gate — cadence is whatever `requestVideoFrameCallback`/`requestAnimationFrame` delivers.

**What makes visible feedback impossible until a decode + catalogue lookup completes.** As shown in §1, the only UI-affecting `LiveScanEvent`s (`confirmed`, `unresolved`, `candidate`) all require a non-null `identityKey`, which for the barcode route requires a completed **network** catalogue lookup (`resolveOnce` → `capabilities.resolveBarcode` → Supabase RPC `search_products_v1`, confirmed in `src/services/globalCatalog.ts:211` and `src/services/productScanner.ts:99-118`). Every frame short of that produces only `{ kind: 'searching' }` (`liveScanSession.ts:226`), which the UI does not render at all. The "live feedback" pipeline and the "network recognition" pipeline are literally the same pipeline; there is no cheaper, independent "I can see something" signal.

---

## 3. Barcode path

**Order of decoders per frame** (`AdaptiveBarcodeDecoder.decode()`, `barcodeDecoder.ts:132-149`): (1) whichever detector was chosen at decoder-construction time — native `window.BarcodeDetector` only if `nativeSupportsRetail()` confirms it supports all of `ean_13, ean_8, upc_a, upc_e` (lines 73-81,152-170), else the `barcode-detector` ponyfill; (2) if the active native detector throws, permanently switch to the ponyfill and retry once (`switchToFallback`, 122-130); (3) validate any returned candidates via checksum/format (`validateBarcode`); (4) if nothing validated — including after any exception — fall through to `decodeWithTertiaryReader(source)`, the homegrown scanline reader, **but only when `source instanceof HTMLCanvasElement`** (line 84).

### Confirmed dead-code / type-mismatch: the Safari fallback never runs in the live loop

Traced call chain for every live frame:

1. `createVideoFrameGrabber` returns `pixels: context.getImageData(...)` — an **`ImageData`** (`liveScanController.ts:200`).
2. `onFrame()` → `identify(pixels: ImageData, ...)` (`liveScanController.ts:130`).
3. → `recognizer.observe(source, ...)` with `source = pixels` (`liveRecognition.ts:277`).
4. → `capabilities.decodeBarcode(source)` (`liveScanCapabilities.ts:123-126`) → `decoder.decode(source)`.
5. `AdaptiveBarcodeDecoder.decode()`'s final line: `return validated ?? decodeWithTertiaryReader(source);` (`barcodeDecoder.ts:148`).
6. `decodeWithTertiaryReader` (`barcodeDecoder.ts:83-96`): `if (typeof HTMLCanvasElement === 'undefined' || !(source instanceof HTMLCanvasElement)) return null;` — **`ImageData` always fails this check**, so the function returns `null` immediately, never touching `decodeGtinFromRgba`.

Consequence: the scanline decoder — built explicitly, per its own header comment, to fix *"the owner's real defect ... an ABSENT recognizer [because] Safari does not implement [BarcodeDetector]"* (`barcodeScanline.ts:1-16`) — **never executes in the continuous live loop**. On Safari (or any device lacking native `BarcodeDetector`), live scanning depends entirely on the 1.09MB zxing-wasm ponyfill with **zero local fallback** if it fails on a given frame — exactly the scenario the scanline reader exists to rescue.

This is a narrow, local fix, not an architectural one: `decodeGtinFromRgba(pixels, width, height)` (`barcodeScanline.ts:268-274`) takes raw `Uint8ClampedArray|Uint8Array` + dimensions and needs no canvas at all — the canvas requirement lives only in the wrapper's type guard, not in the underlying pure function.

This gap is invisible to the existing test suite: `liveRecognition.test.ts:41` mocks the frame entirely (`const frame = {} as ImageData;`) against a **mocked** `RecognitionCapabilities.decodeBarcode`, and `barcodeDecoder.test.ts` never exercises the real decoder against an `ImageData` input (only mocked `.detect()` calls / canvases). None of the 338 passing tests would catch this.

### iOS Safari behaviour

`nativeBarcodeDetector()` (`barcodeDecoder.ts:43-52`) reads `globalThis.BarcodeDetector`; Safari does not implement it, so `native` is `null` and `createBarcodeDecoder` (152-182) goes straight to `loadSelfHostedPonyfill()`, paying the wasm warmup (`prepareZXingModule`) before the session's first decode, with the fallback above being dead weight for that session.

### Dedup / confirmation logic

Identity-scoped, not frame-scoped. `BARCODE_EVIDENCE_REQUIRED = 1` (`liveScanSession.ts:109`) — one validated+catalogue-resolved decode confirms immediately. Once accepted, an identity is suppressed **for the rest of the sweep** (`acceptedAt`, 230-232); only removing it from the review list re-enables scanning it (`LiveMultiScanner.remove()`, 152-159). `LiveRecognizer.resolveOnce()` (`liveRecognition.ts:259-269`) memoizes catalogue lookups per identity **including misses** (`null` cached), so an unrecognized code costs one network call for the whole time it's held in view, not one per frame — but see §6 for how this cache is lost on "Skanuj dalej."

### The catalogue gate, quoted

`src/services/productScanner.ts:99-118`:

```ts
export async function lookupExactBarcode(barcode: ValidBarcode): Promise<ScanExactProduct | null> {
  const lookups = barcodeLookupCandidates(barcode);
  const rows = (
    await Promise.all(
      lookups.map((query) =>
        searchProducts({ query, context: 'TOPPING', marketScope: 'global', limit: 20 }),
      ),
    )
  ).flat();
  const hit = rows.find((row) => row.eans.some((ean) => lookups.includes(ean)));
  if (!hit) return null;
  ...
}
```

This is a live Supabase RPC (`search_products_v1`) run per lookup candidate (usually 1-2, from `barcodeLookupCandidates`, `barcode.ts:66-73`), accepting only a row whose own `eans` list contains the value — an exact match inside a fuzzy product search's results, not a dedicated barcode index. A miss here is what routes an otherwise-perfect decode to `'needs_resolution'` (§1).

### `barcodeTiming.ts` and `barcodePerformance.test.ts`

`barcodeTiming.ts` (24 lines) is a pure percentile reducer — `summarizeBarcodeTimings(samples)` → `{count, p50, p95, max}`. It measures nothing itself; it only summarizes externally-supplied samples.

`barcodePerformance.test.ts` measures **only** the pure-JS scanline decoder (`decodeGtinFromLuminance`) against 30 **synthetic** fixtures: a perfectly rendered EAN-13 bit pattern for `5449000131805` drawn at varying scale/vertical offset (lines 47-63), asserting p50/p95/max stay under a 500ms "software target" (65-81). It does not exercise the native `BarcodeDetector` or the zxing-wasm ponyfill (the two decoders the live loop actually uses), and includes no capture time, autofocus settle, motion blur, compression artifacts, or network latency. It benchmarks a code path that (per above) never runs in the live camera loop at all.

### Test run

```
$ npx vitest run src/features/product-scanner/barcodeScanline.test.ts src/features/product-scanner/barcodePerformance.test.ts --reporter=dot
 Test Files  2 passed (2)
      Tests  12 passed (12)
   Duration  341ms
```

### `__fixtures__/real-product-scans/` — no real photos exist in the repo

The directory contains **only** `manifest.json` (no image files). Its 3 entries reference Polish-named screenshots (e.g. `"Zrzut ekranu 2026-08-20 o 09.51.12.png"`) and, for the Coca-Cola case, named views `front/barcode/nutrition/ingredients`, each marked `status: "owner_local_verified_not_committed"` or `"owner_device_frames_not_committed_structural_regression_committed"`. The manifest's own `note` field states verbatim:

> "Exact owner-provided images were visually reviewed from the owner's local Desktop and are intentionally not copied into the repository. Real-image E2E claims still require the staging runtime ledger and database evidence from an actual rerun."

So: **no real-device or real-photograph decode-rate evidence exists anywhere in this checkout.** `realProductRegression.test.ts` (913 lines, despite the name) tests `IntimportMapperAuthorityRow`/profile-proposal *data* validation, not photographs. `__live__/scannerOnePhotoStagingAcceptance.live.test.ts` (gated behind `SCANNER_STAGING_LIVE=1`) is a real Supabase network test, but it exercises the downstream recipe/production/persistence pipeline for an already-saved fixture product — not the camera or decode path. Every one of the 338 passing scanner tests runs against synthetic bitmaps, mocked capabilities, or hand-authored JSON.

---

## 4. Quality / best-frame gating

`scoreRgbaFrame` (`frameQuality.ts:12-73`): `exposure` = fraction of pixels with luminance in [0.16, 0.92] (line 39,57); `glare` = fraction of pixels with luminance > 0.96 (38,58); `sharpness` = mean absolute Laplacian over a strided sample, ×5, clamped to [0,1] (41-59); `labelFill` = **hardcoded literal `0.72`** regardless of actual frame content (line 61 — comment says "the capture guide occupies roughly the central 72% of the preview," but nothing crops to or measures that region); `score = round(clamp01(exposure*0.35 + sharpness*0.45 + (1-glare)*0.15 + labelFill*0.05) * 100)` (62-64); `acceptableForAutoCapture = score>=62 && sharpness>=0.35 && glare<=0.18` (71).

This single boolean gates **two different jobs**:

1. **Whether recognition is attempted at all.** `nextRecognitionAttempt` (`liveRecognition.ts:128-132`) returns `'NONE'` (no decode attempt, of any kind) when `!quality.acceptableForAutoCapture` — checked *before* `observeFrame` even runs.
2. **Whether a frame can become the stored reference/thumbnail image.** `RollingBestFrameWindow.offer()` (`rollingBestFrame.ts:18-22`) only lets a frame become `best` if `candidate.readable` (i.e., the same `acceptableForAutoCapture`), across a 700ms window (`windowMs = 700`, line 16); `takeReady()` (24-29) matures the window and returns the best readable frame (or `null` if none was readable) purely for `LiveScanController` to store as a thumbnail (`liveScanController.ts:113-122,136-141) — this has no bearing on whether recognition ran.

Net effect: there is no separate, looser bar for "worth trying to decode" vs. a stricter bar for "good enough to keep as a reference image" — one threshold does both jobs, so a frame just under the bar (e.g. sharpness 0.34) is not decoded at all, regardless of whether a real barcode on it might still be legible to the decoder.

---

## 5. Recognition ladder & remote dependency

Ladder order (`liveRecognition.ts:14-26`): **LOCAL_BARCODE** (no network) → **CATALOG_MATCH** (network, Supabase RPC, memoized per identity) → **LOCAL_OCR** (no network, heavy CPU, packaging only) → **VISION_FALLBACK** (network, throttled + capped).

Constants: `VISION_MIN_INTERVAL_MS = 1_200` (line 82), `VISION_MAX_CALLS = 12` (84), `PRODUCTIVE_ROUTE_TTL_MS = 4_500` (91), `OCR_MIN_INTERVAL_MS = 1_500` (99).

**Which rungs touch the network, and how often.** Barcode decode itself is fully local. The catalogue resolution that follows any decode/OCR/vision guess is a live Supabase RPC (`search_products_v1`), memoized per identity (`resolveOnce`, `liveRecognition.ts:259-269`) — but the *first* hit for any new code/name/guess is a blocking round trip. `VISION_FALLBACK` is a genuine multi-hop chain: client JPEG-encodes the frame (`encodeFrameBase64`, quality 0.8, `liveScanCapabilities.ts:30-40`) → POST to Supabase Edge Function `product-identify-live` → which itself calls `https://api.openai.com/v1/responses` with model `gpt-5.6-luna` (`supabase/functions/product-identify-live/index.ts:32,249-272`) → then calls `search_products_v1` **again, server-side** to resolve the model's guess (159-183,303) → response flows back. This whole chain runs at most once per 1200ms, capped at 12 calls per sweep.

**`product-identify-live` requires authentication.** `index.ts:135-136`: `auth.getUser()` failure returns `401 {error:'identify_requires_sign_in'}`. For a signed-out user the entire Vision rung — and therefore the OCR escalation that depends on Vision having failed first (`liveRecognition.ts:173`) — is unavailable; the ladder silently narrows to BARCODE + CATALOG_MATCH only, with no message explaining why non-barcoded items never resolve.

**What the user sees while waiting: nothing beyond the static default hint.** As shown in §1/§2, the UI only changes on `confirmed`/`unresolved`/`candidate`, and every one of those requires the async round trip above to have already returned an `identityKey`. There is no "checking catalogue…" / "thinking…" state tied to an in-flight network call.

**Confirmed: the whole controller blocks on any in-flight OCR or Vision call — including barcode reads for unrelated products.** `LiveScanController.onFrame()` (`liveScanController.ts:105-106`): `if (!this.running || this.busy) return;`, and `busy` stays `true` for the entire `identify()` promise (124-127), which awaits `recognizer.observe()` to completion — including any Vision/OCR network work inside `fromFallback` (`liveRecognition.ts:360-443`). Every frame arriving during that window, however clean a barcode it shows, is dropped **before any decode is attempted**. The controller's own doc comment (`liveScanController.ts:65-70`) justifies this as fine because "the next frame is 33ms away and shows the same product" — true for a fast local barcode miss, not for a 1-5+ second Vision round trip or a ~1-second OCR pass, during which a *different*, easily-decodable barcode presented to the camera is simply invisible to the app.

**Evidence-window / independence logic.** `EVIDENCE_WINDOW_MS = 4_000` is explicitly sized against `VISION_MIN_INTERVAL_MS` (comment, `liveScanSession.ts:137-145`): "three agreeing observations are spread across roughly `2 x VISION_MIN_INTERVAL_MS`... The slack is the point." `productive`/`ocrEscalatedAt` "sticky route" state (`liveRecognition.ts:212-220,292-299`) keeps the ladder on whichever rung last produced a hit for up to `PRODUCTIVE_ROUTE_TTL_MS` (4500ms) specifically to stop rungs alternating and spreading evidence outside the window — this was one of "THREE DEFECTS" the PR #130 commit body says it found in code written earlier the same day (`git show -s --format=%B c69eef9b`): *"The ladder alternated OCR and Vision, so a fresh product's paid observations were pushed apart until the evidence window lapsed — BANANA could never confirm AT ALL."*

**OCR escalation rule.** OCR is only attempted once Vision has looked at something classified **not** `FRESH_PRODUCE` and failed to resolve it (`escalateToOcr`, `liveRecognition.ts:236-240,424-425,437-438`), or immediately if the device has no Vision capability at all (`!input.hasVision`, line 173). **Tesseract worker lifetime:** `sharedOcrSession()` (`liveScanCapabilities.ts:82-90`) lazily `import()`s `ocrEngine` and creates **one** `LabelOcrSession` (backed by `Tesseract.createWorker`, `ocrEngine.ts:214`) for the whole sweep, released only on `LiveMultiScanner` unmount via `releaseLiveScanCapabilities()` (`LiveMultiScanner.tsx:143`) — so the multi-megabyte OCR engine downloads at most once per sweep, but only once actually escalated to.

**Where latency accumulates, end to end, for one Vision-resolved product:** capture+downscale (main thread) → quality score (main thread) → barcode miss (local) → JPEG encode (main thread canvas) → HTTP to Supabase Edge (hop 1) → Supabase Edge → OpenAI Responses API (hop 2, inference) → Supabase Edge → `search_products_v1` again (hop 3) → response back → repeat ≥2 times (`STRONG_EVIDENCE_REQUIRED = 2`) at ≥1200ms apart — and because of the busy-gate above, **each** of those round trips also blocks all other recognition, barcode included, for its own duration. Two Vision round trips at a conservative 1.5-3s each, ~1.2s apart, is 4-8+ seconds of the scanner being unable to read *any* barcode, with no visible sign anything is happening beyond the static "Przesuwaj telefon nad produktami." hint.

**Every place the loop waits on something remote before showing anything:** (1) `CATALOG_MATCH` after a barcode decode; (2) `VISION_FALLBACK`'s 3-hop round trip; (3) `ProductPickerPopover`'s own post-hoc `addScannedProduct` re-search (`searchProducts` again, `ProductPickerPopover.tsx:730-738`) before a "confirmed" scanned product can even be dropped into a recipe — a step `LiveMultiScanner`'s own UI never surfaces at all, since it happens after `onAddToRecipe` at the recipe boundary.

---

## 6. Session / state machine

`LiveMultiScanner`'s own `Phase`: `'starting' | 'scanning' | 'review' | 'deep' | 'no_camera'` (`LiveMultiScanner.tsx:44`). `'deep'` opens `DeepCompletionStep` (197-215,373-402), which mounts `LiveProductScanner` **nested** (not navigated) so the sweep's HOME draft survives while one unresolved product goes through the full static capture→analyze→finalize flow (§7) to acquire a real identity.

Domain session, `LiveScanSessionState` (`liveScanSession.ts:95-102`): `{ accepted, evidence, acceptedAt, counters }`. `AcceptedProduct.acceptance` is `'confirmed'` (catalogue-resolved, green) or `'needs_resolution'` (read but unmatched) (82-93). A `needs_resolution` row is never given an invented name — `reviewLabel()` (`liveScanHandoff.ts:39-42`) shows *"Nowy produkt — dokończ skanowanie"* ("New product — finish scanning").

**"Koniec"** (`LiveMultiScanner.tsx:273`) calls `finish()` (168-174): snapshot → `controller.stop()` (releases camera tracks) → phase `'review'`. `ReviewScreen` (280-364) lists each product with: "Uzupełnij" (complete — `needs_resolution` rows only, opens the deep flow), "Zmień" (rescan — removes, then phase back to `'starting'`, reopening the camera), "Usuń" (remove). Footer: "Dodaj do przepisu (N)" (disabled until ≥1 `confirmed` row), "Skanuj dalej" (phase → `'starting'`; camera reopens **fresh** but the controller reconstructs from `snapshotRef.current` — `LiveScanController`'s constructor seeds `session`/`captures` from `options.resumeFrom`, `liveScanController.ts:82-85` — so accepted products, evidence and reference images survive the restart), "Anuluj" (discard everything not yet added).

**Confirmed minor inefficiency across "Skanuj dalej":** every camera (re)open constructs a **brand-new** `LiveRecognizer` (`LiveMultiScanner.tsx:101-103`, `new LiveRecognizer(createLiveScanCapabilities({...}))`), whose internal `resolved` memoization `Map` (identity → catalogue hit **or miss**) and cost counters are instance state, not part of the snapshot that survives restarts. A code the recognizer had already looked up and found to be a catalogue **miss** will be looked up again over the network after "Skanuj dalej," even though the session-level dedup (which does survive) prevents that from producing a duplicate accepted row.

**Boundary into the recipe (boundary only, not the recipe internals):** `accept()` (`LiveMultiScanner.tsx:176-181`) calls `planHandoff(session)` (`liveScanHandoff.ts:26-31`), splitting `accepted` into `toRecipe` (confirmed) / `toDeepScan` (needs_resolution), then calls the two props and `onClose()`. In `HomeCreatorPage.tsx:675-694`, `onAddToRecipe` calls `intentIngredients.addScannedProduct(product.identityKey)` per product — `useHomeIntentIngredients.addScannedProduct` (`useHomeIntentIngredients.ts:126-130`) is simply `addByProductId(\`scan:${productId}\`, productId)`, reusing the same generic ingredient-add pipeline a typed/chip ingredient uses. `onNeedsDeepScan` never navigates — it sets a Polish notice telling the customer N products are waiting to be completed in the scanner. Separately, `ProductPickerPopover`'s inline `LiveProductScanner` resolves via a heavier, different boundary (`ProductPickerPopover.tsx:723-753`) that **re-searches** the catalogue by barcode/name, applies `scannedProductRecipeTarget`, and resolves a Mapper-catalogue selection before adding a line — on failure it shows *"Uzupełnij brakujące dane produktu, aby użyć go w recepturze"* rather than adding anything (740-747).

---

## 7. The older `/products/scan` flow (`LiveProductScanner` / `ProductScannerV1Page`)

No live camera (§1b). "Zrób zdjęcie" opens the native camera app via `<input capture="environment">` (`LiveProductScanner.tsx:519-526,540-551`); "Dodaj zdjęcie" opens a gallery multi-picker up to `MAX_IMAGES = 4` (line 40, 552-563); drag-drop/paste also feed the same path.

**CAPTURE.** `addFiles()` (397-442) runs each file through `prepareProductScanImage` (`imagePreparation.ts:38-74`: lazy HEIC/HEIF detection+conversion via `heic-to/csp`, then `prepareEvidenceImage` normalization — EXIF orientation applied, metadata stripped, downscaled if needed, each step recorded in a `transformations[]` audit trail). Only for the first image, while no barcode is yet known, `decodeBarcodeFromFile` (102-122) draws the file onto an offscreen `<canvas>` (max 1280px wide) and calls the **same shared** `BarcodeDecoder.decode(canvas)` the live loop uses — here `source` genuinely is an `HTMLCanvasElement`, so (unlike the live loop, §3) the scanline tertiary reader is a real, reachable fallback in this path.

**ANALYZE.** `runAutonomousLoop()` (307-395) drives up to 8 iterations of `nextAutonomousScanAction` (`autonomousScanLoop.ts:54-67`), prioritizing: existing exact product → wait for image → EAN research (`researchBarcode`, 217-246: free `lookupExactBarcode` first, then paid `lookupExactBarcodeFacts` in `mode:'ean_lookup'`) → one normal Vision pass (`analyzeProductImages`, `mode:'analyze'`) → up to one "accurate retry" targeting only genuinely re-photographable `PACKAGE_FIELDS` (`retryablePackageFields`, `autonomousScanLoop.ts:23-46`) → `complete_profile`. Server-side, `product-scan-analyze` (799 lines) picks `gpt-5.6-luna` (fast) or `gpt-5.6-terra` (accurate retry) via `PRODUCT_SCANNER_FAST_MODEL`/`PRODUCT_SCANNER_ACCURATE_MODEL` env vars (`index.ts:510-512`).

**Quota logic (summary).** A server-side cost-reservation RPC gates every analysis call against `PRODUCT_SCANNER_DAILY_COST_LIMIT` (default $5) / `PRODUCT_SCANNER_MONTHLY_COST_LIMIT` (default $100) (`product-scan-analyze/index.ts:576-577`), returning **HTTP 429** `{error, retryAt}` on exhaustion (580-588). This is a shared account/global cost ledger, separate from the per-session `maxVisionCalls`/`maxWebCalls` budget object (`DEFAULT_PRODUCT_SCAN_BUDGET` — note this specific constant lives in the orphaned `pipeline.ts`, §9; the budget actually enforced server-side is read from env at the edge function).

**FINALIZE.** `completeProfile()`/`save()` (269-305,444-488) call `finalizeProductScan` with `action:'preview'` then (on "Dodaj produkt") `action:'finalize'` against `product-scan-finalize` (601 lines) — which pulls in the real product-creation/profiling authority (`customerProductFamily`, `productBehaviorAuthority`, `classifyProductSemantics`, `intimportWholeProfileAuthority`; server-side, out of scope beyond noting the boundary). A `preview` response of `kind:'profile_preview', ready:true` unlocks "Dodaj produkt"; otherwise the flow routes to `needs_evidence` (asks for one specific missing thing via `customerProductGapGuidance`) or `blocked`.

**Progress UI.** `PROGRESS_STEPS` — 5 Polish stages: "Rozpoznajemy produkt" / "Sprawdzamy kod" / "Odczytujemy etykietę" / "Potwierdzamy dane" / "Przygotowujemy produkt" (`LiveProductScanner.tsx:82-88`, rendered 604-625) — is the **only** multi-step progress indicator anywhere in the whole feature; it does not exist in `LiveMultiScanner`.

**`customerProductGapGuidance`** (83 lines) translates server-only gap codes into one specific Polish question + explanation (EAN/barcode → *"Czy możesz pokazać wyraźnie kod kreskowy produktu?"*; dosage/technical → dosage question; alcohol → ABV question; ingredients/allergen → composition question; nutrition-percent fields → nutrition-table question; default → an honest "can't safely complete this yet, nothing was invented"). This "ask for exactly the one missing thing" pattern is genuinely good and is conceptually mirrored — but not reused — by the orphaned `evidenceState.ts`'s `EVIDENCE_REQUEST` map (§9).

---

## 8. Likely failure causes on a real phone — ranked

**1. [CONFIRMED-BY-CODE] No feedback path independent of decode+catalogue success.** `LiveMultiScanner.tsx:106-119` only branches on `confirmed`/`unresolved`/`candidate`; `searching`/`ignored_low_quality`/`duplicate_suppressed` (`liveScanSession.ts:35-49`) are unhandled. The steady-state message never changes from "Przesuwaj telefon nad produktami." This is the code-level source of "feels dead."

**2. [CONFIRMED-BY-CODE] Quality-driven guidance is computed and then discarded.** `scoreRgbaFrame` produces exposure/sharpness/glare; a complete, already-written guidance vocabulary for exactly these conditions exists in `liveCapture.ts:60-67` (*"Za ciemno — doświetl etykietę."*, *"Zmniejsz odblask na etykiecie."*, etc.) but that module is dead code (§9). The shipped path silently drops a bad frame with zero explanation.

**3. [CONFIRMED-BY-CODE] No ROI/aimer tied to the decoder.** The reticle (`LiveMultiScanner.tsx:239-244`) is decorative; `createVideoFrameGrabber` reads the whole frame (`liveScanController.ts:196-200`); `decodeGtinFromLuminance` samples full-width rows across the entire image (only reachable off the live path anyway, per #5 below). No visual cue is tied to where the decoder actually looks, and there is no cropping/prioritizing of a center region either.

**4. [CONFIRMED-BY-CODE] The controller is non-reentrant and blocks *all* recognition — including cheap barcode reads — for the full duration of any in-flight OCR or Vision call.** `busy` gate: `liveScanController.ts:106,124-127`. A Vision round trip (browser → Supabase Edge → OpenAI → catalogue RPC → back) or a ~1s local OCR pass freezes recognition entirely; a different, perfectly presentable barcode shown to the camera during that window is invisible to the app.

**5. [CONFIRMED-BY-CODE] The purpose-built Safari/no-BarcodeDetector fallback never runs in the live loop.** `decodeWithTertiaryReader` requires `HTMLCanvasElement` (`barcodeDecoder.ts:84`); the live loop only ever supplies `ImageData` (traced in §3). On Safari, live scanning depends entirely on the zxing-wasm ponyfill with no local rescue if it misses on a frame — precisely the class of device the scanline module's own header comment says it exists for. Narrow, local fix available (§3).

**6. [CONFIRMED-BY-CODE] No camera capability tuning at all.** `getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false})` (`LiveMultiScanner.tsx:82-85`) is the entire constraint set — repo-wide grep confirms zero `torch`/`zoom`/`focusMode`/`applyConstraints`/`getCapabilities` usage anywhere in the feature. No remedy for low light (no torch) or a barcode too small in frame (no zoom).

**7. [PLAUSIBLE, reasoned from confirmed constants] Sampled resolution vs. EAN module width at typical distance.** Frames are downscaled to `maxWidth = 640` before any decode (`liveScanController.ts:187`). An EAN-13 symbol is 95 modules wide; at ordinary one-hand scanning distances a barcode may occupy well under half the frame width, putting module width in the low single digits of pixels — workable but tight, worsened by #6 (no zoom) and any motion blur. No benchmark in the repo measures decode success rate against real captured resolution/distance (§3's `barcodePerformance.test.ts` only times a perfect synthetic bitmap).

**8. [PLAUSIBLE] Main-thread contention.** All frame grabbing, quality scoring and decode orchestration are synchronous on the main thread (grep-confirmed zero Workers in the feature), competing with React re-renders triggered by `setSession`/`setHint`/`setFlash` on every processed frame. No in-repo profiling quantifies the real-device cost.

**9. [CONFIRMED-BY-CODE] The catalogue gate can hide a technically-successful decode from ever turning green.** A valid, checksum-correct barcode for a real product not yet in Gellatti's catalogue decodes successfully but is forced to `'needs_resolution'` (`liveScanSession.ts:258-270`) — indistinguishable, to the user, from "the scanner isn't reading anything."

**10. [CONFIRMED-BY-CODE] Zero real-world decode evidence anywhere in the repo.** `__fixtures__/real-product-scans/` holds only a manifest documenting that real images were reviewed locally and deliberately not committed (§3). All 338 passing tests run against synthetic bitmaps, mocked capabilities, or hand-built JSON — none exercises an actual camera photograph through the real decode/ladder code, so none of the findings above have been empirically validated *or* refuted by the team's own suite.

**11. [PLAUSIBLE] No page-visibility handling.** Grep for `visibilitychange|visibilityState|document.hidden` across the feature returns nothing. `createLiveFrameSource` does correctly feature-detect `requestVideoFrameCallback` vs. `requestAnimationFrame` for Safari (`liveFrameSource.ts:28,39-57`), but tab/app-backgrounding behavior is left entirely to browser defaults with no explicit pause/resume or user-facing message.

**12. [CONFIRMED-BY-CODE, narrower scope] Vision rung requires sign-in.** `product-identify-live` 401s any unauthenticated caller (`index.ts:135-136`). For a signed-out session the Vision escalation — and the OCR rung gated behind it — silently disappears, narrowing the ladder to BARCODE + CATALOG_MATCH with no explanatory message.

**13. [PLAUSIBLE] One threshold does two jobs, so there is no graceful degradation (§4).** A frame just under the quality bar isn't merely "not the best," it is never offered to the decoder at all — a real-world frame a more tolerant decode attempt could have read is never tried.

---

## 9. Reusable components

Full-feature test run:

```
$ npx vitest run src/features/product-scanner --reporter=dot
 Test Files  37 passed | 1 skipped (38)
      Tests  338 passed | 1 skipped (339)
   Duration  6.66s
```

### KEEP AS-IS

| File | Why |
|---|---|
| `barcode.ts` | Pure GTIN/UPC checksum + UPC-E expansion, no I/O, fully deterministic. |
| `barcodeScanline.ts` | Sound, well-tested scanline decoder; the module itself is fine — it is simply unwired from `ImageData` inputs (§3/§5 fix, not a rewrite). |
| `barcodeTiming.ts` | Trivial, generic percentile summarizer. |
| `rollingBestFrame.ts` | Small, pure, well-tested windowing utility. |
| `liveFrameSource.ts` | Correct cross-browser (rVFC/rAF) frame pump; flagged only for missing visibility handling (§8 #11). |
| `liveScanSession.ts` | The pure evidence/acceptance state machine — well-designed, thoroughly tested, correctly separates "identified" from "catalogue-confirmed." Its richer event payloads are simply not consumed by the UI (§1) — a UI defect, not a defect here. |
| `liveScanHandoff.ts` | Trivial, correct split-by-destination logic. |
| `validation.ts`, `imagePreparation.ts`, `resultPresentation.ts`, `customerProductGapGuidance.ts`, `contracts.ts`, `scannerErrors.ts`, `customerProductFamily.ts`, `autonomousScanLoop.ts` | Pure, well-tested logic for the static analyze/finalize flow (§7); reusable regardless of what happens to the live camera loop. |

### KEEP WITH CHANGES

| File | Why |
|---|---|
| `frameQuality.ts` | Sound heuristic; `labelFill=0.72` is a stub, not a measurement (5% weight, low risk either way); the single threshold conflates "worth decoding" with "best reference frame" (§4) — these should likely use different bars. |
| `barcodeDecoder.ts` | Clean native→ponyfill→scanline selection and warmup semantics; fix the `HTMLCanvasElement`-only guard on the tertiary reader to also accept `ImageData` (§3/§8 #5) — a small, local, well-contained change that would make the existing scanline module load-bearing in the live path. |
| `liveRecognition.ts` | Sound ladder design with real bug-fix history (3 documented defects fixed in PR #130, §5). The one structural issue: its `observe()` is awaited by a fully non-reentrant controller, so the ladder logic itself doesn't need to change, but it should be decoupled from a design that drops all other frames while any one rung is in flight. |
| `liveScanController.ts` | The individual pieces it composes are sound; its own non-reentrancy policy (one shared `busy` flag for barcode AND slow rungs) is the single most consequential architectural choice in the system (§8 #4) and is the first thing worth revisiting. |
| `liveScanCapabilities.ts` | Reasonable adapter reusing existing authorities; inherits the sign-in requirement of `product-identify-live` (§8 #12) with no visible degradation message — worth surfacing. |

### REPLACE / REVIVE — confirmed orphaned, zero production usage

Repo-wide import search (all references, including tests) shows these five files are reachable **only from their own or one shared test file**, never from `LiveMultiScanner`, `LiveProductScanner`, or any controller/session file:

| File | Only referenced by |
|---|---|
| `pipeline.ts` | `pipeline.test.ts` |
| `scanRouting.ts` | `liveScanFlow.test.ts` |
| `liveCapture.ts` | `liveScanFlow.test.ts` |
| `liveFieldState.ts` | `liveFieldState.test.ts` |
| `evidenceState.ts` | `liveCapture.ts`, `scanRouting.ts`, `liveScanFlow.test.ts`, plus a **type-only** import of `ScanEvidenceKind` from `src/services/productScanner.ts:16` (the runtime `scanEvidenceState()` function itself is never called from production code) |

`git log --follow` on each shows they all predate the "LIVE SCANNER" rewrite: last touched at `11192da7`/`6b47cded`/`1bec49a0` ("the camera reads the code, the code answers the scan" / "add unified camera and upload capture flow"), all **older** than `b22ff061`/`c69eef9b`/`41ec1346` (PRs #125/#130/#133, the current `liveScanSession`/`liveRecognition` stack). This is a fully-built, fully-tested **previous generation** of live-scanning design that was superseded and never deleted or merged forward.

`liveCapture.ts` is the single highest-leverage REVIVE candidate in this audit: it already contains the exact per-frame guidance vocabulary (`unstable`/`blurred`/`glare`/`too_dark`/`no_text`/`settling`, with ready-to-use Polish strings, `liveCapture.ts:60-67`) that would directly answer "no guidance is shown" (§8 #1/#2), plus duplicate-frame detection via a difference hash (`frameHash`/`hammingDistance`, 84-103,69-77) and text-density estimation (`textDensity`, 106-124) that could inform when a frame is worth reading at all. `evidenceState.ts`'s "ask for exactly the one still-missing view, never repeat a request already shown" policy (`scanEvidenceState`, 103-144) is similarly unused but directly applicable.

---

## 10. Architectural assumptions to challenge

1. **"A frame either fully decodes or contributes nothing."** `barcodeScanline.ts`'s guard-to-guard, all-digits-or-null decode; `liveScanSession.ts:178-181`'s binary `qualifies()` gate. No partial evidence, no sub-100%-confidence barcode reading.
2. **"Green requires the catalogue, always."** `liveScanSession.ts:258-270`, the "OWNER RULE" comment. Correct for never overclaiming what Gellatti stocks, but it means a perfect decode of an uncatalogued product still looks, to the user, exactly like a scanner failure (§1, §8 #9).
3. **"Identification belongs in the live per-frame loop; profiling does not."** `liveRecognition.ts:8-12`. Reasonable split, but it means "live" still owns two remote-dependent rungs (CATALOG_MATCH, VISION_FALLBACK) — "live" here means "continuous camera, occasionally remote," not "instant local feedback."
4. **"OCR is a rung strictly below Vision, reached only as an escalation."** PR #133's deliberate reordering (`liveRecognition.ts:134-146`). Optimizes cost/success over latency: a packaged product with no barcode and an unavailable/failed Vision call may never get a local, free, no-network OCR attempt unless Vision fails first — so the ladder's own "cheapest first" framing (line 14) holds only for the barcode-vs-everything-else split, not within the fallback tier.
5. **"BarcodeDetector (native or wasm) is the primary decoder; the homegrown scanline reader is a safety net."** `barcodeDecoder.ts`'s decode order. False in practice for the live loop specifically (§3/§8 #5) — the safety net is inert exactly where it is most needed.
6. **"One quality score can both gate whether recognition runs and select the best frame to keep."** `frameQuality.ts`'s single `acceptableForAutoCapture` boolean feeds both jobs (§4). Splitting "worth trying" from "good enough to keep as a reference image" is not something the current design considers.
7. **"A cosmetic reticle is sufficient UI for aiming."** `LiveMultiScanner.tsx:239-244`. The decode logic has no ROI/aiming concept to visually reflect in the first place (§2/§3), so the reticle cannot be made meaningful without also changing the decode path.
8. **"Silence is an acceptable response to 'nothing recognized yet.'"** The three unhandled `LiveScanEvent` kinds (`searching`, `ignored_low_quality`, `duplicate_suppressed`) are treated as "no UI change needed" (`LiveMultiScanner.tsx:106-119`) rather than opportunities to say something — even though `liveCapture.ts` already has the vocabulary to do so.
9. **"Evidence-window and throttle constants tuned against each other generalize to real one-handed shelf scanning."** `EVIDENCE_WINDOW_MS=4000` is explicitly sized against `VISION_MIN_INTERVAL_MS=1200` (`liveScanSession.ts:137-145`) for a fairly cooperative, steady hold; no in-repo data validates this against real hand jitter/movement, because no in-repo data involves a real camera at all (§3, §8 #10).
10. **"`LiveProductScanner` is part of 'the live scanner.'"** The component's name and `ProductScannerV1Page.tsx:8-12`'s own framing ("There is one scanner, entered from two places") assume continuity with `LiveMultiScanner`, but architecturally it is a completely different, non-live, single-photo-at-a-time capture/analyze/finalize form (§7) sharing only leaf utilities (barcode validation, image prep, the shared `BarcodeDecoder`) — not the camera loop, controller, session, or recognition ladder. Any redesign conversation should keep these two mentally and structurally separate rather than treating "the scanner" as one thing.

---

## Key file index (absolute paths)

- `/Users/tomaszboro22/Developer/pinguino-scan-core-decision/src/features/product-scanner/LiveMultiScanner.tsx`
- `/Users/tomaszboro22/Developer/pinguino-scan-core-decision/src/features/product-scanner/LiveProductScanner.tsx`
- `/Users/tomaszboro22/Developer/pinguino-scan-core-decision/src/features/product-scanner/liveScanController.ts`
- `/Users/tomaszboro22/Developer/pinguino-scan-core-decision/src/features/product-scanner/liveRecognition.ts`
- `/Users/tomaszboro22/Developer/pinguino-scan-core-decision/src/features/product-scanner/liveScanSession.ts`
- `/Users/tomaszboro22/Developer/pinguino-scan-core-decision/src/features/product-scanner/liveScanCapabilities.ts`
- `/Users/tomaszboro22/Developer/pinguino-scan-core-decision/src/features/product-scanner/liveScanHandoff.ts`
- `/Users/tomaszboro22/Developer/pinguino-scan-core-decision/src/features/product-scanner/barcodeDecoder.ts`
- `/Users/tomaszboro22/Developer/pinguino-scan-core-decision/src/features/product-scanner/barcodeScanline.ts`
- `/Users/tomaszboro22/Developer/pinguino-scan-core-decision/src/features/product-scanner/barcode.ts`
- `/Users/tomaszboro22/Developer/pinguino-scan-core-decision/src/features/product-scanner/frameQuality.ts`
- `/Users/tomaszboro22/Developer/pinguino-scan-core-decision/src/features/product-scanner/rollingBestFrame.ts`
- `/Users/tomaszboro22/Developer/pinguino-scan-core-decision/src/features/product-scanner/liveFrameSource.ts`
- `/Users/tomaszboro22/Developer/pinguino-scan-core-decision/src/features/product-scanner/liveCapture.ts` (orphaned)
- `/Users/tomaszboro22/Developer/pinguino-scan-core-decision/src/features/product-scanner/liveFieldState.ts` (orphaned)
- `/Users/tomaszboro22/Developer/pinguino-scan-core-decision/src/features/product-scanner/evidenceState.ts` (orphaned)
- `/Users/tomaszboro22/Developer/pinguino-scan-core-decision/src/features/product-scanner/scanRouting.ts` (orphaned)
- `/Users/tomaszboro22/Developer/pinguino-scan-core-decision/src/features/product-scanner/pipeline.ts` (orphaned)
- `/Users/tomaszboro22/Developer/pinguino-scan-core-decision/src/features/product-scanner/autonomousScanLoop.ts`
- `/Users/tomaszboro22/Developer/pinguino-scan-core-decision/src/features/product-scanner/customerProductGapGuidance.ts`
- `/Users/tomaszboro22/Developer/pinguino-scan-core-decision/src/features/product-scanner/__fixtures__/real-product-scans/manifest.json`
- `/Users/tomaszboro22/Developer/pinguino-scan-core-decision/src/services/productScanner.ts`
- `/Users/tomaszboro22/Developer/pinguino-scan-core-decision/src/services/globalCatalog.ts`
- `/Users/tomaszboro22/Developer/pinguino-scan-core-decision/src/pages/products/ProductScannerV1Page.tsx`
- `/Users/tomaszboro22/Developer/pinguino-scan-core-decision/src/pages/home/HomeCreatorPage.tsx`
- `/Users/tomaszboro22/Developer/pinguino-scan-core-decision/src/features/ingredient-builder/ProductPickerPopover.tsx`
- `/Users/tomaszboro22/Developer/pinguino-scan-core-decision/src/features/home-creator/useHomeIntentIngredients.ts`
- `/Users/tomaszboro22/Developer/pinguino-scan-core-decision/src/app/router.tsx`
- `/Users/tomaszboro22/Developer/pinguino-scan-core-decision/supabase/functions/product-identify-live/index.ts`
- `/Users/tomaszboro22/Developer/pinguino-scan-core-decision/supabase/functions/product-scan-analyze/index.ts`
- `/Users/tomaszboro22/Developer/pinguino-scan-core-decision/supabase/functions/product-scan-finalize/index.ts`
