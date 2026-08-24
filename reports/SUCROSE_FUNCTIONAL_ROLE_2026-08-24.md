# SUCROSE + WATER FUNCTIONAL ROLE / PROFILE-AWARE LOCAL-CORRECTOR ROUTING

**Branch** `claude/sucrose-role` · **worktree** `~/Developer/pinguino-sucrose-role`
**Starting `origin/staging`** `6a3d96c` · **production `main`** `4dfb097` (untouched)
**Scope** STAGING only. No production deploy, no merge to `main`, **no Mapper mutation**.

---

## 1. The defect, reproduced from staging code

`docs/ingredients/validation/mapper_basement.csv` stores, for `PI-ING-000514`
`SUCROSE SUGAR · Sweetener · Dry`:

| pod_value | pac_value | sweetness_factor | freezing_factor | sucrose_percent |
| --- | --- | --- | --- | --- |
| 100 | 100 | 1 | 1 | 100 |

Two independent authorities fix the scale of the stored value:

* `src/engine/pac.ts` — *"Convention: per-100 g points, sucrose = 100 (mirrors
  `pod_value`)"*, and both `pacPointGrams` and `npacPointGrams` spend it as
  `effective_grams × pac_value / 100`. `src/engine/pod.ts` says the same.
* the Mapper row itself carries the 0–1 factor **separately**, in
  `sweetness_factor` / `freezing_factor`.

`src/engine/config/coefficients.ts` holds the other scale: `PAC_COEFFICIENTS`
is a 0–1 **factor** table — sucrose `1.00`, dextrose/glucose/fructose `1.90`.

`resolveFunctionalRole` compared the two:

```ts
const pac = ingredient.pac_value;                       // POINTS (sucrose = 100)
if (controlSugars > c.sucrose_percent || (pac !== null && pac >= 1.3))
  return 'sugar_freezing_control';                      // 1.3 = a FACTOR separator
return 'sweetener_sucrose';                             // residual
```

`1.3` sits between sucrose `1.00` and dextrose `1.90` in `PAC_COEFFICIENTS` — it
was written for the factor scale. Against stored points, *every* sugar carrying
any PAC at all tripped it.

**Measured on `6a3d96c`, all 43 engine-`sugar` Mapper rows:**

| role | rows |
| --- | --- |
| `sugar_freezing_control` | **42** |
| `sweetener_sucrose` | **1 — `PI-ING-001427` SUCRALOSE, `pac_value = 0`** |

The only ingredient in the whole Mapper that could satisfy the sucrose role was
an artificial high-intensity sweetener whose stored PAC happens to be zero.

`milk_base_v1` lists `sweetener_sucrose` as a HARD role
(`src/features/formulation/templateRegistry.ts:104`), so `routeFormulationMode`
reported `missing_hard_role` for any ordinary Mapper milk gelato. Served
provenance on `lost-pl-yolk-v2`: `full_formulation` on `milk_base_v1` — exactly
what the ticket described.

**Independent confirmation that the Mapper value is right and the classifier is
wrong:** `CORE_INGREDIENT_IDENTITIES` (`src/data/ingredients/canonicalIngredientIdentity.ts:22`)
already declares `PI-ING-000514 → sweetener_sucrose`. The registry and the
resolver disagreed.

### Answers to the audit questions (§3)

| question | answer |
| --- | --- |
| A. Mapper PAC scale | **0–100 index**, sucrose = 100 (per-100 g points) |
| B. classifier assumption | **0–1 factor** (`PAC_COEFFICIENTS`) |
| C. where the mismatch enters | `resolveFunctionalRole`, sugar branch only |
| D. kind of problem | **missing normalization** at one boundary, plus a residual `else` that made the sucrose role a fallback instead of evidence |

---

## 2. All unit-scale call sites (§5)

Searched the whole runtime for PAC/POD compared against ~1.x, `/100`, `*100`,
and role inference from raw PAC/POD.

| site | verdict |
| --- | --- |
| `src/features/formulation/ingredientRoles.ts:55` | **the only mismatch — fixed** |
| `src/engine/pac.ts:122,148` · `src/engine/pod.ts:41` | correct: `grams × value / 100`, the points convention itself |
| `src/data/products/productIntelligenceResolver.ts:379` | `pac <= 0 || pod <= 0` — scale-agnostic plausibility check |
| `src/engine/sorbetDirectionProjection.ts:71` · `src/features/recipe-direction/sorbetNearestDirectionSearch.ts:46` | classify sugars from **composition only** (`sucrose_percent > controlSugar`) — never read PAC, so never mis-scaled. They already called Sucrose `sweetener_sucrose`; the fix makes the global resolver **agree** with them instead of contradicting them. |
| `src/features/product-intelligence/mapperValueInference.ts:666` | `pod_value`/`pac_value` are cohort-forbidden — never inferred |

