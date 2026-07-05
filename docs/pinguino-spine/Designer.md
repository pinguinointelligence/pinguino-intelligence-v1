# PINGUINO Intelligence — Designer v1.0 FINAL

**Folder name:** `Designer`  
**Status:** LOCKED DESIGNER SPECIFICATION  
**Purpose:** define how PINGUINO converts user intent, saved defaults, flavor strategy and product strategy into a normalized recipe design plan.  
**Audience:** Nicolas / implementation AI / future API layer / internal documentation  
**Rule:** Designer is the product-intent brain. It does not calculate recipe chemistry and does not optimize grams.

This document follows the locked folder structure:

```text
Calculation Source of Truth
Core Backbone
Product Profile
Recipe Intent
Designer
Temperature Regulator
Optimizer
```

Designer must stay consistent with:

```text
Calculation Source of Truth
Product Profile
Recipe Intent
Temperature Regulator
Optimizer
```

Do not mention external tool/product names in code, prompts, UI or documentation. Use neutral wording such as **external benchmark data**, **calibration data** or **reference dataset**.

---

# 1. Master rule

```text
Designer decides what the recipe should be.
Base Engine calculates what the recipe is.
Temperature Regulator evaluates if it fits the selected product and temperature.
Optimizer adjusts grams to make it fit.
```

Designer must never become a calculator.

Designer must never replace:

```text
Base Engine
Product Profile Registry
Temperature Regulator
Optimizer
Mapper
```

---

# 2. What Designer is

Designer is the layer that turns a customer request into structured product intent.

Example:

```text
"Make me a premium dark chocolate gelato for −12°C, soft texture, not too sweet"
```

Designer must convert this into:

```text
product profile: chocolate_gelato
quality tier: premium
serving temperature: −12°C
texture preference: soft
sweetness preference: low / balanced
flavor group: chocolate
hero ingredient strategy: chocolate protected
allowed ingredient families: dairy + chocolate/cocoa + sugars + fiber + stabilizer
forbidden behavior: do not evaluate as standard gelato protein-share hard fail
```

Designer produces structured intent and design constraints.

Designer does not produce the final trusted recipe numbers.

---

# 3. What Designer is not

Designer is not:

```text
not Base Engine
not Temperature Regulator
not Optimizer
not Mapper
not Ingredient Database
not cost calculator
not PAC/POD/NPAC calculator
not nutrition calculator
not final gram solver
```

Designer must not:

- calculate POD
- calculate PAC
- calculate NPAC
- calculate ice fraction
- calculate cost
- calculate nutrition
- invent exact correction grams
- modify ingredient database values
- decide active/disabled gates independently of Product Profile
- choose temperature bands independently of Temperature Regulator
- override locked ingredients
- bypass saved user preferences
- silently route unsupported profiles
- silently invent missing product logic

---

# 4. Position in the architecture

```text
User input / saved defaults / presets
        ↓
Designer
        ↓
NormalizedRecipeIntent
        ↓
RecipeDesignPlan
        ↓
Product Profile
        ↓
Base Engine
        ↓
Temperature Regulator
        ↓
Optimizer
        ↓
Final recipe
```

Designer sits after raw user input and before calculation.

---

# 5. Designer inputs

Designer receives:

```ts
interface DesignerInput {
  rawIntent?: RawRecipeIntentInput;
  savedPreferences?: SavedRecipePreferences | null;
  availableIngredientFamilies?: IngredientFamilyAvailability;
  productProfileRegistry: ProductProfileRegistry;
  recipeIntentDefaults: DefaultRecipeIntent;
}
```

Designer may also receive preset context later:

```ts
interface DesignerPresetContext {
  presetId?: string;
  presetName?: string;
  allowedProductProfiles?: ProductProfile[];
  allowedQualityTiers?: QualityTier[];
}
```

Designer must not call database, Mapper or internet directly.  
Ingredient availability should be provided to it as input.

---

# 6. Designer outputs

Designer produces two objects:

```text
1. NormalizedRecipeIntent
2. RecipeDesignPlan
```

## 6.1 NormalizedRecipeIntent

Owned by the `Recipe Intent` document.

It describes what the user wants:

