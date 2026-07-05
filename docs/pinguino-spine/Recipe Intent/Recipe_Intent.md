# PINGUINO Intelligence — RecipeIntent Contract v1.0 FINAL

**Status:** LOCKED RECIPE INTENT CONTRACT  
**Purpose:** define the single normalized intent object that connects UI/User Preferences/Designer with Product Profile Registry, Temperature Regulator and Optimizer.  
**Audience:** Nicolas / implementation AI / future API layer / internal documentation  
**Rule:** no Designer, Optimizer or UI flow may invent intent fields outside this contract without creating a new version.

This document follows:

```text
PINGUINO_Calculation_Source_of_Truth_v1_0_FINAL.md
PINGUINO_Core_Backbone_v0_1_FINAL.md
PINGUINO_Product_Profile_Registry_v1_0_FINAL.md
```

---

# 1. Master rule

```text
RecipeIntent is the single contract that says what the user wants.
Base Engine calculates.
Designer normalizes intent.
Product Profile Registry activates gates.
Temperature Regulator evaluates temperature.
Optimizer adjusts grams.
```

The Optimizer must not guess what the user meant.  
The Base Engine must not infer product strategy.  
The UI must not bypass this contract.

---

# 2. Why RecipeIntent exists

Before RecipeIntent, the system can calculate recipes but does not have a stable product-intent spine.

RecipeIntent solves this by normalizing:

- product type/profile
- flavor
- quality tier
- serving temperature
- texture preference
- sweetness preference
- cost priority
- natural-only / booster permission
- dietary constraints
- saved defaults
- warnings and fallback decisions

Everything downstream receives one deterministic object.

---

# 3. Owner modules

| Stage | Responsibility |
|---|---|
| UI / API | collects raw user choices |
| User Preferences | provides saved defaults |
| Designer | creates `NormalizedRecipeIntent` |
| Product Profile Registry | validates product profile and gates |
| Temperature Regulator | uses `productProfile + servingTemperatureC + texturePreference` |
| Optimizer | uses `NormalizedRecipeIntent` but does not ask questions |
| Base Engine | receives `RecipeInput`, not raw user text |

---

# 4. Supported intent fields v1.0

```ts
export type ProductProfile =
  | "standard_gelato"
  | "sorbet"
  | "vegan_gelato"
  | "chocolate_gelato";

export type QualityTier =
  | "eco"
  | "classic"
  | "premium"
  | "signature";

export type ServingTemperatureC = -11 | -12 | -13;

export type TexturePreference =
  | "firm"
  | "medium"
  | "soft";

export type SweetnessPreference =
  | "low"
  | "balanced"
  | "high";

export type CostPriority =
  | "low"
  | "balanced"
  | "premium";

export type FlavorGroup =
  | "fruit"
  | "chocolate"
  | "nut"
  | "vanilla"
  | "coffee"
  | "alcohol"
  | "neutral"
  | "unknown";

export type IntentSource =
  | "user_input"
  | "saved_defaults"
  | "preset"
  | "fallback";
```

---

# 5. NormalizedRecipeIntent v1.0

```ts
export interface NormalizedRecipeIntent {
  productProfile: ProductProfile;
  qualityTier: QualityTier;
  servingTemperatureC: ServingTemperatureC;

  texturePreference: TexturePreference;
  sweetnessPreference: SweetnessPreference;
  costPriority: CostPriority;

  flavorText?: string;
  flavorGroup: FlavorGroup;
  flavorTags: string[];

  naturalOnly: boolean;
  allowBoosters: boolean;

  dietary: {
    vegan: boolean;
    lactoseFree: boolean;
    glutenFree: boolean;
    allergenAware: boolean;
    noAddedSugar: boolean;
    lowSugar: boolean;
    alcohol: boolean;
  };

  constraints: {
    excludedIngredientIds: string[];
    lockedIngredientIds: string[];
    heroIngredientIds: string[];
    batchSizeG: number | null;
    machineCapacityG: number | null;
  };

  source: IntentSource;
  warnings: DesignerWarning[];

  contractVersion: "1.0.0";
}
```

This is the downstream contract.  
Downstream modules should consume this object instead of raw UI fields.

---

# 6. RawRecipeIntentInput v1.0

Raw input may be incomplete, user-facing, legacy or messy.

```ts
export interface RawRecipeIntentInput {
  productProfile?: string;
  productType?: string;
  category?: string;

  qualityTier?: string;
  mode?: string;

  servingTemperatureC?: number;
  targetTemperatureC?: number;

  texturePreference?: string;
  sweetnessPreference?: string;
  costPriority?: string;

  flavorText?: string;
  flavor?: string;

  naturalOnly?: boolean;
  allowBoosters?: boolean;

  dietary?: Partial<NormalizedRecipeIntent["dietary"]>;

  excludedIngredientIds?: string[];
  lockedIngredientIds?: string[];
  heroIngredientIds?: string[];

  batchSizeG?: number | null;
  machineCapacityG?: number | null;
}
```

