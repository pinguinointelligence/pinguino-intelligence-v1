# Product Intake & Enrichment — Reality Check + Plan

_What exists today for catalog/OCR/barcode/online enrichment, and concrete, safe slices to
extend it. No fake OCR/internet systems; no paid APIs or secrets. 2026-06-29._

## Reality check (audited)
| Capability | State | Evidence |
|---|---|---|
| Table/catalog CSV upload | **Built** | `productTableParser.ts` → `productCatalogImport.ts` → `/products/import` |
| Subcategory→category fallback at import | **Built** | `mapRowToProductInsert` (`02c58db`) |
| Duplicate prevention | **Built** | identity hash + per-owner normalized EAN/barcode unique indexes |
| EAN/barcode normalization | **Built** | `0009` generated columns + `canonicalEan` |
| Barcode **lookup** (external) | **Missing** | no lookup, no scan UI |
| OCR / image intake | **Missing** | placeholder columns only (`product_image_url`, `detected_text`, `extracted_json`) |
| Online enrichment | **Missing** | no network fetch anywhere |
| Source confidence / conflict flags | **Partial** | red-flag detector built (`productRedFlags.ts`); no cross-source confidence/conflict yet |
| Snapshots / versioning | **Missing** | `dataset_version` inert; no history table |

### Source of the current 69 products (Google Drive)
The Mercadona catalog lives in the team Drive as the spreadsheet **"Mercadona_catalog"** (`docs.google.com/spreadsheets/d/1Z1HgPMRMy3yy0PSnb-xtI0L4KmAF2MCuO0luRdjaABA`, owner pinguinointelligence@gmail.com). Its README states, verbatim intent: _"Empty fields (deliberate, per spec): PAC/POD computed later by PINGÜINO engine; Milk solids / Cocoa solids / Fruit solids computed later; Approved for −11°C engine set by human reviewer"_ and _"Yellow rows: products flagged needs_review (sweeteners, polyols)"_. This confirms: the catalog carries **no water, no total_solids, no sugar-type breakdown, no PAC/POD** — exactly the DB state — so Drive cannot supply engine values; they are downstream (reference-linked) by design.

## Importer contract (the stable seam future intakes target)
Every intake — CSV today, OCR/barcode/enrichment later — must converge on the SAME pure step: produce honest `ProductInsert` candidates, then `createProductWithIdentity` (dedupe), then OPTIONAL match. There is **one** pipeline, many sources (`generic` / `mercadona` / `colin` → `source_type`).
- **Input** → normalized headers via `HEADER_ALIASES`; measured fields accepted: brand, name, category, subcategory, EAN/barcode, package, cost_per_kg, kcal, **fat, saturated_fat, carbohydrate, total_sugars, protein, salt**, allergens, ingredients-text (`detected_text`), urls.
- **Honesty** → blank → NULL (never 0); EAN strings keep leading zeros; unknown category → null (subcategory fallback may fill it; never guessed).
- **Output** → `ProductInsert` (never sets `product_code`/normalized cols/mapper-result/pac-pod).
- **No matching, no `mapper_basement` read/write at parse time.** Matching is a separate, explicit step.

## Concrete slices (each its own gated PR; safety rules below)
1. **Table upload** — ✅ done.
2. **Source-confidence + provenance model** — add a per-field provenance tag (`label` / `catalog` / `ocr` / `enrichment` / `manual`) + an internal confidence. Pure model first; storage later (likely a JSON column → migration, **requires approval**). Feeds requirement #6.
3. **Conflict flags** — extend the pure detector: cross-source mismatch (e.g. catalog sugars vs enrichment sugars) + the existing `productRedFlags` signals. Pure, no DB.
4. **Barcode lookup** — a keyless, free source only (e.g. OpenFoodFacts, no API key). Read-only fetch → `ProductInsert` candidate + source confidence + conflict flags vs any existing row. **Network slice — build behind an explicit, tested adapter; no secrets; user-triggered, never automatic.**
5. **OCR / image intake** — uploaded label image → text → `detected_text` → parse → candidate. OCR engine TBD but must be **keyless/local** (e.g. browser Tesseract.js) — no paid vision API. `incomplete_text` red flag already guards partial OCR.
6. **Online enrichment** — generalize (4): keyless sources, source confidence, conflict flags, never overwrite a higher-confidence value silently. User-triggered.
7. **Snapshots / versioning** — a `product_profile_snapshots` table capturing each profile state + provenance for the PI Verified audit trail (**migration → requires approval**).

## Safety rules (apply to every slice)
- No paid external APIs; no secrets/keys committed; no `.env` writes.
- No automatic network calls — enrichment/lookup is explicit + user-triggered.
- Never write `mapper_basement`; never insert products into it.
- Recipe engines never read `detected_text`/`extracted_json`/`product_image_url` — only Mapper-prepared fields.
- Red-flagged products (sweeteners/polyols/protein/conflicts/incomplete OCR) never auto-verify.
- Keep product PAC/POD NULL; engine values come via the reference-linked resolver (see [PACPOD_ENGINE_HANDOFF_PLAN.md](PACPOD_ENGINE_HANDOFF_PLAN.md)).
