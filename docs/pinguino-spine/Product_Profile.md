# PINGUINO Intelligence — Product Profile Registry v1.0 FINAL

**Status:** LOCKED PRODUCT PROFILE REGISTRY  
**Purpose:** define every supported product profile, its active gates, disabled gates, routing, regulator, designer and optimizer ownership.  
**Audience:** Nicolas / implementation AI / future API layer / internal documentation  
**Rule:** if a profile or gate is not listed here, it is not supported in v1.0.

This document is the second backbone document after:

```text
PINGUINO_Calculation_Source_of_Truth_v1_0_FINAL.md
```

The Calculation Source of Truth defines how PINGUINO calculates.  
This Product Profile Registry defines how PINGUINO chooses which product rules apply.

---

# 1. Master rule

```text
The Base Engine is shared.
Product Profile Registry decides which product gates are active or disabled.
Temperature Regulator uses product-specific settings.
Designer routes the recipe to the correct product profile.
Optimizer corrects grams according to the selected product profile.
```

Product profile logic must not be scattered across UI, AI prompts, optimizer, mapper or random conditionals.

All product-profile ownership starts here.

---

# 2. Supported product profiles v1.0

PINGUINO v1.0 supports exactly four product profiles:

```ts
type ProductProfile =
  | "standard_gelato"
  | "sorbet"
  | "vegan_gelato"
  | "chocolate_gelato";
```

Unsupported in v1.0:

```text
granita
protein_gelato
frozen_drinks
fresh
storage_minus18
```

Unsupported profiles must return a clear unsupported-profile warning.  
Do not silently map unsupported profiles to another supported profile unless explicitly defined in this registry.

---

# 3. Product profile registry table

| Product profile | Designer | Optimizer | Temperature Regulator | Base Engine |
|---|---|---|---|---|
| `standard_gelato` | Gelato Designer | Gelato Optimizer | Standard Gelato Temperature Regulator | shared |
| `sorbet` | Sorbet Designer | Sorbet Optimizer | Sorbet Temperature Regulator | shared |
| `vegan_gelato` | Vegan Designer | Vegan Optimizer | Vegan Gelato Temperature Regulator | shared |
| `chocolate_gelato` | Chocolate Designer | Chocolate Optimizer / Chocolate Gelato rules | Chocolate Gelato Temperature Regulator | shared |

---

# 4. Legacy name normalization

Current repo and old UI may still contain older names.

Normalize them before calculation or optimization.

```ts
const productProfileAliases = {
  gelato: "standard_gelato",
  milk_gelato: "standard_gelato",
  fruit_gelato: "standard_gelato",
  nut_gelato: "standard_gelato",
  alcohol_gelato: "standard_gelato",

  standard_gelato: "standard_gelato",

  sorbet: "sorbet",

  vegan: "vegan_gelato",
  vegan_gelato: "vegan_gelato",

  chocolate: "chocolate_gelato",
  chocolate_gelato: "chocolate_gelato",
};
```

Unsupported:

```ts
const unsupportedProductProfilesV1 = [
  "granita",
  "protein",
  "protein_gelato",
  "fresh",
  "storage_minus18",
];
```

If the input is unsupported:

```ts
{
  status: "unsupported_product_profile",
  warning: "This product profile is outside PINGUINO v1.0 scope."
}
```

---

# 5. Relationship to existing engine categories

The current engine has categories such as:

```text
milk_gelato
fruit_gelato
nut_gelato
chocolate_gelato
alcohol_gelato
sorbet
vegan_gelato
custom
```

These are engine categories, not necessarily final Designer profiles.

In the final v1.0 architecture:

```text
ProductProfile = top-level product behavior
Engine category = lower-level calculation/category compatibility
```

Recommended mapping:

| Existing engine category | ProductProfile |
|---|---|
| `milk_gelato` | `standard_gelato` |
| `fruit_gelato` | `standard_gelato` |
| `nut_gelato` | `standard_gelato` |
| `alcohol_gelato` | `standard_gelato` with alcohol gates |
| `chocolate_gelato` | `chocolate_gelato` |
| `sorbet` | `sorbet` |
| `vegan_gelato` | `vegan_gelato` |
| `custom` | unsupported or manual expert mode, not default v1.0 flow |

---

# 6. Gate levels

Every product profile gate must be classified as one of:

```ts
type GateLevel =
  | "hard"
  | "soft"
  | "advisory"
  | "disabled";
```

