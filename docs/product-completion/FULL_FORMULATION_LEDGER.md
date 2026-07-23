# FULL FORMULATION AND CONSTRAINED REFORMULATION — completion ledger

**Status:** `FULL FORMULATION AND CONSTRAINED REFORMULATION — DEPLOYED, AWAITING OWNER VALIDATION`
**Date:** 2026-07-23 · Engine science untouched (bands/anchors/PAC/POD/Mapper/weights/versions unchanged; ENGINE 0.4.0 / CONFIG 0.7.0 pinned). Every seed gram = a verbatim approved repo record.

## Root cause (why this was missing)
Full formulation never existed (audit conclusion D): the engine is an evaluator + greedy local corrector that converges only near a valid recipe; the only complete-gram generators were fixed starter templates (not wired to `Przelicz z PI`) and the proportional rescale (per-100 g invariant — cannot fix bands, produced the 8×125 g fail). Batch growth came from append-merge defects (fixed earlier) and a rescale-loop hazard (now structurally guarded). Generic failures came from unclassified `no_proposal` (now proven/structured).

## Evidence baseline (approved inputs per product type)
| Product | Templates (verbatim sources) | Status |
|---|---|---|
| Gelato −11 | `milk_base_v1` (locked starter) | approved |
| Gelato −12 | `milk_base_g17_minus12_v1` = G17 (owner-authorized 2026-07-18) | approved |
| Gelato −13 | `milk_base_g18_minus13_v1` = G18 (owner-authorized) | approved |
| Chocolate −11 | `chocolate_base_v1` (locked starter) | approved (−12/−13 honestly limited) |
| Sorbet −11/−12/−13 | S01/S02/S03 (locked clean references; fruit = USER-supplied role; water = approved toolbox) | approved |
| Vegan −13 | V02_fixed (locked clean reference; plant roles USER-supplied) | approved (−11/−12 no anchor) |
| Fruit gelato −11 | `fruit_gelato_ref_v1` (raspberry-premium reference proportions) | **reference-derived, staging-only, NOT approved science** — for owner review |
| Protein | — | honest unsupported (no approved template/target contract) — never routed to gelato |

## Completed
- **[templateRegistry.ts](src/features/formulation/templateRegistry.ts)** — `FormulationTemplateRegistry`: template ID/category/temperature/status/approval source/base batch/role targets (adjustable vs template-controlled, e.g. stabilizer dose); `selectFormulationTemplate` with honest `no_template_for_category` / `no_template_for_temperature`.
- **[ingredientRoles.ts](src/features/formulation/ingredientRoles.ts)** — canonical `FunctionalRole` (18 roles) + deterministic `resolveFunctionalRole` from EXISTING engine data (category, composition sugar split, fibre, salt %, flags). The solver sees real roles; „GŁÓWNY" stays presentational.
- **[formulate.ts](src/features/formulation/formulate.ts)** — the mode router + pipeline: `routeFormulationMode` (A `full_formulation` / B `constrained_reformulation` / C `local_correction` / D `unsupported`; near-batch ±25% → C; poured actuals → C; all-locked → C so the all-locked message survives); `buildFormulationProposal` = role resolution → template mapping (user IDs preserved; role grams split across multiple same-role selections; ranges clamped; exact locks byte-preserved) → toolbox auto-fill (WATER ONLY, always reported with reason) → user-supplied-role stop (fruit/plant/chocolate never invented: „Brakuje składnika w roli: …") → unmapped selections kept FIXED at the user's amount (salt rule — no approved bound → never optimized) → missing optional roles NEVER re-added (honest gap + „Możesz dodać zatwierdzony składnik pełniący tę rolę.") → two-pass exact-batch normalization → `CompleteNextRecipeInput`.
- **Pipeline wiring** ([applyPipeline.ts](src/features/constraint-studio/applyPipeline.ts)) — router runs FIRST in `buildOptimizePreview`; formulation branch: seed → canonical-identity merge → existing correction solver (≤2 verified rounds) → batch restore → acceptance; preview carries `formulation {mode, templateId, templateStatus, added, missingRoles, recommendations, keptFixed}`. Ranges in formulation are TARGET constraints (0 g draft vs 150–250 g range = solvable, not invalid).
- **Beat-the-null acceptance (builder + trustless door):** a proposal must be in range, or strictly beat the draft's NULL HYPOTHESIS (the proportional projection of what the user typed; equal split for a zero-mass draft) on violation count or engine weighted severity. The owner's forbidden 8 × 125 g proposal IS its own null → structurally rejected forever; template formulations beat it decisively. No invented thresholds.
- **Runaway guard (Phase 10/21):** the Apply door rejects any optimize proposal whose TARGET batch ≠ the current target (the 111,000 g class) + batch equality + duplicate + lock invariants all still enforced; **20-cycle stability test green** (batch stays 1000 g, no duplicates, no growth).
- **Preview (Phase 19):** mode + „Źródło formulacji: <templateId> + kanoniczny solver korekt PI (N rund)" + reference-derived disclaimer + PI-added lines with grams/roles/reasons + honest gaps/recommendations ([ConstraintPreviewCard.tsx](src/features/constraint-studio/ui/ConstraintPreviewCard.tsx)); unsupported/missing-role states render their exact messages in the recalc panel.
- **Tests** — NEW [formulation.test.ts](src/features/formulation/formulation.test.ts) (21) covering the required matrix: no-gram recipe → differentiated 1000 g at −11/−12/−13; exact Milk 500 g lock byte-preserved; max-500 range; fruit 150–250 range (reference-derived labelled); removed inulin never reintroduced + recommendation + still appliable (safe-suboptimal rule); the exact 8×1 g fixture → differentiated (never 125s; salt kept 1 g; tara ≤ template dose) + Apply→Undo exact; MyGelato 999.91 g → local-correction classification; sorbet −11 (water auto-added with reason; fruit >300 g) + fruit-missing stop; vegan −13 with user plant rows + vegan −11 unsupported; chocolate −11 + custom unsupported; 20 cycles; forged 111,000 g blocked; store/direct equality; versions pinned. **Gate: 4,734 tests / 348 files PASS · ESLint 0 · tsc ✓ · build ✓** (frozen baselines all green: 8×125 rejection, duplicates, batch, locks, search, shell).
- **Commit + staging deploy:** final report (served bundle proof included).

