# OWNER-LOCKED CONTRACTS — PERMANENT PROVENANCE LEDGER

**SERVED + TESTED + OWNER-APPROVED = OWNER-LOCKED.**
Owner-locked behaviour is **immutable by default**.

This file is the permanent record of every accepted behaviour that a future
audit must be able to prove still survives. It is maintained together with:

| Artefact | Purpose |
|---|---|
| `src/contracts/owner-locked/` | the executable contracts |
| `src/contracts/owner-locked/README.md` | the rules for changing them |
| `scripts/guardOwnerLockedContracts.mjs` | blocks silent edits to a contract |
| `scripts/guardProtectedPaths.mjs` | classifies real diffs on protected paths |
| `scripts/protectedPaths.json` | the protected functional path manifest |
| `.github/workflows/ci.yml` | runs all of the above for `staging` and `main` |

Origin: `reports/GELLATTI_REGRESSION_PROVENANCE_AUDIT_2026-08-29.md`.

> ### ⚠ CI ACTIVATION IS STILL PENDING (2026-08-29)
>
> The contracts, both guards and the ledger are live on `staging`, and
> `npm run verify:staging` runs the whole gate locally. **The `ci.yml` change
> that makes the gate run automatically for `staging` is NOT yet landed**: the
> push was rejected with
> `refusing to allow an OAuth App to create or update workflow .github/workflows/ci.yml without workflow scope`.
>
> Until the workflow file is updated and branch protection requires the
> `contracts` job, this protection is **advisory, not mandatory**. The prepared
> workflow is kept verbatim at `scripts/ci-staging-gate.yml` (and on branch
> `claude/owner-locked-protection`); it must be applied by a token carrying the
> `workflow` scope. Nothing else in this system depends on it.

---

## How to change a locked contract

You do not. If a locked contract fails, **the implementation is wrong by
default**. Collect **all** required contract changes into **one** grouped owner
approval request (locked contract · current accepted behaviour · requested new
behaviour · reason · consequence · risk · alternatives · exact affected
files/functions) and wait for explicit approval. Never ask one-by-one when
several changes are already known.

Approval is recorded by the owner as a commit trailer:

```
Owner-Locked-Change-Approved: GEL-P0-004
```

and the affected row below is updated in the same change.

---

## Ledger

Status legend — **LOCKED**: served, tested, owner-approved, guarded.
**PENDING OWNER DECISION**: guarded by nothing until the owner rules.

