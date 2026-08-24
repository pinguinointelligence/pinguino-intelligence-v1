# GELLATTI Product Scanner — live capture, EAN-first routing, quota correction

**Branch** `claude/scanner-live-capture` → `origin/staging` (worktree `~/Developer/pinguino-scanner-live`)
**Date** 2026-08-24 · **Production `main` untouched.**

---

## 1. What was actually wrong

The owner's screenshots showed a scanner asking for photographs of a package it had
already photographed, and a result reading `Kod: Brak` next to images in which the
barcode is plainly visible.

The barcode was never read, because on that phone nothing was reading it.

Live detection ran only through `window.BarcodeDetector`. Chrome on Android implements
it; **Safari does not**. On the owner's iPhone the detector was `undefined`, the loop
skipped detection silently, and the session reached the paid analysis with
`barcode: null`. Everything the brief complains about follows from that one absence:

- no exact product lookup could run, because there was no code to look anything up by;
- the model was asked to find what a check digit could have proved for free;
- whatever the model failed to read became a request for „dodatkowe ujęcie";
- and the session hit its two-call ceiling on analyses that had produced nothing.

Three further defects were found on the way:

| # | Defect | Where |
|---|---|---|
| 2 | A **failed** analysis incremented `vision_calls`, so two failures exhausted an allowance of two — „Limit analiz wykorzystany" on a scan that produced nothing | `complete_product_scan_analysis_v1` |
| 3 | The same statement wrote `overlay_state='BLOCKED'` on failure, **discarding a good earlier analysis** whenever a follow-up call failed | same |
| 4 | Scanner web search was **default-ON** (`!== 'false'`) while the client sent `allowWeb: true` on every ordinary scan | `product-scan-analyze` |

---

## 2. What changed

### Reading the code (`barcodeScanline.ts`)
A scanline EAN-13 / EAN-8 / UPC-A reader over the frame's luminance. No dependency, no
worker, no OCR engine — the standard run-length variance match, ~270 lines. A GTIN
carries its own check digit, so a single agreeing scanline is a verified read, and a
code whose checksum fails is refused rather than reported. `BarcodeDetector` is still
used when the browser has it; this is what runs when it does not.

### Deciding what to keep (`liveCapture.ts`)
Quality gate, duplicate rejection by 64-bit frame hash, stop-when-enough. A decoded
barcode is captured immediately (no stability wait — it is the most valuable frame in
the session); other views wait for three steady, sharp, glare-free frames. The same
side of a package held in front of the lens for ten seconds is **one** piece of
evidence. The manual shutter remains as a fallback, not as the workflow.