Raw input is not trusted.  
It must be normalized before use.

---

# 7. SavedRecipePreferences v1.0

Saved defaults are optional.  
They are used only when explicit current input is missing.

```ts
export interface SavedRecipePreferences {
  userId: string;

  defaultProductProfile: ProductProfile;
  defaultQualityTier: QualityTier;
  defaultServingTemperatureC: ServingTemperatureC;

  defaultTexturePreference: TexturePreference;
  defaultSweetnessPreference: SweetnessPreference;
  defaultCostPriority: CostPriority;

  naturalOnly: boolean;
  allowBoosters: boolean;

  dietary?: Partial<NormalizedRecipeIntent["dietary"]>;

  excludedIngredientIds?: string[];
  allergenRestrictions?: string[];

  createdAt: string;
  updatedAt: string;
}
```

Priority order:

```text
explicit current input
→ saved defaults
→ system defaults
```

Saved defaults must never prevent per-recipe override.

---

# 8. System defaults

```ts
export const DEFAULT_RECIPE_INTENT = {
  productProfile: "standard_gelato",
  qualityTier: "classic",
  servingTemperatureC: -12,
  texturePreference: "medium",
  sweetnessPreference: "balanced",
  costPriority: "balanced",
  flavorGroup: "unknown",
  flavorTags: [],
  naturalOnly: false,
  allowBoosters: true,
  dietary: {
    vegan: false,
    lactoseFree: false,
    glutenFree: false,
    allergenAware: false,
    noAddedSugar: false,
    lowSugar: false,
    alcohol: false,
  },
  constraints: {
    excludedIngredientIds: [],
    lockedIngredientIds: [],
    heroIngredientIds: [],
    batchSizeG: null,
    machineCapacityG: null,
  },
  source: "fallback",
  warnings: [],
  contractVersion: "1.0.0",
} as const;
```

Default serving temperature is −12°C because it is the general balanced commercial target for new recipes.  
This does not change the Base Engine; it only sets default user intent.

---

# 9. DesignerWarning

```ts
export type DesignerWarningCode =
  | "unsupported_product_profile"
  | "legacy_profile_normalized"
  | "invalid_serving_temperature"
  | "invalid_quality_tier"
  | "invalid_texture_preference"
  | "invalid_sweetness_preference"
  | "invalid_cost_priority"
  | "flavor_product_profile_conflict"
  | "granita_unsupported_v1"
  | "profile_forced_by_flavor"
  | "saved_default_used"
  | "fallback_default_used";

export interface DesignerWarning {
  code: DesignerWarningCode;
  severity: "info" | "warning" | "critical";
  messageKey: string;
  context?: Record<string, string | number | boolean>;
}
```

No long user-facing copy should live inside core logic.  
Use `messageKey` and render copy in UI/API layer.

---

# 10. Product profile normalization

Use the Product Profile Registry as the authority.

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

Unsupported in v1.0:

```text
granita
protein
protein_gelato
fresh
storage_minus18
```

Granita must not silently route to sorbet.  
Protein must not silently route to vegan or standard gelato.

---

# 11. Quality tier normalization

Supported:

```text
eco
classic
premium
signature
```

Legacy field:

```text
ProductMode
```

maps to:

```text
QualityTier
```

Meaning:

| QualityTier | Business meaning |
|---|---|
| eco | lowest cost while stable |
| classic | balanced commercial default |
| premium | higher real ingredient and mouthfeel |
| signature | maximum perceived flavor and product experience |

Quality tier does not calculate chemistry.  
It drives Designer and Optimizer policy.

---

# 12. Serving temperature normalization

Supported:

```ts
-11 | -12 | -13
```

Invalid temperature:

- fall back to saved default if available
- otherwise fall back to `-12`
- add `invalid_serving_temperature` warning

Unsupported temperatures in v1.0:

```text
−10
−14
−15
−18
fresh
storage
```

Do not route unsupported temperatures to nearest supported silently.  
Only fallback with warning.

---

# 13. Texture preference normalization

Supported:

```text
firm
medium
soft
```

Legacy aliases:

```text
hard -> firm
balanced -> medium
normal -> medium
creamy -> soft
```

Texture preference maps to NPAC target inside the selected product/temperature range through Temperature Regulator.

It does not override technical gates.

---

# 14. Sweetness preference normalization

Supported:

```text
low
balanced
high
```

Legacy aliases:

```text
normal -> balanced
medium -> balanced
sweet -> high
less_sweet -> low
```

