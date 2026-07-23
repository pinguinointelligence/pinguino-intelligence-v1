# AGENT B — ENGINE COMPARISON LEDGER (read-only science)

**Program:** PINGÜINO NIGHTLY P0 · Agent B — Engine validation
**Date:** 2026-07-24
**Engine under test:** `calculateRecipe` (src/engine) — `engine_version 0.4.0`, `config_version 0.7.0`
**Science freeze:** nothing in this ledger changes any engine value. MyGelato numbers are a comparison source only — never promoted as truth.
**Drift detectors:** `src/qa/engine-validation/` — `fixtures.ts`, `b1PinguinoFruitGelato.test.ts`, `b2MyGelatoAutoBalanced.test.ts`, `b3OwnerDairyMilkGelato.test.ts`, `b1VsB2Divergence.test.ts` (15 tests, 5 inline snapshots pinning the values below).

---

## 0. Ingredient identity (documented mapping — no invention)

All fixtures use the repo's canonical demo catalog (`src/data/demoIngredients.ts`), the same
literature compositions used by `DEFAULT_CORRECTION_CANDIDATES`
(`src/engine/corrections/candidates.ts:70-178`). All rows: `confidence_score 85`,
`source_type 'manual'`, `is_verified false`, `pod_value/pac_value null` (engine derives POD/PAC
from the typed sugar split).

**SURROGATE:** there is no strawberry composition anywhere in the repo. The fixtures' "Strawberry"
is the **raspberry demo row** re-identified as `PI-ING-001553` / "STRAWBERRIES · Fresh Fruit"
(category `fruit`) — the exact convention already used by
`src/features/formulation/liveRuntime.test.ts:17-23` and
`src/features/formulation/constrainedReformulation.test.ts:21-26`.
Raspberry demo profile (`demoIngredients.ts:66`): water 86 / solids 14 / fat 0.3 / protein 1.2 /
sugar 4.4 (fructose 2.4 + glucose 2.0) / fiber 6.5 / kcal 43. Recorded as a surrogate, never as
strawberry truth.

The B3 gram set is the owner's exact "MyGelato copy" already exercised by
`src/features/constraint-studio/autoBalance.test.ts:182-192` (PHASE 10).
The B1 gram set is the repo's own `fruit_gelato_ref_v1` template proportions
(`src/features/formulation/templateRegistry.ts:179-195` — status `reference_derived`,
staging-only, "explicitly NOT scientifically approved").

Common parameters: mode `classic`, target −11 °C, `target_batch_grams 1000`,
`machine_capacity_grams null`.

---

## 1. Fixture tables — what the engine ACTUALLY returned

### B1 — PINGÜINO-generated Fruit Gelato (`fruit_gelato`, 1000 g)

Strawberry(surrogate) 350 / Milk 3.5% 380 / Cream 30% 80 / SMP 40 / Sucrose 110 / Dextrose 35 / Tara 5.

| Field | Value |
|---|---|
| engine_version / config_version | 0.4.0 / 0.7.0 |
| total_batch_g | 1000 |
| water_g / solids_g | 689.02 / 310.98 |
| fat_g / protein_g / lactose_g | 38.67 / 32.58 / 41.68 |
| sugar split (g) | sucrose 110 · dextrose 32.2 · glucose 7 · fructose 8.4 · lactose 41.68 · other 0 |
| POD | **16.0209** |
| PAC | 24.212 |
| NPAC (per_water_mass) | **36.6001** |
| ice fraction @ −11 °C | **50.6999 %** |
| lactose sandiness risk | 6.0492 |
| scores (tech/flavor/cost/overall) | 88.3413 / 70 / 89.2133 / **82.1399** |
| verdict (§15.1 public adapter) | **8/10 — "Bardzo dobrze dopasowana"** |
| cost_per_kg (reference costs) | 3.309 (complete) |
| warnings | none |

