# HOME / PRO PROFILE-SPECIFIC PARITY — LIVING CHECKLIST
**Reconciled from the repository 2026-09-03 · staging `285f15ed` · NOT READY, NOT FINAL, NOT FROZEN**

> Reconciled from `origin/staging`, merged PRs, open PRs and the audit reports —
> not from memory. Percentages are counted from the rows below.

## HOME / PRO PARITY: 2 / 44 (4.5 %)

**CURRENT:** legacy `/start` forensic extraction and retirement
**NEXT:** `/demo` audit → `visibleProductType` → capability 7 downstream
**WAITING:** capability 11 served proof — needs an authenticated PRO session
**DEFECTS:** `visibleProductType` pinning (OPEN); capability 11 served-unproven
**OWNER QA NEEDED:** #139 Protein Twardość served QA on staging

## Landed / open work

| item | state |
|---|---|
| **#137** sweetness precision (`540fa3b6`) | 🟢 MERGED + on staging |
| **#139** Protein hardness ice authority (`285f15ed`) | 🟢 MERGED + DEPLOYED (bundle `index-BnGQIVoc.js` verified) |
| **#121** stabilizer whole-gram rescale | ⏸ OPEN, BEHIND staging — separate lane |
| GEL-P0-018 closure 60 → 61 | 🟢 owner-approved, recorded in the ledger |

## Capability matrix

Legend 🟢 DONE · 🟡 DOING · ⚪ TODO · ⏸ WAITING_ON_DEPENDENCY · 🔴 DEFECT · 🔴 BLOCKED_OWNER.
A capability is DONE only when **all four profiles** pass. Per-profile columns:
G = Gelato, S = Sorbet, V = Vegan, P = Protein.

