# PINGUINO Intelligence — Regulator Temperatury Standard Gelato v0.1 FINAL

**Status:** FINAL v0.1 for Standard Gelato −11°C / −12°C / −13°C  
**Use this document as the single active implementation reference.**  
**Older temporary calibration notes and draft documents can be archived or deleted.**

This document intentionally uses only generic wording such as **external benchmark data** or **calibration data**. Do not mention external tool/product names in code, documentation, prompts or UI.

---

## 1. What this module is

The module name is:

# Regulator Temperatury

English technical name:

# Temperature Regulator

The Regulator Temperatury is not a separate recipe engine.  
It is a layer on top of the existing Base Gelato Engine.

Correct architecture:

```text
Base Gelato Engine
  calculates recipe chemistry and technical metrics
        ↓
Regulator Temperatury
  evaluates the Base Engine result for selected serving temperature
        ↓
temperature result:
  too hard / correct / too soft
  warnings
  score
  correction/optimizer goals
```

---

## 2. What stays unchanged

The Base Gelato Engine remains unchanged.

For the same recipe, these values must stay the same regardless of whether the selected serving temperature is −11°C, −12°C or −13°C:

- water
- fat
- MSNF / dairy solids
- total solids
- sugar breakdown
- POD
- PAC
- recipe-level NPAC
- estimated ice fraction
- lactose
- lactose sanding
- aerating protein
- protein share in solids
- cost
- allergens

Temperature does not change ingredient chemistry.

---

## 3. What the Regulator Temperatury changes

The Regulator Temperatury changes only the interpretation of the Base Engine result.

It changes:

- target bands
- clean center zones
- too hard / correct / too soft status
- scoring
- severity
- correction goals
- optimizer target direction

It does not change:

- ingredient PAC values
- ingredient POD values
- ingredient composition
- base recipe calculations
- ingredient database values

---

## 4. Mental model

```text
−11°C = Base Gelato Engine + Regulator settings −11°C
−12°C = Base Gelato Engine + Regulator settings −12°C
−13°C = Base Gelato Engine + Regulator settings −13°C
```

For −11°C, temperature delta is zero because the current Base Gelato Engine is already calibrated for −11°C.

```text
−11°C = zero delta / base reference
```

For −12°C and −13°C, do not multiply all recipe values by one magic factor.  
Instead, use different temperature settings inside the same Regulator Temperatury.

---

## 5. Implementation function

Suggested function:

```ts
function evaluateWithTemperatureRegulator(
  baseResult: RecipeResult,
  settings: StandardGelatoTemperatureSettings
): TemperatureRegulatorResult
```

Suggested usage:

```ts
const baseResult = calculateRecipe(recipeInput);

const temperatureResult = evaluateWithTemperatureRegulator(
  baseResult,
  standardGelatoTemperatureSettings.minus12
);
```

---

## 6. Shared standard Gelato safety bands

Unless a specific temperature overrides a value, Standard Gelato uses these core technical gates:

```ts
const standardGelatoSharedBands = {
  pod: [12, 17],
  lactose: [4, 6],
  lactoseSanding: [5, 9],
  fat: [5, 12],
  aeratingProtein: [3, 6],
  proteinShareInSolids: [9, 13],
};
```

Important: NPAC is not enough.  
A recipe can hit NPAC and still fail because of lactose, sanding, ice fraction, low protein, weak solids, excess water or missing stabilizer.

---

# 7. Regulator settings −11°C

## Status

```text
−11°C = base reference / zero delta / current validated base
```

The existing Base Gelato Engine is treated as the −11°C reference state.

## −11°C target settings

```ts
const standardGelatoMinus11Settings = {
  productType: "standard_gelato",
  servingTemperatureC: -11,
  status: "locked_base_reference_zero_delta",

  npac: {
    band: [33, 43],
    cleanCenter: [39, 41],
    overlapNext: [42, 43],
  },

  iceFraction: {
    band: [45, 54.5],
  },

  pod: {
    band: [12, 17],
  },

  lactose: {
    band: [4, 6],
  },

  lactoseSanding: {
    band: [5, 9],
  },

  fat: {
    band: [5, 12],
  },

  aeratingProtein: {
    band: [3, 6],
  },

  proteinShareInSolids: {
    band: [9, 13],
  },

  solids: {
    band: [31, 45],
  },

  water: {
    band: [57, 70],
  },
};
```