| ID | Contract | Accepted behaviour | Acceptance commit | Regression contract | Protected functions / files | Served status |
|---|---|---|---|---|---|---|
| GEL-P0-001 | Main at 1 g is active | A raised Main is honoured from proof status `maximized` **or** `best_achievable` beyond `MAIN_OBJECTIVE_EPSILON_G`, at all three Preview production gates. A user-held/uncalibrated Main has no published ceiling, so accepting only `maximized` makes it inert on an on-batch draft. | `616f65e6` (2026-08-29) | `crownMain.contract.test.ts` | `applyPipeline.ts` → `mainObjectiveRaisesMain`, ECO gate, OPTIMAL clean gate, `improved` clause | Served code proof done; behavioural served proof still owed |
| GEL-P0-002 | Crown 0 g auto-seed | Crown ON at 0 g seeds exactly 1 g and records transient provenance. Seeding is what makes the crowned line a *required* line so revalidation reaches the role transition. No gram stack, no 2 g threshold, no solver workaround. | `4b649796` (2026-08-29) | `crownMain.contract.test.ts` | `crownAutoSeed.ts` → `crownOnPlannedGrams`; `recipeStore.ts` role writes | LOCKED |
| GEL-P0-003 | Crown OFF auto-seed restore | Crown OFF restores 0 g **only** when the seed flag is present **and** grams are still exactly 1. | `4b649796` (2026-08-29) | `crownMain.contract.test.ts` | `crownAutoSeed.ts` → `crownOffPlannedGrams` | LOCKED |
| GEL-P0-004 | Crown preserves explicit user grams | Crown ON at >0 g preserves the amount; any explicit grams write clears the seed provenance, so a deliberately typed 1 g survives Crown OFF; re-asserting an existing crown keeps provenance. | `4b649796` (2026-08-29) | `crownMain.contract.test.ts` | `crownAutoSeed.ts`; `recipeStore.ts` → `crownAutoSeededLineIds` | LOCKED |
| GEL-P0-005 | Crown maximization | Crown means MAXIMIZE within the valid technical envelope. Bounds come from the published ProductBehavior floor/ceiling and the LP upper bound — never a fabricated 200 g / 20 % / generic uncalibrated cap. The declared `MAIN_*` constant set is pinned. | `989d6f7e` (2026-08-25) | `crownMain.contract.test.ts` | `applyPipeline.ts` → `maximizeMainFromStart`, `maximizeMainTechnicalObjective`, `mainTechnicalLinearUpperBound`; `mainEnvelope.ts` → search floor/ceiling | LOCKED |
| GEL-P0-006 | Multi-Main preservation | `verifyMainEnvelope` is the single combined-percent authority: `equivalent_grams = Σ(grams × factor)`, `percent = equivalent / target_batch_grams × 100`, multiplied by 100 exactly once, inside the authority. | `bb75411` | `crownMain.contract.test.ts` | `mainEnvelope.ts` → `verifyMainEnvelope` | LOCKED |
| GEL-P0-007 | Professional fresh recipe = 1000 g | A fresh Professional recipe opens at the canonical 1000 g batch. A machine batch is applied to a fresh starter **only** for `machineKind === 'home'`. | `ee70985c` (2026-08-29) | `machineBatch.contract.test.ts` | `recipeStore.ts` → `PROFESSIONAL_DEFAULT_BATCH_GRAMS`; `newRecipeStarter.ts` → `DEFAULT_NEW_RECIPE_BATCH_G` | LOCKED |
| GEL-P0-008 | Professional manual batch persistence | An explicitly chosen batch survives save/reopen and is never silently reset to a recommendation. | `ee70985c` (2026-08-29) | `machineBatch.contract.test.ts` | `recipeStore.ts` → `recipePersistPartialize`; `preferenceContracts.ts` → `effectiveDefaultBatchGrams` | LOCKED |
| GEL-P0-009 | Home machine canonical defaults | The canonical machine catalog is versioned, non-empty, and every machine has a unique stable id. With no user default set, the effective batch is the derived recommendation. | `5d673bc4` / `473cd50a` (2026-08-28) | `machineBatch.contract.test.ts` | `machineCatalogData.ts` → `MACHINE_CATALOG`; `preferenceContracts.ts` → `recommendedBatchGramsOf` | LOCKED |
| GEL-P0-010 | Custom machine manual batch | A user default that diverges from the recommendation is custom and authoritative; clearing it is the only way back; a non-finite or non-positive batch is refused rather than coerced. | `c456e96e` (2026-08-28) | `machineBatch.contract.test.ts` | `preferenceContracts.ts` → `usesCustomDefaultBatch`, `withUserDefaultBatch`; `MachineProfileSection.tsx` | LOCKED |
| GEL-P0-011 | ProductBehavior / Mapper BASE_RECIPE parity | Module eligibility is decided by Mapper category/subcategory × `approved_for_base` only. **No per-product allow-list may exist anywhere.** A new canonical product must never need a code change to become usable. Fail closed when inactive or unapproved. | `fa4b03cc` (2026-08-29) | `productBehavior.contract.test.ts` | `canonicalModuleEligibility.ts` → `canonicalProductRole`, `canonicalModuleEligibility` | LOCKED |
| GEL-P0-012 | Fresh canonical recipe = zero unresolved products | Every positive canonical line requires resolver authority. A 0 g line is **not** a required line (this is precisely why GEL-P0-002 must seed). A synthetic line with no product lineage requires nothing. | `f5d57bdf` (2026-08-26) | `productBehavior.contract.test.ts` | `productBehaviorAccess.ts` → `productBehaviorRequiredLineIds` | LOCKED |
| GEL-P0-013 | Direction fallback | `MAX_SOLVER_ROUNDS = 18`; an unreached exact target still yields a truthful NEAREST proposal requiring explicit consent; the Sorbet exact-point fast path stays reachable from the shared builder. | `36e9bb1`, `19cd872` | `enginePipeline.contract.test.ts` | `applyPipeline.ts` → `MAX_SOLVER_ROUNDS`, `buildSorbetDirectionCandidatePreview`, `hasActiveExactDirectionObjective` | LOCKED |
| GEL-P0-014 | Preview before Apply | Apply never proceeds without a verified whole-gram executable proof; the door re-derives the practicalization instead of trusting the preview; the zero-gram executable invariant holds on the shared boundary. | `d3530cc` | `enginePipeline.contract.test.ts` | `applyPipeline.ts` → `practicalization_invalid`, `candidate_fingerprint_mismatch`; `practicalRecipe.ts` → `isOmittableUnusedLine` | LOCKED |
| GEL-P0-015 | Apply / Undo | One verified Apply door; both accepted Main proof shapes re-verified; material already in the vessel is never changed; ingredient/Main identity substitution requires authority. | `19cd872`, `616f65e6` | `enginePipeline.contract.test.ts` | `applyPipeline.ts` → `VerifiedApply`, `commitPreview`, `exactMaximumProof`, `boundedBestProof` | LOCKED |
| GEL-P0-016 | Topping isolation | Three module roles (`TOPPING_ONLY` / `BASE_ONLY` / `BASE_AND_TOPPING`). A topping-only category never enters the base; a base-only category is never served as a topping. Module eligibility never consults process evidence. | `fa4b03cc` (2026-08-29) | `productBehavior.contract.test.ts` | `canonicalModuleEligibility.ts` | LOCKED |
| GEL-P0-017 | Save / reopen | Persistence is an explicit **allow-list**, so a new store field is non-persistent by default. Transient editor provenance never persists and is reset on every draft load path. Direction targets are read from the recipe's own `goals`, never the ambient profile. | `d3530cc`, `40b3755`, `4b649796` | `shellPersistence.contract.test.ts` | `recipeStore.ts` → `recipePersistPartialize`, `loadRecipeInput` | LOCKED |
| GEL-P0-018 | Production Rescue protected contract | The Rescue Edge bundle is a security-reviewed pure source closure: zero external imports, zero dynamic imports. Editing any bundled source (even reformatting) requires regenerating the bundle. | `21ca8f47`, `5bea01db` | `enginePipeline.contract.test.ts` | `supabase/functions/_shared/generated/productionRescueEngine.manifest.json`; `practicalRecipe.ts` | LOCKED |
| GEL-P0-019 | Mobile functional architecture | One functional model, two responsive presentations. The mobile presentation layer imports no store and no Engine, defines no arithmetic, and offers the same controls as desktop. | `dd82f29` (2026-08-24) | `shellPersistence.contract.test.ts` | `IngredientLineControls.tsx` | LOCKED |
| GEL-P0-020 | Protein contracts | **NOT LOCKED.** `7edd90ea` (2026-08-28) introduced `assessDirectionCandidateProgress`, a strict-progress Direction acceptance gate enforced at Preview and at the Apply door, and in the same commit rewrote `proteinMultiMainPositive.test.ts` from a positive 2:1 Multi-Main Apply (Banana 352 g + Cranberry 136 g) into an expected **refusal**. Whether that refusal is correct science is an open owner question. | — | none yet | `applyPipeline.ts` → `assessDirectionCandidateProgress`; `proteinMultiMainPositive.test.ts` | **PENDING OWNER DECISION** |
| GEL-P0-021 | Crown trigger is reachable | A line that is not yet Main renders a control that can crown it, in **both** responsive presentations, wired to the Main role write. | `1c94d67c` (2026-08-26) | `crownMain.contract.test.ts` | `IngredientLineControls.tsx` → `MainRoleTrigger`; `IngredientRow.tsx` render sites | LOCKED |

---

## Historical regressions these contracts exist to prevent

| Date | Commit | Stated purpose | What it actually did | Now caught by |
|---|---|---|---|---|
| 2026-08-26 | `f5d57bdf` | "fix fresh recipe behavior hydration and **unify main badges**" | Deleted `row-main-toggle` — the only control that could crown a line — and rewrote five test files to assert the empty slot. Staging shipped ~9 h with no way to set a Main. | GEL-P0-021 + owner-locked guard + protected-path gate |
| 2026-08-28 | `7edd90ea` | "fix(pro): **restore live draft result visibility**" | Added a strict-progress Direction acceptance gate at Preview and the Apply door; converted an accepted positive Protein Multi-Main Apply into a refusal, rewriting the test in the same commit. | protected-path gate + owner-locked guard (GEL-P0-020 pending) |
| 2026-08-28 | `e00175d3` | "feat(machine): **enforce canonical batch coherence**" | Made Professional inherit a Home machine batch, breaking the canonical 1000 g default. Repaired ~6 h later by `ee70985c`. | GEL-P0-007 + protected-path gate |

None of the three was labelled `design` or `copy`. A gate keyed on commit names
would have caught none of them — which is why the protected-path gate classifies
the **diff**, not the message.
