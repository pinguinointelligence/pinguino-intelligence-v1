# PINGUINO Intelligence — Temperature Regulator Chocolate Gelato v0.1 FINAL

**Status:** FINAL PINGUINO v0.1 for Chocolate Gelato −11°C / −12°C / −13°C  
**Use this document as the active implementation reference for Chocolate Gelato Temperature Regulator v0.1.**  
**This document is separate from Standard Gelato, Sorbet and Vegan Gelato Temperature Regulator documents.**

This document intentionally uses only generic wording such as **external benchmark data** or **calibration data**. Do not mention external tool/product names in code, documentation, prompts or UI.

---

## 1. Architecture decision

Chocolate Gelato does **not** need a separate Base Engine.

The **Base Engine** stays shared.

Chocolate Gelato needs its own **Temperature Regulator settings**, because chocolate/cocoa changes product tolerance and target interpretation.

Correct architecture:

```text
Base Engine
  shared calculation core
        ↓
Chocolate Designer
  detects chocolate flavor / cocoa / chocolate ingredients
        ↓
Chocolate Optimizer
  chocolate-specific gram corrections if needed
        ↓
Chocolate Gelato Temperature Regulator
  evaluates −11°C / −12°C / −13°C suitability using chocolate-specific bands
```

This is not a new mathematical engine.  
It is the same Base Engine plus chocolate-specific target settings.

---

## 2. Automatic routing

The customer should not need to manually choose a “Chocolate Regulator”.

If the customer asks for chocolate gelato, or if the recipe contains chocolate/cocoa ingredients, the Designer should route the recipe to:

```ts
productType: "gelato",
productProfile: "chocolate_gelato"
```

Examples of routing triggers:

- chocolate flavor intent
- dark chocolate
- milk chocolate
- cocoa powder
- cacao paste
- cocoa mass
- cocoa butter
- chocolate paste
- gianduja / hazelnut chocolate profile

The Temperature Regulator then uses Chocolate Gelato settings instead of Standard Gelato settings.

---

## 3. Why Chocolate Gelato gets its own settings

Chocolate has different behavior from standard dairy gelato because it contributes:

- cocoa solids
- cocoa butter / chocolate fat
- high non-dairy solids
- stronger bitterness
- different perceived sweetness
- different viscosity and body
- different protein-share interpretation

Therefore Chocolate Gelato can need:

- wider POD allowance
- slightly higher/wider NPAC allowance
- chocolate-specific solids/water interpretation
- protein-share handled as advisory/soft gate, not blindly as a hard dairy gate

---

## 4. What stays unchanged

For the same recipe, Base Engine values stay the same regardless of selected profile or temperature panel:

- POD
- PAC
- recipe-level NPAC
- water
- fat
- total solids
- lactose
- lactose sanding
- aerating protein
- protein share in solids
- cost
- estimated ice fraction

The regulator changes the target interpretation, not ingredient chemistry.

---

# 5. Chocolate Gelato −13°C observed reference

## C01 fixed formula

Formula, total 1000 g:

| Ingredient | Amount |
|---|---:|
| milk 3.5% | 520 g |
| cream 30% | 120 g |
| skimmed milk powder | 35 g |
| sucrose | 95 g |
| dextrose | 65 g |
| inulin | 43.1 g |
| dark chocolate 70.5% | 120 g |
| tara gum | 1.9 g |

Observed outputs:

| Metric | Value |
|---|---:|
| POD | 18.43 |
| NPAC | 54.08% |
| Ice fraction | 43.97% |
| Lactose | 4.61% |
| Lactose sanding | 8.41% |
| Fat | 10.37% |
| Aerating protein | 3.09% |
| Protein share in solids | 6.84% |
| Total solids | 45.12% |
| Water | 54.88% |
| Cost | 5.59 €/kg |
| Cost per 80 g | 0.45 € |

Interpretation:

- Chocolate-specific POD tolerance allows higher sweetness than Standard Gelato.
- NPAC is inside the Chocolate Gelato −13°C zone.
- Ice fraction is too low and total solids are very high.
- Protein share in solids is low because chocolate/cocoa solids dilute dairy protein share.
- This formula is useful as a chocolate stress/reference test, but not the best final optimized production anchor.

---

