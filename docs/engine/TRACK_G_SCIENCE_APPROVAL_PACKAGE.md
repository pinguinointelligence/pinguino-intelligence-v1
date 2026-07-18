# TRACK G — Scientific-Approval Package: −12 °C / −13 °C Monitor Tuning

**Date:** 2026-07-18 · **Status:** awaiting scientific calibration · **No numeric values are proposed in this document that are not already present in approved project records.**

## 1. What already exists (verified, connected, unchanged)

| Artifact | Status | Source |
|---|---|---|
| `TARGET_BANDS` — all 12 profile × temperature cells (milk/chocolate/sorbet/vegan × −11/−12/−13) | **EXIST**, `status: 'seeded'`, transcribed verbatim from the locked Temperature Regulator docs | `src/engine/config/targets.ts` (CONFIG 0.6.0, commit `70fcbd7`) |
| Temperature Regulator registry — all 12 cells | **EXIST** | `src/spine/temperatureRegulator.ts` (commit `50281bb`) |
| Temperature-aware band selection + solver targeting | **CONNECTED** — the solver aims at the recipe's own profile × temperature band (no fallback for the 12 seeded cells) | `selectTargetBand` / `proposeAutoFix`; proven: at −12 the violation raised against the milk base is `npac_low` vs the −12 band [42,50], not the −11 band [33,42] |
| Correction candidates for the relevant violations | **EXIST** (`npac_low: [dextrose, sucrose]`, `ice_fraction_low: [smp, cream_30, milk_3_5, water]`, …) | `src/engine/corrections/candidates.ts:187-193` |
| −11 °C route (temp_minus_11, Świeże, Ninja Swirl) | **WORKS end to end** (customer Monitor = Studio path; verified by `piMonitorTrackG.test.ts`) | canonical chain via `previewOptimization` |

**Conclusion: the −12/−13 correction TARGETS exist and ARE connected.** The blocker is elsewhere — see §2.

## 2. The exact missing scientific dimension

`src/engine/config/iceAnchors.ts` (`ICE_ANCHOR_ROWS`) contains **exactly one seeded anchor row**: `milk_gelato @ −11 °C` (NPAC 33 → 54.5 % ice; NPAC 42 → 45 % ice, verbatim from the locked spec). The file states: *"No anchors are invented for other categories or temperatures; they arrive only via external calibration"* and marks all values as calibration data changeable only via active external reference fixtures + CONFIG_VERSION bump (spec §16–§17).

At −12/−13 the engine estimates ice fraction by extrapolating from the −11 anchors. This **contradicts the approved regulator references**:

| Approved formula (verbatim grams) | Temp | Doc-expected ice % | Engine-computed ice % | Approved ice band | Engine verdict |
|---|---|---|---|---|---|
| **G17** (milk 600 / cream 135 / smp 43 / sucrose 86 / dextrose 80 / inulin 54.1 / tara 1.9) | −12 | 50.34 | **41.21** | [46, 54] | `ice_fraction_low` |
| **G18** (milk 600 / cream 125 / smp 45 / sucrose 72 / dextrose 112 / inulin 44.1 / tara 1.9) | −13 | 49.69 | **35.56** | [46, 52] | `ice_fraction_low` (+ marginal `lactose_sandiness_risk_high`: engine > 9 vs doc 8.78) |

NPAC and POD reproduce closely (engine G17 NPAC 47.49 vs doc 46.18; G18 54.74 vs 53.15 — residual drift is the demo/reference ingredient catalog, itself marked "literature values, NOT database truth").

**Consequence:** under the engine's current ice model, raising NPAC into the −12/−13 band drives ice fraction below its band — the −12/−13 band sets are not jointly satisfiable, so the correction solver honestly returns no solution for ANY base at those temperatures. This is why the customer Monitor refused. It is not missing bands, not routing, not missing candidates, not the customer adapter.

## 3. What is requested from scientific approval

1. **−12 °C and −13 °C ice-fraction anchors** (per category; at minimum `milk_gelato`), in the existing anchor-row shape: `(npac_low, ice_at_npac_low, npac_high, ice_at_npac_high)` — units: NPAC points → ice mass fraction %. *(Alternative: the documented freezing-curve model upgrade.)*
2. Confirmation (or correction) of the **−13 °C lactose-sanding evaluation** given the marginal G18 exceedance.
3. Review of the **demo/reference catalog drift** (≈1.3 NPAC points on G17) — whether the verified ingredient database supersedes it for reference validation.

### Approved data points already on record (for science's use — not proposals)

From the locked regulator transcriptions (`TEMPERATURE_REGULATOR_GOLDEN_FIXTURES`): −12 °C: G17 (NPAC 46.18 → ice 50.34), G15 (44.98 → 50.35); −13 °C: G18 (53.15 → 49.69), G11 (51.77 → 49.73). −11 °C seeded anchors: NPAC 33 → 54.5, NPAC 42 → 45.

## 4. Proposed validation test matrix (once calibration lands)

| Test | Expectation |
|---|---|
| G12 @ −11 through `calculateRecipe` | stays in-band (regression guard — the calibrated base must not move) |
| G17 @ −12, G15-metrics @ −12 | in-band on every seeded gate; ice within tolerance of doc value (tolerance = science's call) |
| G18 @ −13, G11-metrics @ −13 | same |
| Customer Monitor at −12/−13 (standard gelato) | recalculates; `optimizer_no_solution` only on genuinely conflicting wishes |
| Ninja Gelato (→ −13, 700 g) | inherits the −13 route; scale-invariant metrics |
| Solver rescue at −12/−13 | fixing `npac_low` no longer forces `ice_fraction_low` |

## 5. What ships meanwhile (already implemented, no scientific change)

- −12/−13/Ninja-Gelato Monitor tuning is **honestly unavailable** with the owner-approved copy: *"PI może obliczyć recepturę dla tego trybu, ale interaktywne dostrajanie Monitorem nie zostało jeszcze zatwierdzone dla tej temperatury. Receptura nie została zmieniona."* The recipe itself still calculates and displays.
- Structured failure taxonomy (`PiRecalcFailureReason`) — only `optimizer_no_solution` (verified, target-aligned) may present as mathematical infeasibility.
- Unblocking is a one-line availability change (`monitorTuningApproval.ts`) once the anchors land via the sanctioned calibration path.
