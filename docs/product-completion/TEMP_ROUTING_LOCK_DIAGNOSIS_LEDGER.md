# PRO TEMPERATURE ROUTING AND LOCK DIAGNOSIS — completion ledger

**Status:** `PRO TEMPERATURE ROUTING AND LOCK DIAGNOSIS — DEPLOYED, AWAITING OWNER VERIFICATION`
**Date:** 2026-07-22 · Scope: routing / shared-state / labeling / failure-classification only. Engine science untouched.

## Root cause

### 1. The −11°C header vs the −13°C recipe
**PROVEN: the Engine was correctly using −13°C — ONLY the header label was a static string.**
Full runtime trace for the owner's recipe (staging DB rows for recipe `190b0abe…` + code path):
- visible mode → `recipeStore.servingModeId='temp_minus_13'` / workbar context −13°C
- stored temperature → `recipeStore.target_temperature_c = −13` (DB: v5 `temperature_c=-13`, v6 `-11`, v7 `-13` — saved recipes preserve their real temperature)
- RecipeInput → passthrough seam [buildRecipeInput.ts](src/features/studio/buildRecipeInput.ts) (adds/changes nothing)
- template/target bands → `selectTargetBand(category, −13)` — the −13 cell, `temperature_fallback:false` (verified: the calculated NPAC indicator band at −13 is the −13 cell [48,55], NOT −11's [33,42])
- Engine calculation → `calculateRecipe(input)` on −13 ([calculateRecipe.ts:64,130,158](src/engine/calculateRecipe.ts))
- Monitor → `UserMonitorPro servingTemperatureC={temperatureC}` — the same store field
- solver → `proposeCorrections({input…})` + the constraint pipeline's `buildRecipeInput(useRecipeStore.getState())` — the same store field
- header → **`copy.studio.engineTag = 'Silnik −11°C'` — a HARDCODED copy string** (the only element not derived from the store). Not stale recipe data, not a second store, not an old Engine route.

**Fix:** `engineTag` DELETED from copy; the header now derives from [engineRouteLabel.ts](src/features/studio/engineRouteLabel.ts) over the SAME store fields the Engine consumes (`servingModeId` + `target_temperature_c`) — it cannot disagree with the Engine input. Świeże renders „Świeże" with „wewnętrzny profil −11°C" as a small technical detail only.
**Hardening:** a MANUAL temperature change (`setTargetTemperature`) now clears the machine/serving route — a temperature-route mismatch is unrepresentable in the store; the diagnosis still classifies it (`temperature_route_mismatch`) as belt-and-braces with the exact required message.

### 2. The lock-conflict message
The `no_proposal` failure was rendered with copy that unconditionally blamed „obecne blokady".
**The owner's real v5 recipe DOES contain exactly ONE hidden lock:** `milk-base:cream_30` (Cream 30 %) — `lock_type='grams'` **with `actual_grams=150` (poured)** → the recipe is in **§15 actual-batch rescue context (solver = add-only)**, inherited from the saved recipe (Milk Base preset lineage + rescue testing). Additionally the working state carried 4 previously-applied `correction-*` lines and product lines summing far above the batch. The failure was real, but unproven and mislabelled.
**Fix:** structured classification [recalcDiagnosis.ts](src/features/constraint-studio/recalcDiagnosis.ts) — `no_active_locks / locked_constraints_conflict / recipe_input_incomplete / temperature_route_mismatch / ingredient_not_engine_ready / optimizer_no_solution / constraint_verification_failed / backend_failure`. Rules enforced: never a lock-conflict without ≥1 verified active lock (the complete per-ingredient lock report renders with it: name, grams, lock state, source user-padlock / saved-recipe / engine-lock / poured-actual, user-set flag); all-locked gets the explicit message „Wszystkie składniki są zablokowane. Odblokuj przynajmniej jeden składnik…"; zero locks → locks explicitly exonerated; poured actuals surfaced („tryb ratowania partii — tylko dodawanie"); every failure ends with „Receptura nie została zmieniona."

