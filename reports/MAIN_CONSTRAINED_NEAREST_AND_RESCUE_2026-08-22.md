# Main-constrained NEAREST + cross-profile rescue ingredient advisor (2026-08-22)

Branch: `claude/main-constrained-rescue` (fresh worktree `…-main-rescue` from `origin/staging` **466121c**).
Scope guard: Sorbet physics untouched (`src/engine/sorbetFreezingPhysics.ts`, `src/engine/sorbetDirectionProjection.ts`
not modified), hard bands untouched, Mapper Base untouched
(`docs/ingredients/validation/mapper_basement.csv` sha256 `b13f5db4affd9c3be5ccbe59b40920053197a3697a3fa1bd4a859406e8baed38`),
no production deploy.

## A. Owner reproducer — Sorbet −13 °C, OPTIMAL, Sweetness 0, Hardness 0 → −1, Strawberries MAIN = 600 g

Draft (1000 g BASE): WATER 143 · SUCROSE 78 · DEXTROSE 125 · INULIN 50 · TARA GUM 4 · STRAWBERRIES 600 (MAIN).
Reproduced offline byte-for-byte on 466121c: `no_proposal` / "Solver nie znalazł korekty możliwej przy obecnych
blokadach" (violated `npac`, `pod`, `directionTargetUnreached`, 2 solver invocations, the ladder tested only
WATER/SUCROSE/DEXTROSE/INULIN). With strawberries unlocked the same draft produced a NEAREST candidate
(strawberries 585 g) — the owner's "600 → 593 g ≈ 8/10" observation.

### Root cause (proven with probes on the real path, not guessed)

1. **Different path than the matrix.** `routeFormulationMode` sends every served Mapper-based Sorbet draft to the
   **formulation (template) path** (`missing_hard_role`: Mapper "WATER · Liquid" resolves to functional role
   `flavor_other`, "SUCROSE SUGAR" to `sugar_freezing_control`, so the S03 hard roles `water` /
   `sweetener_sucrose` look missing). The closed-form exact Sorbet projection
   (`projectSorbetExactDirectionCandidate`) lived ONLY in the local-correction path (`applyPipeline.ts` ~5220) — it was
   **never tried** for the served draft. The 150-cell matrix, by contrast, calls the projection directly
   (`sorbetDirectionTargetMatrix.test.ts`), so the matrix said LEGAL while the runtime said no-correction.
2. **Coordinate-descent ladder cannot solve a coupled 2-metric exact target.** The draft-vector sweep
   (`sweepDraftCandidateVector`) moves one line at a time; with Main fixed it reached severity 2.03 → 1.36 and stalled
   (`fixed_point_no_proposal` / `draft_vector_no_improvement`), although the true constrained optimum is an exact
   solution (water ≈149.6 / sucrose ≈52.5 / dextrose ≈143.9, inulin 50, tara 4, strawberries 600 → POD 20.000 /
   NPAC 52.900, hard-safe; brute-force grid of 43 061 vectors confirmed, best whole-gram severity ≈0.17).
3. **The Main frontier discarded the partial Direction progress.** `maximizeMainFlavourObjective` →
   `maximizeMainTechnicalObjective` restarts from the identity draft under served product snapshots and treats an
   unreached exact Direction as a hard gate (`direction:*` technical rules), so with the Main at its exact 60 % policy it
   handed back the UNCHANGED draft (`working == input`).
4. The executable Direction gate (`executableImproves === false`) then emitted `no_proposal`
   (`directionTargetUnreached`). With Main unlocked, the frontier's own Main-decrease search happened to land on a
   Direction-improving vector — the "nearest" was an accident of the Main frontier, not a Direction search.
   ⇒ Main fixed ≠ disabled search; it must be an equality constraint that reduces the search space.

### Fix — the SHARED Sorbet Direction boundary (`src/features/constraint-studio/applyPipeline.ts`)

- New `buildSorbetDirectionCandidatePreview(...)`: order of authority = (1) exact closed-form projection,
  (2) **Main-constrained NEAREST search**, (3) regular optimizer / honest no-correction. Called on the shared
  boundary BEFORE the mode router for every complete, on-batch Sorbet draft with an active exact Direction objective
  (and still inside the local-correction path, replacing the old inline block). Same gates as before: constraints
  preserved, candidate changed, executable native-safe, no critical warning, Direction strictly improved on the
  EXECUTABLE recipe. Preview carries `mainHeldByExactDirection` (the existing door contract: Main byte-identical +
  deterministic reproduction from the trusted draft) and new provenance `directionCandidateSource`
  (`sorbet_exact_projection` | `sorbet_nearest_search`).
- New pure module `src/features/recipe-direction/sorbetNearestDirectionSearch.ts`: deterministic bounded grid
  over the adjustable sugar lines (the same roles the Engine projection classifies; water is the batch balance;
  Main, Inulin, stabilizer and every held/locked line byte-exact), whole-gram coordinate refinement, ≤ 8 000 Engine
  evaluations (owner case ≤ 33 ms). Ranking = the Engine's own lexicographic Direction measure among native-safe,
  non-critical vectors; returns a candidate only if it strictly improves the input.
