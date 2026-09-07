# Mapper release 2089 → 2147 — what actually changed

Owner release of 2026-09-07. Every number below is produced by comparing the two CSV files cell by
cell, for every shared column and every shared `ingredient_id`. Nothing is taken from a commit
message, a filename or a row count.

|               |                                                          |
| ------------- | -------------------------------------------------------- |
| Previous file | 2089 rows, SHA-256 `057375CD…8DECA7`                     |
| This file     | 2147 rows, SHA-256 `5047D9CA…5DA1F5`                     |
| Added         | 58 ingredients                                           |
| Removed       | **0** — no `ingredient_id` present before is missing now |
| Columns       | identical, same order                                    |

`wc -l` reports 2284 on this file. That is not the record count: 137 rows carry newline characters
inside quoted CSV fields. Parsed as CSV it is 2147 rows with 2147 distinct ids.

---

## 1. The part that is easy to miss: 19 ingredients that were already there changed capability

The 58 new ingredients are the visible half of this release. The half that changes what the engine
can do today is this:

### 1a. Seven sweeteners were unblocked (capability **gained**)

`Blocked` → `Verified / Global Reference`, and `approved_for_base` / `approved_for_engines`
`FALSE` → `TRUE`:

| id            | ingredient                                               |
| ------------- | -------------------------------------------------------- |
| PI-ING-001372 | ERYTHRITOL · Sweetener · Polyol                          |
| PI-ING-001376 | GLYCERIN (GLYCEROL) · Sweetener / Humectant              |
| PI-ING-001382 | XYLITOL · Sweetener · Polyol                             |
| PI-ING-001385 | MALTITOL · Sweetener · Polyol                            |
| PI-ING-001424 | STEVIA (STEVIOL GLYCOSIDES) · Sweetener · High Intensity |
| PI-ING-001427 | SUCRALOSE · Sweetener · High Intensity                   |
| PI-ING-001466 | SORBITOL · Sweetener · Polyol                            |

These seven were previously refused by every gate. They are now BASE-selectable and
engine-calculable, so the solver can reach them in any recipe. This is a real behavioural change
produced by data alone.

### 1b. Twelve base sweeteners were withdrawn from the "Verified" gate (capability **lost**)

`Verified` → `PI Calculated / Global DE Reference`. `approved_for_base` stays `TRUE`:

| id            | ingredient                              |
| ------------- | --------------------------------------- |
| PI-ING-000495 | GLUCOSE SYRUP DRY · DE39                |
| PI-ING-000497 | GLUCOSE SYRUP DRY · Nutridex Syrup      |
| PI-ING-000498 | GLUCOSE SYRUP DRY · Nutridex Syrup      |
| PI-ING-000499 | GLUCOSE SYRUP DRY · Nutridex Syrup      |
| PI-ING-000500 | GLUCOSE SYRUP DRY · DE42                |
| PI-ING-000501 | GLUCOSE SYRUP DRY · DE62                |
| PI-ING-000511 | GLUCOSE SYRUP DRY · DE27–34             |
| PI-ING-000506 | MALTODEXTRIN · Nutridex Sweetener · Dry |
| PI-ING-000507 | MALTODEXTRIN · DE11                     |
| PI-ING-000508 | MALTODEXTRIN · Nutridex Sweetener · Dry |
| PI-ING-000509 | MALTODEXTRIN · Nutridex Sweetener · Dry |
| PI-ING-000512 | MALTODEXTRIN · Nutridex Sweetener · Dry |

**This is the item that needs an owner decision.** `verifiedPrefix()`
(`src/features/product-intelligence/productBehaviorAuthority.ts:201`) admits a Mapper row as a BASE
donor only when `verification_status` starts with `"Verified"`. Twelve dry glucose syrups and
maltodextrins — ordinary gelato base ingredients — no longer satisfy it, while their
`approved_for_base` flag still says `TRUE`.

Five further rows moved `Verified` → `Verified / Global Reference`, which keeps the prefix and
changes nothing.

Nothing here was changed by me. The statuses are as the owner published them; this section only
reports what they do.

---

## 2. The two BASE gates now disagree — an explicit decision item

There are two independent gates, and this release pushed them apart:

| gate                   | where                             | reads                                        | says                                             |
| ---------------------- | --------------------------------- | -------------------------------------------- | ------------------------------------------------ |
| `mapperBaseSelectable` | `mapperRuntimeUsability.ts`       | `approved_for_base` + `is_active`            | **2141** of 2147 are BASE-selectable             |
| `verifiedPrefix()`     | `productBehaviorAuthority.ts:201` | `verification_status` starts with "Verified" | of the 58 new rows, only **9** are BASE-eligible |

For the 58 new ingredients:

| verification_status                 | count | starts with "Verified" | BASE via `verifiedPrefix` |
| ----------------------------------- | ----: | ---------------------- | ------------------------- |
| PI Calculated / Global Reference    |    42 | no                     | **no**                    |
| Verified / Global Reference         |     9 | yes                    | **yes**                   |
| PI Calculated / Global DE Reference |     7 | no                     | **no**                    |