Sweetness maps to POD target.

It does not directly set NPAC and must not force POD outside product-safe bands.

---

# 15. Cost priority normalization

Supported:

```text
low
balanced
premium
```

Legacy aliases:

```text
cheap -> low
normal -> balanced
quality -> premium
```

Cost priority influences optimizer ranking and scoring.  
It must not allow broken technical recipes.

---

# 16. FlavorIntent v1.0

```ts
export interface FlavorIntent {
  rawText: string;
  group: FlavorGroup;
  tags: string[];
  confidence: "high" | "medium" | "low";
}
```

## Minimum flavor parser

### Chocolate

Detect:

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

Group:

```text
chocolate
```

### Fruit

Detect:

```text
strawberry
raspberry
mango
lemon
orange
banana
blueberry
passion fruit
fruit
```

Group:

```text
fruit
```

### Nut

Detect:

```text
pistachio
hazelnut
almond
nut
```

Group:

```text
nut
```

### Vanilla / neutral

Detect:

```text
vanilla
fior di latte
milk base
cream base
neutral
```

Group:

```text
vanilla or neutral
```

### Coffee

Detect:

```text
coffee
espresso
cappuccino
```

Group:

```text
coffee
```

Unknown flavor:

```text
unknown
```

Do not invent ingredient strategy from unknown flavor.

---

# 17. Flavor-driven routing

Flavor can route product profile only when safe and explicit.

## Chocolate routing

If flavor group is chocolate and product is gelato-like:

```text
standard_gelato or unspecified
→ chocolate_gelato
```

Add warning:

```text
profile_forced_by_flavor
```

Do not route:

```text
vegan_gelato + chocolate -> keep vegan_gelato
sorbet + chocolate -> keep sorbet and warn conflict
```

Reason:

- vegan chocolate needs Vegan Designer + chocolate flavor intent
- chocolate sorbet is special and not default v1.0

## Fruit routing

Fruit does not automatically route to sorbet.

Examples:

```text
strawberry gelato -> standard_gelato + fruit flavor intent
strawberry sorbet -> sorbet + fruit flavor intent
vegan strawberry -> vegan_gelato + fruit flavor intent
```

## Nut routing

Nut does not automatically route to another profile.

```text
pistachio gelato -> standard_gelato + nut flavor intent
```

---

# 18. Dietary intent

Dietary intent must not be guessed from flavor unless explicit.

```ts
dietary.vegan = true
```

should force or validate:

```text
productProfile = vegan_gelato
```

unless user explicitly chooses sorbet, which is also non-dairy but a different product.

If user asks for vegan gelato, use `vegan_gelato`.

If user asks for dairy-free fruit ice / water-based, use `sorbet`.

---

# 19. Natural-only and boosters

```ts
naturalOnly: boolean
allowBoosters: boolean
```

Rules:

- if `naturalOnly = true`, then `allowBoosters` should be false unless user explicitly overrides
- if `qualityTier = signature`, boosters may be allowed/suggested if `allowBoosters = true`
- if `qualityTier = eco`, boosters are normally not used unless needed and allowed
- Designer carries this intent; Optimizer later respects it

Designer does not select exact booster grams.

---

# 20. Hero ingredients

Hero ingredients are main flavor/identity ingredients.

Examples:

```text
strawberry in strawberry gelato
pistachio paste in pistachio gelato
dark chocolate in chocolate gelato
mango in mango sorbet
```

Designer may mark hero ingredient candidates, but exact ingredient selection belongs to Designer v1.0 / preset generation.

Optimizer must protect hero ingredients according to quality tier.

---

# 21. Mapping to current RecipeInput

NormalizedRecipeIntent does not replace `RecipeInput`.

It feeds into `RecipeInput` creation.

Mapping:

| NormalizedRecipeIntent | RecipeInput |
|---|---|
| qualityTier | mode |
| productProfile | category mapping |
| servingTemperatureC | target_temperature_c |
| costPriority | goals.cost_priority |
| sweetnessPreference | goals.sweetness, if supported |
| flavor intensity / tier | goals.flavor_intensity / main_priority, if supported |
| dietary | goals.dietary, if supported |

Current repo has older `RecipeGoals`:

```ts
sweetness?: "low" | "normal" | "high";
flavor_intensity?: "light" | "balanced" | "strong" | "maximum";
creaminess?: "light" | "classic" | "premium" | "dense";
cost_priority?: "low" | "balanced" | "premium";
main_priority?: "normal" | "high" | "maximum";
dietary?: DietaryFlag[];
```

Mapping must be explicit.

Example:

```text
SweetnessPreference.balanced -> RecipeGoals.sweetness = "normal"
QualityTier.signature -> RecipeGoals.flavor_intensity = "maximum"
QualityTier.premium -> RecipeGoals.flavor_intensity = "strong"
CostPriority.low -> RecipeGoals.cost_priority = "low"
```

