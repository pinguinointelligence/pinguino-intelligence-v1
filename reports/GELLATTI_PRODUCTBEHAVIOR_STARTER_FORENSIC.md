# ProductBehavior on the canonical starter — BOUNDARY FORENSIC

Owner report (2026-08-31): `Przelicz i popraw` refuses a **fresh** HOME recipe, naming the
BASE starter lines themselves — MILK 3.5%, CREAM 30%, SKIMMED MILK, SUCROSE, DEXTROSE,
TARA GUM — as lacking current ProductBehavior / Mapper binding.

**Forensic only. No logic changed, no guard weakened.** The guard
`assert_recipe_behavior_authority_all_lines_v1` is untouched and is behaving correctly.

## The first boundary where authority was never created

**Boundary 1 — canonical starter creation.** Reproduced deterministically at store level
(`src/qa/productBehaviorBoundary.forensic.test.ts`):

```
1. starter creation  id=milk_3_5   canonical=PI-ING-000236  prov=template  snapshot=NO
1. starter creation  id=cream_30   canonical=PI-ING-000180  prov=template  snapshot=NO
1. starter creation  id=smp        canonical=PI-ING-000270  prov=template  snapshot=NO
1. starter creation  id=sucrose    canonical=PI-ING-000514  prov=template  snapshot=NO
1. starter creation  id=dextrose   canonical=PI-ING-000494  prov=template  snapshot=NO
1. starter creation  id=inulin     canonical=PI-ING-000456  prov=template  snapshot=NO
1. starter creation  id=tara_gum   canonical=PI-ING-000492  prov=template  snapshot=NO

starter lines: 7, with snapshot: 0     snapshot map keys: 0
```

Authority is missing at the FIRST boundary. Nothing downstream loses it — it is never
created. Boundary 2 (machine/batch resize) preserves the same state, so resize is **not**
the cause; every later boundary inherits an already-empty map.

## Two distinct defects, both present

**1. The starter attaches no ProductBehavior snapshots.** `rebuildNewRecipeStarter` writes
`productBehaviorSnapshots: {}` when it replaces the draft. Clearing is deliberate and
correct — the comment explains a starter rebuild must not let a previous recipe's
snapshots survive — but **nothing re-attaches snapshots for the new starter lines**. A
line only ever acquires one through the picker, where the caller follows the add with
`setProductBehaviorSnapshot(lineId, behavior)`. The starter has no such step.

**2. Starter lines are not Mapper-identified.** `ingredient.id` is a template slug
(`milk_3_5`), and `identity_provenance` is **`template`**, not `mapper`. The canonical id
is *known and correct* on every line (`canonical_ingredient_id: PI-ING-000236`) — it is
simply not the identity the line carries.

Contrast a recipe that DOES recalculate — the adopted Community recipe from Case 6:

| | Fresh starter line | Working Community line |
| --- | --- | --- |
| `ingredient.id` | `milk_3_5` | `PI-ING-000236` |
| `identity_provenance` | `template` | `mapper` |
| ProductBehavior snapshot | **absent** | **present (6/6)** |

This is why the served text reads „brak aktualnego snapshotu ProductBehavior dla produkt ·
**Mapper brak**": the binding layer has neither a snapshot nor a Mapper-identified product
to confirm one against.

## Against the owner's candidate list

| Candidate | Verdict |
| --- | --- |
| Starter creation not attaching ProductBehavior | **YES — proven, boundary 1** |
| Generic-product identity mismatch | **YES — proven, `prov=template`, id is a slug** |
| recipeStore dropping composition | No — it is never populated to drop |
| Persistence allow-list dropping it | No — `productBehaviorSnapshots` IS in the persist allow-list |
| Reload not hydrating it | No — nothing to hydrate |
| Machine resize replacing lines without snapshots | No — boundary 2 changes nothing |

## Scope: shared, not HOME

`rebuildNewRecipeStarter` has exactly two callers outside the store:

- `src/pages/home/HomeCreatorPage.tsx:246` (HOME)
- `src/pages/destinations/startNewProRecipe.ts:198` (**PRO New Recipe**)

So a fresh PRO recipe is built from the same snapshot-less, template-identified lines.
This satisfies the owner's architectural rule: **the fix belongs in the shared canonical
recipe path, not in HOME.**

## Correction to the earlier recalculate forensic

The previous document attributed the failure to the anonymous session being refused the
Mapper read. That was measured on a signed-out draft and is real as far as it goes, but it
was **not the root cause** — it is a second way to reach the same refusal. The owner's
screenshot shows the failure on a fresh starter regardless, and the boundary trace above
runs with no session at all and needs no server: the authority was never created locally.
Signing in cannot repair a snapshot that does not exist.

## What a fix must respect (not implemented)

1. Attach ProductBehavior authority when the canonical starter creates its lines, using
   each line's already-known `canonical_ingredient_id`.
2. Do it in the shared starter path so PRO and HOME are fixed once.
3. Do not weaken `assert_recipe_behavior_authority_all_lines_v1` — with real snapshots it
   should pass on its own terms.
4. Do not rewrite historical immutable recipe versions to repair fresh-draft hydration.