## C01 optimized evidence

Formula observed from optimization behavior:

| Ingredient | Amount |
|---|---:|
| milk 3.5% | 597.9 g |
| cream 30% | 48.5 g |
| skimmed milk powder | 47.2 g |
| sucrose | 59.4 g |
| dextrose | 72.5 g |
| inulin | 41.8 g |
| dark chocolate 70.5% | 130.8 g |
| tara gum | 1.74 g |

Observed outputs:

| Metric | Value |
|---|---:|
| POD | 15.80 |
| NPAC | 49.80% |
| Ice fraction | 46.11% |
| Lactose | 5.37% |
| Lactose sanding | 9.37% |
| Fat | 8.95% |
| Aerating protein | 3.59% |
| Protein share in solids | 8.42% |
| Total solids | 42.62% |
| Water | 57.38% |
| Cost | 5.25 €/kg |
| Cost per 80 g | 0.42 € |

Interpretation:

- useful lower/clean evidence for Chocolate Gelato −13°C
- improved ice fraction and water/solids balance
- lactose sanding slightly above 9
- protein share still below standard dairy target, but more acceptable for chocolate
- treat as optimizer behavior evidence, not final locked formula

---

# 6. Chocolate Gelato shared bands

Chocolate Gelato uses the same dairy composition calculations as Standard Gelato, but with product-specific interpretation.

```ts
const chocolateGelatoSharedBands = {
  pod: [12, 20],
  lactose: [4, 6],
  lactoseSanding: [5, 9],
  fat: [5, 12],
  aeratingProtein: [3, 6],

  // Chocolate/cocoa solids dilute dairy protein share.
  // Use this as a soft/advisory gate, not as a hard fail if the rest of the chocolate structure is good.
  proteinShareInSolids: {
    advisoryBand: [8, 13],
    visibleBenchmarkBand: [9, 13],
    hardMinimum: 7,
  },
};
```

---

# 7. Chocolate Gelato −11°C settings

## Status

```text
Chocolate Gelato −11°C = locked PINGUINO internal v0.1
```

These settings are derived from Standard Gelato temperature logic with chocolate-specific overrides.

```ts
const chocolateGelatoMinus11Settings = {
  productType: "chocolate_gelato",
  servingTemperatureC: -11,
  status: "locked_pinguino_internal_v0_1",

  pod: {
    band: [12, 20],
  },

  npac: {
    band: [34, 45],
    cleanCenter: [40, 42],
    overlapNext: [43, 45],
  },

  iceFraction: {
    band: [45, 54.5],
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
    advisoryBand: [8, 13],
    visibleBenchmarkBand: [9, 13],
    hardMinimum: 7,
  },

  solids: {
    band: [31, 45],
  },

  water: {
    band: [57, 70],
  },
};
```

Interpretation:

- lower NPAC zone than −12°C and −13°C
- chocolate still allows POD up to 20
- if chocolate solids dilute protein share, do not automatically overcorrect with skimmed milk powder if lactose/sanding becomes worse

---

# 8. Chocolate Gelato −12°C settings

## Status

```text
Chocolate Gelato −12°C = locked PINGUINO internal v0.1
```

These settings are derived from Standard Gelato temperature logic with chocolate-specific overrides.

```ts
const chocolateGelatoMinus12Settings = {
  productType: "chocolate_gelato",
  servingTemperatureC: -12,
  status: "locked_pinguino_internal_v0_1",

  pod: {
    band: [12, 20],
  },

  npac: {
    band: [43, 52],
    cleanCenter: [47, 49.5],
    overlapPrevious: [43, 45],
    overlapNext: [49, 52],
  },

  iceFraction: {
    band: [46, 54],
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
    advisoryBand: [8, 13],
    visibleBenchmarkBand: [9, 13],
    hardMinimum: 7,
  },

  solids: {
    band: [31, 45],
  },

  water: {
    band: [56, 70],
  },
};
```

Interpretation:

- middle chocolate target around NPAC 47–49.5
- lower than Chocolate −13°C
- higher/wider than typical Standard Gelato because chocolate bitterness and cocoa solids change product tolerance

---

# 9. Chocolate Gelato −13°C settings

## Status

```text
Chocolate Gelato −13°C = locked PINGUINO v0.1
```

