# BASE_ONLY nutrition/label permission — fix, reclassification, open questions

**Date:** 2026-09-05 · **DB:** `tunabqqrwabacxjcxxkz` (staging) · **Branch:** `claude/base-only-nutrition-permission` · **PR:** #181 (draft)
**Owner reproducer:** CACAO PURO / La Chocolatera · `PR-ING-007142` · EAN `8410109121551`

---

## 1. What was wrong

`classify_catalog_product_behavior_v2` derived two permissions exclusively from the topping path:

```sql
'LABEL',    v_product_behavior_topping_accepted and v_topping
'NUTRITION',v_product_behavior_topping_accepted and v_topping
```

`v_product_behavior_topping_accepted` requires `productBehaviorAuthority.toppingEligible = true`.
A `BASE_ONLY` product could therefore never hold NUTRITION or LABEL, while the same classifier
granted it `BASE_RECIPE`, `MONITOR`, `SAVE` and `PRODUCTION` from the base path.

`PRODUCTION = true, NUTRITION = false` is not an executable state:

| seam                                   | consequence                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `buildCurrentRecipeResultAuthority`    | gates `MONITOR + NUTRITION + COST + SUMMARY` together → `ready = false`, `state = 'STALE'`, permanently      |
| `establishCurrentRecipeCalculation`    | returns on `!authority.ready`, so `recordCalculatedRecipe` never runs → the draft never counts as calculated |
| persist path (`constraintStudioStore`) | server-validates all four modules → `current_result_module_unresolved:NUTRITION`                             |
| `completeProductionSession`            | requires the NUTRITION gate as well as PRODUCTION → completion throws                                        |

The reason code the server returns is
`module_permission_missing:…:NUTRITION:choose_module_eligible_product`. It is **not** in
`REFRESHABLE_SNAPSHOT_REASON_CODES`, so the working-copy refresh is correctly not offered for it —
the Production panel dead-ends on "Wróć do receptury" rather than looping on its refresh button.
The cycle the owner experienced is the Pro one: Recalculate → Apply → the result never becomes
CURRENT → the app still asks for a recalculation.

In the owner's saved recipe _mmm_, CACAO was the **only** line of nine with any blocked module.
The other eight are Mapper products, classified by `classify_mapper_product_behavior_v2`, which
grants `'NUTRITION',true` unconditionally. That is why removing CACAO appeared to fix the flow.

## 2. Population — it was never CACAO-specific

| kind                     | base     | topping   | NUTRITION | n      |
| ------------------------ | -------- | --------- | --------- | ------ |
| mapper_reference         | any      | any       | true      | 2089   |
| commercial_product       | false    | true      | true      | 12     |
| **commercial_product**   | **true** | **false** | **false** | **10** |
| **customer_provisional** | **true** | **false** | **false** | **1**  |
| commercial_product       | false    | false     | false     | 22     |

Every base-capable non-Mapper product in staging was in the broken state. CACAO PURO was simply the
first one the owner drove into a recipe as a base line and took to Production.

## 3. Which permission record the runtime actually uses

The same product version carries **two** disagreeing permission maps:

| record                                                                                   | LABEL   | NUTRITION | written by                                                                                        |
| ---------------------------------------------------------------------------------------- | ------- | --------- | ------------------------------------------------------------------------------------------------- |
| `product_versions.facts.productIntelligence.productBehaviorAuthority.profilePermissions` | `true`  | `true`    | the Edge product-profile authority (`PRODUCT_BEHAVIOR_V1`), persisted through `ingest_product_v1` |
| `product_behavior_bindings.profile_permissions`                                          | `false` | `false`   | `classify_catalog_product_behavior_v2`                                                            |

**The binding wins.** `resolve_product_behavior_evidence_gate_v1` reads `v_permissions` from the
binding row, never from the facts blob, and maps it to `moduleEligibility`, which is what is frozen
into every recipe snapshot.

**Why they disagree.** They are not the same statement. The facts blob records what the _product's
own evidence_ supports — it is computed per product, before any catalog policy is applied. The
binding records what the _catalog classifier_ is willing to grant given the Mapper reference binding,
verification status and role. The classifier was entitled to narrow the facts blob; the defect was
that it narrowed NUTRITION/LABEL through a predicate (topping eligibility) that has nothing to do
with either.

**Recommended cleanup (separate PR).** Do not delete either record — they answer different
questions. Instead:

1. rename the facts-blob field so it reads as a _claim_ rather than a permission
   (`evidenceSupportedModules`, say), leaving `profile_permissions` the single grant authority; and
2. add a classifier assertion that every granted permission is a subset of the evidence-supported
   set, so a future divergence fails closed instead of silently disagreeing.

That is a schema/naming change across the ingest seam and its consumers, which is why it is not in
this PR.

## 4. 🔴 BLOCKER — stale mapper lineage prevents reclassification

The classifier fix is applied and correct. **The reclassification cannot be run**, and the migration's
own assertions caught it and rolled back cleanly.

Reclassifying the 10 active affected products today produces:

| product                           | BASE_RECIPE | MONITOR | NUTRITION | PRODUCTION | SAVE      |
| --------------------------------- | ----------- | ------- | --------- | ---------- | --------- |
| `PR-ING-007172` Łaciate 3,5%      | true        | true    | **true**  | true       | true      |
| `PR-ING-007173` Leche Hacendado   | true        | true    | **true**  | true       | true      |
| `PR-ING-007174` Lait Alsace       | true        | true    | **true**  | true       | true      |
| `PR-ING-007142` **Cacao Puro**    | **false**   | false   | false     | false      | **false** |
| `CA-ING-007165` Cacao 100%        | **false**   | false   | false     | false      | **false** |
| `PR-ING-007148` Jogurt Fruvita    | **false**   | false   | false     | false      | **false** |
| `PR-ING-007154` Śmietanka 18%     | **false**   | false   | false     | false      | **false** |
| `PR-ING-007155` GRANI ARANCIA     | **false**   | false   | false     | false      | **false** |
| `PR-ING-007158` Masło bez laktozy | **false**   | false   | false     | false      | **false** |
| `PR-ING-007159` CARAMEL MOU       | **false**   | false   | false     | false      | **false** |

The three that behave correctly prove the fix works. The seven that collapse to _no permissions at
all_ are hitting a **different, pre-existing defect**.

### Cause

`v_product_behavior_accepted` requires the product's frozen authority to still reference a **current**
Mapper behaviour binding:

```sql
and exists(
  select 1 from public.mapper_product_behavior_bindings authority_binding
  where authority_binding.id::text =
      v_public_data#>>'{productIntelligence,productBehaviorAuthority,mapperBehaviorBindingId}'
    and authority_binding.mapper_ingredient_id = v_behavior_reference
    and authority_binding.is_current
    and coalesce((authority_binding.profile_permissions->>'BASE_RECIPE')::boolean,false)
)
```

Cacao Puro's facts store `mapperBehaviorBindingId = 8b1147d3-…` for `PI-ING-001313`. That row was
superseded on **2026-08-29** by the mapper-wide `canonical-module-eligibility-v1` sweep, which
published `883a28d7-…` as current. The stored id is therefore no longer current, the `exists` fails,
and every base permission collapses.

The sweep did re-enqueue dependent catalog versions — but that path keys on
`catalog_binding.mapper_ingredient_id`, which is **NULL** for these PR products, so they were never
re-linked.

### Scale

Of the 12 active non-Mapper products carrying a `referenceMapperIngredientId`, **9 have stale
lineage**, and **7 of those are currently base-capable**. Any reclassification of those 7 — from this
work, from a future Mapper republish, or from any other trigger — silently revokes every permission
they hold. This landmine predates this PR and is unrelated to the NUTRITION derivation.

### Options (owner decision required)

1. **Re-point the stale reference.** Update each product's frozen
   `mapperBehaviorBindingId` to the current binding for the same
   `referenceMapperIngredientId`. Permissions are identical across all 7 historical rows for
   `PI-ING-001313` (BASE_RECIPE and TOPPING both true throughout), so this changes lineage, not
   meaning. Touches `product_versions.facts`.
2. **Match on the ingredient, not the row id.** Change the classifier's `exists` to require a current
   binding for `v_behavior_reference`, treating the stored id as provenance. Arguably the correct
   semantics, but it changes an acceptance predicate.
3. **Re-run the product authority.** Re-analyse each product through the Edge pipeline so a fresh
   authority is computed against the live Mapper binding. Most faithful to the original design, most
   expensive, and needs the scanner/ingest path.

Option 2 is the smallest and the only one that also protects future products; option 1 is the
narrowest one-off. Both are outside the authorised scope of this PR (Mapper/PI lineage), so nothing
has been done.

