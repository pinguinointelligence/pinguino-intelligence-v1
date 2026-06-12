# PINGÜINO RECIPE ENGINE — SPECIFICATION V1

**Status: LOCKED — the mathematical source of truth for the PINGÜINO recipe engine (`src/engine/`).**
Changes to this document require product-owner approval and follow the versioning discipline in §17 (any coefficient/target change bumps `CONFIG_VERSION`; any formula change bumps `ENGINE_VERSION`).

For engine mathematics, **this document supersedes** the summaries in [PINGUINO_MASTERPLAN_V1.md](PINGUINO_MASTERPLAN_V1.md) §12–§15; the masterplan remains canonical for product and app context. The business layer lives in [PINGUINO_COMMERCIAL_ECOSYSTEM_V1.md](PINGUINO_COMMERCIAL_ECOSYSTEM_V1.md).

**Created:** 2026-06-11 · **Document version:** 1.0 · **Implements as:** `src/engine/` (Step 4, not yet written)

---

## Table of contents

1. [Engine ownership rule](#1-engine-ownership-rule)
2. [AI boundary](#2-ai-boundary)
3. [Ingredient data model](#3-ingredient-data-model)
4. [Sugar logic](#4-sugar-logic)
5. [Alcohol logic](#5-alcohol-logic)
6. [Main recipe calculations](#6-main-recipe-calculations)
7. [POD calculation](#7-pod-calculation)
8. [PAC / NPAC calculation](#8-pac--npac-calculation)
9. [Ice fraction and target temperature](#9-ice-fraction-and-target-temperature)
10. [Golden Middle priority order](#10-golden-middle-priority-order)
11. [Product modes](#11-product-modes)
12. [Flavor priority](#12-flavor-priority)
13. [Correction engine](#13-correction-engine)
14. [Demo redaction](#14-demo-redaction)
15. [Actual Batch Mode](#15-actual-batch-mode)
16. [External calibration fixtures](#16-external-calibration-fixtures)
17. [Versioning](#17-versioning)
18. [Files to implement later](#18-files-to-implement-later)
19. [API connection rule](#19-api-connection-rule)
20. [Final checklist](#20-final-checklist)
— [Appendix A — worked example (illustrative / calibration-pending)](#appendix-a--worked-example-illustrative--calibration-pending)

---

## 1. Engine ownership rule

**All final recipe values come from the deterministic TypeScript engine in `src/engine/` — never from AI text output.**

- The engine is pure TypeScript: zero dependencies, no React, no IO, no network. Same input → same output, always.
- Every gram, percentage, POD/PAC/NPAC point, ice-fraction estimate, score, status and correction amount shown anywhere in the product is computed by this engine.
- **Core rule: OpenAI / ChatGPT must never be the source of final recipe calculations.** No AI output is ever displayed as a recipe value, written to a recipe, or used as input to a correction without passing through the engine.

## 2. AI boundary

**AI can:**

- understand user intent
- ask questions
- analyze labels
- extract ingredient data
- explain results
- suggest direction
- generate names and labels

**AI must NOT:**

- invent final grams
- modify recipe formulas
- calculate POD/PAC/NPAC independently
- bypass the deterministic engine
- replace the recipe calculator

**Connection contract** (schemas in §19):

1. AI creates a structured **RecipeIntent** (never a finished recipe).
2. AI creates structured **IngredientExtraction** records (never verified, §3).
3. The **engine calculates** all final numbers from structured input.
4. AI may **request a correction** (CorrectionRequest); the engine computes the correction.
5. AI **explains** engine results (ExplanationRequest) — words only, numbers passed in.
6. The **engine validates every recipe before saving**; nothing AI-shaped reaches the database without engine validation.

## 3. Ingredient data model

Every ingredient stores per-100 g values:

```
water_percent          solids_percent         fat_percent
protein_percent        carbohydrate_percent   sugar_percent
sucrose_percent        glucose_percent        dextrose_percent
fructose_percent       lactose_percent        polyol_percent
fiber_percent          salt_percent           alcohol_percent
kcal_per_100g          pod_value              pac_value
npac_value             cost_per_kg            confidence_score
```

Typed sketch (final shape in `src/engine/types.ts`):

```ts
interface IngredientComposition {
  water_percent: number;        solids_percent: number;
  fat_percent: number;          protein_percent: number;
  carbohydrate_percent: number; sugar_percent: number;
  sucrose_percent: number;      glucose_percent: number;
  dextrose_percent: number;     fructose_percent: number;
  lactose_percent: number;      polyol_percent: number;
  fiber_percent: number;        salt_percent: number;
  alcohol_percent: number;      kcal_per_100g: number;
}

interface EngineIngredient {
  id: string;
  name: string;
  category: IngredientCategory;
  composition: IngredientComposition;
  pod_value: number | null;    // stored, verified-first (§7)
  pac_value: number | null;    // stored, verified-first (§8)
  npac_value: number | null;   // stored, verified-first (§8)
  de_value: number | null;     // glucose syrups (§8)
  cost_per_kg: number;
  confidence_score: number;    // 0–100 (masterplan §16)
  source_type: SourceType;
  is_verified: boolean;
}
```

> **Total sugar alone is not enough.** Sugar must be split into sugar types, because sucrose, dextrose/glucose, fructose and lactose behave differently in sweetness (§7) and freezing (§8). `sugar_percent` is the aggregate; the typed split drives the math.

Sanity invariants (validated by the engine): `water + solids ≈ 100` (alcohol tracked separately, §5); component sums never exceed `solids_percent`; sugar-type sum ≤ `sugar_percent` ≤ `carbohydrate_percent`.

## 4. Sugar logic

The engine must **never treat "sugar" as one generic number when the sugar breakdown is available.**

Sugar types are handled separately, each with its own POD and PAC/NPAC effect:

| Sugar class | Sweetness (POD) | Freezing (PAC/NPAC) |
|---|---|---|
| Sucrose | reference 1.00 | reference 1.00 |
| Dextrose / glucose | lower than sucrose | much stronger than sucrose |
| Fructose | much higher than sucrose | much stronger than sucrose |
| Lactose | very low | like sucrose |
| Polyols | ingredient-specific | ingredient-specific (often strong) |
| Other sugars (invert, syrups by DE, honey sugars) | stored/derived per ingredient | stored/derived per ingredient |

**Fallback rule:** if only total sugar is known (e.g. a producer label), the engine estimates the split from the ingredient category (e.g. fruit ≈ fructose/glucose-dominant, dairy ≈ lactose, syrup by DE), lowers `confidence_score`, and flags the ingredient *needs verification*. Estimated splits are never silently treated as verified.

## 5. Alcohol logic

Alcohol is a **separate component** — never normal water, never normal solids.

- Every ingredient has `alcohol_percent` per 100 g.
- Recipe `alcohol_percent = total_alcohol_g / total_batch_g × 100` (§6).
- Alcohol strongly affects freezing stability (coefficient in §8 — the strongest in the table).
- Warnings trigger above the safe range (milk gelato: 0–2.5 %, §9).
- Alcohol is included in correction logic (§13): the engine warns it cannot always be fixed perfectly; it adds solids/fat/base or reduces the alcohol source only if unlocked.

Worked micro-examples:

- **Jim Beam 40 %** → 100 g of ingredient contains **40 g alcohol** (`alcohol_percent = 40`).
- **Brandy 36 %** → 100 g of ingredient contains **36 g alcohol** (`alcohol_percent = 36`).

## 6. Main recipe calculations

For each recipe:

```
total_batch_g   = Σ effective ingredient grams
effective_grams = actual_grams if present, otherwise planned_grams
```

For each ingredient and each component:

```
component_g = ingredient_grams × component_percent / 100
```

Totals (each is the sum of its per-ingredient component grams):

```
total_water_g     total_solids_g    total_fat_g       total_protein_g
total_lactose_g   total_sucrose_g   total_glucose_g   total_dextrose_g
total_fructose_g  total_polyol_g    total_fiber_g     total_salt_g
total_alcohol_g
```

Percentages:

```
water_percent   = total_water_g   / total_batch_g × 100
solids_percent  = total_solids_g  / total_batch_g × 100
fat_percent     = total_fat_g     / total_batch_g × 100
protein_percent = total_protein_g / total_batch_g × 100
lactose_percent = total_lactose_g / total_batch_g × 100
alcohol_percent = total_alcohol_g / total_batch_g × 100
```

(All other component percentages follow the same pattern.)

**Precision rule:** full floating-point precision internally; rounding only at presentation — 0.1 g for grams, 0.1 for percentages and points.

## 7. POD calculation

POD (relative sweetening power) is calculated **from sugar-type contributions, never from total sugar alone.**

**Stored-value-first rule:** if an ingredient has a verified `pod_value`, the engine may use that stored value directly. If not, POD is calculated from the sugar breakdown.

Initial configurable coefficients (`src/engine/config/coefficients.ts`):

| Component | Default | Configurable range (spec) |
|---|---|---|
| Sucrose | **1.00** | fixed reference |
| Dextrose / glucose | **0.74** | 0.70–0.75 |
| Fructose | **1.73** | 1.70–1.75 |
| Lactose | **0.16** | 0.15–0.20 |
| Polyols | per ingredient | ingredient-specific |
| Honey / glucose syrup / special | stored `pod_value` | use stored value if available |

Formula:

```
pod_points = Σ(component_g × pod_coefficient) / total_batch_g × 100
```

## 8. PAC / NPAC calculation

PAC/NPAC (freezing-point depression power) is calculated **separately from POD**, with its own coefficient tables.

The freezing effect must consider: sucrose · dextrose/glucose · fructose · lactose · **glucose syrups by DE value** · **alcohol** · salt · polyols.

**Stored-value-first rule:** if an ingredient has a verified `pac_value` or `npac_value`, use the stored value. If not, estimate from the component breakdown.

Initial configurable coefficients (`src/engine/config/coefficients.ts` — all admin-tunable, none hardcoded):

| Component | Default | Notes |
|---|---|---|
| Sucrose | **1.00** | reference |
| Dextrose / glucose | **1.90** | must exceed sucrose (required) |
| Fructose | **1.90** | must exceed sucrose (required) |
| Lactose | **1.00** | |
| Glucose syrups | **by DE value** | dry-syrup values depend on DE; stored per ingredient |
| **Alcohol** | **7.40** | must strongly increase freezing depression (required) |
| Salt | **~11.7** | flagged: calibration-sensitive, sources disagree |
| Polyols | per ingredient | ingredient-specific |

Formula (canonical default):

```
npac_points = Σ(component_g × npac_coefficient) / total_batch_g × 100
```

> **Calibration assumptions (settled by external reference fixtures, §16 — until then these are working definitions, not verified facts):**
> 1. **PAC vs NPAC:** working definition — PAC = anti-freezing power of the sugar spectrum; NPAC = net total freezing depression including alcohol and salt. Both keep separate coefficient tables so the definitions can diverge or merge after calibration.
> 2. **Normalization basis:** `per_total_mass` (the canonical formula above) **is and remains the canonical default** until external calibration fixtures are entered and verified. `per_water_mass` is documented strictly as a **candidate calibration mode to be tested** — nothing more. Appendix A records both values for one illustrative mix **without drawing any conclusion**; the worked example must not decide the normalization basis. The only authority for changing NPAC/PAC normalization is **active external reference fixtures (§16), especially known-good recipes with expected external reference NPAC values**.

## 9. Ice fraction and target temperature

The engine calculates or estimates **ice fraction** (share of water frozen at serving temperature) from **target serving temperature** and PAC/NPAC.

**MVP model:** anchor-matrix interpolation, inverse-linear inside the calibrated band — higher NPAC ⇒ more depression ⇒ less ice at the same temperature. At −11 °C: NPAC 33 → ≈ 54.5 % ice; NPAC 42 → ≈ 45 % ice (matching the paired bands below). Anchor rows at −8 / −11 / −12 / −14 / −18 °C; all anchors configurable. Documented upgrade path: replace with a freezing-curve model later without changing the engine API.

**Target temperature affects the target ranges.** All bands are keyed by `(product_category, target_temperature)` in `src/engine/config/targets.ts`. Example temperatures: −11 °C, −12 °C, −14 °C, −18 °C.

Initial **milk gelato @ −11 °C** target ranges (seeded verbatim; other categories/temperatures ship as estimated defaults flagged for tuning):

| Metric | Target range |
|---|---|
| POD | 12–17 |
| NPAC | 33–42 |
| Ice fraction | 45–54.5 |
| Lactose | 4–6 |
| Lactose sandiness risk | 5–9 |
| Fat | 5–12 |
| Aerating protein | 3–6 |
| Protein share in solids | 9–13 |
| Total solids | 31–45 |
| Water | 57–70 |
| Alcohol | usually 0–2.5 for stable gelato; **warning above** |

*Lactose sandiness risk* is a derived risk indicator (lactose concentration relative to the water phase); its exact scoring formula is finalized during implementation against the calibration fixtures — the 5–9 band above is the configured target.

## 10. Golden Middle priority order

The engine optimizes toward band centers in a **fixed priority order** (`src/engine/config/priorities.ts`):

1. Feasibility and safety
2. Freezing stability / ice fraction
3. NPAC / PAC
4. POD
5. Water / total solids
6. Fat
7. Protein
8. Lactose and sandiness risk
9. Stabilizer ratio
10. Flavor priority
11. Cost

**Rule:** the engine must not fix a lower-priority metric by breaking a higher-priority one. The order is used twice: ranking violations (what to fix first) and tie-breaking proposals (which fix wins).

## 11. Product modes

ECO, CLASSIC, PREMIUM and SIGNATURE **change calculation priorities** (`src/engine/config/modes.ts`: score weights, main-ingredient floors per category, correction-candidate ranking, booster policy):

| Mode | Engine objective |
|---|---|
| **ECO** | Lowest cost while every technical band stays satisfied (stable) |
| **CLASSIC** | Balanced taste / cost / structure — pure Golden Middle |
| **PREMIUM** | Stronger main ingredient · better mouthfeel · preserve the main ingredient as much as possible |
| **SIGNATURE** | Maximum perceived flavor · may suggest boosters (roasted variants, concentrates, pastes, salt, alcohol, acidity) · must remain technically stable |

## 12. Flavor priority

The engine must **not blindly reduce the main ingredient just to improve technical values.** A technically balanced recipe that lost its flavor is a worse recipe.

For **PREMIUM** and **SIGNATURE**:

- protect the main-ingredient **floor** (reduce-forbidden for the solver)
- rebalance the rest of the recipe **around** the main ingredient (sugar split, dairy ratio, solids, stabilizer)
- if a technical band is unreachable without touching the main ingredient, **explain the trade-off** as a first-class proposal kind (e.g. *"Structure can only be fixed by reducing pistachio paste below your Premium floor — consider Signature boosters or accept Risky structure"*)
- **never silently destroy the flavour**

In ECO/CLASSIC the main ingredient is adjustable within category min/max, but remains last in the reduction order before cost-driven candidates.

## 13. Correction engine

The engine produces **exact correction instructions** for Pro users:

- add X g sucrose
- add X g dextrose
- add X g milk
- add X g cream
- add X g skimmed milk powder
- add X g inulin
- reduce X — **only** if the ingredient is not locked and not already added

Corrections must respect:

- locked ingredients (all lock types)
- main-ingredient protection (§12)
- actual already-added ingredients (§15 — can never be reduced)
- machine capacity (proposed additions never push total mass past capacity)
- target batch size

**Solver mechanics (deterministic):**

1. Rank target-band violations by the Golden Middle order (§10), then severity.
2. Generate candidate actions from the correction-ingredient set, filtered by mode policy (§11), dietary constraints and locks.
3. For one or two coupled targets, solve the **mass-change-aware linear system** in added grams (additions change `total_batch_g`; cross-multiplied percentage targets remain linear in the added masses) → exact answers such as *"add 34.7 g sucrose and 178.0 g milk 3.5 %."*
4. **Verify every proposal by re-running the full engine** on the hypothetical recipe (≤ 3 refinement rounds); reject any proposal that worsens a higher-priority band.
5. Emit ranked proposals with reason codes, affected indicators and predicted deltas, in deterministic order.

## 14. Demo redaction

**Demo users must not receive exact correction grams.** The engine and access layer support two output levels:

- **Pro:** exact grams visible.
- **Demo:** direction-only teaser — e.g. *"PINGÜINO Pro can calculate the exact amount to add."*

**Redact-at-source API:** `proposeCorrections(input, { redact })`. With `redact: true`, exact gram values are stripped **inside the pure function** — the unredacted proposal exists only transiently inside the engine call and never reaches app state, props, localStorage or the DOM for demo sessions. This matches the already-shipped UI contract: `PlanGate` (`src/components/shared/PlanGate.tsx`) never mounts locked children (tested in `src/components/shared/components.test.tsx`).

## 15. Actual Batch Mode

The engine supports real production, not only planning. Each recipe item has:

- `planned_grams`
- `actual_grams`
- `difference` (= actual − planned)
- `lock_type` (`unlocked | grams | percent | main | already_added | required`)

Rules:

- **If `actual_grams` exists, the engine calculates from `actual_grams`** (the `effective_grams` rule, §6).
- **Already-added ingredients cannot be reduced** — `already_added` lines are immutable downward; the solver may only add.
- If the user adds too much of something (e.g. planned sucrose 34.7 g, actual 50.0 g, difference +15.3 g), the engine **calculates rescue corrections around the mistake**: recompute on the actual state, lock the mistake, solve the violations with additions to other ingredients (e.g. *"add 178.0 g milk 3.5 % to absorb the excess sucrose"*).

## 16. External calibration fixtures

Calibration concept for `src/engine/__fixtures__/externalReference/` — real test data is the engine's ground truth.

Supported fixtures (data filled in later from product-owner screenshots and manual records):

| Fixture | Kind |
|---|---|
| chocolate | recipe |
| raspberry | recipe |
| apple | recipe |
| banana | recipe |
| honey | ingredient |
| dry glucose syrup 39 DE | ingredient |
| liquid glucose syrup | ingredient |
| inulin | ingredient |
| alcohol / Jim Beam | ingredient |
| mascarpone | ingredient |
| pistachio paste | ingredient |

- **Ingredient fixtures** assert per-ingredient POD/PAC/NPAC derivation from composition matches known values.
- **Recipe fixtures** assert full-mix indicator outcomes within tolerance.
- Schema: `{ kind: 'ingredient' | 'recipe', name, status: 'pending' | 'active', input, expected, tolerance }`. The test runner skips `pending` fixtures and fails on `active` misses.
- **The engine must allow coefficients and target ranges to be adjusted based on these fixtures**: when an active fixture disagrees, adjust `config/coefficients.ts` / `config/targets.ts` **only** (never per-recipe hacks), bump `CONFIG_VERSION`, and all fixtures + goldens must pass together. The §8 calibration assumptions (PAC/NPAC definition, normalization basis) are resolved here first.

## 17. Versioning

Every engine result includes:

- `engine_version` — bumped on any formula/pipeline change
- `config_version` — bumped on any coefficient/target/weight change

Saved recipes store both, so any saved score is **reproducible later**: the same inputs under the same versions yield identical outputs (determinism is snapshot-tested).

## 18. Files to implement later

Planned engine files (Step 4 — none exist yet beyond placeholder READMEs):

```
src/engine/types.ts
src/engine/index.ts
src/engine/config/coefficients.ts
src/engine/config/targets.ts
src/engine/config/modes.ts
src/engine/config/priorities.ts
src/engine/config/version.ts
src/engine/composition.ts
src/engine/pod.ts
src/engine/pac.ts
src/engine/iceFraction.ts
src/engine/statuses.ts
src/engine/scoring.ts
src/engine/corrections/solver.ts
src/engine/corrections/redact.ts
src/engine/__fixtures__/externalReference/
```

Supporting modules already in the masterplan blueprint complete the same engine: `src/engine/nutrition.ts`, `src/engine/cost.ts`, `src/engine/corrections/candidates.ts`, `src/engine/corrections/verify.ts`, `src/engine/config/density.ts`, and `src/engine/__fixtures__/golden/`.

## 19. API connection rule

**The OpenAI API only communicates with the engine through structured data.** Schemas (final shapes implemented with zod validation; AI output is parsed, validated, and rejected on mismatch):

```ts
interface RecipeIntent {            // Hello PI / assistant → engine
  product_type: ProductCategory;
  recipe_mode: 'eco' | 'classic' | 'premium' | 'signature';
  target_temperature_c: number;
  batch_grams: number | null;       // engine converts liters via density config
  machine_capacity_liters?: number;
  main_ingredient?: string;
  flavour_priority: 'maximum' | 'balanced' | 'lowest_cost';
  dietary: DietaryFlag[];
  already_added?: Array<{ ingredient: string; grams: number }>;
  missing_information: string[];
  next_action: string;
}

interface IngredientExtraction {    // label/OCR analysis → ingredient record
  name: string;
  brand?: string;
  composition: Partial<IngredientComposition>;
  per_field_confidence: Record<string, number>;
  allergens?: string[];
  source_type: 'label' | 'ocr' | 'ai_estimated';
  is_verified: false;               // AI output is never verified (§3)
}

interface CorrectionRequest {       // AI/user asks the engine to correct
  recipe_snapshot: RecipeResultSummary;   // engine-computed numbers only
  focus?: IndicatorKey[];
  constraints: { locked_line_ids: string[]; machine_capacity_g?: number; mode: RecipeMode };
  redact: boolean;                  // §14
}

interface ExplanationRequest {      // engine results → AI wording
  recipe_snapshot: RecipeResultSummary;
  question?: string;
  audience: 'client' | 'pro' | 'admin';
}
```

Rules:

- **AI cannot write final recipe grams directly into the database.**
- Every AI proposal is **validated by the engine** before it is shown as numbers or persisted.
- The engine validates every recipe before saving (§2), regardless of whether it came from forms, Hello PI, or extraction.

## 20. Final checklist

Implementation of `src/engine/` is complete only when every box is checked:

- [ ] sugar breakdown implemented (per-type math, never generic sugar — §4, §7, §8)
- [ ] alcohol implemented (separate component, warnings, corrections — §5)
- [ ] actual batch implemented (effective grams, rescue corrections — §15)
- [ ] locked ingredients implemented (all six lock types respected — §13, §15)
- [ ] main ingredient protection implemented (PREMIUM/SIGNATURE floor + trade-off messages — §12)
- [ ] external reference fixtures ready (schema + runner + pending placeholders — §16)
- [ ] AI cannot bypass engine (structured schemas only, engine validation before save — §2, §19)
- [ ] demo cannot see exact grams (redact-at-source verified by test — §14)
- [ ] engine/config version saved on every result (§17)

---

## Appendix A — worked example (illustrative / calibration-pending)

> **Status: illustrative / calibration-pending.** This example exists so the formulas in §6–§9 can be checked by hand and later reused as a golden test fixture. The ingredient values are typical literature figures and the coefficients are the §7/§8 defaults. **It is not a verified production recipe** and must not be treated as one until the external calibration fixtures (§16) are added and confirmed.

**Mix (milk gelato base, target −11 °C, batch 1000.0 g):**

| Ingredient | Grams | water % | solids % | fat % | protein % | lactose % | sucrose % | dextrose % | fiber % | salt % |
|---|---|---|---|---|---|---|---|---|---|---|
| Whole milk 3.5 % | 670.0 | 87.5 | 12.5 | 3.5 | 3.3 | 4.8 | — | — | — | 0.1 |
| Cream 35 % | 130.0 | 58.9 | 41.1 | 35.0 | 2.2 | 3.1 | — | — | — | 0.1 |
| Skimmed milk powder | 35.0 | 3.5 | 96.5 | 0.8 | 35.0 | 52.0 | — | — | — | 1.0 |
| Sucrose | 130.0 | 0.0 | 100.0 | — | — | — | 100.0 | — | — | — |
| Dextrose (monohydrate) | 30.0 | 8.0 | 92.0 | — | — | — | — | 92.0 | — | — |
| Tara gum | 5.0 | 12.0 | 88.0 | — | — | — | — | — | 80.0 | — |

**Component totals (`component_g = grams × percent / 100`):**

| Component | Contributions | Total g | % of batch |
|---|---|---|---|
| Water | 586.25 + 76.57 + 1.225 + 0 + 2.40 + 0.60 | **667.045** | **66.70** |
| Solids | 83.75 + 53.43 + 33.775 + 130 + 27.60 + 4.40 | **332.955** | **33.30** |
| Fat | 23.45 + 45.50 + 0.28 | **69.23** | **6.92** |
| Protein | 22.11 + 2.86 + 12.25 | **37.22** | **3.72** |
| Lactose | 32.16 + 4.03 + 18.20 | **54.39** | **5.44** |
| Sucrose | 130.00 | **130.00** | **13.00** |
| Dextrose | 27.60 | **27.60** | **2.76** |
| Fiber | 4.00 | **4.00** | **0.40** |
| Salt | 0.67 + 0.13 + 0.35 | **1.15** | **0.115** |
| Alcohol | — | **0.00** | **0.00** |

Mass check: water + solids = 667.045 + 332.955 = **1000.0 g** ✓ (no alcohol in this mix).

**POD (§7 defaults — sucrose 1.00, dextrose 0.74, lactose 0.16):**

```
130.00×1.00 + 27.60×0.74 + 54.39×0.16 = 130.00 + 20.424 + 8.702 = 159.13
pod_points = 159.13 / 1000 × 100 = 15.9   → inside POD band 12–17 ✓
```

**NPAC (§8 defaults — sucrose 1.00, dextrose 1.90, lactose 1.00, salt 11.7):**

```
130.00×1.00 + 27.60×1.90 + 54.39×1.00 + 1.15×11.7
= 130.00 + 52.44 + 54.39 + 13.46 = 250.29

canonical default (per_total_mass):           250.29 / 1000.0  × 100 = 25.0
candidate calibration mode (per_water_mass):  250.29 / 667.045 × 100 = 37.5
```

**Normalization note — no conclusion is drawn here.** This worked example is illustrative / calibration-pending only and **must not decide the NPAC normalization basis**. `per_total_mass` remains the canonical default per the §8 formula until external calibration fixtures are entered and verified. `per_water_mass` stays documented strictly as a **candidate calibration mode to be tested** — nothing more. The only authority for changing NPAC/PAC normalization (or any coefficient) is **active external reference fixtures (§16), especially known-good recipes with expected external reference NPAC values**. Both numbers are recorded above purely so the future calibration run can compare them against fixture data.

**Ice fraction (§9 anchor model, −11 °C — interpolation illustration only, using an in-band NPAC value of 37.5):**

```
ice ≈ 54.5 − (37.5 − 33) / (42 − 33) × (54.5 − 45) = 54.5 − 4.77 = 49.7 %   → inside 45–54.5 ✓
```

**Other indicators:** fat 6.92 % (5–12 ✓) · lactose 5.44 % (4–6 ✓) · protein 3.72 % (3–6 ✓) · protein share in solids 37.22/332.955 = 11.2 % (9–13 ✓) · solids 33.30 % (31–45 ✓) · water 66.70 % (57–70 ✓) · alcohol 0 % ✓.