## −11°C validation anchor

Use this only to confirm that the current base behavior stays stable.

### G12 — Clean −11°C validation anchor

Formula, total 1000 g:

| Ingredient | Amount |
|---|---:|
| milk 3.5% | 610 g |
| cream 30% | 135 g |
| skimmed milk powder | 45 g |
| sucrose | 115 g |
| dextrose | 40 g |
| inulin | 53.1 g |
| tara gum | 1.9 g |

Expected outputs:

| Metric | Value |
|---|---:|
| POD | 15.65 |
| NPAC | 39.59% |
| Ice fraction | 51.09% |
| Lactose | 5.59% |
| Lactose sanding | 8.77% |
| Fat | 6.22% |
| Aerating protein | 3.75% |
| Protein share in solids | 10.34% |
| Total solids | 36.23% |
| Water | 63.77% |
| Cost | 6.80 €/kg |
| Cost per 80 g | 0.54 € |

Interpretation:

- correct for −11°C
- too hard for −12°C
- far too hard for −13°C

---

# 8. Regulator settings −12°C

## Status

```text
−12°C = locked v0.1
```

Main locked reference:

```text
G17
```

## −12°C target settings

```ts
const standardGelatoMinus12Settings = {
  productType: "standard_gelato",
  servingTemperatureC: -12,
  status: "locked_v0_1",

  npac: {
    band: [42, 50],
    cleanCenter: [45.0, 46.2],
    lockedReference: 46.18,
    lowerCleanAnchor: 44.98,
    overlapPrevious: [42, 43],
    overlapNext: [48, 50],
  },

  iceFraction: {
    band: [46, 54],
    lockedReference: 50.34,
  },

  pod: {
    band: [12, 17],
    lockedReference: 15.57,
  },

  lactose: {
    band: [4, 6],
    lockedReference: 5.44,
  },

  lactoseSanding: {
    band: [5, 9],
    lockedReference: 8.62,
  },

  fat: {
    band: [5, 12],
    lockedReference: 6.19,
  },

  aeratingProtein: {
    band: [3, 6],
    lockedReference: 3.65,
  },

  proteinShareInSolids: {
    band: [9, 13],
    lockedReference: 9.90,
  },

  solids: {
    band: [31, 44],
    lockedReference: 36.82,
  },

  water: {
    band: [56, 70],
    lockedReference: 63.18,
  },
};
```

## −12°C final locked reference

### G17 — Final Clean Reference for Standard Gelato −12°C

Formula, total 1000 g:

| Ingredient | Amount |
|---|---:|
| milk 3.5% | 600 g |
| cream 30% | 135 g |
| skimmed milk powder | 43 g |
| sucrose | 86 g |
| dextrose | 80 g |
| inulin | 54.1 g |
| tara gum | 1.9 g |

Expected outputs:

| Metric | Value |
|---|---:|
| POD | 15.57 |
| NPAC | 46.18% |
| Ice fraction | 50.34% |
| Lactose | 5.44% |
| Lactose sanding | 8.62% |
| Fat | 6.19% |
| Aerating protein | 3.65% |
| Protein share in solids | 9.90% |
| Total solids | 36.82% |
| Water | 63.18% |
| Cost | 6.86 €/kg |
| Cost per 80 g | 0.55 € |

Interpretation:

- locked clean reference for −12°C
- too soft for −11°C
- too hard for −13°C

## −12°C secondary anchor

### G15 — Lower clean −12°C anchor

G15 is retained as the lower / firmer clean −12°C anchor.

| Metric | Value |
|---|---:|
| NPAC | 44.98% |
| Ice fraction | 50.35% |
| POD | 15.62 |
| Lactose | 5.44% |
| Lactose sanding | 8.63% |
| Fat | 6.19% |
| Aerating protein | 3.65% |
| Protein share in solids | 9.89% |
| Total solids | 36.88% |
| Water | 63.12% |