## Not completed (exact missing approved inputs — honest structured states, never silent fallbacks)
1. **Protein** — unsupported (`unsupported_profile`): no approved template, no target bands, no bounded protein-source contract. Needs: owner-approved protein template + targets.
2. **Chocolate −12/−13** — unsupported: no approved clean anchor (C01 fixtures are explicitly non-final evidence).
3. **Vegan −11/−12** — unsupported: only V02 (−13) is a locked clean reference.
4. **Fruit gelato** — reference-derived only (staging): needs owner promotion of the reference proportions (or the verified external-reference milk/fruit bases) to approved template status.
5. **Per-candidate dosage bounds** — the audit's owner-decision list stands (sugar/dairy/salt values; tara SELECTION_RULES inclusion); salt today is protected by the kept-fixed rule, not by an approved numeric bound.
6. Served AUTHENTICATED owner click-through — AWAITING OWNER (Pro-gated).

## Regression proof
Engine science (versions pinned) · live search + grouping (untouched, green) · stable IDs (user line ids preserved through formulation) · workbar (same store calls) · save/version (round-trips pinned) · locks (byte-exact) · duplicates (invariant enforced) · no runaway batch (guard + 20-cycle) — full suite 4,734/4,734.

## Owner acceptance package (staging, Pro, /pro/recipe)
1. Nowa receptura bez gramów (mleko/śmietana/SMP/cukry/inulina/tara, Gelato −11, 1000 g) → `Przelicz z PI` → zróżnicowane gramatury, suma 1000 g, „Źródło formulacji: milk_base_v1…". 2. 8 składników × 1 g → zróżnicowany wynik (nigdy 8×125 g; sól zostaje 1 g) → Zastosuj → Cofnij przywraca 8×1 g. 3. Mleko zablokowane 500 g → dokładnie 500 g, reszta dopełnia. 4. Mleko zakres 0–500 → ≤500. 5. Usuń inulinę → bezpieczny niższy wynik + rekomendacja roli, bez ponownego dodania. 6. MyGelato 999,91 g → korekta lokalna / already-balanced / dokładny powód. 7. Gelato −12/−13 → G17/G18. 8. Sorbet −11 z owocem → woda dodana z uzasadnieniem. 9. Vegan −13 z bazą roślinną → V02. 10. Protein → uczciwe „profil nie ma zatwierdzonego wzorca". 11. 20 × przelicz→zastosuj → zawsze 1000 g, bez duplikatów. 12. Zapisz/otwórz → identyczna receptura.