Main observed chocolate setting.

```ts
const chocolateGelatoMinus13Settings = {
  productType: "chocolate_gelato",
  servingTemperatureC: -13,
  status: "locked_pinguino_v0_1",

  pod: {
    band: [12, 20],
    fixedReference: 18.43,
    optimizedEvidence: 15.80,
  },

  npac: {
    band: [49, 57],
    cleanCenter: [49.8, 54.1],
    fixedReference: 54.08,
    lowerEvidence: 49.80,
    overlapPrevious: [49, 52],
  },

  iceFraction: {
    band: [46, 52],
    fixedReference: 43.97,
    optimizedEvidence: 46.11,
  },

  lactose: {
    band: [4, 6],
    fixedReference: 4.61,
    optimizedEvidence: 5.37,
  },

  lactoseSanding: {
    band: [5, 9],
    fixedReference: 8.41,
    optimizedEvidence: 9.37,
  },

  fat: {
    band: [5, 12],
    fixedReference: 10.37,
    optimizedEvidence: 8.95,
  },

  aeratingProtein: {
    band: [3, 6],
    fixedReference: 3.09,
    optimizedEvidence: 3.59,
  },

  proteinShareInSolids: {
    advisoryBand: [8, 13],
    visibleBenchmarkBand: [9, 13],
    hardMinimum: 7,
    fixedReference: 6.84,
    optimizedEvidence: 8.42,
  },

  solids: {
    band: [35, 45],
    fixedReference: 45.12,
    optimizedEvidence: 42.62,
  },

  water: {
    band: [55, 65],
    fixedReference: 54.88,
    optimizedEvidence: 57.38,
  },
};
```

Interpretation:

- Chocolate −13°C tolerates POD up to 20.
- Chocolate −13°C NPAC band is observed around 49–57.
- C01 fixed is high-solids and low-ice-fraction; useful as stress evidence.
- C01 optimized evidence is cleaner structurally but still slightly high in lactose sanding and below ideal protein-share target.
- Protein share must be treated carefully because cocoa/chocolate solids dilute dairy protein share.

---

# 10. Current Chocolate temperature map

```text
Chocolate Gelato −11°C:
  NPAC band: 34–45
  clean center: approx. 40–42
  status: locked PINGUINO internal v0.1

Chocolate Gelato −12°C:
  NPAC band: 43–52
  clean center: approx. 47–49.5
  status: locked PINGUINO internal v0.1

Chocolate Gelato −13°C:
  NPAC band: 49–57
  clean center: approx. 49.8–54.1
  status: locked PINGUINO v0.1
```

Observed / logical overlap zones:

```text
Chocolate −11°C / −12°C:
  approx. NPAC 43–45

Chocolate −12°C / −13°C:
  approx. NPAC 49–52
```

---

# 11. Texture preference mapping

Texture preference moves the target inside the selected temperature range.

It does not override safety gates.

## Chocolate −11°C

```ts
const chocolateMinus11TextureTargets = {
  firm: {
    npacTargetRange: [34, 40],
  },
  medium: {
    npacTargetRange: [40, 42],
  },
  soft: {
    npacTargetRange: [42, 45],
  },
};
```

## Chocolate −12°C

```ts
const chocolateMinus12TextureTargets = {
  firm: {
    npacTargetRange: [43, 47],
  },
  medium: {
    npacTargetRange: [47, 49.5],
  },
  soft: {
    npacTargetRange: [49.5, 52],
  },
};
```

## Chocolate −13°C

```ts
const chocolateMinus13TextureTargets = {
  firm: {
    npacTargetRange: [49, 49.8],
  },
  medium: {
    npacTargetRange: [49.8, 54.1],
  },
  soft: {
    npacTargetRange: [54.1, 57],
  },
};
```

Firm does not mean icy.  
Soft does not mean broken, over-PAC, unstable or outside solids/water gates.

---

# 12. Sweetness preference mapping

Chocolate Gelato sweetness maps to POD.

Chocolate can require a higher POD than Standard Gelato because cocoa bitterness reduces perceived sweetness.

```ts
const chocolateGelatoSweetnessTargets = {
  low: {
    podTargetRange: [12, 15],
  },
  balanced: {
    podTargetRange: [15, 18],
  },
  high: {
    podTargetRange: [18, 20],
  },
};
```

