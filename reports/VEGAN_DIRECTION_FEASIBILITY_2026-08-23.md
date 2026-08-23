# Vegan Direction — feasibility qualification (2026-08-23)

**Base:** `origin/staging` `0ab80ed6064cfe52eb2be710d1bb456554deecde`
**Verdict:** **VEGAN DIRECTION MUST STAY GATED.** The runtime allowlist is correct;
enabling it today would ship a demonstrably broken feature.
**Runtime change in this pass:** none. The allowlist was enabled only inside a
throwaway probe, measured, and reverted. The tree matches staging exactly.

## 1. The allowlist is not the science gate

`recipeDirectionTargets.ts` gates Direction on two hardcoded allowlists:

```ts
sweetnessOperational = standard_gelato || sorbet(−11/−12/−13) || chocolate_gelato(−11/−12)
softnessOperational  = standard_gelato || sorbet(−11/−12/−13)
```

Vegan is absent → `blocked_runtime`, whose own reason string is precise:
*"Pełna ścieżka −1/0/+1 dla tego profilu i temperatury nie ma jeszcze
zweryfikowanego, bezpiecznego Preview/Apply."* The comment above it states the
contract: *"A POD band alone is not proof that the current formulation route can
honor it."*

## 2. The approved Vegan authority DOES exist

Measured from `spine/temperatureRegulator.ts` (no number invented, none borrowed):

| Temp | POD band | NPAC band | NPAC cleanCenter | Locked reference |
| --- | --- | --- | --- | --- |
| −11 | [13, 25] | [35, 52] | **[40, 47]** | — |
| −12 | [13, 25] | [44, 59] | **[48, 54]** | — |
| −13 | [13, 25] | [50, 64] | **[53.5, 60.0]** | POD 22.08 · NPAC 59.47 |

With the allowlist enabled the plan builds correctly from exactly this authority —
sweetness `working`, softness `working`, bands equal to the approved clean centres.
So the blocker is **operational feasibility**, not missing science.

## 3. Measured feasibility — 150 cells

3 temperatures × 2 modes × 5 sweetness × 5 hardness, every cell driven through the
real `buildCanonicalNewRecipeStarter` → `buildOptimizePreview` path (the same
starter the served app uses). Full data: `reports/VEGAN_DIRECTION_FEASIBILITY_MATRIX.csv`.

| Outcome | Cells |
| --- | --- |
| Preview produced | **55** |
| `missing_prices` | **75** |
| `vegan_profile_constraint` | **15** |
| `already_clean` (truthful already-in-profile) | 3 |
| `unsafe_proposal` | **2** |

**55 / 150.** Enabling the allowlist today would expose 95 broken cells.

## 4. Root causes, classified

### RC-1 — `legacyTargetThird` collapses five levels into three (BLOCKING)

Vegan is not `standard_gelato`, so sweetness falls to the legacy three-zone
branch. Measured collapse at −13 OPTIMAL:

| Sweetness | Delivered POD |
| --- | --- |
| −2 | 20.14 |
| −1 | **20.14** — identical |
| 0 | 20.74 |

−2 and −1 produce the *same* recipe. That is precisely the "three states
collapsing to one candidate" the acceptance standard forbids. Fix: route Vegan
sweetness to `targetFifth(regulator.pod.band, target)` — the same mathematically
implied five-region derivation already approved for `standard_gelato`, applied to
Vegan's own approved POD band. No new number.

### RC-2 — infeasible preference returns `ok:false` instead of NEAREST (BLOCKING)

All 15 `vegan_profile_constraint` cells cluster at **low sweetness × high
hardness** (−2/−1 sweetness with +1/+2 hardness): less sugar → less solids → the
Vegan stabilizer-dosage window / inulin envelope fails closed. The fail-closed
gate is *correct*; refusing to produce any Preview is not. The established
principle (P1-A) is that a preference that cannot be reached must degrade to a
truthful **NEAREST**, never to `ok:false`. Same for the 2 `unsafe_proposal` cells
(−11 OPTIMAL, sweetness +1/+2 × hardness −2).

### RC-3 — ECO needs price authority (NOT a defect)

All 75 ECO cells fail with `missing_prices`: the Vegan starter's OAT DRINK and
REFINED COCONUT OIL carry no reference price in the Mapper. This is the cost
authority behaving truthfully — an unknown price is never treated as free. In the
served app the owner has since supplied prices ("Moja" 5.00 EUR/kg), which is why
served ECO worked at −11 and −13. The harness must therefore supply owner price
overrides the way the served runtime does; no code change is implied.

## 5. Required order of work before the allowlist may be opened

1. Route Vegan sweetness to `targetFifth`; prove five *distinct* delivered POD values per temperature.
2. Degrade infeasible Direction preferences to NEAREST instead of `ok:false` (covers RC-2 and the `unsafe_proposal` cells).
3. Re-run this 150-cell matrix with owner price overrides for ECO.
4. Open the allowlist only when the matrix is 150/150 with monotonic five-level behaviour, or with every shared-NEAREST cell proven against a real feasibility frontier.

Until then Vegan Direction stays `blocked_runtime`, which is the truthful state.