```text
productProfile
qualityTier
servingTemperatureC
texturePreference
sweetnessPreference
costPriority
flavorGroup
naturalOnly
allowBoosters
dietary constraints
warnings
```

## 6.2 RecipeDesignPlan

Designer-specific output.

```ts
interface RecipeDesignPlan {
  productProfile: ProductProfile;
  designerProfile: DesignerProfileId;

  flavorStrategy: FlavorStrategy;
  qualityStrategy: QualityStrategy;
  ingredientStrategy: IngredientStrategy;

  textureTarget: TextureTargetIntent;
  sweetnessTarget: SweetnessTargetIntent;

  heroIngredientPolicy: HeroIngredientPolicy;
  allowedIngredientFamilies: IngredientFamily[];
  forbiddenIngredientFamilies: IngredientFamily[];

  optimizerConstraints: DesignerOptimizerConstraints;
  warnings: DesignerWarning[];

  contractVersion: "1.0.0";
}
```

Designer does not output final verified grams.  
It outputs constraints and strategy for recipe generation and optimization.

---

# 7. Designer profiles

PINGUINO v1.0 has four Designer profiles:

```ts
type DesignerProfileId =
  | "gelato_designer"
  | "sorbet_designer"
  | "vegan_designer"
  | "chocolate_designer";
```

Mapping:

| Product Profile | Designer |
|---|---|
| `standard_gelato` | `gelato_designer` |
| `sorbet` | `sorbet_designer` |
| `vegan_gelato` | `vegan_designer` |
| `chocolate_gelato` | `chocolate_designer` |

Designer profile is selected from Product Profile.  
Optimizer must not choose it independently.

---

# 8. Product profile routing

Designer must route using `Recipe Intent` and `Product Profile`.

## 8.1 Default route

If no explicit product profile is provided:

```text
standard_gelato
```

## 8.2 Chocolate route

If the request is gelato-like and flavor is chocolate:

```text
chocolate_gelato
```

Triggers:

```text
chocolate
dark chocolate
milk chocolate
white chocolate
cocoa
cacao
cocoa powder
cocoa mass
cocoa butter
chocolate paste
gianduja
```

Do not force chocolate route when explicit product profile is:

```text
vegan_gelato
sorbet
```

Instead:

```text
vegan chocolate -> vegan_gelato + chocolate flavor strategy
chocolate sorbet -> sorbet + warning / special unsupported chocolate-sorbet strategy
```

## 8.3 Sorbet route

Explicit sorbet wins:

```text
sorbet
fruit sorbet
water-based
dairy-free fruit ice
no milk fruit ice
```

Designer must not route sorbet to standard gelato.

## 8.4 Vegan route

Explicit vegan/plant-based gelato wins:

```text
vegan
plant based
without milk
without cream
without dairy
```

Designer must not evaluate vegan as standard dairy gelato.

## 8.5 Unsupported route

Unsupported v1.0 profiles:

```text
granita
protein_gelato
frozen drink
slush
fresh
storage −18°C
```

Return warning.  
Do not silently map unsupported products to supported ones.

---

# 9. Flavor strategy

Designer must classify flavor before selecting product strategy.

```ts
type FlavorGroup =
  | "fruit"
  | "chocolate"
  | "nut"
  | "vanilla"
  | "coffee"
  | "neutral"
  | "alcohol"
  | "unknown";
```

## 9.1 Fruit

Examples:

```text
strawberry
raspberry
mango
lemon
orange
banana
blueberry
passion fruit
apple
pear
melon
pineapple
fruit
```

Fruit strategy must consider:

- fruit water
- fruit sugars
- fruit solids
- acidity
- fiber/pulp
- seed/pulp behavior
- color and flavor intensity
- fresh vs frozen vs puree vs concentrate
- quality tier
- whether boosters are allowed

Designer must not assume fruit automatically means sorbet.

Examples:

```text
strawberry gelato -> standard_gelato + fruit strategy
strawberry sorbet -> sorbet + fruit strategy
vegan mango -> vegan_gelato + fruit strategy
```

## 9.2 Chocolate

Chocolate strategy must consider:

- cocoa solids
- cocoa butter
- chocolate fat
- bitterness
- higher body/viscosity
- perceived sweetness
- protein-share dilution
- lactose sanding risk when correcting with dairy powder

