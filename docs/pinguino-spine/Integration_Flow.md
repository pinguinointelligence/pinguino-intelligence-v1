# PINGUINO Intelligence — Integration Flow v1.0 FINAL

**Folder name:** `Integration Flow`  
**Status:** LOCKED INTEGRATION FLOW SPECIFICATION  
**Purpose:** define the exact end-to-end workflow from user request to final recipe, including saved defaults, Designer, Product Profile, Base Engine, Temperature Regulator, Optimizer, actual-batch rescue and final explanation.  
**Audience:** Nicolas / implementation AI / future API layer / internal documentation  
**Rule:** no module may bypass this flow. If a required step is missing, stop and ask before implementing.

This document follows the locked folder structure:

```text
Calculation Source of Truth
Core Backbone
Product Profile
Recipe Intent
Designer
Temperature Regulator
Optimizer
Integration Flow
```

Integration Flow connects the already locked documents into one execution order.

Do not mention external tool/product names in code, prompts, UI or documentation. Use neutral wording such as **external benchmark data**, **calibration data** or **reference dataset**.

---

# 1. Master rule

```text
PINGUINO must never jump directly from user text to final grams.

Every recipe must pass through:
User Intent
→ Recipe Intent
→ Designer
→ Product Profile
→ Base Engine
→ Temperature Regulator
→ Optimizer if needed
→ verified final result
```

AI may explain and route.  
AI must not calculate final numbers.

---

# 2. One complete flow

```text
1. User starts recipe
2. System loads saved preferences
3. User confirms or overrides recipe intent
4. Recipe Intent normalizes choices
5. Designer creates product strategy and constraints
6. Product Profile validates active/disabled gates
7. Mapper / ingredient source provides verified ingredient data
8. Starting RecipeInput is created
9. Base Engine calculates deterministic recipe truth
10. Temperature Regulator evaluates product + serving temperature
11. If recipe is valid: show final recipe
12. If recipe needs correction: Optimizer proposes deterministic corrections
13. Corrections are applied hypothetically
14. Base Engine recalculates
15. Temperature Regulator reevaluates
16. Final output is shown as optimized / warning / tradeoff / impossible
```

No step may be silently skipped.

---

# 3. High-level module ownership

| Flow step | Owner |
|---|---|
| Raw customer request | UI / API / AI |
| Saved defaults | User Preferences |
| Intent normalization | Recipe Intent |
| Product strategy | Designer |
| Profile validation | Product Profile |
| Ingredient truth | Mapper / Ingredient Database |
| Chemistry calculation | Base Engine |
| Temperature evaluation | Temperature Regulator |
| Gram correction | Optimizer |
| Explanation | AI/API based on deterministic output |

---

# 4. Start recipe flow

When a user starts a recipe, the system must collect or resolve:

```text
product profile
flavor
quality tier
serving temperature
texture preference
sweetness preference
cost priority
batch size
machine capacity
natural-only / allow boosters
dietary/allergen constraints
available ingredients if stock-aware mode is enabled
```

Customer-facing questions should be simple.

Ask:

```text
What do you want to make?
What flavor?
How much do you want to make?
Which serving temperature?
Firm, medium or soft?
Low, balanced or high sweetness?
Eco, Classic, Premium or Signature?
```

Do not ask technical questions such as:

```text
What NPAC target do you want?
What lactose sanding risk do you accept?
What protein-in-solids percentage do you want?
```

Those are internal.

---

# 5. Saved defaults flow

If user has saved preferences:

```text
Load saved defaults
Apply explicit user overrides
Normalize through Recipe Intent
```

UI may say:

```text
I’ll use your saved recipe settings. What flavor do you want today?
```

Rules:

- explicit input always overrides saved defaults
- saved defaults never suppress warnings
- saved defaults must not hide unsupported profile/temperature conflicts
- user can change defaults later

Example:

```text
Saved: classic standard gelato, −12°C, medium texture, balanced sweetness.
User says: "Make vegan chocolate."
Result: productProfile = vegan_gelato, flavorGroup = chocolate.
Saved standard_gelato does not override explicit vegan request.
```

---

# 6. Batch size flow

Batch size is required before final recipe generation.

Ask:

```text
How much do you want to make?
```

Supported input examples:

```text
1 kg
5 kg
10 kg
25 kg
50 kg
custom grams
custom liters if density conversion is available
machine capacity
```

The resolved value becomes:

```text
target_batch_grams
machine_capacity_grams
```

Rules:

- batch size is production intent
- batch size is not a chemistry constant
- all final grams must match or explicitly explain deviation from target
- if machine capacity is known, it is a hard safety constraint
- if liters are used, conversion must be explicit and user-overridable

---

# 7. Recipe Intent integration

Recipe Intent receives:

```text
raw user input
saved preferences
system defaults
```

It returns:

```text
NormalizedRecipeIntent
```

Required output:

```text
productProfile
qualityTier
servingTemperatureC
texturePreference
sweetnessPreference
costPriority
flavorGroup
flavorTags
naturalOnly
allowBoosters
dietary constraints
batchSizeG
machineCapacityG
warnings
contractVersion
```

If input is invalid:

```text
fallback safely
add warning
do not silently improvise
```

---

# 8. Designer integration

Designer receives:

```text
NormalizedRecipeIntent
Product Profile Registry
available ingredient families
saved/default constraints
```

Designer returns:

```text
RecipeDesignPlan
```

RecipeDesignPlan includes:

```text
product strategy
flavor strategy
quality strategy
allowed ingredient families
forbidden ingredient families
hero ingredient policy
stabilizer required
optimizer constraints
designer warnings
```

Designer must not:

- calculate POD/PAC/NPAC
- calculate final grams
- calculate cost
- calculate nutrition
- call Optimizer
- change Mapper data
- override Product Profile
- override Temperature Regulator

---

# 9. Product Profile integration

Product Profile validates:

```text
standard_gelato
sorbet
vegan_gelato
chocolate_gelato
```

It defines:

```text
active gates
disabled gates
hard/soft/advisory gates
allowed correction families
forbidden correction families
Temperature Regulator
Designer
Optimizer
```

Examples:

```text
sorbet disables dairy gates
vegan_gelato disables lactose and dairy protein gates
chocolate_gelato uses chocolate-specific protein-share handling
standard_gelato keeps dairy gates active
```

Unsupported profile:

```text
return unsupported warning
do not silently map
```

---

# 10. Mapper / ingredient data integration

Mapper provides ingredient truth.

Required ingredient data for calculation:

```text
water %
solids %
fat %
protein %
carbohydrate %
typed sugar split
lactose %
fiber %
salt %
alcohol %
kcal if available
POD value if stored
PAC value if stored
cost if available
allergens/confidence/source
```

Rules:

- Mapper provides data
- Designer uses ingredient families and availability
- Base Engine calculates from data
- Optimizer uses verified candidates
- AI must not invent missing values

If ingredient data is missing:

```text
technical calculation may be blocked or marked incomplete
cost may be incomplete
warning must be shown
```

---

# 11. Starting RecipeInput creation

After Designer, the system creates a starting `RecipeInput`.

Possible sources:

```text
preset recipe
user-provided recipe
generated starting formula
previous recipe
manual ingredient list
```

The starting RecipeInput must include:

```text
items
planned_grams
actual_grams if production already started
lock_type
mode / quality tier mapping
category / product profile mapping
target_temperature_c
target_batch_grams
machine_capacity_grams
goals
```

Starting RecipeInput is not trusted until Base Engine calculates it.

---

# 12. Base Engine calculation

Base Engine calculates:

```text
composition
POD
PAC
recipe-level NPAC
ice fraction
statuses
nutrition
cost
scoring
warnings
```

Rules:

- deterministic
- pure
- no UI logic
- no product strategy
- no AI invention
- no ingredient data changes
- no optimizer behavior

The same input must produce the same output.

---

# 13. Temperature Regulator evaluation

Temperature Regulator receives:

```text
Base Engine result
ProductProfile
ServingTemperatureC
TexturePreference
```

It evaluates:

```text
correct / too hard / too soft
target bands
clean center
warnings
correction direction
temperature score
```

Temperature Regulator does not change recipe chemistry.

Examples:

```text
standard_gelato + −12°C -> Standard Gelato −12 settings
sorbet + −12°C -> Sorbet −12 settings
vegan_gelato + −13°C -> Vegan −13 settings
chocolate_gelato + −13°C -> Chocolate −13 settings
```

Do not evaluate all recipes with Standard Gelato bands.

---

# 14. Decision after first evaluation

After Base Engine + Temperature Regulator, system chooses one path:

```ts
type EvaluationDecision =
  | "valid_show_recipe"
  | "needs_optimizer"
  | "needs_user_decision"
  | "missing_data"
  | "unsupported"
  | "impossible";
```

## valid_show_recipe

Recipe passes active gates and fits intent.

Show recipe.

## needs_optimizer

Recipe can likely be improved with deterministic corrections.

Call Optimizer.

## needs_user_decision

User must choose a production decision, e.g.:

```text
increase final batch volume?
reduce batch to available stock?
allow hero ingredient reduction?
allow replacement?
accept tradeoff?
```

## missing_data

Mapper/ingredient data is insufficient.

Do not invent.

## unsupported

Product/temperature/profile outside v1.0.

## impossible

Known constraints make safe recipe impossible.

---

# 15. Optimizer integration

Optimizer receives:

```text
RecipeInput
NormalizedRecipeIntent
RecipeDesignPlan
ProductProfileDefinition
TemperatureRegulatorResult
Correction context
candidate catalog
batch rescue policy
```

Optimizer may:

```text
add grams
reduce allowed unadded/unlocked grams
propose final batch increase if allowed
return tradeoff/impossible
```

Optimizer must:

```text
verify every proposal by rerunning Base Engine
reevaluate through Temperature Regulator
respect Product Profile gates
respect Designer constraints
respect actual-batch rules
respect machine capacity
respect hero protection
respect stabilizer policy
```

Optimizer must not:

```text
ask customer questions directly
invent exact grams
change ingredient data
fake success
silently change batch size
```

---

# 16. Actual batch / production rescue flow

Actual batch begins when any line has:

```text
actual_grams !== null
```

Then:

```text
context = actual_batch
```

Rules:

- actual grams override planned grams
- already added material cannot be reduced
- rescue is add-only for actual-added lines
- final batch size may need to increase
- user confirmation is required for volume increase
- machine capacity is hard constraint

---

# 17. Batch rescue decision flow

When actual production deviates from plan, the system asks:

```text
You planned {targetBatch} g, but the current actual batch is {actualBatch} g.

What do you want to do?

1. Rescue while keeping the same final batch size.
2. Increase the final batch size to make it technically correct.
3. Recalculate the remaining ingredients around what is already added.
4. Accept best-possible rescue with warnings.
5. Stop the batch.
```

The user decision becomes:

```ts
type ActualBatchRescueDecision =
  | "rescue_same_target_batch"
  | "increase_final_batch_volume"
  | "scale_remaining_recipe_to_actual_batch"
  | "best_possible_tradeoff"
  | "stop_batch";
```

Optimizer consumes this decision.

Optimizer does not ask it directly.

---

# 18. Product shortage flow

If stock-aware production is enabled and the user does not have enough ingredient before adding it, the system asks:

```text
You planned {plannedAmount} g of {ingredient}, but only {availableAmount} g is available.

What do you want to do?

1. Reduce final batch size to match available stock.
2. Keep target batch and mark missing ingredient.
3. Replace part of the ingredient with a verified alternative if allowed.
4. Continue as best possible with lower flavor intensity warning.
5. Stop and buy/add missing product.
```

The user decision becomes:

```ts
type StockShortageDecision =
  | "reduce_batch_to_available_stock"
  | "replace_ingredient"
  | "keep_batch_and_mark_missing"
  | "best_possible_lower_intensity"
  | "stop_and_buy_missing_product";
```

Rules:

- do not invent missing stock
- do not silently reduce hero ingredient
- do not silently replace ingredient
- do not silently change quality tier
- replacement requires verified ingredient data
- Designer decides whether replacement fits strategy
- Optimizer recalculates after decision

---

# 19. Final batch size policy

Final output must clearly state:

```text
original target batch
actual current batch
proposed final batch
whether final batch changed
why final batch changed
whether user confirmation is required
machine capacity status
```

Forbidden:

