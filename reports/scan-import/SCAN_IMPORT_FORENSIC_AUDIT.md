# SCAN IMPORT — DEEP FORENSIC AUDIT (audit only, no runtime change)

Staging audited: `e2e1a61a` (origin/staging, 2026-09-04). Branch: `claude/scan-import-forensic-audit`. Auditor: Claude (foreground pass, one section per commit).
Method: targeted search of `src/`, `supabase/functions/`, `supabase/migrations/`, `docs/`, `reports/`; existing tests run where cited; every IMPLEMENTED claim carries a file reference. Camera/acquisition/decoding performance is out of scope (Scan Core lane).
Companion files: `SCAN_IMPORT_GAP_MATRIX.md`, `SCAN_IMPORT_BOUNDARY.md`, `SCAN_IMPORT_FINDINGS_LEDGER.md` (same directory).

## SECTION 1 — CURRENT IMPLEMENTATION IDENTITY

**Canonical name in the repo.** There is no module called "Scan Import". The behaviour the owner calls Scan Import is split across three named things:
1. **Product Scanner** (`src/features/product-scanner/`, 43 non-fixture files; schema id `gellatti_product_scan_v1` in `contracts.ts:1`) — the "deep" scanner: barcode validation, evidence collection, label analysis, finalize/persist.
2. **LIVE SCANNER / live sweep** (`LiveMultiScanner.tsx`, `liveScanSession.ts`, `liveRecognition.ts`, `liveScanHandoff.ts`, `liveScanController.ts` in the same directory) — the multi-product camera sweep; its own header calls it "LIVE SCANNER" (`liveScanHandoff.ts:1-15`).
3. **Product Intelligence / INTIMPORT / TEXTIMPORT** (`src/features/product-intelligence/`, `src/features/product-textimport/`, edge functions `intimport-enrich`, `product-textimport-*`) — non-camera import channels that share the identity, evidence and ProductBehavior authorities with the scanner.
The pipeline order is documented in the code itself (`scanRouting.ts:1-14`): *barcode read locally → Gellatti's own catalogue (free) → exact GTIN lookup at the source (one server call) → label analysis once (paid) → one precise evidence request → estimation through Product Intelligence*.

**Entry points (UI).**
- `src/pages/products/ProductScanPage.tsx` (deep scanner page) and `src/pages/products/ProductScannerV1Page.tsx` (v1 page kept; camera test `ProductScannerV1Page.camera.test.tsx`).
- `src/pages/home/HomeCreatorPage.tsx` mounts the live sweep (`LiveMultiScanner`) for HOME.
- `src/pages/destinations/ProductImportPage.tsx` + `productImportController` — the catalogue/text import destination (non-camera).
- Product picker (`src/features/product-picker/`, `src/services/productPicker/`) is the manual entry into the same catalogue identity.

**Identity + routing (pure client code).**
- `barcode.ts` — `validateBarcode(value, hintedFormat)` accepts EAN-8 / EAN-13 / UPC-A / UPC-E with GTIN check digit (`gtinCheckDigit`, `expandUpce`), returns `{ value, format, lookupValue }`; `barcodeLookupCandidates()` adds the leading-zero variants (UPC-A ↔ EAN-13) for catalogue matching.
- `scanRouting.ts` — `routeScan()` (precedence engine, see Section 3) and `ScanOutcome`.
- `pipeline.ts` — `exactBarcodeMatch()` (catalogue hit whose `eans[]` contains any lookup candidate) and `nextProductScanStep()` (budget: 4 images, 2 vision calls, 1 web call).
- `liveRecognition.ts` / `liveScanSession.ts` / `liveScanHandoff.ts` — live sweep state; `planHandoff()` splits results into `toRecipe` (CONFIRMED → the SAME HOME draft via `hydrateIngredient` + `recipeStore.addIngredient`) and `toDeepScan` (NEEDS_RESOLUTION → deep scanner contribution flow). The live sweep "never invents" a product (`liveScanHandoff.ts:11-14`).

**Server boundary (Supabase edge functions, Deno).**
- `product-identify-live` (313 lines) — one question per call: "what is visible in this one frame"; barcode/OCR/brand text tried first through `search_products_v1` (zero vision calls); model (`gpt-5.6-luna`, max 1 vision call, frame ≤ 1.5 MB) only when local evidence resolves nothing; **canonical identity comes only from the catalogue RPC and only when exactly ONE row returns** (`index.ts:158-176`); response `{ status: RESOLVED | UNRESOLVED, identity, confidence, evidenceType, kind, resolution, usage }`.
- `product-scan-analyze` (799 lines) — label profiling (nutrition, allergens, composition) through the model; uses `_shared/productScanner.ts` (`PRODUCT_SCAN_RESPONSE_SCHEMA`, `mergeProductScanResults`, `validateServerResult`, `normalizeValidatedBarcode`).
- `product-scan-finalize` (601 lines) — persistence: loads the owned `product_scan_sessions` row, idempotent replay when `state = finalized` (`index.ts:381-398`), applies customer corrections, validates the ProductBehavior authority (`validateProductBehaviorAuthority` from `src/features/product-intelligence/productBehaviorAuthority.ts`), then `rpc('gellatti_upsert_customer_added_product_v1', { p_scan_result, p_product_profile, p_product_behavior, p_private_overlay, p_idempotency_key })` (`index.ts:580-590`).
- `product-import-run` (131 lines), `product-textimport-adapt`, `product-textimport-ean-resolve` (477 lines; web research with authority classes OFFICIAL_MANUFACTURER … STRUCTURED_PRODUCT_DATABASE, caps 6 web calls/row, 18/run; delegates to `intimport-enrich` which calls `api.openai.com/v1/responses`), `intimport-enrich` (734 lines), `catalog-submit`.
- External HTTP providers found in code: **Open Food Facts** (`src/data/products/openFoodFactsAdapter.ts`, `https://world.openfoodfacts.org/api/v2/product/<gtin>.json`) and **OpenAI Responses API** (identify-live, scan-analyze, intimport-enrich). No GS1, UPCitemdb or BarcodeLookup integration exists.

**Persistence (tables/RPCs named by the code).** `product_scan_sessions` (state machine: … → `analyzed` → `finalized`; columns include `barcode`, `overlay_state`, `exact_product_id`, `expires_at`), `products` (`product_code`, `product_name_display`, `brand`), `mapper_basement` + `mapper_product_behavior_bindings` (ProductBehavior authority rows), RPC `search_products_v1` (catalogue search authority), RPC `gellatti_upsert_customer_added_product_v1` (customer-added products, migration `20260827100000_scanner_customer_added_products.sql`), `product_recognition_v2_cache` (`20260825230000`), article-code exact match (`20260825214500_product_article_code_exact_match.sql`), country resolution authority (`20260903212502_country_product_resolution_authority.sql`), user preferred exact product slots (`20260903173641`), canonical picker deterministic order (`20260903170000`).