Indicators (band = milk_gelato @ −11 **category fallback**, `band_status seeded`,
`category_fallback true`, `temperature_fallback false` on **all 11**):

| Indicator | Value | Band | Status |
|---|---|---|---|
| pod | 16.0209 | 12–17 | good |
| npac | 36.6001 | 33–42 | ideal |
| ice_fraction | 50.6999 | 45–54.5 | ideal |
| lactose | 4.168 | 4–6 | good |
| lactose_sandiness_risk | 6.0492 | 5–9 | ideal |
| **fat** | **3.867** | **5–12** | **needs_correction** (below the dairy fat band) |
| aerating_protein | 3.258 | 3–6 | good |
| protein_in_solids | 10.4766 | 9–13 | ideal |
| total_solids | 31.098 | 31–45 | good |
| water | 68.902 | 57–70 | good |
| alcohol | 0 | 0–2.5 (warn>2.5) | good |

### B2 — MyGelato auto-balanced comparison (`fruit_gelato`, 1000.01 g)

Strawberry(surrogate) 265.7 / Milk 396.7 / Cream 119.5 / SMP 64 / Sucrose 117.8 / Dextrose 34.9 / Tara 1.41 — MyGelato's grams run through PINGÜINO's engine with the **same** demo compositions as B1.

| Field | Value |
|---|---|
| engine_version / config_version | 0.4.0 / 0.7.0 |
| total_batch_g | 1000.01 |
| water_g / solids_g | 656.5787 / 343.4313 |
| fat_g / protein_g / lactose_g | 51.0436 / 41.428 / 56.2651 |
| sugar split (g) | sucrose 117.8 · dextrose 32.108 · glucose 5.314 · fructose 6.3768 · lactose 56.2651 · other 0 |
| POD | **16.5525** |
| PAC | 25.728 |
| NPAC (per_water_mass) | **41.2457** |
| ice fraction @ −11 °C | **45.7962 %** |
| lactose sandiness risk | 8.5694 |
| scores (tech/flavor/cost/overall) | 89.1667 / 70 / 92.16 / **83.2067** |
| verdict (§15.1 public adapter) | **8/10 — "Bardzo dobrze dopasowana"** |
| cost_per_kg (reference costs) | 3.088 (complete) |
| warnings | none (0.01 g inside the 0.1 g batch tolerance) |

Indicators (same milk_gelato fallback band; `category_fallback true` on all 11):

| Indicator | Value | Band | Status |
|---|---|---|---|
| pod | 16.5525 | 12–17 | good |
| npac | 41.2457 | 33–42 | good |
| ice_fraction | 45.7962 | 45–54.5 | good |
| lactose | 5.6265 | 4–6 | good |
| lactose_sandiness_risk | 8.5694 | 5–9 | good |
| fat | 5.1043 | 5–12 | good |
| aerating_protein | 4.1428 | 3–6 | ideal |
| protein_in_solids | 12.063 | 9–13 | ideal |
| total_solids | 34.3428 | 31–45 | ideal |
| water | 65.6572 | 57–70 | ideal |
| alcohol | 0 | 0–2.5 | good |

### B3 — owner dairy fixture (`milk_gelato`, 999.91 g)

Milk 592.3 / Cream 216.6 / SMP 22 / Sucrose 32.5 / Dextrose 110 / Salt 0.8 / Inulin 23.7 / Tara 2.01.

| Field | Value |
|---|---|
| engine_version / config_version | 0.4.0 / 0.7.0 |
| total_batch_g | 999.91 |
| water_g / solids_g | 666.5831 / 333.3269 |
| fat_g / protein_g / lactose_g | 85.8865 / 32.2277 / 47.0182 |
| sugar split (g) | sucrose 32.5 · dextrose 101.2 · glucose 0 · fructose 0 · lactose 47.0182 · other 0 |
| POD | **11.4921** |
| PAC | 27.1823 |
| NPAC (per_water_mass) | **43.985** |
| ice fraction @ −11 °C | **42.9048 %** |
| lactose sandiness risk | 7.0536 |
| scores (tech/flavor/cost/overall) | 66.2059 / 70 / 100 / **75.9824** |
| verdict (§15.1 public adapter) | **8/10 — "Bardzo dobrze dopasowana"** |
| cost_per_kg (reference costs) | 2.0153 (complete) |
| warnings | none (0.09 g inside the 0.1 g batch tolerance) |

