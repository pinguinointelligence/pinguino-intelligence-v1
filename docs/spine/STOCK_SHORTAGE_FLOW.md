# Stock Shortage — IF10 decision branch

_Created 2026-07-09 (Spine Slice 18). Companion to [PINGUINO_SPINE.md](../PINGUINO_SPINE.md) and the
sibling [BATCH_RESCUE_FLOW.md](BATCH_RESCUE_FLOW.md) (IF9); grounded in the locked
[Integration_Flow.md](../pinguino-spine/Integration_Flow.md) §18 and
[Optimizer.md](../pinguino-spine/Optimizer.md) §7A.1._

**Status: pure, unwired v0.1.** `src/spine/stockShortageRouter.ts` (`routeStockShortage`) is a
standalone spine module — not wired into the Integration Flow router, the engine, inventory, or any
UI. No DB, no inventory write, no Mapper, no persistence, no recipe mutation, **no exact grams**.

## 1. Relation to IF9

IF9 (batch rescue) starts from a PRODUCED physical mass with an observed problem — its rules are
add-only and physical-state-gated. IF10 starts EARLIER: production is still planned, but one or more
required ingredients are unavailable or insufficient. Nothing physical constrains the options yet,
so the strategies are recipe-level (substitute / scale / purchase / reformulate) — and, like IF9,
the branch is an explicit USER-decision point (locked §18): the router recommends, the user chooses.

## 2. Exact inputs (`StockShortageIntent`)

| Input | Required | Notes |
|---|---|---|
| `productProfile` | yes | unsupported → `not_supported`, never remapped |
| `observation.shortages[]` | yes (≥1) | empty → `blocked_missing_data` |
| per line: `requiredG` + `availableG` | **yes** | null/invalid → `blocked_missing_data` (`missing_stock_quantity`) — missing stock is never invented |
| per line: `isHero` | optional | hero shortage always warned — never silently reduced |
| per line: `substitute` | optional | all safety properties are CALLER-ASSERTED (verified data, family, dairy/allergen/alcohol/sweetener flags) |
| `constraints` | yes | `canScaleBatchDown` / `canReformulate` / `purchaseOrWaitPossible` + the explicit approval flags |
| `batchSizeG`, `minAcceptableBatchG` | optional | bound the scale-down check; unknown bounds are flagged, not guessed |
| `qualityTier`, `recipeSnapshot` | optional | echoed untouched / opaque trace flag only |

## 3. Decision table (fixed strategy precedence)

`substitution → scale-down → purchase/wait → reformulation → production_blocked`
(substitution is safest for the recipe truth; scaling keeps composition percentages; purchase keeps
the recipe unchanged; reformulation changes the recipe — last resort).

| Decision | When | Action (gram-free) |
|---|---|---|
| `substitution_possible` | EVERY short line has an available, VERIFIED, profile-allowed, explicitly-approved substitute | `use_substitute` per line + required recalculation |
| `scale_down_possible` | scaling allowed, every short line has stock > 0, scaled batch ≥ minimum | `scale_batch_down` with the limiting **ratio** (dimensionless — uniform scaling keeps every percentage/band unchanged) |
| `purchase_required` | neither above; buying/waiting possible | `purchase_or_wait` (recipe unchanged) |
| `reformulation_required` | purchase impossible; reformulation allowed | `reformulate_recipe` (Designer owns strategy; full re-evaluation required) |
| `production_blocked` | nothing feasible today | menu limited to `keep_batch_and_mark_missing` / `stop_and_buy_missing_product`, with the reason |
| `blocked_missing_data` | no observation / missing quantities | measurement requirements returned |
| `not_supported` | unknown profile, or the observation contains no actual shortage | never remapped |

Mixed shortages (one line substitutable, another not) are NOT combined in v0.1 — the router warns
`mixed_shortage_strategies_not_combined_v01` and falls through the precedence honestly.

## 4. Substitution safety rules (never silent — locked §18)

