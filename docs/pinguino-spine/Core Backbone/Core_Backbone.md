# PINGUINO Intelligence — Core Backbone v1.0 FINAL

**Folder name:** `Core Backbone`  
**Status:** LOCKED ARCHITECTURE SPINE  
**Purpose:** define the current top-down PINGUINO system backbone and show how all locked documents fit together.  
**Audience:** Nicolas / implementation AI / future API layer / internal documentation  
**Rule:** this document supersedes `PINGUINO_Core_Backbone_v0_1_FINAL`. Do not add the old v0.1 document as an active backbone document.

This document is the current architecture spine for the locked folder structure:

```text
Calculation Source of Truth
Core Backbone
Product Profile
Recipe Intent
Designer
Temperature Regulator
Optimizer
Integration Flow
Acceptance Tests
```

Do not mention external tool/product names in code, prompts, UI or documentation. Use neutral wording such as **external benchmark data**, **calibration data** or **reference dataset**.

---

# 1. Decision about the old v0.1 document

`PINGUINO_Core_Backbone_v0_1_FINAL` was useful as the first backbone draft.

It is now outdated because the current backbone also includes:

```text
Designer
Optimizer
Integration Flow
Acceptance Tests
Batch size / actual batch rescue
Stock shortage flow
Product-profile-aware optimizer rules
RecipeIntent v1.0
```

Therefore:

```text
Do not add PINGUINO_Core_Backbone_v0_1_FINAL as an active document.
Archive it or delete it.
Use this Core Backbone v1.0 as the active architecture document.
```

---

# 2. Master architecture rule

```text
The Base Engine calculates.
Product Profile decides which product gates apply.
Recipe Intent normalizes the user's choices.
Designer creates product strategy and constraints.
Temperature Regulator evaluates product + serving temperature.
Optimizer adjusts grams only through deterministic verified correction.
Integration Flow defines the execution order.
Acceptance Tests enforce the contract.
AI explains and routes; AI never calculates.
```

---

# 3. Current folder responsibility map

| Folder / document | Responsibility |
|---|---|
| `Calculation Source of Truth` | Defines deterministic calculation truth and module ownership |
| `Core Backbone` | Defines the full architecture spine and document hierarchy |
| `Product Profile` | Defines supported product profiles and active/disabled gates |
| `Recipe Intent` | Defines normalized user intent contract |
| `Designer` | Defines product strategy, flavor strategy and optimizer constraints |
| `Temperature Regulator` | Defines product + temperature target settings |
| `Optimizer` | Defines deterministic gram correction and production rescue policy |
| `Integration Flow` | Defines complete end-to-end execution order |
| `Acceptance Tests` | Defines pass/fail rules and release gate tests |

No module may duplicate another module's responsibility.

---

# 4. Final execution spine

```text
User input / saved defaults
        ↓
Recipe Intent
        ↓
Designer
        ↓
Product Profile
        ↓
Mapper / Ingredient Data
        ↓
Base Engine
        ↓
Temperature Regulator
        ↓
Decision Router
        ↓
Optimizer if needed
        ↓
Base Engine recalculation
        ↓
Temperature Regulator reevaluation
        ↓
Final recipe / warning / tradeoff / impossible
```

Every recipe must pass through this spine unless a documented unsupported/missing-data state stops the flow.

---

# 5. Module boundaries

## 5.1 Recipe Intent

Owns:

```text
normalization of user input
saved defaults
product profile selection candidate
quality tier
serving temperature
texture preference
sweetness preference
cost priority
batch size intent
warnings for invalid input
```

Must not:

```text
calculate recipe chemistry
optimize grams
verify ingredient data
invent missing values
```

## 5.2 Designer

Owns:

```text
flavor strategy
quality strategy
hero ingredient policy
allowed and forbidden ingredient families
natural-only / booster strategy
product-specific strategy
RecipeDesignPlan
optimizer constraints
```

Must not:

```text
calculate POD/PAC/NPAC
calculate ice fraction
calculate cost
calculate nutrition
optimize grams
modify Mapper data
override Product Profile
override Temperature Regulator
```

## 5.3 Product Profile

Owns:

```text
supported product profiles
legacy profile normalization
active gates
disabled gates
hard/soft/advisory gate levels
designer selection
optimizer selection
temperature regulator selection
```

Must not:

```text
calculate recipe chemistry
change ingredient data
invent temperature bands
```

## 5.4 Base Engine

Owns:

