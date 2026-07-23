# NIGHTLY P0 — WAVE 0 BASELINE RECONCILIATION (2026-07-24, Integration Owner)

## Git / deployment truth

| Item | Value |
|---|---|
| local HEAD | `4dfb097` (docs ledger) on `main` |
| origin/main | `4dfb097` — **FROZEN from now on** (no further pushes this programme) |
| origin/staging | `4dfb097` (aligned) |
| newest formulation commit | `3316f2b` (constrained reformulation + complete Undo + truthful score) |
| Apply-integrity repair | `e20de43` — present in HEAD lineage ✓ |
| staging served bundle | `assets/index-DCJH1R2o.js` — content-verified (carries the 3316f2b copy marker) ✓ |
| production served bundle | `assets/index-BTR3SdkC.js` — OLDER; env/model unverifiable → `BLOCKED_EXTERNAL` |
| working tree | clean except untracked `docs/` packs (account-access, ingredient-database, recipes, audit artifacts) |
| worktrees | 9 historical `slice/*` worktrees under `C:/Users/Absconsio/Desktop/pi-worktrees/` (all merged; untouched tonight) |
| main pushed contrary to staging-only? | Earlier pushes to main followed the THEN-instructed topology (`push main` + `origin/main:staging`). No violation; topology changes tonight: **staging branch only**. |

## Classification of core fixes

| Fix | Commit | Status |
|---|---|---|
| Live server-side Mapper search + form ranking + grouping | `0473c3b`/`14be387`/`869a65d` | DEPLOYED_NOT_VERIFIED → Agent C finalizes presentation, AWAITING_OWNER |
| Recalc duplication + batch invariant | `53e75cd` | VERIFIED_AUTOMATED + owner-exercised, stable |
| Apply data integrity (atomic verified write) | `e20de43` | VERIFIED_AUTOMATED, DEPLOYED, AWAITING_OWNER — **frozen regression baseline** |
| Constrained reformulation + complete Undo + truthful score | `3316f2b` | DEPLOYED; fixtures A3 (inulin-0) / A4 (milk-500) VERIFIED_AUTOMATED, AWAITING_OWNER |
| **LIVE FORMULATION TOOLBOX AND FALLBACK** | — | **LIVE FAILED / OPEN** — no repair code exists yet; both owner failures stand. Sole property of Agent A. |
| /start entitlement (persona hardcoded 'demo') | — | LIVE FAILED (audit-proven BROKEN) → Agent D |
| Cost/kg after formulation | — | LIVE FAILED (owner-observed) → Agent E diagnostic |
| Empty `products` table on staging | — | NOT auto-P0 (owner direction allowed legacy-import removal) → Agent F read-only forensics |

## Integration Owner root-cause hypotheses handed to Agent A (verify, do not assume)

1. **FAILURE B (missing trio)**: `fruit_gelato_ref_v1` **does** register `toolboxId`s for sucrose/dextrose/tara_gum — so "template lacks candidates" is FALSE. Prime suspect: **persisted `excludedIngredientIds`** (zustand persist `pinguino-recipe`) leaking from the owner's earlier removals into a fresh draft; auto-fill skips excluded → `missingHardRoles` = exactly the reported trio. Exclusions must be draft-scoped, reset on new-draft, and QA-visible.
2. Secondary suspect: live category/profile resolution (visible Gelato + fruit → `fruit_gelato` vs `milk_gelato`) or the toolbox candidate lookup path in the LIVE store (options threading) diverging from test fixtures.
3. **FAILURE A**: the router sends substantive (≥50% target mass) unconstrained drafts to the local basin; local `no_proposal`/`unsafe` has **no fallback** to template-seeded reformulation — the one-line failure is by (incorrect) design. Phase-6 fallback is missing, not broken.
4. **FAILURE A band source**: `fruit_gelato` is scored against fallback `milk_gelato` ice bands (`category_fallback`) and those violations act as HARD rejections in acceptance/classification. Must become soft/provisional-only — WITHOUT touching band values.

## Staging toolbox IDs to verify (read-only, staging connector only)

Sucrose `PI-ING-000514` · Dextrose `PI-ING-000494` · Tara gum `PI-ING-000492` · Cream 30% `PI-ING-000180` · Milk 3.5% `PI-ING-000236` · plus SMP and inulin (IDs to be resolved). `mcp__supabase__` targets PROD — forbidden; only the staging-scoped connector, SELECT only.

## Environment rules in force tonight

Deploy target: `staging.pinguinoai.com` via branch `staging` on ref `tunabqqrwabacxjcxxkz`. `main` frozen. No production writes (`riwipywgqobrulyzrzad`, `tjntmljkrxbpwjmkautu` forbidden). Feature agents: own branches in isolated worktrees, no merges, no pushes to staging/main. Integration Owner merges A→C→E→D→B, full gates, pushes `staging` only.
