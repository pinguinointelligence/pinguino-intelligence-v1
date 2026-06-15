# PINGÜINO Base Approved Ingredients — Official Intake

This is the **official intake format** for collecting tested, safe **PINGÜINO Base**
ingredients before they are imported into the app database. It is for Hermes (and
future import tooling) to fill in by hand from trustworthy sources.

> This is **not** an app feature, **not** a Supabase import, and **not** engine work.
> It is a frozen data contract. No values are computed here.

## What to use

- **Frozen schema:** [`PINGUINO_BASE_INGREDIENTS_SCHEMA.md`](PINGUINO_BASE_INGREDIENTS_SCHEMA.md)
  — the authoritative columns, types, defaults, allowed values and validation rules.
  Machine-readable mirror: [`src/data/ingredients/ingredientIntakeColumns.ts`](../../src/data/ingredients/ingredientIntakeColumns.ts).
- **CSV template (headers only):** [`pinguino_base_ingredients_template.csv`](pinguino_base_ingredients_template.csv)
  — copy this and add one row per ingredient.
- **Worked example:** [`example_pinguino_base_ingredient_row.csv`](example_pinguino_base_ingredient_row.csv)
  — a single **example-only** sucrose row (clearly not an approved ingredient).

Hermes must use the frozen schema exactly. Do not add, rename, reorder, or drop columns.

## How to fill it in

- **Per 100 g.** All composition values are per 100 g unless a column explicitly states otherwise
  (`brix` is °Bx, `cost_per_kg` is per kg, `kcal_per_100g` is per 100 g, `shelf_life_days` is days).
- **Use verified label / supplier / external-reference data whenever possible.** Prefer the
  product label, then the supplier technical sheet, then a documented external reference.
- **Do not invent missing values.** Unknown numeric fields stay **blank** (or `null`); unknown
  booleans stay **`unknown`**. Set `verification_status` honestly:
  `draft` → `internet_data` → `label_data` / `supplier_data` / `external_reference_data` →
  `needs_review` → `verified` (or `rejected`).
- **`0` means a verified true zero only** (e.g. sucrose fat = 0). Never use `0` for "I don't know".
- **Record provenance.** Fill `verification_source`, `data_confidence_percent`, and where possible
  `source_url` / `screenshot_reference` and `verification_date`.
- **Stable ids.** Give every ingredient a stable `ingredient_id` that is never reused or renamed.

## Trust & engine safety

- An ingredient profile is **reusable data, not a recipe**.
- **`verified` ingredients may later be used by the engine.**
- **`pending` / `draft` / `internet_data` / `needs_review`** (and `rejected`) ingredients are **NOT
  safe for automatic recipe generation** and must not be used by the engine.
- **POD / PAC / NPAC from an external source may be stored** if available, but **must** carry a
  `verification_source` and a `data_confidence_percent` (and ideally `source_url`).
- Set `approved_for_minus_11_engine = true` **only** when the engine-approval gate in the schema
  is fully met (verified, confidence ≥ 90, core composition + sugar split present, POD/PAC/NPAC
  present or derivable, source documented). When in doubt: leave it `false`.

## Scope

This intake sheet is for **PINGÜINO Base** ingredients first, but the schema is intentionally
general so future import tooling (other categories, larger catalogs) can reuse it unchanged.