Use G15 to confirm the lower side of the clean −12°C zone.

---

# 9. Regulator settings −13°C

## Status

```text
−13°C = locked v0.1
```

Main locked reference:

```text
G18
```

Lower clean anchor:

```text
G11
```

## −13°C target settings

```ts
const standardGelatoMinus13Settings = {
  productType: "standard_gelato",
  servingTemperatureC: -13,
  status: "locked_v0_1",

  npac: {
    band: [48, 55],
    cleanCenter: [51.5, 53.2],
    lockedReference: 53.15,
    lowerCleanAnchor: 51.77,
    overlapPrevious: [48, 50],
  },

  iceFraction: {
    band: [46, 52],
    lockedReference: 49.69,
  },

  pod: {
    band: [12, 17],
    lockedReference: 16.37,
  },

  lactose: {
    band: [4, 6],
    lockedReference: 5.51,
  },

  lactoseSanding: {
    band: [5, 9],
    lockedReference: 8.78,
  },

  fat: {
    band: [5, 12],
    lockedReference: 5.89,
  },

  aeratingProtein: {
    band: [3, 6],
    lockedReference: 3.69,
  },

  proteinShareInSolids: {
    band: [9, 13],
    lockedReference: 9.93,
  },

  solids: {
    band: [35, 45],
    lockedReference: 37.22,
  },

  water: {
    band: [55, 65],
    lockedReference: 62.78,
  },
};
```

## −13°C final locked reference

### G18 — Final Clean Reference for Standard Gelato −13°C

Formula, total 1000 g:

| Ingredient | Amount |
|---|---:|
| milk 3.5% | 600 g |
| cream 30% | 125 g |
| skimmed milk powder | 45 g |
| sucrose | 72 g |
| dextrose | 112 g |
| inulin | 44.1 g |
| tara gum | 1.9 g |

Expected outputs:

| Metric | Value |
|---|---:|
| POD | 16.37 |
| NPAC | 53.15% |
| Ice fraction | 49.69% |
| Lactose | 5.51% |
| Lactose sanding | 8.78% |
| Fat | 5.89% |
| Aerating protein | 3.69% |
| Protein share in solids | 9.93% |
| Total solids | 37.22% |
| Water | 62.78% |
| Cost | 5.81 €/kg |
| Cost per 80 g | 0.46 € |

Interpretation:

- locked clean reference for −13°C
- too soft for −12°C
- far too soft for −11°C

## −13°C secondary anchor

### G11 — Lower clean −13°C anchor

G11 is retained as the lower / firmer clean −13°C anchor.

| Metric | Value |
|---|---:|
| POD | 16.21 |
| NPAC | 51.77% |
| Ice fraction | 49.73% |
| Lactose | 5.51% |
| Lactose sanding | 8.79% |
| Fat | 5.89% |
| Aerating protein | 3.69% |
| Protein share in solids | 9.91% |
| Total solids | 37.26% |
| Water | 62.74% |
| Cost | 6.21 €/kg |
| Cost per 80 g | 0.50 € |

Use G11 to confirm the lower side of the clean −13°C zone.

---

# 10. Texture preference mapping

Texture preference moves the target inside the selected temperature range.

It does not override safety gates.

## −12°C example

```ts
const standardGelatoMinus12TextureTargets = {
  firm: {
    npacTargetRange: [42.5, 45.0],
  },
  medium: {
    npacTargetRange: [45.0, 46.2],
    preferredReference: 46.18,
  },
  soft: {
    npacTargetRange: [46.2, 48.0],
  },
};
```

## −13°C example

```ts
const standardGelatoMinus13TextureTargets = {
  firm: {
    npacTargetRange: [48.0, 51.5],
  },
  medium: {
    npacTargetRange: [51.5, 53.2],
    preferredReference: 53.15,
  },
  soft: {
    npacTargetRange: [53.2, 55.0],
  },
};
```

Firm does not mean icy.  
Soft does not mean broken, over-PAC or unstable.

---

# 11. Sweetness preference mapping