### What was actually applied

Both migrations are live on staging (`20260905103024` and `20260905141...`). The reclassification ran
for the 3 products whose Mapper lineage is current and skipped the 7 whose lineage is stale:

| product                                                     | before              | after                                                                          |
| ----------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------ |
| `PR-ING-007172` Łaciate 3,5%                                | nut=false lab=false | **nut=true lab=true**, binding `base-only-nutrition-label-v1:55afbb8e30d936fd` |
| `PR-ING-007173` Leche Hacendado                             | nut=false lab=false | **nut=true lab=true**, binding `base-only-nutrition-label-v1:654e531b1aff20f6` |
| `PR-ING-007174` Lait Alsace                                 | nut=false lab=false | **nut=true lab=true**, binding `base-only-nutrition-label-v1:b64142e90747ae5d` |
| `PR-ING-007142` **Cacao Puro**                              | nut=false           | unchanged — SKIPPED, stale lineage                                             |
| `CA-ING-007165` Cacao 100%                                  | nut=false           | unchanged — SKIPPED, stale lineage                                             |
| `PR-ING-007148` / `007154` / `007155` / `007158` / `007159` | nut=false           | unchanged — SKIPPED, stale lineage                                             |

BASE_RECIPE, MONITOR, PRODUCTION and SAVE are unchanged for all ten. Nothing was downgraded.

## 5. Residual: PRODUCTION without NUTRITION (now fixed in the derivation)

The fix removes the contradiction for every product whose **label evidence is complete**. It does
not remove it for products whose evidence is genuinely missing, because contract B forbids granting
NUTRITION there. Those products keep `PRODUCTION = true, NUTRITION = false` and will dead-end at
Production completion.

Five products on staging are in that state today — all with no `nutrition` object and (except one)
no ingredients text on their current version:

| product                                                     | ingredients text | allergens text | nutrition object |
| ----------------------------------------------------------- | ---------------- | -------------- | ---------------- |
| `PR-ING-007148` Jogurt Fruvita morelowy                     | —                | —              | —                |
| `PR-ING-007154` Śmietanka do zup i sosów Mleczna Dolina 18% | —                | —              | —                |
| `PR-ING-007155` GRANI ARANCIA Pomarańczowy                  | —                | —              | —                |
| `PR-ING-007158` Masło Ekstra bez laktozy Mleczna Dolina 82% | —                | yes            | —                |
| `PR-ING-007159` CARAMEL MOU GIUBILEO Toffi                  | —                | —              | —                |

Only one change can remove this coherently, and it revokes a permission rather than granting one:
gate the PRODUCTION **base** branch on the same evidence the completion gate needs, so PRODUCTION is
never promised where NUTRITION cannot follow:

```sql
'PRODUCTION',(v_product_behavior_accepted and v_base and v_topping)
  or (v_product_behavior_topping_accepted and v_topping),
```

Those five products would then refuse Production up front with an honest reason instead of failing
at completion. They would keep `BASE_RECIPE`, `MONITOR`, `COST` and `SAVE`, so they remain fully
usable in recipes.

**Owner approved 2026-09-05 and it is now in the migration.** PRODUCTION's base branch carries the
same `v_topping` evidence conjunct, so the contradictory pair is unreachable by construction. The
five incomplete products keep SAVE, BASE_RECIPE and MONITOR and lose only PRODUCTION -- which they
could never have completed. Asserted by `GEL-P0-028 D` across the full 16-row truth table.

## 6. Served staging E2E (owner account `pro@pro.com`, 2026-09-05)

Run on https://staging.pinguinoai.com against the applied migrations. No credentials were typed: an
owner session was already live in the browser.

### `PR-ING-007172` Mleko płynne Łaciate 3,5% — the nutrition path PASSES

| step                            | result                                                                                              |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| add to recipe                   | line added                                                                                          |
| Recalculate                     | preview produced ("Sprawdź proponowaną korektę")                                                    |
| Apply ("Zastosuj zmiany")       | applied                                                                                             |
| **incomplete-refresh warning**  | **none** — `staleWarningsFound: []`                                                                 |
| **second recalculate demanded** | **no** — badge reads "Wynik aktualny"                                                               |
| `data-label-ready`              | **`true`** (LABEL gate ready ⇒ NUTRITION gate ready ⇒ result is CURRENT)                            |
| Save                            | saved as `34583b01-…` v1, 7 lines                                                                   |
| reopen                          | "Zapisane · v1" + "Wynik aktualny", no stale warning, `data-label-ready=true`                       |
| frozen snapshot                 | `NUTRITION: eligible`, `LABEL: eligible` on binding `base-only-nutrition-label-v1:55afbb8e30d936fd` |

