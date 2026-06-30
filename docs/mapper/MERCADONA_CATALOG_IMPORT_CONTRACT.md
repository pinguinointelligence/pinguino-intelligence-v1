# Mercadona Catalog — Import Contract

_The contract between the Google Drive "Mercadona_catalog" sheet and the app's CSV importer.
The existing app upload already works — this documents the seam; it does NOT add a second
importer. Re-verified against the live Drive sheet 2026-06-30._

## Live re-verification (2026-06-30, read-only via Drive connector)
Inspected the live sheet's README + Products header. The 21 columns **still match** the parser's
`HEADER_ALIASES` mapping below (Group · Subcategory · Product Name · Brand · Price · Package ·
Price/kg · Mercadona Category · Mercadona URL · Ingredients (key) · Allergens · Kcal · Fat ·
Sat.Fat · Carbs · Sugars · Protein · Salt · Storage · Notes · EAN). No contract drift.
- **README nutrition provenance (verbatim):** _"From product labels via OpenFoodFacts / finditapp.es / press."_ → the catalog's nutrition was ALREADY sourced from OpenFoodFacts, so a later OFF re-enrichment of these products is **largely redundant** (and Hacendado private-label is 404 in OFF anyway). Enrichment value is for NON-catalog / branded products, not these 69.
- **README count note:** header says _"all 70 products across 7 groups"_ but Total products = 69 (DB = 69). Treat 69 as authoritative; the "70" is a stale README figure.
- **No products created or modified** during this inspection (read-only).

## Source
- Google Drive sheet **"Mercadona_catalog"** (`docs.google.com/spreadsheets/d/1Z1HgPMRMy3yy0PSnb-xtI0L4KmAF2MCuO0luRdjaABA`), owner pinguinointelligence@gmail.com. 69 products, 7 groups (A Dairy, B Chocolate, C Nuts, D Frozen, E Protein, F Sin Azúcar, G Coffee/Vanilla).
- README intent (verbatim): PAC/POD + milk/cocoa/fruit solids "computed later by PINGÜINO engine"; "Approved for −11°C engine" set by a human reviewer; "Yellow rows = needs_review (sweeteners, polyols)".

## Flow (one pipeline, no duplicate importer)
Export the sheet's **Products** tab → CSV → app `/products/import` with **source = mercadona** → parse preview → import (identity dedupe) → optional explicit match. Internal (Colin/Mercadona) and customer uploads share this same flow.

## Column → field mapping (`productTableParser.HEADER_ALIASES`)
| Sheet column | → ProductInsert field |
|---|---|
| Subcategory | `product_subcategory` (+ drives `product_category` fallback via `mapProductSubcategory`) |
| Product Name | `product_name_display` |
| Brand | `brand` |
| Package | `package_size` |
| Price per kg/L (€) | `cost_per_kg` |
| Mercadona URL | `product_url` |
| Ingredients (key) | `detected_text` |
| Allergens | `allergens` |
| Kcal/100g | `kcal_per_100g` |
| Fat/100g · Sat.Fat/100g | `fat_percent` · `saturated_fat_percent` |
| Carbs/100g · Sugars/100g | `carbohydrate_percent` · `total_sugars_percent` |
| Protein/100g · Salt/100g | `protein_percent` · `salt_percent` |
| EAN | `ean_code` (string; leading zeros preserved) |

**Deliberately unmapped (warned as unknown columns):** Group, **Price (€)** (ambiguous pack/shelf price — never `cost_per_kg`), Mercadona Category, Storage, Notes.

## Deliberate gaps (by design — confirmed in DB + README)
- **No water, no total_solids, no sugar-type breakdown** → composition matching uses the 5 measured fields (fat/carb/sugars/protein/salt); engine values are NOT derivable from this catalog.
- **No PAC/POD** → resolved downstream via the reference link at engine handoff (`productEngineResolver` / `productEngineHandoff`); never copied onto products.
- **Yellow / Sin Azúcar rows** (sweeteners, polyols, +Proteínas) → flagged by `productRedFlags` and **never auto-verify**.

## Import-safety invariants (enforced in code)
- **Subcategory fallback**: when no explicit category column, `mapProductSubcategory()` fills `product_category`; unknown subcategory stays null (never guessed) — `productTableParser.ts` (`02c58db`).
- **No matching at import**: `importProductCatalog` runs the matcher only when `runMatch` is explicitly set (default off) — `services/productCatalogImport.ts`.
- **No `mapper_basement` write** anywhere in the import path; products land only in `public.products`.
- **Duplicate prevention**: identity hash + per-owner normalized EAN/barcode (`createProductWithIdentity`).

## Recommended (future, ready) — red flags at preview
`detectRedFlags()` is pure and runs on a parsed `ProductInsert`, so the import **preview** can show per-row red flags (sweetener/polyol/protein/incomplete-OCR) before import. Small, safe UI slice — not yet wired; no schema change needed.

See [INTAKE_ENRICHMENT_PLAN.md](INTAKE_ENRICHMENT_PLAN.md), [MAPPER_IMPLEMENTATION_STATUS.md](MAPPER_IMPLEMENTATION_STATUS.md).
