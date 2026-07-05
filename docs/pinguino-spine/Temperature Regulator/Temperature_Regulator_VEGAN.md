# PINGUINO Intelligence — Temperature Regulator Vegan Gelato v0.1 FINAL

**Status:** FINAL PINGUINO v0.1 for Vegan Gelato −11°C / −12°C / −13°C  
**Use this document as the active implementation reference for Vegan Gelato Temperature Regulator v0.1.**  
**This document is separate from Standard Gelato Temperature Regulator v0.1 and Sorbet Temperature Regulator v0.1.**

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
- fat
- cost
- ingredient composition
- stabilizer amount

Vegan Gelato does **not** require a completely separate calculation core from zero.

However, Vegan Gelato requires its own:

- Vegan Designer
- Vegan Optimizer / Correction Solver
- Vegan Temperature Regulator settings

Correct architecture:

```text
Base Engine
  shared calculation core
        ↓
Vegan Designer
  vegan product strategy and ingredient rules
        ↓
Vegan Optimizer
  vegan-specific gram corrections
        ↓
Vegan Temperature Regulator
  evaluates −11°C / −12°C / −13°C suitability
```

Do not reuse Standard Gelato dairy gates for Vegan Gelato.

---

## 2. Why Vegan Gelato is separate from Standard Gelato

Vegan Gelato has different product gates.

Vegan Gelato does not use Standard Gelato dairy-only metrics as hard quality gates:

- no lactose gate
- no lactose sanding gate
- no dairy aerating protein gate
- no dairy protein share in solids gate
- no MSNF as required dairy structure gate

Vegan Gelato uses:

- POD
- NPAC
- ice fraction
- fat
- total solids
- water
- stabilizer presence / stabilizer policy
- plant-base structure logic

Therefore:

```text
Same Base Engine core: yes
Same Standard Gelato regulator: no
Separate Vegan Temperature Regulator: yes
```

---

## 3. Important calibration note

External calibration data directly exposed Vegan Gelato at −13°C.

PINGUINO v0.1 uses:

- Vegan −13°C as observed calibration anchor
- Vegan −12°C as locked PINGUINO v0.1 internal setting
- Vegan −11°C as locked PINGUINO v0.1 internal setting

The −11°C and −12°C vegan settings are created from PINGUINO temperature logic using the confirmed shared Base Engine behavior and the temperature deltas already locked for Standard Gelato and Sorbet.

Do not label −11°C or −12°C as externally confirmed.  
Do treat them as PINGUINO locked internal v0.1 settings.

---

## 4. Confirmed Base Engine behavior

The same vegan formula was tested against Vegan Gelato −13°C and Standard Gelato −13°C / −12°C / −11°C panels.

The underlying recipe output values stayed the same:

- POD
- NPAC
- ice fraction
- fat
- solids
- water
- cost

Only target bands and status interpretation changed.

This confirms the architecture:

```text
Base Engine calculates the same recipe values.
Product-specific Temperature Regulator evaluates those values differently.
```

---

## 5. Vegan shared target gates

Current Vegan Gelato v0.1 uses these core technical gates:

```ts
const veganGelatoSharedBands = {
  pod: [13, 25],
  fat: [0, 12],
  solids: [30, 43],
};
```

Water, ice fraction and NPAC vary by selected serving temperature and are stored in each temperature setting.

Dairy-only gates must be disabled for Vegan Gelato.

```ts
const veganDisabledDairyGates = {
  lactose: "disabled",
  lactoseSanding: "disabled",
  aeratingDairyProtein: "disabled",
  dairyProteinShareInSolids: "disabled",
  msnfRequiredGate: "disabled",
};
```

---

# 6. Vegan Gelato −13°C settings

## Status

```text
Vegan Gelato −13°C = locked PINGUINO v0.1
```

Main clean reference:

```text
V02 fixed
```

Medium reference / optimizer behavior evidence:

```text
V02-AUTO
```

## −13°C target settings

