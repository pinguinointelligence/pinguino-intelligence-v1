# FULL FORMULATION — RECOVERY AUDIT (read-only forensic)

**Date:** 2026-07-23 · Method: 4 parallel exhaustive read-only sweeps (git forensics · test classification · bounds/roles · templates/seeds) + planning-history scan + staging DB column audit. NOTHING was reset/cleaned/deleted/rewritten. No science invented.

**FINAL CONCLUSION: D — PREVIOUS TESTS NEVER IMPLEMENTED FULL FORMULATION** (evidence below; conclusions A/B/C/E excluded by evidence, not assumption).

---

## 1. Current capability table (unchanged from FORMULATION_CAPABILITY_LEDGER, re-verified)

| Capability | Function | Exists | UI uses |
|---|---|---|---|
| Calculate metrics | `calculateRecipe` (pure evaluator) | YES | YES |
| Local correction | `proposeCorrections`/`proposeAutoFix` (greedy single-lever, Golden-Middle-verified; + IF9 add-only multi-step rescue `batchRescueStepSolver`) | YES | YES |
| Full formulation (differentiated grams from an arbitrary invalid state) | — | **NO — never existed in any ref** | — |
| Batch scaling | `rescaleBatchToTarget` (§17.4) | YES | explicit action only; REJECTED as balance (frozen) |
| Template instantiation | `STARTER_TEMPLATES` (intentRecipeDraft.ts) — fixed approved gram lists scaled to batch | YES | intent flow only — NOT wired to `Przelicz z PI` |

