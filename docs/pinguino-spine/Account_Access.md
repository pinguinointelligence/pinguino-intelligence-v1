# PINGUINO Intelligence — Account Access v1.0 FINAL

**Folder name:** `Account Access`  
**Status:** LOCKED ACCOUNT / ACCESS / PLAN-CAPABILITY BOUNDARY  
**Purpose:** define how Demo, Paid users, plan capabilities, saved preferences, saved recipes and production access connect to PINGUINO Recipe Intelligence without mixing authentication/billing into the recipe engine.  
**Audience:** Nicolas / implementation AI / UI / API / internal documentation  
**Rule:** Recipe Intelligence must not implement login, billing or subscription logic. It receives a resolved `AccessContext` and applies capability gates.

This document belongs to the active PINGUINO folder structure:

```text
Calculation Source of Truth
Core Backbone
Product Profile
Recipe Intent
Designer
User Flow
Account Access
Temperature Regulator
Optimizer
Integration Flow
Acceptance Tests
```

Do not mention external provider names in the recipe/engine logic. Login, payment and billing providers are external services and must stay outside the recipe calculation core.

---

# 1. Master rule

```text
Account Access decides what the user is allowed to see or do.
Recipe Intelligence decides what the recipe technically is.
AI explains only what the user is allowed to see.
```

Access must never change recipe truth.

Access can hide or reveal:

```text
exact grams
exact Auto Fix
saved full recipes
production batch rescue
stock shortage workflow
expert panels
```

But it must not change:

```text
Base Engine calculation
Product Profile routing
Temperature Regulator result
Optimizer verification
ingredient truth
```

---

# 2. What Account Access is

Account Access is the boundary between:

```text
user identity
subscription/plan
demo vs paid access
saved preferences
saved recipes
production rights
```

and the recipe backbone.

It answers:

```text
Who is the user?
Is this demo/free or paid?
What can this plan see?
Can this user save preferences?
Can this user see exact grams?
Can this user use Auto Fix?
Can this user use actual batch rescue?
Can this user save full production recipes?
```

---

# 3. What Account Access is not

Account Access is not:

```text
not Base Engine
not Designer
not Optimizer
not Temperature Regulator
not Mapper
not recipe calculator
not billing provider
not authentication implementation
```

It must not:

- calculate recipe metrics
- calculate grams
- generate recipes
- change product profile
- change target temperature
- change ingredient composition
- modify Mapper Basement
- invent subscription state
- trust client-side capability flags without server verification

---

# 4. AccessContext

Recipe Intelligence receives a resolved access object.

```ts
type AccessLevel =
  | "demo"
  | "paid";

interface AccessContext {
  userId: string | null;
  accountId?: string | null;

  accessLevel: AccessLevel;
  planId: string | null;
  planName?: string | null;

  capabilities: AccessCapabilities;

  isLoggedIn: boolean;
  isSubscriptionActive: boolean;

  source:
    | "anonymous_demo"
    | "logged_demo"
    | "paid_subscription"
    | "admin_override";

  warnings: AccessWarning[];

  contractVersion: "1.0.0";
}
```

`AccessContext` must be resolved before recipe output is rendered.

The recipe engine should not call billing/auth systems directly.

---

# 5. AccessCapabilities

```ts
interface AccessCapabilities {
  canStartUserFlow: boolean;

  canViewRecipeDirection: boolean;
  canViewTechnologyWarnings: boolean;

  canViewExactRecipeGrams: boolean;
  canViewExactCorrectionGrams: boolean;
  canViewExactBeforeAfterValues: boolean;

  canUseAutoFix: boolean;
  canApplyAutoFix: boolean;

  canSavePreferences: boolean;
  canSaveRecipeDrafts: boolean;
  canSaveFullRecipes: boolean;

  canUseActualBatchRescue: boolean;
  canUseStockShortageWorkflow: boolean;

  canUseProductionBatchMode: boolean;
  canViewExpertMetrics: boolean;
}
```

Capabilities are the only thing Recipe Intelligence should use for access decisions.

Do not hardcode business plan names inside engine logic.

---

# 6. Demo capabilities

Demo uses the same User Flow as Paid.

Demo can:

```text
start the recipe flow
answer product/flavor/temperature/texture/sweetness/style questions
save preferences if logged
save redacted recipe drafts if allowed
see product profile
see recipe direction
see general technological warnings
see general correction direction
```

Demo cannot see:

```text
exact ingredient grams
exact full recipe formula
exact Auto Fix grams
exact before/after correction values
production-ready recipe sheet
actual batch rescue grams
stock shortage exact correction plan
```

Suggested Demo capabilities:

```ts
const DEMO_CAPABILITIES: AccessCapabilities = {
  canStartUserFlow: true,

  canViewRecipeDirection: true,
  canViewTechnologyWarnings: true,

  canViewExactRecipeGrams: false,
  canViewExactCorrectionGrams: false,
  canViewExactBeforeAfterValues: false,

  canUseAutoFix: false,
  canApplyAutoFix: false,

  canSavePreferences: true,
  canSaveRecipeDrafts: true,
  canSaveFullRecipes: false,

  canUseActualBatchRescue: false,
  canUseStockShortageWorkflow: false,

  canUseProductionBatchMode: false,
  canViewExpertMetrics: false,
};
```

---

# 7. Paid capabilities

Paid users may access the full recipe workflow, depending on plan.

Paid can:

```text
see exact recipe grams
see exact Auto Fix grams
apply corrections
save full recipes
use actual batch rescue
use production batch mode
save recipe history
use stock shortage workflow
view technical panels if enabled
```

Suggested default Paid capabilities:

```ts
const PAID_CAPABILITIES: AccessCapabilities = {
  canStartUserFlow: true,

  canViewRecipeDirection: true,
  canViewTechnologyWarnings: true,

  canViewExactRecipeGrams: true,
  canViewExactCorrectionGrams: true,
  canViewExactBeforeAfterValues: true,

  canUseAutoFix: true,
  canApplyAutoFix: true,

  canSavePreferences: true,
  canSaveRecipeDrafts: true,
  canSaveFullRecipes: true,

  canUseActualBatchRescue: true,
  canUseStockShortageWorkflow: true,

  canUseProductionBatchMode: true,
  canViewExpertMetrics: true,
};
```

Future paid tiers may adjust capabilities, but the recipe backbone should only read `capabilities`.

---

# 8. Demo output rule

Demo must show the same high-level flow but with redacted production data.

Allowed Demo output:

```text
Product profile: Chocolate Gelato
Serving temperature: −12°C
Style: Classic
Texture: medium
Sweetness: sweet
Technology direction: this recipe needs chocolate-specific balance
General warning: full grams and exact Auto Fix are available in paid access
```

Forbidden Demo output:

```text
Milk 600 g
Cream 135 g
Dextrose 80 g
Add 34.7 g sucrose
Reduce cream by 20 g
Before NPAC 40.12 -> after NPAC 46.18 if exact values are plan-gated
```

If internal modules produce exact values, the API/UI must redact them before sending to Demo.

---

# 9. Paid output rule

Paid users may see:

```text
exact ingredient grams
exact recipe formula
exact batch size
exact cost if available
exact nutrition if available
Temperature Regulator result
Auto Fix exact corrections
before/after values
production rescue details
stock shortage recalculation
saved full recipes
```

If a plan disables a specific capability, capability gates override generic paid assumptions.

---

# 10. Saved preferences

Preferences can be saved for Demo and Paid users if `canSavePreferences = true`.

Saved preferences include:

```text
default product profile
quality tier
serving temperature
texture
sweetness
cost priority
batch size preference if user chooses
booster/paste/concentrate preference
dietary/allergen restrictions
language/unit preference if needed
```

Saved preferences do not include:

```text
exact ingredient grams
exact Auto Fix corrections
one-time actual batch rescue decisions
one-time stock shortage decisions
```

Those belong to saved recipes or production batch records.

---

# 11. Saved recipe drafts for Demo

Demo may save a redacted recipe draft if allowed.

A Demo draft may include:

```text
flavor
product profile
quality tier
serving temperature
texture
sweetness
recipe direction
warnings
created date
redacted flag
```

A Demo draft must not include:

```text
exact ingredient grams
exact correction grams
exact full formula
production-ready recipe
```

Suggested:

```ts
interface RedactedRecipeDraft {
  id: string;
  userId: string | null;

  flavorText: string;
  productProfile: ProductProfile;
  qualityTier: QualityTier;
  servingTemperatureC: -11 | -12 | -13;
  texturePreference: TexturePreference;
  sweetnessPreference: SweetnessPreference;

  redacted: true;
  exactGramsAvailable: false;

  directionSummary: string[];
  warnings: string[];

  createdAt: string;
}
```

---

# 12. Saved full recipes for Paid

Paid full recipes may include:

```text
exact ingredient grams
engine/config version
Product Profile
Recipe Intent
Designer plan
Temperature Regulator result
Optimizer result if applied
cost/nutrition if available
warnings
calculation snapshot
```

Suggested:

```ts
interface SavedFullRecipe {
  id: string;
  userId: string;
  accountId?: string | null;

  recipeName: string;
  flavorText: string;

  recipeInputSnapshot: RecipeInput;
  recipeResultSnapshot: RecipeResult;

  normalizedRecipeIntent: NormalizedRecipeIntent;
  recipeDesignPlan: RecipeDesignPlan;

  productProfile: ProductProfile;
  temperatureRegulatorResult: TemperatureRegulatorResult;

  optimizerResult?: OptimizerResult | null;

  engineVersion: string;
  configVersion: string;

  createdAt: string;
  updatedAt: string;
}
```

Saved recipes must be reproducible.

---

# 13. Production batch records

Production/actual batch mode is Paid-only unless future plans allow otherwise.

A production batch record may include:

```text
saved recipe id
target batch grams
machine capacity
planned grams
actual grams
batch rescue decision
stock shortage decision
Optimizer rescue result
final batch grams
warnings
operator notes
created date
```

Suggested:

```ts
interface ProductionBatchRecord {
  id: string;
  userId: string;
  savedRecipeId?: string | null;

  targetBatchG: number;
  currentActualBatchG: number;
  finalBatchG: number | null;

  context: "planning" | "actual_batch";

  actualLines: Array<{
    recipeLineId: string;
    ingredientId: string;
    plannedG: number;
    actualG: number | null;
  }>;

  rescueDecision?: ActualBatchRescueDecision | null;
  stockShortageDecision?: StockShortageDecision | null;

  optimizerResult?: OptimizerResult | null;

  status:
    | "in_progress"
    | "rescued"
    | "completed"
    | "tradeoff"
    | "stopped"
    | "failed";

  createdAt: string;
  updatedAt: string;
}
```

---

# 14. Login/auth boundary

Login implementation is outside Recipe Intelligence.

Account Access may receive:

```text
userId
accountId
isLoggedIn
subscription state
plan id
capabilities
```

It must not know or care whether login is via:

```text
email
Google
magic link
password
SSO
```

Recipe modules must not depend on login provider.

---

# 15. Subscription/billing boundary

Billing implementation is outside Recipe Intelligence.

Recipe Intelligence receives:

```text
accessLevel
planId
capabilities
isSubscriptionActive
```

It must not:

```text
call payment provider
create subscriptions
cancel subscriptions
read invoices
handle taxes
```

Those belong to billing/subscription module.

---

# 16. Capability gating rules

## Rule 1

Server/API must enforce capabilities.

Client-side hiding is not enough.

## Rule 2

If `canViewExactRecipeGrams = false`, exact grams must be removed before response is sent.

## Rule 3

If `canViewExactCorrectionGrams = false`, exact Auto Fix actions must be redacted.

## Rule 4

If `canUseActualBatchRescue = false`, production rescue endpoints must return access denied / upgrade prompt.

## Rule 5

If `canSaveFullRecipes = false`, user may save only redacted drafts if allowed.

## Rule 6

Capabilities must not change calculation truth, only visibility and allowed workflows.

---

# 17. API response redaction

Suggested response wrapper:

```ts
interface RecipeRunResponse {
  access: AccessContext;

  status:
    | "ready"
    | "optimized"
    | "acceptable_with_warnings"
    | "needs_user_decision"
    | "tradeoff"
    | "impossible"
    | "missing_data"
    | "unsupported";

  visibleResult: VisibleRecipeResult;

  hiddenResultRef?: string | null;

  upgradeReason?: UpgradeReason | null;
}
```

`VisibleRecipeResult` is shaped by capabilities.

Demo visible result:

```ts
interface DemoVisibleRecipeResult {
  redacted: true;
  productProfile: ProductProfile;
  summary: string[];
  warnings: string[];
  upgradeReason: "exact_grams_locked" | "auto_fix_locked" | null;
}
```

Paid visible result:

```ts
interface PaidVisibleRecipeResult {
  redacted: false;
  recipe: SavedFullRecipe | RecipeResult;
  optimizer?: OptimizerResult | null;
  warnings: string[];
}
```

---

# 18. Upgrade prompts

Upgrade prompts should be triggered by capability gates, not by recipe logic.

Example:

```text
Pełna gramatura i dokładny Auto Fix są dostępne w planie Pro.
```

Do not use pressure language inside recipe engine.

Suggested upgrade reason codes:

```ts
type UpgradeReason =
  | "exact_grams_locked"
  | "auto_fix_locked"
  | "save_full_recipe_locked"
  | "actual_batch_rescue_locked"
  | "production_mode_locked"
  | "expert_metrics_locked";
```

---

# 19. Access and User Flow connection

User Flow decides what questions are asked.

Account Access decides what result is visible.

Example:

```text
Demo:
Jakie lody dziś robimy?
→ Czekoladowe
OK, robimy Chocolate Gelato...
...
Output: direction only, no grams.

Paid:
same flow
Output: exact recipe grams.
```

The flow is the same; visibility differs.

---

# 20. Access and Optimizer connection

Optimizer may internally produce exact corrections.

Access layer decides whether exact corrections are visible.

Rules:

```text
Demo -> redacted optimizer output
Paid -> exact optimizer output if plan allows
```

Optimizer itself should support redaction or the API layer must redact at source before returning response.

Never send exact correction grams to Demo and rely on UI to hide them.

---

# 21. Access and saved defaults

Demo and Paid can save defaults if logged and allowed.

If anonymous Demo is allowed, system may store preferences locally or ask user to log in.

Rules:

```text
anonymous_demo -> may use local/session preferences only
logged_demo -> may save preferences to user account
paid -> may save preferences and full recipes
```

Do not block the whole recipe flow just because Demo is anonymous, unless product strategy requires login.

---

# 22. Access and saved recipes

Demo:

```text
can save redacted draft only
```

Paid:

```text
can save full recipe with exact grams
```

If user downgrades from Paid to Demo:

```text
do not delete saved full recipes
do not expose exact grams unless capability allows
show locked state / upgrade required
```

Saved data remains owned by user; visibility follows current capability.

---

# 23. Access downgrade / expired subscription

If subscription expires:

```text
accessLevel = demo
isSubscriptionActive = false
```

Behavior:

```text
user can still log in
saved preferences remain available
saved full recipes remain stored
exact grams become locked if plan no longer allows them
new exact Auto Fix is disabled
production rescue disabled
```

Do not delete user data.

---

# 24. Admin override

Admin override may exist for testing/support.

Rules:

```text
must be explicit
must be logged
must not change recipe calculation
must not silently expose user data
must not be available to normal users
```

---

# 25. Acceptance tests

## Access context

1. AccessContext is required before rendering recipe output.
2. Recipe engine does not call auth provider.
3. Recipe engine does not call billing provider.
4. Recipe modules read capabilities, not plan names.
5. Server/API enforces capabilities.

## Demo

6. Demo can start User Flow.
7. Demo can save preferences if allowed.
8. Demo can save redacted drafts if allowed.
9. Demo cannot see exact recipe grams.
10. Demo cannot see exact Auto Fix grams.
11. Demo cannot apply Auto Fix.
12. Demo cannot use actual batch rescue.
13. Demo cannot save full recipe with exact grams.

## Paid

14. Paid can see exact recipe grams.
15. Paid can see exact Auto Fix grams.
16. Paid can apply Auto Fix.
17. Paid can save full recipes.
18. Paid can use actual batch rescue.
19. Paid can use stock shortage workflow.
20. Paid can save production batch records.

## Redaction

21. Redacted response contains no exact grams.
22. Redacted response contains no exact correction grams.
23. Redacted response contains no hidden numeric before/after correction values.
24. Redacted response contains upgrade reason code.
25. Exact values are not sent to client when not allowed.

## Saved preferences

26. Preferences save product profile, quality tier, serving temperature, texture, sweetness, cost priority.
27. Preferences do not save exact ingredient grams.
28. Preferences do not save one-time actual batch decisions.

## Saved recipes

29. Demo saved draft is redacted.
30. Paid saved recipe includes exact recipe snapshot.
31. Saved full recipe includes engine/config version.
32. Saved full recipe remains reproducible.
33. Downgraded user cannot view exact grams if capability removed.
34. Downgrade does not delete recipes.

## Production

35. Production batch mode requires capability.
36. Actual batch rescue requires capability.
37. Stock shortage workflow requires capability.
38. Production batch stores actual grams and rescue decisions.
39. Production batch does not expose exact data when access is not allowed.

## AI/API

40. AI does not reveal exact grams when capability denies it.
41. AI does not invent hidden exact values.
42. AI upgrade prompt is based on `UpgradeReason`.
43. AI can explain locked access without changing recipe truth.

---

# 26. Non-goals v1.0

Account Access v1.0 does not implement:

```text
actual login provider
payment provider integration
tax invoices
billing portal
full customer CRM
team/member permissions
enterprise roles
admin panel UI
```

These are separate future modules.

---

# 27. Final lock statement

```text
Account Access controls visibility and workflow permissions.
Recipe Intelligence receives AccessContext and capabilities.
Demo and Paid use the same recipe flow, but Demo output is redacted.
Paid output can include exact grams and production features.
Login and billing are separate modules.
If a rule is missing, stop and ask.
```