```ts
const veganGelatoMinus13Settings = {
  productType: "vegan_gelato",
  servingTemperatureC: -13,
  status: "locked_pinguino_v0_1",

  pod: {
    band: [13, 25],
    lockedReference: 22.08,
    mediumEvidence: 20.58,
  },

  npac: {
    band: [50, 64],
    cleanCenter: [53.5, 60.0],
    lockedReference: 59.47,
    mediumEvidence: 53.75,
  },

  iceFraction: {
    band: [46, 58],
    lockedReference: 51.06,
    mediumEvidence: 51.35,
  },

  fat: {
    band: [0, 12],
    lockedReference: 5.08,
    mediumEvidence: 4.21,
  },

  solids: {
    band: [30, 43],
    lockedReference: 36.24,
    mediumEvidence: 36.17,
  },

  water: {
    band: [50, 67],
    lockedReference: 63.76,
    mediumEvidence: 63.83,
  },

  disabledDairyGates: [
    "lactose",
    "lactose_sanding",
    "aerating_dairy_protein",
    "dairy_protein_share_in_solids",
    "msnf_required_gate"
  ],
};
```

## V02 fixed — Clean Vegan Gelato −13°C reference

Formula, total 1000 g:

| Ingredient | Amount |
|---|---:|
| water | 200 g |
| oat drink | 250 g |
| coconut milk | 250 g |
| sucrose | 95 g |
| dextrose | 150 g |
| inulin | 53.1 g |
| tara gum | 1.9 g |

Expected outputs:

| Metric | Value |
|---|---:|
| POD | 22.08 |
| NPAC | 59.47% |
| Ice fraction | 51.06% |
| Fat | 5.08% |
| Total solids | 36.24% |
| Water | 63.76% |
| Cost | 5.46 €/kg |
| Cost per 80 g | 0.44 € |

Interpretation:

- correct for Vegan Gelato −13°C
- upper / soft-side clean anchor
- good cost compared with the auto-balanced evidence
- no dairy-only gate should fail this recipe

---

## V02-AUTO — medium evidence, not final locked formula

Formula observed from auto-balance behavior:

| Ingredient | Amount |
|---|---:|
| water | 233.2 g |
| oat drink | 253.8 g |
| coconut milk | 204.4 g |
| sucrose | 92.6 g |
| dextrose | 129.8 g |
| inulin | 84.4 g |
| tara gum | 1.94 g |

Outputs:

| Metric | Value |
|---|---:|
| POD | 20.58 |
| NPAC | 53.75% |
| Ice fraction | 51.35% |
| Fat | 4.21% |
| Total solids | 36.17% |
| Water | 63.83% |
| Cost | 8.59 €/kg |
| Cost per 80 g | 0.69 € |

Interpretation:

- useful medium-side evidence for Vegan −13°C
- not the final locked formula because cost is higher due to high inulin
- useful for Vegan Optimizer behavior later

---

# 7. Vegan Gelato −12°C settings

## Status

```text
Vegan Gelato −12°C = locked PINGUINO internal v0.1
```

These settings are derived from PINGUINO temperature logic and are locked for implementation as internal v0.1 settings.

## −12°C target settings

```ts
const veganGelatoMinus12Settings = {
  productType: "vegan_gelato",
  servingTemperatureC: -12,
  status: "locked_pinguino_internal_v0_1",

  pod: {
    band: [13, 25],
  },

  npac: {
    band: [44, 59],
    cleanCenter: [48, 54],
    overlapPrevious: [44, 52],
    overlapNext: [54, 59],
  },

  iceFraction: {
    band: [46, 60],
  },

  fat: {
    band: [0, 12],
  },

  solids: {
    band: [30, 43],
  },

  water: {
    band: [52, 70],
  },

  disabledDairyGates: [
    "lactose",
    "lactose_sanding",
    "aerating_dairy_protein",
    "dairy_protein_share_in_solids",
    "msnf_required_gate"
  ],
};
```

## −12°C interpretation

A vegan formula around NPAC 48–54 should behave as the clean middle area for −12°C.

A formula like V02 fixed with NPAC 59.47 is too soft or at the very upper edge for Vegan −12°C.

The Vegan Optimizer should reduce NPAC for −12°C mainly by lowering high-PAC sugar pressure, while maintaining solids, water and fat inside vegan gates.

