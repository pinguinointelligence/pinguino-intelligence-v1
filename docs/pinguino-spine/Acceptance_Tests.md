# PINGUINO Intelligence — Acceptance Tests v1.0 FINAL

**Folder name:** `Acceptance Tests`  
**Status:** LOCKED ACCEPTANCE TEST MATRIX  
**Purpose:** define the minimum tests and pass/fail rules required before Nicolas or any AI/code assistant may implement or change the PINGUINO backbone.  
**Audience:** Nicolas / implementation AI / QA / future API layer / internal documentation  
**Rule:** if a change violates any locked acceptance test, the implementation is not accepted.

This document validates the locked folder structure:

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

It is the final guardrail document for the current backbone.

Do not mention external tool/product names in code, prompts, UI or documentation. Use neutral wording such as **external benchmark data**, **calibration data** or **reference dataset**.

---

# 1. Master pass/fail rule

```text
A recipe feature is accepted only if:
1. deterministic calculation remains stable,
2. Product Profile gates are respected,
3. Recipe Intent is normalized,
4. Designer does not calculate,
5. Temperature Regulator does not change chemistry,
6. Optimizer verifies every correction,
7. actual-batch rescue works,
8. AI never invents exact numbers,
9. unsupported behavior is blocked or warned,
10. all relevant tests pass.
```

No partial implementation should be shipped as “done”.

---

# 2. Test categories

PINGUINO v1.0 requires these test groups:

```text
A. Document / contract tests
B. Base Engine tests
C. Product Profile tests
D. Recipe Intent tests
E. Designer tests
F. Temperature Regulator tests
G. Optimizer tests
H. Integration Flow tests
I. Actual batch / production rescue tests
J. Stock shortage tests
K. AI/API guardrail tests
L. Regression / golden recipe tests
M. Migration tests
```

---

# 3. Document / contract tests

These tests prevent AI/code from drifting away from the locked documents.

## Required documents

The following documents must exist:

```text
Calculation Source of Truth
Core Backbone
Product Profile
Recipe Intent
Designer
Temperature Regulator / GELATO
Temperature Regulator / SORBET
Temperature Regulator / VEGAN
Temperature Regulator / CHOCOLATE
Optimizer
Integration Flow
Acceptance Tests
```

## Required document phrases

Each core document must include:

```text
Status
Purpose
Audience
Rule
What this module does
What this module must not do
Acceptance tests
Final lock statement
```

## Forbidden document behavior

Documents must not:

- mention external product/tool names
- claim unsupported profiles are working
- claim Granita is v1.0 supported
- claim AI calculates numbers
- claim Optimizer asks customer questions directly
- claim Temperature Regulator changes recipe chemistry
- claim Mapper decides product strategy
- reintroduce ingredient-level NPAC as source of truth
- allow 0 g stabilizer as final good production formula

---

# 4. Base Engine acceptance tests

Base Engine must remain deterministic and strategy-free.

## Determinism

1. Same input returns same output.
2. Input is not mutated.
3. No NaN or Infinity appears anywhere in output.
4. Empty / zero-mass recipe returns safe null or correction states.
5. Every result is stamped with engine/config version.

## Effective grams

6. `actual_grams` overrides `planned_grams`.
7. If `actual_grams` is null, `planned_grams` is used.
8. Actual 0 g counts as actual and overrides planned.
9. Difference is calculated as actual − planned.
10. All calculations use effective grams.

## Composition

11. Water is calculated from ingredient water percent.
12. Solids are calculated from ingredient solids percent.
13. Fat is calculated from ingredient fat percent.
14. Protein is calculated from ingredient protein percent.
15. Lactose is calculated from ingredient lactose percent.
16. Alcohol is separate from water and solids.
17. Water + solids logic must not silently include alcohol.
18. Sugar types remain separate.
19. Total sugar alone is never sufficient for POD/PAC logic.

## POD

