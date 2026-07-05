# PINGUINO Intelligence — Calculation Source of Truth v1.0 FINAL

**Status:** LOCKED MASTER CALCULATION CONTRACT  
**Purpose:** one stable source of truth for how PINGUINO calculates, evaluates and corrects recipes  
**Audience:** Nicolas / implementation AI / future API layer / internal technical documentation  
**Rule:** if implementation conflicts with this document, stop and ask before coding. Do not improvise.

This document is the calculation backbone for PINGUINO Intelligence. It consolidates the current repo facts, the historical Gelato/Sorbet/Vegan/Chocolate calibration work, and the locked module separation agreed in the PINGUINO workflow.

Do not mention external tool/product names in code, prompts, UI or documentation. Use neutral wording such as **external benchmark data**, **calibration data** or **reference dataset**.

---

# 1. One-sentence master rule

```text
The Base Engine calculates recipe truth.
Product Profiles decide which gates apply.
Temperature Regulator evaluates the Base Engine result for a selected product and serving temperature.
Designer creates normalized recipe intent.
Optimizer adjusts grams only through deterministic rules.
AI explains and routes; AI never calculates.
```

---

# 2. Final architecture

```text
User / Saved Defaults
        ↓
Designer
        ↓
Normalized RecipeIntent
        ↓
Product Profile Registry
        ↓
Base Engine
        ↓
Temperature Regulator
        ↓
Status / Scoring
        ↓
Optimizer / Correction Solver
        ↓
Final Recipe + Explanation + Warnings
```

## Module responsibilities

| Module | Responsibility | Must not do |
|---|---|---|
| Mapper | Provides verified ingredient/product data | Decide recipe strategy |
| Designer | Converts user/saved preferences into normalized RecipeIntent | Calculate recipe numbers |
| Product Profile Registry | Defines active/disabled gates per product | Change ingredient chemistry |
| Base Engine | Calculates deterministic recipe metrics | Decide product strategy |
| Temperature Regulator | Evaluates product + temperature suitability | Change recipe chemistry |
| Status / Scoring | Converts values into indicators and scores | Change values |
| Optimizer | Adjusts grams through verified deterministic corrections | Ask the customer questions |
| AI/API | Explains, routes, asks clarifying questions | Invent exact numbers or grams |

---

# 3. Base Engine is shared

The Base Engine is one shared calculation core for all supported product profiles:

```text
standard_gelato
sorbet
vegan_gelato
chocolate_gelato
```

The Base Engine is not product strategy. It calculates the same recipe values regardless of how the product is later evaluated.

The Base Engine calculates:

- total batch mass
- water
- total solids
- fat
- protein
- lactose
- sugar breakdown
- alcohol
- POD
- PAC
- recipe-level NPAC
- ice fraction
- nutrition
- cost
- warnings
- indicators
- scores

The Base Engine must not decide:

- Eco / Classic / Premium / Signature strategy
- flavor strategy
- fruit percentage
- whether boosters are allowed
- whether chocolate routes to Chocolate Gelato
- whether vegan disables dairy gates
- whether sorbet uses fruit/water gates
- customer preferences
- product business logic

---

# 4. Current repo truth to preserve

The current repo already contains a deterministic engine core. The public engine README describes it as pure TypeScript, zero dependencies, no React and no IO, with same input producing same output. It lists the implemented stages as composition, POD, PAC/NPAC, ice fraction, statuses, nutrition/cost, scoring, `calculateRecipe`, and correction solver. This must remain true.

The current `calculateRecipe` pipeline is a pure assembly of already-implemented stages:

```text
composition
→ POD
→ PAC / NPAC
→ ice fraction
→ status classification
→ nutrition
→ cost
→ scoring
```

No new math should live directly inside `calculateRecipe`.

Current repo versioning:

```text
ENGINE_VERSION = 0.4.0
CONFIG_VERSION = 0.5.0
```

Implementation of this master contract will require controlled version bumps when target bands, temperature profiles or config registries are changed.

---

# 5. RecipeInput and RecipeIntent separation

## RecipeInput

`RecipeInput` is the engine input. It contains:

- items
- mode
- category
- target temperature
- target batch grams
- machine capacity
- goals

The Base Engine consumes `RecipeInput`.

## NormalizedRecipeIntent

`NormalizedRecipeIntent` is the Designer output. It is upstream of the Base Engine and Optimizer.

