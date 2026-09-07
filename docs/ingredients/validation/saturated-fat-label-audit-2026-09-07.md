# Saturated fat / Label close-out audit — 2026-09-07

Status: audit complete; Mapper correction manifest generated but **not applied**. Starting
`origin/staging`: `15df057c1d3af5f3b0f12910e81a324ffaa333a7`.

## Executive finding

The system already has a saturated-fat channel from source facts through the Engine, draft,
snapshot, HTML and PDF. No new nutrition field is required. The loss occurred before repository
import: early MyGelato/Pinguino source CSVs did not contain a saturated-fat column, but the
externally assembled `PINGUINO_MAPPER_BASEMENT_FINAL_CLEAN.csv` wrote `0` into that column. Commit
`8c79b75b` then imported that already-flattened file byte-for-byte. No reproducible pre-import
conversion script survives in the repository. The current seed generator correctly maps a blank
numeric cell to SQL `NULL`; this close-out adds a guard that rejects `0` when source notes say the
field was absent.

Examples proving the boundary:

- `central_db_screenshots_B001_rows_001_019.csv` and
  `mapper_screenshots_batch_2026-06-22_2256-2258.csv` have total fat but no saturated-fat column.
- The later `mapper_screenshots_batch_2026-07-07_0056-0059_fruit_purees_juices_pinguino_style.csv`
  does have `saturated_fat_percent`; source rows Q837/Q855/Q0026 correctly leave it blank.
- In the old final file, Q0562 and Q696 contain `0` while their notes say saturated fat was not
  present. The later Q837/Q855/Q0026 rows remain blank. This excludes the Engine and current seed
  generator as the original point of invention.

## Current staging coverage (2089 active products)

Read-only staging query repeated on 2026-09-07. The 2089th active row is the intentionally added
GELLATTI STABILIZER (`PI-ING-002114`); it is not drift.

| State                                         | Products |  Share |
| --------------------------------------------- | -------: | -----: |
| Positive value                                |      107 |  5.12% |
| `0`                                           |     1564 | 74.87% |
| `NULL`                                        |      418 | 20.01% |
| `0` with total fat > 0                        |     1028 | 49.21% |
| Source explicitly lacked field, now `0`       |      733 | 35.09% |
| Source explicitly lacked field, still `NULL`  |      406 | 19.44% |
| Positive and `Estimated / Needs Label Review` |       91 |  4.36% |
| Other positive, but not proven at field level |       16 |  0.77% |

For the 1150-row MyGelato/Pinguino cohort: 0 positive, 733 zero, 417 `NULL`, and 1139 source notes
explicitly say saturated fat was absent. A product-level `Verified` status is therefore not
field-level evidence.

The generated 2089-row review manifest is
`mapper_saturated_fat_owner_review_manifest.csv`. Its mutually exclusive categories are:

| Review category                                           | Rows |
| --------------------------------------------------------- | ---: |
| Documented placeholder zero                               |  733 |
| Documented unknown                                        |  406 |
| Estimated positive                                        |   91 |
| Positive without proven field evidence                    |   16 |
| Suspicious zero with positive fat                         |  452 |
| Zero requiring field evidence                             |  377 |
| Unknown not explicitly documented                         |   12 |
| Exact official value found, basis reconciliation required |    1 |
| Exact documented zero candidate                           |    1 |

Every row is `PENDING_OWNER_REVIEW`. No canonical CSV or database value was changed.

Until that manifest is reviewed, the Label authority treats every current Mapper saturated-fat
value—including the 107 positives and rows whose product-level status says `Verified`—as lacking
field-level evidence. They therefore do not enter an automatic label result. Exact Registry,
Scanner/manufacturer/database evidence and validated manual final values continue through the
existing label channel.

## Existing fields and units