| ID | CAPABILITY | G | S | V | P | HOME PATH | PRO PATH | CANONICAL AUTHORITY | STATUS | DEFECT | NEXT PROOF |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Product type | ⚪ | ⚪ | ⚪ | ⚪ | `rebuildNewRecipeStarter` | `setCategory` + `startNewRecipe` | — | ⚪ TODO | linked to `visibleProductType` | trace both, per profile |
| 2 | Machine | ⚪ | ⚪ | ⚪ | ⚪ | `setMachineSelection` | `setMachineSelection` | recipeStore | ⚪ TODO (shared endpoint only) | — | payload + guard equivalence |
| 3 | Serving temperature / mode | ⚪ | ⚪ | ⚪ | ⚪ | — | `setTargetTemperature`, `setServingMode` | — | ⚪ TODO | — | trace HOME path |
| 4 | Optimal / ECO | ⚪ | ⚪ | ⚪ | ⚪ | not exposed | `setFormulationStrategy` | — | ⚪ TODO | — | prove HOME uses canonical default, never a competing one |
| 5 | Ingredient add | ⚪ | ⚪ | ⚪ | ⚪ | `addIngredient` + `homeAddAmountDecision` | picker | `resolveMainCapability`, `productDosageAuthority` | ⚪ TODO (canonical-backed) | — | per-profile add semantics |
| 6 | Ingredient remove | ⚪ | ⚪ | ⚪ | ⚪ | `removeItem` | `removeItem` | recipeStore | ⚪ TODO (shared endpoint only) | — | cleanup equivalence |
| 7 | Ingredient grams | 🟡 | 🟡 | 🟡 | 🟡 | raw `setPlannedGrams` | `IngredientBuilder` wrapper | `setPlannedGrams` (sole writer of `user_target_grams`) | 🟡 MUTATION PARITY / DOWNSTREAM PENDING | refusal copy differs only; `markDoseUserSet` is UX metadata | Preview → manual-target projection → batch closure → Main/Crown → carrier → Apply, per profile |
| 8 | Lock / unlock | 🟢 | 🟢 | 🟢 | 🟢 | raw `setLockType` | wrapper + §17 bridge | `setLockType` + `reconcileConstraints` | 🟢 **DONE** | none — classification A retracted | — (roundtrip proven both directions) |
| 9 | Crown / Main | ⚪ | ⚪ | ⚪ | ⚪ | `setMainIngredient` | `lock_type: 'main'` via studio | `mainEnvelope`, `mainCapability` | ⚪ TODO | — | resulting Main state per profile |
| 10 | Multi-Main | ⚪ | ⚪ | ⚪ | ⚪ | — | studio | `verifyMainEnvelope` group | ⚪ TODO | — | per-profile group semantics |
| 11 | Hardness / softness | ⚪ | ⚪ | ⚪ | 🟡 | current HOME exposes none (intentional) | Direction axis | NPAC (G/S/V) · **ice_fraction (P)** | ⏸ **WAITING_ON_OWNER_QA_SESSION** | PRO Protein block fixed; served unproven | served: enabled, 3 positions, distinct, Preview, Apply, save/reopen, sweetness independent |
| 12 | Sweetness | ⚪ | ⚪ | ⚪ | ⚪ | `setDirectionTarget` (3-way projection) | Direction axis (±2) | `buildRecipeDirectionPlan` (POD) | ⚪ TODO | precision-loss defect FIXED (#137) | per-profile band + Preview/Apply equivalence |
| 13 | Every other Direction / Monitor axis | ⚪ | ⚪ | ⚪ | ⚪ | PI Monitor (legacy) | Direction | — | ⚪ TODO | creaminess/flavor blocked | audit per profile |
| 14 | Batch invariant / rescale | ⚪ | ⚪ | ⚪ | ⚪ | `setBatchGrams` | `setBatchGrams` | `resizeRecipeBatch` | ⚪ TODO (shared endpoint only) | — | off-batch resolution equivalence |
| 15 | Stabilizer handling | ⚪ | ⚪ | ⚪ | ⚪ | — | — | owner stabilizer authority | ⚪ TODO | #121 open (fractional rescale) | per-profile policy check |
| 16 | ProductBehavior | 🟢 | 🟢 | 🟢 | 🟢 | `setProductBehaviorSnapshot` (merge) | `syncProductBehaviorSnapshots` (replace) | same validation + `reservationAfterMainCheck` | 🟢 **DONE** | none — lifecycle difference only | — (cross-surface persistence proven) |
| 17 | Ingredient eligibility | ⚪ | ⚪ | ⚪ | ⚪ | — | — | `canonicalModuleEligibility` | ⚪ TODO | — | per-profile eligibility |
| 18 | Topping vs base semantics | ⚪ | ⚪ | ⚪ | ⚪ | `addTopping` | — | Mapper authority | ⚪ TODO | — | trace both |
| 19 | Preview | ⚪ | ⚪ | ⚪ | ⚪ | `previewOptimization` → spine (legacy) | `buildOptimizePreview` | — | ⚪ TODO | two pipelines | resolve with legacy retirement |
| 20 | Apply | ⚪ | ⚪ | ⚪ | ⚪ | legacy spine | `applyVerifiedRecipeInput` | — | ⚪ TODO | two pipelines | resolve with legacy retirement |
| 21 | Rescue / recovery | ⚪ | ⚪ | ⚪ | ⚪ | `batchRescueRouter` (spine) | applyPipeline rescue | — | ⚪ TODO | duplicate algorithms | per-profile rescue |
| 22 | Hard limits | ⚪ | ⚪ | ⚪ | ⚪ | — | `verifyMainEnvelope` | published policy | ⚪ TODO | — | per-profile limit |
| 23 | Carrier requirements | ⚪ | ⚪ | ⚪ | ⚪ | — | `verifyMainTechnicalCarrier` | published policy | ⚪ TODO | dairy-only by data | per-profile |
| 24 | Manual-target projection | ⚪ | ⚪ | ⚪ | ⚪ | — | `projectManualIngredientTarget` | — | ⚪ TODO | #121 relevant | per-profile |
| 25 | Save | ⚪ | ⚪ | ⚪ | ⚪ | `homeRecipeSave` (legacy) | canonical save | — | ⚪ TODO | — | trace both |
| 26 | Reopen | ⚪ | ⚪ | ⚪ | ⚪ | `loadRecipeInput` | `loadRecipeInput` | recipeStore | ⚪ TODO (shared endpoint only) | — | payload equivalence |
| 27 | Versions | ⚪ | ⚪ | ⚪ | ⚪ | — | — | saved_recipes | ⚪ TODO | — | trace |
| 28 | Defaults | ⚪ | ⚪ | ⚪ | ⚪ | — | — | account/product defaults | ⚪ TODO | — | trace |
| 29 | Validation / refusal semantics | ⚪ | ⚪ | ⚪ | ⚪ | silent | `setPickerNotice` | — | ⚪ TODO | copy differs, semantics equal (cap 7) | per-profile refusal set |
| 30 | Product-type switching / reset | ⚪ | ⚪ | ⚪ | ⚪ | — | `setVisibleProductType` | — | 🔴 **DEFECT** | `visibleProductType` pinning | fix, then per-profile switch matrix |
| 31 | Machine/mode/temperature switching | ⚪ | ⚪ | ⚪ | ⚪ | — | — | — | ⚪ TODO | — | per-profile |
| 32 | HOME→PRO persistence | ⚪ | ⚪ | ⚪ | ⚪ | — | — | recipeStore persist | ⚪ TODO | PB replace caveat recorded | roundtrip |
| 33 | PRO→HOME persistence | ⚪ | ⚪ | ⚪ | ⚪ | — | — | recipeStore persist | ⚪ TODO | — | roundtrip |
| 34 | Monitor/score values affecting formulation | ⚪ | ⚪ | ⚪ | ⚪ | PI Monitor | recipe-score | — | ⚪ TODO | — | trace |
| 35 | Any HOME-specific recipe transformation | ⚪ | ⚪ | ⚪ | ⚪ | — | — | — | ⚪ TODO | — | sweep |
| 36 | Any PRO-specific domain duplication | ⚪ | ⚪ | ⚪ | ⚪ | — | — | — | ⚪ TODO | — | sweep |

## Programme rows (beyond the 36 capabilities)

| # | ITEM | STATUS | NOTE |
|---|---|---|---|
| A | Legacy `/start` forensic extraction | 🟡 DOING | inventory complete; Protein authority already extracted (#139) |
| B | Retire `/start`, `/classic`, `/customer-v1` | ⚪ TODO | must redirect to `/`, never mount CustomerShellV1 |
| C | `/demo` entitlement audit | ⚪ TODO | preserve demo UX, route formulation through canonical stack |
| D | `visibleProductType` defect | 🔴 OPEN | blocks served product-type QA |
| E | Full per-profile semantic parity matrix | ⚪ TODO | — |
| F | Permanent architecture / import / routing guards | ⚪ TODO | replace the name-based §1 guard with an import-graph one |
| G | Staging HOME→PRO→HOME | ⚪ TODO | — |
| H | Staging PRO→HOME→PRO | ⚪ TODO | — |

**TOTAL = 36 capabilities + 8 programme rows = 44 rows.**
**DONE = capability 8 + capability 16 = 2 → 2 / 44 (4.5 %).**

Counted, not estimated: 36 capability rows + 8 programme rows = 44.
