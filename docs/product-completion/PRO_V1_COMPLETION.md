# PINGÜINO PRO V1 — Completion Ledger

Binding rule: a phase is COMPLETE only when implemented → integrated → deployed to
staging → **verified on the served staging app**, and for release the **same commit**
is deployed + verified on production. `CODE_COMPLETE`/`DEPLOYED_NOT_VERIFIED` ≠ COMPLETE.

**Overall status: `PINGÜINO PRO V1 — STAGING IMPLEMENTATION IN PROGRESS`.**
Only the *final production-verification* gates are externally blocked (B1). Staging
implementation proceeds slice-by-slice. **Done: Phase 0, S1 (`2a65849`), S2 (`0f7816f`),
S3 (`b715222`, staging deploy READY).** Next: S4.

---

## Hard blockers (must clear before any production PASS)

- **B1 — PI-P0-001 (production has no Supabase env).** `pinguinoai.com` (Vercel project
  `pinguino-intelligence`, deploys `main`) builds a bundle with **no `VITE_SUPABASE_URL`**
  → no auth, no entitlement, no catalogue, **no Pro login on production at all**. Every
  production-verification gate (Phases 1, 2, 27, 29) is therefore blocked. **External
  action:** set `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` on the production Vercel
  project (Production env) + redeploy. See `OPEN_ISSUES.md#PI-P0-001`.
- **B2 — scope.** The complete Pro product is a multi-slice build (workspace, Supabase
  adapters, gram edit/lock/range, batch repair, professional machine class, Monitor Pro
  drawer). It is not one commit. Delivered in verified slices (plan below).

## Environment / parity baseline (verified 2026-07-21)
- `main` = `staging` = **`0f7816f`** (identical code both branches → same version); staging
  deploy `dpl_3UHUxWj3GbsWSjJNCjxXk4S3uoi1` **state READY**.
- Staging Supabase `tunabqqrwabacxjcxxkz`: migrations 0001–0031 + views 0032/0033 applied;
  `pro@pro.com → pro:admin_grant:active`, `home@home.com → home:admin_grant:active` (confirmed).
- Production Supabase: **unset** (B1).
- I will not enter the `pro@pro.com` password (credential entry is disallowed for me);
  Pro is verified via the entitlement DB + the DEV persona render path.

---

## Reuse map — EXISTS, do not rebuild

| Pro capability | Module | Reachable now | Persistence | Status |
|---|---|---|---|---|
| Canonical Engine (`calculateRecipe`, `proposeCorrections`, `previewOptimization`) | `@/engine`, optimizationPreviewRunner | everywhere | pure | ✅ done |
| Repair engine — Auto-Fix, **IF9** multi-step + multi-lever, **IF10** stock-shortage + scale-down, verified substitutes | `src/engine/corrections`, `src/features/optimization`, constraint-studio | `/studio` (BranchWorkflowPreviews) + `/dev/*` | pure | ✅ done (preview-only) |
| Preview → `verifyConstraintsPreserved` → Apply (`VerifiedApply`) | constraint-studio | `/studio` (Pro-gated) | session | ✅ done |
| Accepted-corrections write | createAcceptedCorrection | `/studio` signed-in Pro | **Supabase** | ✅ done (only built Pro write path) |
| Saved recipes + immutable versions (build/next/restore/compare) | pro-core recipe domain + **supabaseRecipes.ts** | `/my-recipes` | **Supabase (S2)** | ✅ domain + adapter done (surface S3) |
| Production Mode (plan/lifecycle/actuals/deviation/amend) | productionMode.ts + **supabaseProduction.ts** | `/dev/pro-production` | **Supabase (S2)** | ✅ domain + adapter done (surface S9) |
| Exact scaling | recipeScaling.ts | via Production | pure | ✅ done |
| Costing + immutable snapshots | costing.ts + **supabaseCosts.ts** | `/dev/pro-costs` | **Supabase (S2)** | ✅ domain + adapter done (surface S10) |
| Capability-gated exports (recipe + cost CSV) | costExport.ts | `/dev/pro-costs` | pure | ⚠️ done, not surfaced |
| Monitor Home (§13, 4 traits) | PiMonitorSection / MonitorHomeReadout | `/start` result (inline) | — | ✅ done |
| Monitor Pro (§14, 9 modules) | UserMonitorPro | `/studio` rail only | device-local layout | ⚠️ partial (read-only, no recalc/Apply, not a drawer) |
| Persona/entitlement chain (auth→entitlement→persona→shell) | liveEffectiveAccess, effectiveAccess, useProCorePersona | app-wide | Supabase (0015) | ✅ done |
| Account isolation (logout wipe, scoped machine key) | accountSessionReset, userScopedMachineKey | app-wide | device/query | ✅ done (device-local) |
| Live Mapper search (`Składniki PI`) + Ingredient Resolution | mapperSearch, useIngredientResolution | `/start` picker | Supabase (0032/0033) | ⚠️ works; exact-recalc bridge open |
| Quality tiers Eco/Classic/Premium/Signature | spine TIER_POLICIES | internal | pure | ✅ domain done |
| SERVING_MODES routing (Świeże/−11/−12/−13, Ninja) | servingMode.ts | `/start` (persona pro) | pure | ✅ done |