20. Stored `pod_value` wins when present.
21. If no stored `pod_value`, typed sugar breakdown is used.
22. POD is not calculated from total sugar alone.
23. Sucrose reference behavior remains stable.
24. Dextrose/glucose are less sweet than sucrose.
25. Fructose is sweeter than sucrose.
26. Lactose is much less sweet than sucrose.

## PAC / NPAC

27. Stored `pac_value` wins when present.
28. Ingredient-level `npac_value` is ignored for new logic.
29. Recipe-level NPAC is calculated by the engine.
30. NPAC canonical basis is `per_water_mass`.
31. Alcohol contributes to NPAC when alcohol percent exists.
32. Salt contributes to NPAC when salt percent exists.
33. PAC and NPAC are separate from POD.
34. No ingredient-level NPAC table is reintroduced.

## Ice fraction

35. Ice fraction uses product category, serving temperature and NPAC.
36. Higher NPAC lowers ice fraction.
37. Lower NPAC raises ice fraction.
38. Invalid/missing NPAC returns safe null/correction state.
39. Uncalibrated anchors must be explicit config, not inline math.
40. No fake category/temperature truth is silently invented.

## Status and scoring

41. Status classification converts numbers into indicators.
42. Status classification does not change numbers.
43. Missing values classify safely.
44. Band provenance is preserved.
45. Scores are derived views and do not change recipe metrics.
46. Overall score is stability-gated.
47. Unstable recipe cannot hide behind high flavor/cost score.

## Cost

48. Missing cost is incomplete.
49. Missing cost is not treated as 0.
50. Explicit 0 cost means genuinely free.
51. Cost per kg is calculated only when complete.
52. Serving costs use cost per kg.
53. Unknown cost produces warning / incomplete state.

## Nutrition

54. Stored kcal is used when available and greater than 0.
55. Atwater fallback is used when kcal is missing.
56. Saturated fat is null unless all fat-bearing ingredients provide required data.
57. Zero-mass batch returns null nutrition.

---

# 5. Product Profile acceptance tests

Supported product profiles v1.0:

```text
standard_gelato
sorbet
vegan_gelato
chocolate_gelato
```

## Profile existence

1. Registry includes exactly the four v1.0 profiles.
2. `granita` is not active in v1.0.
3. `protein_gelato` is not active in v1.0.
4. `fresh` / `storage_minus18` are not active product profiles.

## Legacy normalization

5. `gelato` normalizes to `standard_gelato`.
6. `milk_gelato` normalizes to `standard_gelato`.
7. `fruit_gelato` normalizes to `standard_gelato`.
8. `nut_gelato` normalizes to `standard_gelato`.
9. `vegan` normalizes to `vegan_gelato`.
10. `chocolate` normalizes to `chocolate_gelato`.
11. Unsupported profiles return warning.
12. Unsupported profiles are not silently mapped.

## Gates

13. `standard_gelato` has dairy gates active.
14. `sorbet` disables lactose gate.
15. `sorbet` disables lactose sanding gate.
16. `sorbet` disables dairy protein gates.
17. `vegan_gelato` disables lactose gate.
18. `vegan_gelato` disables dairy protein gates.
19. `chocolate_gelato` keeps chocolate-specific gates.
20. `chocolate_gelato` marks protein share as soft/advisory.
21. Chocolate is not treated as ordinary standard gelato when major chocolate intent exists.
22. Product Profile Registry is the single source of gate activation.

---

# 6. Recipe Intent acceptance tests

Recipe Intent creates `NormalizedRecipeIntent`.

## Defaults

1. Empty input returns defaults.
2. Default product profile is `standard_gelato`.
3. Default quality tier is `classic`.
4. Default serving temperature is `−12°C`.
5. Default texture preference is `medium`.
6. Default sweetness preference is `balanced`.
7. Default cost priority is `balanced`.
8. Default naturalOnly is false.
9. Default allowBoosters is true.

## Saved defaults

10. Saved defaults apply when explicit input is missing.
11. Explicit current input overrides saved defaults.
12. Saved defaults never suppress warnings.
13. Saved defaults never override explicit vegan/sorbet/chocolate intent.

## Validation