```text
composition
water
solids
fat
protein
lactose
sugar split
POD
PAC
recipe-level NPAC
ice fraction
nutrition
cost
warnings
indicators
scores
```

Must not:

```text
decide product strategy
ask user questions
infer quality tier
route chocolate/vegan/sorbet
change active gates
optimize grams
```

## 5.5 Temperature Regulator

Owns:

```text
product-specific target bands
temperature-specific clean centers
too hard / correct / too soft interpretation
temperature warnings
correction direction
temperature score / status
```

Must not:

```text
change recipe chemistry
change ingredient values
calculate new POD/PAC/NPAC
modify recipe grams
```

## 5.6 Optimizer

Owns:

```text
deterministic gram correction
candidate selection by product profile
verification by recalculating Base Engine
reevaluation by Temperature Regulator
actual-batch rescue
batch volume decision
stock shortage decisions
tradeoff/impossible output
redaction policy
```

Must not:

```text
ask customer questions directly
invent exact grams
change ingredient data
change product profile
override Designer constraints
override Temperature Regulator
fake perfect recipes
```

## 5.7 Mapper

Owns:

```text
ingredient/product data
product intake
composition data
POD/PAC source data
nutrition/cost/allergen data
confidence/source/provenance
duplicate prevention
```

Must not:

```text
design recipes
decide product profile
decide quality tier
optimize grams
modify locked Mapper Basement automatically
```

## 5.8 AI/API

Owns:

```text
explanation
routing
simple questions
copy generation
warning presentation
user-decision prompts
```

Must not:

```text
invent exact grams
invent POD/PAC/NPAC
invent costs
invent ingredient composition
expose redacted values
claim unsupported profiles are supported
```

---

# 6. Supported product profiles v1.0

