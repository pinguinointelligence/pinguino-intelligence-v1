# FRESH & NATURAL INGREDIENT SEARCH — completion ledger

**Status:** `FRESH AND NATURAL INGREDIENT SEARCH — FIXED ON STAGING, AWAITING OWNER VERIFICATION`
**Date:** 2026-07-23 · Scope: frontend ranking + form display. No Engine science, NO DB/view/migration change.

## Root cause
- **Did the fresh records exist?** YES. Direct proof on staging `tunabqqrwabacxjcxxkz`: **~60 „· Fresh Fruit" rows**, all `is_active`, `approved_for_base=true`, `approved_for_engines=true`, and **all present in `mapper_basement_search` AND `mapper_basement_search_demo`**. `PI-ING-000390` PINEAPPLE · Fresh Fruit (subcategory `fresh_fruit_profile`, full composition: water 86.64 / solids 13.36 / PAC 14.45 / POD 11.98 / confidence 92), `PI-ING-000345` BANANA · Fresh Fruit, `PI-ING-001553` STRAWBERRIES · Fresh Fruit (Verified), `PI-ING-000394` RASPBERRIES, + apple/pear/peach/lime/orange/blueberry/etc.
- **Which flag/view/filter removed them?** NONE removed them. The category inventory shows nearly every row (incl. all 170 `fruit`) is `approved_for_base=true` — so `approved_for_base` was NOT used as catalogue visibility for these rows, and they ARE returned by the frontend query (`mapper_basement` where `is_active AND approved_for_engines`; RLS passes for pro@pro.com's active subscription). The mapper never drops a row; there is no verification/subcategory/category filter in the picker path.
- **Real cause = FRONTEND PRESENTATION.** The picker filtered correctly (the fresh row IS in the result set), but then (a) ordered by `.order('ingredient_name_display')` **alphabetically** and **grouped by category**, so „FANTA PINEAPPLE" / „FORTEFRUTTO PINEAPPLE N" outranked „PINEAPPLE · Fresh Fruit" (F < P); (b) auto-selected the alphabetical FIRST row (a beverage); (c) showed **no FORM label**, so fresh could not be distinguished from pastes. The fresh forms were present + selectable but **buried and unlabelled** → perceived as missing.
- **Why Banana Fresh Fruit was visible while pineapple was not:** purely a ranking artifact — „BANANA · Fresh Fruit" has few competing branded rows so it sorts near the top of its matches, whereas „pineapple" has FANTA / MONSTER / FORTEFRUTTO / Fabbri / MEC3 / Master Martini alphabetically ahead of it. Both rows are equally in the view; the difference was ordering, not data.
- **Was `approved_for_base` incorrectly used as catalogue visibility?** No — for the fruit rows it is uniformly `true`; the loss was ordering/labelling, so no DB flag/view change was warranted (smallest safe solution: frontend only).

## Completed
- **Ranking (frontend)** — NEW `formRank`/`formLabelPl`/`rankIngredients` in [ingredientSearch.ts](src/features/ingredient-builder/ingredientSearch.ts): rank order = (1) semantic NAME match before id/EAN/SKU/brand-only matches (a „banana" query never tops white chocolate whose code contains „ban"); (2) FORM — fresh → frozen → puree → concentrate → dried → paste → powder → aroma → beverage; (3) alphabetical, stable.
- **Form threading** — [ingredientLibrary.ts](src/features/ingredient-builder/ingredientLibrary.ts) now builds a `formIndex` (id → subcategory) and `nameIndex` (id → normalized name-only) alongside the search index (live rows + demo + all fallback states).
- **Picker** — [IngredientPicker.tsx](src/features/ingredient-builder/IngredientPicker.tsx): with a query, renders ONE ranked „Wyniki" list (fresh/natural first) with the form shown („PINEAPPLE · Fresh Fruit · Świeży owoc"); default selection is the TOP-ranked result (fresh), not the alphabetical first; empty query keeps category browse. Phase 6: a selected-but-not-Engine-ready ingredient is kept + flagged („Składnik został wybrany, ale wymaga uzupełnienia danych przed dokładnym przeliczeniem."), never hidden or silently substituted.
- **Tests** — NEW [ingredientRanking.test.ts](src/features/ingredient-builder/ingredientRanking.test.ts) (fixtures from the REAL rows): fresh pineapple ranks first before puree < paste < beverage; „banana" tops BANANA · Fresh Fruit and the SKU-only white-chocolate match sinks below every name match; form order + PL labels; empty-query stable. Picker/library fixtures updated for the new indices. **Gate: 4633 tests / 342 files PASS · ESLint 0 errors · tsc ✓ · build ✓.** Mapper scientific values + Engine untouched.
- **Commit + staging deploy:** see final report; the served bundle carries the ranking + form labels.

## Not completed
- Authenticated served-staging owner click (search as Pro) — AWAITING OWNER (picker is Pro-gated; credential entry disallowed for the agent). Proven against the real row shapes (unit) + the DB (records exist, approved, in views, returned for pro@pro.com) + served bundle contains the fix.
- `ANANAS · Giuso Powder Mix` (`PI-ING-001351`) stays hidden — it is `approved_for_base=false` / `Blocked` (data-curation decision, not a search defect); „ananas" still returns the pineapple family via alias.

## Regression proof
Mapper scientific values — unchanged (no DB write). Engine — unchanged (ranking is presentation-only; `ingredientRowToEngineIngredient` untouched; stable `PI-ING-*` id + form still flow into RecipeInput on selection). Shell / workbar / save / version / Pro entitlement / the earlier natural-Polish search — all green (full suite 4633/4633).

## Online verification
- local (unit + DB): **VERIFIED** — fresh/natural forms exist, are approved, in the views, returned for pro@pro.com; ranking puts them first against real row shapes.
- staging desktop / mobile (served, authenticated Pro search): **AWAITING OWNER**.
- production: **BLOCKED** (PI-P0-001, external).

## Owner acceptance (staging, logged in as Pro)
`/pro/recipe` → picker → type `pineapple` / `fresh pineapple` / `ananas` → top result „PINEAPPLE · Fresh Fruit · Świeży owoc" (`PI-ING-000390`) before pastes/beverages; `strawberry` / `truskawka` → „STRAWBERRIES · Fresh Fruit" first; `banana` → „BANANA · Fresh Fruit" first; `wanilia` → vanilla forms.
