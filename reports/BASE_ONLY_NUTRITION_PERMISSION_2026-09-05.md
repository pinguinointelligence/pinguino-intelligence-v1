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

## 4. Residual: PRODUCTION without NUTRITION still possible

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

**This is deliberately not in this PR.** It changes a permission the owner did not authorise
changing, and it withdraws a capability from five products. It needs an explicit decision.

## 5. What this PR changed

| file                                                                             |                                                                                                    |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `supabase/migrations/20260905120000_base_only_nutrition_label_permission.sql`    | patches `classify_catalog_product_behavior_v2`; verifies the published derivation and fails closed |
| `supabase/migrations/20260905120100_reclassify_base_only_nutrition_bindings.sql` | republishes affected bindings through the canonical queue; asserts both directions                 |
| `src/contracts/owner-locked/baseOnlyNutritionPermission.contract.test.ts`        | `GEL-P0-028 A–E`                                                                                   |

Unchanged: Engine math, PAC/POD/NPAC, Mapper/PI, CACAO's PI assignment, product country/origin/
manufacturer facts, FILTR, Scanner, Shop.

## 6. Separate follow-ups

- **CACAO water/solids data quality.** `water_percent = 0`, `totalSolids = 100`, inherited from
  neighbour `PI-ING-001313`. Declared macros sum to 89.53 g/100 g, leaving ~10.5 g unaccounted
  (ash + real moisture); defatted cocoa is ~3–5 % water. At 46 g in a 450 g batch this biases mix
  water by ~0.4 %. Not related to the loop.
- **PR → PI classification.** CACAO has `mapper_ingredient_id = null` and
  `technicalAuthority = 'none'`; `PI-ING-001313` is an estimation neighbour, not a slot. Whether
  base-only catalog products should ever acquire a real PI slot is an open product question.
- **Dual permission authority.** §3 above.
- **PRODUCTION coherence.** §4 above.