- No change to the Main frontier, hard bands, Sorbet physics or the matrix pins.

### Result for the owner case (served fixture, pure store path `createOptimizePreview`)

- Candidate: WATER 150 · SUCROSE 52 · DEXTROSE 144 · INULIN 50 · TARA GUM 4 · **STRAWBERRIES 600** (Main count 1,
  Main before/candidate/Preview/Apply = 600/600/600/600), source `sorbet_exact_projection`, no 0 g rows,
  native bands / critical warnings / Sorbet stabilizer system clean, batch 1000 g.
- Classification: the exact centers (POD 20, NPAC 52.9) are unreachable in WHOLE grams → honest NEAREST
  (consent flow "Przelicz najlepiej możliwie"); `acceptBestDirectionCandidate` + `applyPreview` pass the trustless door
  (history 1, not blocked).
- Score: **8/10** — truthfully computed, not forced. The Direction score is `10 − missed axes` with exact-center
  semantics (`reached` ⇔ distance ≤ 1e-9); the executable recipe misses both centers by 0.042 POD and 0.071 NPAC
  (the residuals are shown per axis). Any whole-gram Sorbet executable reads 8/10 under this rule; the owner may
  want a tolerance-based Direction score later — out of this task's scope (scoring authority unchanged).
- All 25 Direction cells with strawberries MAIN 600 g at −13 °C now yield a Main-held legal candidate
  (15 via exact projection, 10 via the nearest search); before, the Main-held draft had no candidate.

## B. Global rescue ingredient advisor (`src/features/constraint-studio/rescueIngredientAdvisor.ts`)

One shared Engine capability (Gelato / Sorbet / Vegan / Protein), simulation-based, bounded, deterministic:

- Candidate family per profile (ordered by the missed axes, simulation decides): Sorbet → Dekstroza, Sacharoza,
  Inulina, Woda (toolbox canonical Mapper identities; dairy excluded by `allowed_categories`); Gelato → the toolbox
  allowed for the category (sugars, inulin, SMP, milk, cream); Vegan → ONLY identities in
  `VEGAN_VERIFIED_CANONICAL_IDS` (+ the verified vegan toolbox), never VEGAN_FALSE/UNKNOWN/CONFLICT; Protein →
  toolbox + verified protein toolbox, and a rescue that breaks the Protein target is discarded. Cap
  `MAX_RESCUE_CANDIDATES = 4`. No verified Fructose payload exists in the Engine toolbox, so Fructose is NOT
  simulated (the old hardcoded "try fructose" hint was removed — `sweetnessFallback.ts` deleted).
- Simulation: current draft + ONE candidate line (0 g placeholder) → `buildOptimizePreview` (same Main /
  Multi-Main / locks / exclusions / ProductBehavior / profile gates; the Sorbet search treats the candidate as a free
  dimension via `rescueSimulationLineIds`) → executable Preview → `assessRecipeDirection` + target distance. An
  unused candidate (still 0 g → omitted by the zero-gram invariant) proves "no benefit".
- Evidence rule (`isMaterialRescueImprovement`): recommend iff more axes reached with no larger distance, or same
  axes and the remaining distance at least halved and ≥ 0.2 points. Never a score floor.
