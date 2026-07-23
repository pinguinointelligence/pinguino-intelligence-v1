# PRZELICZ Z PI — REJECTION GATE + HONEST CAPABILITY REPORT — completion ledger

**Status:** `PRZELICZ Z PI — FULL FORMULATION CAPABILITY MISSING`
**Withdrawn:** the previous status `REAL AUTO-BALANCE CONNECTED` (owner definitively FAILED it: 8 × 1 g → 8 × 125 g with `Parametry poza optymalnym zakresem: 9 → 9` and an enabled `Zastosuj zmiany`).
**Date:** 2026-07-23 · Engine science untouched (bands/anchors/PAC/POD/Mapper/weights/versions unchanged, pinned).

## Root cause (owner's definitive fail, proven)
- **Why `rescaleBatchToTarget` was accepted as auto-balance:** the previous orchestration treated ANY gram change as a successful preview. For 8 equal 1 g rows, the batch-first proportional rescale produced 8 × 125 g; the solver rounds then found no applicable action (`solverRounds` ran but returned nothing on the absurd equal composition), and `changed=true` from the rescale alone qualified the preview. `batchRescaled=true` was wrongly sufficient.
- **Was the Engine only evaluating?** Yes — `calculateRecipe` computed metrics (9 violations before and after; a proportional rescale never changes per-100 g composition, so the violation set is scale-invariant).
- **Did the scientific solver change any grams?** No — zero applied actions in the owner's case; every gram change came from the proportional rescale (`1000 / 8 = 125`).
- **Why 9 → 9 remained:** scaling cannot fix band violations (per-100 g metrics are scale-invariant); nothing else changed the composition.
- **Why salt/tara bounds did not block:** NO approved per-ingredient dosage bounds exist anywhere in the system (see the capability table) — nothing could reject 125 g salt. Reported as the exact missing bound set below.
- **Does a full formulation solver exist?** NO (audited below).