High sweetness must stay inside the safe chocolate target range.

---

# 13. Chocolate correction goals

The Chocolate Gelato Temperature Regulator gives correction goals to the Chocolate Optimizer.

Possible goals:

```ts
type ChocolateCorrectionGoal =
  | "increase_npac"
  | "decrease_npac"
  | "increase_pod"
  | "decrease_pod"
  | "increase_ice_fraction"
  | "decrease_ice_fraction"
  | "increase_solids"
  | "decrease_solids"
  | "increase_water"
  | "decrease_water"
  | "reduce_lactose_sanding"
  | "increase_aerating_protein"
  | "adjust_chocolate_ratio"
  | "adjust_cocoa_fat_balance"
  | "restore_stabilizer";
```

The regulator does not directly change grams.  
The Chocolate Optimizer changes grams.

---

# 14. Chocolate optimizer implications

Chocolate Optimizer differs from Standard Gelato Optimizer because chocolate contributes:

- cocoa solids
- cocoa butter / chocolate fat
- bitterness
- non-dairy solids
- strong flavor body
- lower apparent dairy protein share

Main adjustment levers:

- dark chocolate amount
- cocoa powder / cocoa mass if used
- milk
- cream
- skimmed milk powder
- sucrose
- dextrose
- inulin
- stabilizer

Chocolate Optimizer must not blindly copy Standard Gelato corrections if they damage chocolate quality.

Examples:

- Do not overuse skimmed milk powder just to force protein share if lactose sanding gets worse.
- Do not reduce chocolate too much if the requested product is Chocolate Premium or Chocolate Signature.
- Do not accept very low ice fraction only because NPAC is correct.
- Do not allow water/solids to break just because chocolate flavor is strong.

---

# 15. Acceptance tests

## Test 1 — C01 fixed at Chocolate −13°C

Expected:

- POD and NPAC inside Chocolate −13°C bands
- ice fraction too low
- solids high / water low
- useful as stress test, not final optimized formula

## Test 2 — C01 optimized evidence at Chocolate −13°C

Expected:

- NPAC, ice fraction, fat, solids and water closer to target
- lactose sanding slightly high
- protein share still advisory-low but improved
- useful optimizer evidence

## Test 3 — same formula under Standard Gelato panels

Expected:

- Base Engine outputs remain the same
- Standard Gelato regulator interprets the result differently
- Chocolate Gelato should not be forced through Standard Gelato bands when chocolate profile is detected

## Test 4 — Chocolate routing

Expected:

- if recipe contains chocolate/cocoa or flavor intent is chocolate, Designer sets productProfile = "chocolate_gelato"
- Temperature Regulator uses Chocolate settings
- user does not need to manually select a chocolate regulator

---

# 16. Final active settings summary

```ts
export const chocolateGelatoTemperatureRegulatorV01 = {
  minus11: chocolateGelatoMinus11Settings,
  minus12: chocolateGelatoMinus12Settings,
  minus13: chocolateGelatoMinus13Settings,
};
```

Final status:

```text
Chocolate Gelato −11°C:
  status: locked PINGUINO internal v0.1
  clean center: NPAC approx. 40–42

Chocolate Gelato −12°C:
  status: locked PINGUINO internal v0.1
  clean center: NPAC approx. 47–49.5

Chocolate Gelato −13°C:
  status: locked PINGUINO v0.1
  clean center: NPAC approx. 49.8–54.1
  observed fixed reference: C01 fixed
  optimized evidence: C01 optimized
```

---

# 17. Do not generalize yet

This document applies only to:

```text
Chocolate Gelato
−11°C / −12°C / −13°C
```

Do not use this document for:

- Standard Gelato
- Sorbet
- Vegan Gelato
- Protein Gelato
- Granita
- −14°C / −15°C / −18°C

Those require separate calibration.

---

# 18. Final one-sentence rule

```text
Base Engine stays shared.
Chocolate Gelato uses the shared Base Engine for calculations, but needs its own Designer, Optimizer and Temperature Regulator settings so all chocolate-specific target bands are centralized.
Do not force Chocolate Gelato through Standard Gelato target bands.
```