| Layer / field                                                                  | Stored basis and unit                                                         | `NULL` / `0` handling                                    | authority / provenance                                                 |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------- |
| Mapper `saturated_fat_percent`                                                 | grams per 100 g (numeric percentage by mass)                                  | `NULL` means unknown; legacy `0` is ambiguous            | row verification metadata and source notes; often no field-level proof |
| Scanner / Registry `nutrition.saturatedFat` and `facts.nutrition.saturatedFat` | declared nutrition basis, normally g/100 g; basis accompanies facts           | nullable; direct zero only with exact evidence           | scan/OFF/manufacturer evidence on exact product version                |
| Product `technicalComposition.saturatedFat`                                    | g/100 g technical composition                                                 | nullable                                                 | selected product/version authority                                     |
| Recipe snapshot `label_nutrition_per_100g.saturatedFat`                        | g/100 g                                                                       | nullable                                                 | frozen product behaviour snapshot                                      |
| Engine `composition.saturated_fat_percent`                                     | g/100 g ingredient                                                            | property absent means unknown                            | Mapper/Product handoff; no inference                                   |
| Engine `nutrition_per_100g.saturated_fat_g`                                    | g/100 g final recipe                                                          | `NULL` if any relevant ingredient is missing             | weighted calculation from actual/planned grams                         |
| Label `nutritionSource.saturated_fat_g`                                        | g/100 g final sold product                                                    | only finite `>0` and `<= fat_g` is printable             | Engine result or manual final value                                    |
| Label `saturatedFatAuthority`                                                  | metadata, no unit                                                             | `missing`, calculated/evidenced, or `manual_final_value` | source references and missing ingredient names                         |
| `country_local_products.saturated_fat_g`                                       | numeric value copied from evidence panel; schema has no explicit basis column | nullable; basis must be read from evidence               | exact country-local product, GTIN, evidence URL and note               |

Conflict order: exact product label/technical sheet → exact Registry/Scanner evidence → recognized
database for a truly matching generic product → manual final recipe/batch value → missing. A weaker
source does not replace a stronger one. The runtime calculation itself remains the Engine's
existing weighted implementation.

## Owner QA recipe `asdf`

Latest recipe: `848ebb73-0eae-44a2-b189-cb963ba78685`; frozen recipe version
`7be28d77-c19b-4ab1-8b06-6bd3c9d9f890`; completed run
`73eed58f-7748-4844-9fd2-aadb9e5c1a0f`; actual final mass `685 g`. It has eight ingredients and no
toppings. GELLATTI STABILIZER is not in this recipe.

| Canonical ID / role      | Ingredient                                 | Planned → actual |   Total fat |                                Saturated fat | authority / source                                                           | status                          | Used for automatic sat result                             |
| ------------------------ | ------------------------------------------ | ---------------: | ----------: | -------------------------------------------: | ---------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------- |
| PI-ING-001553 / Main     | STRAWBERRIES · Fresh Fruit                 |      331 → 331 g | 0.3 g/100 g |                                      UNKNOWN | Pinguino screenshot Q0026; source says field absent                          | UNKNOWN                         | No                                                        |
| PI-ING-000236 / unlocked | MILK 3.5% · Milk · Chilled                 |         10 → 9 g | 3.5 g/100 g |                                     stored 0 | General legacy row, no field proof                                           | PLACEHOLDER ZERO                | No                                                        |
| PI-ING-000180 / unlocked | CREAM 30% · Mlekovita Cream · Chilled      |        95 → 95 g |  30 g/100 g | Mapper 0; exact PL evidence says 20 g/100 ml | Mapper General vs exact GTIN 5900512904443; basis not reconciled             | PLACEHOLDER ZERO / SOURCE FOUND | No                                                        |
| PI-ING-000264 / unlocked | PROTEIN GEL WPC · Sempre Dairy · SEMPRE230 |        55 → 68 g |   7 g/100 g |                                     stored 0 | General legacy row, no field proof                                           | PLACEHOLDER ZERO                | No                                                        |
| PI-ING-001409 / unlocked | WATER · Liquid                             |        85 → 85 g |   0 g/100 g |                                      UNKNOWN | Pinguino screenshot Q0012; source says field absent                          | UNKNOWN                         | No (nutritionally immaterial, but not rewritten as proof) |
| PI-ING-000514 / unlocked | SUCROSE SUGAR · Sweetener · Dry            |        25 → 25 g |   0 g/100 g |                                     stored 0 | General legacy row, no field proof                                           | ZERO REQUIRES EVIDENCE          | No                                                        |
| PI-ING-000494 / unlocked | DEXTROSE · Sweetener · Dry                 |        67 → 67 g |   0 g/100 g |     Mapper 0; exact PL product has 0 g/100 g | exact GTIN 5902751322798 exists but is not linked to this generic recipe row | DOCUMENTED EXACT ZERO CANDIDATE | No until version match                                    |
| PI-ING-000492 / unlocked | TARA GUM · Stabilizer                      |          2 → 5 g | 0.5 g/100 g |                                     stored 0 | General legacy row, no field proof                                           | PLACEHOLDER ZERO                | No                                                        |

