# PINGUINO Intelligence — Optimizer v1.0 FINAL

**Folder name:** `Optimizer`  
**Status:** LOCKED OPTIMIZER / CORRECTION SOLVER SPECIFICATION  
**Purpose:** define how PINGUINO may correct recipe grams after Base Engine calculation, Product Profile selection, Designer intent and Temperature Regulator evaluation.  
**Audience:** Nicolas / implementation AI / future API layer / internal documentation  
**Rule:** Optimizer adjusts grams only through deterministic, verified rules. It does not ask questions, does not invent calculations and does not change ingredient data.

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

Optimizer must stay consistent with:

```text
Calculation Source of Truth
Product Profile
Recipe Intent
Designer
Temperature Regulator
```

Do not mention external tool/product names in code, prompts, UI or documentation. Use neutral wording such as **external benchmark data**, **calibration data** or **reference dataset**.

---

# 1. Master rule

```text
Designer decides what the recipe should become.
Base Engine calculates what the recipe currently is.
Temperature Regulator evaluates product + temperature suitability.
Optimizer adjusts grams to move the recipe toward the allowed target.
```

Optimizer must never be a free AI recipe generator.

Optimizer is deterministic correction logic.

---

# 2. What Optimizer is

Optimizer is the technical correction module that proposes and applies gram changes.

It receives:

```text
RecipeInput
NormalizedRecipeIntent
RecipeDesignPlan
ProductProfileDefinition
TemperatureRegulatorResult
Correction context
Candidate catalog
Lock constraints
```

It outputs:

```text
verified correction proposal
optimized RecipeInput
before/after Base Engine results
warnings
tradeoff/impossible status when no safe solution exists
```

Optimizer is allowed to adjust grams only after checking the result by rerunning the Base Engine.

---

# 3. What Optimizer is not

Optimizer is not:

```text
not Designer
not Temperature Regulator
not Product Profile Registry
not Mapper
not ingredient database
not AI
not flavor strategy brain
not customer questionnaire
```

Optimizer must not:

- ask the customer product questions
- infer product profile by itself
- invent exact grams without deterministic solving
- calculate POD/PAC/NPAC outside Base Engine logic
- change ingredient PAC/POD/composition data
- change target bands
- activate disabled gates
- use dairy correction logic for sorbet or vegan
- silently remove hero ingredient
- silently reduce already-added material
- hide impossible recipes behind fake success
- accept 0 g stabilizer as final good production recipe where stabilizer is required

---

# 4. Current repo truth to preserve

The current repo already has a deterministic correction solver concept.

Core repo behavior to preserve:

```text
detect violations
rank violations by Golden Middle priority
select correction candidates
solve exact grams with mass-change-aware math
apply hypothetical actions
rerun full calculateRecipe
verify improvement
reject unsafe corrections
return tradeoff/impossible if no safe correction exists
redact exact gram proposals for demo/free preview when required
```

This behavior must not be weakened.

The current solver must be extended into the new architecture, not replaced by random AI logic.

---

# 5. Optimizer position in architecture

```text
Raw user request
        ↓
Recipe Intent
        ↓
Designer
        ↓
Product Profile
        ↓
Base Engine calculation
        ↓
Temperature Regulator evaluation
        ↓
Optimizer
        ↓
Base Engine recalculation
        ↓
Temperature Regulator reevaluation
        ↓
Final recipe / tradeoff / impossible
```

Optimizer always works with calculated truth.

---

# 6. Optimizer input contract

```ts
interface OptimizerInput {
  recipe: RecipeInput;

  intent: NormalizedRecipeIntent;
  designPlan: RecipeDesignPlan;

  productProfile: ProductProfileDefinition;
  temperatureEvaluation: TemperatureRegulatorResult;

  context: CorrectionContext;

  candidates: CorrectionCandidateCatalog;

  options?: {
    maxIterations?: number;
    maxProposals?: number;
    allowMainIngredientReduction?: boolean;
    exactCorrectionGrams?: boolean;
  };
}
```

---

# 7. Correction context

```ts
type CorrectionContext =
  | "planning"
  | "actual_batch";
```

## planning

Planning means recipe is still theoretical.

Rules:

- unlocked lines may be increased
- unlocked lines may be reduced if allowed
- locked lines must not be changed
- hero/main ingredient reduction follows quality tier and Designer policy
- Premium/Signature hero ingredient should normally not be reduced

## actual_batch

Actual batch means at least one real production amount has been recorded.

Rules:

- physically added material must never be reduced
- any line with `actual_grams` is treated as already added
- rescue corrections are add-only
- system must not pretend material can be removed from a real batch

---

# 7A. Batch size, actual batch rescue and volume decision

This section is a hard Optimizer/UI rule.

PINGUINO must treat batch size as a first-class production constraint.

The user is asked at the beginning:

```text
How much gelato / sorbet / vegan gelato / chocolate gelato do you want to make?
```

Examples:

```text
1 kg
5 kg
10 kg
25 kg
50 kg
custom batch size
machine capacity
```

The answer becomes:

```text
target_batch_grams
machine_capacity_grams
```

The target batch size is the planned production target, not a chemistry constant.

---

## 7A.1 Planned batch mode

Before production starts:

```text
context = planning
actual_grams = null
```

Optimizer may propose:

```text
add ingredient
reduce unlocked ingredient
replace strategy if Designer allows
scale recipe to target batch size
```

Planning mode may ask the user:

```text
You do not have enough of this ingredient. What do you want to do?
```

Allowed user decisions:

```ts
type StockShortageDecision =
  | "reduce_batch_to_available_stock"
  | "replace_ingredient"
  | "keep_batch_and_mark_missing"
  | "best_possible_lower_intensity"
  | "stop_and_buy_missing_product";
```

Meaning:

### reduce_batch_to_available_stock

System recalculates the recipe down to the available limiting ingredient.

Example:

```text
User wanted 10 kg, but has strawberries only for 7.2 kg.
PINGUINO may propose a 7.2 kg batch if technically valid.
```

### replace_ingredient

System may use a replacement only if Mapper/ingredient database has verified data and Designer/Product Profile allows the family.

### keep_batch_and_mark_missing

System keeps target batch and warns that the recipe cannot be produced until missing ingredient is supplied.

### best_possible_lower_intensity

System continues as best possible with a clear lower-flavor-intensity warning. Hero ingredient is not silently reduced beyond what the user accepted; the warning stays visible.

### stop_and_buy_missing_product

System does not optimize around missing stock.

---

## 7A.2 Actual batch mode

Actual batch starts when at least one real weighed amount is recorded:

```text
actual_grams !== null
```

From this moment:

```text
context = actual_batch
```

Rules:

- actual grams override planned grams
- all values are calculated from actual/effective grams
- already added material cannot be reduced
- rescue is add-only unless the material has not been added yet
- user must be told if target batch size can no longer be preserved
- machine capacity remains a hard constraint

This handles real production mistakes:

```text
client poured too much sucrose
client added too much cream
client spilled or lost part of the batch
client has less ingredient than planned
client already added the wrong amount
client cannot physically remove what is already in the machine
```

---

## 7A.3 Actual batch rescue decision

When actual production deviates from the plan, Optimizer must not silently choose a new batch size.

The system must ask the user which rescue strategy to use.

```ts
type ActualBatchRescueDecision =
  | "rescue_same_target_batch"
  | "increase_final_batch_volume"
  | "scale_remaining_recipe_to_actual_batch"
  | "best_possible_tradeoff"
  | "stop_batch";
```

### rescue_same_target_batch

Try to rescue the recipe while keeping the original target batch size.

Allowed only if:

- technically possible
- no already-added material must be reduced
- no hard gate is broken
- machine capacity is respected

If impossible, return:

```text
requires_volume_increase
```

or:

```text
tradeoff / impossible
```

Do not fake a successful rescue.

### increase_final_batch_volume

Allow the final batch to grow above the original target.

Use when the user overpoured or when safe correction requires adding ingredients.

Example:

```text
Planned batch: 10 kg
Actual added sugar makes balance impossible at 10 kg
PINGUINO calculates the minimum safe final batch size, e.g. 11.4 kg
User confirms whether to continue
```

Rules:

- calculate minimum safe increase if possible
- show new final mass
- check machine capacity
- if capacity is exceeded, return capacity tradeoff
- do not silently increase volume without user approval

### scale_remaining_recipe_to_actual_batch