14. Only −11°C / −12°C / −13°C are accepted.
15. Unsupported temperature returns warning.
16. −18°C is unsupported in v1.0.
17. Unsupported product profile returns warning.
18. Granita returns unsupported warning.
19. Contract version is present.

## Flavor

20. Chocolate terms are detected.
21. Strawberry / mango / raspberry are fruit.
22. Pistachio / hazelnut / almond are nut.
23. Vanilla routes to vanilla/neutral.
24. Unknown flavor does not invent strategy.

## Aliases

25. `hard` aliases to `firm`.
26. `normal` texture aliases to `medium`.
27. `sweet` aliases to `high`.
28. `normal` sweetness aliases to `balanced`.
29. `cheap` aliases to `low` cost priority.

## Purity

30. Recipe Intent normalization is pure.
31. It does not call Base Engine.
32. It does not call Optimizer.
33. It does not call Mapper/database.
34. It does not calculate recipe metrics.

---

# 7. Designer acceptance tests

Designer creates:

```text
NormalizedRecipeIntent
RecipeDesignPlan
```

## Core

1. Designer is pure and deterministic.
2. Same input returns same output.
3. Designer does not call Base Engine.
4. Designer does not call Optimizer.
5. Designer does not call Mapper/database.
6. Designer does not calculate POD/PAC/NPAC.
7. Designer does not calculate ice fraction.
8. Designer does not calculate cost.
9. Designer does not calculate nutrition.
10. Designer does not output final verified grams.

## Routing

11. Empty input routes to `standard_gelato`.
12. Chocolate gelato routes to `chocolate_gelato`.
13. Vegan chocolate stays `vegan_gelato`.
14. Mango sorbet stays `sorbet`.
15. Granita returns unsupported warning.
16. Explicit sorbet is not overwritten by chocolate flavor.
17. Explicit vegan is not overwritten by chocolate flavor.

## Product-specific behavior

18. Gelato Designer keeps dairy gates active through Product Profile.
19. Sorbet Designer disables dairy correction families.
20. Vegan Designer disables dairy correction families.
21. Chocolate Designer treats protein share as soft/advisory.
22. Chocolate Designer does not treat chocolate as just a flavor label.

## Quality tier

23. Eco creates low-cost strategy.
24. Classic creates balanced strategy.
25. Premium protects hero ingredient.
26. Signature strongly protects hero ingredient.
27. Signature means maximum perceived quality/flavor, not blind maximum hero grams.
28. Natural-only disables boosters unless explicit override.
29. `allowBoosters = false` forbids booster families.

## Handoff

30. Designer output contains product profile.
31. Designer output contains designer profile.
32. Designer output contains flavor strategy.
33. Designer output contains quality strategy.
34. Designer output contains allowed ingredient families.
35. Designer output contains forbidden ingredient families.
36. Designer output contains hero policy.
37. Designer output contains optimizer constraints.
38. Designer output contains warnings.
39. Designer output contains contract version.

## Safety

40. Soft texture does not mean unstable.
41. Firm texture does not mean icy.
42. High sweetness does not exceed product-safe POD band.
43. 0 g stabilizer is never recommended as final good production strategy.
44. Designer does not invent missing ingredient data.
45. Designer does not modify Mapper Basement.

---

# 8. Temperature Regulator acceptance tests

Temperature Regulator evaluates, never calculates chemistry.

## Core

1. Same recipe values remain constant across temperature/profile panels.
2. Regulator changes interpretation only.
3. Regulator does not change POD.
4. Regulator does not change PAC.
5. Regulator does not change NPAC.
6. Regulator does not change water/fat/solids.
7. Regulator does not change cost.
8. Regulator does not change ingredient data.

## Routing

9. `standard_gelato + −11°C` uses Standard Gelato −11 settings.
10. `standard_gelato + −12°C` uses Standard Gelato −12 settings.
11. `standard_gelato + −13°C` uses Standard Gelato −13 settings.
12. `sorbet + −12°C` uses Sorbet −12 settings.
13. `vegan_gelato + −13°C` uses Vegan −13 settings.
14. `chocolate_gelato + −13°C` uses Chocolate −13 settings.
15. No product uses Standard Gelato bands by default unless its profile is Standard Gelato.