```ts
type ProductProfile =
  | "standard_gelato"
  | "sorbet"
  | "vegan_gelato"
  | "chocolate_gelato";

type QualityTier =
  | "eco"
  | "classic"
  | "premium"
  | "signature";

type TexturePreference =
  | "firm"
  | "medium"
  | "soft";

type SweetnessPreference =
  | "low"
  | "balanced"
  | "high";

type CostPriority =
  | "low"
  | "balanced"
  | "premium";

type ServingTemperatureC = -11 | -12 | -13;

interface NormalizedRecipeIntent {
  productProfile: ProductProfile;
  qualityTier: QualityTier;
  servingTemperatureC: ServingTemperatureC;

  texturePreference: TexturePreference;
  sweetnessPreference: SweetnessPreference;
  costPriority: CostPriority;

  flavorText?: string;
  flavorGroup?: "fruit" | "chocolate" | "nut" | "vanilla" | "coffee" | "neutral" | "unknown";

  naturalOnly: boolean;
  allowBoosters: boolean;

  source: "user_input" | "saved_defaults" | "preset" | "fallback";
  warnings: DesignerWarning[];
}
```

Default intent:

```ts
const DEFAULT_RECIPE_INTENT = {
  productProfile: "standard_gelato",
  qualityTier: "classic",
  servingTemperatureC: -12,
  texturePreference: "medium",
  sweetnessPreference: "balanced",
  costPriority: "balanced",
  naturalOnly: false,
  allowBoosters: true,
};
```

Priority:

```text
explicit current input
→ saved user defaults
→ system defaults
```

---

# 6. Product Profile Registry v1.0

PINGUINO v1.0 supports exactly:

```text
standard_gelato
sorbet
vegan_gelato
chocolate_gelato
```

Unsupported in v1.0:

```text
granita
protein_gelato
−14°C / −15°C / −18°C
fresh / storage profiles
```

Old names must be normalized:

```text
gelato      -> standard_gelato
vegan       -> vegan_gelato
chocolate   -> chocolate_gelato
granita     -> unsupported in v1.0
```

---

# 7. Active and disabled gates by product profile

## standard_gelato

Active gates:

- POD
- NPAC
- ice fraction
- water
- total solids
- fat
- lactose
- lactose sanding
- aerating protein
- protein share in solids
- stabilizer
- alcohol where applicable

Disabled gates:

- none of the dairy gates are disabled

---

## sorbet

Active gates:

- POD
- NPAC
- ice fraction
- water
- total solids
- stabilizer
- fruit/water/sugar balance

Disabled gates:

- dairy fat logic
- lactose
- lactose sanding
- dairy aerating protein
- dairy protein share in solids
- MSNF required dairy logic

---

## vegan_gelato

Active gates:

- POD
- NPAC
- ice fraction
- water
- total solids
- fat
- stabilizer
- plant-base structure

Disabled gates:

- lactose
- lactose sanding
- dairy aerating protein
- dairy protein share in solids
- MSNF required dairy logic

---

## chocolate_gelato

Active gates:

- POD with chocolate-specific wider tolerance
- NPAC with chocolate-specific ranges
- ice fraction
- water
- total solids
- fat
- lactose
- lactose sanding
- aerating protein
- protein share in solids as advisory/soft gate
- chocolate/cocoa solids behavior
- stabilizer

Chocolate does not need a separate Base Engine. It needs its own profile settings and chocolate-specific Designer/Optimizer rules.

---

# 8. Deterministic calculation pipeline

## 8.1 Effective grams

Every calculation uses effective grams:

```text
effective_grams = actual_grams if actual_grams exists
effective_grams = planned_grams otherwise
```

Actual production amounts override planned amounts.

In actual-batch mode, physically added material cannot be reduced.

---

## 8.2 Composition

Composition calculates:

- total batch grams
- water grams and percent
- solids grams and percent
- fat grams and percent
- protein grams and percent
- lactose grams and percent
- sucrose / glucose / dextrose / fructose / polyol
- fiber
- salt
- alcohol

Alcohol is separate from water and solids.

Sugar types remain separate. Total sugar alone is not enough.

---

## 8.3 POD

POD is calculated from sugar-type sweetness contribution.

Rules:

- stored `pod_value` wins when present
- otherwise use typed sugar breakdown
- never calculate POD from generic total sugar alone
- coefficients live in config, not inline