Use when some ingredients are already added and remaining ingredients should be recalculated around the actual mass.

This is useful when:

```text
the batch is already in progress
some material is already added
the user wants a practical production rescue
```

Rules:

- actual-added lines remain fixed
- only remaining/unadded ingredients may be adjusted
- final batch may differ from original target if user approves

### best_possible_tradeoff

Use when no clean technical solution exists, but the user still wants a best-possible rescue.

Rules:

- output must clearly say which gates remain broken
- do not call it ideal
- do not hide warnings
- do not fake perfection

### stop_batch

No correction is applied.

---

## 7A.4 Required user prompt

When actual batch mismatch is detected, the UI/API should ask in simple language:

```text
You planned {target_batch_grams} g, but the current actual batch is {actual_batch_grams} g.

Do you want to:
1. Try to rescue the recipe while keeping the same final batch size?
2. Increase the final batch size to make the recipe technically correct?
3. Recalculate the remaining ingredients around what is already in the batch?
4. Accept a best-possible rescue with warnings?
5. Stop and do not change the batch?
```

This question belongs to UI/API / workflow layer.

Optimizer consumes the selected decision.

Optimizer does not ask directly.

---

## 7A.5 Required Optimizer behavior

Optimizer must support batch rescue as an explicit policy input:

```ts
interface BatchRescuePolicy {
  targetBatchG: number;
  machineCapacityG: number | null;

  context: "planning" | "actual_batch";

  stockShortageDecision?: StockShortageDecision;
  actualBatchRescueDecision?: ActualBatchRescueDecision;

  allowFinalBatchIncrease: boolean;
  requireUserConfirmationForVolumeIncrease: boolean;
}
```

Optimizer output must expose volume impact:

```ts
interface BatchRescueResult {
  originalTargetBatchG: number;
  currentActualBatchG: number;
  proposedFinalBatchG: number;
  finalBatchChanged: boolean;
  requiresUserConfirmation: boolean;
  reason:
    | "same_target_possible"
    | "volume_increase_required"
    | "capacity_blocked"
    | "stock_shortage"
    | "tradeoff_only"
    | "stopped";
}
```

---

## 7A.6 Volume increase is not an error if approved

If the user approves volume increase, increasing the batch can be the correct rescue.

But it must be explicit.

Forbidden:

```text
silently increase final batch size
silently normalize back to impossible target
pretend already-added material can be removed
ignore machine capacity
ignore that the client wanted 1 kg / 5 kg / 10 kg / 50 kg
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
This is blocked. Choose best-possible tradeoff, split into two batches, or stop.
```

---

## 7A.7 Product shortage behavior

If the user does not have enough ingredient before adding it:

```text
do not invent the missing product
do not silently replace it
do not silently reduce the hero ingredient
do not silently change quality tier
```

Ask or return structured decision needed:

```text
You planned 600 g strawberry, but only 420 g is available.

Options:
1. Reduce final batch size to match available strawberry.
2. Keep target batch and mark missing strawberry.
3. Replace part of strawberry with verified puree/concentrate if allowed.
4. Continue as best possible with lower flavor intensity warning.
5. Stop and buy/add missing strawberry.
```

Designer owns whether replacement is allowed.  
Mapper owns replacement ingredient data.  
Optimizer owns gram correction after decision.

---

## 7A.8 Acceptance tests for batch rescue

Required tests:

1. If no `actual_grams` exist, context is `planning`.
2. If any `actual_grams` exists, context is `actual_batch`.
3. Actual grams override planned grams in all calculations.
4. Actual-added lines are never reduced.
5. Overpoured sugar cannot be silently removed.
6. Overpoured sugar may trigger `increase_final_batch_volume`.
7. Final volume increase requires user confirmation.
8. Machine capacity blocks unsafe volume increase.
9. Product shortage before production asks for stock decision.
10. Reduce-batch-to-available-stock recalculates target batch safely.
11. Best-possible tradeoff clearly exposes unresolved gates.
12. Optimizer never silently changes target batch size.

---

# 8. Optimizer output contract