**Tests that pin the module (present on staging).** In `src/features/product-scanner/`: `barcode.test.ts`, `barcodeDecoder.test.ts`, `pipeline.test.ts`, `eanLookupEvidence.test.ts`, `finalizeSaveContract.test.ts`, `liveScanFlow/Session/Controller/Acceptance/Handoff.test.ts`, `productIdentifyLiveBoundary.test.ts`, `productScanner.boundary.test.ts`, `realProductRegression.test.ts`, `ownerCocaColaLiveRegression.test.ts`, `scannerErrors.test.ts`, `customerAddedProductArchitecture.migration.test.ts`, `productBehaviorFingerprint.migration.test.ts`, `scanRetryQuota.migration.test.ts`, `liveEvidenceQuota.migration.test.ts`; in `src/services/`: `productScanner.errors.test.ts`, `productCatalogImport(.security).test.ts`, `intimportCanonicalLookup.test.ts`; pages: `ProductScanPage.test.tsx`, `ProductImportPage.security.test.ts`, `productImportController.test.ts`.

**Freeze / owner-lock status.** `scripts/protectedPaths.json` protects the ProductBehavior authorities the scanner depends on — `productBehaviorAccess.ts` ("ProductBehavior access/resolver gate"), `mainCapability.ts`, `mainEnvelope.ts`, `canonicalModuleEligibility.ts` — but **no Product Scanner file is a protected path**; `scripts/guardProtectedPaths.mjs` + `guardOwnerLockedContracts.mjs` run in `.github/workflows/ci.yml`. HOME Scanner is frozen by owner instruction, not by a guard.

**Dependencies out of the module.** `@/features/global-catalog/contracts` (`CatalogProductSearchHit` with `eans[]`), `src/features/product-intelligence/productBehaviorAuthority.ts` + `productRecognition.ts` (imported by the finalize edge function through a relative path into `src/` — server and client share one TypeScript authority), `recipeStore.addIngredient` + `hydrateIngredient` (HOME draft), Mapper (`mapper_basement`).

**Coupling to Scan Core today: NONE.** Scan Core (`src/scan-core`, `src/scan-lab`) exists only on `claude/scan-core-phase-0`; nothing on staging imports it. The de-facto input contract of Scan Import is a *string barcode* (`evidence.barcode` in identify-live, `ValidBarcode` in the client) plus optional OCR/brand text and one frame — there is no symbology, confirmation-state or evidence field on that boundary.

## SECTION 2 — CODE IDENTITY

| Symbology | CONTRACT (repo) | IMPLEMENTED | EVIDENCE | VERDICT |
|---|---|---|---|---|
| EAN-13 | `SupportedBarcodeFormat` includes `EAN_13` (`barcode.ts:1`) | 13 digits + GTIN check digit → `{ value, format: 'EAN_13', lookupValue }` | `barcode.ts:60-62`, test `validates EAN-8, EAN-13 and UPC-A check digits` (`barcode.test.ts:5`) | PASS |
| EAN-8 | `EAN_8` | 8 digits + check digit, unless the decoder hint says UPC-E | `barcode.ts:50-58` | PASS |
| UPC-A | `UPC_A` | 12 digits + check digit; lookup candidates add the `0`-prefixed 13-digit form | `barcode.ts:57-59`, `barcodeLookupCandidates` `:66-73` | PASS (client) / PARTIAL (server, see below) |
| UPC-E | `UPC_E` | expanded to UPC-A with `expandUpce()` (number system 0/1 only), check digit verified on the expansion; `value` keeps the 8 digits, `lookupValue` the UPC-A | `barcode.ts:22-45`, test `expands valid UPC-E and provides equivalent exact lookup keys` (`:13`) | PASS (client) / FAIL (server: `normalizeValidatedBarcode` accepts only 8/12/13-digit GTINs and treats any 8-digit string as EAN-8 — a UPC-E `value` sent as-is is misclassified, `_shared/productScanner.ts:248-262, 549-550`) |
| QR | not in `SupportedBarcodeFormat`; no `qr` reference anywhere in `product-scanner`, `services`, or the edge functions | not supported | grep (0 files) | NOT SUPPORTED BY CONTRACT |
| GTIN-14 / ITF-14 | not in the client contract | server-side `customer_added_products.normalized_ean` accepts `^[0-9]{8,14}$` with NO check-digit constraint (`20260827100000_scanner_customer_added_products.sql:33`) | migration | PARTIAL — a 14-digit value can be persisted although no client path produces one |

**Raw vs normalized value.** Client: `digitsOnly()` strips every non-digit (so `"7 622201-492786"` and `"76222014927861"`-style prose fragments are both reduced silently before validation; only the length + check digit stand between prose and a "valid" code). Server: `normalizeValidatedBarcode` is stricter — only `[0-9\s-]` allowed, everything else rejected rather than truncated (`_shared/productScanner.ts:251-254`). The two normalizers therefore disagree on inputs such as `"EAN: 7622201492786"` (client accepts, server rejects) — harmless today because the server receives the already-validated digit string, but it is an undocumented contract split.

**Symbology preservation.** The client decoder (`barcodeDecoder.ts`: native `BarcodeDetector` when it supports retail formats, else the `barcode-detector` ponyfill over `zxing-wasm`) returns `format` and passes it to `validateBarcode(value, hintedFormat)`; the hint is consulted ONLY to tell UPC-E from EAN-8 (`barcode.ts:49-52`). After that point the symbology is re-derived from digit length everywhere: `format` on the client (`:57-62`) and `barcodeFormat(digits)` on the server (`:549-550`), which also rejects a model-returned barcode whose `format` differs from the length-derived one (`validatedResultBarcodes`). The server session row stores `barcode text` (`20260821120000_product_scanner_v1.sql`), no format column. **Actual decoder symbology is not preserved past validation; it is inferred from length** (PARTIAL).

