# CONSTRAINED REFORMULATION, COMPLETE UNDO AND TRUTHFUL SCORE — COMPLETION LEDGER

Date: 2026-07-23 · Commit: `3316f2b` · Deploy: main + staging (staging.pinguinoai.com)

## Owner failures → root causes → fixes

| # | Owner-verified failure | Root cause | Fix | Proof |
|---|---|---|---|---|
| A | Inulin unavailable (0 g lock), sorbet 944.6 g → REJECTED instead of reformulated | ±25% mass rule routed constrained drafts into the local basin; beat-the-null then rejected the constrained optimum for equalling the projection | Router: explicit constraints ALWAYS select constrained reformulation; acceptance: constrained optimum may equal the null (locks byte-exact + batch + duplicate gates protect it) | `constrainedReformulation.test.ts` FIXTURE A — inulin stays `Object.is` 0, never re-added, total returns to 1000 g, fiber recommendation present, applies through the live store |
| B | Milk exactly 500 g, gelato 1120 g → REJECTED | same ±25% routing | same | FIXTURE B — milk 500 byte-exact, total exactly 1000 g, differentiated grams, no duplicates |
| C | Undo incomplete — exclusions lost | `AppliedChangeRecord` snapshots did not carry `excludedIngredientIds` | before/after snapshots carry exclusions; `undoLastApply` restores them; stale undo is a safe no-op | FIXTURE D — apply→exclude→reformulate→undo restores `['inulin']`; §20.3 refusal proven non-corrupting; post-undo reformulation deterministic |
| D | Batch scale to 0 g possible | no positivity guard on rescale target | blocked at builder (`rescale_invalid`), scale-button disabled state, and Apply door (`batch_total_mismatch`) — three independent layers | FIXTURE E — 0/NaN/−100 all blocked; 944.6 g → 1000 g always finite |
| E | False „locked-total exceeds batch" (locked 500 ≤ target 1000) | `normalize()` failure mislabeled: no-adjustable-lines reported as `locked_exceeds_batch` | truthful split — `locked_exceeds_batch` only when arithmetically true; otherwise `no_adjustable_lines` → `rescale_no_scalable` | FIXTURE E test 18 — locked 500 vs 1000 never emits `rescale_locked_sum`; `constraintSet.ts` comparison verified strict (`preservedSum > target + tol`) |
| F | Incomplete hard-role proposal with active Apply | none of the gates checked role completeness | `missingHardRoles` on the proposal; builder blocks with `missing_required_role` | formulation suite Phase 10 + FIXTURE A recommendation path |
| G | Empty recipe called „Balanced" | CorrectionPanel empty branch showed the „all clean" copy | `recipeIncomplete` prop → honest incomplete copy; router never classes an empty draft as at-target | empty-recipe test — routes away from `local_correction` |
| H | Sorbet 7/10 with unassessed axes counted | overall card hid coverage | „Oceniono N z M obszarów." + „Ocena częściowa / prowizoryczna dla tego profilu." when bands are missing or category/temperature fallbacks are active; „Brak oceny" never counts as assessed | `OverallScoreCard.test.tsx` — provisional profile renders the note; fully-banded profile renders none; the integer score itself is disclosed, not altered |

## Router (the ±25% rule is REMOVED)

Priority order, all deterministic:
1. poured actuals → local rescue
2. ALL lines locked **and** template hard roles covered → local, honest „Wszystkie składniki są zablokowane…" (any batch distance)
3. ALL lines locked but hard roles missing (lone Milk 500 g) → constrained reformulation around byte-preserved locks
4. any explicit hard constraint (exact lock, range — `byLineId` or `lock_type`) → **constrained reformulation, always**
5. unconstrained substantive draft (≥ half target mass) → verified local corrector (batch-first, beat-the-null protected)
6. hollow draft (empty / all-zero / 8×1 g) → full formulation from the approved template; no template → honest unsupported

## Acceptance semantics

- UNCONSTRAINED: must strictly beat the null hypothesis (8×125 g remains structurally unappliable — builder AND door, both recomputed trustlessly).
- CONSTRAINED: the constrained optimum may equal the projection; protection = locks byte-for-byte (`Object.is`), batch equality (±0.1 g), duplicate impossibility, exclusions never reintroduced; residual violations surface as the honest best-achievable score with recommendations.

## Gates

| Gate | Result |
|---|---|
| `npx tsc -b` | 0 errors |
| `npx vitest run` | **4768 / 4768** (351 files) — includes 16 new fixture tests |
| `npx eslint .` | 0 errors (2 pre-existing react-refresh warnings) |
| `npm run build` | ✓ |
| Engine science | UNTOUCHED — `engine_version 0.4.0` / `config_version 0.7.0` pinned in the new suite |

## Files changed (11)

`formulate.ts` (router + truthful failure split + `missingHardRoles` + exclusions), `applyPipeline.ts` (constrained acceptance builder+door, scale guards, snapshot exclusions), `constraintStudioStore.ts` (exclusions through preview/apply/undo), `ConstraintStudioSection.tsx` (scale-button guard), `CorrectionPanel.tsx` + `StudioEngineSurface.tsx` (incomplete-recipe honesty), `OverallScoreCard.tsx` (coverage disclosure), `en.ts` (copy), 3 test files (16 new tests).