## Standard Gelato references

16. G12 is correct for Standard Gelato −11°C.
17. G12 is too hard for −12°C.
18. G12 is far too hard for −13°C.
19. G17 is clean reference for Standard Gelato −12°C.
20. G18 is clean reference for Standard Gelato −13°C.
21. G11 remains lower/center −13 anchor.
22. G15 remains lower −12 anchor.

## Sorbet references

23. S01 is correct for Sorbet −11°C.
24. S01 is too hard for Sorbet −12°C.
25. S02 is correct for Sorbet −12°C.
26. S02 is too hard for Sorbet −13°C.
27. S03 is correct for Sorbet −13°C.
28. Sorbet dairy gates stay disabled.

## Vegan references

29. V02 fixed passes Vegan −13°C.
30. Vegan −11/−12 are locked PINGUINO internal settings.
31. Vegan does not fail because lactose is 0.
32. Vegan does not fail because dairy protein is 0.
33. Vegan uses plant-base structure gates.

## Chocolate references

34. C01 routes to Chocolate Gelato settings.
35. Chocolate POD band allows chocolate-specific sweetness range.
36. Chocolate protein share is soft/advisory.
37. Chocolate is not forced into standard protein-share hard failure.
38. Chocolate Optimizer must not overcorrect with SMP if lactose sanding breaks.

---

# 9. Optimizer acceptance tests

Optimizer is deterministic gram correction.

## Core

1. Same input returns same proposals.
2. Original input is not mutated.
3. No NaN or Infinity in optimizer output.
4. Every accepted proposal applies hypothetical actions.
5. Every accepted proposal reruns Base Engine.
6. Every accepted proposal reruns Temperature Regulator.
7. Every accepted proposal improves target metric.
8. No accepted proposal worsens higher-priority metric.
9. Already valid recipe returns no-action / no damage.
10. Repeated apply converges.

## Context

11. Planning context may reduce unlocked lines if policy allows.
12. Actual-batch context never reduces actual-added lines.
13. Any line with actual_grams cannot be reduced.
14. Locked lines are never changed.
15. Main/hero ingredient follows Designer policy.
16. Machine capacity is respected.
17. Excluded ingredients are never used.

## Product profiles

18. Standard Gelato may use dairy correction families.
19. Sorbet does not use dairy correction families.
20. Vegan does not use dairy correction families.
21. Chocolate allows chocolate/cocoa correction families.
22. Chocolate protein-share soft/advisory behavior is respected.

## Priority

23. No cost improvement may break technical stability.
24. No POD fix may break NPAC/ice fraction.
25. No NPAC fix may over-sweeten beyond safe POD band.
26. No solids fix may break fat/water/lactose sanding.
27. No protein fix may break lactose sanding.

## Stabilizer

28. Standard Gelato final good result cannot have 0 g stabilizer.
29. Sorbet final good result cannot have 0 g stabilizer.
30. Vegan Gelato final good result cannot have 0 g stabilizer.
31. Chocolate Gelato final good result cannot have 0 g stabilizer.
32. 0 g stabilizer can only appear as failed input / artifact / warning / rejection.

## Tradeoff

33. Impossible recipe returns tradeoff/impossible.
34. Locked hero blocking correction returns tradeoff.
35. Machine capacity blocking correction returns tradeoff.
36. Missing candidate returns impossible/tradeoff.
37. Optimizer does not fake perfection.

## Redaction

38. Redacted output contains no exact grams.
39. Redacted output contains no ingredient names.
40. Redacted output contains no before/after numbers.
41. Pro/non-redacted output may contain exact grams.
42. AI/API cannot reconstruct hidden values from redacted output.

---

# 10. Actual batch / production rescue acceptance tests

This prevents real production mistakes from being handled incorrectly.

## Context detection

1. If no `actual_grams` exist, context is `planning`.
2. If any `actual_grams` exists, context is `actual_batch`.
3. Actual grams override planned grams.
4. Current actual batch mass is calculated from effective grams.
5. Batch mismatch warning is generated when actual differs from target beyond tolerance.

