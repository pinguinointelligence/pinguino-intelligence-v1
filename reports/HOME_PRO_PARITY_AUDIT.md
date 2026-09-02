# HOME ↔ PRO CANONICAL PARITY — LIVING AUDIT
**Opened 2026-09-03 · owner P0 · status: IN PROGRESS — not complete, not READY**

## 0. Headline: this is not a Protein bug, it is two pipelines

Proven by import-graph analysis, both directions:

- **PRO never imports `@/spine` or `@/features/optimization`** — zero files across
  `constraint-studio`, `pro-core`, `pro-workbench`.
- **HOME's Monitor/recalculation never imports `constraint-studio`** — zero files
  across `customer-shell` (35 files) and `pi-monitor` (10 files).

| | PRO | HOME (Monitor / recalc) |
|---|---|---|
| entry point | `constraint-studio/applyPipeline` → `buildOptimizePreview` | `features/optimization/previewOptimization` → `@/spine` |
| target authority | `recipe-direction/recipeDirectionTargets` (POD / NPAC bands) | `spine/evaluateTemperatureRegulator` + `spine/designRecipe` |
| hardness lever | 5-level Direction axis on **NPAC** | 3-step **`texturePreference`**, read out on **`ice_fraction`** |
| sweetness lever | 5-level Direction axis on **POD** | 3-step **`sweetnessPreference`** |

These are two different formulation authorities reached by the same user intent.
**Protein hardness is the first case where they disagree visibly** — PRO blocks it
(`blocked_science`, NPAC), HOME allows it (`isMonitorTuningApproved` → ice authority,
which explicitly accepts the documented milk_gelato fallback).

A third path exists inside HOME itself: `home-creator/ui/HomeRecalculate.tsx` is the
ONLY HOME file that imports `constraintStudioStore`. So HOME currently has **two**
recalculation routes — one canonical (PRO's) and one spine-based.

## 1. Why the existing guard did not catch it

`home-creator/homeArchitectureBoundary.test.ts` (§1 "HOME IS NOT A SECOND
APPLICATION") is real but has two structural gaps:

1. **Name-based.** It fails only on declarations literally named `HomeEngine`,
   `HomeSolver`, `HomeRecipe`, `HomeCrown`, `HomeProductBehavior`,
   `HomeMachineAuthority`, `HomeProductionAuthority`. A divergent authority that
   is not called `Home*` is invisible to it.
2. **Scoped to `src/features/home-creator` only.** The actual divergence lives in
   `src/features/customer-shell` and `src/features/pi-monitor`, which the guard
   never reads.

Replacement guard must be **import-graph based, not name based**: HOME surfaces may
import canonical authorities, but must not reach a *second* formulation pipeline.

## 2. Living parity checklist

Legend — SAME TODAY: ✅ same canonical authority · ❌ divergent · ⏳ not yet audited.

| # | CAPABILITY | HOME PATH | PRO PATH | CANONICAL AUTHORITY | SAME TODAY? | DEFECT | FIX | PARITY PROOF |
|---|---|---|---|---|---|---|---|---|
| 11 | hardness / softness Direction | `PiMonitorSection` → `piMonitorIntent` → `texturePreference` → `spine` (ice_fraction readout) | `ProfileDirectionAxes` → `recipeDirectionTargets` → NPAC band | **none — two authorities** | ❌ | PRO blocks Protein (`blocked_science`); HOME allows it. Opposite verdicts on the same owner-approved-standard-physics basis | extract ONE canonical hardness authority; both surfaces consume it | pending |
| 10 | sweetness Direction | `sweetnessPreference` (3-step) → `spine` | Direction axis on POD (5-level) | **none — two authorities** | ❌ | same split as #11; not yet user-visible because both currently permit Protein | same extraction | pending |
| 18/19 | Preview / Apply | `previewOptimization` → `spine` | `buildOptimizePreview` → `applyPipeline` | **none — two pipelines** | ❌ | entire Preview/Apply contract differs | route HOME through `applyPipeline` | pending |
| 20 | rescue / recovery | `spine/batchRescueRouter`, `batchRescueMultiLeverSolver` | `applyPipeline` rescue paths | **none — two** | ❌ | duplicate rescue algorithms | canonicalise | pending |
| — | HOME internal split | `HomeRecalculate.tsx` → `constraintStudioStore` **vs** `PiMonitorSection` → spine | n/a | n/a | ❌ | HOME has TWO recalculation routes of its own | collapse to the canonical one | pending |
| 1–9, 12–17, 21–30 | product type, machine, temperature, OPTIMAL/ECO, ingredient add/remove/grams/locks, Crown/Main, Multi-Main, batch, stabilizer, ProductBehavior, eligibility, topping/base, hard limits, carrier, manual target, save/reopen, defaults, refusal semantics, profile switching, draft persistence, scores | — | — | — | ⏳ | not yet audited | — | — |

## 3. Confirmed divergence #1 — Protein hardness (detail)

Full forensics in `reports/PROTEIN_HARDNESS_BLOCKED_2026-09-02.md`. Summary:

- PRO's `softnessOperational` never contained `protein_gelato` — verified across
  **all 16 versions** of `recipeDirectionTargets.ts`.
- HOME's `isMonitorTuningApproved` → `hasDirectIceAuthorityAtTemperature` returns
  **true for Protein at −11/−12/−13**, with the hardness axis applicable and banded
  (`[45,54.5] / [46,54] / [46,52]`) — measured.
- HOME maps the lever `decrease → soft`, `increase → firm`
  (`piMonitorIntent.TEXTURE_FOR`), then `TEXTURE_TARGETS` →
  `upper_safe_side / clean_center / lower_safe_side`.
- Measured end-to-end: HOME's recalc runs for Protein exactly as for Gelato
  (`mappedAxes: ["miekkosc_twardosc"]` for both); the starter proposes no change
  only because it already sits in range (`juz_w_zakresie`).

**Per the owner's architecture decision this must NOT be fixed by wiring PRO to the
HOME authority.** The proven hardness mechanism has to be extracted into one
canonical authority consumed by both surfaces. The NPAC scientific statement stays
historically true: Protein NPAC-based hardness remains unsupported; the canonical
authority is the ice-fraction/texture one.

## 4. Still to do (not started)

- Capabilities 1–9, 12–17, 21–30 across Gelato / Sorbet / Vegan / Protein.
- Extraction of the canonical hardness authority + both consumers.
- Parity contract (same draft + same semantic intent ⇒ identical canonical result).
- Import-graph architecture guard replacing the name-based §1 test.
- Four-profile parity matrix, then HOME→PRO→HOME and PRO→HOME→PRO staging proof.

**Neither HOME nor PRO may be marked FINAL/OWNER-READY until this is complete.**
Any HOME checklist item whose proof relied on HOME-specific calculation is reopened.