Chocolate gelato is not just standard gelato with chocolate flavor.  
It uses Chocolate Designer and Chocolate Temperature Regulator.

## 9.3 Nut

Examples:

```text
pistachio
hazelnut
almond
walnut
peanut
nut paste
```

Nut strategy must consider:

- nut paste fat
- solids
- cost
- flavor intensity
- texture/body
- whether paste is hero ingredient
- quality tier

Nut flavor does not create a separate product profile in v1.0.

## 9.4 Vanilla / neutral

Examples:

```text
vanilla
fior di latte
milk base
cream base
neutral base
```

Vanilla/neutral usually routes to `standard_gelato`.

## 9.5 Coffee

Coffee strategy must consider:

- coffee strength
- bitterness
- water contribution from espresso
- dry coffee/paste/extract contribution
- sweetness balancing

Coffee remains inside the selected product profile unless explicitly vegan/sorbet.

## 9.6 Alcohol

Alcohol strategy must consider:

- alcohol percent
- freezing depression
- safe alcohol band
- flavor identity
- whether product is technically feasible

Designer must warn that alcohol recipes may be constrained and may require tradeoff.

Designer must not blindly add dextrose to fix alcohol recipes.

---

# 10. Quality strategy

Quality tier is product strategy.  
It must influence ingredient strategy and optimizer constraints.

```ts
type QualityTier =
  | "eco"
  | "classic"
  | "premium"
  | "signature";
```

## 10.1 Eco

Eco means:

- low cost
- stable acceptable product
- lower premium ingredient amount
- no unnecessary expensive boosters
- do not use premium ingredients unless required
- still must pass technical gates

Eco does not mean bad product.

Designer output should prefer:

```text
cost efficient base
lower hero ingredient range
no boosters by default
simple recipe
```

## 10.2 Classic

Classic means:

- balanced commercial recipe
- reliable structure
- normal flavor intensity
- moderate cost
- default for most users

Designer output should prefer:

```text
balanced hero ingredient range
clean base
no unnecessary complexity
```

## 10.3 Premium

Premium means:

- higher real ingredient content
- better mouthfeel
- stronger natural identity
- higher cost allowed
- hero ingredient protected more strongly

Designer output should prefer:

```text
higher hero ingredient range
better base quality
better texture contributors
boosters only if allowed and justified
```

## 10.4 Signature

Signature means:

```text
maximum perceived flavor and best product experience
```

Signature does **not** mean:

```text
maximum grams of hero ingredient at any cost
```

Signature may use:

- real ingredient
- puree
- concentrate
- paste
- flavor booster
- texture support
- premium fat/body contributors

Only if allowed by:

```text
naturalOnly
allowBoosters
ingredient availability
product profile
technical gates
```

Signature must still pass technical gates.

---

# 11. Natural-only and booster policy

Designer must handle:

```ts
naturalOnly: boolean
allowBoosters: boolean
```

Rules:

```text
naturalOnly = true -> boosters disabled unless explicit override
allowBoosters = false -> no flavor boosters
allowBoosters = true -> boosters may be used only if product/tier strategy allows
```

Boosters are not always bad, but they must be intentional.

Designer must mark booster permission in the design plan.

Optimizer must respect it.

Mapper must only provide data; it does not decide booster strategy.

---

# 12. Hero ingredient policy

Hero ingredient means the ingredient carrying product identity.

Examples:

```text
strawberry in strawberry gelato
mango in mango sorbet
pistachio paste in pistachio gelato
dark chocolate in chocolate gelato
coffee in coffee gelato
```

Designer must define:

```ts
interface HeroIngredientPolicy {
  heroFlavor: string | null;
  protectHeroIngredient: boolean;
  reductionPolicy: "forbidden" | "allowed_with_warning" | "allowed";
  minimumRelativeLevel: "low" | "standard" | "raised" | "maximum";
  notes: string[];
}
```

Default by quality tier:

| Quality tier | Hero protection |
|---|---|
| eco | standard or low, reduction possible if needed |
| classic | standard, balanced |
| premium | protected |
| signature | strongly protected |

Optimizer must not reduce hero ingredient in Premium/Signature unless explicit Designer policy allows it.

---

# 13. Texture strategy

Texture preference:

```text
firm
medium
soft
```