```ts
interface OptimizerResult {
  status:
    | "optimized"
    | "acceptable_with_warnings"
    | "tradeoff"
    | "impossible"
    | "no_action_needed"
    | "failed_no_safe_solution";

  before: RecipeResult;
  after: RecipeResult | null;

  temperatureBefore: TemperatureRegulatorResult;
  temperatureAfter: TemperatureRegulatorResult | null;

  optimizedRecipe: RecipeInput | null;

  proposals: OptimizerProposal[];

  unresolvedWarnings: OptimizerWarning[];

  confidence:
    | "high"
    | "medium"
    | "low"
    | "tradeoff";

  contractVersion: "1.0.0";
}
```

## OptimizerProposal

```ts
interface OptimizerProposal {
  id: string;

  kind:
    | "correction"
    | "tradeoff"
    | "impossible"
    | "no_action";

  affectedMetrics: string[];
  reasons: string[];

  actions: OptimizerAction[];

  predicted: {
    metric: string;
    before: number | null;
    after: number | null;
  }[];

  residualReasons: string[];
  confidence: "high" | "medium" | "low" | "tradeoff";
}
```

## OptimizerAction

```ts
interface OptimizerAction {
  type: "add" | "reduce";
  ingredientId: string;
  ingredientName: string;
  grams: number;
  targetLineId?: string;
}
```

Exact actions are allowed only in non-redacted / Pro contexts.

---

# 9. Redaction policy

Optimizer may produce exact gram actions, but the API/UI layer may request redaction.

When redacted, output must not include:

- exact grams
- ingredient names
- ingredient categories
- before/after numeric predictions
- numeric deltas
- hidden numeric fields

Redacted output may include only:

- affected broad area
- broad direction
- confidence label
- teaser code

This rule exists so AI/UI cannot leak exact correction values in demo/free-preview contexts.

---

# 10. Golden Middle priority

Optimizer must use Golden Middle priority.

Priority order:

```text
1. feasibility_safety
2. freezing_stability
3. npac_pac
4. pod
5. water_solids
6. fat
7. protein
8. lactose_sandiness
9. stabilizer_ratio
10. flavor_priority
11. cost
```

Core rule:

```text
Never fix a lower-priority metric by breaking a higher-priority metric.
```

Example:

```text
Do not improve cost if freezing stability breaks.
Do not improve protein if NPAC breaks.
Do not improve POD if lactose sanding becomes unsafe.
```

---

# 11. Hard safety rules

Optimizer must always enforce:

1. no negative grams
2. no NaN or Infinity
3. no mutation of original input
4. no ingredient data changes
5. locked ingredients respected
6. actual grams respected
7. machine capacity respected
8. excluded ingredients not used
9. unsupported product profile not optimized as another profile
10. 0 g stabilizer not accepted as final good recipe when stabilizer is required
11. no fake perfect result if constraints make perfect balance impossible
12. every proposal verified by rerunning Base Engine
13. every proposal reevaluated by Temperature Regulator
14. output must include unresolved warnings when not fully solved

---

# 12. Idempotence rule

If a recipe is already valid for:

```text
ProductProfile
ServingTemperature
TexturePreference
SweetnessPreference
QualityTier
```

then Optimizer must return:

```text
status: "no_action_needed"
proposals: []
```

or an equivalent no-op result.

Repeated optimize/apply cycles must converge.  
They must not drift endlessly.

Forbidden:

```text
auto-balance repeatedly changes a good recipe
auto-balance damages a valid recipe
auto-balance keeps moving grams without reaching a fixed point
```

---

# 13. Verification rule

Every proposal must be verified by:

```text
1. apply hypothetical gram changes
2. run Base Engine again
3. run Temperature Regulator again
4. compare before/after violations
5. reject if target does not improve
6. reject if higher-priority metric worsens
7. reject if product-profile gates are violated
8. reject if capacity/lock/context rules are violated
```

A proposal is never trusted only because its formula looked correct on paper.

---

# 14. Temperature target logic

Optimizer does not own temperature bands.

Temperature Regulator owns:

- NPAC bands
- clean centers
- too hard / too soft interpretation
- temperature-specific product status

Optimizer receives target direction from Temperature Regulator.

Examples:

```text
too hard -> raise freezing power / reduce ice / move toward higher NPAC
too soft -> reduce freezing power / increase structure / move toward lower NPAC
```

But Optimizer must also check:

- POD
- water
- solids
- fat
- protein
- lactose
- sanding
- stabilizer
- product-specific disabled gates

NPAC is important, but NPAC is not the whole recipe.

---

# 15. Texture preference

Designer passes texture preference:

```text
firm
medium
soft
```

Temperature Regulator maps it inside the selected product/temperature band.

Optimizer must target that zone without leaving safe gates.

```text
firm   -> lower safe NPAC side
medium -> clean center
soft   -> upper safe NPAC side
```

Forbidden:

```text
soft = too soft / unstable
firm = icy / broken
```

---

# 16. Sweetness preference

Designer passes sweetness preference:

```text
low
balanced
high
```

Optimizer must map this to product-safe POD behavior.

Forbidden:

```text
do not over-sweeten just to fix NPAC
do not use POD to solve temperature blindly
do not push POD outside product profile safe band
```

Product POD bands come from Product Profile / Temperature Regulator, not Optimizer.

---

# 17. Product-specific optimizer policies

## 17.1 Standard Gelato Optimizer

Product profile:

```text
standard_gelato
```

Active gates:

```text
POD
NPAC
ice fraction
water
total solids
fat
lactose
lactose sanding
aerating protein
protein share in solids
stabilizer
alcohol when relevant
```

Allowed correction families:

```text
milk
cream
skimmed milk powder
sucrose
dextrose
inulin / fiber
stabilizer
hero ingredient if not locked and Designer allows
water only when explicitly allowed
```

Forbidden:

```text
do not solve everything with dextrose
do not overuse skimmed milk powder if lactose/sanding breaks
do not remove hero fruit/nut/vanilla identity
do not accept 0 g stabilizer
```

---

## 17.2 Sorbet Optimizer

Product profile:

```text
sorbet
```

Active gates:

```text
POD
NPAC
ice fraction
water
total solids
stabilizer
fruit/water/sugar balance
```

Disabled gates:

```text
lactose
lactose sanding
dairy fat
dairy protein
dairy protein share
MSNF
```

Allowed correction families:

```text
fruit
water
sucrose
dextrose
inulin / fiber
stabilizer
acid if later supported
```

Forbidden:

```text
milk
cream
skimmed milk powder
dairy correction
lactose correction
dairy protein correction
```

Sorbet must not be marked broken because dairy metrics are absent.

---

## 17.3 Vegan Optimizer

Product profile:

```text
vegan_gelato
```

Active gates:

```text
POD
NPAC
ice fraction
water
total solids
fat
plant-base structure
stabilizer
```

Disabled gates:

```text
lactose
lactose sanding
dairy aerating protein
dairy protein share
MSNF
```