---

# 8. Vegan Gelato −11°C settings

## Status

```text
Vegan Gelato −11°C = locked PINGUINO internal v0.1
```

These settings are derived from PINGUINO temperature logic and are locked for implementation as internal v0.1 settings.

## −11°C target settings

```ts
const veganGelatoMinus11Settings = {
  productType: "vegan_gelato",
  servingTemperatureC: -11,
  status: "locked_pinguino_internal_v0_1",

  pod: {
    band: [13, 25],
  },

  npac: {
    band: [35, 52],
    cleanCenter: [40, 47],
    overlapNext: [47, 52],
  },

  iceFraction: {
    band: [45, 61],
  },

  fat: {
    band: [0, 12],
  },

  solids: {
    band: [30, 43],
  },

  water: {
    band: [54, 72],
  },

  disabledDairyGates: [
    "lactose",
    "lactose_sanding",
    "aerating_dairy_protein",
    "dairy_protein_share_in_solids",
    "msnf_required_gate"
  ],
};
```

## −11°C interpretation

A vegan formula around NPAC 40–47 should behave as the clean middle area for −11°C.

V01 had NPAC 32.91 and was too hard / too watery / too low in solids for Vegan Gelato.  
V02 fixed with NPAC 59.47 is too soft for Vegan −11°C.

---

# 9. V01 rejected evidence

V01 was useful because it showed what fails.

Formula, total 1000 g:

| Ingredient | Amount |
|---|---:|
| water | 340 g |
| oat drink | 250 g |
| coconut milk | 200 g |
| sucrose | 90 g |
| dextrose | 75 g |
| inulin | 43.1 g |
| tara gum | 1.9 g |

Outputs:

| Metric | Value |
|---|---:|
| POD | 16.08 |
| NPAC | 32.91% |
| Ice fraction | 59.79% |
| Fat | 4.13% |
| Total solids | 26.74% |
| Water | 73.26% |
| Cost | 4.46 €/kg |
| Cost per 80 g | 0.36 € |

Interpretation:

- too hard / too low NPAC for Vegan −13°C
- too much water
- too low solids
- slightly high ice fraction
- useful as a failure example for Vegan Optimizer

---

# 10. Current Vegan temperature map

```text
Vegan Gelato −11°C:
  NPAC band: 35–52
  clean center: approx. 40–47
  status: locked PINGUINO internal v0.1

Vegan Gelato −12°C:
  NPAC band: 44–59
  clean center: approx. 48–54
  status: locked PINGUINO internal v0.1

Vegan Gelato −13°C:
  NPAC band: 50–64
  clean center: approx. 53.5–60
  main reference: V02 fixed / NPAC 59.47
  medium evidence: V02-AUTO / NPAC 53.75
  status: locked PINGUINO v0.1
```

Observed / logical overlap zones:

```text
Vegan −11°C / −12°C:
  approx. NPAC 44–52

Vegan −12°C / −13°C:
  approx. NPAC 54–59
```

---

# 11. Texture preference mapping

Texture preference moves the target inside the selected temperature range.

It does not override safety gates.

## Vegan −11°C

```ts
const veganMinus11TextureTargets = {
  firm: {
    npacTargetRange: [35, 40],
  },
  medium: {
    npacTargetRange: [40, 47],
  },
  soft: {
    npacTargetRange: [47, 52],
  },
};
```

## Vegan −12°C

```ts
const veganMinus12TextureTargets = {
  firm: {
    npacTargetRange: [44, 48],
  },
  medium: {
    npacTargetRange: [48, 54],
  },
  soft: {
    npacTargetRange: [54, 59],
  },
};
```

## Vegan −13°C

```ts
const veganMinus13TextureTargets = {
  firm: {
    npacTargetRange: [50, 53.5],
  },
  medium: {
    npacTargetRange: [53.5, 57],
    mediumEvidence: 53.75,
  },
  soft: {
    npacTargetRange: [57, 64],
    preferredSoftReference: 59.47,
  },
};
```

Firm does not mean icy.  
Soft does not mean unstable or outside solids/water gates.