Meaning:

## hard

A hard gate must pass for the recipe to be considered technically correct.

## soft

A soft gate matters, but may allow controlled exceptions if other gates are strong and the product profile allows it.

## advisory

Advisory gate is shown as information or warning, but it should not automatically fail the recipe.

## disabled

Disabled gate must not be evaluated for this product profile.

Example:

```text
lactose is hard for standard_gelato
lactose is disabled for sorbet
lactose is disabled for vegan_gelato
protein_share_in_solids is soft/advisory for chocolate_gelato
```

---

# 7. Shared Base Engine metrics

The Base Engine may calculate all of these values for all recipes:

```text
POD
PAC
NPAC
ice fraction
water
total solids
fat
protein
lactose
lactose sanding
cost
nutrition
allergens
warnings
```

But Product Profile Registry decides which values are used as gates.

Calculation does not equal evaluation.

---

# 8. Profile: standard_gelato

## Identity

```ts
const standardGelatoProfile = {
  id: "standard_gelato",
  label: "Standard Gelato",
  designer: "gelato_designer",
  optimizer: "gelato_optimizer",
  temperatureRegulator: "standard_gelato_temperature_regulator",
};
```

## Active gates

| Gate | Level |
|---|---|
| POD | hard |
| NPAC | hard |
| ice fraction | hard |
| water | hard |
| total solids | hard |
| fat | hard |
| lactose | hard |
| lactose sanding | hard |
| aerating protein | hard |
| protein share in solids | hard |
| stabilizer | hard |
| alcohol | hard when alcohol > 0 |

## Disabled gates

None of the dairy gates are disabled.

## Product logic

Standard Gelato includes:

```text
milk gelato
fruit gelato with dairy base
nut gelato
vanilla / fior di latte
alcohol gelato with dairy base
non-chocolate standard gelato
```

Chocolate flavor should route to `chocolate_gelato`, not standard_gelato, when chocolate/cocoa is a major product intent or ingredient.

## Temperature Regulator

Use:

```text
PINGUINO Temperature Regulator — Standard Gelato v0.1 FINAL
```

Supported temperatures:

```text
−11°C
−12°C
−13°C
```

---

# 9. Profile: sorbet

## Identity

```ts
const sorbetProfile = {
  id: "sorbet",
  label: "Sorbet",
  designer: "sorbet_designer",
  optimizer: "sorbet_optimizer",
  temperatureRegulator: "sorbet_temperature_regulator",
};
```

## Active gates

| Gate | Level |
|---|---|
| POD | hard |
| NPAC | hard |
| ice fraction | hard |
| water | hard |
| total solids | hard |
| stabilizer | hard |
| fruit/water/sugar balance | hard |
| cost | soft |

## Disabled gates

| Gate | Level |
|---|---|
| dairy fat logic | disabled |
| lactose | disabled |
| lactose sanding | disabled |
| aerating dairy protein | disabled |
| dairy protein share in solids | disabled |
| MSNF required dairy structure | disabled |

## Product logic

Sorbet is fruit/water/sugar/fiber/stabilizer based.

Correction levers are:

```text
fruit
water
sucrose
dextrose
inulin / fiber
stabilizer
```

Do not use dairy correction candidates unless the recipe is intentionally a hybrid product and explicitly outside v1.0 default scope.

## Temperature Regulator

Use:

```text
PINGUINO Temperature Regulator — Sorbet v0.1 FINAL
```

Supported temperatures:

```text
−11°C
−12°C
−13°C
```

---

# 10. Profile: vegan_gelato

## Identity

```ts
const veganGelatoProfile = {
  id: "vegan_gelato",
  label: "Vegan Gelato",
  designer: "vegan_designer",
  optimizer: "vegan_optimizer",
  temperatureRegulator: "vegan_gelato_temperature_regulator",
};
```

## Active gates

| Gate | Level |
|---|---|
| POD | hard |
| NPAC | hard |
| ice fraction | hard |
| water | hard |
| total solids | hard |
| fat | hard |
| stabilizer | hard |
| plant-base structure | hard |
| cost | soft |

## Disabled gates

| Gate | Level |
|---|---|
| lactose | disabled |
| lactose sanding | disabled |
| dairy aerating protein | disabled |
| dairy protein share in solids | disabled |
| MSNF required dairy structure | disabled |

## Product logic