Do not rely on implicit string equality.

---

# 22. Normalization function

Required pure function:

```ts
export function normalizeRecipeIntent(args: {
  input?: RawRecipeIntentInput;
  savedDefaults?: SavedRecipePreferences | null;
}): NormalizedRecipeIntent
```

Rules:

1. explicit input wins
2. saved defaults second
3. system defaults third
4. normalize legacy names
5. detect flavor
6. route product profile if safe
7. validate supported profile
8. validate supported temperature
9. add warnings for fallbacks/conflicts
10. return deterministic object

No IO.  
No database calls.  
No engine math.  
No optimizer calls.

---

# 23. Examples

## Empty input

Input:

```ts
{}
```

Output:

```ts
{
  productProfile: "standard_gelato",
  qualityTier: "classic",
  servingTemperatureC: -12,
  texturePreference: "medium",
  sweetnessPreference: "balanced",
  costPriority: "balanced",
  flavorGroup: "unknown",
  naturalOnly: false,
  allowBoosters: true,
  source: "fallback"
}
```

## Chocolate gelato

Input:

```ts
{ flavorText: "dark chocolate gelato" }
```

Output:

```ts
{
  productProfile: "chocolate_gelato",
  flavorGroup: "chocolate",
  warnings: [{ code: "profile_forced_by_flavor" }]
}
```

## Vegan chocolate

Input:

```ts
{ productProfile: "vegan", flavorText: "chocolate" }
```

Output:

```ts
{
  productProfile: "vegan_gelato",
  flavorGroup: "chocolate"
}
```

Do not force `chocolate_gelato`.

## Mango sorbet

Input:

```ts
{ productProfile: "sorbet", flavorText: "mango" }
```

Output:

```ts
{
  productProfile: "sorbet",
  flavorGroup: "fruit",
  flavorTags: ["mango"]
}
```

## Granita

Input:

```ts
{ productProfile: "granita" }
```

Output:

```ts
{
  productProfile: null,
  status: "unsupported_product_profile",
  warnings: [{ code: "granita_unsupported_v1", severity: "warning" }],
  nextAction: "stop_and_show_unsupported_profile"
}
```

Granita must not silently route to sorbet or standard gelato.

---

# 24. Acceptance tests

## Defaults

1. Empty input returns safe defaults.
2. Default product profile is `standard_gelato`.
3. Default quality tier is `classic`.
4. Default serving temperature is `-12`.
5. Default texture preference is `medium`.
6. Default sweetness preference is `balanced`.
7. Default cost priority is `balanced`.

## Saved defaults

8. Saved defaults apply when explicit input is missing.
9. Explicit input overrides saved defaults.
10. Saved defaults do not remove warnings from explicit invalid input.

## Product profile

11. `gelato` normalizes to `standard_gelato`.
12. `milk_gelato` normalizes to `standard_gelato`.
13. `vegan` normalizes to `vegan_gelato`.
14. `chocolate` normalizes to `chocolate_gelato`.
15. `granita` returns unsupported warning.
16. Unsupported profile does not silently become supported without warning.

## Temperature

17. `-11`, `-12`, `-13` are accepted.
18. invalid temperature falls back safely and warns.
19. `-18` is unsupported in v1.0 and warns.

## Flavor

20. chocolate flavor routes standard/unspecified gelato to `chocolate_gelato`.
21. chocolate flavor does not override explicit `sorbet`.
22. chocolate flavor does not override explicit `vegan_gelato`.
23. strawberry/mango/raspberry are fruit.
24. pistachio/hazelnut/almond are nut.
25. vanilla routes to vanilla/neutral flavor group.

## Preferences

26. `hard` aliases to `firm`.
27. `normal` sweetness aliases to `balanced`.
28. `sweet` aliases to `high`.
29. `cheap` aliases to `low` cost priority.

## Contract safety

30. Output always contains `contractVersion = "1.0.0"`.
31. Function is pure and deterministic.
32. No engine math is called.
33. No optimizer is called.
34. No Mapper or DB call is made.

---

# 25. Non-goals v1.0

RecipeIntent Contract does not implement:

- exact ingredient selection
- fruit percentage formulas
- premium/signature booster selection
- optimizer behavior
- temperature calculations
- UI components
- database tables
- Mapper changes

Those belong to later documents/modules.

---

# 26. Final lock statement

```text
NormalizedRecipeIntent is the single input contract for product intent.
All user choices, saved defaults and Designer routing must be normalized here before Base Engine, Temperature Regulator or Optimizer are used.
If a choice cannot be normalized safely, return a warning and do not improvise.
```