Allowed correction families:

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
compatible hero ingredients
```

Forbidden:

```text
milk
cream
skimmed milk powder
dairy correction logic
lactose correction
dairy protein correction
```

Vegan recipe must not fail because lactose is 0 or dairy protein is 0.

---

## 17.4 Chocolate Optimizer

Product profile:

```text
chocolate_gelato
```

Active gates:

```text
POD
NPAC
ice fraction
water
total solids
fat
lactose
lactose sanding
aerating protein
protein share as soft/advisory
chocolate/cocoa solids behavior
stabilizer
```

Allowed correction families:

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

Special rules:

```text
protein share is not standard hard failure when cocoa solids dilute it
do not overcorrect with skimmed milk powder if lactose sanding breaks
do not reduce chocolate hero below Designer/quality-tier intent
do not treat chocolate as ordinary standard gelato
```

---

# 18. Stabilizer policy

For all v1.0 production profiles:

```text
standard_gelato
sorbet
vegan_gelato
chocolate_gelato
```

stabilizer is required for final good production formulas.

Optimizer must never return a final good result with stabilizer = 0 g.

0 g stabilizer may appear only as:

```text
failed input
reference artifact
manual test case
tradeoff warning
optimizer rejection
```

It must not be recommended as successful final recipe.

---

# 19. Hero ingredient policy

Designer owns hero policy.  
Optimizer enforces it.

Default behavior:

| Quality tier | Hero reduction |
|---|---|
| eco | may reduce if allowed and technically needed |
| classic | may reduce carefully if allowed |
| premium | protected |
| signature | strongly protected |

Forbidden:

```text
reduce Premium/Signature hero ingredient to solve cost
remove chocolate from chocolate gelato
remove mango from mango sorbet
remove pistachio from pistachio gelato
```

If the recipe cannot be balanced with hero protected:

```text
return tradeoff
explain constraint
ask user to allow change
```

Do not fake success.

---

# 20. Candidate selection

Optimizer candidates must be selected from allowed families for the active Product Profile.

Candidate selection input:

```text
violating metric
direction low/high
product profile
quality tier
cost priority
allowed ingredient families
forbidden ingredient families
locked/excluded ingredients
```

Candidate selection must be deterministic.

If no valid candidate exists:

```text
return impossible / tradeoff
```

Do not invent ingredients.

---

# 21. Metric correction direction examples

## POD low

Possible correction:

```text
sucrose
dextrose
fruit/syrup only if Designer allows
```

Must check:

```text
NPAC
water
solids
sweetness preference
```

## POD high

Possible correction:

```text
dilution
less sugar
more base
```

Must not break:

```text
NPAC
texture
hero ingredient
batch size
```

## NPAC low / too hard

Possible correction:

```text
dextrose
sucrose
other allowed freezing-power ingredients
```

Must not over-sweeten.

## NPAC high / too soft

Possible correction:

```text
reduce high-PAC ingredient if allowed
increase solids/body
dilute freezing power
```

Must not make recipe watery or weak.

## Ice fraction high / too hard

Usually move toward higher freezing depression / softer balance.

## Ice fraction low / too soft

Usually reduce freezing depression or improve solids/body.

## Fat low

Possible correction:

```text
cream for dairy
coconut/fat source for vegan
nut paste if relevant
```

## Fat high

Possible correction:

```text
lower fat ingredient
dilution
milk/water depending product profile
```

## Lactose high

Standard/chocolate only.

Possible correction:

```text
reduce dairy lactose pressure
use inulin/fiber solids
avoid too much SMP
```

Forbidden for sorbet/vegan:

```text
do not evaluate
```

---

# 22. Batch normalization

Optimizer must preserve or return target batch mass policy.

Default:

```text
target_batch_grams usually 1000 g
```

If changes add mass, Optimizer must either:

```text
normalize recipe back to target batch
```

or return clearly:

```text
batch_mass_mismatch
```

depending on context and feature slice.

Actual-batch rescue may exceed original target mass if needed, but must respect machine capacity.

---

# 23. Tradeoff and impossible states

Optimizer must return tradeoff/impossible when constraints prevent safe balance.

Examples:

```text
locked ingredient prevents correction
hero ingredient cannot be reduced
machine capacity blocks rescue
alcohol too high and cannot be safely balanced
all valid candidates excluded
missing ingredient data prevents reliable calculation
```

Required behavior:

```text
say what blocks the correction
do not pretend recipe is perfect
suggest what the user could unlock/change
```

Forbidden:

```text
fake perfect status
negative grams
hidden broken metric
silent unsupported behavior
```

---

# 24. Missing data behavior

If ingredient data is incomplete:

```text
missing PAC/POD
missing composition
missing cost
low confidence
```

Optimizer must not invent exact values.

Behavior:

```text
if technical values missing -> cannot optimize reliably
if cost missing -> cost optimization unavailable but technical optimization may continue
if ingredient confidence low -> warn
```

Exact missing values must come from Mapper / Ingredient Database, not Optimizer.

---

# 25. AI/API boundary

AI may explain Optimizer output.

AI may not:

- invent correction grams
- invent ingredient candidates
- invent before/after numbers
- invent reasons not returned by Optimizer
- expose redacted exact values
- claim recipe is optimized without Optimizer output

AI wording must be based on deterministic Optimizer result.

---

# 26. Suggested implementation modules

```text
src/optimizer/types.ts
src/optimizer/policies/productProfiles.ts
src/optimizer/candidates.ts
src/optimizer/detectViolations.ts
src/optimizer/solve.ts
src/optimizer/verify.ts
src/optimizer/apply.ts
src/optimizer/redact.ts
src/optimizer/index.ts
```

If extending current repo:

```text
src/engine/corrections/*
```

may remain the deterministic solver layer, but product-profile-aware policies should be clearly separated and not buried in random UI logic.

---

# 27. Migration from current solver

Current solver already includes valuable foundations:

```text
deterministic proposals
candidate selection
Golden Middle priority
verification by rerunning calculateRecipe
planning vs actual-batch context
main ingredient protection
strict redaction
tradeoff/impossible output
```

Migration should add:

```text
ProductProfile-aware candidate restrictions
TemperatureRegulatorResult input
DesignerOptimizerConstraints input
stabilizer hard policy
sorbet disabled dairy gates
vegan disabled dairy gates
chocolate protein-share soft/advisory handling
−11/−12/−13 Regulator settings
```

Do not rewrite a working solver blindly.

---

# 28. Acceptance tests

## Core

1. Optimizer is deterministic.
2. Same input returns same proposals.
3. Original input is not mutated.
4. No NaN or Infinity in output.
5. Every accepted proposal reruns Base Engine.
6. Every accepted proposal reruns Temperature Regulator.
7. Already valid recipe returns no action / no damage.
8. Repeated apply reaches stable state.

## Context

9. Planning context may reduce unlocked lines if policy allows.
10. Actual-batch context never reduces actual-added lines.
11. Locked lines are never changed.
12. Machine capacity is respected.
13. Excluded ingredients are never used.

## Product profile

14. Standard Gelato uses dairy correction families.
15. Sorbet does not use dairy correction families.
16. Vegan does not use dairy correction families.
17. Chocolate allows chocolate/cocoa families.
18. Chocolate protein share is soft/advisory, not hard standard-gelato failure.

## Priority

19. No lower-priority fix may worsen higher-priority metric.
20. No NPAC fix may break POD beyond safe band.
21. No solids fix may break fat/water/sanding.
22. No cost fix may break technical stability.

## Stabilizer

23. Standard Gelato final good result cannot have 0 g stabilizer.
24. Sorbet final good result cannot have 0 g stabilizer.
25. Vegan Gelato final good result cannot have 0 g stabilizer.
26. Chocolate Gelato final good result cannot have 0 g stabilizer.

## Hero ingredient

27. Premium hero ingredient is protected.
28. Signature hero ingredient is strongly protected.
29. If hero protection blocks balance, result is tradeoff, not fake success.

## Redaction

30. Redacted output contains no grams.
31. Redacted output contains no ingredient names.
32. Redacted output contains no hidden numeric before/after values.
33. Pro/non-redacted output may contain exact grams.

## Missing data

34. Missing technical ingredient data blocks reliable optimization.
35. Missing cost blocks cost score but not technical optimization.
36. Low-confidence ingredients produce warnings.

## Product examples

37. G17-style Standard Gelato −12 should not be damaged.
38. G18-style Standard Gelato −13 should not be damaged.
39. S02-style Sorbet −12 should not receive dairy corrections.
40. V02-style Vegan −13 should not receive dairy corrections.
41. C01-style Chocolate should not be forced into standard protein-share hard failure.


## Batch rescue

42. Planned mode optimizes to requested target batch size.
43. Actual batch mode is triggered by any `actual_grams`.
44. Overpoured ingredient cannot be reduced after it is actual-added.
45. Optimizer can propose same-target rescue only if technically possible.
46. Optimizer can propose final batch increase only as an explicit user-confirmed decision.
47. Machine capacity blocks final batch increase when exceeded.
48. Product shortage before production returns stock-shortage decision, not fake recipe success.
49. Batch size changes are always visible in Optimizer output.
50. A recipe cannot silently change from 10 kg to 11.4 kg without user confirmation.

---

# 29. Non-goals v1.0

Optimizer v1.0 does not implement:

- full autonomous recipe creation from nothing
- customer questionnaire
- Mapper data enrichment
- internet price sourcing
- full flavor library
- granita optimization
- protein gelato optimization
- −18°C retail/storage optimization
- free-form AI recipe invention
- unverified ingredient generation

---

# 30. Final lock statement

```text
Optimizer is deterministic gram correction.
It uses RecipeIntent, Designer constraints, Product Profile gates and Temperature Regulator evaluation.
It must verify every proposal by recalculating the recipe.
It must not ask questions, invent data, invent grams, change ingredient truth, or fake perfection.
If a safe correction is impossible, return tradeoff/impossible and explain the constraint.
```