Indicators (milk_gelato @ −11 is its **own seeded band** — `category_fallback false`,
`temperature_fallback false` on all 11):

| Indicator | Value | Band | Status |
|---|---|---|---|
| **pod** | **11.4921** | **12–17** | **too_weak** |
| **npac** | **43.985** | **33–42** | **too_soft** |
| **ice_fraction** | **42.9048** | **45–54.5** | **too_soft** |
| lactose | 4.7022 | 4–6 | ideal |
| lactose_sandiness_risk | 7.0536 | 5–9 | ideal |
| fat | 8.5894 | 5–12 | ideal |
| aerating_protein | 3.2231 | 3–6 | good |
| protein_in_solids | 9.6685 | 9–13 | good |
| total_solids | 33.3357 | 31–45 | good |
| water | 66.6643 | 57–70 | ideal |
| alcohol | 0 | 0–2.5 | good |

Report-only observation (no judgment): the owner's MyGelato-copy dairy recipe violates three of
PINGÜINO's own seeded milk_gelato −11 bands (POD low, NPAC high, ice low), while the §15.1 public
verdict still reads 8/10 ("Bardzo dobrze dopasowana") because the mode-weighted overall (75.98)
rounds to 8 — recorded here as engine behavior, not as an assessment of either side.

---

## 2. Audit answers (evidence-cited)

### Q1 — Is PINGÜINO's "poziom zamrożenia" (ice fraction) computed on the same basis as MyGelato's?

**PINGÜINO's basis (proven by code):** anchor-matrix interpolation on NPAC — **not** an FPD
(freezing-point-depression) curve.

- `src/engine/iceFraction.ts:2-28` — "anchor-matrix MVP estimation (spec §9)": inverse-linear on
  NPAC inside a calibrated `(npac_low → ice_at_npac_low, npac_high → ice_at_npac_high)` band;
  outside the band the same slope extrapolates, clamped to [0, 100] (`iceFraction.ts:90-99`).
- Serving-temperature semantics: `temperature_c ≥ 0 → 0` (`iceFraction.ts:78`); row selection is
  exact-temperature match, else nearest by |Δtemp| (tie → colder), then a shift of
  `(row.temp − target) × 2.0` ice-points/°C — a **calibration-pending estimate**
  (`iceFraction.ts:95-96`, `src/engine/config/iceAnchors.ts:107-113`).
- Anchors: only `milk_gelato` rows exist — −11 verbatim from the locked spec (NPAC 33 → 54.5 %,
  42 → 45 %), −12/−13 from approved golden fixtures G15/G17/G11/G18
  (`config/iceAnchors.ts:54-87`). NPAC feeding the model is per-water-mass
  (`calculateRecipe.ts:120-133`, `config/coefficients.ts:53-59`).
- The documented upgrade path confirms the current model is NOT a freezing curve: "a
  freezing-curve model can replace these internals later" (`iceFraction.ts:26-27`).

**MyGelato's basis:** **no evidence in the repo.** The repo contains only MyGelato/reference-tool
*displayed output values* transcribed into fixtures (e.g. reference ice 52.77 % for the verified
raspberry-premium recipe, `src/engine/__fixtures__/externalReference/raspberry-premium.ts:52`), not
its formula. The repo's own calibration report explicitly leaves ice uncalibrated: "REPORT-ONLY:
ice fraction is off under both bases (anchor + fruit fallback deferred)"
(`src/engine/__fixtures__/externalReference/raspberryPremiumCalibration.report.test.ts:116-119`).

