# Mapper — Implementation Status

_Living status tracker for the PINGÜINO product-intake "Mapper". Evidence-based; nothing
here is assumed complete. Last updated 2026-06-29 at repo HEAD `1d8b930`._

## Architecture invariants (must always hold)
- `mapper_basement` is the **locked reference brain** (`PI-ING-…`); never auto-written by intake.
- `products` is the **growing** product layer (`PR-ING-…`, DB sequence); all new products land here.
- **No `npac_value`** anywhere (v0.95 no-NPAC). Engines use `pac_value` + `pod_value`; recipe-level PAC/POD is computed in recipe logic.
- **"Matched" = mapping confirmed, NOT engine-ready.** Product `pac_value`/`pod_value` stay NULL until a scientifically valid source/provenance path exists.
- Recipe engines must consume **Mapper-prepared** profiles, never raw OCR/catalog/image fields.
- Customer-facing statuses: **Verified, PI Calculated, PI Generated, Manual Adjusted, PI Verified** — never the word "Mapper"; internal confidence % is never shown to customers.
- Products with sweeteners/polyols/protein desserts/hidden formulas/incomplete OCR/conflicts must **not** auto-verify.

## Live DB state (read-only, 2026-06-29)
| metric | value |
|---|---|
| products total | 69 |
| product_category set / null | 69 / 0 |
| mapper_status matched | 11 (all `manual_mapping` / `high`) |
| mapper_status rejected | 3 |
| mapper_status needs_review | 0 |
| mapper_status null | 55 |
| mapper_basement | 542 (untouched) |
| matched products with pac/pod NULL | 11 / 11 (none engine-ready — by design) |

## Requirement status

| # | Requirement | Status | Evidence | Gap / next |
|---|---|---|---|---|
| 1 | mapper_basement locked reference base | **Done** | `migrations/0006_mapper_basement.sql`; read-only `services/ingredients.ts` (`listEngineApprovedIngredients`) | — |
| 2 | products table + `PR-ING` sequence | **Done** | `0007_products.sql`, `0009_products_identity.sql` (`products_code_seq`, `next_product_code()`), `0010` grants; `data/products/productRow.ts` | — |
| 3 | duplicate prevention | **Done** | `0009` per-owner unique indexes on normalized EAN/barcode; `data/products/productIdentity.ts`; `services/products.ts` `createProductWithIdentity`/`findExistingProductForIdentity` | — |
| 4 | no `npac_value` | **Done / enforced** | absent in live code; `engine/noNpacRegression.test.ts`; `studioBoundary` + `productsSecurity` guards | keep guarding |
| 5 | statuses (lifecycle) | **Partial** | `ProductStatus` vocabulary + `0007` CHECK (`draft/pi_calculated/pi_generated/manual_adjusted/pi_verified/rejected`) | **no code sets `products.status`** — only `mapper_status` is written. Transition rules + customer-facing label mapping not built |
| 6 | confidence scoring | **Partial** | `match_confidence` set by `productMatcher.ts`; internal-only | no product-level data-confidence aggregation; `mapper_basement.data_confidence_percent` is inert |
| 7 | red flags | **Done (detection)** | **NEW** `data/products/productRedFlags.ts` (+ test) — pure detector; `blocksAutoVerify()` | not yet wired to a status gate (intentional — no auto-verify exists yet) |
| 8 | table/catalog import | **Done** | `data/products/productTableParser.ts`, `services/productCatalogImport.ts`, `pages/destinations/ProductImportPage.tsx` (`/products/import`); **NEW** subcategory→category fallback (`02c58db`) | — |
| 9 | OCR / image intake | **Missing** | placeholder columns only (`product_image_url`, `detected_text`, `extracted_json`) | no OCR/image pipeline — see enrichment plan |
| 10 | barcode/EAN intake | **Partial** | EAN/barcode normalization (`0009` generated cols) + dedupe done | external barcode **lookup** + scan UI missing |
| 11 | online enrichment | **Missing** | none | no external fetch — see enrichment plan |
| 12 | simple PI Calculated logic | **Deferred** | status value exists | gated on pac/pod provenance (see handoff plan) |
| 13 | complex PI Generated logic | **Deferred** | — | profile-JSON columns deliberately absent (`0008`) |
| 14 | similarity search | **Partial** | `category_composition_similarity` (5 measured fields, ≤2pp mean) in `productMatcher.ts` | no vector/embedding/fuzzy-distance search |
| 15 | ratio-based profile generation | **Missing** | none | — |
| 16 | snapshots / versioning | **Missing** | `dataset_version` inert; no history table | — |
| 17 | manual adjustment | **Done** | `services/productReview.ts` (`confirmProductMatch` / `confirmProductMatchTo` / `rejectProductMatch`); `/dev/mapper-review` | — |
| 18 | PI Verified flow | **Deferred** | status value exists | no flow; gated on engine-readiness + red-flag gate |
| 19 | engine handoff | **Partial** | **NEW** pure `data/products/productEngineResolver.ts` (read-only reference-link resolver, explicit provenance) | not yet wired into a recipe→product path or provenance UI |
| 20 | product intake UI | **Partial** | CSV `ProductImportPage` + DEV pages (`/dev/mapper-smoke`, `/dev/mapper-batch-6`, `/dev/mapper-review`) done | OCR/barcode/enrichment intake surfaces missing |

## Requires approval before proceeding
- **Writing to `mapper_basement`** — e.g. adding the missing **almond / erythritol / stevia** references (blocking several products). Locked base; needs explicit go-ahead.
- **Any pac/pod write onto products** — forbidden until a provenance path is approved (the resolver links read-only instead).
- **products.status transitions** — need the customer-facing status rules signed off before any code sets `pi_calculated`/`pi_verified`.

## Product review progress (mapping decisions, not engine-readiness)
- **11 matched** (manual review): 000006, 000010, 000011, 000012, 000013, 000029, 000031, 000036, 000043, 000044, 000070.
- **3 rejected** (false matches): 000015, 000020, 000054.
- **55 unmapped** (`null`): 7 reviewed-but-parked (000035 pick-which-pistachio; 000040/041/042 no almond ref; 000056 composite dessert; 000060/062 no erythritol/stevia ref) + ~48 unreviewed (zero-composition + broad-ambiguous).
- **Basement reference gaps to add later (approval required):** almond, erythritol, stevia.

## Recent commits
`1cf0e7c` numeric coercion · `47efccd` 5-measured-field matcher · `02c58db` import subcategory fallback · `48efe9a` multi-candidate review · `1d8b930` red-flag detector + engine resolver.

See also: [PACPOD_ENGINE_HANDOFF_PLAN.md](PACPOD_ENGINE_HANDOFF_PLAN.md), [INTAKE_ENRICHMENT_PLAN.md](INTAKE_ENRICHMENT_PLAN.md).
