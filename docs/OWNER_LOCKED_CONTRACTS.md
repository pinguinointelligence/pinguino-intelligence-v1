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
| GEL-P0-020 | Direction progress is not a universal publication veto | **OWNER DECISION 2026-08-29 — resolved.** Ordinary Recalculate and explicit Direction are separated. `assessDirectionCandidateProgress` publishes two verdicts from one measurement: `accepted` (strict progress: `reached \|\| (materiallyDifferent && strictlyCloser)`) for the explicit Direction routes, and `publishable` (`reached \|\| materiallyDifferent`) for ordinary Recalculate. A technically valid, on-batch, violation-free correction is published even when Direction was not reached or improved; Direction reports the miss truthfully via `directionTargetUnreached` and still collects explicit best-achievable consent. A candidate byte-identical to the draft is never published — the fake NEAREST stays closed. The universal Preview exit (`enforceTargetBatchInvariant`) reads `publishable`; Starter Pack Rescue keeps `accepted`; the Apply door selects by the route the Preview came from. Restores the accepted Protein −13 °C ECO Multi-Main result (`ok:true`, Σ 1000 g, `reached:false`, score 9) and the accepted Vegan fuzz-seed 454174848 batch reconciliation, both of which `7edd90ea` had rewritten into expected refusals. | `7edd90ea` reverted-in-behaviour by this restoration; original acceptance `0546a918` (Protein) and `34be1878` (batch invariant) | `recalculateDirection.contract.test.ts` | `applyPipeline.ts` → `assessDirectionCandidateProgress`, `enforceTargetBatchInvariant`, `buildStarterPackRescuePreview` gate, `VerifiedApply` optimize door | LOCKED |
| GEL-P0-021 | Crown trigger is reachable | A line that is not yet Main renders a control that can crown it, in **both** responsive presentations, wired to the Main role write. | `1c94d67c` (2026-08-26) | `crownMain.contract.test.ts` | `IngredientLineControls.tsx` → `MainRoleTrigger`; `IngredientRow.tsx` render sites | LOCKED |
| GEL-P0-022 | Saved machine is the NEW-recipe default | The account's saved machine preference is the default for a NEW recipe, and it outranks a stored per-product `user_recipe_defaults` row for the **machine, the batch and the serving mode**. The stored default keeps everything that is not a machine fact (Direction, mode, product). The batch is `userDefaultBatchGrams ?? deriveMachineSetup(profile, product).recommendedBatchGrams` — product-specific, never the figure frozen into the record. Saved recipes and open drafts are untouched; with no saved machine the Professional 1000 g fallback stands. **Supersedes the opposite assertion landed in PR #17**, under the owner's reopen instruction *"A. NEW RECIPE: saved account machine preference wins"*. | PR #21 (2026-08-30) | `machinePreferenceNewRecipeDefault.contract.test.ts` | `recipeProfileStore.ts` → `defaultsFor`, `mergeMachineAccountDefault`, `machineAccountFallback`; `machineAccountDefault.ts` → `machineAccountDefaultSnapshot` | LOCKED |
| GEL-P0-023 | Batch rescale preserves the Sorbet stabilizer system | A batch change may not manufacture an authority-invalid stabilizer system. The system is projected through the SAME canonical authority — `sorbetStabilizerWholeGramBand`, derived from `SORBET_STABILIZER_SYSTEM_POLICY`'s percentages — never through a second rule and never through a literal gram ceiling. The aggregate is the proportional total rounded to whole grams and capped by the new ceiling, so scaling **up** is never clamped away; it is raised to the new minimum only when the system already held its own; it is split by largest remainder, preserving composition as closely as whole grams allow; no component is invented and none goes negative. Add-time and gram-edit clamping, non-Sorbet rescaling and the Apply-door authority are all unchanged. **Corrects the recorded PC-02 cause**: the Solver never raises the stabilizer system, and the 34 g exemplar is an invalid harness artefact — `addIngredient` clamps it to 1 g. | PR #41 (2026-08-30) | `sorbetBatchRescaleStabilizer.contract.test.ts` | `sorbetStabilizerRescaleProjection.ts` → `planSorbetStabilizerSystemRescale` (deliberately BESIDE the authority, which is inside the GEL-P0-018 Rescue Edge source closure); `recipeStore.ts` → `rescaleWithOwnerStabilizerSystem`, `resizeRecipeBatch` `pinnedLineIds`, applied at all three live batch-change routes (`setBatchGrams`, `setMachineSelection`, `setVisibleProductType`); the load paths (`resolveProfileBatch`, `resolvePayloadBatch`) are deliberately out of scope | LOCKED |
| GEL-P0-024 | CI isolated lanes stay excluded AND executed | A suite lifted out of `npm test` for a CI lane of its own must be excluded **here** and executed **there** — and the pairing is what is locked, not the file. Both current lanes (`recipeVectorProximity`, PR #40; `starterPackDirectionRescue`, PR #52) keep: the exclusion in `vite.config.ts`, the file itself (exclusion is never deletion), a dedicated config including exactly it with `fileParallelism: false`, an npm script pointing at that config, and a CI job that invokes it **through that script** and carries neither `npm test` nor `npm run build`. The failure mode with no natural alarm is the vacuous lane: if the lane stops matching the file — renamed path, dropped `include`, job removed in a workflow cleanup, or a bare `vitest run <path>` that silently honours the very exclusion it means to bypass — the job passes having executed **nothing**, and the default suite cannot notice because the file is legitimately absent from it. Isolation may never become relaxation: `starterPackDirectionRescue` keeps its own `< 15_000 ms` wall-clock assertion, and `vite.config.ts` grants no global `testTimeout` to the other ~10 000 tests. Deliberately **not** locked: how long either suite may take, and how hard any budget is — only WHERE each runs and THAT it still runs. | PR #40 (2026-08-30), PR #52 (2026-08-31) | `ciIsolatedLanes.contract.test.ts` | `vite.config.ts` → `test.exclude`; `vitest.solver-contracts.config.ts`; `vitest.direction-rescue.config.ts`; `package.json` → `solver:contracts`, `direction:rescue`; `.github/workflows/ci.yml` → jobs `solver-contracts`, `direction-rescue`; detailed enforcement stays in `src/qa/solverContractsIsolation.test.ts` | LOCKED |
| GEL-P0-025 | Off-batch Sorbet reaches the exact projection | A Sorbet draft that is off its target batch is still eligible for the closed-form exact Direction projection, because `projectSorbetDirectionCandidate` solves FOR `target_batch_grams` and is exactly what repairs such a draft. The relaxation is narrow and the narrowing is load-bearing: **off batch + exactly one Main**, with the batch restored first through the canonical `rescalePreservingMainGroup(..., preserveCandidateMain: false)`. A **multi-Main** off-batch draft is short in its Main GROUP and stays with the certified Main frontier (the served two-Crown 150/150 Sorbet is still raised to 300/300); a **no-Main** draft is an incomplete scaffold and keeps its GEL-P0-014 missing-role refusal; **on-batch behaviour is unchanged for every Main count**. Eligibility only — every Engine, constraint, lock, Main/Crown, ProductBehavior, stabilizer and Direction gate still decides the candidate, and `enforceTargetBatchInvariant` remains the final batch authority. **Corrects the recorded PC-03 cause**: the 22 acceptance cells are harness artefacts and neither citrus fibre nor NEAREST coverage was causal. | PR #55 (2026-08-31) | `sorbetDirectionOffBatchEligibility.contract.test.ts` | `applyPipeline.ts` → Sorbet exact-Direction eligibility in `buildOptimizePreviewWithDirection` | LOCKED |

---

## Historical regressions these contracts exist to prevent

| Date | Commit | Stated purpose | What it actually did | Now caught by |
|---|---|---|---|---|
| 2026-08-26 | `f5d57bdf` | "fix fresh recipe behavior hydration and **unify main badges**" | Deleted `row-main-toggle` — the only control that could crown a line — and rewrote five test files to assert the empty slot. Staging shipped ~9 h with no way to set a Main. | GEL-P0-021 + owner-locked guard + protected-path gate |
| 2026-08-28 | `7edd90ea` | "fix(pro): **restore live draft result visibility**" | Added a strict-progress Direction acceptance gate at Preview and the Apply door; converted an accepted positive Protein Multi-Main Apply **and** the accepted Vegan fuzz-seed batch reconciliation into refusals, rewriting all three assertions in the same commit. Its `strictlyCloser` term is unsatisfiable from an in-band draft, so the veto could not be escaped by any correction. | GEL-P0-020 + protected-path gate + owner-locked guard |
| 2026-08-28 | `e00175d3` | "feat(machine): **enforce canonical batch coherence**" | Made Professional inherit a Home machine batch, breaking the canonical 1000 g default. Repaired ~6 h later by `ee70985c`. | GEL-P0-007 + protected-path gate |
| 2026-08-30 | PR #17 | "the account's saved machine is the default for a NEW recipe" | Bridged the two machine authorities correctly, but let a stored per-product default outrank the saved machine — so `pro@pro.com`, carrying a `user_recipe_defaults` row from 2026-08-14, could save any home machine and still get Professional 1000 g. The served proof was taken on `test1@test1.com`, the one account with no such row, so it passed while the bug was live. | GEL-P0-022 + a matrix that runs every machine in `MACHINE_CATALOG` against a stale Professional default |

None of the three was labelled `design` or `copy`. A gate keyed on commit names
would have caught none of them — which is why the protected-path gate classifies
the **diff**, not the message.