**Answer:** cannot be determined from evidence — PINGÜINO uses NPAC-anchor interpolation with a
±2.0 pts/°C temperature shift; whether MyGelato uses anchor interpolation, an FPD curve, or other
semantics (and what "serving temperature" means there) is unverifiable in this repo.
→ **Owner decision request OD-1** (§4).

### Q2 — Why does Fruit Gelato use Milk-Gelato fallback bands? Which indicators fall back at −11?

**Mechanism (two independent fallbacks, both to `milk_gelato`):**

1. **Target-band classification:** `selectTargetBand` filters `TARGET_BANDS` by category; when a
   category has zero bands, it re-filters on `CATEGORY_FALLBACK = 'milk_gelato'` and sets
   `category_fallback: true` (`src/engine/statuses.ts:65`, `statuses.ts:107-140`).
   `TARGET_BANDS` contains **no `fruit_gelato` entry at any temperature**
   (`src/engine/config/targets.ts:46-261`); the config header states why: "fruit_gelato /
   nut_gelato / alcohol_gelato / other stay UNSEEDED and keep the documented milk_gelato fallback
   (flagged calibration-pending)" (`targets.ts:30-31`) — bands were seeded only verbatim from the
   locked Temperature Regulator docs (milk, chocolate, sorbet, vegan), and no locked fruit_gelato
   regulator doc exists, so no fruit band was invented.
2. **Ice-fraction value itself:** the anchor rows are filtered category-first; an unseeded
   category falls back to the `milk_gelato` rows (`src/engine/iceFraction.ts:46`,
   `iceFraction.ts:80-84`; `ICE_ANCHOR_ROWS` has only milk_gelato rows,
   `config/iceAnchors.ts:54-87`) — "a pre-existing, documented category-fallback approximation"
   (`iceAnchors.ts:52`).

**Which indicators fall back for fruit_gelato at −11:** `classifyRecipeIndicators` makes ONE band
selection per recipe and applies it to all metrics (`statuses.ts:191-202`), so **all 11**
indicators carry `category_fallback: true`: pod, npac, ice_fraction, lactose,
lactose_sandiness_risk, fat, aerating_protein, protein_in_solids, total_solids, water, alcohol.
`temperature_fallback` is `false` (milk_gelato @ −11 is an exact-temperature seeded band,
`targets.ts:47-64`). Pinned by the B1/B2 tests (`b1PinguinoFruitGelato.test.ts`,
`b2MyGelatoAutoBalanced.test.ts` — the "CATEGORY-FALLBACK band (all 11 indicators)" assertions).

Known consequence already documented in-repo (not new): the dairy `fat 5–12` band applies to a
fruit recipe — B1's fat 3.867 % classifies `needs_correction`; and the engine counts fruit protein
in aerating_protein/protein_in_solids while the external reference counts dairy protein only
("DOCUMENTED GAP", `raspberryPremiumCalibration.report.test.ts:107-114`).

### Q3 — Pure tara vs stabilizer-blend semantics; is 5 g vs MyGelato's 1.41 g a unit/semantics difference or a template choice?

**What the engine assumes `tara_gum` is — a PURE tara gum powder (three consistent rows):**

- Demo catalog (`src/data/demoIngredients.ts:65`): water 12 / solids 88 / carbohydrate 80 /
  fiber 80 / kcal 200, `is_stabilizer`, cost 18 €/kg, `pod_value/pac_value null` → contributes
  **0 POD / 0 PAC/NPAC** (no typed sugars; `pod.ts:44-52`, `pac.ts:84-97`) — only water/solids/
  fiber mass.
- Correction-candidate row — same numbers (`src/engine/corrections/candidates.ts:166-177`).
- Verified external-reference profile (transcribed verbatim from the reference tool's per-100 g
  screen): water 9.5 / solids 90.5 / fiber 86.5 / protein 2 / **pod 0 / pac 0**
  (`src/engine/__fixtures__/externalReference/referenceProfiles.ts:173-197`).
