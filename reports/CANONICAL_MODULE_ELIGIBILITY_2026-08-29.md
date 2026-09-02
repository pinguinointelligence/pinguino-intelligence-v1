# Canonical module eligibility — Mapper-derived single source of truth

Owner P0/P1: BANANA `PI-ING-000345` is canonical, visible in the picker, but
ProductBehavior refuses it at `BASE_RECIPE`. Same class as the previously
hand-repaired `PI-ING-000270` / `PI-ING-000514`.

Branch `claude/canonical-module-eligibility`, worktree
`~/Developer/pinguino-module-eligibility`. Started from `origin/staging`
**f08a920f**; `origin/staging` moved to **616f65e6**
(`fix(main): honor the Main positive-mass contract`) while this work was in
progress, and the change was rebased onto it before push. No conflict — that
commit touches `applyPipeline.ts` only.

## 1. Exact Banana root cause

`products.current_behavior_binding_id` for the canonical `mapper_reference`
product of `PI-ING-000345` pointed at binding `0e58d7b8-a1bc-4890-9e07-9d3ae4aa6554`
whose `profile_permissions.BASE_RECIPE = false`, while Mapper says
`approved_for_base = true` and the Mapper-side mirror binding
(`42cb91d9-…`, `mapper_product_behavior_bindings`) said `BASE_RECIPE = true`.

Two classifiers were both allowed to publish that pointer:

| classifier | authority for BASE_RECIPE | result on a `mapper_reference` product |
| --- | --- | --- |
| `classify_mapper_product_behavior_v2` | `mapper_basement.approved_for_base` | correct |
| `classify_catalog_product_behavior_v2` | `public_data.productIntelligence.engineUsable` + `technicalComposition` | **always false** — 0 of 2089 `mapper_reference` versions carry `productIntelligence` |

`enqueue_mapper_product_behavior_authority_change_v1` (trigger on
`mapper_basement` and `mapper_process_metadata`) enqueued **every** product whose
current binding carried the changed `mapper_ingredient_id` as a
`catalog_product_version` job — including the canonical `mapper_reference`
product itself. It was the only enqueue path missing the
`product_kind <> 'mapper_reference'` guard that
`enqueue_all_product_behavior_reclassification_v1` and the queue worker already
had.

Banana's queue trail on 2026-08-28:

```
20:17  mapper                 PI-ING-000345                          -> BASE_RECIPE = true
20:39  catalog_product_version aa51e3f6-9e4d-4ac7-8415-ec95709608fa  -> BASE_RECIPE = false   (won)
```

Whichever job drained last won. That race decided the answer for the whole
catalogue, product by product: **989 canonical products** served
`BASE_RECIPE = blocked` against a Mapper row approving them.

`PI-ING-000270` / `PI-ING-000514` were not a different bug. They were the same
bug, patched per-id by a BEFORE trigger
(`enforce_canonical_recipe_product_behavior_authority_v1`) that forced
`BASE_RECIPE = true` on any write for those two ids, immunising them against the
race. `PI-ING-002114` had a second, identical per-id trigger
(`enforce_gellatti_stabilizer_base_only_v1`).

## 2. Old authority chain

```
picker            search_products_v1  -> mapper_basement.approved_for_base
BASE_RECIPE gate  resolve_product_behavior_evidence_gate_v1
                    -> product_behavior_bindings.profile_permissions.BASE_RECIPE
                       (written by whichever classifier ran last)
                    -> profile_applicability.authorityType =
                       'CANONICAL_RECIPE_PROFILE_ALLOWLIST'  (2 hard-coded ids)
                    -> two per-id BEFORE triggers (3 hard-coded ids)
```

Four authorities, able to contradict each other and the picker.

## 3. New authority chain

```
mapper_basement.approved_for_base
  + canonical technical class (ingredient_category / ingredient_subcategory)
        |
        v
canonical_module_product_role_v1  ->  BASE_ONLY | TOPPING_ONLY | BASE_AND_TOPPING
        |
        v
canonical_module_eligibility_v1   ->  { BASE_RECIPE, TOPPING }
        |
        +--> classify_mapper_product_behavior_v2   (what is stored)
        +--> resolve_product_behavior_evidence_gate_v1 (what is served — recomputed,
        |      so a stale or foreign mirror can never contradict Mapper)
        +--> search_products_v1                    (what the picker offers)
```

