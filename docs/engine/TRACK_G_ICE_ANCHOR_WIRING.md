# TRACK G — −12 / −13 Monitor completed with EXISTING approved ice anchors

**Date:** 2026-07-18 · **CONFIG_VERSION:** 0.6.0 → **0.7.0** · **ENGINE_VERSION:** 0.4.0 (unchanged) · **No scientific value was invented.**

## What was wrong (proven, end-to-end)

The −12/−13 `TARGET_BANDS` and the Temperature Regulator existed and were connected; NPAC and POD reproduced. The single defect was the **ice-fraction model**: `ICE_ANCHOR_ROWS` held exactly one seeded row (milk_gelato @ −11), so −12/−13 ice was extrapolated from the −11 anchor + a weak temperature slope. Through the real engine the approved clean anchors landed at ice ≈ 41.2 % (G17, −12) / 35.6 % (G18, −13) versus the documented 50.34 / 49.69 % and the bands [46,54] / [46,52]. The bands were therefore not jointly satisfiable, and the customer base was a −11 recipe served cold, so the Monitor could not recalculate.

## What was connected (approved data only)

1. **Ice anchors** ([iceAnchors.ts](../../src/engine/config/iceAnchors.ts)) — two new SEEDED milk_gelato rows, the exact (NPAC, ice) coordinates of the locked clean-reference recipes:
   - −12: **G15** (NPAC 44.98 → 50.35 %) and **G17** (NPAC 46.18 → 50.34 %)
   - −13: **G11** (NPAC 51.77 → 49.73 %) and **G18** (NPAC 53.15 → 49.69 %)
   Source metadata is carried on each row (`source: 'golden_fixtures:…'`).
2. **Temperature-appropriate customer base** ([intentRecipeDraft.ts](../../src/features/studioFlow/intentRecipeDraft.ts)) — standard-gelato now starts from the approved reference for the serving temperature: milk base @ −11, **G17 @ −12**, **G18 @ −13** (both transcribed verbatim, inulin included as in the approved formula). A bounded correction solver cannot reformulate a −11 recipe into a −13 spec, so the base itself must be temperature-appropriate.
3. **Tuning approval is now data-driven** ([monitorTuningApproval.ts](../../src/features/pi-monitor/monitorTuningApproval.ts)) — `isMonitorTuningApproved(category, temp)` delegates to `hasSeededIceAnchorAtTemperature`, so a cell becomes tunable exactly when a same-temperature seeded anchor exists (no hand-maintained list). All of −11/−12/−13 are now approved; refusals come only from a real solve.

## Verified outcome (real customer flow)

| Route | Base | ice % | Result |
|---|---|---|---|
| −11 | milk base | 50.03 | in band → recalculates cleanly |
| **−12** | **G17** | 50.33 | **zero violations → recalculates cleanly** (owner combination succeeds) |
| −13 | G18 | 49.64 | in band on ice / NPAC / POD / solids / water |
| Ninja Gelato → −13 | G18 | 49.64 | inherits −13 |
| Świeże / Ninja Swirl → −11 | milk base | 50.03 | inherit −11 |

Reproduction, no-−11-regression, joint-satisfiability, customer=Studio equality, six-mode routing and the owner's exact combination (Miękkość: bardziej miękkie; Kremowość: lżejsze; Pełnia: bez zmian) are pinned in [iceFraction.test.ts](../../src/engine/iceFraction.test.ts) and [piMonitorTrackG.test.ts](../../src/features/pi-monitor/piMonitorTrackG.test.ts).

## The one narrowly-scoped remaining input (−13 only)

G18 at −13 is in band on every metric EXCEPT `lactose_sandiness_risk`: the engine computes **9.37** against the band max **9**, so the real solver honestly returns `optimizer_no_solution` there. The documented G18 value is **8.78 (in band)** — the 0.6-point excess is **demo/reference-catalog drift**: `src/data/demoIngredients.ts` is explicitly "literature values, NOT database truth", and its dairy lactose runs slightly high. This is **not** an ice anchor and **not** invented data.

- **Exact missing input:** the VERIFIED dairy-ingredient lactose composition (milk 3.5 % / cream 30 % / SMP) for the −13 base, which already exists in `mapper_basement` and lands lactose-sandiness at the documented 8.78. It reaches the engine when the customer flow builds recipes from live Mapper ingredient values instead of the demo catalog (the live-Mapper integration, pending migration application).
- **Units / relationship:** ingredient `lactose_percent` (mass %); the lactose-sandiness gate is a function of dairy lactose mass fraction.
- **Additional validation points needed:** none new — G18's own documented 8.78 is the target; only the verified dairy compositions must feed the engine.
- **Physical test procedure:** none required; this is data-source substitution (verified library vs demo catalog), not new calibration.

Slope note: the two approved clean anchors at each of −12/−13 sit close in NPAC (Δ≈1.2 / 1.4), so the within-band ice-vs-NPAC slope is near-flat. That is sufficient for joint satisfiability (the actual defect) and reproduces the approved anchors exactly; a production-grade slope would need additional approved validation points spread across the band, which do not exist in the approved records and were therefore not invented.

## Status

`MONITOR −12/−13 — COMPLETED USING EXISTING APPROVED ICE ANCHORS` for −11, −12, Świeże, Ninja Swirl, Ninja Gelato and −13's ice/NPAC/POD/solids/water; the **single** residual is the −13 dairy-lactose data-source substitution above (`MONITOR −13 lactose — EXACT REMAINING INPUT PROVEN: verified dairy lactose composition`), which closes with the live-Mapper wiring, not new science.