---

# 12. Sweetness preference mapping

Vegan Gelato sweetness maps to POD.

```ts
const veganGelatoSweetnessTargets = {
  low: {
    podTargetRange: [13, 17],
  },
  balanced: {
    podTargetRange: [17, 22],
  },
  high: {
    podTargetRange: [22, 25],
  },
};
```

High sweetness must stay inside the safe target range.

---

# 13. Vegan correction goals

The Vegan Temperature Regulator gives correction goals to the Vegan Optimizer.

Possible goals:

```ts
type VeganCorrectionGoal =
  | "increase_npac"
  | "decrease_npac"
  | "increase_pod"
  | "decrease_pod"
  | "increase_solids"
  | "decrease_solids"
  | "increase_water"
  | "decrease_water"
  | "increase_fat"
  | "decrease_fat"
  | "adjust_plant_base_ratio"
  | "restore_stabilizer";
```

The regulator does not directly change grams.  
The Vegan Optimizer changes grams.

---

# 14. Vegan optimizer implications

For Vegan Gelato, correction logic differs from Standard Gelato and Sorbet.

Main adjustment levers:

- water
- oat drink / plant drink
- coconut milk / plant fat source
- sucrose
- dextrose
- inulin
- tara gum
- future: nut pastes, cocoa butter, vegetable fat, plant proteins, fibers

Do not use dairy corrections:

- milk
- cream
- skimmed milk powder
- lactose correction
- dairy protein correction
- MSNF correction

Vegan Designer must understand plant-base strategy:

- oat/rice/almond/soy drink behavior
- coconut milk or coconut cream behavior
- plant fat source
- plant protein source if used
- sugar and PAC strategy
- water and solids balance
- cost impact of inulin/fibers

---

# 15. Acceptance tests

## Test 1 — V02 fixed at Vegan −13°C

Expected:

- passes Vegan −13°C
- upper / soft-side clean result
- no dairy-only gate failures
- stabilizer present

## Test 2 — V02 fixed at Vegan −12°C

Expected:

- same Base Engine output values
- Regulator should classify it as soft-side / upper edge or too soft depending on strictness
- no dairy-only gate failures

## Test 3 — V02 fixed at Vegan −11°C

Expected:

- same Base Engine output values
- Regulator should classify it as too soft
- no dairy-only gate failures

## Test 4 — V01 at Vegan −13°C

Expected:

- fails because NPAC is too low, water is too high and solids are too low
- useful failure test for Vegan Optimizer

## Test 5 — dairy gates disabled

Expected:

- lactose 0 does not fail Vegan Gelato
- lactose sanding 0 does not fail Vegan Gelato
- dairy aerating protein 0 does not fail Vegan Gelato
- dairy protein share 0 does not fail Vegan Gelato

---

# 16. Final active settings summary

```ts
export const veganGelatoTemperatureRegulatorV01 = {
  minus11: veganGelatoMinus11Settings,
  minus12: veganGelatoMinus12Settings,
  minus13: veganGelatoMinus13Settings,
};
```

Final status:

```text
Vegan Gelato −11°C:
  status: locked PINGUINO internal v0.1
  clean center: NPAC approx. 40–47

Vegan Gelato −12°C:
  status: locked PINGUINO internal v0.1
  clean center: NPAC approx. 48–54

Vegan Gelato −13°C:
  status: locked PINGUINO v0.1
  clean center: NPAC approx. 53.5–60
  main reference: V02 fixed
  medium evidence: V02-AUTO
```

---

# 17. Do not generalize yet

This document applies only to:

```text
Vegan Gelato
−11°C / −12°C / −13°C
```

Do not use this document for:

- Standard Gelato
- Sorbet
- Chocolate Gelato
- Protein Gelato
- Granita
- −14°C / −15°C / −18°C

Those require separate calibration.

---

# 18. Final one-sentence rule

```text
Base Engine stays shared.
Vegan Gelato uses the shared Base Engine for calculations, but needs its own Designer, Optimizer and Temperature Regulator settings.
Do not evaluate Vegan Gelato with Standard Gelato dairy gates.
```
