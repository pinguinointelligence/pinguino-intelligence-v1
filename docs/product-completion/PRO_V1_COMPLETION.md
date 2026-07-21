# PINGÜINO PRO V1 — Completion Ledger

Binding rule: a phase is COMPLETE only when implemented → integrated → deployed to
staging → **verified on the served staging app**, and for release the **same commit**
is deployed + verified on production. `CODE_COMPLETE`/`DEPLOYED_NOT_VERIFIED` ≠ COMPLETE.

**Overall status: `PINGÜINO PRO V1 — BLOCKED`** (two blockers below). Phase 0 done.

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

## Environment / parity baseline (verified 2026-07-20)
- `main` = `staging` = **`e96f869`** (identical code both branches → same version).
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
| Saved recipes + immutable versions (build/next/restore/compare) | pro-core recipe domain | `/my-recipes` | **in-memory only** | ⚠️ domain done, no Supabase adapter |
| Production Mode (plan/lifecycle/actuals/deviation/amend) | productionMode.ts | `/dev/pro-production` | **in-memory only** | ⚠️ domain done, no adapter/surface |
| Exact scaling | recipeScaling.ts | via Production | pure | ✅ done |
| Costing + immutable snapshots | costing.ts | `/dev/pro-costs` | **in-memory only** | ⚠️ domain done, no adapter/surface |
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
- **S1 — Capabilities foundation:** extend `proCoreCapabilities` with the 11 named Pro flags + projections + tests. (consumed by every later slice)
- **S2 — Pro-core Supabase adapters + selector wiring** for recipes/versions (0027), production (0028), costs (0029). Makes existing domains persist for real.
- **S3 — `/pro` workspace shell + persona-gated nav** (`/studio`→`/pro` redirect preserved), surfacing Receptura + Versions (real) and honest "backend"/"not-yet" states for the rest — no `/dev/*` as product UI.
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

## Regression status (preserved, re-verified this session)
Billing money-loop (e05e5f5), tier cards, persona separation, cross-account isolation
(ef8152b), live Mapper search on staging (2070 rows). No working feature regressed
(Phase 0 was read-only).