1. Replacement requires **verified ingredient data** (locked acceptance 28) — `hasVerifiedIngredientData`
   is a caller assertion; the router never reads any catalog and never treats Mapper products as
   calibrated references.
2. **Dairy into sorbet/vegan is a hard block** (`dairy_substitute_forbidden_for_profile`) — detected
   via `isDairy` or a dairy correction family; NO approval flag can override it.
3. Allergen-carrying substitutes require `allergenSubstitutionApproved: true`.
4. Alcohol-carrying substitutes require `alcoholSubstitutionApproved: true`.
5. Sweetener/polyol/HIS substitutes require `sweetenerSubstitutionRuleApproved: true` (no supported
   rule exists yet — the flag is the future hook).
6. The substitute's correction family must be in the profile's `allowedCorrectionFamilies`; an
   unknown or unlisted family (including junk strings) is blocked, never remapped; a missing family
   is blocked as unverifiable (the Designer cannot judge strategy fit without it).
7. Every block reason is surfaced in `warnings` + the per-line trace — the user sees WHY
   substitution was not offered.

## 5. Scaling rules & why this slice is gram-free

Uniform batch scaling by the limiting line's `availableG / requiredG` ratio keeps every composition
percentage — and therefore every engine metric and band verdict — mathematically unchanged, so the
RATIO is safe to emit. Grams are not: machine minimums, rounding, and the §18 user decision all sit
between the ratio and a runnable recipe. So the action carries `scaleFactor` (0–1, dimensionless)
plus the required next calculation `recompute_scaled_recipe_and_verify_machine_minimums`. No action
has a gram field (test-enforced), and nothing here can fake a recalculated recipe. Exact
recalculation is later wiring: the Designer/engine rerun after the user picks a menu option.

## 6. The locked user-decision menu

`StockShortageUserDecision` is verbatim the locked union (Integration_Flow.md §18 = Optimizer.md
§7A.1, where it is named `StockShortageDecision`): `reduce_batch_to_available_stock` ·
`replace_ingredient` · `keep_batch_and_mark_missing` · `best_possible_lower_intensity` ·
`stop_and_buy_missing_product`. The router's own feasibility union is deliberately named
`StockShortageRouteDecision` so the locked doc name is never repurposed (the IF9 sibling follows the
same convention: doc `ActualBatchRescueDecision` ↔ code `ActualBatchRescueUserDecision`). Every feasible decision offers the
full five-option menu (the user always chooses; the router never executes); `production_blocked`
limits it to the honest remaining choices with `menuLimitedReason`; hard blocks offer none.

## 7. Capability / redaction

The result carries `capabilityGate: 'canUseStockShortageWorkflow'` — the existing spine capability
(demo: **false**, paid: **true**) that UI wiring must gate on. The output is structurally gram-free,
so the same result is redaction-safe for every tier; when exact recalculation lands, the existing
optimization display policy pattern applies to it.

## 8. What remains before production use

1. ~~Exact recalculation for scale-down~~ — **Slice 19**: the deterministic limiting-ratio scale is
   previewed exactly and engine-verified (`scaleVerified`); substitution recalculation still needs a
   verified-composition substitute contract (honestly `not_attempted` until then); reformulation
   stays with the Designer (see [BRANCH_RECALCULATION_PREVIEW.md](BRANCH_RECALCULATION_PREVIEW.md)).
2. ~~Integration Flow wiring~~ — **Slice 19** adds `dispatchIntegrationFlow` (`stock_shortage`
   context → IF10); the engine `stock_shortage` warning → context auto-detection is UI wiring,
   still pending.
3. Inventory/stock data source (deliberately absent — v0.1 takes caller-supplied observations; no
   inventory is ever read or written by the spine).
4. Studio UI (paid-gated via `canUseStockShortageWorkflow`) with the §18 menu.
5. DEV fixtures page — landed in Slice 19 as `/dev/branch-recalculation-preview` (shared with IF9).
