# CANONICAL PRO RECIPE WORKBENCH — completion ledger

**Status:** `CANONICAL PRO RECIPE WORKBENCH — DEPLOYED, AWAITING OWNER ENGINE VALIDATION`
**Date:** 2026-07-22 · Scope: state-model / adapter / routing / visible-workbench / failure-classification. Engine science untouched.

## Root cause
- **Why `/pro` rendered legacy Studio:** the canonical shell + workbar wrap `StudioEngineSurface` (the correct, one working engine lab), but that surface exposed the LEGACY goal controls — a raw `Category` `<select>` with the 8 internal engine categories (Milk/Fruit/Nut/Chocolate/Alcohol/Sorbet/Vegan/Custom) as PRIMARY choices, `Product Mode`, `Machine capacity`, `Flavor intensity`, `Cost priority`, all in English, plus the demo-scenario selector and the IF9/IF10 rescue/assistant tools in the main column.
- **How many recipe stores:** ONE canonical draft — `recipeStore` — already fed the editor, `buildRecipeInput` → Engine (`useStudioResult`), Monitor and save. `constraintStudioStore` is the single OTHER writer and ONLY through the verify pipeline (boundary-pinned). The defect was UI exposure + missing visible/internal separation, NOT competing stores.
- **Which controls were legacy:** the internal-category primary selector; a second "premium/balanced" cost control that could visually rival the PREMIUM quality tier; the demo-scenario selector; the assistant/flow-guide/optimization/branch QA tools in the default view.
- **Home/Demo vs Pro path:** same surface; the Pro capability (`technicalView`/`fullFormula`) gates exact panels. No separate recipe path.
- **Monitor state:** the Monitor already used the live canonical `RecipeResult` (`servingTemperatureC={temperatureC}` from the same store) — no fixture, no stale state (proven by equality tests).

## Completed
### Product types (proofs 1–3)
- NEW [productType.ts](src/features/studio/productType.ts): visible types EXACTLY Gelato/Sorbet/Wegańskie/Proteinowe; `detectClassifications` (alcohol/chocolate/nut/fruit from real ingredients); `gelatoInternalCategory` priority alcohol>chocolate>nut>fruit>milk; `internalCategoryFor`/`visibleTypeOf`; Protein = honest-unsupported (keeps previous category).
- `recipeStore`: added `visibleProductType` (persisted); `setVisibleProductType` derives the internal `category`; `addIngredient`/`removeItem` re-route a GELATO's internal category live; `loadRecipeInput`/`setCategory` keep the projection coherent.
- [GoalSetup.tsx](src/features/recipe-goal/GoalSetup.tsx) rebuilt: „Typ produktu" segmented (4 types) + honest Protein note; NO internal-category selector.

### Quality tier (proofs 4–5)
- ONE canonical tier (Eco/Classic/Premium/Signature). Flavour-intensity + cost-priority moved into a COLLAPSED „Ustawienia zaawansowane" `<details>` — explicit tuning that never overrides the tier. The cost „premium" goal is relabelled „Bez kompromisów" so it can never read as the PREMIUM tier.

### Serving mode (proof 6)
- ONE serving state: „Świeże/−11/−12/−13" segmented writes `servingModeId`+`temperature` via `recipeStore.setServingMode`; the machine tab writes the SAME fields. GoalSetup + workbar + RecipeInput + bands + Engine + Monitor + solver + save read one source.

### One canonical state (proofs 7–8)
- One recipe writer (recipeStore + verify pipeline; boundary test intact; GoalSetup never calls `useRecipeStore.setState`). Demo Scenarios are `import.meta.env.DEV`-only (PresetSelector eliminated from the prod bundle).

### Recalculation entry (proofs 9–10)
- Top „Przelicz z PI" is the sole recalc trigger (canonical `createOptimizePreview` → ProRecalcPanel). The lower „Dopasuj recepturę" button was REMOVED from [ConstraintStudioSection](src/features/constraint-studio/ui/ConstraintStudioSection.tsx) — it keeps only the SECONDARY tools (batch rescale, feasibility) + the shared Preview/Apply/Cancel + Undo.