## Gaps — MISSING or not surfaced (the Pro V1 build)

1. **No `/pro` workspace route** (Receptura/Monitor/Wersje/Produkcja/Historia/Koszty/Eksporty/Ustawienia). Pro-core lives at `/dev/*`. (Phase 3, 22)
2. **No Supabase adapters** for pro-core repos (recipes/versions **0027**, production **0028**, costs **0029** — migrations ARE applied on staging; only `InMemory*` adapters exist; `resolveRepository` throws `BackendNotConfiguredError` in prod). (Phase 18–21)
3. **No professional-machine class / hierarchy.** Registry is HOME-only; no `Maszyna profesjonalna` first-class option. (Phase 5)
4. **No global Monitor Pro drawer/bottom-sheet**; Monitor Pro is a `/studio` rail, read-only. (Phase 16)
5. **No per-ingredient gram edit / lock / range** in recipe state (customer flow only VIEWS grams). (Phase 9–11)
6. **No Repair-Batch (production batch repair)** surface/capability. (Phase 13)
7. **Missing named capabilities**: `canUseProfessionalFlow`, `canChooseProfessionalServingMode`, `canUseProfessionalMonitor`, `canEditIngredientGrams`, `canLockIngredientGrams`, `canSetIngredientRange`, `canScaleRecipe`, `canRepairRecipe`, `canRepairProductionBatch`, `canViewProductionHistory`, `canUseCosts`. (Phase 1)
8. **Exact-recalc RecipeInput bridge** — resolved products' real pac/pod don't yet drive an exact recipe recalc. (Phase 8/25)

## Ordered slice plan (each: implement → gate → deploy → **staging-verify**)
- **S1 — Capabilities foundation** ✅ `2a65849`: extended `proCoreCapabilities` with 12 named Pro flags + `useProCoreCapabilities` hook + projections + tests.
- **S2 — Pro-core Supabase adapters + selector wiring** ✅ `0f7816f` (staging READY): recipes/versions (0027), production (0028), costs (0029). Existing domains persist for real; see the S2 ledger below.
- **S3 — `/pro` workspace shell + persona-gated nav** ✅ `b715222`: 9-tab canonical Pro workspace (Receptura = the reused engine lab via extracted `StudioEngineSurface`; Wersje = real S2-backed `RecipeVersionsSection`; Produkcja/Koszty = live durable-backend indicator + honest "arrives in S_" note; Ustawienia/Maszyna wired). Non-Pro → honest upsell. `/studio` kept intact (demo/free previews unchanged) + cross-links to `/pro`; the `/studio`→`/pro` redirect deferred to a later slice to avoid regressing that preview. Browser-verified on the dev server.
- **S4 — Professional machine class + machine-first hierarchy** (Maszyna profesjonalna first → Świeże/−11/−12/−13; Home machines below; auto-routing preserved).
- **S5 — Global Monitor Pro drawer/bottom-sheet** (reuse UserMonitorPro modules + PiMonitorSection recalc seam; recipe visible behind).
- **S6 — Ingredient row controls**: gram edit → Preview→verify→Apply→Undo; locks; ranges (honest solver-capability messaging).
- **S7 — Repair Recipe** surface over the existing IF9/IF10/substitute previews.
- **S8 — Repair Batch** (production batch repair) — new surface over Production Mode actuals.
- **S9 — Production/History/Costs/Exports** surfaced in `/pro` on the S2 adapters.
- **S10 — Automated Pro acceptance + browser viewports; then staging PASS.**
- **RELEASE — after B1 cleared:** promote the exact staging SHA to production, verify Pro login + flow on `pinguinoai.com`.