- Mapper v1.0 row `PI-ING-000492` "TARA GUM · Stabilizer", subcategory `tara_gum`: water 9.5 /
  solids 90.5 / fiber 86.5 / stabilizer_activity 1 /
  **recommended_dosage_percent_min 0.2 / max 1**
  (`docs/ingredients/validation/mapper_basement.csv:492`; same in
  `pinguino_base_ingredients_cleaned_v0_95_no_npac.csv:492`). Stabilizer BLENDS are separate
  Mapper rows (e.g. `PI-ING-000490` Solmix Ic 235, subcategory `stabilizer_blend`) — pure gum and
  blends are never conflated in the data.

**Dosage bounds:** the engine has **no dosage-bound enforcement** — `recommended_dosage_percent_*`
is not read anywhere in `src/engine/**` or the formulation pipeline (repo-wide grep: only the data
layer `src/data/ingredients/ingredientRow.ts:88-89`, seeds and intake columns). The B1 dose of 5 g
comes from the template registry: `fruit_gelato_ref_v1` sets the stabilizer role to 5 g,
`adjustable: false` ("template-controlled dose"),
(`src/features/formulation/templateRegistry.ts:193`, same pattern at `:72` for `milk_base_v1`),
sourced from the goldenRecipes raspberry-premium QA proportions and explicitly labelled
`reference_derived`, staging-only, NOT approved science (`templateRegistry.ts:174-184`).

**Unit/semantics vs template choice — the evidence:**

- 5 g / 1000 g = **0.50 %** → inside the Mapper pure-gum recommendation (0.2–1 %).
- MyGelato 1.41 g / 1000 g = **0.141 %** → below the Mapper pure-gum minimum.
- The verified external-reference raspberry-premium recipe used **0.98 g**/1000 g (0.098 %)
  (`raspberry-premium.ts:46`) with the SAME pure-gum per-100 g profile — i.e. the reference tool
  itself doses pure tara far below PINGÜINO's template 5 g.
- Both tools' tara rows in this repo are pure gum per-100 g compositions; **no evidence of a
  grams-vs-percent unit mismatch anywhere** — all recipe lines are grams, all dosage
  recommendations are percent-of-mix (see Q4).

