# PINGUINO Intelligence — Temperature Regulator Sorbet v0.1 FINAL

**Status:** FINAL v0.1 for Sorbet −11°C / −12°C / −13°C  
**Use this document as the active implementation reference for Sorbet Temperature Regulator v0.1.**  
**This document is separate from Standard Gelato Temperature Regulator v0.1.**

This document intentionally uses only generic wording such as **external benchmark data** or **calibration data**. Do not mention external tool/product names in code, documentation, prompts or UI.

---

## 1. Architecture decision

The **Base Engine** stays shared for all product types.

The Base Engine should calculate general recipe metrics:

- POD
- PAC
- recipe-level NPAC
- water
- total solids
- estimated ice fraction
- cost
- ingredient composition
- stabilizer amount

Sorbet does **not** require a completely separate calculation core from zero.

However, Sorbet requires its own:

- Product Profile
- Designer
- Optimizer / Correction Solver
- Temperature Regulator settings

Correct architecture:

```text
Base Engine
  shared calculation core
        ↓
Sorbet Designer
  fruit/product strategy and ingredient intent
        ↓
Sorbet Optimizer
  sorbet-specific gram corrections
        ↓
Sorbet Temperature Regulator
  evaluates −11°C / −12°C / −13°C suitability
```

Do not reuse Standard Gelato dairy gates for Sorbet.

---

## 2. Why Sorbet is separate from Standard Gelato

Sorbet has different product gates.

Sorbet does not use Standard Gelato dairy metrics:

- no dairy fat gate
- no aerating dairy protein gate
- no protein share in dairy solids gate
- no lactose gate
- no lactose sanding gate
- no MSNF logic as a required dairy structure gate

Sorbet uses:

- POD
- NPAC
- ice fraction
- total solids
- water
- stabilizer presence / stabilizer policy
- fruit/water/sugar balance

Therefore:

```text
Same Base Engine core: yes
Same Standard Gelato regulator: no
Separate Sorbet Temperature Regulator: yes
```

---

## 3. Sorbet shared target gates

Current observed sorbet target gates from calibration data:

```ts
const sorbetSharedBands = {
  pod: [15, 25],
  solids: [25, 33],
};
```

Water and ice fraction vary slightly by temperature and should be stored in each temperature setting.

---

# 4. Sorbet −11°C settings

## Status

```text
Sorbet −11°C = locked v0.1
```

Main locked reference:

```text
S01
```

## −11°C target settings

```ts
const sorbetMinus11Settings = {
  productType: "sorbet",
  servingTemperatureC: -11,
  status: "locked_v0_1",

  pod: {
    band: [15, 25],
    lockedReference: 19.16,
  },

  npac: {
    band: [35, 40],
    cleanCenter: [37, 38],
    lockedReference: 37.71,
    overlapNext: [39, 40],
  },

  iceFraction: {
    band: [51, 59],
    lockedReference: 57.43,
  },

  solids: {
    band: [25, 33],
    lockedReference: 27.85,
  },

  water: {
    band: [67, 75],
    lockedReference: 72.15,
  },
};
```

## S01 — Final Clean Reference for Sorbet −11°C

Formula, total 1000 g:

| Ingredient | Amount |
|---|---:|
| sucrose | 103.8 g |
| dextrose | 59 g |
| inulin | 55.4 g |
| tara gum | 0.8 g |
| water | 181 g |
| strawberries | 600 g |

Expected outputs:

| Metric | Value |
|---|---:|
| POD | 19.16 |
| NPAC | 37.71% |
| Ice fraction | 57.43% |
| Total solids | 27.85% |
| Water | 72.15% |
| Cost | 8.19 €/kg |
| Cost per 80 g | 0.66 € |

Interpretation:

- correct for Sorbet −11°C
- too hard / low NPAC for Sorbet −12°C
- far too hard / low NPAC for Sorbet −13°C

---

# 5. Sorbet −12°C settings

## Status

```text
Sorbet −12°C = locked v0.1
```

Main locked reference:

```text
S02
```

## −12°C target settings

```ts
const sorbetMinus12Settings = {
  productType: "sorbet",
  servingTemperatureC: -12,
  status: "locked_v0_1",

  pod: {
    band: [15, 25],
    lockedReference: 19.97,
  },

  npac: {
    band: [42, 49],
    cleanCenter: [44, 45],
    lockedReference: 44.18,
    overlapPrevious: [39, 40],
    overlapNext: [48, 49],
  },

  iceFraction: {
    band: [51, 59],
    lockedReference: 55.95,
  },

  solids: {
    band: [25, 33],
    lockedReference: 29.29,
  },

  water: {
    band: [67, 73],
    lockedReference: 70.71,
  },
};
```

