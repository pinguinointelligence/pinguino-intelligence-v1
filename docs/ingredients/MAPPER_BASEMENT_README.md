# Mapper Basement — naming & architecture

**`mapper_basement` is the locked reference brain** — the approved PINGÜINO base ingredients/products and their technical values. It is **never automatically modified**; it changes only by an approved internal **version replacement**. It is **not** used for customer uploads.

## The one active source file

- **`docs/ingredients/validation/mapper_basement.csv` — the ACTIVE official source file.** This is the single dataset the team and tooling point at.
- `docs/ingredients/validation/mapper_basement_v0_95.csv` — an **archive / provenance snapshot only**. It is a backup of this version's content, **not a second active source**. Never edit or query the snapshot as if it were live.

## What this file is (Slice A scope)

`mapper_basement.csv` is the committed v0.95 (no-NPAC) dataset with **only the two column headers renamed** — **values are unchanged from v0.95 except the column names**:

| Old column (v0.95) | New column |
|---|---|
| `approved_for_pinguino_base` | `approved_for_base` |
| `approved_for_minus_11_engine` | `approved_for_engines` |

**Why `approved_for_engines`:** composition/product data is universal and can be used by different PI recipe engines later (−11°C, −12°C, −13°C). It must not be named as if it belongs only to the −11°C engine.

- **542 rows, 62 columns.** No numeric ingredient value changed (verified cell-for-cell against the v0.95 dataset).
- **`npac_value` stays removed.** Do not reintroduce it; do not copy `pac_value` into `npac_value`.
- **`pac_value` is the source of truth for ingredient freezing power.** **`pod_value` is the source of truth for sweetness.** Recipe-level PAC/POD/NPAC are computed by the deterministic engine.

## Mapper Basement vs Products

- **`mapper_basement`** = locked reference data (this dataset). Read-only reference brain.
- **`products`** (future, separate table) = the growing layer for everything new: Mercadona/Colin catalogs, customer-added products, camera/barcode/EAN/OCR scans, product images, manual entries, and PI-Calculated/Generated/Manual-Adjusted/PI-Verified products.
- **Rule:** all new external/customer/user products go into **`products`**, never into `mapper_basement`. A `pi_verified` product may **later** be reviewed by the team and **manually** promoted into a new `mapper_basement.csv` version — never automatically.

## What Slice A does NOT change (important)

This slice is **naming + source file + docs + tests + build-script forward-compatibility only**. It does **not** touch the live app:

- The runtime Supabase service **still queries `ingredients_final_v0_95_no_npac`** (unchanged) — the app keeps working exactly as before.
- `IngredientRow`, the ingredient mapper, the Studio picker, and the intake schema (`ingredientIntakeColumns.ts`, still using the old column names) are **unchanged**.
- The build scripts (`scripts/validateIngredientCsv.mjs`, `scripts/generateIngredientSeed.mjs`) were made to **recognize** the new column names for future use; their canonical output naming flips later.

The Supabase `public.mapper_basement` table + seed and the service/type switch to `approved_for_engines` are **Slice B**, applied only after the new table exists live. The `products` skeleton table is **Slice C**.