Sweetness preference maps to POD, not directly to temperature.

```ts
const standardGelatoSweetnessTargets = {
  low: {
    podTargetRange: [12.0, 14.0],
  },
  balanced: {
    podTargetRange: [14.0, 16.0],
    preferredCenter: 15.5,
  },
  high: {
    podTargetRange: [16.0, 17.0],
  },
};
```

High sweetness must stay inside the safe target range.  
Do not allow the optimizer to push POD to 18–20 just because the user selected high sweetness.

---

# 12. Regulator result model

Suggested output:

```ts
export interface TemperatureRegulatorResult {
  productType: "standard_gelato";
  servingTemperatureC: -11 | -12 | -13;

  status:
    | "too_hard"
    | "firm_side_acceptable"
    | "optimal"
    | "soft_side_acceptable"
    | "too_soft"
    | "invalid";

  npacStatus:
    | "below_band"
    | "firm_side"
    | "clean_center"
    | "soft_side"
    | "above_band";

  warnings: string[];
  correctionGoals: CorrectionGoal[];
  score: number;
}
```

---

# 13. Correction goals generated by Regulator Temperatury

The Regulator does not change grams directly.  
It gives correction goals to the Optimizer.

Examples:

```ts
type CorrectionGoal =
  | "increase_npac"
  | "decrease_npac"
  | "reduce_lactose_sanding"
  | "increase_solids"
  | "decrease_solids"
  | "increase_aerating_protein"
  | "reduce_pod"
  | "increase_pod"
  | "restore_stabilizer";
```

The Optimizer then decides which ingredient grams to adjust.

---

# 14. Hard rules

The Regulator and Optimizer must not accept a recipe as good if:

- NPAC is correct but lactose sanding is too high
- NPAC is correct but ice fraction is outside target
- NPAC is correct but protein is too low
- NPAC is correct but solids/water are broken
- stabilizer is 0 g for Standard Gelato
- POD is outside safe range
- ingredient grams become negative
- the recipe only fits one metric and fails the rest

---

# 15. Acceptance tests

## Test 1 — G12 at −11°C

Expected:

- should pass −11°C
- should be too hard for −12°C
- should be far too hard for −13°C

## Test 2 — G17 at −12°C

Expected:

- should pass −12°C as locked clean reference
- should be too soft for −11°C
- should be too hard for −13°C

## Test 3 — G18 at −13°C

Expected:

- should pass −13°C as locked clean reference
- should be too soft for −12°C
- should be far too soft for −11°C

## Test 4 — same formula across temperatures

Expected:

- Base Engine output values remain unchanged
- Regulator status changes according to selected temperature

## Test 5 — stabilizer 0 g

Expected:

- must not be accepted as final Standard Gelato recommendation
- Regulator/Optimizer must generate `restore_stabilizer`

---

# 16. Final active settings summary

```ts
export const standardGelatoTemperatureRegulatorV01 = {
  minus11: standardGelatoMinus11Settings,
  minus12: standardGelatoMinus12Settings,
  minus13: standardGelatoMinus13Settings,
};
```

Final status:

```text
−11°C:
  status: locked base reference / zero delta
  clean center: NPAC approx. 39–41
  validation anchor: G12

−12°C:
  status: locked v0.1
  clean center: NPAC approx. 45.0–46.2
  final reference: G17
  lower anchor: G15

−13°C:
  status: locked v0.1
  clean center: NPAC approx. 51.5–53.2
  final reference: G18
  lower anchor: G11
```

---

# 17. Do not generalize yet

This document applies only to:

```text
Standard Gelato
−11°C / −12°C / −13°C
```

Do not assume the same settings for:

- Chocolate Gelato
- Sorbet
- Vegan Gelato
- Protein Gelato
- Granita
- −14°C / −15°C / −18°C

Those require separate calibration.

---

# 18. Final one-sentence rule

```text
Base Gelato Engine calculates the recipe.
Regulator Temperatury evaluates the same Base Engine result against −11°C, −12°C or −13°C settings.
Temperature changes target evaluation and correction goals, not ingredient chemistry.
```