### Knowing what is missing (`evidenceState.ts`)
Evidence is accounted per kind — identity, code, nutrition, ingredients — with the
provenance that supplied it. Exactly one view is ever requested, by name
(„Obróć produkt i pokaż tabelę wartości odżywczych"), and **never a view the owner has
already shown**. When the remaining gap is not photographable the flow says so and
continues to estimation instead of asking again.

### Spending in the right order (`scanRouting.ts`)
```
catalogue (free) → exact GTIN source (cheap) → one analysis (paid)
  → one precise request → estimation
```
The result card no longer appears mid-collection; while evidence is still being
gathered the screen shows the checklist and what is still needed.

### The exact GTIN lookup (`product-scan-analyze`, mode `ean_lookup`)
Reads no photograph and spends no analysis allowance. It reaches the source through the
**existing dedicated** `intimport-enrich` path — which keeps its own flag, its own caps,
its own cache and its own source-authority classification. Scanner general web search is
now opt-**in**; the client no longer sends `allowWeb` and the server no longer reads it.
One lookup per session, reserved before the call so two tabs cannot both spend it.

### Migration `20260824140000_product_scan_live_evidence.sql`
- a failed analysis consumes **no** allowance and erases **nothing**; the real spend is
  still recorded in the ledger;
- retries are bounded by a per-session **attempt** ceiling (4) instead — the burst
  window, the daily/monthly kill switches and the idempotency ledger are untouched;
- `reserve_product_scan_ean_lookup_v1` / `complete_product_scan_ean_lookup_v1` give the
  lookup its own reservation and its own completion, writing the same provenance rows a
  label analysis writes.

### The scan that ends in the recipe (§37)
`Dodaj składnik` → `Skanuj produkt` opens the same scanner in place and hands the
resolved product back to the recipe — through the same fail-closed current-Mapper
boundary a picked product goes through (`scannedProductRecipeTarget`). See §5.

---

## 3. Served proof (staging, TEST PRO)

Bundle `index-LlexXUz2.js` and later · Supabase `tunabqqrwabacxjcxxkz`.

| Test | Result | Evidence |
|---|---|---|
| **A** known EAN → canonical product | PASS | `5902425088609` → `existing_product`, `visionCalls 0, webCalls 0, $0`. Network panel: **no edge-function call at all** |
| **B** new EAN → exact source first | PASS | `5449000131805` → `visionCalls 0, webCalls 1, $0.01`; ingredients, allergens, nutrition basis + 5 macros and net quantity resolved from an official specification PDF, **before any photo was requested** |
| **C** ask only for what is missing | PASS | after the lookup, `missingCriticalFields` = `product_identity`, `brand_or_unbranded` — the front of the package, and nothing else |
| **D** barcode detected before any result | PASS | uploaded label → `Kod EAN_13: 5902425088609` on screen, via the scanline reader (no `BarcodeDetector` involved) |
| **G** upload = same pipeline | PASS | one uploaded frame drove code → catalogue → lookup → analysis → result |
| **I / §14** failed analysis costs nothing | PASS | rolled-back DO block: before `vision=0 overlay=SCAN_DRAFT result=t`, after a **failed** call `vision=0 overlay=SCAN_DRAFT result=t state=analyzed`, ledger row `failed` |
| **J** no duplicate identity | PASS | `scannedProductRecipeTarget` unit matrix + the existing-product path above |
| **K** source unavailable | PASS | refused/failed lookup returns `skipped`/`providerUnavailable` and the scan continues locally |
| **L** failed/cancelled scan | PASS | new-product allowance is consumed only by `product_created` |
| **§16** rescan is free | PASS | second scan of the same barcode: `webCalls 0, $0`, all ten fields still resolved (provider cache) |

**End-to-end, one uploaded frame, brand-new product** (session `de9e8b41`):
`vision_calls 1 · web_calls 1 · total cost $0.0018` — identity, brand, 330 ml, full
nutrition, ingredients and allergens resolved, **no further photograph requested**.

Not verifiable from here: the live camera loop. The Browser pane keeps the page
`hidden`, and a hidden page receives **zero** `requestAnimationFrame` callbacks and
decodes no video frames, so no synthetic camera can drive it. The reader itself is
proven served through the still-image path (same decoder, same bundle) and by 11 unit
tests against the real GS1 module layout — distance, noise, gradient, upside-down and
checksum rejection. **A physical package in front of a real phone camera is the owner's
check.**

---

## 4. Tests

`695 files / 8675 passing`, plus the new suites:

- `barcodeScanline.test.ts` — 11 cases against a real GS1 encoder
- `liveScanFlow.test.ts` — 29 cases over the brief's matrix A–L
- `eanLookupEvidence.test.ts` — 9 cases; label always outranks the source, unevidenced
  disagreements are left open rather than guessed
- `liveEvidenceQuota.migration.test.ts` — 10 cases pinning the quota and lookup SQL
- `scannedProductToRecipe.test.ts` — 7 cases on the recipe boundary

---

## 5. Open owner decision — the last hop into the recipe

§37 is built and wired: the picker opens the scanner, the scan resolves or creates the
canonical product, and the product is handed back to the recipe.

It cannot complete for a real barcode today, and the reason is a boundary, not a bug:

- the recipe picker accepts **current Mapper identities only** (`mapperOnly: true`,
  `currentMapperCatalogId` rejects `entityKind !== 'pi_base'`);
- **all 2088 Mapper rows on staging have an empty `ean_code_normalized`** — no barcode
  can ever match one;
- all 16 commercial products on staging have **no** Mapper identity
  (`mapper_ingredient_id is null`).

So a scanned commercial product is saved to the catalogue correctly and then has nowhere
to go in a recipe. Rather than invent a line the Engine cannot model, the scanner says
exactly that: *„… zapisano w katalogu produktów. Do receptury trafia dopiero po
przypisaniu tożsamości Mapper."*

Two ways forward, both the owner's call:

1. **Let an approved mapping in.** A commercial product whose `mapped_ingredient_id` is
   an approved + verified current Mapper id is already resolvable to that Mapper row,
   and the recipe line would be the Mapper identity with identical physics. This is a
   one-condition change in `currentMapperCatalogId` — but it changes the picker's
   selection authority, which this task was told not to touch.
2. **Carry EANs on Mapper rows**, so a scan of a known supplier product matches directly.

Neither was done here.

---

## 6. Also worth knowing

- `high_risk_dosage_authority` (the pre-existing v1 rule for tara/carrageenan/aspartame
  and friends) blocks the save and **no photograph can clear it**. The result now says
  so in one sentence instead of showing a bare „Analiza niepełna" over a disabled button.
- Privacy consent moved **before** the camera opens. Live capture uploads without a
  further tap, so taking consent afterwards would mean frames existed that the owner
  never chose to send.
- The first served lookup recorded an official specification PDF as `web_search`: the
  authority-class map had been written from memory and matched nothing. It is now typed
  `Record<SourceAuthorityClass, …>`, so a renamed class fails the build.
- The lookup used to report one web call and one cent every time, including cache hits.
  It now reports what the provider actually did.

## 7. Deployment

- migration applied to staging (`product_scan_live_evidence`), all four functions
  `security definer`, granted to `service_role` only;
- edge functions `product-scan-analyze` and `intimport-enrich` deployed to staging;
- `origin/staging` builds green on Vercel (`pinguino-staging`);
- **production `main` untouched.**
