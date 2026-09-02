# GELLATTI PRO FINAL v1.7 — Phase A evidence

Date: 2026-08-27
Baseline: `origin/staging` at `7e6354270e5c3da390d532fb0fd19f174dc8ba04`
Working branch: `codex/gellatti-pro-final-v17`
Deployment boundary: staging only; public production is out of scope

## 1. P0 Production score truth

### Owner fixture reproduced

Recipe `FinalTests1`, version 1, ECO, −11°C, target batch 1000 g:

| Ingredient | Planned | Actual before Rescue | Rescue result |
| --- | ---: | ---: | ---: |
| Milk | 657 g | 657 g | 664.7 g |
| Cream | 95 g | 95.5 g | 95.5 g |
| SMP | 49 g | 49 g | 49 g |
| Sucrose | 85 g | 95 g | 95 g |
| Dextrose | 71 g | 71 g | 71 g |
| TARA | 3 g | 3 g | 3 g |
| Apple | 40 g | 40 g | 40 g |
| **Total** | **1000 g** | **1010.5 g** | **1018.2 g** |

Observed score path: planned **10/10** → actual forecast **7/10** → server-authorized Rescue **8/10**. The Rescue recommendation is **+7.7 g Milk**, producing the exact final Milk amount of **664.7 g**.

### Root cause

The score change is not caused by batch-size normalization. The actual vector is not a uniform scale of the plan: Cream increases by 0.5 g, Sucrose increases by 10 g, and the other ingredients do not scale. That changes normalized shares and therefore the physical formula.

Key normalized differences:

| Metric | Planned | Actual forecast | Change |
| --- | ---: | ---: | ---: |
| Milk share | 65.7000% | 65.0173% | −0.6827 pp |
| Sucrose share | 8.5000% | 9.4013% | +0.9013 pp |
| Total solids | 31.0182% | 31.7031% | +0.6849 pp |
| POD | 14.9930 | 15.8271 | +0.8341 |
| NPAC | 40.9239 | 42.3565 | +1.4325 |
| Ice | 46.1359% | 44.6237% | −1.5121 pp |
| Technical subscore | 87.5000 | 72.1039 | −15.3961 |

Changing only `target_batch_grams` from 1000 g to 1010.5 g while keeping the same actual grams produces the same normalized metrics and the same 7/10 forecast. This rules out a stale denominator as the cause.

### Locked invariant

`uniform_batch_scaling_preserves_formula_score` uses real Mapper ingredient rows and proves that multiplying every gram value by 1.001, 1.05, 1.2, and 2 preserves:

- normalized ingredient shares;
- percentages and normalized sugars;
- POD, PAC, NPAC, and ice;
- indicator status and fallback state;
- technical, flavor, cost, and overall subscores;
- nutrition per 100 g and cost per kg;
- the public ten-point score.

The same test file separately covers mixed over/under weighing, no deviation, and the exact owner 10→7→8 path. No Engine formula, target band, score adapter, or Mapper row was changed.

## 2. Recalculate ingredient marker truth

The previous marker mixed three meanings: difference from a persisted clean draft, customer-price dirtiness, and ingredient recalculation. This is why an unchanged line such as Apple could remain accented after a later recalculation.

The accepted meaning is now singular:

> An ingredient is marked only when that exact line materially changed between the input and output of the latest successful Recalculate operation in the current open draft session.

Contract:

- session-only and not persisted;
- independent of price edits, save dirtiness, and Recipe version state;
- 0.05 g materiality threshold, matching half of the one-decimal display step;
- identity or lock changes are material;
- additions are marked; removed lines cannot render a marker;
- a second Recalculate replaces the first result;
- Apply republishes the verified before/after result;
- Cancel, Undo, manual material edit, reopen, no-op, failure, and draft reset clear it;
- Save alone does not change the meaning inside the still-open session.

The exact Apple/TARA regression proves that unchanged Apple and TARA remain unmarked while changed Milk and Cream are marked. Customer-price changes cannot create or move the marker.

## 3. Production simplification

The weighing surface now has one primary interaction per ingredient: `− / grams / + / ✓`.

Removed from the permanent visual layer:

- the five-column visual legend;
- `Faktycznie` as a repeated column label;
- default `DO DODANIA` badges;
- `0 g` and `zgodnie z planem` noise;
- the permanent 1/2/3 procedure;
- the permanent warning about confirmed quantities;
- the duplicate progress/score header treatment.

Preserved:

- screen-reader plan/actual/deviation semantics;
- exact decimal grams and 10,000 g control capacity;
- confirmation, correction, top-up, and Rescue rules;
- contextual status only when a row is edited, confirmed, corrected, or in top-up;
- clear non-zero deviation as `Planowo: X g` plus `Y g więcej/mniej`;
- immutable completed-row behavior.

## 4. TARA/process timing

Heat/process information remains informational: it does not select a process, route the recipe, alter grams, change ProductBehavior, or enter score/Engine calculations.

When authoritative metadata names products that require heat treatment:

1. a compact `Pamiętaj o obróbce` card appears before the batch starts;
2. one explicit `OK` acknowledgment is required and durably recorded by the existing production acknowledgment event;
3. the card disappears after acknowledgment and is absent throughout active weighing and Rescue;
4. because the current label does not carry this process instruction, a quiet completed-summary line retains it as `Obróbka na ciepło: …`.

Unknown process metadata renders no instruction. The separate degassing safety contract is unchanged.

## 5. Frozen product rules verified

- Customer-visible choices remain exactly: −11°C, −12°C, −13°C, Świeże, Ninja Gelato, Ninja Swirl.
- `Ninja 2` was not introduced.
- Routing remains Świeże → −11°C, Ninja Gelato → −13°C, Ninja Swirl → −11°C.
- Demo/Home/Pro grams and saved-recipe entitlements were not changed.
- `mapper_basement` was not changed.
- No public production deployment, secret, environment, credential, billing, database, or migration change was made.
