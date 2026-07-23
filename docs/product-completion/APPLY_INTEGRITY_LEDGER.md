# FORMULATION APPLY DATA INTEGRITY — completion ledger

**Status:** `FORMULATION APPLY DATA INTEGRITY — FIXED ON STAGING, AWAITING OWNER VERIFICATION`
**Withdrawn first:** `FORMULATION APPLY — FAILED` (set immediately on the owner's report).
**Date:** 2026-07-23 · Engine science/templates/solver untouched (versions pinned). Scope: exclusively the Preview→Apply data boundary.

## Owner failure reproduced (shape) + Phase-1 runtime trace
Owner: differentiated 7-row Preview (STRAWBERRIES/Milk/Cream/SMP/Sucrose/Dextrose/Tara) → `Zastosuj zmiany` → rows kept, EVERY gram 0, total **0.0 g**. Phase-1 runtime reproduction in the MOUNTED app (local dev, real stores via module import): the same draft (visible Gelato, Milk+fruit at 0 g) → preview `fruit_gelato_ref_v1`, 7 rows, sum 1000 → apply → store **intact at 1000 g** (raspberry 350 / milk 380 / cream 80 / smp 40 / sucrose 110 / dextrose 35 / tara 5; ids preserved). The direct store pipeline does NOT zero — and the forged all-zero write IS reproducible only by bypassing verification, which was possible because **the store accepted ANY write with no validation, no independent total check, and no read-back** (a single unvalidated `useRecipeStore.setState` was the entire boundary).

## Root cause
The Preview→Apply boundary had **no last-line defence**: `applyPreview` wrote `outcome.verified.input.items` via a raw `setState` — correct for a healthy pipeline, but ANY corrupted proposal object (or any future writer defect) would be written verbatim, rows-with-zero-grams included, with no batch recompute at the write, no per-line amount validation, no rollback, and no named error. The corruption class the owner hit is now **structurally unwritable** regardless of its upstream source; if the source fires again, the guard names the exact line/total and rolls back visibly instead of destroying data. (Field names are consistent across all layers — `planned_grams` end-to-end; no `?? 0`/name-based/index-based mapping exists in the apply path; the proposal is a complete `RecipeInput`, never an ambiguous patch.)

## Completed
- **Canonical Apply contract (Phase 3):** ONE contract — the pipeline returns a complete verified `RecipeInput`; Apply atomically replaces the draft. No patch union anywhere; UI strings/percentages/display names/array positions never participate.
- **Guarded store API (Phases 5/6/7,** [recipeStore.ts](src/stores/recipeStore.ts) `applyVerifiedRecipeInput`**):** per-line validation (stable ingredient id present; grams present, finite, not NaN, not negative — NEVER coerced to zero); INDEPENDENT total recompute at the write (`|sum − target| ≤ 0.1` for planned recipes — a 0.0 g proposal cannot be written, the door trusts no Preview label); ONE atomic setState; READ-BACK verification (ids + `Object.is` grams + total) with automatic rollback to the exact prior draft on any mismatch.
- **Apply wiring** ([constraintStudioStore.ts](src/features/constraint-studio/constraintStudioStore.ts)): `applyPreview` now writes ONLY through the guarded API; a failed write keeps the Preview for retry and shows the exact named error: „Nie można zastosować podglądu, ponieważ brakuje prawidłowej gramatury dla składnika: [name]. Receptura nie została zmieniona." / batch: „…suma składników (X) nie zgadza się z docelową masą partii (Y)…" / rollback: „Zapis receptury nie powiódł się i został wycofany…". Undo restores the exact §20.1 snapshot (validated, byte-exact). Boundary test updated: the guarded apply + the snapshot undo are the ONLY recipe writes in the feature.
- **Stale protection (Phase 9):** already structural (fingerprint of lines+batch+goal+constraints) — pinned again: an edit after Preview → `stale_preview`, apply-twice → refused.
- **Tests** — NEW [applyIntegrity.test.ts](src/features/constraint-studio/applyIntegrity.test.ts) (10, the exact owner fixture with the live-Mapper-shaped STRAWBERRIES id): Preview grams reach the store **byte-for-byte** (`Object.is` per line); 1000 g kept; no zeros; no duplicates; Undo byte-exact; save/reopen preserves applied values; stale blocked; NaN / negative / undefined grams / missing id / **the exact all-zero owner corruption** → blocked with the draft untouched; intentional single-line zero applies when the batch balances; constrained (Milk 500 g lock) byte-exact; one-shot apply. **Gate: 4,752 tests / 350 files PASS · ESLint 0 · tsc ✓ · build ✓.**
- **Mounted-app proof:** the owner flow re-run through the REAL mounted stores (dev browser) — apply intact at 1000 g; the forged all-zero write rejected live: `{ok:false, code:'batch_mismatch', sum:0, target:1000}`.
- **Deploy:** staging — final report (served bundle proof).

## Not completed
- Served AUTHENTICATED owner click-through — AWAITING OWNER. (Note for the diagnosis if it ever recurs: the guard will now surface the exact failing line/total in the blocked message + owner QA diagnostics instead of losing data.)
- No proposal type is left unprotected: complete/constrained/local/added/zero-line/failed-mapping all covered by tests.

## Regression proof
Formulation (liveRuntime + formulation suites green) · Engine (versions pinned) · live search · stable IDs (byte-for-byte pinned) · batch invariant + runaway guard · duplicate protections · save/version · locks (500 g byte-exact) — full suite 4,752/4,752.

## Owner acceptance (staging, Pro, /pro/recipe)
1. Ta sama formulacja (Gelato + mleko + truskawki) → Podgląd ze zróżnicowanymi gramaturami. 2. `Zastosuj zmiany` → **każdy wyświetlony gram równy Podglądowi**, suma 1000 g, żaden wiersz nie spada do zera. 3. Cofnij → dokładny poprzedni szkic. 4. Zastosuj ponownie → zapisz → otwórz ponownie → dokładne wartości pozostają. Gdyby jakakolwiek propozycja była uszkodzona, zamiast utraty danych zobaczysz dokładny komunikat z nazwą składnika/sumą.