## Already-added rule

6. Actual-added material is never reduced.
7. Overpoured sugar cannot be removed.
8. Overpoured cream cannot be removed.
9. Overpoured water cannot be removed.
10. Actual batch rescue is add-only for actual-added lines.

## User decision

11. System asks for rescue decision when actual batch deviates.
12. Options include same target, increase volume, scale remaining, best-possible tradeoff, stop.
13. Optimizer consumes selected decision.
14. Optimizer does not ask directly.
15. AI/API does not silently pick for the user.

## Same-target rescue

16. Same-target rescue is allowed only if technically possible.
17. Same-target rescue fails if already-added mass makes target impossible.
18. Same-target rescue must respect machine capacity.
19. Same-target rescue must not fake removal.

## Volume increase

20. Volume increase requires explicit user confirmation.
21. Proposed final batch mass is shown.
22. Original target batch mass is shown.
23. Machine capacity is checked.
24. If capacity exceeded, capacity-blocked tradeoff is returned.
25. Final batch size never changes silently.

## Scale remaining

26. Already-added lines remain fixed.
27. Only remaining/unadded lines may be changed.
28. Final batch may differ if user approves.
29. Recalculated remaining ingredients are verified by Base Engine.

## Best possible tradeoff

30. Best-possible result exposes unresolved gates.
31. Best-possible result is not labeled ideal.
32. Best-possible result keeps warnings visible.

---

# 11. Stock shortage acceptance tests

## Detection

1. If available stock is lower than planned amount, stock shortage is detected.
2. Stock shortage is detected before ingredient is added.
3. Stock shortage does not become actual batch unless actual grams are recorded.

## User options

4. User can reduce batch to available stock.
5. User can keep target batch and mark ingredient missing.
6. User can request verified replacement.
7. User can accept lower intensity warning.
8. User can stop and buy/add product.

## Rules

9. Missing stock is not invented.
10. Replacement requires verified ingredient data.
11. Hero ingredient is not silently reduced.
12. Quality tier is not silently downgraded.
13. Product profile is not silently changed.
14. Batch reduction recalculates target batch safely.
15. Final output shows changed batch size.

---

# 12. Integration Flow acceptance tests

## End-to-end order

1. Raw input cannot go directly to Optimizer.
2. Raw input must pass Recipe Intent normalization.
3. Designer must run before Optimizer.
4. Product Profile must validate gates before Regulator/Optimizer.
5. Base Engine must run before Temperature Regulator.
6. Temperature Regulator must run before Optimizer.
7. Optimizer must rerun Base Engine after corrections.
8. Optimizer must rerun Temperature Regulator after corrections.
9. Final result must include final status.
10. Final result must include warnings/tradeoffs if present.

## Final statuses

Allowed final statuses:

```text
ready
optimized
acceptable_with_warnings
needs_user_decision
tradeoff
impossible
missing_data
unsupported
```

No other final status is accepted without contract update.

---

# 13. AI/API guardrail tests

AI/API may explain, route and ask questions.

AI/API must not:

1. invent exact grams
2. invent POD
3. invent PAC
4. invent NPAC
5. invent ice fraction
6. invent cost
7. invent missing ingredient data
8. invent correction candidates
9. claim support for unsupported profiles
10. expose redacted correction values
11. call a tradeoff recipe perfect
12. hide missing data
13. silently change batch size
14. silently change product profile
15. silently change temperature

AI/API must say:

```text
missing data
needs review
tradeoff
impossible
requires user decision
```

when deterministic modules return those states.

---

# 14. Mapper boundary tests

Mapper provides ingredient data.

Tests:

1. Mapper Basement is not modified by Designer.
2. Mapper Basement is not modified by Optimizer.
3. New products go to products table, not locked base table.
4. Designer does not verify ingredients.
5. Optimizer does not verify ingredients.
6. Missing composition is not invented.
7. Missing PAC/POD is not invented.
8. Low-confidence ingredient produces warning.
9. Ingredient source/confidence is preserved.
10. Duplicate prevention remains outside recipe Designer/Optimizer.