Current coefficient principle:

```text
sucrose = reference
dextrose/glucose lower sweetness than sucrose
fructose higher sweetness than sucrose
lactose much lower sweetness
```

---

## 8.4 PAC and NPAC

PAC and NPAC are separate from POD.

Rules:

- stored `pac_value` is the ingredient freezing-power source of truth
- ingredient-level `npac_value` must not be used for new data
- recipe-level NPAC is calculated by the engine
- alcohol and salt contribute to NPAC where composition defines them
- no ingredient-level NPAC table should be reintroduced

Current canonical NPAC basis:

```text
NPAC_NORMALIZATION = per_water_mass
```

Formula concept:

```text
PAC = Σ ingredient PAC contribution / total batch mass × 100

NPAC = Σ ingredient NPAC contribution / water mass × 100
```

The `per_total_mass` alternative may exist technically, but it is not the canonical production basis.

---

## 8.5 Ice fraction

Ice fraction is estimated from:

```text
product category
target temperature
NPAC
```

The model is category-aware and anchor-based.

Important:

- lower NPAC means harder product and more ice
- higher NPAC means softer product and less ice
- uncalibrated categories or temperatures must not silently invent truth
- missing values return safe null / correction states
- new product/temperature anchors must be added as explicit config, not inline math

---

## 8.6 Status classification

Status classification converts numeric values into indicators.

It must not calculate chemistry.

It evaluates:

- POD
- NPAC
- ice fraction
- lactose
- lactose sanding
- fat
- aerating protein
- protein in solids
- total solids
- water
- alcohol

Status classification must preserve band provenance:

- seeded
- estimated
- category fallback
- temperature fallback

No fake target band should be invented silently.

---

## 8.7 Cost

Cost rules:

- `cost_per_kg = null` means unknown
- unknown cost creates incomplete cost state
- unknown cost is never treated as 0
- explicit 0 means genuinely free, e.g. water
- cost per 60 g / 70 g / 80 g serving is calculated from cost per kg

---

## 8.8 Nutrition

Nutrition rules:

- use stored `kcal_per_100g` when available and greater than 0
- otherwise use Atwater fallback
- saturated fat is null unless all relevant fat-bearing ingredients provide required saturated data
- zero-mass batches return null nutrition

---

## 8.9 Scoring

Scores are derived views over already-computed truth.

Scoring must not change indicators or metrics.

Scoring includes:

- technical score
- flavor score
- cost score
- overall score

Overall score is stability-gated: unstable recipes cannot hide behind flavor or low cost.

---

# 9. Temperature Regulator v1.0

The Temperature Regulator evaluates Base Engine results using product-specific settings.

It never changes ingredient chemistry.

Input:

```text
Base Engine result
ProductProfile
ServingTemperatureC
TexturePreference
```

Output:

```text
status
score
warnings
active gates
correction goals
```

Temperature Regulator documents already locked:

```text
Temperature Regulator — Standard Gelato v0.1
Temperature Regulator — Sorbet v0.1
Temperature Regulator — Vegan Gelato v0.1
Temperature Regulator — Chocolate Gelato v0.1
```

In this master contract they are treated as subcontracts.

---

# 10. Product + temperature settings summary

## 10.1 standard_gelato

```text
−11°C:
  NPAC band: 33–43
  clean center: 39–41
  status: locked base reference / zero delta
  validation anchor: G12

−12°C:
  NPAC band: 42–50
  clean center: 45.0–46.2
  final reference: G17
  lower anchor: G15

−13°C:
  NPAC band: 48–55
  clean center: 51.5–53.2
  final reference: G18
  lower anchor: G11
```

---

## 10.2 sorbet

```text
−11°C:
  NPAC band: 35–40
  clean center: 37–38
  final reference: S01

−12°C:
  NPAC band: 42–49
  clean center: 44–45
  final reference: S02

−13°C:
  NPAC band: 48–55
  clean center: 51–52.5
  final reference: S03
```

---

## 10.3 vegan_gelato

```text
−11°C:
  NPAC band: 35–52
  clean center: 40–47
  status: locked PINGUINO internal v1.0

−12°C:
  NPAC band: 44–59
  clean center: 48–54
  status: locked PINGUINO internal v1.0

−13°C:
  NPAC band: 50–64
  clean center: 53.5–60
  final reference: V02 fixed
  medium evidence: V02-AUTO
```

