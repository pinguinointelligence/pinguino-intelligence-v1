# AGENT A — FORMULATION CORE LEDGER (NIGHTLY P0, 2026-07-24)

Worktree branch: `worktree-agent-ad880ceca859efa7a` (isolated; **not** pushed to main/staging; no deploy).
Base: `4dfb097` (frozen origin/main). Final commit hash: the commit carrying this ledger (reported in the agent's final message).

---

## 1. Owner failures reproduced (exact messages, automated)

### FAILURE A — complete Fruit Gelato → one-line hard stop

Fixture (owner's exact recipe): Strawberry 350 / Milk 3.5% 380 / Cream 30% 80 / SMP 40 /
Sucrose 110 / Dextrose 35 / Tara 5 · `fruit_gelato` · −11 °C · 1000 g · no locks/ranges/exclusions.

Reproduced at base state (pre-fix pipeline):

```
route  = local_correction  [substantive_unconstrained_draft]
result = { code: "no_proposal", violatedMetrics: ["fat"], solverInvocations: 1 }
```

Rendered live as `diagnosis.optimizerNoSolution`:
`PI przeliczyło recepturę (solver uruchomiony 1 ×), ale nie znalazło bezpiecznej korekty w zatwierdzonych zakresach. Parametry poza zakresem: …` — the owner's exact one-liner shape. (With the owner's live STRAWBERRIES product the violated metric was `udział lodu`; with the repo's demo strawberry stand-in the same mechanism trips on `tłuszcz` — the failure mechanism is identical and fully band-provenance-driven.)

Proven band provenance: **all 11 fruit_gelato indicators carry `category_fallback: true`** (fruit_gelato is scored on milk_gelato bands; `TARGET_BANDS` seeds only milk/chocolate/sorbet/vegan). The entire rejection was driven by provisional fallback bands.

### FAILURE B — fresh minimal draft → missing hard-role trio

Fixture: Milk 3.5% 0 g unlocked + STRAWBERRIES · Fresh Fruit 0 g unlocked, `fruit_gelato`, −11 °C, 1000 g, **with the previous draft's removals still in `excludedIngredientIds`** (`cream_30, smp, sucrose, dextrose, tara_gum`):

```
result = { code: "missing_required_role", role: "sweetener_sucrose",
  messagePl: "Brakuje składnika w twardej roli technologicznej: sweetener_sucrose,
  sugar_freezing_control, stabilizer. Dodaj zatwierdzony składnik tej roli, aby PI
  mogło ułożyć recepturę." }
```

Byte-identical to the owner's live message (the trio is exactly the three HARD roles among the five excluded candidates; cream/SMP are soft roles and therefore did not appear).

---

## 2. Root cause per failure

### FAILURE B — exclusion lifecycle leak (Integration-Owner hypothesis 1 CONFIRMED)

- `fruit_gelato_ref_v1` **does** carry toolbox candidates for sucrose/dextrose/tara_gum — "template lacks candidates" is **FALSE** (hypothesis confirmed false).
- `excludedIngredientIds` is **not** persisted (it is absent from `recipePersistPartialize`), so the leak is **within-session**, not localStorage: every `removeItem` appended the removed ingredient id and **no new-draft flow reset the list**:
  - emptying the draft line-by-line (the owner's "fresh draft" route from the default Milk-Base preset or from the FAILURE-A recipe) kept all removals excluded;
  - `resetToDemo` did not reset exclusions either (only `loadPreset`/`loadRecipeInput` did).
- Auto-fill correctly skips excluded candidates → `missingHardRoles` = exactly the reported trio.
- Secondary suspect (live category/profile resolution) checked and **cleared**: visible Gelato + fruit line resolves `fruit_gelato` correctly in the live store path (pinned by `liveRuntime.test.ts` and re-proven end-to-end in `nightlyP0.test.ts`).
- A latent identity-mismatch hole was found while verifying hypothesis 2: exclusions recorded under a real catalogue product's Mapper id (e.g. `PI-ING-000514`) did **not** match the toolbox candidate id (`sucrose`). Closed via the canonical identity registry (below).

**Fix (exclusion lifecycle, owner Phase 4):**
- exclusions are draft-scoped; removing the LAST line (emptied draft) resets them (`recipeStore.removeItem`);
- `resetToDemo`/`loadPreset` reset them (`fromPreset` now carries `excludedIngredientIds: []`);
- `loadRecipeInput` already reset them (unchanged);
- KEPT: explicit removal in a live draft still excludes; exclusions are never reintroduced; Undo restores them (FIXTURE D stays green);
- never-selected ≠ excluded — proven end-to-end (owner test 10).

### FAILURE A — missing fallback + fallback bands acting as hard rejections (hypotheses 3 & 4 CONFIRMED)

- `routeFormulationMode` sends substantive (≥ 50 % of batch) unconstrained drafts to the local basin; local `no_proposal`/`unsafe_proposal` had **no fallback** — the one-line stop was by (incorrect) design.
- All fruit_gelato violations sit on `category_fallback` (milk) bands, and they acted as hard rejections in the local acceptance path.

**Fix (owner Phases 6/7/8):**
- Phase 6 fallback in `buildOptimizePreview`: when the local corrector fails on a complete unconstrained draft (`substantive_unconstrained_draft`; never all-locked, never poured-actuals) and a registry template exists for the profile × temperature, PI runs the template-seeded full reformulation with the SAME selected ingredient identities, locks, exclusions, batch, temperature (brands never replaced). A verified improving result becomes a normal Preview marked `formulation.localFallback: true` with an honest provenance note.
- Phase 7(b): when the fallback cannot safely improve either AND every remaining violation sits on provisional/fallback bands → new explanatory terminal state `best_safe_result` (never rendered as failure) carrying: solver-invocation proof, soft deviations, stop reason, band/calibration status, template id. Exact message (new copy key, no key repurposed):
  `PI nie znalazło dalszej bezpiecznej poprawy. Obecna receptura jest najlepszym zweryfikowanym wynikiem dla aktualnych składników i ograniczeń.`
  Rendered in `ProRecalcPanel` with score (`recipeMatchScore`), soft deviations, stop reason and calibration status.
- Phase 8: `classifyViolationBands` (new, pure) splits violations into HARD (native approved bands) vs SOFT (`category_fallback`/`temperature_fallback`/`estimated`). Provisional bands never hard-reject alone; **any** native-band violation keeps the honest local failure. Band VALUES untouched (science freeze).
- The 8 × 125 g gate is NOT weakened: beat-the-null stays absolute for unconstrained proposals; `best_safe_result` is structurally impossible when any hard (native-band) metric is violated; all pinned 8×125/forged-apply tests stay green.

Post-fix behavior of the owner fixtures:
- FAILURE A fixture → `best_safe_result` (stopReason `template_fixed_point`, solver 1×, soft `fat` [live: ice], `category_fallback`, template `fruit_gelato_ref_v1`). The owner's recipe IS the reference template — "no further safe improvement" is the truthful answer.
- A skewed complete fruit draft (Milk 400/Cream 60/Suc 110 …) → local fails → **fallback produces a verified improving Preview** (`localFallback: true`) — proven deterministic (owner test 12).
- FAILURE B fixture (fresh draft) → full 1000 g Preview with the trio + cream/SMP auto-added.

---

## 3. Phase-1 role trace (live QA-visible; the FAILURE B trace as produced by the new `roleTrace`)

| required role | hard | user supplied? | toolbox candidate | canonical Mapper id | found? | filtered? | exact reason |
|---|---|---|---|---|---|---|---|
| fruit | no | YES (`l-straw`) | — (user must supply) | — | yes | no | user_selected_ingredient_carries_role |
| primary_liquid | yes | YES (`l-milk`) | milk_3_5 | PI-ING-000236 | yes | no | user_selected_ingredient_carries_role |
| dairy_fat | no | no | cream_30 | PI-ING-000180 | yes | **excluded** | candidate_explicitly_excluded_by_user |
| milk_solids | no | no | smp | PI-ING-000270 | yes | **excluded** | candidate_explicitly_excluded_by_user |
| sweetener_sucrose | **yes** | no | sucrose | PI-ING-000514 | yes | **excluded** | candidate_explicitly_excluded_by_user |
| sugar_freezing_control | **yes** | no | dextrose | PI-ING-000494 | yes | **excluded** | candidate_explicitly_excluded_by_user |
| stabilizer | **yes** | no | tara_gum | PI-ING-000492 | yes | **excluded** | candidate_explicitly_excluded_by_user |

The three excluded HARD roles = exactly the owner's reported trio. On a fresh draft (exclusions reset) every row resolves `user_filled`/`toolbox_added` and the ordering rule holds: hard-role completeness is evaluated only AFTER canonical toolbox auto-fill (owner Phase 3; owner test 5).

---

## 4. Verified staging IDs (owner Phase 2)

Verified READ-ONLY via the staging-scoped connector (`execute_sql`, SELECT only) against project `tunabqqrwabacxjcxxkz`, table `mapper_basement`, 2026-07-24. All rows `approved_for_engines = true`, `verification_status = 'Verified'`, matching the repo-bundled seed `supabase/seed/mapper_basement_v1_0.sql` byte-for-byte:

| toolbox id | Mapper id | staging display name |
|---|---|---|
| sucrose | PI-ING-000514 | SUCROSE SUGAR · Sweetener · Dry |
| dextrose | PI-ING-000494 | DEXTROSE · Sweetener · Dry |
| tara_gum | PI-ING-000492 | TARA GUM · Stabilizer |
| cream_30 | PI-ING-000180 | CREAM 30% · Mlekovita Cream · Chilled |
| milk_3_5 | PI-ING-000236 | MILK 3.5% · Milk · Chilled |
| smp | PI-ING-000270 | SKIMMED MILK · Milk |
| inulin | PI-ING-000456 | INULIN · Specialty (also verified: PI-ING-000455 `inulin_bio`; the plain canonical entry is used) |
| water | PI-ING-001409 | WATER · Liquid |

No readiness contradiction found; no value invented. The registry lives in `src/features/formulation/toolboxCanonical.ts`; every PI-added line now carries `mapperId` + Polish `namePl` + role + grams + reason (e.g. `PI dodało „Sacharoza (cukier)" (PI-ING-000514) w roli „cukier podstawowy", ponieważ zatwierdzona receptura fruit_gelato_ref_v1 wymaga tej roli.`), and exclusion matching covers BOTH canonical identities (engine id and Mapper id).

---

## 5. What was completed

Files (all within Agent A's exclusive surface):

- `src/features/formulation/toolboxCanonical.ts` — NEW: canonical toolbox identity registry (staging-verified Mapper ids + Polish names) + dual-identity exclusion matching.
- `src/features/formulation/violationBands.ts` — NEW: pure hard-vs-soft violation classification by band provenance (Phase 8; no band values touched).
- `src/features/formulation/formulate.ts` — added `mapperId`/`namePl` to `FormulationAddedLine`, enriched Polish reasons (canonical name + id + role, `zatwierdzona receptura <id>` kept verbatim for pins), canonical exclusion matching, and the Phase-1 `roleTrace` (on the proposal AND on missing-role failures).
- `src/features/constraint-studio/applyPipeline.ts` — Phase 6 template-seeded fallback (`withTemplateFallback`) on both local failure exits; new `best_safe_result` result; `formulation.localFallback` + `roleTrace` on previews; A6 formulation provenance (template id + added markers) on `AppliedChangeRecord`.
- `src/stores/recipeStore.ts` — exclusion lifecycle: emptied draft resets exclusions; `fromPreset` (→ `resetToDemo`/`loadPreset`) resets exclusions. Removal-excludes/never-reintroduced/Undo-restores semantics preserved.
- `src/features/constraint-studio/constraintStudioCopy.ts` — NEW keys only: `previewIssue.bestSafeResult` (owner's exact sentence), `bestSafe.*` (score line, soft deviations, stop reasons, calibration status, template line), `preview.localFallbackNote`.
- `src/features/constraint-studio/previewIssueMessage.ts` — `best_safe_result` case.
- `src/features/pro-core/ProRecalcPanel.tsx` — `BestSafeResultView`: score + soft deviations + stop reason + calibration status + template; never the failure banner; never the lock table.
- `src/features/constraint-studio/ui/ConstraintPreviewCard.tsx` — honest fallback provenance note on fallback previews.
- `src/features/studio/OwnerDiagnosticPanel.tsx` + `src/copy/en.ts` — A9 QA rows: band source (native/fallback provisional), hard vs soft remaining violations, role trace with exact candidate ids, local solver invocations, fallback invoked yes/no, final classification (existing rows already covered visible type, internal profile, temperature, template id, formulation mode, exclusions, rejection code). No secrets/weights.
- `src/features/formulation/nightlyP0.test.ts` — NEW: 23 tests covering the owner's required list 1–20 (mapping in §7).
- `src/features/formulation/constrainedReformulation.test.ts` — FIXTURE F extended with the A7 no-zero-total assertion (additive only).
- `src/features/constraint-studio/recalcDuplication.test.ts` — ONE pin amended with documentation: the five-cycle row cap `≤ 6` → `≤ 7` + no-row-loss, because the owner-mandated Phase 6 fallback may complete the recipe with the approved template's missing role carriers (inulin + tara) ONCE; the actual regression invariants (no duplicate canonical identities, dextrose/cream/milk single, sum exactly 1000 g, target 1000 g, bounded rows) are all still asserted. The single-apply `≤ 6` pins were verified unaffected (local path).

Owner fixtures closed: A1 (minimal Gelato full formulation + Preview reasons + Apply/Undo/save-reopen), A2 (FAILURE A → best-safe explanatory result; fallback Preview on repairable drafts), A3/A4 (kept green, untouched), A5 (kept green), A6 (record now carries exclusions + template id + toolbox markers + tier/profile/temperature via the input snapshot), A7 (FIXTURE F extended), A8 (kept: `Oceniono N z M obszarów` + provisional note; unsafe stays blocked), A9 (QA panel extended).

## 6. What was NOT completed

- `fruit_gelato` still has **no native approved TARGET_BANDS row and no scientifically approved template** — `fruit_gelato_ref_v1` remains `reference_derived` (staging-only), exactly as the Phase 8 contract requires. Its violations therefore classify SOFT until the owner approves native bands (science decision — out of Agent A's mandate).
- No template roles lack an approved candidate for the shipped registry profiles (all toolbox roles resolve to verified canonical ids). User-supplied roles (fruit / plant bases / chocolate) are intentionally never auto-added.
- `best_safe_result` rendering in the legacy `ConstraintStudioSection` uses the plain message line (the full score/calibration detail block is in the Pro workbar recalc panel, the owner's live failure surface).
- Owner verification on served staging: NOT claimed (worktree branch only; Integration Owner merges/deploys).

## 7. Owner required-test mapping (1–20)

| # | requirement | test |
|---|---|---|
| 1 | Milk+Strawberry 0 g → full formulation | nightlyP0 "selects FULL FORMULATION" |
| 2–4 | sucrose/dextrose/stabilizer candidates resolve | nightlyP0 "resolve by exact canonical registry identity" |
| 5 | toolbox addition precedes hard-role completeness | nightlyP0 "toolbox auto-fill precedes hard-role completeness" |
| 6 | minimal Gelato → complete 1000 g Preview | nightlyP0 "complete 1000 g Preview" |
| 7 | user IDs preserved | same test (stable `l-milk`/`l-straw` identities) |
| 8 | added lines carry stable canonical IDs | nightlyP0 "stable canonical IDs + Polish names" |
| 9 | explicit exclusion prevents auto-add | nightlyP0 "explicit exclusion (either canonical identity)" |
| 10 | never-selected ≠ excluded (fresh-draft reset) | nightlyP0 "FAILURE B end-to-end" |
| 11 | complete recipe runs local first | nightlyP0 "runs the LOCAL corrector first" |
| 12 | local no_proposal triggers template fallback | nightlyP0 "triggers the template-seeded fallback" |
| 13 | fallback reuses selected identities+locks | nightlyP0 "reuses the SAME selected identities" |
| 14 | native bands may stay hard | nightlyP0 "native milk_gelato violations stay HARD" + "NEVER yields best_safe_result" |
| 15 | provisional bands never sole hard rejection | nightlyP0 "never the one-line hard failure" |
| 16 | best-safe fixed point explanatory result | nightlyP0 "exact explanatory result" |
| 17 | Preview→Apply exact grams | nightlyP0 "byte-for-byte" |
| 18 | Undo restores exact minimal draft | nightlyP0 "Undo restores EXACTLY Milk 0 g + Strawberry 0 g" |
| 19 | save/reopen preserves applied recipe | nightlyP0 "save/reopen preserves" |
| 20 | engine 0.4.0 + config 0.7.0 unchanged | nightlyP0 "science freeze" |

## 8. Regression proof list (all green in the final full run)

- `constraintStudioBoundary.test.ts` — single recipe-writer / single verify door (untouched, green).
- `applyIntegrity.test.ts` — Apply data-integrity guard (untouched, green).
- `constrainedReformulation.test.ts` — 16 tests incl. A3 inulin-0 / A4 milk-500 / FIXTURE D Undo-exclusions / FIXTURE F 20 cycles (+ new no-zero-total assertion), green.
- `formulation.test.ts` — full acceptance matrix incl. 8 × 125 g forbidden result, MyGelato local routing with `formulation === undefined`, sorbet/vegan/chocolate honesty (green; local-path outcomes unchanged — probed per temperature before edit).
- `liveRuntime.test.ts` — live store routing, toolbox auto-fill with reasons, exclusion semantics, milk-500 live path (green).
- `recalcDiagnosis.test.ts` — all-locked + temperature-mismatch + zero-lock exoneration pins (green; `best_safe_result` never reaches `diagnoseRecalcFailure`).
- `autoBalance.test.ts` — 8 × 125 g / batch-only rescale rejection / MYGELATO / NEAR_BALANCED pins (green; MYGELATO stays `ok` via the local path at −11/−12/−13 — verified empirically pre-edit).
- `recalcDuplication.test.ts` — no duplicates / no runaway / batch invariant (one documented cap amendment, §5).
- No 8 × 125 g; no rescale-as-balance; no duplicates; no runaway batch; target 0 blocked (`rescale_invalid` pins green); byte-exact locks (`Object.is` pins green); live search files untouched.
- SCIENCE FREEZE: `TARGET_BANDS`, `ICE_ANCHOR_ROWS`, PAC/POD, Mapper values, template numbers, solver weights, `CONFIG_VERSION` 0.7.0, `ENGINE_VERSION` 0.4.0 — none modified (pinned by tests 20/24 and the engine suites).

## 9. Gates (final run, 2026-07-24)

- `npx vitest run` (full suite) — **352 files, 4791 tests, all passed** (baseline 4766 + Agent A's 23 new nightlyP0 tests + additive assertions).
- `npx tsc -b` — clean.
- `npx eslint .` — **0 errors** (2 pre-existing `react-refresh` warnings in untouched files).
- `npm run build` — success.

Environment note (working tree only, NOT part of the commit): this isolated
worktree was materialized with CRLF (global `core.autocrlf=true`), which broke
15 pre-existing SQL-text guard tests (`src/features/ingredients/*.migration.test.ts`)
whose comment-strip regex (`--.*$` without `/m`) cannot match before `\r`. The
worktree's `supabase/migrations/*.sql` files were re-normalized to LF on disk
(byte-identical content under git's clean filter — `git status` clean, nothing
staged, nothing committed). No migration content was changed.