## Completed
- **Files:** `src/features/studio/engineRouteLabel.ts` (NEW) · `src/features/constraint-studio/recalcDiagnosis.ts` (NEW) · `constraintStudioCopy.ts` (+diagnosis block) · `StudioEngineSurface.tsx` (derived header + detail) · `ProRecalcPanel.tsx` (diagnosis view + lock table) · `recipeStore.ts` (manual temp clears route) · `copy/en.ts` (engineTag removed) · tests: `recalcDiagnosis.test.ts` (14) + `temperatureContract.test.ts` (18) + updated `en.test.ts` / `navConfig.test.ts`.
- **Tests:** 32 new — the owner's 15 regressions covered: (1–3) per-temperature contract incl. distinct band cells AND distinct solver proposals (−11→+43,7 g dekstrozy · −12→+111,0 g · −13→+159,4 g on the clean canonical base); (4) Świeże visible + internal −11; (5) one shared route (source-pinned); (6) no hardcoded header; (7) reopened recipes keep their temperature; (8) zero locks ⇒ never `locked_constraints_conflict`; (9) one lock preserved at exactly 0.0 g; (10) all-locked explicit message; (11) failed recalc mutates nothing (pure pipeline); (12) Apply/Undo exact (existing suite); (13) save/versioning unchanged (suite); (14) Mapper unchanged (suite); (15) Engine values unchanged (equality suites). **Gate: 4593/4593 tests · ESLint 0 errors · build ✓.**
- **Staging deployment:** see final report (commit + READY proof).
- **Served browser proof (dev, Pro persona, live clicks):** −11 → header `PINGÜINO Pro · Silnik −11°C` + workbar −11 + honest `already_clean`; −12 → header `Silnik −12°C` + REAL preview (+68,1 g dekstrozy); −13 → header `Silnik −13°C` + REAL preview (+129 g SMP); ALL 6 locked via real padlocks → the explicit all-locked message + the verified 6-row lock table + „Receptura nie została zmieniona."; ONE lock (Cream 30 %) → preview recalculates around it, Cream „BEZ ZMIAN · ZABLOKOWANE" at exactly 130 g. 0 console errors.

## Not completed
- Authenticated owner run on served staging (credential rule) — AWAITING OWNER.
- `ingredient_not_engine_ready` / `backend_failure` codes are defined in the taxonomy but no current pipeline path emits them (no false positives possible); they activate when those failure sources exist.

## Regression proof
Workbar (owner-verified baseline preserved; only the context source untouched) ✔ · save/versions (suites + DB rows v5/v6/v7 intact) ✔ · Mapper ✔ · Engine outputs (equality suites; TARGET_BANDS/ICE_ANCHOR_ROWS/PAC-POD/optimizer/solver/CONFIG_VERSION/ENGINE_VERSION untouched) ✔ · menu ✔ · entitlement ✔.

## Owner test (staging, Pro login)
1. **−11:** Maszyna → Maszyna profesjonalna → −11°C → Receptura: workbar −11, nagłówek „PINGÜINO Pro · Silnik −11°C", Przelicz z PI → podgląd lub uczciwe „już w optymalnym zakresie".
2. **−12:** jw. → nagłówek „Silnik −12°C", Przelicz → realny podgląd.
3. **−13:** jw. → nagłówek „Silnik −13°C", Przelicz → realny podgląd (inna propozycja niż przy −12).
4. **Blokady:** bez kłódek → przeliczenie działa; jedna kłódka → składnik „BEZ ZMIAN · ZABLOKOWANE" (0,0 g zmiany); wszystkie kłódki → komunikat „Wszystkie składniki są zablokowane…" + tabela ZWERYFIKOWANY STAN BLOKAD + „Receptura nie została zmieniona."
