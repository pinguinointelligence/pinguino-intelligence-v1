# Mapper Basement — naming & architecture

`mapper_basement` is the locked PINGÜINO reference library. It is read-only from the application and changes only through an owner-approved dataset replacement. Customer imports and user products belong to `products`, never to Mapper Basement.

## One active source

- `docs/ingredients/validation/mapper_basement.csv` is the only active source file.
- `docs/ingredients/validation/history/` contains provenance snapshots only. Runtime code, validation and seed generation must never fall back to those files.

The active Mapper 2088 source has:

- 2,088 unique `ingredient_id` rows and 62 columns;
- stable IDs from `PI-ING-000001` through `PI-ING-002113`, with intentional gaps;
- `approved_for_base` and `approved_for_engines` approval fields;
- no ingredient-level `npac_value`;
- `pac_value` as ingredient freezing-power input and `pod_value` as sweetness input;
- blank PAC/POD only for explicitly non-engine-approved research rows.

Recipe-level PAC, POD and NPAC remain deterministic Engine outputs. The dataset must not be rewritten to manufacture missing scientific values.

## Runtime and database

- `src/services/ingredients.ts` reads `public.mapper_basement` only.
- `supabase/seed/mapper_basement_v1_0.sql` is generated from the active CSV.
- Exact regeneration command (PowerShell):
  `$env:SEED_TABLE='public.mapper_basement'; $env:SEED_DATASET_VERSION='v1.0'; $env:SEED_OUT='mapper_basement_v1_0.sql'; node scripts/generateIngredientSeed.mjs docs/ingredients/validation/mapper_basement.csv`.
- The replacement seed runs in one transaction, soft-deactivates rows absent from the active source, upserts and reactivates the 2,088 canonical rows, and asserts the final active count.
- The stable `public.mapper_basement` table is retained so foreign-key references remain valid.
- Application roles receive read access only through existing RLS; no customer-facing path can write Mapper Basement.

## Mapper Basement vs Products

- `mapper_basement`: locked, owner-approved reference data.
- `products`: customer/external catalogue items, OCR/barcode imports and review workflow.

A reviewed product may be promoted only by a human-approved replacement of the active CSV and regenerated seed. There is no automatic promotion or mutation path.
