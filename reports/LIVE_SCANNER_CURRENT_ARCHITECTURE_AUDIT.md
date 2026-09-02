# Gellatti Live Scanner — current architecture audit

Date: 2026-08-24

Audited staging SHA: `14b5b12af38c88a4cbe959301d0de79a19757e43`

Scope: `/products/scan`, its shared Product Intelligence boundary, and the accepted
Catalog/Live Overlay/finalization route. This audit precedes runtime changes.

## Decision map

| Current capability                                              | KEEP                                                                                                                                       | REPLACE ONLY CAPTURE/DECODE UX                                                                                                         | EXTEND                                                                                                                                                                       |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One `/products/scan` destination backed by `LiveProductScanner` | Yes. Keep one session and one customer route.                                                                                              | Remove photo-session behavior from the normal live-camera surface.                                                                     | Make the camera surface the primary live reader with progressive field state.                                                                                                |
| Live camera through `navigator.mediaDevices.getUserMedia`       | Yes. Preserve privacy acknowledgement before camera/evidence upload.                                                                       | Replace the component-owned `requestAnimationFrame` loop and strict frame gate with a browser adapter and best-frame rolling window.   | Prefer environment camera, useful HD constraints, progressive track capabilities, visibility pause/resume, and deterministic cleanup.                                        |
| Upload, multiple upload, drag/drop, and paste                   | Yes. Keep all entry methods in the same session.                                                                                           | Replace the upload-only handwritten barcode path.                                                                                      | Feed uploaded images through the exact same `BarcodeDecoder` and missing-field state as video frames.                                                                        |
| Local barcode before paid analysis                              | Yes. Preserve immediate check-digit validation and catalog-first routing.                                                                  | Native-only plus handwritten `barcodeScanline` is not sufficient as the guaranteed path. The internal reader may remain tertiary only. | Add native capability selection plus self-hosted ZXing-WASM ponyfill fallback, prewarm, retail-format fast pass, central/full-frame scheduling, and timings.                 |
| Exact local Catalog lookup                                      | Yes. `lookupExactBarcode` stays before source lookup and Vision.                                                                           | None.                                                                                                                                  | Expose the known-product completion immediately in the live checklist/result; paid Vision remains zero.                                                                      |
| Exact EAN/source lookup                                         | Yes. Preserve dedicated `ean_lookup` mode and its independent reservation/caps.                                                            | None.                                                                                                                                  | Trigger immediately on valid local code and merge any resolved fields into the live field state before Vision.                                                               |
| General web search policy                                       | Yes. Remains server-controlled, opt-in, and not a client default.                                                                          | None.                                                                                                                                  | No expansion in this ticket.                                                                                                                                                 |
| Bounded Product Intelligence/Vision analysis                    | Yes. Preserve two-successful-call ceiling, source authority, validation, and cumulative server merge.                                      | Stop sending every accumulated image and asking the model to reread all visible facts.                                                 | Send only new non-duplicate evidence plus canonical `missingFields`; prompt only for unresolved fields and retain prior good facts.                                          |
| Cumulative session evidence                                     | Yes. Preserve `mergeProductScanResults`, server-owned session evidence, and the rule that later failure cannot erase a good result.        | Replace four broad booleans/derived kinds as the UI's complete session model.                                                          | Add one canonical per-field state for barcode, product name, brand, quantity, nutrition, ingredients, and allergens, including `USER_CONFIRMED_NOT_ON_LABEL` and `CONFLICT`. |
| Evidence request policy                                         | Yes. Preserve the concept that already-shown useful evidence is not requested again.                                                       | Replace the current “capture only after perfect gate, analyze, then discover next view” sequence.                                      | Track evidence coverage, stop work for found fields, emit one current hint, and allow explicit not-on-package resolution.                                                    |
| Frame quality and deduplication                                 | Keep local scoring, perceptual hashing, and duplicate avoidance as useful signals.                                                         | Quality must no longer be a wall (`score >= 62`, sharpness/glare thresholds, then three stable frames).                                | Maintain a short rolling buffer, rank readable frames, and auto-select best-so-far on a bounded deadline even when no perfect frame arrives.                                 |
| Current `barcodeScanline` implementation and tests              | Keep tests and measured evidence.                                                                                                          | Remove it as Safari/iOS's guaranteed production decoder.                                                                               | Retain only as a conservative tertiary fallback if it adds valid check-digit coverage.                                                                                       |
| Current primary scanner UI                                      | Keep premium white/charcoal design language, camera, inline status, accessible controls, and upload fallback.                              | Remove primary `Zrób zdjęcie`, the normal four-thumbnail gallery, and generic “analysis incomplete” camera loop.                       | Render the seven-field live checklist, a single useful hint, progressive product summary, a details-only evidence area, and meaningful screen-reader announcements.          |
| Manual shutter                                                  | Keep only as a fallback for focus/damaged/tiny labels.                                                                                     | Remove from the normal camera action row.                                                                                              | Place under `Problem ze skanowaniem?`.                                                                                                                                       |
| Result presentation                                             | Keep normalized structured quantities and Product Intelligence result authority.                                                           | Stop waiting for terminal analysis before showing known facts and stop contradictory fallback copy when facts are already present.     | Merge local barcode, exact lookup, and cumulative analysis into one progressive card. Validate plausible quantity so `330 ml` cannot become `33 ml`.                         |
| Quota policy                                                    | Yes. Existing product, duplicate, failed, cancelled, and incomplete same-session retry remain zero new-product allowance. No cap increase. | None.                                                                                                                                  | Add regression coverage around live and missing-only orchestration without altering database quota policy.                                                                   |
| Finalization and canonical ingest                               | Yes. Keep `product-scan-finalize` → `ingest_product_v1`; no arbitrary Scanner JSON enters recipes.                                         | None.                                                                                                                                  | Pass generalized not-on-label confirmations without changing shared final authority.                                                                                         |
| Scanner / INTIMPORT authority parity                            | Yes. Keep `intimport-enrich`, shared Product Intelligence, validation, and canonical ingest boundaries.                                    | None.                                                                                                                                  | Regression-test that Scanner orchestration does not create a second authority.                                                                                               |
| Catalog / Live Overlay / recipe-picker last hop                 | Yes. Preserve the accepted commercial-product identity and recipe-picker route.                                                            | None.                                                                                                                                  | No architecture reopening.                                                                                                                                                   |
| High-risk technical products                                    | Yes. Preserve fail-closed dosage/behavior authority and validation.                                                                        | None.                                                                                                                                  | No relaxation.                                                                                                                                                               |
| Mapper                                                          | Yes. Mapper remains read-only and unchanged.                                                                                               | None.                                                                                                                                  | No dataset or migration changes.                                                                                                                                             |
| Observability                                                   | Keep server cost/rate diagnostics and safe error classification.                                                                           | Component-local behavior is currently unmeasured.                                                                                      | Add staging/development session diagnostics for adapters, attempts, timings, dedup, evidence, calls, missing/not-on-label fields, and completion. No raw frames in logs.     |