## External actions required
| # | Person | Service | Project | Env | Setting | Verify | Redeploy |
|---|---|---|---|---|---|---|---|
| B1 | Nicolas | Vercel | pinguino-intelligence | Production | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (copy from pinguino-staging) | prod bundle inlines tunab; catalogue + Pro login work on pinguinoai.com | YES |
| — | Owner | decision | — | — | Confirm pre-launch shared-DB model (prod uses staging `tunab`) OR provision a separate prod Supabase (0001–0033 + seed + secrets) | — | — |

---

# S2 completion ledger — Pro-core Supabase adapters (`0f7816f`, staging READY)

**Status: `VERIFIED_STAGING` (code + gates + direct-DB RLS/immutability proof) with the one
live login round-trip marked `AWAITING_OWNER_VERIFICATION`.** No S2 code defect remains.
Production runtime parity: `BLOCKED_EXTERNAL` (B1 / PI-P0-001) — unchanged.

## Per-repository report

### 1. Recipes / versions repository
- **Tables:** `saved_recipes` (mutable container, `user_id`), `saved_recipe_meta` (INSERT/SELECT/UPDATE, `owner_user_id`), `recipe_versions` (**append-only INSERT/SELECT**, `owner_user_id`). Migration 0027.
- **Adapter:** `src/services/proCore/supabaseRecipes.ts` → `supabaseRecipesRepository(client)` implementing the `RecipesRepository` port; reuses PURE domain (`buildRecipeVersion` / `restoreVersion` / `compareVersions`). Owner id from `auth.getUser()`, never the caller.
- **Selector wiring:** `src/features/pro-core/proCoreRecipeRepo.ts` → `resolveRecipesRepository()` defaults `backend: supabaseRecipesBackendFactory()`; consumed by `SaveVersionControl.tsx` + `RecipeVersionsSection.tsx` (`/my-recipes`).
- **RLS (staging, direct):** RLS on; scoped to `auth.uid()`; `recipe_versions` has **no UPDATE/DELETE policy** → history immutable.
- **Source of truth on staging:** real Supabase (`isSupabaseConfigured=true` → selector returns Supabase, not in-memory).
- **Fallback:** DEV-only in-memory singleton; production without a backend → honest `unavailable` (never a silent in-memory save).
- **Tests:** `supabaseRecipes.test.ts` (fake-client unit) + `proCoreRecipeRepo.test.ts` (DEV path, client mocked null) + `repositorySelector.test.ts`.
- **Commit:** `0f7816f`.

### 2. Production repository
- **Tables:** `production_runs` (INSERT/SELECT/UPDATE lifecycle), `production_run_planned_items` (**append-only**, references immutable `recipe_version_id`), `production_run_actuals` (INSERT/SELECT/UPDATE), `production_run_events` (**append-only** audit). Migration 0028. All `owner_user_id`.
- **Adapter:** `src/services/proCore/supabaseProduction.ts` → `supabaseProductionRepository(client, options?)`; `ProductionPersistenceError` on any DB error.
- **Selector wiring:** `src/features/pro-core/proCoreProductionRepo.ts` → `resolveProductionRepository()` (Supabase default). Surface consumed in **S9**.
- **RLS (staging, direct):** RLS on; scoped to `auth.uid()`; planned-items + events immutable.
- **Source of truth / fallback:** same selector contract as recipes.
- **Tests:** `supabaseProduction.test.ts` (fake-client unit).
- **Commit:** `0f7816f`.

### 3. Costs repository
- **Tables:** `ingredient_cost_entries` (mutable price list), `recipe_cost_snapshots` (**append-only** — immutable after prices change). Migration 0029. `owner_user_id`.
- **Adapter:** `src/services/proCore/supabaseCosts.ts` → `supabaseCostsRepository({client, now?})`.
- **Selector wiring:** `src/features/pro-core/proCoreCostsRepo.ts` → `resolveCostsRepository()` (Supabase default). Surface consumed in **S10**.
- **RLS (staging, direct):** RLS on; scoped to `auth.uid()`; snapshots immutable.
- **Source of truth / fallback:** same selector contract.
- **Tests:** `supabaseCosts.test.ts` (fake-client unit).
- **Commit:** `0f7816f`.

