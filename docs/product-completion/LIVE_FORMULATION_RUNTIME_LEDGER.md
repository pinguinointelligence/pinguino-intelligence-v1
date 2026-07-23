# LIVE PRO FORMULATION RUNTIME — completion ledger

**Status:** `LIVE PRO FORMULATION RUNTIME — FIXED ON STAGING, AWAITING OWNER VERIFICATION`
**Withdrawn first:** `FULL FORMULATION RUNTIME INTEGRATION — FAILED` (set immediately on the owner's live report).
**Date:** 2026-07-23 · Engine science untouched (versions pinned 0.4.0/0.7.0); approved templates untouched.

## Owner failure reproduced (exact)
Visible selector `Gelato` + header `Sorbet owocowy · Classic · −11°C · 1000 g`; Milk 3.5% + STRAWBERRIES · Fresh Fruit at 0 g, unlocked; `Przelicz z PI` → only „PI nie utworzyło bezpiecznej receptury. Propozycja została odrzucona. Receptura nie została zmieniona." — no Preview. Reproduced in tests with the exact live shapes (visible gelato → internal `fruit_gelato` derived from the strawberry).

## Root cause (Phase 1 trace)
| Field | Saved version | Current draft | Workbar (OLD) | Router | Engine/Preview |
|---|---|---|---|---|---|
| Visible type | n/a (unsaved) | **gelato** | showed INTERNAL category via a private map: `fruit_gelato → „Sorbet owocowy"` (WRONG label + wrong field) | consistent (`fruit_gelato`) | consistent |
| Internal profile | — | fruit_gelato (derived from strawberry — CORRECT) | mislabelled | fruit_gelato | fruit_gelato |
| Temperature / tier / batch | — | −11 / classic / 1000 | correct | correct | correct |
- **State**: NOT actually diverged — the draft was the single source everywhere; the WORKBAR alone rendered the internal category through its own stale label map ([ProWorkbar.tsx:22](src/features/pro-core/ProWorkbar.tsx)), displaying „Sorbet owocowy" for `fruit_gelato`. A display-layer defect that looked like a state mismatch.
- **Formulation**: router invoked YES · mode full_formulation · template `fruit_gelato_ref_v1` selected · user roles mapped 2 (milk → primary_liquid, strawberry → fruit) · missing roles: dairy_fat, milk_solids, sucrose, freezing sugar, stabilizer — **the previous toolbox auto-filled WATER ONLY**, so the proposal was strawberry+milk scaled to 1000 g with NO sugars/stabilizer → severely out of band → correctly failed the beat-the-null acceptance → `unsafe_proposal` → the generic sentence. **A proposal WAS created and honestly rejected; the real defect was the crippled toolbox** (contradicting the owner contract: the customer chooses conscious ingredients, PI supplies the approved technological base).

## Completed
- **State consistency (Phase 2):** the workbar now renders the VISIBLE product type — the same field the selector edits (`copy.studio.goal.productTypes[visibleProductType]`); the private mislabel map is deleted. Selector/workbar/RecipeInput/router/Engine all read the one current draft (test-pinned). Switching Sorbet→Gelato re-routes the template instantly (test).
- **REAL toolbox auto-fill (Phase 7):** every unfilled template role with an approved toolbox candidate (`DEFAULT_CORRECTION_CANDIDATES`: milk_3_5, cream_30, smp, sucrose, dextrose, inulin, water, tara_gum) is auto-supplied, each reported in Preview + diagnostics with stable id, role, FINAL grams and the reason „PI dodało składnik w roli …, ponieważ zatwierdzona receptura <templateId> wymaga tej roli."
- **Exclusion semantics (removed ≠ never-selected):** `recipeStore.excludedIngredientIds` — `removeItem` records the canonical ingredient id; an explicit re-add clears it; presets/loads reset it. The formulation NEVER reintroduces an excluded ingredient (honest gap + recommendation instead). Threaded store → `createOptimizePreview` → pipeline → `buildFormulationProposal`.
- **Router refinement:** all-locked drafts route to local-correction (the owner's „Wszystkie składniki są zablokowane…" message) ONLY when near batch; a far-off-batch locked draft is CONSTRAINED FORMULATION — locks byte-exact, toolbox completes the batch (both variants test-pinned).
- **Structured rejection (Phase 3):** `unsafe_proposal` now renders the exact sentence PLUS „Parametry poza zakresem: …" (PL metric labels); `unsupported_profile` / `missing_required_role` render their exact messages (no lock table). Never a bare generic sentence.
- **Owner diagnostics (Phase 8,** [OwnerDiagnosticPanel.tsx](src/features/studio/OwnerDiagnosticPanel.tsx)**):** screenshot-ready rows — Źródło danych (bieżący szkic), Tryb formulacji, Wzorzec formulacji, Brakujące role, Dodane przez PI (z gramami), Wykluczone składniki, Kod odrzucenia.
- **Tests** — NEW [liveRuntime.test.ts](src/features/formulation/liveRuntime.test.ts) (6, the OWNER'S EXACT live shapes): case A Gelato+Milk+Strawberry-0g → real differentiated preview (milk>100 g ≠ strawberry, toolbox cream/smp/sucrose/dextrose/tara added with reasons, 1000 g, no dupes); case B Sorbet+Strawberry → S01 (water/sugars/inulin/tara added, no dairy, strawberry >300 g); Sorbet→Gelato instant re-route; removed-inulin exclusion round-trip (fresh draft auto-fills, removed never returns, re-add clears); Milk 500 g padlock through the LIVE store path (byte-exact + batch complete). Updated: formulation Phase-13 test (exclusion-driven), autoBalance all-locked split (near-batch message / far-off constrained), ProWorkbar pin (visible type). **Gate: 4,741 tests / 349 files PASS · ESLint 0 · tsc ✓ · build ✓.**
- **Deploy:** staging — final report (served bundle proof).

## Not completed
- Served AUTHENTICATED owner click-through — AWAITING OWNER (Pro-gated; agent cannot log in). Both live cases are pinned end-to-end through the REAL store path (`createOptimizePreview`→`applyPreview`) with live-Mapper-shaped ingredients.
- Live-Mapper role edge cases: an exotic fruit/paste the role resolver maps to `flavor_other` stays honestly fixed at the user's grams (kept-fixed rule) rather than solved — expanding role coverage for live rows is data work, not runtime integration.
- Unsupported profiles unchanged (protein; chocolate −12/−13; vegan −11/−12) — exact structured states.

## Regression proof
Engine science (pinned) · live search + grouping · stable IDs (user lines keep ids through formulation) · workbar (save/version flows untouched; 10/10) · save/version · locks (byte-exact) · duplicates · batch invariant + runaway guard · 8×125 rejection (its null-hypothesis gate untouched) — full suite 4,741/4,741.

## Owner acceptance (staging, Pro, /pro/recipe)
1. Nowa receptura: Gelato · Classic · −11 · 1000 g; dodaj TYLKO `MILK 3.5%` i `STRAWBERRIES · Fresh Fruit` (0 g) → `Przelicz z PI` → realny Podgląd: zróżnicowane gramatury, dodane przez PI (śmietana/SMP/cukry/stabilizator) z uzasadnieniami, suma 1000 g, „Źródło formulacji: fruit_gelato_ref_v1…" (z notą wzorca pochodnego). Nagłówek pokazuje **Gelato** (nigdy „Sorbet owocowy"). 2. Sorbet + truskawki → S01, woda+cukry+inulina+tara dodane, bez nabiału. 3. Usuń inulinę → nie wraca; rekomendacja roli. 4. Mleko 500 g z kłódką → dokładnie 500 g. 5. Panel diagnostyczny QA pokazuje tryb/wzorzec/role/dodane/kod odrzucenia bez devtools.