Vegan Gelato is plant-base gelato.

Possible structure sources:

```text
water
oat drink
soy drink if available
almond drink
rice drink
coconut milk / coconut cream
plant fat
plant protein
inulin / fiber
sucrose
dextrose
stabilizer
```

Do not fail Vegan Gelato because lactose is 0.  
Do not fail Vegan Gelato because dairy protein is 0.  
Do not force dairy correction candidates.

## Temperature Regulator

Use:

```text
PINGUINO Temperature Regulator — Vegan Gelato v0.1 FINAL
```

Supported temperatures:

```text
−11°C
−12°C
−13°C
```

---

# 11. Profile: chocolate_gelato

## Identity

```ts
const chocolateGelatoProfile = {
  id: "chocolate_gelato",
  label: "Chocolate Gelato",
  designer: "chocolate_designer",
  optimizer: "chocolate_optimizer",
  temperatureRegulator: "chocolate_gelato_temperature_regulator",
};
```

## Active gates

| Gate | Level |
|---|---|
| POD | hard |
| NPAC | hard |
| ice fraction | hard |
| water | hard |
| total solids | hard |
| fat | hard |
| lactose | hard |
| lactose sanding | hard |
| aerating protein | hard |
| protein share in solids | soft/advisory |
| chocolate/cocoa solids behavior | hard |
| stabilizer | hard |

## Disabled gates

None fully disabled by default, but protein share is not handled like standard gelato.

## Product logic

Chocolate Gelato uses dairy gelato calculations but chocolate-specific interpretation.

Chocolate contributes:

```text
cocoa solids
cocoa butter
extra fat
extra non-dairy solids
bitterness
higher perceived need for sweetness
higher viscosity/body
```

Chocolate may have:

```text
wider POD tolerance
higher/wider NPAC tolerance
different water/solids behavior
protein share dilution from cocoa solids
```

Do not force standard_gelato protein-share correction if it damages lactose sanding or chocolate quality.

## Temperature Regulator

Use:

```text
PINGUINO Temperature Regulator — Chocolate Gelato v0.1 FINAL
```

Supported temperatures:

```text
−11°C
−12°C
−13°C
```

---

# 12. Designer routing rules

Designer must route product profiles automatically.

## Chocolate routing

If flavor or major ingredient contains:

```text
chocolate
dark chocolate
milk chocolate
cocoa
cacao
cocoa powder
cocoa mass
cocoa butter
chocolate paste
gianduja
```

and the product is gelato-like, route to:

```text
chocolate_gelato
```

Exception:

```text
vegan chocolate -> vegan_gelato + chocolate flavor intent
sorbet chocolate -> sorbet + chocolate warning / later special handling
```

## Sorbet routing

If user explicitly chooses sorbet or says:

```text
sorbet
fruit sorbet
water-based
dairy-free fruit ice
```

route to:

```text
sorbet
```

## Vegan routing

If user explicitly chooses vegan or plant-based gelato:

```text
vegan
plant based
without dairy
no milk
no cream
```

route to:

```text
vegan_gelato
```

## Standard Gelato routing

Default gelato route:

```text
standard_gelato
```

unless chocolate/vegan/sorbet rules override it.

---

# 13. Quality tier interaction

Quality tier belongs to Designer and Optimizer policy, not Base Engine.

## Eco

- lower cost
- lower premium ingredient content
- stable acceptable product

## Classic

- balanced commercial recipe

## Premium

- higher real ingredient content
- stronger natural identity
- better mouthfeel

## Signature

- maximum perceived flavor
- may use boosters if allowed
- must still pass technical gates

Product Profile Registry does not decide exact fruit percentages.  
That belongs to Designer v1.0.

---

# 14. Temperature interaction

Every supported product profile has its own temperature settings.

The Temperature Regulator is selected by:

```text
productProfile + servingTemperatureC
```

Examples:

```text
standard_gelato + −12°C -> Standard Gelato Temperature Regulator −12°C
sorbet + −12°C -> Sorbet Temperature Regulator −12°C
vegan_gelato + −13°C -> Vegan Temperature Regulator −13°C
chocolate_gelato + −13°C -> Chocolate Temperature Regulator −13°C
```

Do not evaluate all products with Standard Gelato bands.

---

# 15. Optimizer interaction

Optimizer selection is product-profile aware.