Designer does not calculate NPAC.

Designer passes texture intent to Temperature Regulator / Optimizer.

Meaning:

```text
firm   -> lower side of selected product/temperature NPAC band
medium -> clean center
soft   -> upper side, still technically safe
```

Forbidden:

```text
soft = unstable
firm = icy
```

Texture preference must stay inside safe product profile gates.

---

# 14. Sweetness strategy

Sweetness preference:

```text
low
balanced
high
```

Designer does not calculate POD.

Designer passes sweetness intent to Optimizer.

Meaning:

```text
low      -> lower product-safe POD zone
balanced -> product clean center
high     -> upper product-safe POD zone
```

Forbidden:

```text
high sweetness cannot push POD beyond product-safe band
do not use sweetness to fix temperature blindly
do not over-sweeten just to hit NPAC
```

---

# 15. Cost strategy

Cost priority:

```text
low
balanced
premium
```

Designer must pass cost strategy to Optimizer.

Rules:

```text
low -> prefer cheaper valid solution
balanced -> cost/taste/structure balance
premium -> cost can rise for quality
```

Cost priority must not allow broken technical recipes.

---

# 16. Product-specific Designer sections

## 16.1 Gelato Designer

Product profile:

```text
standard_gelato
```

Used for:

```text
milk gelato
fruit gelato with dairy base
nut gelato
vanilla / fior di latte
coffee gelato
alcohol gelato with dairy base
non-chocolate standard gelato
```

Active technical meaning comes from Product Profile and Temperature Regulator.

Gelato Designer strategy:

- dairy base selection
- fat/body balance
- milk solids/protein support
- lactose and sanding awareness
- hero ingredient strategy
- quality-tier-based ingredient intensity
- stabilizer required
- avoid chocolate routing mistakes

Allowed ingredient families:

```text
milk
cream
skimmed milk powder
sucrose
dextrose
inulin / fiber
stabilizer
fruit / nut / coffee / vanilla hero ingredients
water only when profile/recipe explicitly allows
```

Forbidden:

```text
do not treat chocolate gelato as normal standard gelato when chocolate is major intent
do not ignore lactose sanding
do not solve temperature only with dextrose
do not reduce Premium/Signature hero ingredient without policy
do not accept 0 g stabilizer as final good recipe
```

---

## 16.2 Sorbet Designer

Product profile:

```text
sorbet
```

Used for:

```text
fruit sorbet
water-based fruit frozen dessert
dairy-free fruit ice
```

Sorbet Designer strategy:

- fruit amount and fruit type
- water balancing
- sucrose/dextrose balance
- fiber/inulin/body
- stabilizer
- acidity/fruit solids awareness
- quality-tier fruit strategy

Allowed ingredient families:

```text
fruit
water
sucrose
dextrose
inulin / fiber
stabilizer
acid if supported later
```

Disabled/forbidden:

```text
milk
cream
skimmed milk powder
dairy fat correction
lactose correction
dairy protein correction
MSNF logic
```

Sorbet must not fail because dairy metrics are absent.

Fruit amount must not be blindly maximized, because fruit brings water, sugar, acidity and solids.

---

## 16.3 Vegan Designer

Product profile:

```text
vegan_gelato
```

Used for:

```text
vegan gelato
plant-based gelato
gelato without milk/cream
```

Vegan Designer strategy:

- plant-base selection
- plant fat/body
- plant protein if available
- water/solids balance
- coconut/oat/almond/rice/soy behavior
- sucrose/dextrose balance
- inulin/fiber
- stabilizer required
- no dairy gates

Allowed ingredient families:

```text
water
oat drink
soy drink if available
almond drink
rice drink
coconut milk / coconut cream
plant fat
plant protein
sucrose
dextrose
inulin / fiber
stabilizer
fruit / chocolate / nut hero ingredients if compatible
```

Forbidden:

```text
milk
cream
skimmed milk powder
dairy correction logic
lactose correction
dairy protein share gate
```

Vegan chocolate remains `vegan_gelato` with chocolate flavor strategy, unless a future dedicated vegan-chocolate profile is created.

---

## 16.4 Chocolate Designer

Product profile:

```text
chocolate_gelato
```

Used for:

```text
chocolate gelato
dark chocolate gelato
cocoa gelato
gianduja-style gelato
```