### QA separation + diagnostic (Phases 6, 10)
- Assistant / flow-guide / optimization-preview / IF9-IF10 branch tools moved into a COLLAPSED „Narzędzia zaawansowane" `<details>` — a clearly separated diagnostic section; none mutates the recipe.
- NEW [OwnerDiagnosticPanel.tsx](src/features/studio/OwnerDiagnosticPanel.tsx) (Pro-gated, collapsed): visible type, internal profile, detected classifications, quality tier, serving mode, internal temperature, TARGET_BANDS cell + fallback flag, batch, ingredient count, unresolved ingredients, active locks, Engine + CONFIG version, optimizer result, constraint-verification result. Reads only computed state — no secrets/weights/source.

### Language (proof 13)
- Localized the core-workbench GOAL card + StudioSummary + IngredientBuilder copy (`copy.studio.builder` + `overall`) + advanced-tools section to Polish (Typ produktu, Poziom jakości, Tryb serwowania, Wielkość partii, Pojemność maszyny, Składniki, Planowane/Rzeczywiste/Udział/Blokada/Ustaw jako główny/Usuń, group names, lock types…).

### Engine equality + round-trip (proofs 11–12)
- NEW [canonicalWorkbench.test.tsx](src/features/studio/canonicalWorkbench.test.tsx) — 13 tests covering proofs 1–13; the round-trip test loads → RecipeInput → Engine, "saves" + reopens, and asserts identical input AND identical `calculateRecipe` output for Gelato −11/−12/−13, chocolate-routed Gelato, Sorbet, Vegan.
- **Tests:** 340 files / **4606 pass** · ESLint 0 errors · tsc ✓ · production build ✓. Engine science files untouched (TARGET_BANDS/ICE_ANCHOR_ROWS/PAC-POD/optimizer/solver/IF9-IF10/CONFIG_VERSION/ENGINE_VERSION unchanged — equality suites green).

### Served browser proof (dev, Pro persona, clean fresh tab)
- Visible types exactly Gelato/Sorbet/Wegańskie/Proteinowe (data-testid product-type-*), NO legacy category selector; quality tier 4 cards; serving Świeże/−11/−12/−13; advanced tuning + advanced tools + demo scenarios all COLLAPSED/DEV-only; builder Polish („Składniki"); owner diagnostic reads real resolved state (e.g. „TYP WIDOCZNY Gelato / PROFIL WEWNĘTRZNY milk_gelato / CELA milk_gelato @ −12°C (seeded) / FALLBACK nie / ENGINE 0.4.0 / CONFIG 0.7.0"); serving −12 propagates to workbar „… −12°C …" + diagnostic „−12 °C"; no horizontal overflow; **0 console errors** on a clean tab (an earlier stale-HMR buffer error was disproven by the fresh-tab load + the passing build).

## Not completed
- Authenticated owner run on served staging — AWAITING OWNER (credential rule).
- Live chocolate-routing screenshot through the ingredient-builder search UI — the routing itself is unit-proven (proof 3 + live store test) and visible in the diagnostic; the search field sits behind an Add trigger not exercised in this pass.

## Regression proof
Shell / hamburger-right / drawer-right / Polish menu ✔ · workbar + naming + save-first-click + versions + delete + persistence ✔ · live Mapper search + ingredient selection ✔ · Pro entitlement + exact grams/redaction ✔ · Engine output ✔ (equality suites). Full suite 4606/4606.

## Online verification
- local (dev, Pro persona, fresh tab): **VERIFIED**
- staging desktop / mobile (served): **AWAITING OWNER** authenticated run (deploy section shows READY)
- authenticated Pro: **AWAITING OWNER**
- saved/reopened recipe: **VERIFIED** (round-trip equality suite)
- production auth: **BLOCKED** (PI-P0-001, external)

## Next unresolved item
Only the owner's authenticated Engine-validation run on staging.