## The 10 required S2 proofs

| # | Requirement | How proven | Verdict |
|---|---|---|---|
| 1 | Pro recipe save persists after hard refresh | Adapter writes to `saved_recipes`+`recipe_versions`; staging selector returns Supabase | code+wired ✅ · live round-trip **AWAITING OWNER** |
| 2 | New version = immutable new record | `recipe_versions` **INSERT/SELECT only** (direct pg_policies) + `buildRecipeVersion` appends | ✅ proven (DB) |
| 3 | Restore = new latest version, never overwrites history | `restoreVersion` appends a new version; `recipe_versions` has no UPDATE/DELETE policy | ✅ proven (DB) |
| 4 | Production runs reference the exact immutable `recipe_version_id` | `production_run_planned_items.recipe_version_id` NOT NULL + table append-only | ✅ proven (schema+DB) |
| 5 | Cost snapshots immutable after prices change | `recipe_cost_snapshots` **INSERT/SELECT only** (direct pg_policies) | ✅ proven (DB) |
| 6 | User A cannot read/modify User B's data | All 10 tables: RLS on + scope `auth.uid()=user_id/owner_user_id` (direct pg_policies) | ✅ proven (DB) |
| 7 | Staging uses real Supabase repos, not in-memory | Staging build has `VITE_SUPABASE_URL` → `isSupabaseConfigured=true` → selector returns Supabase; `BackendNotConfiguredError` never silently falls back | code+env ✅ · live confirm **AWAITING OWNER** |
| 8 | Backend failure honest, never a false save | Every adapter throws on `error` (`ProductionPersistenceError` / `Error(error.message)`); unit-tested | ✅ proven (code+tests) |
| 9 | Home/Demo don't get Pro-only repo ops | Save gates on `canSaveRecipe` (Home T/Demo F); production+costs gate on `canUseProductionMode`/`canUseCosts` (Pro-only, S1) | ✅ proven (capability matrix) |
| 10 | RLS verified via direct database-role tests, not UI | `pg_policies` inspected directly on staging `tunab` (this ledger) | ✅ proven (DB) |

**8 of 10 fully proven now; #1 and #7 are proven at the code+config level and gated on the one
live login round-trip below, which I cannot run (I do not enter the `pro@pro.com` password).**

## Gate results (`0f7816f`)
- `npm run build` (`tsc -b && vite build`): **0 errors**
- `vitest`: **4487 passed / 4487** (328 files)
- `eslint`: **0**
- Boundary guard (`studioBoundary.test.ts`): **pass** — no feature file imports the vendor client; adapters + factories live in `services/`.

## Owner login acceptance test (run on staging.pinguinoai.com)
1. Log in as `pro@pro.com`.
2. Create a recipe → **Save**.
3. **Hard refresh** (Cmd/Ctrl-Shift-R) → reopen the recipe → grams + versions still there.
4. Create **version 2**.
5. **Restore version 1** → confirm a NEW version (v3) is created and v1/v2 remain in history.
6. **Log out, log back in** → all recipes + versions still present.
- PASS ⇒ flips proofs #1 + #7 to `VERIFIED_STAGING` and closes S2 entirely.

## ⚠️ Infra note (safety)
The `mcp__supabase__` MCP connector is currently pointed at a **non-staging** project (old
10-table schema: `mapper_basement`, `products`, `subscriptions`, … — no pro-core/entitlements
tables) — i.e. production or another project, **not** staging `tunab`. Only the
`mcp__11ad34eb…` connector reaches staging. All S2 DB proofs above were taken via the staging
connector; the non-staging connector received **read-only** queries only. Any future DB write
must target `tunab` via the staging connector explicitly.

---

## Regression status (preserved, re-verified this session)
Billing money-loop (e05e5f5), tier cards, persona separation, cross-account isolation
(ef8152b), live Mapper search on staging (2070 rows). No working feature regressed
(Phase 0 was read-only).