Chocolate Designer strategy:

- chocolate/cocoa amount
- cocoa solids
- cocoa butter/fat
- bitterness/sweetness perception
- body/viscosity
- lactose sanding risk
- protein share as soft/advisory
- quality-tier chocolate intensity
- stabilizer required

Allowed ingredient families:

```text
milk
cream
skimmed milk powder
sucrose
dextrose
inulin / fiber
dark chocolate
milk chocolate
cocoa powder
cocoa mass
cocoa butter
chocolate paste
stabilizer
```

Forbidden:

```text
do not force Standard Gelato protein-share as hard failure if chocolate structure is good
do not overuse skimmed milk powder if it breaks lactose sanding
do not reduce chocolate hero ingredient below product/tier intent
do not treat chocolate as just a flavor label
do not accept 0 g stabilizer as final good recipe
```

---

# 17. Designer-to-Optimizer constraints

Designer must output constraints the Optimizer can use.

```ts
interface DesignerOptimizerConstraints {
  productProfile: ProductProfile;
  qualityTier: QualityTier;

  allowedIngredientFamilies: IngredientFamily[];
  forbiddenIngredientFamilies: IngredientFamily[];

  heroIngredientPolicy: HeroIngredientPolicy;

  sweetnessPreference: SweetnessPreference;
  texturePreference: TexturePreference;
  costPriority: CostPriority;

  naturalOnly: boolean;
  allowBoosters: boolean;

  stabilizerRequired: boolean;

  disabledGates: string[];
  advisoryGates: string[];

  notes: string[];
}
```

Optimizer uses these constraints.  
Optimizer does not reinterpret product strategy.

---

# 18. Designer-to-Temperature-Regulator handoff

Designer selects:

```text
productProfile
servingTemperatureC
texturePreference
```

Temperature Regulator owns:

```text
target bands
clean centers
too hard / too soft interpretation
correction direction
temperature status
```

Designer must not duplicate temperature bands.

Example:

```text
Designer: productProfile = sorbet, servingTemperatureC = −12, texturePreference = medium
Temperature Regulator: use Sorbet −12°C settings
```

---

# 19. Designer-to-Base-Engine handoff

Designer must not directly call Base Engine to calculate a final truth.

Designer may help create a starting `RecipeInput`, but that input is untrusted until Base Engine calculates it.

Base Engine owns:

```text
composition
POD
PAC
NPAC
ice fraction
status metrics
nutrition
cost
warnings
```

Designer owns:

```text
intent
strategy
constraints
routing
warnings
```

---

# 20. Designer-to-Mapper boundary

Mapper provides ingredient data.

Designer may ask for:

```text
ingredient family
ingredient category
verified product data
composition availability
allergen availability
PAC/POD availability
cost availability
```

Designer must not:

- modify Mapper Basement
- write new ingredients into locked base table
- invent missing nutrition
- invent missing PAC/POD
- verify ingredients by itself
- decide product match confidence

If ingredient data is missing, Designer returns a warning or requests a verified ingredient.

---

# 21. First-use customer flow

Designer should support a simple first-use flow.

Ask:

```text
1. What product do you want to make?
2. What flavor?
3. What quality tier?
4. Serving temperature?
5. Texture: firm / medium / soft?
6. Sweetness: low / balanced / high?
7. Cost priority?
8. Natural-only or allow boosters?
9. Save as default?
```

The system should not ask technical questions such as:

```text
What NPAC target do you want?
What lactose sanding value do you want?
What protein share in solids do you want?
```

Those are internal.

---

# 22. Saved defaults flow

If saved defaults exist:

```text
I’ll use your saved recipe settings. What flavor do you want today?
```

Saved defaults must be overridden by explicit input.

Designer must mark when saved defaults were used:

```text
saved_default_used
```

---

# 23. Warning policy

Designer warnings are structured.

Examples:

```ts
{ code: "unsupported_product_profile", severity: "warning" }
{ code: "profile_forced_by_flavor", severity: "info" }
{ code: "flavor_product_profile_conflict", severity: "warning" }
{ code: "fallback_default_used", severity: "info" }
{ code: "ingredient_family_unavailable", severity: "warning" }
```