Total fat is reproducible:

`(331×0.3 + 9×3.5 + 95×30 + 68×7 + 85×0 + 25×0 + 67×0 + 5×0.5) / 100 = 34.593 g`

`34.593 / 685 × 100 = 5.05007299 g/100 g`, displayed as `5.1 g`.

The saturated-fat numerator cannot be completed without guessing, so the automatic recipe result
is `NULL`. Snapshot v1 correctly held `nutritionSource.saturated_fat_g = null`. Snapshot v2 held
`11 g/100 g` with `manual_final_value`; that number was entered by the Owner solely to test the
form. The Engine and Mapper did not produce it. The old form accepted the impossible relation
`11 > 5.1`; the close-out now rejects it without clipping or substituting zero.

## Source → Mapper comparisons

| Exact/source product                               | Source                              |            Source value | Mapper row           | Mapper value | Finding                                                                                  |
| -------------------------------------------------- | ----------------------------------- | ----------------------: | -------------------- | -----------: | ---------------------------------------------------------------------------------------- |
| Mlekovita Śmietanka Polska 30%, GTIN 5900512904443 | manufacturer page, read 2026-09-03  |             20 g/100 ml | PI-ING-000180        |    0 g/100 g | source exists, but basis and exact-version binding must be reconciled before update      |
| Swojska Piwniczka dextrose, GTIN 5902751322798     | exact product page, read 2026-09-03 |               0 g/100 g | PI-ING-000494        |    0 g/100 g | exact zero documented for this version; canonical propagation still needs Owner approval |
| STRAWBERRIES Q0026                                 | Pinguino screenshot                 |            field absent | PI-ING-001553        |       `NULL` | correctly preserved                                                                      |
| WATER Q0012                                        | Pinguino screenshot                 |            field absent | PI-ING-001409        |       `NULL` | correctly preserved                                                                      |
| Early Q0562/Q696 imports                           | raw screenshot CSVs                 | no saturated-fat column | old final Mapper CSV |          `0` | value was invented during external final-file assembly                                   |

## Minimal, non-guessing remediation plan

1. Owner reviews the 2089-row manifest; no bulk update is implicit.
2. Apply only the 733 documented placeholder changes `0 → NULL` in a separate, approved data PR.
3. Bind exact GTIN/version evidence before adopting manufacturer values; preserve basis (`100 g` vs
   `100 ml`) and acquisition date.
4. Review 91 estimates separately. Do not promote them from a product-level status.
5. Verify candidate true zeros at field level. Do not infer saturated fat from total fat.
6. Leave every unresolved value `NULL`; the Engine then returns `NULL` when a fat-bearing input is
   unresolved.
7. Keep printing available. Omit the row, mark the output informational, and allow a validated
   manual final recipe/batch value.

The canonical Mapper dataset, Scanner, Product Registry, recipe Engine and production logic were
not modified by this close-out.