- Store: `rescueAdvice` computed only when the exact target is NOT reached (nearest consent or honest no-correction);
  UI `RescueAdviceHint` ("Możliwy kolejny krok: …" + truthful reason + manual add instruction + "Wróć i dodaj
  składnik" which only opens the normal picker). PI never adds the ingredient.
- Per-candidate evidence `simulateRescueCandidates()` (outcome: recommended / not_material / unused / hard_gate /
  protein_authority / no_preview).

Probes: Gelato milk base Sweetness −2 → current 8/10, Inulina 9/10 (95 g) — recommended; Sorbet without dextrose,
Hardness −1 → no legal correction with current ingredients, Dekstroza brings distance 50.2 → 0.10 — recommended;
owner Sorbet (exact solvable) → no recommendation; Gelato already reached → none; Vegan / Protein Direction axes are
`blocked_runtime` / `blocked_science` in the current plan → advisor truthfully inert (family authority pinned).

## Tests

`src/features/constraint-studio/mainConstrainedNearestAndRescue.test.ts` (20 cases) — items 1–5 owner reproducer
(Main 600, Main count 1, search, nearest classification, Preview, Apply, no 0 g, hard authority), 1b unlocked-vs-held,
3 exact-impossible → nearest, 3b all 25 cells, 4 shared boundary + deterministic door reproduction, 11 locked line,
12 Multi-Main 2:1, role mirror, 6 Gelato positive, 7 Sorbet positive, 8 Sorbet no-benefit, 9 Vegan VERIFIED-only,
10 Protein authority, 13 never auto-adds, 14 hard-gate refusal, 15 disappears when reached, 16 determinism, evidence
rule, store integration. `src/features/pro-core/rescueAdviceUi.test.tsx` (UI, no heuristic fallback).

## Gates

| Command                                                                                                                                                                                                                                                | Result                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| focused: `mainConstrainedNearestAndRescue.test.ts` (20) + `rescueAdviceUi.test.tsx` (2)                                                                                                                                                                | PASS                                                                                      |
| focused: `src/features/recipe-direction`, `sorbetDirectionApplyDoor`, `zeroGramExecutableInvariant`, `ecoPricedApplyDoor`, `currentDraftOptimization`, `stabilizerContractRegression`, `src/features/recipe-constraints`, `src/qa/engine-authenticity` | 29 files / 313 tests PASS (Sorbet 150-cell matrix pin 94/56 unchanged)                    |
| `npm run typecheck` / `npm run build`                                                                                                                                                                                                                  | PASS (`✓ built`)                                                                          |
| `npx eslint` (changed files) / `npx prettier --check`                                                                                                                                                                                                  | PASS                                                                                      |
| `npm run products:audit` / `process:validate` / `catalog:mapper-only:validate`                                                                                                                                                                         | PASS (Mapper sha `b13f5db4…`, 2088 rows, 0 alignment differences, 0 non-Mapper additions) |
| `npm run production-rescue:bundle-check`                                                                                                                                                                                                               | PASS, bundle `0fd4f0c7…` (unchanged — no bundled source touched)                          |
| `git diff --check`                                                                                                                                                                                                                                     | PASS                                                                                      |

## Ledger

- Full `npx vitest run`: 555 files passed, 6964 tests passed, 0 failed (run #1: 6962/6964 — the two boundary-guard failures came from a deep `@/engine/corrections/candidates` import in the advisor, fixed to the `@/engine` barrel; run #2 fully green)
- Final staging SHA: code `19cd872` (`feat(direction): Main-constrained NEAREST for Sorbet + shared rescue ingredient advisor`), this ledger commit on top (`origin/staging`) · Vercel `pinguino-staging` deployment of `19cd872`: `dpl_CGnjuPW4mrSjaRbhyRzwohyqQNhq` READY (alias staging.pinguinoai.com) · served bundle `assets/index-h1r5kqWn.js` (previously `index-BtrkIKz7.js` from 466121c).
- Served QA (TEST PRO, authenticated Browser pane on `19cd872`, console clean at every step):
  1–6. Sorbet, −13 °C, OPTIMAL, new recipe from the canonical scaffold (WATER 143 / SUCROSE 78 / DEXTROSE 125 / INULIN 50 / TARA GUM 4) + STRAWBERRIES 600 g marked **Główny**, Twardość 0 → −1, Przelicz → "Nie mogę osiągnąć dokładnie wybranego celu. Najbliższy poprawny wynik: 8/10" (no more "Solver nie znalazł korekty…") → "Przelicz najlepiej możliwie" → Preview: WATER 143→150, SUCROSE 78→52, DEXTROSE 125→144, INULIN 50 / TARA GUM 4 / STRAWBERRIES 600 **bez zmian**, "Główne: 1", 1000 g → "Zastosuj zmiany" → applied (Wynik aktualny 8/10), Main 600 g before/candidate/Preview/Apply, no 0 g rows. 7. Sorbet rescue recommendation: NOT demonstrable on the canonical served scaffold — every approved Sorbet candidate (Dekstroza, Sacharoza, Inulina, Woda) is already in the recipe and removing one is an owner exclusion the advisor must honour; proven by simulation offline (test 7: Sorbet without dextrose, Hardness −1 → "Dekstroza", distance 50.2 → 0.10). 8. No-benefit case: the owner Sorbet shows NO hint (exact target solvable with current ingredients). 9. Gelato smoke: default milk base, Słodycz −2 → nearest 8/10 decision → Preview (MILK 670→619, CREAM 130→161, SKIMMED MILK 35→48, SUCROSE 130→136, DEXTROSE 30→31, TARA 5) — byte-identical to the offline replica; no hint (the only absent candidate, Inulina, is left unused by the formulation path's owner rule "inulin absent → never auto-raised", so the simulation proves no benefit). 10. Vegan smoke: Wegańskie −13 °C → Preview (formulation V02_fixed, all lines unchanged, 1000 g, no 0 g); Direction axes disabled (blocked in the plan) → advisor inert. 11. Protein smoke: Proteinowe −13 °C → honest PRODUCT_DATA_REQUIRED diagnosis for the auto-added Sucrose (PI-ING-000514, "brak aktualnego snapshotu ProductBehavior … moduł OPTIMAL") — a pre-existing served product-authority state; the Protein code path is untouched by this change. 12. No 0 g rows anywhere. 13. Console clean.
- Production: `main` 4dfb097 untouched (www.pinguinoai.com serves `assets/index-BTR3SdkC.js`).
- Mapper Base unchanged.