```text
standard_gelato -> Gelato Optimizer
sorbet -> Sorbet Optimizer
vegan_gelato -> Vegan Optimizer
chocolate_gelato -> Chocolate Optimizer / chocolate rules
```

The Optimizer must receive:

```text
RecipeInput
NormalizedRecipeIntent
ProductProfile definition
TemperatureRegulatorResult
locked ingredient constraints
```

It must not select product profile by itself.  
It uses the selected profile.

---

# 16. Candidate restrictions by profile

## standard_gelato

Allowed correction families:

```text
milk
cream
skimmed milk powder
sucrose
dextrose
inulin / fiber
stabilizer
water only if profile/recipe allows
flavor ingredient where not locked
```

## sorbet

Allowed correction families:

```text
fruit
water
sucrose
dextrose
inulin / fiber
stabilizer
```

Forbidden by default:

```text
milk
cream
skimmed milk powder
dairy protein correction
lactose correction
```

## vegan_gelato

Allowed correction families:

```text
plant drink
water
coconut milk / coconut cream
plant fat
plant protein
sucrose
dextrose
inulin / fiber
stabilizer
```

Forbidden:

```text
milk
cream
skimmed milk powder
dairy correction logic
lactose correction
```

## chocolate_gelato

Allowed correction families:

```text
milk
cream
skimmed milk powder
sucrose
dextrose
inulin / fiber
dark chocolate
cocoa powder
cocoa mass
cocoa butter
stabilizer
```

Special care:

```text
do not reduce chocolate below product/tier intent
do not force protein share by overusing SMP if lactose sanding breaks
```

---

# 17. Stabilizer policy

Each product profile must define stabilizer as a technology gate.

Default v1.0:

| Product profile | Stabilizer final-good recipe |
|---|---|
| standard_gelato | required |
| sorbet | required |
| vegan_gelato | required |
| chocolate_gelato | required |

The system must not accept 0 g stabilizer as a final good production formula.

0 g stabilizer may appear only as:

```text
failed input
benchmark artifact
optimizer evidence
manual test case
```

---

# 18. Product profile registry object

Suggested implementation shape:

```ts
interface ProductProfileDefinition {
  id: ProductProfile;
  label: string;

  designer: string;
  optimizer: string;
  temperatureRegulator: string;

  activeGates: Record<string, GateLevel>;
  disabledGates: string[];

  allowedCorrectionFamilies: string[];
  forbiddenCorrectionFamilies: string[];

  supportsServingTemperaturesC: readonly (-11 | -12 | -13)[];
  defaultServingTemperatureC: -11 | -12 | -13;

  notes: string[];
}
```

Registry:

```ts
export const PRODUCT_PROFILE_REGISTRY: Record<ProductProfile, ProductProfileDefinition> = {
  standard_gelato: standardGelatoProfile,
  sorbet: sorbetProfile,
  vegan_gelato: veganGelatoProfile,
  chocolate_gelato: chocolateGelatoProfile,
};
```

---

# 19. Acceptance tests

## Profile normalization

- `gelato` normalizes to `standard_gelato`
- `milk_gelato` normalizes to `standard_gelato`
- `fruit_gelato` normalizes to `standard_gelato`
- `vegan` normalizes to `vegan_gelato`
- `chocolate` normalizes to `chocolate_gelato`
- `granita` returns unsupported warning

## Gate activation

- `standard_gelato` has lactose gate active
- `sorbet` has lactose gate disabled
- `vegan_gelato` has lactose and dairy protein gates disabled
- `chocolate_gelato` has protein share as soft/advisory, not hard standard-gelato gate

## Temperature routing

- `standard_gelato + -12` uses Standard Gelato settings
- `sorbet + -12` uses Sorbet settings
- `vegan_gelato + -13` uses Vegan settings
- `chocolate_gelato + -13` uses Chocolate settings

## Correction routing

- sorbet does not use dairy correction families
- vegan does not use dairy correction families
- chocolate allows chocolate/cocoa correction families
- standard gelato uses dairy correction families

## Stabilizer

- all v1.0 profiles require stabilizer for final good formula
- 0 g stabilizer is not accepted as final good output

---

# 20. Final lock statement

```text
Product Profile Registry is the single source of truth for which product rules apply.
Base Engine calculates all values.
Designer selects the ProductProfile.
Temperature Regulator evaluates product + temperature.
Optimizer follows ProductProfile gates and correction families.
Do not scatter product-profile logic outside this registry.
```