```text
silently change 10 kg into 11.4 kg
silently normalize to impossible target
pretend overpoured ingredient can be removed
ignore machine capacity
```

Allowed:

```text
Your 10 kg batch can be rescued, but it must become 11.4 kg.
Your machine capacity is 12 kg, so this is possible.
Do you want to continue?
```

or:

```text
Your 10 kg batch can be rescued only by increasing to 13.2 kg, but your machine capacity is 12 kg.
This is blocked.
```

---

# 20. Final output flow

Final response must be one of:

```ts
type FinalRecipeStatus =
  | "ready"
  | "optimized"
  | "acceptable_with_warnings"
  | "needs_user_decision"
  | "tradeoff"
  | "impossible"
  | "missing_data"
  | "unsupported";
```

## ready

Recipe fits without correction.

## optimized

Optimizer improved and verified recipe.

## acceptable_with_warnings

Recipe can be made but warnings remain.

## needs_user_decision

System needs user decision before correction.

## tradeoff

No clean solution under constraints, but best possible route exists.

## impossible

No safe production solution exists under current constraints.

## missing_data

Ingredient data is insufficient.

## unsupported

Outside v1.0 scope.

---

# 21. User-facing explanation

AI/API explains only from deterministic output.

It may say:

```text
The recipe is too hard for −12°C.
The correction requires increasing dextrose.
The batch can be rescued only if final mass increases to 11.4 kg.
The vegan recipe is not evaluated with dairy protein gates.
The chocolate recipe uses chocolate-specific tolerance.
```

AI/API must not say:

```text
Add exactly 143.2 g unless Optimizer returned that exact value.
This recipe is perfect if unresolved gates remain.
This missing ingredient value is probably X.
```

---

# 22. Error and warning handling

Warnings must be structured.

Examples:

```text
unsupported_product_profile
invalid_serving_temperature
missing_ingredient_data
low_confidence_ingredient
cost_incomplete
batch_mass_mismatch
actual_batch_detected
volume_increase_required
machine_capacity_exceeded
stock_shortage
hero_reduction_blocked
stabilizer_zero_forbidden
tradeoff_only
```

Warnings are not optional.  
They prevent silent failure.

---

# 23. API endpoint concept

Suggested workflow endpoints:

```text
POST /recipe/intent/normalize
POST /recipe/design
POST /recipe/calculate
POST /recipe/evaluate-temperature
POST /recipe/optimize
POST /recipe/apply-correction
POST /recipe/production-rescue
```

Or one orchestrated endpoint:

```text
POST /recipe/run
```

The orchestrated endpoint must still internally follow the same flow.

---

# 24. Implementation slices

Safe implementation order:

```text
IF1. Types for Integration Flow
IF2. RecipeIntent normalization wiring
IF3. Designer wiring
IF4. Product Profile validation
IF5. Base Engine calculation call
IF6. Temperature Regulator call
IF7. Decision router
IF8. Optimizer call
IF9. Actual-batch rescue branch
IF10. Stock-shortage branch
IF11. Final output shape
IF12. Acceptance tests
```

Do not wire UI directly to Optimizer before Recipe Intent + Designer + Product Profile are stable.

---

# 25. End-to-end examples

## Example A — normal standard gelato

```text
User: "Classic strawberry gelato, 10 kg, −12°C, medium texture."
```

Flow:

```text
Recipe Intent -> standard_gelato, classic, −12, medium
Designer -> fruit gelato strategy
Product Profile -> standard gelato gates
Base Engine -> calculate
Temperature Regulator -> evaluate Standard Gelato −12
Optimizer -> only if needed
Final -> recipe ready / optimized
```

## Example B — chocolate routing

```text
User: "Premium dark chocolate gelato, 5 kg, soft, −13°C."
```

Flow:

```text
Recipe Intent -> chocolate flavor detected
Designer -> chocolate_gelato
Product Profile -> chocolate gates
Base Engine -> calculate
Temperature Regulator -> Chocolate −13
Optimizer -> chocolate-aware correction if needed
```

Do not evaluate as standard_gelato protein-share hard fail.

## Example C — sorbet

```text
User: "Mango sorbet, 8 kg, −12°C."
```

Flow:

```text
Recipe Intent -> sorbet
Designer -> sorbet fruit strategy
Product Profile -> dairy gates disabled
Base Engine -> calculate
Temperature Regulator -> Sorbet −12
Optimizer -> sorbet-only candidates
```

No milk/cream/SMP correction.

## Example D — vegan chocolate

```text
User: "Vegan chocolate gelato, 6 kg, −13°C."
```

Flow:

```text
Recipe Intent -> vegan_gelato + chocolate flavor
Designer -> vegan strategy with chocolate flavor
Product Profile -> vegan gates
Temperature Regulator -> Vegan −13
Optimizer -> vegan candidates only
```

Do not route to dairy chocolate_gelato.

## Example E — overpoured sugar

```text
Planned: 10 kg
Actual: user added too much sugar
```

Flow:

```text
actual_batch detected
Base Engine recalculates actual state
Temperature Regulator evaluates
System asks rescue decision
User selects increase_final_batch_volume
Optimizer calculates minimum safe final batch
Machine capacity checked
User confirms
Final rescue recipe returned
```

## Example F — not enough fruit

```text
User wants 10 kg strawberry sorbet
Available strawberry only supports 7.2 kg
```

Flow:

```text
stock shortage detected
System asks stock decision
User selects reduce_batch_to_available_stock
Designer keeps sorbet strategy
Optimizer recalculates 7.2 kg target
Base Engine verifies
Temperature Regulator evaluates
Final adjusted recipe returned
```

---

# 26. Acceptance tests

## Flow order

1. Raw input cannot go directly to Optimizer.
2. Raw input must be normalized by Recipe Intent.
3. Designer must run before Product Profile constraints are consumed.
4. Product Profile must validate active/disabled gates before Temperature Regulator.
5. Base Engine must calculate before Temperature Regulator.
6. Optimizer must receive TemperatureRegulatorResult.
7. Optimizer must rerun Base Engine after proposed correction.
8. Final result must include status.

## Saved defaults

9. Saved defaults apply when explicit input is missing.
10. Explicit input overrides saved defaults.
11. Saved defaults do not suppress warnings.

## Product profile

12. Sorbet disables dairy gates.
13. Vegan disables dairy-only gates.
14. Chocolate uses chocolate-specific regulator.
15. Standard gelato keeps dairy gates.

## Batch size

16. Batch size is required before final recipe.
17. Target batch grams are carried into RecipeInput.
18. Machine capacity is carried into RecipeInput.
19. Final output shows original/proposed final batch when changed.

## Actual batch rescue

20. Any actual_grams triggers actual_batch context.
21. Actual-added material is never reduced.
22. Overpoured ingredient triggers rescue decision.
23. Volume increase requires user confirmation.
24. Machine capacity can block volume increase.
25. Best-possible tradeoff exposes unresolved gates.

## Stock shortage

26. Stock shortage asks user decision.
27. Missing stock is not invented.
28. Replacement requires verified ingredient data.
29. Hero ingredient is not silently reduced.
30. Batch can be reduced to available stock if user chooses.

## Optimizer

31. Already valid recipe is not damaged.
32. 0 g stabilizer is not accepted as final good recipe.
33. No dairy correction for sorbet.
34. No dairy correction for vegan.
35. Chocolate is not forced into standard protein-share hard failure.
36. Impossible constraints return tradeoff/impossible, not fake success.

## AI/API

37. AI does not invent exact grams.
38. AI does not expose redacted correction values.
39. AI explanations match deterministic result.
40. Missing data is reported as missing.

---

# 27. Non-goals v1.0

Integration Flow v1.0 does not implement:

- UI design
- database schema
- final code slices
- Mapper product intake
- image/OCR upload
- online enrichment
- granita
- protein gelato
- −18°C storage profile
- autonomous AI recipe invention

---

# 28. Final lock statement

```text
Integration Flow is the execution spine.
Every recipe must pass through Recipe Intent, Designer, Product Profile, Base Engine, Temperature Regulator and Optimizer where needed.
Batch size, actual batch rescue and stock shortage are explicit user-decision branches.
No module may silently change product profile, target batch size, temperature setting, ingredient truth or final correction grams.
If a rule is missing, stop and ask.
```