PINGUINO v1.0 supports exactly:

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
fresh
storage_minus18
frozen_drinks
```

Unsupported products must return warning / unsupported state.  
They must not silently map to supported profiles.

---

# 7. Product profile ownership

| Product profile | Designer | Optimizer | Temperature Regulator | Base Engine |
|---|---|---|---|---|
| `standard_gelato` | Gelato Designer | Gelato Optimizer | GELATO Temperature Regulator | shared |
| `sorbet` | Sorbet Designer | Sorbet Optimizer | SORBET Temperature Regulator | shared |
| `vegan_gelato` | Vegan Designer | Vegan Optimizer | VEGAN Temperature Regulator | shared |
| `chocolate_gelato` | Chocolate Designer | Chocolate Optimizer | CHOCOLATE Temperature Regulator | shared |

---

# 8. Temperature Regulator ownership

Temperature Regulator is split into four active implementation references:

```text
Temperature_Regulator_GELATO
Temperature_Regulator_SORBET
Temperature_Regulator_VEGAN
Temperature_Regulator_CHOCOLATE
```

Each regulator supports:

```text
−11°C
−12°C
−13°C
```

Temperature Regulator is not a separate Base Engine.  
It evaluates Base Engine result using product-specific target settings.

---

# 9. Current known temperature anchors

## Standard Gelato

```text
G12 = clean −11°C anchor
G17 = final clean −12°C reference
G18 = final clean −13°C reference
G15 = lower −12°C anchor
G11 = lower/center −13°C anchor
```

## Sorbet

```text
S01 = final −11°C reference
S02 = final −12°C reference
S03 = final −13°C reference
```

## Vegan Gelato

```text
V02 fixed = final Vegan −13°C reference
V02-AUTO = medium evidence / optimizer behavior evidence
Vegan −11°C and −12°C = locked PINGUINO internal v1.0 settings
```

## Chocolate Gelato

```text
C01 fixed = chocolate stress/reference evidence
C01 optimized = lower/clean optimizer evidence
Chocolate −11°C and −12°C = locked PINGUINO internal v1.0 settings
Chocolate −13°C = locked product-specific settings
```

---

# 10. Batch size and production reality

Batch size is part of the backbone.

Every recipe must resolve:

```text
target_batch_grams
machine_capacity_grams
```

The system must ask how much the user wants to make:

```text
1 kg
5 kg
10 kg
25 kg
50 kg
custom
```

Batch size is production intent, not a chemistry constant.

---

# 11. Actual batch rescue

Actual batch starts when any recipe line has:

```text
actual_grams !== null
```

Then:

```text
context = actual_batch
```

Rules:

```text
actual grams override planned grams
already added material cannot be reduced
rescue is add-only for actual-added lines
batch size may need to increase
user confirmation is required for volume increase
machine capacity is hard constraint
```

If the user overpours, the system must ask:

```text
1. rescue same target batch
2. increase final batch volume
3. scale remaining ingredients to actual batch
4. best possible tradeoff
5. stop batch
```

Optimizer consumes the decision.  
Optimizer does not ask directly.

---

# 12. Stock shortage

If user has insufficient ingredient stock before adding it, the system must ask:

```text
1. reduce final batch size
2. keep target and mark missing
3. replace with verified alternative if allowed
4. continue as lower intensity with warning
5. stop and buy/add missing product
```

Rules:

```text
do not invent missing stock
do not silently replace ingredient
do not silently reduce hero ingredient
do not silently downgrade quality tier
replacement requires verified ingredient data
```

---

# 13. Stabilizer policy

For all active v1.0 production profiles:

```text
standard_gelato
sorbet
vegan_gelato
chocolate_gelato
```

stabilizer is required in final good production formulas.

0 g stabilizer may appear only as:

```text
failed input
reference artifact
manual test case
tradeoff warning
optimizer rejection
```

It must not be accepted as final good output.

---

# 14. Quality tier backbone

```text
Eco      = low cost but technically valid
Classic  = balanced commercial default
Premium  = higher real ingredient and better mouthfeel
Signature = maximum perceived flavor and best product experience
```

Signature does not mean:

```text
maximum grams of hero ingredient at any cost
```

Signature must still pass technical gates.

---

# 15. AI non-improvisation rule

AI and implementation assistants must not invent rules.

If a rule is missing:

```text
stop and ask
```

Forbidden:

```text
AI calculates exact grams
AI calculates POD/PAC/NPAC
AI invents ingredient composition
AI exposes redacted optimizer values
AI silently changes product profile
AI silently changes target batch size
AI calls tradeoff perfect
```

---

# 16. Migration from current repo

Current repo contains useful implemented foundations:

```text
deterministic Base Engine
composition
POD
PAC/NPAC
ice fraction
status classification
nutrition/cost
scoring
calculateRecipe
correction solver
actual-batch context
redaction
```

Do not rewrite working deterministic core blindly.

Migration target:

```text
keep Base Engine shared
add Product Profile layer
add Recipe Intent layer
add Designer layer
add Temperature Regulator configs
connect Optimizer to Product Profile + Designer + Regulator
add Integration Flow router
add Acceptance Tests
```

Old concept to supersede:

```text
single active −11°C-only engine / preview future profiles
```

New concept:

```text
shared Base Engine
+
product-specific Temperature Regulator settings for −11°C / −12°C / −13°C
```

---

# 17. Active document set

The active v1.0 backbone documents are:

```text
Calculation_Source_of_Truth.md
Core_Backbone.md
Product_Profile.md
Recipe_Intent.md
Designer.md
Temperature_Regulator_GELATO.md
Temperature_Regulator_SORBET.md
Temperature_Regulator_VEGAN.md
Temperature_Regulator_CHOCOLATE.md
Optimizer.md
Integration_Flow.md
Acceptance_Tests.md
```

Archive/delete:

```text
PINGUINO_Core_Backbone_v0_1_FINAL.md
```

Do not use old v0.1 Core Backbone as an active duplicate.

---

# 18. Implementation order

Nicolas should implement in this order:

```text
1. Types and contracts
2. Product Profile Registry
3. Recipe Intent normalization
4. Designer output
5. Temperature Regulator config registry
6. Integration Flow router
7. Optimizer policy integration
8. Actual-batch rescue branch
9. Stock-shortage branch
10. AI/API guardrails
11. Acceptance Tests
12. UI/API wiring
```

Do not start random optimizer changes before Product Profile + Recipe Intent + Designer + Regulator are stable.

---

# 19. Acceptance gate

Implementation is accepted only if:

```text
all core documents exist
all Product Profile tests pass
all Recipe Intent tests pass
all Designer tests pass
all Temperature Regulator tests pass
all Optimizer tests pass
all Integration Flow tests pass
all actual-batch rescue tests pass
all stock-shortage tests pass
all AI/API guardrail tests pass
golden recipes remain stable
```

Do not weaken tests to make code pass.

---

# 20. Final lock statement

```text
Core Backbone is the architecture spine.
It defines module ownership, document hierarchy and execution order.
The old v0.1 Core Backbone is superseded.
The active system is: Recipe Intent → Designer → Product Profile → Base Engine → Temperature Regulator → Optimizer → Integration Flow → Acceptance Tests.
If a rule is missing, stop and ask.