Then, still separately:

* **profile compatibility** — `vegan_eligibility = 'verified'` for vegan/sorbet,
  `protein_behavior <> 'unknown'` for protein, plus the Engine's own profile
  rules. Unchanged.
* **process authority** — `PROCESS`/`PRODUCTION` still require verified process
  evidence. Module eligibility never consults it, and this change does not turn
  an UNKNOWN process into an allowed Production.

## 4. Mapper field used as source of truth

`mapper_basement.approved_for_base` (existing), plus the canonical technical
class already carried by `ingredient_category` / `ingredient_subcategory`
(existing). The class sets are verbatim the ones
`classify_mapper_product_behavior_v2` already used to derive `TOPPING_ONLY` and
`STRUCTURAL_ONLY`.

## 5. New Mapper field required

**None.** No column added, no `mapper_basement` row read-modified. The dataset is
untouched.

## 6. Canonical product role

| role | source | BASE_RECIPE | TOPPING | count (active) |
| --- | --- | --- | --- | --- |
| `TOPPING_ONLY` | `confectionery_inclusion`, `bakery_inclusion`, `decorative_inclusion`, `variegate`, `coating` | no | yes | 112 |
| `BASE_ONLY` | `sweetener`, `stabilizer`, `fiber`, `emulsifier`, `starch`, `acid`, `colorant`, `functional_additive`, `additive`, or subcategory `water` | yes | no | 120 |
| `BASE_AND_TOPPING` | everything else | yes | yes | 1857 |

`approved_for_base = false` overrides everything to neither module.

The rule reproduces all three hand-made decisions with no id in it:

* `PI-ING-000514` sucrose → `sweetener` → BASE_ONLY → BASE yes / TOPPING no —
  identical to the removed allow-list trigger.
* `PI-ING-002114` Gellatti stabilizer → `stabilizer` → BASE_ONLY → BASE yes /
  TOPPING no — identical to its removed bespoke trigger.
* `PI-ING-000270` skimmed milk powder → `dairy` → BASE_AND_TOPPING → BASE yes.

One deliberate difference from the removed allow-list: `PI-ING-000270` is
TOPPING-eligible again. Skimmed milk powder is not a structural additive, and
`search_products_v1` has always offered it in the topping picker; forcing it
false was a side effect of the surgical patch, not an owner rule. If the owner
wants dairy powders out of the topping picker, that is a Mapper-side class
decision, not a per-id patch.

## 7. Catalogue contradiction report

Computed by comparing the canonical authority against the binding that was
current immediately before the migration (all 2089 active canonical identities).

```
TOTAL CANONICAL PRODUCTS:                       2089
BASE ELIGIBLE:                                  1964
TOPPING ELIGIBLE:                               1963
BOTH:                                           1851
INTENTIONALLY NEITHER (approved_for_base=false):  13

PRE-FIX MAPPER <-> PRODUCTBEHAVIOR CONTRADICTIONS: 1165 products
  A. Mapper allows BASE, ProductBehavior blocked:    989
  B. TOPPING_ONLY, ProductBehavior allowed BASE:      57
  C. Mapper allows TOPPING, ProductBehavior blocked: 997
  (a product may fall into more than one class)
  D. true profile-specific scientific block:        VALID, preserved

POST-FIX CONTRADICTIONS:                             0
```

Post-fix zero is asserted inside the migration (`raise exception` on any
mismatch and on any role leak), so the migration cannot commit while a
contradiction exists.

### Known consequence of closing class B

Six BASE lines across 703 saved staging recipe versions use a `bakery_inclusion`
in the base — `PI-ING-001868` (tortilla chips, 4 lines, last 2026-07-22) and
`PI-ING-002065` (Hanuta wafer, 2 lines, last 2026-08-06). These are exactly the
class-B defect the owner asked to close; those lines now require the topping
context. No production data is affected (staging QA recipes).

## 7b. Owner data decision surfaced (no code change needed)

Eligibility is decided by canonical class, never by commercial name (§19 — no
name fallback). Consequence worth the owner's eye: **234 active rows whose
display name contains "Variegato" / "Inclusion" / "Coating" carry a canonical
class that is not an inclusion class** — 194 `flavor_paste`, 24 `chocolate`,
8 `bakery`, 5 `nut`, 2 `dairy`, 1 `specialty` — so they stay
`BASE_AND_TOPPING`. For a variegato that is legitimate (variegati are used in
base as flavour pastes). If any of them should be post-process only, the fix is
now a single `mapper_basement.ingredient_category` correction and the picker,
the BASE_RECIPE gate and the TOPPING gate all follow automatically. That is the
point of the new architecture: **no product ever needs a code change again.**