---

# 15. Regression / golden recipe tests

Golden recipes must exist for:

```text
standard_gelato −11
standard_gelato −12
standard_gelato −13
sorbet −11
sorbet −12
sorbet −13
vegan_gelato −13
chocolate_gelato −13
```

Minimum references:

```text
G12 Standard Gelato −11
G17 Standard Gelato −12
G18 Standard Gelato −13
S01 Sorbet −11
S02 Sorbet −12
S03 Sorbet −13
V02 Vegan Gelato −13
C01 Chocolate Gelato −13
```

Each golden recipe test must assert:

- expected product profile
- expected serving temperature
- expected key metrics
- expected regulator status
- no wrong dairy gates
- stabilizer policy
- no unexpected profile fallback
- snapshot stability where appropriate

---

# 16. Migration acceptance tests

The current repo contains older concepts that must be migrated carefully.

Tests:

1. Existing Base Engine still works.
2. Existing `calculateRecipe` still works.
3. Existing correction solver still works.
4. Existing redaction remains strict.
5. Existing actual-batch rules remain enforced.
6. Existing public API exports do not accidentally expose unstable internals.
7. New Product Profile layer does not duplicate Base Engine.
8. New Temperature Regulator does not create fake separate engines.
9. Old preview-only −12/−13 logic is replaced/superseded by Regulator when implemented.
10. Old guardrails claiming only −11°C supported are updated or scoped so they do not conflict with locked v1.0 Regulator.
11. Granita remains unsupported.
12. Protein remains unsupported.
13. No AI/API layer becomes calculator.

---

# 17. Performance and safety tests

1. Optimizer has bounded iterations.
2. Optimizer has deterministic candidate ordering.
3. Optimizer cannot loop infinitely.
4. Large batch sizes do not change ratios incorrectly.
5. 1 kg and 50 kg equivalent recipes preserve percentages when scaled.
6. Machine capacity checks scale correctly.
7. Very small ingredient amounts do not create NaN/Infinity.
8. Rounding is display-only; internal precision remains stable.
9. Currency/cost remains currency-agnostic unless UI defines currency.
10. Errors are structured, not thrown as user-facing crashes.

---

# 18. Release gate checklist

Before Nicolas marks implementation complete:

```text
[ ] All locked documents exist.
[ ] Product Profile Registry implemented.
[ ] Recipe Intent normalization implemented.
[ ] Designer output implemented.
[ ] Temperature Regulator configs implemented.
[ ] Optimizer connected to Product Profile + Designer + Regulator.
[ ] Actual batch rescue implemented.
[ ] Stock shortage workflow implemented or explicitly marked not enabled.
[ ] AI/API guardrails implemented.
[ ] All acceptance tests pass.
[ ] No forbidden external tool/product names appear in code/docs/prompts/UI.
[ ] No unsupported profile is silently accepted.
[ ] No exact grams are generated by AI.
[ ] No final good recipe has 0 g stabilizer where required.
```

---

# 19. What fails the implementation

Implementation fails if any of these occur:

```text
AI calculates exact grams.
Optimizer accepts 0 g stabilizer as good final recipe.
Sorbet uses dairy gates.
Vegan uses dairy gates.
Chocolate is evaluated as standard gelato without chocolate profile.
Temperature Regulator changes recipe chemistry.
Designer calculates POD/PAC/NPAC.
Mapper decides recipe strategy.
Actual-added material is reduced.
Batch size is silently increased.
Unsupported Granita is silently supported.
Ingredient-level NPAC returns as source of truth.
Missing ingredient data is invented.
Tradeoff is labeled perfect.
```

---

# 20. Final lock statement

```text
Acceptance Tests are the enforcement layer of the PINGUINO backbone.
If the implementation cannot pass these tests, it is not the locked PINGUINO architecture.
Do not weaken tests to make code pass.
Fix the code or update the locked contract with explicit approval.
If a rule is missing, stop and ask.
```