## PHASE 3 — capability table (audited, honest)
| Capability | Exact function | Input | Output | Exists? | Current UI uses it? |
|---|---|---|---|---|---|
| Calculate metrics | `calculateRecipe` ([calculateRecipe.ts](src/engine/calculateRecipe.ts)) | RecipeInput | metrics/indicators/warnings — CHANGES NO GRAMS | YES | YES |
| Local correction | `proposeCorrections` / `proposeAutoFix` + `applyCorrectionActions` ([solver.ts](src/engine/corrections/solver.ts), [apply.ts](src/engine/corrections/apply.ts)) | valid-ish RecipeInput + context | bounded single-violation add/reduce actions, Golden-Middle verified | YES | YES (iterated ≤4 rounds) |
| **Full auto-balance / formulation** (rebuild a complete recipe from an arbitrary invalid state, with roles + dosage bounds) | — | — | — | **NO — does not exist in production code** | n/a |
| Batch scaling | `rescaleBatchToTarget` ([constraintSet.ts](src/features/recipe-constraints/constraintSet.ts)) | input + set + target | proportional scale, locks exact | YES | YES — the explicit „Przeskaluj partię" action; NO LONGER accepted as balancing |
| Per-ingredient dosage bounds (salt/tara/stabilizer/inulin max…) | — | — | — | **NO approved bounds anywhere** (engine warnings cover only alcohol-range/machine-capacity/batch-mismatch/confidence/cost; no salt metric; Mapper rows carry no dosage-limit columns) | n/a |
| Approved formulation template registry | — (the customer-flow `BASE_LINES` in [recipeStructure.ts](src/features/customer-flow/recipeStructure.ts) is explicitly „illustrative preview", NOT approved formulation; `SAFE_FLAVOR_DOSES` intentionally empty) | — | — | **NO approved seed/template** | n/a |

Per the task's own rule („Do not silently invent a template… If an approved bound is missing, report the exact missing bound. Do not allow an unbounded ingredient into full auto-formulation") the honest deliverable is the REJECTION GATE + this capability report — not a fabricated formulation.

## Completed
- **Phase 1 — invalid success path REMOVED:** a proportional batch rescale alone can no longer qualify as a `Przelicz z PI` preview. Acceptance in [applyPipeline.ts](src/features/constraint-studio/applyPipeline.ts): a changed candidate is valid ONLY when (a) every hard metric is in range, or (b) violation count strictly drops, or (c) a REAL solver action verifiably reduced the engine's own weighted severity (`severity_points` sum — scale-invariant, so a pure rescale can never fake it). `rescaleBatchToTarget` remains available exclusively as the explicit „Przeskaluj partię" action.
- **Phase 2 — hard gate, both layers:** builder returns the new structured `unsafe_proposal` (with `violatedMetrics`, `solverInvocations`, `batchOnly`); the Apply door RECOMPUTES improvement trustlessly from the actual inputs and structurally blocks non-improving optimize proposals — the forged exact 8 × 125 g preview is unappliable, message verbatim: „PI nie utworzyło bezpiecznej receptury. Propozycja została odrzucona. Receptura nie została zmieniona." Door order: stale → locks → duplicates → batch → improvement.
- **Phase 12 — proposal source proof:** the preview card now carries the owner-QA line `Źródło propozycji: …` (canonical correction solver + rounds, or honestly „proporcjonalne wyrównanie partii (§17.4)" when parameters were already in range) — a rescale can never masquerade as formulation.
- **Phase 9 fixture (exact 8 ingredients, all 1 g, Gelato/Classic/−11, unlocked):** [autoBalance.test.ts](src/features/constraint-studio/autoBalance.test.ts) — the equal-125 result is FORBIDDEN by test; the case resolves to the honest rejection (proven `batchOnly=true` + violated metrics) or a genuinely differentiated improved preview; the forged 8×125 preview blocks at the door with the exact message.
- **Phase 10 fixture (owner's exact 999.91 g MyGelato copy):** classified at −11/−12/−13 — real improvement preview, `already_clean`, or a proven failure with exact metrics; never a rescale-only preview; never one generic sentence.
- **Files:** applyPipeline.ts (acceptance gate + `unsafe_proposal` + door invariant + severity measure), constraintStudioCopy.ts (rejection sentence + source lines), previewIssueMessage.ts, recalcDiagnosis.ts (classification), ProRecalcPanel.tsx (exact rejection message), ConstraintPreviewCard.tsx (source line). **Gate: 4,713 tests / 347 files PASS · ESLint 0 · tsc ✓ · build ✓.** Staging deploy + bundle proof: final report.

## Not completed (the exact missing capabilities — reported, not faked)
1. **Full formulation solver** — no production function can rebuild a complete recipe from an arbitrary invalid state (the engine's correction solver is single-violation, bounded, local). Building one requires owner-approved science (objective, candidate roles, template seeds).
2. **Approved per-ingredient dosage bounds** — no approved max for salt, tara gum, total stabilizer, inulin, SMP, sucrose, dextrose, milk, cream exists in Mapper columns, Engine config, or profile contracts. Until the owner approves a bounds table, no candidate can be dosage-checked individually (the improvement gate rejects the absurd cases indirectly).
3. **Approved formulation template registry** — customer-flow `BASE_LINES` is explicitly illustrative; no approved seed exists to start formulation from.
- Served AUTHENTICATED owner click-through — AWAITING OWNER after deploy.

## Regression proof
Engine science — untouched (versions pinned). Live search + grouping — untouched, green. Stable IDs — preserved. Workbar — same store calls. Save/version — pinned. Duplicate invariant + batch invariant — still enforced (door order fixed; 2937.9 g case still blocks with the batch message). Locks — byte-exact. Full suite 4,713/4,713.

## Owner acceptance (staging, Pro)
**Test A** (999.91 g MyGelato): realny Podgląd z poprawą, „Receptura znajduje się już w zatwierdzonym zakresie…", albo dokładny naukowy powód — nigdy jedno zdanie generyczne. **Test B** (8 × 1 g): ŻADNEJ propozycji 8 × 125 g — uczciwa odmowa „PI nie utworzyło bezpiecznej receptury. Propozycja została odrzucona. Receptura nie została zmieniona." (Apply niedostępne), albo realnie zróżnicowane gramatury z poprawą metryk.