Warnings must not contain long UI text.  
Use message keys.

---

# 24. Forbidden behaviors

Designer must never:

1. Calculate POD/PAC/NPAC.
2. Calculate ice fraction.
3. Calculate cost.
4. Calculate nutrition.
5. Invent exact grams.
6. Invent missing ingredient values.
7. Modify Mapper Basement.
8. Route vegan to standard gelato because dairy gates are missing.
9. Route sorbet to standard gelato because dairy gates are missing.
10. Treat chocolate as ordinary standard gelato when chocolate is major intent.
11. Treat Signature as maximum grams of hero ingredient.
12. Allow high sweetness to exceed product-safe POD band.
13. Allow soft texture to become unstable.
14. Ignore stabilizer policy.
15. Ask users technical engine questions.
16. Override Product Profile Registry.
17. Override Temperature Regulator settings.
18. Override Optimizer safety constraints.
19. Silently support Granita in v1.0.
20. Use external benchmark/tool names in code, prompts, UI or documentation.

---

# 25. Non-goals v1.0

Designer v1.0 does not implement:

- final optimizer algorithm
- full ingredient database
- image/OCR product intake
- online enrichment
- full flavor library for every possible flavor
- granita
- protein gelato
- −18°C retail storage profile
- automatic product cost sourcing
- customer-facing UI design
- exact final gram correction

---

# 26. Acceptance tests

## Core

1. Designer is pure and deterministic.
2. Same input returns same NormalizedRecipeIntent and RecipeDesignPlan.
3. Designer does not call Base Engine.
4. Designer does not call Optimizer.
5. Designer does not call Mapper/database.
6. Designer does not return POD/PAC/NPAC.
7. Designer does not return exact final verified grams.

## Routing

8. Empty input routes to `standard_gelato`.
9. `gelato` normalizes to `standard_gelato`.
10. `vegan` normalizes to `vegan_gelato`.
11. `sorbet` routes to `sorbet`.
12. `chocolate gelato` routes to `chocolate_gelato`.
13. `vegan chocolate` stays `vegan_gelato`.
14. `mango sorbet` stays `sorbet`.
15. `granita` returns unsupported warning.

## Product-specific gates

16. Sorbet output disables dairy gates.
17. Vegan output disables dairy-only gates.
18. Chocolate output marks protein share as advisory/soft.
19. Standard Gelato keeps dairy gates active.

## Quality tier

20. Eco produces low-cost strategy.
21. Classic produces balanced strategy.
22. Premium protects hero ingredient.
23. Signature protects hero ingredient and allows maximum perceived flavor strategy, not blind maximum grams.
24. Natural-only disables boosters.
25. `allowBoosters = false` forbids booster families.

## Flavor

26. Strawberry is fruit.
27. Mango is fruit.
28. Pistachio is nut.
29. Dark chocolate is chocolate.
30. Vanilla routes to vanilla/neutral.
31. Unknown flavor does not invent strategy.

## Handoff

32. Designer output contains product profile.
33. Designer output contains quality strategy.
34. Designer output contains allowed/forbidden ingredient families.
35. Designer output contains optimizer constraints.
36. Designer output contains warnings.
37. Designer output contains contract version.

## Safety

38. Soft texture does not mean outside safe temperature band.
39. High sweetness does not mean outside product-safe POD band.
40. Unsupported profile does not silently map without warning.
41. Missing ingredient family produces warning.
42. 0 g stabilizer is never recommended as final good production strategy.

---

# 27. Implementation order

Designer implementation should be sliced safely:

```text
D1. Types only
D2. Product profile normalization
D3. Flavor parser
D4. Quality tier strategy
D5. Product-specific Designer profiles
D6. DesignerOutput / RecipeDesignPlan
D7. Acceptance tests
D8. Integration with Recipe Intent and Product Profile
```

Do not integrate with Optimizer before Designer output is stable.

---

# 28. Final lock statement

```text
Designer is the product-intent and strategy layer.
Designer creates NormalizedRecipeIntent and RecipeDesignPlan.
Designer does not calculate chemistry.
Designer does not optimize grams.
Designer does not invent missing ingredient data.
Designer routes product profile, flavor, quality tier and constraints into the locked PINGUINO backbone.
If a rule is missing, stop and ask.
```