**Answer (evidence only):** on the evidence available, 5 g vs 1.41 g is a **dose choice**
(PINGÜINO's reference-derived template-controlled 5 g vs MyGelato auto-balance ≈1.4 g), not a unit
difference. What the repo CANNOT prove: whether the "Tara" line in the owner's MyGelato screen is
the same pure gum (composition of MyGelato's own ingredient record is not in the repo).
→ **Owner decision requests OD-3a/OD-3b** (§4).

### Q4 — Dosage units: grams-per-kg vs percent, everywhere stabilizer dosing appears

| Place | Unit | Evidence |
|---|---|---|
| Mapper `recommended_dosage_percent_min/max` | **percent of total mix** (0–100) | `docs/ingredients/PINGUINO_BASE_INGREDIENTS_SCHEMA.md:105-106` ("0–100 · of total mix"); typed `number \| null` in `src/data/ingredients/ingredientRow.ts:88-89`; tara row 0.2–1 (%) = 2–10 g/kg |
| Formulation templates | **grams at the template's base batch** (`baseBatchG` = 1000 or 1000.1) | `templateRegistry.ts:28-48` ("Verbatim grams at the template's base batch"), scaled to the recipe's target batch by the pipeline (`templateRegistry.ts:19-21`) |
| Engine recipe lines | **grams** (`planned_grams`/`actual_grams`/`effective_grams`) | `src/engine/types.ts:144-162`; composition math is `grams × percent / 100` (`src/engine/composition.ts:57-60`) |
| Engine dosage enforcement | **none** — the engine never reads `recommended_dosage_percent_*` | repo-wide grep: no reference under `src/engine/**` or `src/features/formulation/**` |
| Test-level sanity bounds | grams on a 1000 g batch (tara ≤ 6 g) | `src/features/formulation/formulation.test.ts:105,202` |

**Answer:** Mapper dosage fields are percent-of-mix; template/solver/engine quantities are grams.
Because template base batches are 1000 g, template grams are numerically g-per-kg (5 g ⇒ 0.5 %).
No unit conversion bug can exist in the engine today because the percent fields are **never
consumed** — the Mapper-dosage → formulation-bounds connection simply does not exist yet (a gap,
not an error). → **Owner decision request OD-4** (§4).

### Q5 — B1 vs B2 divergence (engine outputs side by side; deltas = B1 − B2; NO conclusion about which is right)

Same category (`fruit_gelato`), same −11 band set (milk_gelato fallback), same demo compositions —
only gram distribution differs. Pinned in `b1VsB2Divergence.test.ts`.

| Metric | B1 (PINGÜINO) | B2 (MyGelato grams) | Δ (B1−B2) | PINGÜINO band | Violations |
|---|---|---|---|---|---|
| total_batch_g | 1000 | 1000.01 | −0.01 | — | — |
| water % | 68.902 | 65.6572 | +3.2448 | 57–70 | none |
| solids % | 31.098 | 34.3428 | −3.2448 | 31–45 | none (B1 sits 0.098 above the min edge) |
| fat % | 3.867 | 5.1043 | −1.2373 | 5–12 | **B1 below band → needs_correction**; B2 in band |
| protein % (aerating) | 3.258 | 4.1428 | −0.8848 | 3–6 | none |
| lactose % | 4.168 | 5.6265 | −1.4585 | 4–6 | none |
| sucrose_g | 110 | 117.8 | −7.8 | — | — |
| dextrose_g | 32.2 | 32.108 | +0.092 | — | — |
| glucose_g | 7 | 5.314 | +1.686 | — | — |
| fructose_g | 8.4 | 6.3768 | +2.0232 | — | — |
| lactose_g | 41.68 | 56.2651 | −14.5851 | — | — |
| POD | 16.0209 | 16.5525 | −0.5316 | 12–17 | none (both upper half, "good") |
| PAC | 24.212 | 25.728 | −1.516 | — | — |
| NPAC | 36.6001 | 41.2457 | −4.6456 | 33–42 | none (B1 "ideal"; B2 0.75 below the max edge, "good") |
| ice fraction % | 50.6999 | 45.7962 | +4.9037 | 45–54.5 | none (B2 0.8 above the min edge, "good") |
| sandiness risk | 6.0492 | 8.5694 | −2.5202 | 5–9 | none |
| technical score | 88.3413 | 89.1667 | −0.8254 | — | — |
| overall score | 82.1399 | 83.2067 | −1.0668 | — | — |
| cost €/kg (ref costs) | 3.309 | 3.088 | +0.221 | — | — |

**Where they diverge (facts only):** B1 carries +84.3 g fruit and −128.7 g dairy(+SMP) vs B2 →
B1 is wetter (+3.24 pp water), leaner (−1.24 pp fat, the only band violation on either side:
B1 fat 3.867 < 5), lower-lactose (−14.6 g), and lower-NPAC (−4.65) hence icier (+4.9 pp) — B1
sits mid-band on npac/ice ("ideal") where B2 sits near the band edges ("good"); B2's extra SMP
pushes lactose and sandiness risk toward (not past) their maxima. Both public verdicts are 8/10.
Which distribution is "right" is NOT concluded here (science freeze).

---

## 3. Cross-check note (B3 vs the same grams elsewhere in the repo)

The identical B3 gram set is routed through the auto-balance preview in
`autoBalance.test.ts:194-212`, which accepts EITHER a real correction preview or a proven failure
with named metrics — consistent with the three band violations recorded here (pod/npac/ice).
No repo record asserts MyGelato's own displayed indicator values for this recipe (only its grams
arrived), so no MyGelato-vs-PINGÜINO indicator delta can be produced for B3 without new owner
data. → **OD-2**.

---

## 4. Owner decision requests (exact — where evidence is insufficient)

- **OD-1 (Q1, ice-fraction basis):** Provide MyGelato's ice-fraction definition for "poziom
  zamrożenia": (a) model type (anchor/table interpolation vs freezing-point-depression curve vs
  other), (b) the exact input it depends on (NPAC-like index? sugar spectrum? water basis?), and
  (c) its serving-temperature semantics (cabinet temp vs core temp; behavior at ≥ 0 °C). Without
  this, PINGÜINO-vs-MyGelato ice numbers can only be compared as displayed values, never as
  same-basis quantities. If unavailable, approve recording MyGelato ice values as
  "display-only, basis unknown" in all future comparisons.