## 2. Git forensic inventory (Phase 2)
- **Refs:** 51 local branches (incl. 9 slice/* worktrees + 20 agent worktree branches), 4 remote refs, 1 tag, 0 stashes, dense July-2026 reflog, ~30 fsck-unreachable objects (3 unreachable commits = worktree index snapshots: legacy-products migration, slice-e, google-oauth — none solver-related).
- **Term sweep** (`git log --all -S/-G`, ~30 terms): `formulateRecipe`, `generateRecipe`, `balanceRecipe`, `solveRecipe`, `auto_balance`, `seed recipe`, `usage range`, `max_percent`, `ingredient roles` → **ZERO hits in any ref, merged or unmerged**. All auto-balance-adjacent hits classify as: local-correction (`6b53732` solver birth 2026-06-12 „exact gram suggestions with Golden Middle verification"; `fcae329` apply core; `c95e1b8` targetBandOverride — „DEFAULT solver byte-identical"; `7aaee14`/`9643c62` IF9 add-only rescue; `26f93a2` customer Monitor recalc; `97ed23a` the recent orchestration — „approved mechanisms only, no new math"), batch-scaling (`8f8bbf9`), fixtures-only (`da718fc` STARTER_TEMPLATES — instantiates FIXED hand-written templates from a valid intent, „Composition never fabricated"; `70639ad` golden recipes; `9f5a357` BASE_LINES illustrative), metrics-only (bands/gates/regulator), docs-only (`9f11a27`).
- **Deleted files:** the complete `--diff-filter=D` history contains 4 deleting commits — nav/shell cleanup, bundled-catalogue retirement, a theme test, the v0.95 seed replacement. **No solver/balancer/formulation/template/optimizer file was ever deleted.**
- **Unmerged work:** ready-recipe catalogue (`formulaStatus metadata_only` — „never calculated"), UI/design/docs/matching branches. No solver work.

## 3. Prior-test classification (Phase 3)
Every engine/solver test (foundation, composition, calculateRecipe, goldenRecipes, goldenCorrections, solver, apply, contracts/minus11, temperature regulator, constraint-studio) starts from a **complete, human-authored gram set** (Appendix-A base, literature golden recipes, the owner's verbatim external-reference recipes, hand-engineered broken scenarios in the neighbourhood of validity). Classification: **metrics-only or local-correction — zero full-formulation, zero template-based-formulation, zero last-version-recovery tests.** Why prior tests passed while 8×1 g fails: nothing was ever ASKED to formulate — the solver is a greedy local corrector that converges only near a valid formulation; there is NO simultaneous multi-variable solve over all lines against the 11 bands; the only complete-gram generators are fixed templates and the proportional rescale (which is per-100 g invariant by construction).

## 4. ChatGPT-era work (Phase 4 — the owner's "days of building")
The planning history (`planning chat history.txt`, available locally, 150 KB, NOT committed — per standing rule) documents: (a) validation of the ingredient MATH model against the external reference calculator (≈95–98% per the owner's own in-file assessment), (b) OBSERVATION of the external tool's auto-balance behavior (fructose/butter/fruit series), (c) behavioral RULES for a future auto-balance (premium-lock, impossible-balance honesty, idempotence, no-magic-ingredient), and (d) the explicit status „auto-balance …: **jeszcze nie**; silnik PINGÜINO v1: gotowy do budowy" with the explicit plan „Na początku nie robimy jeszcze auto-balance AI". **The full-formulation algorithm was never specified — only its target behavior was observed on the external tool.** What WAS recovered into the repo: the verbatim numeric fixtures (chocolate-123, raspberry-428, verified milk base incl. SALT 1.01 g), the influence coefficients, and the behavioral rules (which shaped the correction solver). Nothing further exists to recover from this source.

## 5. Dosage & role data audit (Phase 5) — **the previous "no bounds anywhere" claim was WRONG**
The repo + staging DB **HAVE a complete dosage vocabulary**: `recommended_dosage_percent_min/max` + `stabilizer_activity` + `usage_notes` exist in ALL four table contracts (migrations 0004–0007), both row types ([ingredientRow.ts:87-89](src/data/ingredients/ingredientRow.ts), productRow.ts:125-129), intake validation, and the authenticated search read model — **populated on 253 of 2,070 approved Mapper rows**, including:

| Ingredient | Role (solver) | Min | Max | Source | Approved | Reaches solver |
|---|---|---:|---:|---|---|---|
| Tara gum `PI-ING-000492` | candidate `tara_gum` — but in NO SELECTION_RULES entry (defined-but-unreachable; flagged in STARTER_PACK_TOOLBOX_POLICY item 5) | **0.2%** | **1.0%** | Mapper v1.0 (locked, Verified) | YES | **NO** |
| Guar gum `PI-ING-000472` | not a candidate | 0.2% | 1.0% | Mapper v1.0 | YES | NO |
| Salt `PI-ING-000458` | NOT a candidate (policy: flavour-only, never auto-solved without a dose cap) | — | — | NULL; working-model 0.15–0.25% exists ONLY in the out-of-repo planning history | — | NO |
| Inulin `PI-ING-000456/455` | candidate `inulin` (solids_up/stabilizer) | — | — | NULL | — | candidate yes, bound no |
| Milk 3.5% / Cream 30% / SMP / Sucrose / Dextrose | candidates | — | — | NULL | — | candidates yes, bounds no |

**Broken connection (exact):** the data flows DB → `IngredientRow` (fetched by `select('*')`) and STOPS — `EngineIngredient` ([types.ts:113-140](src/engine/types.ts)) and `CorrectionCandidate` (corrections/types.ts:51-60) have **no dosage fields**; `ingredientRowToEngineIngredient` drops them structurally. The solver's only quantity limits are global (`MIN_ACTION_GRAMS=0.05`, `MAX_ADDITION_FACTOR=2×batch`) + recipe-level TARGET_BANDS. Two existing owner-decision docs (`docs/engine/FRUCTOSE_DOSAGE_BOUND_DECISION.md`, `docs/engine/STARTER_PACK_TOOLBOX_POLICY_2026-07-18.md`) **already name the required enabler**: per-candidate `dosage_min/max` on `CorrectionCandidate` with owner-supplied values. Classification: stored bounds = present-not-connected; per-candidate solver bounds = genuinely absent (documented as needed); salt/stabilizer working-model numbers = absent from the repo (out-of-repo source only).

## 6. Approved seeds/templates audit (Phase 6) — **approved seeds EXIST**
**Four legally sanctioned formulation seeds** (all in [intentRecipeDraft.ts](src/features/studioFlow/intentRecipeDraft.ts) as „locked starter templates"):
1. `milk_base_v1` — standard gelato **−11 °C**: milk_3_5 670 / cream_30 130 / smp 35 / sucrose 130 / dextrose 30 / tara_gum 5 (1000 g);
2. `milk_base_g17_minus12_v1` — **G17 verbatim, −12 °C, owner-authorized 2026-07-18**: milk 600 / cream 135 / smp 43 / sucrose 86 / dextrose 80 / inulin 54.1 / tara 1.9 (POD 15.57 / NPAC 46.18 / ice 50.34);
3. `milk_base_g18_minus13_v1` — **G18 verbatim, −13 °C, owner-authorized**: milk 600 / cream 125 / smp 45 / sucrose 72 / dextrose 112 / inulin 44.1 / tara 1.9;
4. `chocolate_base_v1` — chocolate gelato **−11 °C only** (no approved −12/−13 chocolate anchor — „honestly limited, not faked").

Approved-but-unwired: G12 (−11 clean anchor, full formula present; starter deliberately uses milk_base_v1 — would need owner sign-off); S01/S02/S03 sorbet + V02_fixed vegan (approved clean references, catalog-blocked — no water/strawberry/plant-milk demo lines; starter resolves `not_supported`). NEVER seeds: G15/G11 (metrics-only, no formula exists), C01 chocolate fixtures (evidence/stress, non-final), V01_rejected, the 8 GOLDEN_RECIPES (QA-only, „NOT verified production recipes"), the 4 externalReference fixtures (owner-VERIFIED data but approved as calibration/diagnostic probes only — the verified milk base 523.5/263.5/48.4/123.4/38.3/1.92/1.01 is the best candidate to NOMINATE for template status), demo presets, illustrative BASE_LINES, the deliberately-empty golden/index.ts, docs/recipes (names only, zero grams).

## 7. Recovery feasibility + recommended integration path (Phase 7 modes, existing approved work ONLY)
- **A. Local correction** — EXISTS (current path; safety gates frozen).
- **B. Recover damaged draft from last valid version** — FEASIBLE NOW: `recipe_versions` (S2 save/versioning) stores complete RecipeInputs; a damaged draft with a saved valid version can seed from it (respecting current identities/locks/batch/temperature). No new science.
- **C. Formulate from an approved template** — FEASIBLE NOW for standard gelato −11/−12/−13 and chocolate −11: instantiate the sanctioned STARTER_TEMPLATE for the profile+temperature, map the user's SELECTED ingredient identities onto the template roles where they match, then run the existing correction solver on top. No new science — composition of two approved mechanisms. Honest `not_supported` elsewhere (sorbet/vegan until their approved references are catalog-wired).
- **D. Honest unsupported** — EXISTS (structured failures with proof).

## 8. Exact missing inputs (the ONLY genuinely-required owner decisions)
1. **Per-candidate dosage bounds** for the solver toolbox (sucrose, dextrose, milk, cream, SMP, inulin, water, salt) — the schema gap is already named in FRUCTOSE_DOSAGE_BOUND_DECISION.md / STARTER_PACK_TOOLBOX_POLICY; tara+guar already have approved 0.2–1% in Mapper; ratifying the working-model salt 0.15–0.25% + stabilizer 1.8–2.1 g/kg (from the planning history) would close salt/stabilizer.
2. **Tara gum reachability** — include `tara_gum` in SELECTION_RULES (policy item 5 decision).
3. **Optional template promotions** — G12 as a second −11 seed; the VERIFIED external-reference milk base as a template; catalog wiring for sorbet/vegan approved references.

## 9. Owner fixtures & expected behavior after mode routing (Phase 9)
- Valid 999.91 g copy → mode A: already-balanced sentence, real correction preview, or proven failure (current behavior, frozen).
- 8 × 1 g damaged draft → mode B if a valid saved version exists (seed from it → differentiated preview); else mode C (standard gelato −11 → seed `milk_base_v1`, map the 8 selected identities, solver on top → differentiated preview); never 8 × 125 g (gate frozen); mode D honest message only when no version AND no template.

## 10. Final conclusion
**D. PREVIOUS TESTS NEVER IMPLEMENTED FULL FORMULATION.** A: excluded (no unmerged ref contains one). B: excluded (no solver-related file ever deleted). C: excluded (no scratch implementation exists; the ChatGPT source contains observations + rules, not an algorithm). E: not applicable (all named historical sources were available and searched: full ref graph, reflog, fsck unreachables, worktrees, planning history file, docs, fixtures, staging DB). The owner's earlier engine-building days produced: the verified math model (calculateRecipe reproduces the external reference to 2 decimals), the correction solver embodying the recovered behavioral rules, locked golden/temperature fixtures, owner-authorized starter templates (G17/G18), and a dosage vocabulary in Mapper — **everything needed for modes B+C exists and is approved; only the per-candidate dosage-bound VALUES and two small decisions are genuinely missing.**