The loop is gone. Before the fix this recipe could never have reached CURRENT.

### Łaciate at Production — refused by a DIFFERENT, pre-existing gate

Production shows _"Nie udało się potwierdzić produktów"_ with the single action **"Wróć do receptury"**.
It is a dead end, **not a loop**: `module_permission_missing` is deliberately absent from
`REFRESHABLE_SNAPSHOT_REASON_CODES`, so no refresh button is offered.

The cause is not nutrition. Łaciate's binding carries
`process_behavior.decision = 'UNKNOWN'`, `verificationStatus = 'unknown'`, so `v_has_process` is false
and `resolve_product_behavior_evidence_gate_v1` blocks `PROCESS` and `PRODUCTION`:

```sql
or (v_module in ('PROCESS','PRODUCTION') and v_scope='BASE_FORMULATION' and not v_has_process)
```

That predates this work and is untouched by it. **The refusal copy is misleading**, though: it says the
product verification needs refreshing when the real blocker is missing process evidence. Worth a
separate copy fix so the message names the actual gap.

### `PR-ING-007173` Leche líquida entera Hacendado — the FULL lifecycle PASSES

Same cured set, and it does carry verified process evidence (`COLD_PROCESS_OK` / `verified`).

| step                           | result                                                                                                   |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| add, Recalculate               | "Receptura już spełnia wybrany profil" — no change required                                              |
| result state                   | "Wynik aktualny", `data-label-ready=true`, no stale warnings                                             |
| Save                           | `34583b01-…` **v2**, "QA Hacendado production path"                                                      |
| frozen snapshot (catalog line) | `NUTRITION: eligible`, `PROCESS: eligible`, `PRODUCTION: eligible`                                       |
| **Production**                 | **"WSZYSTKO GOTOWE DO ROZPOCZĘCIA PARTII"** — 0/7 składników, Wersja 2, 1000 g, Źródło "Zapisana wersja" |

The only remaining step is acknowledging the TARA GUM heat notice, which is ordinary process
information, not a permission gate.

### `PR-ING-007142` Cacao Puro — NOT RUN

Blocked by §4. Cacao Puro could not be reclassified, so its binding still reads
`NUTRITION=false` and the original loop still reproduces. This is the one part of the brief that
remains undelivered.

### Incomplete-product refusal — NOT RUN

All five incomplete products are in the stale-lineage group, so none could be republished with the
new PRODUCTION rule. The rule itself is proven at the derivation level by `GEL-P0-028 B` and `D`.

## 7. What this PR changed

| file                                                                             |                                                                                                    |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `supabase/migrations/20260905120000_base_only_nutrition_label_permission.sql`    | patches `classify_catalog_product_behavior_v2`; verifies the published derivation and fails closed |
| `supabase/migrations/20260905120100_reclassify_base_only_nutrition_bindings.sql` | republishes affected bindings through the canonical queue; asserts both directions                 |
| `src/contracts/owner-locked/baseOnlyNutritionPermission.contract.test.ts`        | `GEL-P0-028 A–E`                                                                                   |

Unchanged: Engine math, PAC/POD/NPAC, Mapper/PI, CACAO's PI assignment, product country/origin/
manufacturer facts, FILTR, Scanner, Shop.

## 8. Separate follow-ups

- **CACAO water/solids data quality.** `water_percent = 0`, `totalSolids = 100`, inherited from
  neighbour `PI-ING-001313`. Declared macros sum to 89.53 g/100 g, leaving ~10.5 g unaccounted
  (ash + real moisture); defatted cocoa is ~3–5 % water. At 46 g in a 450 g batch this biases mix
  water by ~0.4 %. Not related to the loop.
- **PR → PI classification.** CACAO has `mapper_ingredient_id = null` and
  `technicalAuthority = 'none'`; `PI-ING-001313` is an estimation neighbour, not a slot. Whether
  base-only catalog products should ever acquire a real PI slot is an open product question.
- **Dual permission authority.** §3 above.
- **PRODUCTION coherence.** §4 above.