**49 of the 58 new ingredients carry `approved_for_base=TRUE` and are nevertheless withheld from
BASE** by the status gate. Together with the 12 withdrawn above, 61 ingredients are flagged
base-approved and refused by the status rule.

This is a data question — are those sources strong enough to be called Verified? — and it is
deliberately left open. The owner's instruction stands and was followed:

> Nie zmieniaj samodzielnie żadnego z 49 statusów `PI Calculated / Global Reference` ani
> `PI Calculated / Global DE Reference` na `Verified`.

No status was changed. No weight, threshold, taxonomy or recognition rule was changed.

---

## 3. Numeric changes on existing ingredients

24 existing records changed values across 20 numeric columns. The largest groups:

| column           | rows changed |
| ---------------- | -----------: |
| sweetness_factor |           24 |
| freezing_factor  |           24 |
| pod_value        |           18 |
| pac_value        |           17 |
| water_percent    |            8 |
| total_solids     |            8 |
| kcal             |            8 |

These were already written to the shared Supabase project `tunabqqrwabacxjcxxkz`, which serves both
`staging.pinguinoai.com` and `gellatti.com`. An earlier claim that "no numeric or engine column
changed" was wrong and is withdrawn: the cell-by-cell diff above is the correction.

---

## 3a. Golden replay before/after — the solver output DID move

`reports/USER_INTENT_SOFT_HOLD_AUDIT.csv` is 408 solver rows across the scenario matrix, regenerated
from the Mapper. Comparing it against the same file on the previous Mapper:

|                                             |   before |        after |
| ------------------------------------------- | -------: | -----------: |
| Total \|absolute_drift_g\| from user intent | 11 954 g | **12 219 g** |
| Total score                                 |    3 872 |    **3 864** |
| Rows with `hard_valid=true`                 |      224 |          224 |

- **40 rows differ only by `ingredient_name_display`** — `PI-ING-000494` was renamed
  `DEXTROSE` → `DEXTROSE MONOHYDRATE`. Cosmetic.
- **59 rows carry a real change.** Grams move in both directions: `lost_pl_minus13` gets _closer_
  to the user's request (DEXTROSE drift −10 g → −5 g, SKIMMED MILK 1 g → 0 g), while
  `matrix_y40_s60_c120_t13` gets _further_ (PI-ING-000456 drift +50 g → +100 g).
- **Two scenarios flipped validity, one each way.** `matrix_y60_s30_c120_t13` lost `hard_valid` on
  8 lines (score 10 → 9); `matrix_y100_s90_c120_t11` gained it on 8. The count is a wash; the
  behaviour is not.

Net: aggregate deviation from user intent is **2.2% worse** and the total score is **8 lower**.
This is small, and it is caused by data, not by code — the changed `sweetness_factor`,
`freezing_factor`, `pod_value` and `pac_value` above, plus seven sweeteners the solver can now
reach that it previously could not. It is nonetheless a real movement in a golden replay and is
reported rather than absorbed. No engine rule, weight or threshold was touched.

---

## 4. Allergens on the new ingredients

57 of the 58 carry `none_declared`; one carries `gluten_barley`.

`none_declared` means **the source declared nothing**, not "this product is free of allergens".
Read the other way it would put a false allergen-free claim on a printed label. The value is
already handled correctly — `masterLabel` groups it with `unknown` as UNAVAILABLE and prints no
statement — and `src/features/master-label/allergenNoneDeclared.contract.test.ts` now holds that
in place, including a repository-wide guard against anyone deriving an `allergen_free` flag later.

---

## 5. Effective availability of the 58 new ingredients

|                                        |  count |
| -------------------------------------- | -----: |
| BASE-eligible today (`verifiedPrefix`) |  **9** |
| TOPPING-eligible only                  | **49** |
| Covered by the runtime usability audit |  **0** |

The last row is the honest limit. `scripts/auditMapperRuntimeUsability.mjs` classifies an
ingredient from two companion artifacts — process metadata and the ProductBehavior audit — and
each is a per-ingredient judgement that cannot be derived from a Mapper row. Neither exists for the
58 new ingredients.

Rather than synthesise companion rows (which would make the audit run again and make every number
it prints a fiction), the audit is now release-aware: it classifies the 2089 ingredients it holds
evidence for and names the rest in `reports/MAPPER_RUNTIME_USABILITY_NOT_AUDITED.csv`. Its two real
guards keep full strength — a companion may not mention an ingredient the Mapper lacks, and the
Mapper may not drop an ingredient a companion classified.

Commissioning process metadata and ProductBehavior classification for the 58 is the remaining
owner-side step before they are fully audited.

---

## 6. Database

The `mapper_basement_verification_status_check` constraint is a literal whitelist and did not
contain three of the statuses this release uses, so the database refused 82 rows outright —
including all 58 new ones. `supabase/migrations/20260907210000_mapper_global_reference_statuses.sql`
widens the whitelist by exactly those three values:

- `PI Calculated / Global Reference` (42 rows, 42 new)
- `Verified / Global Reference` (21 rows, 9 new)
- `PI Calculated / Global DE Reference` (19 rows, 7 new)

It is idempotent — drop-if-exists then re-add under the same name — and it changes no row and no
rule. The 2089 backup is untouched.