Dairy-only gates must be disabled.

---

## 10.4 chocolate_gelato

```text
−11°C:
  NPAC band: 34–45
  clean center: 40–42
  status: locked PINGUINO internal v1.0

−12°C:
  NPAC band: 43–52
  clean center: 47–49.5
  status: locked PINGUINO internal v1.0

−13°C:
  NPAC band: 49–57
  clean center: 49.8–54.1
  observed fixed reference: C01 fixed
  optimized evidence: C01 optimized
```

Chocolate POD range:

```text
12–20
```

Protein share in solids is advisory/soft because cocoa solids dilute dairy protein share.

---

# 11. Texture preference mapping

Texture preference moves target inside the selected product/temperature range.

It does not override hard technical gates.

```text
firm   = lower NPAC side of the selected temperature band
medium = clean center
soft   = upper NPAC side of the selected temperature band
```

Soft does not mean unstable.  
Firm does not mean icy.

---

# 12. Sweetness preference mapping

Sweetness maps to POD, not directly to temperature.

General concept:

```text
low sweetness      = lower POD side
balanced sweetness = middle POD zone
high sweetness     = upper POD side but still inside product-safe band
```

Product-specific POD bands:

```text
standard_gelato: 12–17
sorbet: 15–25
vegan_gelato: 13–25
chocolate_gelato: 12–20
```

Do not allow high sweetness to push POD beyond the product's safe band.

---

# 13. Designer v1.0

Designer creates NormalizedRecipeIntent.

It must:

- normalize old profile names
- detect flavor group
- route chocolate intent to `chocolate_gelato` when appropriate
- route sorbet to `sorbet`
- route vegan to `vegan_gelato`
- carry quality tier
- carry texture preference
- carry sweetness preference
- apply saved defaults
- create warnings when routing is ambiguous

Designer must not calculate recipe values.

---

# 14. Quality tier strategy

Quality tiers are product strategy and must not remain empty labels.

## Eco

- lowest cost while passing gates
- lower premium ingredient content
- boosters normally disabled
- main ingredient may be lower, but product must remain acceptable

## Classic

- balanced taste/cost/structure
- commercial default
- stable, not premium-heavy

## Premium

- higher real ingredient content
- stronger natural identity
- better mouthfeel
- main ingredient protected

## Signature

- maximum perceived flavor and product experience
- may use real ingredient + puree/concentrate/syrup/flavor booster if allowed
- not blindly maximum grams of hero ingredient
- must still pass technical gates

---

# 15. User Preferences

On first use, ask:

- product profile
- quality tier
- serving temperature
- texture preference
- sweetness preference
- cost priority
- natural-only or allow boosters
- dietary/allergen constraints if needed

Then ask:

```text
Save these as your default recipe settings?
```

On later use:

```text
I’ll use your saved recipe settings. What flavor do you want today?
```

User can override defaults per recipe.

---

# 16. Optimizer / Correction Solver

The Optimizer adjusts grams. It does not ask questions.

It receives:

```text
RecipeInput
NormalizedRecipeIntent
ProductProfile gates
TemperatureRegulatorResult
locked ingredient constraints
```

It must:

- use deterministic candidate rules
- verify every proposal by rerunning Base Engine
- respect Golden Middle priority
- respect locked ingredients
- respect actual-batch rules
- protect hero/main ingredient according to tier
- keep stabilizer policy
- return tradeoff/impossible when no safe solution exists

Forbidden optimizer behavior:

- fixing NPAC while breaking POD
- fixing NPAC while breaking ice fraction
- fixing solids while fat/protein/water break
- removing stabilizer to 0 g in final recommended recipe
- applying dairy correction logic to sorbet or vegan
- forcing standard protein-share logic onto chocolate
- reducing actual-added material
- reducing protected main ingredient in Premium/Signature
- hiding impossible recipes behind fake perfection

---

# 17. Stabilizer rule

For product profiles where stabilizer is technologically required, stabilizer must not be accepted as 0 g in a final good production recipe.

0 g stabilizer may appear only as:

- failed input
- benchmark artifact
- warning case
- optimizer failure case

It must not be a final production recommendation for gelato-style products.

---

# 18. AI/API guardrails

AI/API is not the calculator.

AI/API may:

- explain
- ask questions
- route workflows
- classify user intent
- summarize engine output

AI/API must not:

- invent exact grams
- invent POD/PAC/NPAC
- invent cost
- invent correction amounts
- invent missing ingredient data
- calculate engine formulas in prompt text
- claim a result without engine/solver output

Exact numbers come from deterministic engine/solver outputs only.

---

# 19. Mapper boundary

Mapper provides ingredient and product data.

Mapper handles:

- ingredient matching
- product intake
- producer/catalog/OCR/barcode data
- ingredient identity
- duplicate prevention
- nutrition/composition fields
- PAC/POD source values
- verification confidence

Mapper must not decide:

- product profile strategy
- Eco/Premium/Signature meaning
- temperature target
- chocolate routing
- optimizer goals

Mapper provides clean ingredients. Designer and Optimizer use them.

---

# 20. Versioning and drift policy

Current repo versions:

```text
ENGINE_VERSION = 0.4.0
CONFIG_VERSION = 0.5.0
```

Version bump rules:

```text
ENGINE_VERSION changes when formula/pipeline behavior changes.
CONFIG_VERSION changes when coefficients, targets, bands, anchors or profile settings change.
CONTRACT_VERSION changes when this document changes.
```

This contract version:

```text
CONTRACT_VERSION = 1.0.0
```

Any future change must create:

```text
PINGUINO_Calculation_Source_of_Truth_v1_1
```

or another explicit version. Do not silently edit locked v1.0.

---

# 21. Current code migration notes

Current repo still contains older concepts:

```text
−11°C Engine
future −12°C Engine
future −13°C Engine
serving profiles as previews
```

New target architecture:

```text
Base Engine
+
Temperature Regulator settings
```

Implementation must migrate carefully:

- do not create separate duplicated engines for −12°C / −13°C
- do not fake future engines
- do not keep −12/−13 as preview-only once Temperature Regulator is implemented
- replace or supersede old guardrails that say only −11°C is supported
- keep Base Engine deterministic and shared

---

# 22. Acceptance tests — master matrix

## Base Engine

- same input produces same output
- no mutation
- no NaN/Infinity
- empty recipe returns null metrics and safe statuses
- effective grams use actual grams when present
- alcohol is separate from water/solids
- sugar types remain separate
- ingredient-level NPAC ignored
- recipe NPAC calculated from PAC/freezing contribution
- NPAC canonical basis is per water mass

## Product Profile Registry

- standard_gelato has dairy gates
- sorbet disables dairy gates
- vegan_gelato disables dairy-only gates
- chocolate_gelato uses chocolate-specific POD/NPAC/protein-share handling
- granita unsupported in v1.0

## Temperature Regulator

- G17 passes Standard Gelato −12°C
- G18 passes Standard Gelato −13°C
- S02 passes Sorbet −12°C
- S03 passes Sorbet −13°C
- V02 fixed passes Vegan Gelato −13°C
- C01 routes to Chocolate Gelato settings
- same formula values remain constant; regulator status changes

## Designer

- empty input returns defaults
- gelato normalizes to standard_gelato
- vegan normalizes to vegan_gelato
- chocolate flavor routes to chocolate_gelato when gelato-like
- explicit sorbet is not overwritten by chocolate flavor
- saved defaults apply when explicit input is missing
- explicit input overrides saved defaults
- granita returns unsupported warning

## Optimizer

- already-good recipe should not be damaged
- no 0 g stabilizer final good output
- no dairy correction for sorbet/vegan
- no protected main reduction in Premium/Signature
- actual-added material is never reduced
- no one-metric fix that breaks higher priority gates
- impossible recipes return tradeoff/impossible, not fake perfection

---

# 23. Final implementation order

Nicolas should implement only after all locked docs are complete.

Safe order:

```text
1. RecipeIntent Contract
2. Product Profile Registry
3. Temperature Regulator Config Registry
4. Designer v1.0
5. User Preferences / Saved Defaults
6. Optimizer Policy integration
7. Acceptance Test Matrix
8. UI/API wiring
```

Do not jump directly into optimizer changes before the intent/profile/regulator spine exists.

---

# 24. Final lock statement

```text
PINGUINO Intelligence calculations are deterministic.
The Base Engine is shared.
Product differences are handled by Product Profiles, Designer, Temperature Regulator and Optimizer policy.
AI must not calculate.
Mapper must not design.
Optimizer must not improvise.
If a rule is missing, stop and ask.
```