**Checksum handling.** Client and server both compute the GTIN mod-10 check digit and refuse a failing code (`barcode.ts:11-20`, `_shared/productScanner.ts:256-262`); test `rejects malformed or unsupported payloads instead of guessing` (`barcode.test.ts:21`). PASS. Note for the Scan Core boundary: a checksum-valid *alias* (today's RERUN evidence: `0602002492786` and `8622262492786` both pass the check digit) is indistinguishable at this layer — Scan Import has no evidence field to know how well a code was confirmed.

**Leading zeros / UPC↔EAN.** Client generates both forms for catalogue matching (`barcodeLookupCandidates`). The catalogue RPC matches with **exact digit-string equality** against `eans[]` (`x = regexp_replace(p_query,'\D','','g')`, `20260824170000_picker_commercial_identity_strict_search.sql:138-139`) — no zero-padding on the server. `product-identify-live` receives ONE string (`evidence.barcode`) and resolves it once (`index.ts:207-208`); whichever candidate the client chose is the only one tried. Where the stored `ean_code_normalized`/variant `ean` is 13 digits with a leading `0` and the client sends the 12-digit UPC-A value, the exact match misses (PARTIAL — verified in Section 3 which string the live client sends).

**Malformed values.** Non-digit garbage: client silently strips, server rejects (`identify_bad_request` only for unparsable JSON; a bad barcode simply yields no local hit and falls through to OCR/model). No `INVALID_CODE` state is surfaced to the user from a checksum failure — the code is treated as "no barcode" (see Section 15). PARTIAL.

**Section verdict.** EAN-13 / EAN-8 / UPC-A / UPC-E identity: PASS on the client; PARTIAL end-to-end (symbology by length, UPC-E value/format mismatch on the server, 14-digit persistence without check digit, invalid-code collapsed into no-code). QR: NOT SUPPORTED BY CONTRACT.

## SECTION 3 — RESOLUTION PRECEDENCE (actual, recovered from code)

**The precedence engine is `routeScan()` (`scanRouting.ts:51-77`) and it is pure and tested (`liveScanFlow.test.ts`, `pipeline.test.ts`).** For a confirmed barcode the order is:

```
confirmed digits (ValidBarcode)
 1. catalogMatch → 'existing_product'      exact catalogue identity, nothing analysed, nothing charged
 2. barcode && !eanLookupDone → 'ean_lookup'   server: exact product by EAN again, else ONE narrow web research call
 3. evidence.complete → 'ready'
 4. frames > analysed && visionCalls < max → 'analyze_label'   (paid model, max 2 per session)
 5. evidence.requestView → 'request_evidence'  (one precise photograph request)
 6. otherwise → 'estimate'                 Product Intelligence + Mapper estimation (generic)
```
Step 1 is evaluated twice with two different implementations:
- **Client** `lookupExactBarcode()` (`src/services/productScanner.ts:97-129`): calls `searchProducts` (RPC `search_products_v1`, context `TOPPING`, market scope `global`, limit 20) once per lookup candidate (`value`, `lookupValue`, zero-padded variants) and takes the FIRST row whose `eans[]` contains any candidate. The live sweep uses the SAME function (`liveScanCapabilities.ts:9,127`).
- **Server** `exactProductForBarcode()` (`product-scan-analyze/index.ts:85-130`): `product_variants.ean IN (digits, 0+digits, digits without leading 0)` with `is_current = true`, `limit(1).maybeSingle()`; the product must be active and not merged; a `customer_provisional` product is returned only to an account already linked to it (`customer_added_product_accounts`), otherwise treated as no match so the other customer goes through evidence/finalize (which adds the relation).
- **Live identify** `product-identify-live` `resolve()` (`index.ts:158-176`): `search_products_v1(p_query = barcode string, limit 5)` and accepts the hit ONLY when exactly one row returns; several rows → `null` → `UNRESOLVED` (ambiguity is silent, see Section 15).

Step 2 (`ean_lookup`, `product-scan-analyze` mode `ean_lookup`, `index.ts:261-330`): if the server exact lookup hits, it returns `kind: 'existing_product'` with `usage: 0` (the "rescan of a known package" path, §16 comment). Otherwise it reserves one lookup per session (`reserve_product_scan_ean_lookup_v1`; a refused reservation is "not a failure" — the flow continues locally, §24) and calls `intimport-enrich` — "the narrowest dedicated server-side source path", with its own flag, caps and source-authority classification; the Scanner's general web search is NOT enabled for it (§6). The returned facts are merged by `mergeProductScanResults` with the source rank `label 4 > manufacturer 3 > barcode_registry 2 > retailer 1` (`_shared/productScanner.ts:286-291`) and lookup facts "carry NO evidence rows on purpose … a label read from the package must always outrank a page found on the web" (`:1186-1188`).

**Authorities that are NOT in the scanner path.** The three 2026-09-03 picker authorities — `country_product_slot_assignments` (PRIMARY_DEFAULT / SAFE_FALLBACK per Mapper slot, admin-approved, `20260903212502`), `user_preferred_product_slots` (explicit per-user exact-SKU pointer, `20260903173641`), and the deterministic picker order (`20260903170000`) — are consumed only by the Global Catalog picker (`useGlobalCatalogPicker.ts:178 → resolveCountryProductsForSlots → rpc resolve_country_product_slots_v1`, `globalCatalog.ts:253-261`). The scanner never calls them: a scanned code resolves to the catalogue row whose EAN equals the digits, full stop. There is also no "user's own product first" rule in the scanner beyond the customer-provisional visibility gate above.

**Does stronger exact identity always beat weaker generic identity?** Within one session, yes by construction: `existing_product` short-circuits everything (`routeScan` step 1, `nextProductScanStep` `pipeline.ts:38-41`), the model is never allowed to name a product id (identify-live header, `index.ts:9-18`), and web facts never outrank label facts. **Two gaps break the guarantee across the boundary:**
- G3.1 — `lookupExactBarcode` takes `rows.find(...)` over a ranked search result: if two catalogue rows carry the same EAN (variants of different products, or a customer-provisional row next to a controlled row), the winner is the search ranking (favorite, relevance, recency), not identity strength. Whether the schema forbids duplicate EANs across products is checked in Section 4.
- G3.2 — the client and server exact lookups can disagree: the client searches `search_products_v1` (Mapper references + commercial products projection, `eans` = `ean_code_normalized` + current variants), the server searches `product_variants` only. A product whose EAN lives only in `products.ean_code_normalized` (no current variant row) is exact on the client and unknown on the server, so the session falls into the paid `ean_lookup`/analysis path for a product the client already resolved.

**Verdict.** Precedence is explicit, documented in code and tested: PASS for the order itself. Identity-strength guarantee: PARTIAL (G3.1 ranking-decides-duplicates, G3.2 two exact lookups with different scopes). No new precedence is proposed here; both gaps are fixable inside the existing order.

## SECTION 4 — EXACT SKU VS GENERIC

**Contract (repo).** "The model IDENTIFIES … the CATALOGUE DECIDES — canonical identity comes only from `search_products_v1`" (`product-identify-live/index.ts:9-18`); the live sweep "never invents" a product and hands unknown codes to the deep flow (`liveScanHandoff.ts:11-14`); an exact catalogue product "answers the scan outright: no model, no source call, no allowance" (`product-scan-analyze/index.ts:262-264`).

**Implemented.**
- Exact identity = a catalogue row whose EAN equals the digits (client `lookupExactBarcode`, server `exactProductForBarcode`, Section 3). A hit becomes `existing_product` and no generic path runs. PASS.
- Unknown code → the session continues with evidence (label analysis) and, when the package cannot supply the rest, `estimate` (Product Intelligence + Mapper estimation, `scanRouting.ts:29-32,76`). The **product identity stays the scanned one**: finalize persists a `customer_provisional` product built from the scan result (`gellatti_upsert_customer_added_product_v1`, `product-scan-finalize/index.ts:580-590`), central by EAN (`customer_added_products.normalized_ean unique`, `20260827100000:33,44`) and account-private until linked. Only the *behaviour* is family-derived: `customerProductFamily.ts:59-90` maps the semantic classification to a ProductBehavior archetype (`dairy_liquid`, `fruit`, `chocolate`, `nut_paste`, `plant_beverage`, `technical_additive`, …, `classificationSource: 'CUSTOMER_CONFIRMED'`). So a branded exact barcode does not silently become "generic milk" as an identity; it becomes an exact provisional product whose engine behaviour is inherited from a Mapper family. PASS for identity, PARTIAL for transparency (see Section 6: the UI must say the behaviour is inherited, not measured).
- Live sweep: CONFIRMED (exact catalogue hit) → HOME draft; NEEDS_RESOLUTION → deep scanner; a read that the catalogue does not know is "still carried" but never green (`liveRecognition.ts:322-330`). PASS.

**Where exact identity CAN collapse or be wrong (findings).**
- F4.1 (P1) **EAN twins across visibility.** `products.ean_code_normalized` is unique only per owner (`products_owner_ean_norm_uniq (owner_user_id, ean_code_normalized)`, `0009_products_identity.sql:77-79`) and among shared commercial products (`products_shared_ean_uniq … where visibility='shared' and product_kind='commercial_product'`, `20260813110300:83-86`). A user's private/provisional product and the shared canonical product may carry the same EAN; `search_products_v1` returns both, and `lookupExactBarcode` takes the first by search ranking (favorite → relevance → recency), not by canonical strength. `product-identify-live` returns UNRESOLVED for the same twin pair (single-row rule). Two entry points, two different answers for one code.
- F4.2 (P1) **Client/server exact-scope mismatch** (G3.2): server exact lookup reads `product_variants` only (`product_variants_ean_uniq` guarantees at most one product there, `20260813110300:214`), client reads `eans[]` = `ean_code_normalized` ∪ current variants. A product with `ean_code_normalized` but no current variant is exact on the client and unknown on the server.
- F4.3 (P2) **No AMBIGUOUS state.** Several catalogue rows for one code become `null` → `UNRESOLVED` (identify-live `index.ts:170-172`), i.e. the same outcome as "not in catalogue". The user is never told two candidates exist.
- F4.4 (P2) **`customer_provisional` invisibility is by design but unannounced**: a second customer scanning a code that another customer already added gets `null` from the server exact path (`product-scan-analyze/index.ts:107-117`) and pays for evidence/finalize; the finalize transaction then links them to the existing row (dedup preserved). Correct for identity, silent for the user.

**Verdict.** Exact-beats-generic inside one resolution: PASS. Exact identity uniqueness across the catalogue's visibility layers: FAIL (F4.1) — the winner of an EAN twin is decided by ranking. Client/server exact scopes: FAIL (F4.2). Ambiguity surfacing: FAIL (F4.3).

## SECTION 5 — EXTERNAL LOOKUP / INTERNET / APIs

**Providers actually wired (runtime).**
| Provider | Where | Trigger | Auth | Caps / timeout | Normalization | Failure handling |
|---|---|---|---|---|---|---|
| OpenAI Responses API + `web_search` tool (`gpt-…` models configured server-side) | `supabase/functions/intimport-enrich/index.ts` (called by `product-scan-analyze` mode `ean_lookup`, by `product-textimport-ean-resolve`, and by INTIMPORT) | scanner: only after the exact catalogue lookup missed AND `reserve_product_scan_ean_lookup_v1` allowed one lookup for the session (`product-scan-analyze/index.ts:283-300`) | server secret; caller must be signed in (`unauthorized` 401); feature flag (`intimport_web_enrichment_disabled` 403) | `max_tool_calls` per product (`WORST_CASE_SEARCHES_PER_CALL = 3`), resolver caps 6 web calls/row, 18/run (`product-textimport-ean-resolve/index.ts:4-6`); **the semantic-classification call has `AbortSignal.timeout(30_000)` (`:354`), the research call has NO timeout** (only one `signal:` in the file) | strict JSON schema (`text.format.type = json_schema, strict: true`, `ENRICHMENT_SCHEMA`); fields limited to `RESEARCHABLE` (`:60`, `:464`) | `!response.ok → throw → { facts: [], sources: [], notFound }` — "a single product's failure must never fail the batch (§26)"; malformed JSON "is ignored, never partially trusted" (`:650-654`) |
| OpenAI vision (identify-live, scan-analyze) | `product-identify-live`, `product-scan-analyze` | identify: only when barcode/OCR/brand resolved nothing; analyze: label profiling, ≤ 2 vision calls/session | server secret + sign-in + budget preflight (`scanner_budget_preflight_failed`, `scanner_call_cost_limit`, `session_vision_limit`) | 1 frame ≤ 1.5 MB per identify call | strict JSON schema `PRODUCT_SCAN_RESPONSE_SCHEMA`; server re-validates (`validateServerResult`) | `provider_request_failed`, `scanner_provider_unavailable`, `identify_unavailable` |
| Open Food Facts (`world.openfoodfacts.org/api/v2/product/<gtin>.json`) | `src/services/openFoodFacts.ts` (client-side fetch) + pure parser `src/data/products/openFoodFactsAdapter.ts` | **not on the scanner path** — consumed only through `applyProductEnrichment` (reviewer-gated nutrition patch, 7 `ENRICHABLE_FIELDS`) from the OCR-intake save flow (`ocr-intake/session/saveFlow.ts:284-290`) and the dev enrichment preview page | keyless | **no timeout, no retry**; a non-404 error response is not distinguished from success beyond `res.json()` | honest nulls, `found:false` on 404; ranked as `public_composition_db` (weakest tier) | thrown fetch errors propagate to the caller |
| GS1 / UPCitemdb / BarcodeLookup / Google | — | none exist in the repo | | | | |

**Source-authority model.** Web facts are classified by `classifySourceAuthority` (`_shared/sourceAuthority.ts`) into `OFFICIAL_MANUFACTURER | OFFICIAL_BRAND | OFFICIAL_TECHNICAL_PDF | OFFICIAL_PRIVATE_LABEL | AUTHORITATIVE_RETAILER | STRUCTURED_PRODUCT_DATABASE` (`product-textimport-ean-resolve/index.ts:8-14`); when an official domain is known the `web_search` tool is hard-filtered to it (`allowed_domains`, "a HARD restriction, not a preference", `intimport-enrich/index.ts:603-609`). Facts merge by `sourceRank label 4 > manufacturer 3 > barcode_registry 2 > retailer 1`; every disagreement is kept as `ProductScanConflict { field, labelValue, externalValue, retainedSource }` with `retainedSource = 'label'` (`contracts.ts:31-36`, system prompt `_shared/productScanner.ts:215`); a withheld field leaves an unresolved conflict with `retainedSource: null` (`:505`). External data therefore is evidence, not authority: PASS.

**Caching / persistence.** Semantic classification results are cached per evidence fingerprint and cache revision (`intimport-enrich/index.ts:262-284`, table `intimport_semantic_classification_usage` with `unique(user_id, idempotency_key)`, `20260825230000_product_recognition_v2_cache.sql:7-20`); a cache hit reports `cacheHit: true` with zero web calls (the scanner records `providerWebCalls` from what the provider actually did, `product-scan-analyze/index.ts:318`). Web facts land in `product_scan_sessions.result_json` with `externalSources[]` (`sourceType, url, title, field`) and travel into the product version on finalize (Section 13).

**Offline / network failure.** The client's `researchBarcode()` swallows any thrown error and marks the lookup done (`LiveProductScanner.tsx:243-246`): a network outage during `ean_lookup` is indistinguishable from "source knows nothing" — the session silently proceeds to the paid label analysis. See Sections 10 and 15.

**Findings.**
- F5.1 (P1) The research call to the provider has no timeout; a hung provider holds the edge function until the platform kills it, and the client treats the eventual failure as "looked up, nothing found".
- F5.2 (P2) Network failure and provider "not found" collapse into one client outcome (`eanLookupDone = true`, no error state).
- F5.3 (P3) Open Food Facts fetch has no timeout and no retry (`openFoodFacts.ts:14-18`; non-404 errors do throw, `:17`); low blast radius because it sits behind a human reviewer and outside the scanner path.
- F5.4 (P3) Provenance of a *rejected* external fact (conflict lost to the label) is kept only inside the session/version JSON; nothing surfaces it to the customer.

**Verdict.** Provider trust model: PASS. Timeouts / failure distinction: PARTIAL (F5.1, F5.2). Caching + provenance: PASS with F5.4.

## SECTION 6 — CONFIDENCE + PROVENANCE

**Actual vocabulary (three layers, not one).**
1. Per-field evidence on a scan result: `ProductScanEvidenceRef { assetId, field, source: label|barcode_registry|manufacturer|retailer, confidence: high|medium|low, region, directVisibility }` (`contracts.ts:12-29`); external sources `ProductScanExternalSource { sourceType, url, title, fieldsUsed }` (`:38-43`); conflicts `ProductScanConflict` (Section 5). Live-sweep field provenance `ScanFieldProvenance = camera|catalog|ean_lookup|official_source|external_source|mapper_estimated|derived` (`evidenceState.ts:15-23`) and `LiveScanFieldSource = camera|catalog|ean_lookup|vision` (`liveFieldState.ts:19`).
2. Product-level deterministic score: `assessProductConfidence()` (`product-intelligence/productEvidenceConfidence.ts:185-230`) — weighted field credit by `EVIDENCE_SOURCE_RANK` (`label = user_confirmed = mapper_exact 6 > manufacturer 5 > barcode_registry = source_file 4 > retailer = web_search 2 > mapper_family 1`; "a family inference can never outrank a direct fact", `:33-44`), `exactCanonicalMatch → ≥ 97`, validated GTIN `+3` ("never alone completes a product"), `−12` per material conflict; output `{ confidence 0-100, criticalReadiness, missingCritical[], reasons[] (owner-readable Polish, never internal weights) }`. Thresholds: `NO_WEB_CONFIDENCE = 90`, `AUTO_IMPORT_FLOOR = 85` (`:231-233`).
3. Publication / usability state of the imported product: `ProductScanOverlayState = SCAN_DRAFT | USABLE_FOR_OWNER | PENDING_PUBLICATION | PUBLISHED | BLOCKED` (`contracts.ts:5-10`, column `product_scan_sessions.overlay_state`), plus the finalize profile gate `productAccuracyAssessment { roleReadiness, gellattiReadiness.ready, criticalBlockers }` and `engineUsable` (`product-scan-finalize/index.ts:479-516`); a profile the authority rejects ends the import with `customer_product_profile_rejected` 409, i.e. nothing weak is persisted as usable.

**Does every imported identity preserve source, exactness, confidence, evidence and a confirmation requirement?**
- Source + evidence: PASS — evidence refs and external sources are part of the result schema and are validated server-side (`validateServerResult`).
- Exactness: PASS by construction for catalogue hits (`exactCanonicalMatch → 97`, `existing_product` route) — but the *reason* a product is exact (EAN equality) is not stored as a distinct provenance value: `ScanFieldProvenance` has `catalog` and `ean_lookup`, no `exact_gtin` vs `name_match` distinction. PARTIAL.
- Confidence: PASS (deterministic, reasoned).
- Confirmation requirement: PARTIAL — the states that mean "a human must confirm" are spread over `missingCriticalFields`, `USABLE_FOR_OWNER` vs `PENDING_PUBLICATION`, `criticalBlockers`, and the live sweep's NEEDS_RESOLUTION; there is no single `needsConfirmation` flag on the import output, so each UI derives it differently (Section 15).
- Silent weak-evidence import: NOT POSSIBLE for the customer-added path (profile gate) — PASS; for the live sweep, a non-catalogue read is carried but never green (`liveRecognition.ts:322-330`) — PASS.

**Findings.**
- F6.1 (P2) No single confirmation-requirement field on the import result; four partially overlapping signals.
- F6.2 (P2) Exactness provenance is implicit (route) rather than recorded (`exact_gtin` / `single_catalogue_row` / `name_match` are indistinguishable after the fact).
- F6.3 (P3) `ProductScanConfidence high|medium|low` (per field) and the 0–100 product score are two scales with no documented mapping.

**Verdict.** Provenance model: PASS. Confirmation requirement as a first-class output: PARTIAL.

## SECTION 7 — DEDUPLICATION + IDEMPOTENCY

**Loop audited:** scan code → resolve → import → save → reopen → scan the SAME code again.

| Step | Mechanism | Evidence | Verdict |
|---|---|---|---|
| One session = one barcode | a second, different barcode on an existing session is refused `scan_session_barcode_conflict` 409 | `product-scan-analyze/index.ts:226-228` | PASS |
| Rescan of a known package | server exact lookup answers `kind: 'existing_product'` with zero usage ("§16") | `product-scan-analyze/index.ts:261-282` | PASS (subject to F4.2/F7.2 scope) |
| Finalize replay | `state = finalized` + `exact_product_id` → `kind: 'idempotent'` with the same product; `idempotencyKey` (8–160 chars) required by the RPC | `product-scan-finalize/index.ts:381-398`, RPC `:217-218` | PASS |
| Central identity by EAN | `customer_added_products.normalized_ean UNIQUE`; an existing pending product for the EAN returns `kind: 'existing_product'` and only links the account (`on conflict(user_id,product_id) do update set favorite=true`), `distinct_customer_count` recomputed | RPC `:265-270, 351-352, 361-375` | PASS — no duplicate SKU, no duplicate private copy per user |
| Evidence per scan | `customer_added_product_evidence unique(user_id, scan_session_id)`, `on conflict do nothing` | RPC `:387-392`, migration `:75` | PASS |
| New product row | `products` inserted with `owner_user_id = null`, `created_by = actor`, `product_kind = 'customer_provisional'`, `visibility = 'internal'`, `normalized_identity = 'ean:'||ean`, `search_document`; version 1 with sha256 `facts_fingerprint`; behaviour binding via `classify_catalog_product_behavior_v2` | RPC `:311-337` | PASS (single canonical lineage) |
| Variant EAN row | added **only when no `product_variants` row already holds that EAN** ("historical canonical retirement … may still own the global variant-EAN slot") | RPC `:342-350` | see F7.2 |
| Live sweep | identity key `ean:<lookupValue>`; an already-accepted identity still in view emits `duplicate_suppressed` (silent by design); acceptance cooldown per identity | `liveRecognition.ts:334`, `liveScanSession.ts` (`LiveScanEvent`, `acceptedAt` cooldown) | PASS |
| Text import (INTIMPORT) | canonical lookup keyed by `barcode.lookupValue`; preflight buckets `NEW_CANONICAL_PRODUCT` / `EXISTING_CANONICAL_REUSE` | `src/services/intimportCanonicalLookup.ts:30-62`, `reports/INTIMPORT_DEDUP_CLOSEOUT_2026-08-24.md` | PASS |
| Manual product / picker | `manualProduct.ts` builds `ean = barcode.lookupValue` (`:48`) but performs no exact-EAN lookup of its own before submission; whether the receiving RPC dedupes by EAN was not proven in this pass | `src/services/manualProduct.ts:38-49` | UNKNOWN → F7.3 |

**Findings.**
- F7.1 (P2) Same code across HOME live sweep, deep scanner and PRO picker resolves through three different lookups (`lookupExactBarcode` client search, `exactProductForBarcode` server variants, picker search ranking); they agree only when the catalogue is clean of EAN twins (F4.1).
- F7.2 (P1) A customer-added product whose EAN slot is held by a retired canonical variant gets **no `product_variants` row**, so the server exact path (`product_variants` only) never finds it: every later rescan of that package by the same customer skips the zero-cost "existing product" answer and re-enters the evidence flow (the RPC then dedupes, so no duplicate is created, but the cost and the user experience are those of a new product).
- F7.3 (P2) Manual product creation path not proven idempotent by EAN (UNKNOWN; needs one targeted test).

**Verdict.** Identity loop for the scanner channels: PASS. Cross-channel consistency: PARTIAL (F7.1, F7.2). Manual channel: UNKNOWN (F7.3).

## SECTION 8 — PRODUCT CATALOG / LIVE OVERLAY

**What exists at runtime (proved from migrations + functions).**
| Concept | Runtime object | Evidence | Status |
|---|---|---|---|
| Central product record | `public.products` (`product_kind`: `mapper_reference`, `commercial_product`, `customer_provisional`, …; `visibility in ('shared','account_private','internal')`; `owner_user_id`, `created_by`, `ean_code`, `ean_code_normalized`, `normalized_identity`, `current_version_id`, `current_behavior_binding_id`, `merged_into_product_id`, `is_active`) | `20260716101708_0007_products.sql`, `20260813110300_canonical_product_root_and_ingest.sql`, RPC `20260827100000:311-337` | EXISTS |
| Product versioning | `public.product_versions` (`version`, `facts`, `evidence_snapshot`, `facts_fingerprint` sha256, `is_current`, `provenance`); `products.current_version_id` | RPC `:326-337` | EXISTS — immutable versions, one current pointer |
| Package variants | `public.product_variants` (`ean` globally unique where not null, `is_current`, `market`) | `20260813110300:214` | EXISTS |
| Superseding / merge | `products.merged_into_product_id` + `is_active=false` on retirement; every exact lookup filters `merged_into_product_id is null` | `20260813110300:166,1926`; `product-scan-analyze/index.ts:107` | EXISTS |
| Per-user overlay | `public.user_product_relations (user_id, product_id, favorite, private_price, currency, supplier, notes, stock)`; written from `p_private_overlay` by the ingest RPC and by the scanner finalize (`privateOverlay.price` validated ≤ 1 000 000) | `20260813110300:1909-1919`, `product-scan-finalize/index.ts:570-579` | EXISTS — this is the only "overlay" a user owns |
| Publication state of a scan | `product_scan_sessions.overlay_state ∈ SCAN_DRAFT, USABLE_FOR_OWNER, PENDING_PUBLICATION, PUBLISHED, BLOCKED`, set by the analyze validation and forced to `BLOCKED` on budget/provider failures | `product-scan-analyze/index.ts:381,678,723,752,777` | EXISTS |
| Customer-added products (central by EAN, account-scoped access) | `customer_added_products` (unique `normalized_ean`, `distinct_customer_count`, `status`), `customer_added_product_accounts`, `customer_added_product_evidence`; RLS lets only linked accounts or CATALOG admins read the provisional product/version/binding/variant rows | `20260827100000:31-122` | EXISTS |
| Editing | customer corrections applied at finalize (`applyCustomerCorrections`, bound to the session barcode) — no post-finalize edit path in the scanner; PRO product editing lives elsewhere | `product-scan-finalize/index.ts:175-181` | PARTIAL |
| Revalidation | `product_capability_reanalysis_requests` + `gellatti_request_product_capability_reanalysis_v1` / admin integration (ProductBehavior re-analysis, not identity) | `20260827103000:9,66,136,224,407` | EXISTS (behaviour only) |
| Country / global records | `products.country` (from `identity.countryOfOrigin`), `product_variants.market` (`'GLOBAL'` for customer-added), `catalog_market_countries`, `country_product_slot_assignments` (picker authority, Section 3) | RPC `:319,349`; `20260903212502` | EXISTS |
| Legacy global catalog | `global_catalog_variants` (unique `ean`) from the 2026-08-13 global catalog import | `20260813110000:78` | EXISTS (historical) |
| "Live Overlay" as an engine-identity authority | migration `20260824150000_live_overlay_engine_identity.sql`: evidence-based PR→PI identity *proposal* (macro agreement within tolerance, refuses ambiguity, excludes high-risk/technical products, "writes nothing"); runtime authorization **retired** by `20260825210000_product_behavior_authority_restore.sql`; pinned by `liveOverlayIdentity.migration.test.ts` | test header lines 1-15; `reports/LIVE_OVERLAY_ENGINE_IDENTITY_2026-08-24.md` | DESIGNED ONLY / RETIRED (read-only proposal) |

**Precedence between the layers (for a scanned code).** Central product identity first (EAN equality); the per-user overlay never changes identity, only favorite/price/supplier/stock; a `customer_provisional` product is central by EAN but visible only to linked accounts until it is published. The user overlay is therefore not an identity authority (PASS), and there is no runtime "Live Overlay" that could override catalogue identity (the owner's 2026-08-24 decision: no EANs on the 2088 Mapper rows; identity through Product Intelligence / Catalog authority instead).

**Findings.**
- F8.1 (P2) The name "overlay" carries three meanings in the code (`user_product_relations` private overlay, `overlay_state` publication state, the retired Live Overlay engine-identity proposal); Scan Import documentation must pick one.
- F8.2 (P2) No customer-facing edit path after finalize for a customer-added product except the ProductBehavior re-analysis request; an identity mistake (wrong brand/name) can only be fixed by CATALOG admins.
- F8.3 (P3) `global_catalog_variants` and `product_variants` both hold unique EAN slots; only `product_variants` is consulted by the scanner. Historical only, but it is a second place an EAN can "exist".

**Verdict.** Product Catalog: EXISTS, versioned, superseding-safe. Live Overlay (engine identity): DESIGNED ONLY / RETIRED. User overlay: EXISTS and correctly non-authoritative for identity.

## SECTION 9 — COUNTRY VS LANGUAGE

**Where "product country" comes from.** `account_product_market_preferences (user_id, primary_market, additional_markets[], preferred_retailers[], default_scope ∈ my_markets | my_markets_and_global | global)` (`20260813110000_global_product_catalog.sql:144-150`) — an explicit account setting. The picker passes `productCountry: resolvedPreferences.primaryMarket` (`useGlobalCatalogPicker.ts:107-124,173-180`) into `resolve_country_product_slots_v1`, normalised by `normalizeMarketCountry` (`globalCatalog.ts:261`). Valid countries are the admin-maintained `catalog_market_countries (code, name_pl, name_en, …)` (`20260826120000:83-101`) and `country_product_slot_assignments.country_code` is constrained to `^[A-Z]{2}$` (`20260903212502:27-28`).

**Where "language" comes from.** The scanner records `identity.labelLanguages[]` and `identity.countryOfOrigin` as *label evidence* (`_shared/productScanner.ts:43-54,649,713-716`); `countryOfOrigin` is copied to `products.country` at creation (`20260827100000:319`). The UI locale (Polish/English registry) is never passed into product queries: `search_products_v1` has no language parameter (signature `text,text,text,text[],boolean,text,text,integer,integer,jsonb`), `product-identify-live` and `product-scan-analyze` request bodies carry no locale, and no scanner/picker/service file reads `navigator.language` or the i18n language (grep: 0 hits in `product-scanner`, `global-catalog`, `globalCatalog.ts`, `productScanner.ts`).

**EAN prefix.** No code infers a country from the GS1 prefix; `gs1.org` appears only as a source-authority domain (`sourceAuthority.ts:76-77`, `researchPlan.ts:78`). PASS.

**Proof of decoupling.** PRODUCT COUNTRY = account `primary_market` (explicit) or label `countryOfOrigin` (evidence); UI LANGUAGE = locale registry; neither is derived from the other anywhere in the audited paths. PASS.

**Findings.**
- F9.1 (P3) `products.country` is filled from the label's `countryOfOrigin` (where the product was *made*) while the picker's country authority means the *market* where it is sold; the two notions share one column name. Documentation gap, not a coupling.
- F9.2 (P3) `labelLanguages` is collected but not used by any resolution rule (dead evidence today).

**Verdict.** PASS.

## SECTION 10 — OFFLINE

**Implemented.**
- Network/transport failures are classified before they reach the UI: `productScanner.ts:47-57` sets `networkFailure` for `FunctionsFetchError` / `FunctionsRelayError`, and `scannerErrors.ts:141-146` maps it to the code `connection` with the copy „Nie mamy teraz połączenia. Sprawdź sieć i spróbuj ponownie." (`:59`); the render gate (`services/scannerErrorGuard.ts`) blocks every raw transport phrasing (tests `names a quota, an auth loss and a connection loss distinctly`, `never renders any of them`, `scannerErrors.test.ts:76,127`). PASS for the deep scanner.
- Live sweep: "a decoder or network failure mid-sweep must not end the session" (`liveRecognition.ts:274`); a failed identification is treated as a frame that said nothing (`productScanner.ts:165`). PASS for robustness, but the customer is never told the sweep is offline (see F10.2).
- Known product offline: the local barcode decode is network-free (`liveRecognition.ts:16`), but **every** exact resolution is a server call (`search_products_v1` / edge functions); there is no offline catalogue — `inMemoryCatalog` is exported by `product-picker` but has no runtime consumer (grep: only tests/dev), and the React Query caches use `staleTime` 15 s – 5 min without persistence (`useGlobalCatalogPicker.ts:87-184`). A known product therefore does NOT resolve offline. FAIL vs the owner expectation "resolve locally where supported" (nothing is supported today).
- Unknown product offline: the deep scanner surfaces `connection`; the EAN lookup swallows the failure and marks the lookup done (Section 5, F5.2), so the session's next step is a paid label analysis that will also fail with `connection` — honest, no fake success. PASS (honest), PARTIAL (path).
- No `navigator.onLine` or connectivity pre-check anywhere in the scanner (grep: 0 hits).

**Findings.**
- F10.1 (P1) No offline resolution path for known products (no local EAN → product cache); every rescan needs the network. Design gap rather than defect, but it contradicts the offline expectation and makes shop-floor use fragile.
- F10.2 (P2) Live sweep never surfaces connectivity loss; a code the catalogue knows becomes "unresolved" while offline, i.e. the same state as a truly unknown product.
- F10.3 (P2) `ean_lookup` network failure is recorded as a completed lookup (`eanLookupDone = true`), so reconnecting does not retry the free path.

**Verdict.** Honest failure states: PASS. Offline resolution of known products: MISSING (F10.1).


## SECTION 11 — PRODUCTBEHAVIOUR AUTHORITY

**Canonical owner.** `PRODUCT_BEHAVIOR_AUTHORITY = 'PRODUCT_BEHAVIOR_V1'` in `src/features/product-intelligence/productBehaviorAuthority.ts` (`classifyProspectiveProductBehavior`, `validateProductBehaviorAuthority`, outcomes `classified | unknown_requires_review | blocked`), fed by Mapper rows (`mapper_basement`) and behaviour bindings (`mapper_product_behavior_bindings`); on the database side `classify_catalog_product_behavior_v2(version_id, 'product-behavior-v2')` (`20260825210000_product_behavior_authority_restore.sql`, `20260827101000_customer_added_recipe_readiness.sql`) — pinned VOLATILE and service_role-only by `productBehaviorFingerprint.migration.test.ts:31-47`. The engine-side authorities (`productBehaviorAccess.ts`, `mainCapability.ts`, `mainEnvelope.ts`, `canonicalModuleEligibility.ts`) are owner-locked protected paths (`scripts/protectedPaths.json:14-17`).

**How an imported product reaches it (proved in `product-scan-finalize/index.ts:447-500`).**
```
corrections → familyResolution (must be RESOLVED, else kind: 'family_confirmation_required')
 → customerProductProfileProposal(scanResult, recognitionEvidence, recognition, userConfirmedFields)
 → validateIntimportProductProfileProposal({ origin: 'CUSTOMER_ADDED', proposedMapperIngredientId: null, …, rows: Mapper rows })
      ↳ null → 409 customer_product_profile_rejected
 → validateProductBehaviorAuthority({ productProfile, behaviorRows })
 → finalizeProductProductionAccuracy(profile, behavior)
 → ONE readiness authority: productAccuracyAssessment.roleReadiness (BASE_READY | TOPPING_READY | …), gellattiReadiness.ready, criticalBlockers
 → RPC gellatti_upsert_customer_added_product_v1(p_product_profile, p_product_behavior) → products + product_versions(v1, facts incl. productBehaviorAuthority) → classify_catalog_product_behavior_v2 → products.current_behavior_binding_id
```
The finalize comment states the rule explicitly: "One readiness authority for every surface … reassembling raw missing fields here made a TOPPING_READY article look simultaneously blocked by BASE-only water/freezing requirements" (`:484-488`).

**Does Scan Import invent engine eligibility, Main capability, process scope, formulation role or technical behaviour?** No. Every one of those is computed by the shared authority from the profile; the scanner only supplies evidence and the customer's *family* choice, and that choice fills only fields the classifier left UNKNOWN (`applyCustomerProductFamily`: `ingredientFamily !== 'unknown' → unchanged`; archetype/form/role defaults apply only when `UNKNOWN`/`NEITHER_REVIEW`; `classificationSource: 'CUSTOMER_CONFIRMED'`, `customerProductFamily.ts:100-140`). PASS.

**Immutable snapshot / version.** The accepted profile and behaviour are written into `product_versions.facts.productIntelligence.{productBehaviorAuthority, productProfileAuthority}` for version 1 with a sha256 `facts_fingerprint` (`20260827100000:305-337`); recipe use references the version/binding (Section 13). PASS.

**Findings.**
- F11.1 (P3) The customer family choice can set `intendedUsageRole` (e.g. `BASE_ONLY`) when the classifier returned `NEITHER_REVIEW`; the value still passes `validateProductBehaviorAuthority`, so it cannot bypass the authority, but the UI does not tell the customer that their family pick influences the allowed role.
- F11.2 (P3) Two TypeScript authorities are imported by the Deno edge function through relative paths into `src/` (`productBehaviorAuthority.ts`, `productRecognition.ts`); one source of truth (good), but a client-side refactor silently changes server behaviour — the fingerprint test covers only the SQL function.

**Verdict.** PASS — Scan Import defers to the canonical ProductBehaviour authority; no bypass found.

## SECTION 12 — PRICE

**Standing contract.** Missing price = costing incompleteness only, never a technical Engine failure (owner rule "MOJA CENA": a missing price must never block the engine; a user-level price is saved as the user's own price, never into Mapper).

**Implemented.**
- Price is modelled as a *state*, not a requirement: `{ state: 'known', pricePerKg, currency, source: 'private' | 'reference' } | { state: 'missing', pricePerKg: null, currency: null, source: 'missing' }` (`src/features/product-intelligence/recipeBehaviorAuthority.ts:390-421`); "the private overlay wins without ever entering the immutable shared" product record (`:393`).
- Costing (`src/features/pro-core/costing.ts:24-72`) resolves `customer_override` → `mapper_reference` → nothing, with every branch null-safe; `effectiveRecipePricing.ts` / `costContracts.ts` carry the incompleteness forward as cost state.
- The scanner writes the customer's price only to the per-user overlay: `privateOverlay.price` validated (finite, ≤ 1 000 000, else `invalid_private_price` 400, `product-scan-finalize/index.ts:570-578`) → RPC `p_private_overlay` → `user_product_relations.private_price/currency` (Section 8). The central `products` / `product_versions` rows never receive it. PASS (rule respected).
- No price field participates in the profile or readiness authorities: `_shared/intimportWholeProfileAuthority.ts` and `productEvidenceConfidence.ts` contain no price logic (grep: 0 hits), so `productAccuracyAssessment.criticalBlockers` cannot contain a price gap and `engineUsable` is price-independent. PASS.

**Loop check (import without price → recipe → technical calculation → save → identity).** Identity and version are created regardless of price (Section 7); the recipe authority reports `price.state = 'missing'` and costing marks the recipe cost incomplete; nothing in the audited path turns that into a solver refusal. PASS.

**Findings.**
- F12.1 (P3) The scanner's price prompt is optional and un-hinted: nothing tells the customer that leaving it empty leaves the recipe cost incomplete (copy check only; not a correctness issue).
- F12.2 (P3) `privateOverlay.price` is stored as a single number without a unit basis on the scanner path (`price` per what? the RPC maps `privatePrice` per kg on the ingest path, `20260813110300:1914`); the scanner call site sends `price` — the unit is implied. Worth one explicit field name.

**Verdict.** PASS.