## S02 — Final Clean Reference for Sorbet −12°C

Formula, total 1000 g:

| Ingredient | Amount |
|---|---:|
| sucrose | 90 g |
| dextrose | 90 g |
| inulin | 55 g |
| tara gum | 0.8 g |
| water | 164.2 g |
| strawberries | 600 g |

Expected outputs:

| Metric | Value |
|---|---:|
| POD | 19.97 |
| NPAC | 44.18% |
| Ice fraction | 55.95% |
| Total solids | 29.29% |
| Water | 70.71% |
| Cost | 8.14 €/kg |
| Cost per 80 g | 0.65 € |

Interpretation:

- too soft / high NPAC for Sorbet −11°C
- correct for Sorbet −12°C
- too hard / low NPAC for Sorbet −13°C

---

# 6. Sorbet −13°C settings

## Status

```text
Sorbet −13°C = locked v0.1
```

Main locked reference:

```text
S03
```

## −13°C target settings

```ts
const sorbetMinus13Settings = {
  productType: "sorbet",
  servingTemperatureC: -13,
  status: "locked_v0_1",

  pod: {
    band: [15, 25],
    lockedReference: 21.21,
  },

  npac: {
    band: [48, 55],
    cleanCenter: [51, 52.5],
    lockedReference: 52.22,
    overlapPrevious: [48, 49],
  },

  iceFraction: {
    band: [50, 58],
    lockedReference: 54.28,
  },

  solids: {
    band: [25, 33],
    lockedReference: 30.82,
  },

  water: {
    band: [67, 73],
    lockedReference: 69.18,
  },
};
```

## S03 — Final Clean Reference for Sorbet −13°C

Formula, total 1000 g:

| Ingredient | Amount |
|---|---:|
| sucrose | 78 g |
| dextrose | 125 g |
| inulin | 50 g |
| tara gum | 0.8 g |
| water | 146.2 g |
| strawberries | 600 g |

Expected outputs:

| Metric | Value |
|---|---:|
| POD | 21.21 |
| NPAC | 52.22% |
| Ice fraction | 54.28% |
| Total solids | 30.82% |
| Water | 69.18% |
| Cost | 7.63 €/kg |
| Cost per 80 g | 0.61 € |

Interpretation:

- far too soft / high NPAC for Sorbet −11°C
- too soft / high NPAC for Sorbet −12°C
- correct for Sorbet −13°C

---

# 7. Mango validation note

A mango validation test was run to check whether the sorbet regulator logic only works for strawberry.

## S04 — Mango validation, not locked reference

Formula tested:

| Ingredient | Amount |
|---|---:|
| sucrose | 90 g |
| dextrose | 90 g |
| inulin | 55 g |
| tara gum | 0.8 g |
| water | 264.2 g |
| 100% mango pulp | 500 g |

Observed outputs:

| Metric | Value |
|---|---:|
| POD | 23.75 |
| NPAC | 52.55% |
| Ice fraction | 51.37% |
| Total solids | 34.51% |
| Water | 65.49% |
| Cost | 6.30 €/kg |
| Cost per 80 g | 0.50 € |

Interpretation:

- mango behaves differently from strawberry because the fruit itself contributes different sugar, solids and water
- the formula is not a clean locked mango reference because total solids are too high and water is too low
- this does not invalidate the Sorbet Temperature Regulator
- it confirms that Sorbet needs product-specific Designer and Optimizer logic per fruit type
- the shared Base Engine can still calculate the values, but the Sorbet Designer/Optimizer must adapt the formula to the fruit

Conclusion:

```text
S01/S02/S03 lock the Sorbet Temperature Regulator v0.1.
S04 confirms that fruit-specific Designer/Optimizer logic is needed.
```

---

# 8. Current sorbet temperature map

```text
Sorbet −11°C:
  NPAC band: 35–40
  clean center: approx. 37–38
  locked reference: S01 / NPAC 37.71

Sorbet −12°C:
  NPAC band: 42–49
  clean center: approx. 44–45
  locked reference: S02 / NPAC 44.18

Sorbet −13°C:
  NPAC band: 48–55
  clean center: approx. 51–52.5
  locked reference: S03 / NPAC 52.22
```

Observed overlap zones:

```text
Sorbet −11°C / −12°C:
  approx. NPAC 39–40

Sorbet −12°C / −13°C:
  approx. NPAC 48–49
```

---

# 9. Texture preference mapping

Texture preference moves the target inside the selected temperature range.

It does not override technical safety gates.

## Sorbet −11°C

