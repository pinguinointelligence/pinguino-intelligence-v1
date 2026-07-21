# S2 RECIPE SAVE & VERSIONING — REPAIR LEDGER

**Status: `S2 RECIPE SAVE AND VERSIONING — FIXED, DEPLOYED, AWAITING OWNER VERIFICATION`.**
Commit `da9cf9c` · staging deploy `dpl_DuFK1SYU…` **READY** · gates: build 0 / vitest 4501 / eslint 0.
Not CLOSED until the owner confirms the five acceptance points on the served staging app.

---

## Requested (the reported defects)
- Alternating save — top-right `Zapisz recepturę`: a1 ✗, a2 ✓, a3 ✗, a4 ✓.
- Two competing customer save systems.
- Version numbering "resets to v1" after leaving/returning.
- Restore must create a new version (never overwrite history).
- Name + notes model.
- Existing successfully-saved records (a2, a4) preserved.

## Root cause (PROVEN — code + live staging data)
Two independent customer save systems wrote `saved_recipes`, entangled through the shared,
volatile `recipeStore.savedRecipeId`:
1. **Top-right `SaveRecipeDialog` → `services/recipes.ts`** wrote `saved_recipes` ONLY (no meta,
   no version → orphans). Its create-vs-update was keyed on `savedRecipeId` (set by `markSaved`,
   nulled by reload) with a silent `update()→create()` fallback and optimistic `onClose()`. That
   toggle is the "every second save" alternation; the two staging orphans `f8b66a9e "a2"` /
   `9e26e6c8 "a4"` (created-then-updated once, no meta/versions) match exactly. No `a1`/`a3` rows.
2. **Lower `SaveVersionControl` (constraint-studio) → pro-core adapter** wrote all three tables,
   keyed on session-only `constraintStudioStore.proCoreRecipeId` (null on reload), so each session
   started a NEW aggregate at v1 — four "Receptura ze Studia" aggregates prove it. The DB history
   was actually intact (`d29281f5` holds v1–v7).
3. **Atomicity gap**: `createRecipe` did 3 non-atomic inserts (a mid-way failure orphans a row).

Schema is correct (no defect): `recipe_versions UNIQUE(recipe_id, version_number)`, `version_number ≥ 1`,
`source` CHECK, meta `latest_version_number`, all FKs `ON DELETE CASCADE`, RLS on every table, no
insert trigger. **No migration required** — the fix is application-level + a data reconciliation.

## Completed
| Item | Implementation | Files | Migration/RPC | Tests |
|---|---|---|---|---|
| One canonical link | `recipeStore`: `savedRecipeId`+`currentVersionNumber`+`dirty`, **persisted** (survives reload) | `src/stores/recipeStore.ts` | none | `recipeStore.test.ts` |
| One canonical save | `SaveRecipeDialog` → pro-core adapter: create-v1 / next-version / save-as-new; label reflects state; honest failure (modal stays open, no false close, retry); no double-submit; name+note; query-cache invalidation | `src/features/recipes/SaveRecipeDialog.tsx` | none | `SaveRecipeDialog.test.tsx` |
| Atomic first save | compensating cascade-delete on any mid-way failure → no orphan | `src/services/proCore/supabaseRecipes.ts` | none (uses existing FK CASCADE) | adapter tests (meta-fail, v1-fail) |
| Concurrency-safe numbering | DB-derived `nextVersionNumber` + retry on `23505` (never local+1) | `supabaseRecipes.ts` | none | adapter tests (retry, reload→v4) |
| Removed 2nd mechanism | `SaveVersionControl` unmounted; Wersje tab read-only history + per-version restore (re-links editor) | `ConstraintStudioSection.tsx`, `RecipeVersionsSection.tsx` | none | source-scan tests |
| Open re-links aggregate | `/my-recipes` open fetches aggregate + version | `MyRecipesPage.tsx` | none | — |

8 new regression tests (5 adapter + 3 dialog); full suite 4501 green. Commit `da9cf9c`, staging READY.

## Not completed (and why)
- **Live authenticated round-trip** — I cannot log in as `pro@pro.com` (credential entry disallowed);
  it is the owner's acceptance test below.
- **Orphan reconciliation execution** — the additive backfill (meta + v1 for a2/a4) was **blocked by
  the auto-mode classifier** (PI-INFRA-002). It is prepared, owner-runnable, and NOT required for the
  fix or for data safety (see below). File: `docs/product-completion/S2_RECONCILIATION.sql`.

## Existing data
- **Preserved:** a2 (`f8b66a9e`) and a4 (`9e26e6c8`) — untouched, still listed in `/my-recipes`
  (which reads `saved_recipes` directly). Nothing deleted or rewritten.
- **Legacy/orphan found:** exactly 2 orphans (a2, a4) with no aggregate meta/version. Also 4 valid
  pro-core aggregates from the old lower-save path (`31c65f0c`/`c69f9186`/`a7042910`/`d29281f5`).
- **Reconciliation required:** upgrade the 2 orphans to aggregates + v1 (additive, idempotent) so
  they become versionable under the canonical save. Prepared SQL awaits the owner (staging ref
  `tunabqqrwabacxjcxxkz` only).

## Online verification
- **local** — VERIFIED (build 0 · vitest 4501 · eslint 0 · tsc 0).
- **staging (deploy)** — VERIFIED (`da9cf9c` READY; `/studio` + `/pro` render, console clean).
- **authenticated Pro** — AWAITING OWNER.
- **refresh persistence** — AWAITING OWNER.
- **logout/login persistence** — AWAITING OWNER.

## Regression status (preserved)
Mapper search, canonical Engine, exact grams for Pro, entitlement chain, `/pro` (S3), ingredient
selection — all unchanged (the engine/monitor/optimization surfaces were not touched; the
optimization "production-Studio wiring" source tests still pass). Existing saved recipes preserved.

## Owner acceptance test (staging.pinguinoai.com, Pro login)
1. new recipe → `Zapisz recepturę` as `test-a1` → appears immediately;
2. hard refresh → still there;
3. edit → `Zapisz nową wersję` → v2; edit → save → v3;
4. Wersje → restore v1 → a NEW v4 appears, v1–v3 remain;
5. logout / login → recipe + v1–v4 remain;
6. create another new recipe → **saves on the FIRST attempt** (no alternation);
7. confirm only ONE save control exists (no lower "Studio v1" save).

## Next unresolved item (this task only)
The owner's authenticated staging acceptance run above (and, optionally, running
`S2_RECONCILIATION.sql` to fold a2/a4 into the canonical list).