## Accepted flow inventory

The following accepted flows are in scope for regression protection, not redesign:

1. `/products/scan` and recipe picker open the same `LiveProductScanner` authority.
2. Camera, upload, multiple upload, drag/drop, and paste feed one scan session.
3. Local barcode routes to current Catalog before exact source and paid Vision.
4. Exact known product returns with zero Vision and zero new-product quota.
5. Unknown EAN may use the dedicated exact-source path before label analysis.
6. Product Scanner analysis is bounded to two successful Vision calls; general web
   search is not client-controlled or default-on.
7. Cumulative results preserve prior direct evidence and surface conflicts instead of
   allowing last-call-wins.
8. Failed analysis does not increment the successful Vision counter or erase an earlier
   good result; failed/cancelled/duplicate/incomplete outcomes do not consume the
   new-product allowance.
9. Finalization uses the canonical product ingest and server-owned evidence transaction.
10. Live Overlay and recipe picker accept only the shared canonical commercial identity;
    high-risk technical products remain fail-closed.
11. Private commerce data stays separated from shared overlay facts.
12. `mapper_basement` is never written by Scanner.

## Current capture/decode defects to replace

- `LiveProductScanner` samples through a component-owned `requestAnimationFrame` timer;
  there is no `requestVideoFrameCallback` adapter or visibility-aware pause.
- Auto-capture is blocked by hard exposure/sharpness/glare thresholds and
  `STABLE_FRAMES_BEFORE_CAPTURE = 3`; `selectBestFrame` exists but is not used by the
  live session.
- At first open, the session wants only barcode and identity. A readable identity frame
  can trigger Vision while a visible barcode remains undecoded.
- Native `BarcodeDetector` is used without format-capability negotiation. When absent or
  failing, the handwritten scanline decoder is the only production fallback.
- Live and uploaded barcode code paths are separate functions.
- The first captured frame immediately advances to analysis. Follow-ups resend every
  accumulated asset and do not carry canonical `missingFields` to the server prompt.
- UI evidence has four derived kinds, not the required seven-field canonical state.
- Manual `Zrób zdjęcie` and four thumbnails remain in the normal workflow.
- Not-on-package is implemented only as a narrow final allergen checkbox.
- There are no adapter-selection, WASM warmup, time-to-first-barcode, visibility,
  orientation-preservation, or rolling-best-frame regressions.

## Change boundary

The implementation may change Scanner capture adapters, local decode adapters, live
session orchestration, Scanner request metadata/prompting, Scanner presentation, and
focused tests. It must not change Mapper data, product science, ProductBehavior,
INTIMPORT authority, Live Overlay authority, recipe-picker authority, production
configuration, secrets, existing quota caps, or production deployment.