Verified on 12 random canonical identities that never appeared in any allow-list
(`PI-ING-000600/000700/000800/000900/001100/001200/001300/001500/001600/001700/001900/002000`):
all eleven `BASE_AND_TOPPING` rows resolve BASE + TOPPING `eligible`, and
`PI-ING-002000 DOVE / GALAXY MILK CHOCOLATE · Inclusion`
(`confectionery_inclusion`) resolves BASE `blocked` / TOPPING `eligible`.

## 8. Files changed

```
supabase/migrations/20260829070507_canonical_module_eligibility_authority.sql   (new)
src/features/product-intelligence/canonicalModuleEligibility.ts                 (new)
src/features/product-intelligence/canonicalModuleEligibility.test.ts            (new)
src/features/product-intelligence/canonicalRecipeProductBehaviorAuthority.ts    (deleted)
src/features/product-intelligence/canonicalRecipeProductBehaviorAuthority.test.ts (deleted)
reports/CANONICAL_MODULE_ELIGIBILITY_2026-08-29.md                              (new)
```

The deleted module was the repo-side mirror of the removed two-id allow-list; it
had no runtime importer.

## 9. Migration

`20260829070507_canonical_module_eligibility_authority.sql`, forward-only,
single transaction, no historical migration rewritten, no `mapper_basement`
write, no new product row, no PI-ING id changed.

1. `canonical_module_product_role_v1` + `canonical_module_eligibility_v1`.
2. Drops both per-id override triggers and their functions.
3. Patches `classify_mapper_product_behavior_v2` to write the canonical answer,
   and makes its two `on conflict` branches republish the payload instead of
   only stamping `classified_at` (a same-version reclassification used to keep
   stale permissions).
4. Adds the missing `product_kind <> 'mapper_reference'` guard to
   `enqueue_mapper_product_behavior_authority_change_v1`.
5. Routes any queued `catalog_product_version` job for a `mapper_reference`
   product back to the Mapper classifier (defence in depth).
6. Patches `resolve_product_behavior_evidence_gate_v1`: removes the
   `CANONICAL_RECIPE_PROFILE_ALLOWLIST` branch, recomputes BASE_RECIPE/TOPPING
   from the canonical authority for `entityKind = 'mapper'`.
7. Patches `search_products_v1` so `usable_in_base` / `usable_as_topping` and
   both Polish blocked reasons use the same authority (picker parity).
8. Republishes all 2089 canonical bindings.
9. Asserts zero contradictions, zero role leaks, and the core starter invariant.

Every function patch is anchored and raises if its anchor drifted, so it can
never half-apply against a changed upstream definition.

**Dry run:** the whole migration was executed against staging inside an explicit
transaction ending in `rollback` before it was applied. It reported
`DRY RUN GREEN`, and a post-rollback probe confirmed the new functions were
absent and `base_eligible` was back at its pre-migration 1031.

## 10. Served proof (staging DB, `resolve_product_behavior_v1`, TEST PRO context)

| ingredient | BASE_RECIPE | TOPPING | expected |
| --- | --- | --- | --- |
| `PI-ING-000345` BANANA | eligible | eligible | BOTH |
| `PI-ING-000270` SKIMMED MILK | eligible | eligible | BOTH |
| `PI-ING-000514` SUCROSE | eligible | blocked | BASE_ONLY |
| `PI-ING-002114` GELLATTI STABILIZER | eligible | blocked | BASE_ONLY |
| `PI-ING-001974` LAY'S CHIPS (inclusion) | blocked | eligible | TOPPING_ONLY |
| `PI-ING-000458` SALT | eligible | eligible | BOTH |
| `PI-ING-000102` DARK CHOCOLATE | eligible | eligible | BOTH |
| `PI-ING-001409` WATER | eligible | blocked | BASE_ONLY |

## 11. Profile matrix (BASE_RECIPE at the ProductBehavior gate, 8 products x 8 profiles)

Every cell `eligible` except:

* `PI-ING-000270` SKIMMED MILK — **blocked** in `sorbet` and `vegan_gelato`
  (`vegan_eligibility = 'false'`). Truthful scientific restriction, preserved.
* `PI-ING-001974` inclusion — blocked in all 8 profiles (TOPPING_ONLY).

Module eligibility is not the whole profile story: the Engine's own profile
rules (dairy refusal in Sorbet at the selection boundary, alcohol bands, vegan
substitution rules) are untouched.

## 12. Picker parity

`search_products_v1('', 'BASE', …, 'pi_base', 100)` and the `'TOPPING'` context,
compared against `product_behavior_bindings.profile_permissions` for the same
canonical identity: **0 mismatches in 100 + 100 rows**. Both sides now derive
from `canonical_module_product_role_v1`.

## 13. Not touched

Engine science, solver bands, Main/Multi-Main, Main/Crown 1 g, Machine System,
Professional 1000 g, Direction fallback, Rescue ranking, Production Rescue,
Scanner/TEXTIMPORT, Label calculations, visual design, Polish copy, auth.
`origin/main` and the production Supabase project were not touched.

## 14. Focused test results (rebased tree, commit `fa4b03cc`)

```
npx vitest run src/features/product-intelligence/canonicalModuleEligibility.test.ts
  1 file / 34 tests PASS

npx vitest run src/features/product-intelligence/
  46 files / 655 tests PASS, 19 skipped

npx vitest run src/features/ingredient-builder src/features/global-catalog src/features/formulation
  86 files / 906 tests PASS

npx vitest run src/features/constraint-studio src/services src/stores \
              src/features/production-workspace src/features/product-intelligence
  213 files / 2310 PASS, 19 skipped, 1 FAIL

npx vitest run --maxWorkers=1 src/features/constraint-studio/starterPackDirectionRescue.test.ts
  1 file / 8 tests PASS (396 s)

npx vitest run --maxWorkers=1 src/features/constraint-studio/constraintStudioStore.test.ts
  1 file / 30 tests PASS

npx vitest run src/features/constraint-studio/recipeVectorProximity.test.ts
  1 file / 23 tests PASS

npm run typecheck   PASS
npm run lint        0 errors (4 pre-existing react-refresh warnings)
npm run build       PASS
git diff --check    clean
```

### The one failure, explained

`starterPackDirectionRescue.test.ts > runs the exact owner Hardness -2 fixture
through the real bounded Engine search` hit its own **600 000 ms** timeout in the
combined run. Its diagnostic line shows single candidate searches taking
89–163 s each. `uptime` reported load average **11–12** throughout: two other
worktrees on this Mac (`pinguino-gellatti-design-1to1`,
`pinguino-intelligence-v1-gellatti-v2-1-staging-deploy`) plus a
`/private/tmp/staging-baseline` checkout were running vitest concurrently.

Run alone at `--maxWorkers=1` the same file is **8/8 PASS**. The same happened to
`recipeVectorProximity.test.ts` (3 then 2 different tests timing out at 5000 ms,
23/23 PASS alone) and `constraintStudioStore.test.ts` (1 timeout, 30/30 PASS
alone) — different tests each run, which is the signature of CPU starvation, not
a regression. This change adds no runtime code to any Engine or solver path.

## 15. Deployment

```
starting staging SHA   f08a920f  (rebased onto 616f65e6 mid-flight)
fix commit SHA         fa4b03cc
final staging SHA      fa4b03cc
deployment ID          dpl_AN2BaA2AUjAmShv1FkU4xdvJpRkk   READY
immutable URL          https://pinguino-staging-88foxwhlt-pinguinointelligence-7784s-projects.vercel.app
alias                  https://staging.pinguinoai.com
served bundle          assets/index-Lx0bIM8i.js
staging DB migration   supabase_migrations.schema_migrations 20260829070507
origin/main            4dfb097d  UNCHANGED
production Supabase    riwipywgqobrulyzrzad  NOT TOUCHED
```

## 16. Remaining item

UI click-through on staging (open picker → add BANANA → Recalculate → Save →
reopen) needs an authenticated session, and this account signs in with email +
password, which Claude does not type. Everything below the UI is proven on the
live staging database through the exact RPCs the app calls
(`resolve_product_behavior_v1`, `search_products_v1`) under an authenticated
TEST PRO context. The owner's remaining step is the visual confirmation.
