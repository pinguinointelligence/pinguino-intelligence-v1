# Owner regression specimen — rescued batch that could never be recovered

**Captured 2026-09-04 from served staging `e2e1a61a` (bundle `index-B03Hc6eg.js`),
Supabase project `tunabqqrwabacxjcxxkz`. Read-only: the run was NOT mutated.**

Durable run `2fc85403-2394-4582-a211-4736bfc4ef8e`, owner `4ebc6ec7-b17d-4cd8-8a2d-457280738d6f`,
recipe `1589cbfa-6cf5-4015-a906-1f7c64b37a19` ("g") version **2** = `5432108b-a43c-43e9-89d5-7276f6f11ee2`.

## Durable run row

| field | value |
|---|---|
| status | `in_progress` |
| completed_at | NULL |
| planned_batch_g | 1000 |
| actual_revision | 8 |
| rescue_revision | 1 |
| rescue_accepted_at | 2026-09-04 16:19:04.947269+00 |
| machine | NULL |
| created_at | 2026-09-04 16:18:36.221584+00 |

`completeRun` never ran on the server. The failure is durable recovery, before completion.

## Immutable planned vector (= saved version 2, identical ids and grams)

| position | line_id | name | planned_g |
|---|---|---|---|
| 0 | `new-recipe-0-milk_3_5` | MILK 3.5% · Milk · Chilled | 428 |
| 1 | `new-recipe-1-cream_30` | CREAM 30% · Mlekovita Cream · Chilled | 113 |
| 2 | `new-recipe-2-smp` | SKIMMED MILK · Milk | 40 |
| 3 | `new-recipe-3-sucrose` | SUCROSE SUGAR · Sweetener · Dry | 60 |
| 4 | `new-recipe-4-dextrose` | DEXTROSE · Sweetener · Dry | 55 |
| 5 | `new-recipe-5-tara_gum` | TARA GUM · Stabilizer | 4 |
| 6 | `line-mtn5pdnv-1` | BANANA · Fresh Fruit | 300 |
| | | **total** | **1000** |

## Physical actual vector (actual_revision 8)

428 / 113 / 40 / 60 / 55 / 4 / **BANANA 345** — total **1045 g**.
BANANA was first confirmed at 16:18:51 then `actual_entry_corrected` to 345 at 16:18:59.
**No top-up was ever executed**: the six support lines still sit at their planned amounts.

## Stored Rescue vector (rescue_revision 1) — THE INVALID ONE

| line | rescued target |
|---|---|
| MILK | 492.2 |
| CREAM | 129.9 |
| SKIMMED MILK | 46 |
| SUCROSE | 69 |
| DEXTROSE | 63.2 |
| TARA GUM | 4.6 |
| BANANA | 345 |
| **total** | **1149.9** |

BANANA share = `345 / 1149.9` = **30.0026 %** against a published hard limit of **30 %**.

Support lines were scaled by k = 1.15 (700 → 805 g) so BANANA would sit at exactly 30 %.
Two land on a half tenth and round DOWN — `(113*1.15).toFixed(1)` = `"129.9"`,
`(55*1.15).toFixed(1)` = `"63.2"` — so support is 804.9, the denominator is 1149.9 instead of
1150.0, and the Main share crosses its own ceiling by 0.0026 pp (≈ 0.03 g of BANANA).

Minimum terminal-legal batch for this physical fact: `345 / 0.30` = **1150.0 g**
(evidence for this case only — the algorithm must derive it, never hard-code it).

## Accepted authorization

`deviation_decision_accepted` — option **`restore_original_recipe`**, `finalMassG` **1149.9**,
`rescueRevision` 1, `sourceActualRevision` 8, `scoreDisplay` **10/10**.
An out-of-authority candidate was scored perfect and persisted.

## Event trail (37 events)

`created` → `planned` → `started` → `production_started` → `heat_information_acknowledged`
→ 6 × (`ingredient_actual_confirmed` + `ingredient_completed` + `actual_recorded`)
→ BANANA `ingredient_actual_confirmed` + `variance_detected` + `actual_recorded`
→ `rescue_previewed` (`enlarge_batch`) → `rescue_previewed` (`restore_original_recipe`)
→ `actual_entry_corrected` + `ingredient_completed` + `variance_detected` + `actual_recorded`
→ `rescue_previewed` (`restore_original_recipe`)
→ **`deviation_decision_accepted`** → `rescue_applied` → `rescue_accepted`
→ `batch_target_changed` → `additional_ingredient_requested`

Nothing after that: the batch was stranded at the first reload.

## BANANA Main authority (published `main-banana-fresh-dairy` v2)

Identical in the saved version and in the stored rescue snapshot:

```
mainCapability                 MAIN_CAPABLE
behaviorRole                   MAIN_PROFILE_SPECIFIC
mainAuthority                  CALIBRATED   (level FAMILY)
mainBasis                      FRUIT_EQUIVALENT   (factor 1)
ecoFloorPercent                10
optimalCeilingPercent          20
hardLimitPercent               30
requiresLiquidDairyCarrier     true  (floor 30 %, approved false)
mapperIngredientId             PI-ING-000345
factsFingerprint               31e787fec56433637b32db4156942f808b7e3fc6f31704af06edec10ecb71cdc
```

All 7 lines carry a snapshot in `rescue_product_composition.behaviorSnapshots`.

## Observed failure (served, current staging)

Opening Production renders, verbatim:

> WYMAGA RECEPTURY WYKONAWCZEJ
> Nie udało się odzyskać partii
> Nie udało się połączyć bieżącej partii z jej zapisem. Wróć do receptury i spróbuj ponownie.
> [ Wróć do receptury ]

The exception swallowed by that catch, proven by execution against this data:

```
Grupa Main przekracza twardy limit 30.0%.
```

thrown from `applyVerifiedRescueInput` via `evaluateRecipeConstraintAuthority`
(module `BATCH_RESCUE`) → `verifyMainEnvelope` → `main_above_hard_limit`.

## Structural root cause

Two different authorities judge one candidate:

- **build / authorization** — `assessProductionHardSafety`: engine violations, machine capacity,
  native profile. **Never consults the Main envelope.**
- **recovery / hydration** — `evaluateRecipeConstraintAuthority` (BATCH_RESCUE). **Does.**

So a candidate can be authorized and persisted in a state only its own recovery path rejects.