No duplicated role logic elsewhere: `proteinAuthority`, `userLineIntent`,
`gelatoStabilizerSystemAuthority`, the rescue advisor and the **Production
Rescue Edge bundle** all import the one `resolveFunctionalRole` (§18 —
`ingredientRoles.ts` is source file 52 of the bundle closure).

---

## 3. The fix — one normalization boundary, no Mapper mutation

`src/features/formulation/ingredientRoles.ts`:

* `ROLE_CLASSIFICATION_POINTS_PER_FACTOR = 100` and
  `normalizeStoredPointsToRoleFactor()` — the single documented read-side
  conversion. The stored value is never rewritten; no calculation that
  legitimately spends PAC=100 as an index is touched.
* the sugar branch now splits on **positive sucrose evidence** instead of a
  residual: sucrose ≥ 50 % of the row (the same "this component IS the
  ingredient" convention the file already used for salt and fibre), sucrose
  outweighing both the freezing-control sugars **and** the polyols, and
  normalized POD *and* PAC below the unchanged `1.3` separator.
* everything else in the sugar bucket keeps the freezing-control role it
  already had, so the blast radius is only the rows that gain the sucrose role.

**No `if (ingredientId === 'PI-ING-000514')` anywhere.** The pinned proof is
structural: `resolveFunctionalRole` must agree with every
`CORE_INGREDIENT_IDENTITIES` entry.

### Blast radius (§19 → `reports/SWEETENER_FUNCTIONAL_ROLE_AUDIT.csv`, 61 rows)

Engine-`sugar` rows: **43**. `sweetener_sucrose` **1 → 7**.

| id | name | before | after |
| --- | --- | --- | --- |
| PI-ING-000514 | SUCROSE SUGAR | sugar_freezing_control | **sweetener_sucrose** |
| PI-ING-000515 | SUGAR CANE | sugar_freezing_control | **sweetener_sucrose** |
| PI-ING-000516 | VANILLIN SUGAR | sugar_freezing_control | **sweetener_sucrose** |
| PI-ING-001371 | MUSCOVADO SUGAR | sugar_freezing_control | **sweetener_sucrose** |
| PI-ING-001467 | SUGAR SYRUP · 60 % | sugar_freezing_control | **sweetener_sucrose** |
| PI-ING-001343 | MAPLE SYRUP CONCENTRATE (52 % sucrose) | sugar_freezing_control | **sweetener_sucrose** |
| PI-ING-001642 | MAPLE SYRUP (52 % sucrose) | sugar_freezing_control | **sweetener_sucrose** |
| PI-ING-001427 | SUCRALOSE (pac 0) | sweetener_sucrose | **sugar_freezing_control** |

**36 rows unchanged**, including every case §8 asks about:

| control | pac (pts → factor) | role after |
| --- | --- | --- |
| Dextrose `PI-ING-000494` | 174.8 → 1.748 | `sugar_freezing_control` |
| Fructose `PI-ING-000496` | 189.6 → 1.896 | `sugar_freezing_control` |
| Dry glucose syrup 39 DE `PI-ING-000495` | 74.1 → 0.741 | `sugar_freezing_control` (composition split) |
| Maltitol `PI-ING-001385` | 100 → **1.00, exactly sucrose's** | `sugar_freezing_control` — held out only by 98 % polyol |
| Erythritol / Xylitol / Sorbitol / Glycerin | 2.80 / 2.24 / 1.88 / 3.72 | `sugar_freezing_control` |
| Lactose / Trehalose / Stevia / Honey / Invert | — | `sugar_freezing_control` |

---

## 4. Three contracts the route change would otherwise have lost

Correcting the role moves ordinary Mapper milk gelato from `full_formulation`
to `local_correction`. Two owner contracts lived only on the template path and
had to be carried over — both in `src/features/constraint-studio/applyPipeline.ts`:

1. **Absent canonical Inulin is never silently added.** The formulation path
   enforced this (`ownerInulinAbsent`); the local corrector reaches the same
   approved toolbox and did not. Ported, keyed on the **line being absent**
   (a selected 0 g Inulin line stays fillable under the zero-gram rule).
   This also restored the manual-grams exactness contract — a 500 g Standard
   line was landing on 501 g because a fresh Inulin line was consuming a gram.
2. **The template door now also covers a diagnostic-only local result.** It
   already caught `no_proposal` and `unsafe_proposal`; a candidate that improves
   the draft but leaves a HARD band out of range is the same failure — the
   Preview cannot be applied. On a substantive unconstrained draft the approved
   template is tried, and used only if it is genuinely applicable.
3. **…and a Direction target the local candidate does not reach.** Measured on
   the `fiorDiLatte` −12 °C sweep, the local corrector alone regressed all five
   sweetness levels from `ACHIEVED` / score 10 to `NEAREST` / score 9, and broke
   monotonicity (−2 delivered POD 13.868 while −1 delivered 12.959 — the P1-A
   five-level contract). The same door now runs when a requested Direction is
   unreached, and the template result is taken **only if it genuinely reaches
   what the local candidate missed** — so it can improve the answer and never
   degrade it. All five levels are back to `ACHIEVED` / score 10 with the exact
   pre-fix POD ladder 12.959 → 13.868 → 14.928 → 15.967 → 16.143.

The template calls keep the ORIGINAL options — the Inulin exclusion in (1)
applies to the local corrector only, because an approved template that carries a
`fiber_body` role is entitled to place Inulin and runs its own guard.

---

## 5. Routing and drift, measured before and after (§9–§11, §13, §14, §21)

`buildOptimizePreview`, real Mapper rows, 1000 g, −11 °C, OPTIMAL unless noted.
"drift" = Σ|Δg| over the user's own lines; "norm" = that divided by the batch.

| recipe | route before | route after | Δ lines before → after | drift g before → after | ms before → after |
| --- | --- | --- | --- | --- | --- |
| Fior di latte | `full_formulation` / `missing_hard_role` (`milk_base_v1`) | `local_correction` → **`already_clean`** | 0/6 → none | 0 → **0** | 7.4 → 5.3 |
| Vanilla | `full_formulation` | `local_correction` | 6/7 → 6/7 | 58 → 74 | 7.4 → 17.2 |
| Chocolate / cocoa | `full_formulation` | `local_correction` | 6/7 → 6/7 | 112 → 142 | 1.0 → 11.9 |
| Pistachio | `full_formulation` | `local_correction` → **`already_clean`** | 6/7 → none | 44 → **0** | 2.6 → 0.3 |
| Coffee | `full_formulation` | `local_correction` → **`already_clean`** | 4/7 → none | 14 → **0** | 0.4 → 0.4 |
| Fior di latte ECO | `full_formulation` (`already_clean`) | `local_correction` (`already_clean`) | — | — | 2.0 → 16.0 |
| Fior di latte Sweetness −2 | `full_formulation` | `local_correction` | 5/6 → 5/6 | 538 → 538 | 34.8 → 42.9 |
| Fior di latte Sweetness +2 | `full_formulation` | `local_correction` | 4/6 → 4/6 | 26 → 26 | 1.5 → 2.4 |
| **Polish Lost UNLOCKED** | `full_formulation` (`milk_base_v1`) | **`local_correction`** | 7/8 → 7/8 | 323 → 323 | 5.6 → 21.1 |
| **Polish Lost LOCKED yolk 40 g** | `constrained_reformulation` | `constrained_reformulation` (unchanged — an explicit hard lock is a global redistribution) | 6/8 → 6/8 | 299 → 299 | 2.8 → 9.4 |
| Polish Lost ECO | `full_formulation` | `local_correction` | 7/8 → 7/8 | 323 → 323 | 2.1 → 11.8 |
| Polish Lost Sweetness −2 | `full_formulation` | `local_correction` | 7/8 → 7/8 | 335 → **319** | 37.2 → 12.3 |
| Polish Lost Sweetness +2 | `full_formulation` | `local_correction` | 7/8 → 7/8 | 313 → 313 | 5.9 → 7.3 |

Every row above: batch exactly **1000 g**, `detectViolations` **empty**, no 0 g
line, no added or removed ingredient, no product substitution.

Reading of §11: three of five ordinary gelati now return the honest
`already_clean` instead of being rebuilt against a template (44 g and 14 g of
pointless drift removed); the Polish Lost answer is **byte-identical** to what
the template route produced, but the provenance is now truthfully "local
corrector", not `milk_base_v1`. Vanilla and cocoa drift slightly more on the
local route while staying fully in band.

**Performance, honestly:** not uniformly cheaper. The short-circuits are much
cheaper; several corrections are a few ms slower (Lost 5.6 → 21.1 ms). No
timeout and no `MAX_SOLVER_ROUNDS` was changed.

### Direction (§14)

Sweetness −2 / 0 / +2 on both reproducers: coherent route, `score 10` where the
targets are reachable, exact preference ACHIEVED (`side: inside`, distance 0 on
both supported axes), no `ok:false` preference-only dead end, no stale Preview.
Direction calibration untouched.

### Soft-Hold (§12) and batch (§13)

* Lost UNLOCKED: dried yolk **40 → 20 g**, `isMaterialUserIntentDeviation` false,
  `userIntent.material` empty, canonical `PI-ING-001645` preserved, Inulin 132 g
  (≥ the 20 g owner minimum), every line ≥ 1 g. **Never 1 g.**
* Lost LOCKED: yolk exactly **40 g**, zero violations, 1000 g.
* Target batch: every `ok:true` Preview above lands on 1000 g within
  `BATCH_SUM_TOLERANCE_G`. No 951 g success.

---

## 6. Round 2 — separating FUNCTIONAL ROLE from ROUTE ELIGIBILITY

Round 1 landed the correct role and, with it, a route flip that reached every
profile. Round 2 keeps the role global and makes the ROUTE profile-aware.

### 6.1 A/B proof that Protein was hijacked, not broken (§B)

All 20 Protein Direction cells, traced on `origin/staging` and on this branch:

| | PRE-FIX | POST role fix (round 1) | POST routing fix (round 2) |
| --- | --- | --- | --- |
| Sucrose role | `sugar_freezing_control` | `sweetener_sucrose` | `sweetener_sucrose` |
| profile | `protein_gelato` | `protein_gelato` | `protein_gelato` |
| route | `full_formulation` / `missing_hard_role` | `local_correction` / `substantive_unconstrained_draft` | `full_formulation` / `profile_owns_formulation_path` |
| template | `protein_dairy_neutral_minus12_v1` / `_minus13_v1` | (eligible, unused) | `protein_dairy_neutral_minus12_v1` / `_minus13_v1` |
| result | **20/20 OK**, protein qualified | 7 OK · 10 `missing_prices` · 2 `already_clean` · 1 `no_proposal` | **20/20 OK**, protein qualified |

Route **and** result are byte-identical to pre-fix in round 2, while the Sucrose
role stays corrected.

**Answer: YES.** Protein began using the ordinary dairy corrector *only* because
Sucrose started satisfying `sweetener_sucrose` and removed the
`missing_hard_role` trigger. Protein owns approved templates of its own and was
using them for every cell. **This was a route-eligibility defect, not a Protein
science defect — and no Protein science was touched.**

### 6.2 The gate (§C)

`localCorrectionProfileEligible(category)` in `formulate.ts` guards the
`substantive_unconstrained_draft` branch only. It **reads the engine's existing
Gelato authority** (`gelatoStabilizerSystemApplies`) rather than restating a
list, so there is one definition of "ordinary dairy Gelato"; `custom` is added
separately and deliberately, because it has no profile authority of its own.

A substantive draft of a profile that owns a formulation path now routes
`full_formulation` on **its own** template, under the honest new reason
`profile_owns_formulation_path`. The other two local branches — `poured_actuals`
(production rescue) and `all_locked` (the honest "everything is locked"
diagnosis) — stay global, because neither is dairy science.

### 6.3 Protein −12 / Sweetness −2 (§D)

Green on the proper Protein route, with no solver or threshold change. There is
no separate pre-existing Protein Direction bug to report: the cell was only ever
red while Protein was on the dairy corrector.

### 6.4 Canonical Water resolves semantically (§E)

`PI-ING-001409` "WATER · Liquid" resolved to `flavor_other`: Mapper category
`liquid` has no `CATEGORY_MAPPING` entry so it lands in the engine `other`
bucket, and the old rule only matched the engine category or the literal name
"water" — while the Sorbet templates ask for the `water` HARD role.

**Composition alone cannot decide this**, and the dataset proves it:

| | water_% | solids_% | sugar_% | POD | PAC | subcategory |
| --- | --- | --- | --- | --- | --- | --- |
| `PI-ING-001409` WATER · Liquid | 100 | 0 | 0 | 0 | 0 | `water` |
| `PI-ING-001936` PEPSI MAX | 100 | 0 | 0 | 0 | 0 | `cola_soft_drink` |

Numerically indistinguishable. So the rule takes **both halves of the evidence**:
the declared `water` subcategory *and* an inert aqueous composition (≥99 % water,
≤1 % solids, no sugar/fat/protein/polyol/alcohol/fibre, POD and PAC 0 or null).
Subcategory alone would accept a mislabelled sugary row; composition alone turns
every zero-sugar cola into water.

`EngineIngredient` gained `source_subcategory` — documented as classification
evidence only, never an Engine formula input — because the mapper was dropping
the field entirely. No ID is hardcoded.

Resolves to `water`: `PI-ING-001409`, plus the genuine bottled stills
`ACQUA MORELLI`, `SMARTWATER`, `AQUAFINA` (all subcategory `water`, all inert).
Pinned as NOT water: Pepsi Max, Coca-Cola Zero, sugared Pepsi, Red Bull
Sugarfree, Goldberg soda water (a `mixer_soft_drink`), Schweppes Indian Tonic
Water, Fanta Orange, Campisi orange juice, oat drink, milk 3.5 %.

### 6.5 The ECO null hypothesis had the same proxy problem

`ecoCurrentDraftOwnsSearch` fired only when the route reason was
`missing_hard_role` — which, while Sucrose and Water mis-resolved, was simply
what *every* complete draft reported. With the roles correct, a complete ECO
draft reaches the template route under `profile_owns_formulation_path` instead,
so the gate now tests **the route** (`mode === 'full_formulation'`) rather than
one of its reasons. The other `full_formulation` reason,
`composition_requires_formulation`, is a hollow off-batch draft that the gate's
own batch-equality test already excluded — so pre-fix behaviour is preserved.
This restored the Sorbet/Vegan ECO cost-sweep contracts
(`ecoPricedApplyDoor`, `sorbetDirectionApplyDoor`, `zeroGramExecutableInvariant`).

### 6.6 ECO pricing for Water — no Mapper mutation (§F, §G)

The blank `cost_per_kg` on `PI-ING-001409` **stays blank**. A blank canonical
cost means "there is no canonical purchase price", not "free", and it is never
coerced to 0.

**The owner account already holds a MOJA CENA for it: `PI-ING-001409` =
1.00 EUR/kg, set 2026-08-16** (read from the staging `customer_ingredient_prices`
table). No new or conflicting price was created. The repo's `OWNER_PRICES`
fixture already reproduces exactly that value, so offline tests feed it through
the same `effectivePriceOverrides` seam ECO uses in production.

Pinned in §6 of `sucroseFunctionalRole.test.ts`: the Mapper cost stays null; an
ECO draft with canonical Water and no owner price reports `missing_prices` and
names the line; the same draft with the owner overlay prices normally; and the
Mapper is still null afterwards.

---

## 7. Adjacent defects found, deliberately NOT fixed here

1. **A 0 g stabilizer line survives Apply on the local route.**
   `isOmittableUnusedLine` deliberately refuses to omit template-controlled
   stabilizers, so a user who zeroes their Tara now ships a 0 g row instead of
   having it seeded. This is the pre-existing 0 g-row condition, newly reachable
   from one more route. **Owner call.**
2. **A milk gelato with no stabilizer at all now commits with no warning.**
   `assessGelatoStabilizerSystem` returns `present:false, issues:[]` — the
   policy is explicit that it "is not permission to silently insert a stabilizer
   into a recipe that has none", and `routeFormulationMode` says the absence has
   "its own profile-specific, fail-closed readiness gate". No such Gelato gate
   exists today (only Vegan has `stabilizer_missing`). Before this fix the state
   was masked because every such draft was rebuilt by the template. **Owner call.**

---

## 8. Tests

New:

* `src/features/formulation/sucroseFunctionalRole.test.ts` — 35 pinned cases
  (§23 items 1–10). The Sucrose case **fails on `6a3d96c` and passes after**.
* `src/features/formulation/sweetenerFunctionalRoleAudit.report.test.ts` —
  regenerates the audit CSV and pins the before/after counts, including
  "before the fix the only sucrose-role row was SUCRALOSE".

Updated, with the reason recorded in the file:

* `userIntentFullFormulation.test.ts` — pinned `full_formulation` for the Lost
  recipe, i.e. it pinned the defect's symptom. Now pins the corrected route and
  additionally proves the Soft-Hold on a draft that genuinely still needs
  `full_formulation`.
* `stabilizerContractRegression.test.ts` — every fixture there rode the
  misroute into the template path. Split into the **local** contract (the user's
  stabilizer system made executable: whole grams inside the owner band [2, 5],
  `assessGelatoStabilizerSystem` clean, 1.9 g → 2 g) and the **template**
  contract (unchanged: the approved seed still produces the preferred 3 g on a
  draft that really is missing a HARD role). Two new cases pin that PI never
  invents a stabilizer for a recipe that has none.