- **OD-2 (Q5/B3):** Provide MyGelato's displayed outputs (POD/sweetness, freezing index, ice
  fraction, solids/fat/lactose %) for the B2 and B3 recipes as transcribed screens, so a true
  engine-vs-engine output table can be recorded (today only MyGelato's grams are in the repo,
  so §2-Q5 compares PINGÜINO's engine on two gram sets — not the two engines).
- **OD-3a (Q3, tara identity in MyGelato):** Confirm whether the "Tara" line in the MyGelato
  recipes (B2's 1.41 g; the reference recipes' 0.98 g) is pure tara gum or a stabilizer blend,
  ideally with its per-100 g screen. The repo's transcribed reference profile is pure gum
  (90.5 % solids / 86.5 % fiber) but B2's own ingredient record is not in the repo.
- **OD-3b (Q3, PINGÜINO tara dose):** The 5 g/1000 g tara dose is `reference_derived`
  (staging-only, "NOT scientifically approved" — `templateRegistry.ts:174-184`) and
  template-controlled. Decide the approved stabilizer dose (or dose range) for the fruit-gelato
  template — e.g. whether to align it with the Mapper recommendation window 0.2–1 % (2–10 g/kg)
  and where inside it.
- **OD-4 (Q4, dosage wiring):** Decide whether `recommended_dosage_percent_min/max` from the
  Mapper should be enforced anywhere (formulation bounds, solver clamps, or UI warnings). Today
  they are data-only; no engine or solver consumes them. If enforcement is wanted, name the layer
  and the behavior on violation (block/warn/clamp) — nothing was implemented pending this
  decision (science freeze).
- **OD-5 (Q2, fruit bands — pre-existing, restated for completeness):** fruit_gelato (and
  nut/alcohol_gelato) classify against milk_gelato bands and milk_gelato ice anchors at every
  temperature, flagged `category_fallback`. A locked fruit-gelato regulator doc (bands + at least
  two approved ice anchor points per temperature, + the dairy-only protein counting rule) is the
  only path to removing the fallback without inventing science.

---

## 5. Gates & artifacts

- `npx tsc -b` — clean.
- `npx eslint .` — 0 errors (2 pre-existing react-refresh warnings elsewhere, untouched).
- `npx vitest run src/qa/engine-validation/` — 4 files, 15 tests, green (5 snapshots written on
  first record, asserted thereafter).
- Full suite (`npx vitest run`) — 4,769 passed; **14 failures, all PRE-EXISTING** at the branch
  base (4dfb097), all in `src/features/ingredients/*.migration.test.ts` string-scan tests
  (products 1, productsIdentity 1, productsCodeSequenceGrants 6, productsMapperResults 4,
  productSnapshots 2). Proven unrelated: with the Agent B files stashed, the same tests fail
  identically. No implementation file was touched by Agent B (files added only).
- Drift detectors pin: ingredient IDs, composition totals, POD/PAC/NPAC, ice fraction, all 11
  indicator values+statuses+bands+`band_status`+`category_fallback`/`temperature_fallback`,
  scores+§15.1 verdict, cost state, warnings, `engine_version`/`config_version`.
