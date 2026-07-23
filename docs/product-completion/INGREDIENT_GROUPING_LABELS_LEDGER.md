# INGREDIENT RESULT GROUPING AND FORM LABELS — completion ledger

**Status:** `INGREDIENT RESULT GROUPING AND FORM LABELS — DEPLOYED, AWAITING OWNER VERIFICATION`
**Date:** 2026-07-23 · Scope: PRESENTATION ONLY. Live server search / debounce / cancellation / caching / pagination / aliases / ranking / stable IDs / RecipeInput / Engine / Monitor — all untouched (frozen baseline; pinned by the existing suites).

## Owner defect reproduced
The live picker rendered `MILK 1.5% · Milk · Chilled · Świeży owoc` — the raw display name (with the internal `Milk · Chilled` segments) PLUS the fruit-specific label — and every result sat under one generic `Wyniki` optgroup.

## Root cause
- **Why `chilled` milk was labelled „Świeży owoc":** the row label came from `formLabelPl`, which labels the RANK bucket, not the form. Bucket 0 was labelled „Świeży owoc" when it only held fruit; when plain dairy milk (`milk` subcategory) was added to bucket 0 for ranking (milk-before-pastes), it inherited the fruit label. The raw `· Milk · Chilled` segments additionally stayed visible because the row rendered the full display name.
- **Why one group:** the server-search migration rendered ranked hits as ONE flat `<optgroup label="Wyniki">` — the earlier by-category grouping existed only in the browse (no-query) path of the old preloaded picker and was not carried over to the query path.
- **Was grouping removed during the server-search migration:** yes — knowingly flattened to preserve rank order; this task restores visible grouping WITHOUT breaking rank order (partition is stable).

## Completed
- **NEW [ingredientPresentation.ts](src/features/ingredient-builder/ingredientPresentation.ts)** (pure, presentation-only), built against the REAL staging vocabulary census:
  - **Form taxonomy** — `formGroupOf(subcategory, category)` → 10 groups in the owner's exact order: `Świeże → Mrożone → Puree i przeciery → Koncentraty → Pasty → Płynne i napoje → Proszki i suche → Aromaty → Dodatki → Inne`. Fresh is EXACT-match only (`milk`, `fresh_milk`, `cream`, `buttermilk`, `fresh_fruit_profile`, `fresh_herb`, vegetable profiles…), so `milk_powdered_ice_cream_mix` and `coconut_milk` can never land there. Unmappable forms → `Inne` (never guessed).
  - **Row form labels** — `rowFormLabelPl`: Świeże / Mrożone / Puree / Koncentrat / Pasta / Napój·Sok·Syrop·Płynne / Proszek·Suszone·Suche / Aromat / Dodatek / Inne.
  - **Category labels** — `categoryLabelPl`: Nabiał, Owoce, Zioła, Czekolada i kakao, Cukry i substancje słodzące, Stabilizatory, Orzechy, Napoje, Alkohol, Mieszanki bazowe + the full enum set; unknown → raw value (controlled fallback, no invented translation).
  - **Row format** — `resultRowTextPl` = `NAZWA · Kategoria · Forma` (first display segment only — raw `Milk · Chilled` / `PreGel Paste · ST-45272` tails are replaced by the Polish labels, never shown beside them): `MILK 3.5% · Nabiał · Świeże`, `PINEAPPLE · Owoce · Świeże`, `BASIL · Zioła · Świeże`, `FORTEFRUTTO PINEAPPLE N · Owoce · Pasta`, `FANTA PINEAPPLE · Napoje · Napój`.
  - **Grouping** — `groupHitsByForm`: stable partition of the RANKED hits; only non-empty groups, fixed order; rank order preserved inside each group (grouping never destroys ranking).
- **[ServerIngredientPicker.tsx](src/features/ingredient-builder/ServerIngredientPicker.tsx)** — renders one native `<optgroup>` per non-empty form group (accessible: native select semantics, headings not selectable, no custom listbox, no picker rebuild); the flat `Wyniki` group is gone.
- **[ingredientSearch.ts](src/features/ingredient-builder/ingredientSearch.ts)** — the shared rank-label module's bucket-0 label corrected to the generic `Świeże` (+ Mrożone/Suszone); ranking numbers untouched.
- **Tests** — NEW [ingredientPresentation.test.ts](src/features/ingredient-builder/ingredientPresentation.test.ts) (14): the exact bad row can no longer render (chilled milk → `MILK 1.5% · Nabiał · Świeże`, no „Świeży owoc", no raw `Chilled`); fresh fruit + fresh herb → Świeże; milk/pineapple/basil share ONE fresh group; category labels distinct; real-vocabulary group mapping (powder/concentrate/inclusion/liquid/alcohol/coconut-milk/base-mix edge cases); deterministic group order (fresh < paste < liquid); milk family splits into `Świeże → Koncentraty → Płynne i napoje → Proszki i suche → Dodatki` with rank preserved; pineapple family `Świeże → Puree i przeciery → Pasty → Płynne i napoje`; picker source pin (groupHitsByForm + resultRowTextPl, no `b.resultsLabel`); owner example rows exact. Updated [ingredientRanking.test.ts](src/features/ingredient-builder/ingredientRanking.test.ts) label pins. **Gate: 4,693 tests / 346 files PASS · ESLint 0 errors · tsc ✓ · build ✓.**
- **Deploy:** staging — see final report (served bundle carries the group headings + row format).

## Not completed
- Forms honestly mapped to `Inne` (no safe group in the taxonomy): chocolate couvertures/components (`dark_chocolate_couverture`, `chocolate_component`, `white_chocolate`, `cocoa_butter`), `condensed_milk` (spec: Pasty only where the data says Paste), `sweetened_egg_yolk`, `specialty_component`, `bakery_component`, `compound`-free odd rows. Raw-enum category fallback applies only to unknown future categories (all 49 current categories are mapped).
- Served AUTHENTICATED browser proof — AWAITING OWNER (Pro-gated; agent cannot log in).

## Regression proof
Live backend search (per-query requests, limits, abort, freshness 15 s, pagination) — untouched, `liveSearchContract` 12/12 green. Semantic ranking — untouched (`serverSearchRanking` 16/16; grouping partitions the ranked list stably). Stable IDs + selection (add resolves by exact id) — untouched. Save/version, Engine, Monitor, duplicate-recalc P0 — full suite 4,693/4,693 green.

## Owner acceptance (staging, Pro, /pro/recipe picker)
`milk` → headings widoczne; zwykłe mleko pod **Świeże** (`MILK 3.5% · Nabiał · Świeże`); żadnego „Świeży owoc" ani surowego „Chilled"; koncentrat WPC pod **Koncentraty**, proszki pod **Proszki i suche**, inkluzje czekoladowe pod **Dodatki**. `pineapple` → **Świeże** (`PINEAPPLE · Owoce · Świeże`) na górze, niżej **Puree i przeciery**, **Pasty**, **Płynne i napoje** (FANTA). `basil` → **Świeże**, kategoria **Zioła**.