```ts
const sorbetMinus11TextureTargets = {
  firm: {
    npacTargetRange: [35, 37],
  },
  medium: {
    npacTargetRange: [37, 38],
    preferredReference: 37.71,
  },
  soft: {
    npacTargetRange: [38, 40],
  },
};
```

## Sorbet −12°C

```ts
const sorbetMinus12TextureTargets = {
  firm: {
    npacTargetRange: [42, 44],
  },
  medium: {
    npacTargetRange: [44, 45],
    preferredReference: 44.18,
  },
  soft: {
    npacTargetRange: [45, 48],
  },
};
```

## Sorbet −13°C

```ts
const sorbetMinus13TextureTargets = {
  firm: {
    npacTargetRange: [48, 51],
  },
  medium: {
    npacTargetRange: [51, 52.5],
    preferredReference: 52.22,
  },
  soft: {
    npacTargetRange: [52.5, 55],
  },
};
```

Firm does not mean icy.  
Soft does not mean over-PAC, unstable or outside solids/water gates.

---

# 10. Sweetness preference mapping

Sorbet sweetness maps to POD.

```ts
const sorbetSweetnessTargets = {
  low: {
    podTargetRange: [15, 18],
  },
  balanced: {
    podTargetRange: [18, 22],
  },
  high: {
    podTargetRange: [22, 25],
  },
};
```

High sweetness must stay inside the safe target range.

---

# 11. Sorbet correction goals

The Sorbet Temperature Regulator gives correction goals to the Sorbet Optimizer.

Possible goals:

```ts
type SorbetCorrectionGoal =
  | "increase_npac"
  | "decrease_npac"
  | "increase_pod"
  | "decrease_pod"
  | "increase_solids"
  | "decrease_solids"
  | "increase_water"
  | "decrease_water"
  | "adjust_fruit_ratio"
  | "restore_stabilizer";
```

The regulator does not directly change grams.  
The Sorbet Optimizer changes grams.

---

# 12. Sorbet optimizer implications

For Sorbet, correction logic differs from Standard Gelato.

Main adjustment levers:

- sucrose
- dextrose
- inulin
- water
- fruit amount
- stabilizer

No dairy corrections should be used.

Do not use:

- milk
- cream
- skimmed milk powder
- dairy fat correction
- dairy protein correction
- lactose correction

Fruit choice matters strongly. Strawberry and mango do not behave the same.

The Sorbet Designer must understand fruit-specific inputs:

- fruit water
- fruit sugar
- fruit solids
- acidity/sensory strength
- puree/pulp/concentrate differences
- whether the product has added sugar

---

# 13. Acceptance tests

## Test 1 — S01 at −11°C

Expected:

- passes Sorbet −11°C
- too hard for −12°C
- far too hard for −13°C

## Test 2 — S02 at −12°C

Expected:

- too soft for −11°C
- passes Sorbet −12°C
- too hard for −13°C

## Test 3 — S03 at −13°C

Expected:

- far too soft for −11°C
- too soft for −12°C
- passes Sorbet −13°C

## Test 4 — same formula across temperatures

Expected:

- Base Engine values remain the same or effectively the same
- Sorbet Temperature Regulator status changes according to selected temperature settings

## Test 5 — Mango validation

Expected:

- Base Engine calculates mango values correctly
- Sorbet Temperature Regulator identifies failures if solids/water are outside gates
- Sorbet Designer/Optimizer should adjust mango formula, not force strawberry ratios onto mango

---

# 14. Final active settings summary

```ts
export const sorbetTemperatureRegulatorV01 = {
  minus11: sorbetMinus11Settings,
  minus12: sorbetMinus12Settings,
  minus13: sorbetMinus13Settings,
};
```

Final status:

```text
Sorbet −11°C:
  status: locked v0.1
  clean center: NPAC approx. 37–38
  final reference: S01

Sorbet −12°C:
  status: locked v0.1
  clean center: NPAC approx. 44–45
  final reference: S02

Sorbet −13°C:
  status: locked v0.1
  clean center: NPAC approx. 51–52.5
  final reference: S03
```

---

# 15. Do not generalize yet

This document applies only to:

```text
Sorbet
−11°C / −12°C / −13°C
```

Do not use this document for:

- Standard Gelato
- Vegan Gelato
- Chocolate Gelato
- Protein Gelato
- Granita
- −14°C / −15°C / −18°C

Those require separate calibration.

---

# 16. Final one-sentence rule

```text
Base Engine stays shared.
Sorbet uses the shared Base Engine for calculations, but needs its own Designer, Optimizer and Temperature Regulator settings.
Do not evaluate Sorbet with Standard Gelato dairy gates.
```
