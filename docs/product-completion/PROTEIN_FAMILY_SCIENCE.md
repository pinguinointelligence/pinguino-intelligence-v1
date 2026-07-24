# PROTEIN FAMILY — Primary Literature Review + Product Contract

**Status:** research + design doc (docs-only). **NO src changes.** Engine is immutable:
POD / PAC / NPAC / ice / water / solids / fat / protein / lactose / sandiness formulas are
untouched. This document proposes *data* (bands, targets, source lists) and *warnings* for the
owner to ratify; it changes no formula, no config, no version.

**Engine baseline referenced:** `ENGINE_VERSION 0.4.0` / `CONFIG_VERSION 0.7.0`
(`src/engine/config/version.ts`). Branch: `worktree-agent-a25121477322515d3` off
`nightly/integration` (a55f5fc).

**Mapper evidence:** staging Supabase `tunabqqrwabacxjcxxkz`, table `mapper_basement`, **read-only
SELECT**, verified 2026-07-25. All quoted rows are `verification_status='Verified'` and
`approved_for_engines=true` unless stated.

**Neutral-wording rule** honoured: external benchmark engines are never named — "reference data" /
"calibration data".

---

## PART 1 — PRIMARY LITERATURE REVIEW

### 1.1 What protein actually does in the frozen matrix (mechanisms)

Ice cream / gelato is a **partially frozen foam**: ice crystals + air cells dispersed in an
unfrozen serum of sugars, proteins, salts and stabilizers, with partially-coalesced fat around the
air cells. Milk proteins sit in the **serum (non-fat) phase** and do four structural jobs
(Goff & Hartel, *Ice Cream*, 7th ed., 2013; Milk Proteins in Ice Cream, Springer/Advanced Dairy
Chemistry, 2016):

1. **Aeration / foam stabilisation** — serum protein adsorbs at the air–serum interface during
   whipping, forming and stabilising small air bubbles. **Whey protein is the strong aerator;**
   casein contributes more to emulsion/body than to foam.
2. **Emulsification** — protein (esp. casein) adsorbs at the fat globule surface, controlling the
   partial coalescence that builds dryness and shape retention.
3. **Water binding / viscosity** — protein hydrates and raises mix viscosity, slowing water
   mobility and moderating ice-crystal growth on storage (recrystallisation).
4. **Body / total solids** — protein is ~90–99% dry solids, so it raises total solids and lowers
   free water directly.

**Freezing point is barely moved by protein.** Freezing-point depression is a *colligative*
(molar) effect; proteins are very high molecular weight, so per gram they contribute almost nothing
to PAC/NPAC. The freezing structure of a mix is set by **sugars + milk minerals + lactose**, not by
the protein itself (Goff & Hartel 2013; MSNF discussion). **This is the load-bearing fact for the
band proposal in Part 2 C4:** at equal sugar and equal total solids, a protein-family mix freezes
essentially like the dairy baseline, so its POD / NPAC / ice bands can inherit the milk_gelato
temperature structure — but its lactose and mineral load (which *do* move PAC and drive sandiness)
depend entirely on **which** protein source is used.

### 1.2 Per-source review (sources are NOT interchangeable)

Directional effects at increasing protein load, synthesised across the studies in the Sources list.
Across recent high-protein ice-cream studies (Current Research in Nutrition & Food Science, 2023;
"Quality attributes of high protein ice cream … whey protein isolate", Applied Food Research, 2021;
VanWees et al., *J. Food Science*, 2026), raising protein from ~4% to ~12% consistently drove
**overrun down** (reported ~95% → ~34%; WPC gave the lowest overrun ~52%), **instrumental hardness
up** (~14 N → ~48 N; WPC highest), and **melting rate up** (~0.24 → ~0.74 g/mL) — with protein
*type* modulating ice-crystal size (isolates reduce mean crystal size; concentrates increase it).

| Source | Protein % (typical) | Lactose | Aeration | Viscosity / water-bind | Key texture effect | Off-notes / defects | Usable added-protein range |
|---|---|---|---|---|---|---|---|
| **WPC** (whey protein concentrate) | 34–80 | **moderate–high** (WPC80 ~4–15%, WPC60 ~28%) | strong (whey aerates) | moderate | lowers overrun, firmer; smaller crystals at isolate-grade | bitter / custard-eggy / mouthcoating > ~10% protein; **lactose → sandiness** | ≤ ~6–10% protein |
| **WPI** (whey protein isolate) | ≥ 90 | **very low** (<1%) | strong | moderate | isolate → **smaller ice crystals**, cleaner low-lactose route to high protein | **chalky / gritty / bitter above ~10%**; Ca²⁺/mineral → heat-induced aggregation, mix gelation | ≤ ~8–10% protein |
| **MPC / micellar casein** | 55–85 | low–moderate (MPC ~10%) | weaker foam, strong emulsion | **highest** water-bind, viscosity, heat stability, shape retention (Alvarez et al., *J. Dairy Sci.* 88, 2005) | more body, chewier, best melt/shape retention | least off-note of the concentrates; higher hedonic than plant | broad; casein:whey ratio tunes body vs foam |
| **SMP** (skim milk powder) | 34–37 | **very high (~50%)** | moderate | moderate | cheap MSNF/body booster | **classic sandiness driver** — lactose crystallises on storage | tight — **lactose-limited, not protein-limited** |
| **Egg (white / whole / yolk)** | white ~82, whole ~48, yolk ~35 | 0 | white foams; yolk emulsifies (lecithin) | yolk adds fat | custard body (yolk), aeration (white) | **eggy/custard flavour**; yolk is 50%+ fat, not a lean booster | flavour-led, not a clean protein lever |
| **Pea protein** | ~80 | 0 (plant) | moderate, aggregates | high | good melt resistance | **beany / grassy / earthy** (aldehydes, pyrazines); lowest hedonic with milk-protein controls | low; masking required |
| **Soy protein** | ~90 | 0 (plant) | moderate | high | good melt resistance | **beany / woody**, widely disliked; lowest acceptability | low; masking required |
| **Rice protein** | ~80–84 | 0 (plant) | weak | moderate | melt-resistant but can read chalky/gritty; lower solubility | milder than pea/soy but grainy | low–moderate |

**Quantified sensory anchors:**

- **Whey acceptability ceiling ~10%.** In thickened, protein-enhanced ice cream, 6/8/10% whey
  protein were liked *more* than the control, but **12% and 14% were not** — whey added slippery,
  gritty, grainy, bitter, custard/eggy and mouthcoating attributes (Moss et al., *J. Texture
  Studies*, 2023). This is the primary evidence line for a chalkiness/graininess warning above ~10%.
- **Plant << dairy on liking.** Enriching 4–7% protein, milk-protein ice cream scored **6.56** on a
  9-point hedonic scale vs **3.92 (pea)** and **3.76 (soy)** — beany notes persisted even with
  added masking (*Journal of Dairy Science*, 2024). Plant proteins gave *greater* melt resistance
  but lower liking (Hasan et al., *Food Science & Nutrition*, 2024).
- **Sandiness is a lactose limit.** Sandiness is avoided when **total mix lactose < ~7%** (Tharp &
  Young, *Tharp & Young on Ice Cream*, 2013) and when lactose crystals stay **< 10 µm** (Walstra
  et al.; Hunziker 1934, as cited). This is why SMP and high-lactose WPC are self-limiting.
- **WPI mineral / heat-stability caveat.** WPI carries native minerals; divalent Ca²⁺ bridges
  carboxyl groups between chains, promoting **heat-induced aggregation / gelation** during
  pasteurisation of a high-WPI mix. Demineralisation or calcium-sequestering salts (citrate)
  mitigate it (heat-stable WPI work, *J. Dairy Sci.*, 2024; calcium-binding heat-stability studies).

### 1.3 Commercial benchmarks (orientation only)

| Product | Per serving | Per pint (~473 mL) | Style |
|---|---|---|---|
| Halo Top | ~5–8 g / (~85–100 g serving) | ~20 g | air-whipped, low-cal |
| Enlightened | ~7–9 g | ~24 g | air-whipped |
| Nick's | — | ~16 g | denser, creamier, low-sugar |

Category envelope: pints span ~12–28 g protein and ~280–430 kcal. Per 100 g this is roughly
**~5–7 g protein / 100 g** for mainstream "high-protein" pints. Gelato (denser, higher solids,
lower overrun) can carry protein at the top of or above this envelope. **Regulatory anchor (EU):**
under Reg. (EC) No 1924/2006 Annex, "**source of protein**" needs **≥ 12% of energy** from protein
and "**high protein**" needs **≥ 20% of energy** from protein — energy-based, so a lower-calorie
gelato reaches the claim at a lower gram count. (Regulatory context, not a peer-reviewed result;
label claims are an owner/legal decision, and the engine has no claim gate — see C1.)

---

## PART 2 — PRODUCT CONTRACT

### C1 — Target protein content (default + optional higher tier)

Justification chain: standard gelato sits at ~3.5–4.5% protein (milk_gelato `aerating_protein`
band `[3,6]`). A protein product must sit clearly above that, below the ~10% whey defect ceiling
(Moss 2023), near/above the commercial ~5–7 g/100 g envelope, and reach EU claims at gelato's
calorie density.

| Tier | Target protein / 100 g | Band / 100 g | Per 60 g | Per 70 g | Per 80 g | Rationale |
|---|---|---|---|---|---|---|
| **P1 — "Protein gelato" (DEFAULT)** | **8 g** | **7–9 g** | 4.2–5.4 g | 4.9–6.3 g | 5.6–7.2 g | above standard gelato, at/above commercial envelope, well below the ~10% defect ceiling; typically clears EU "source of protein" |
| **P2 — "High-protein gelato" (OPTIONAL)** | **12 g** | **10–13 g** | 6.0–7.8 g | 7.0–9.1 g | 8.0–10.4 g | approaches the literature defect ceiling; matches/beats commercial per-serving; can clear EU "high protein" at low kcal — **requires low-lactose, low-mineral sourcing (WPI / MPC / low-lactose WPC)** |

Servings 60/70/80 g are the engine's own `STANDARD_SERVINGS_G` (`src/engine/cost.ts:14`); the
engine already computes `protein_g` per 100 g (`src/engine/nutrition.ts`), so per-serving protein is
a pure multiply — **no new metric needed.** Targets are **PROPOSED-FOR-OWNER-RATIFICATION.**

### C2 — Approved sources from the REAL Mapper (read-only, 2026-07-25)

All rows below are **Verified + approved_for_engines** on staging. `aer_prot` = the Mapper's curated
`aerating_protein_percent`; `lac` = `lactose_percent`. PAC/POD are the engine's own values.

| Mapper id | Display (trimmed) | Subcategory | Protein % | aer_prot % | Lactose % | Solids % | Fat % | PAC | Vegan | Family role |
|---|---|---|---|---|---|---|---|---|---|---|
| PI-ING-000452 | RICE PROTEIN · Dry | protein_powder | 84.0 | 84.0 | 0 | 99.0 | 5.0 | 0.00 | ✓ | plant protein |
| PI-ING-000450 | RICE PROTEIN · Dry · 100% | protein_powder | 83.4 | 83.4 | 0 | 99.5 | 6.0 | 0.81 | ✓ | plant protein |
| PI-ING-001347 | CHICKEN EGG WHITE DRIED | dried_egg_white | 82.3 | **0.0** | 0 | 93.1 | 0.0 | 23.18 | ✗ | egg protein |
| PI-ING-000451 | PEA PROTEIN · Dry | protein_powder | 81.7 | 81.7 | 0 | 97.8 | 9.0 | 29.25 | ✓ | plant protein |
| PI-ING-000295 | WPC 80% | whey_protein_concentrate | 80.0 | 80.0 | **15.0** | 97.0 | 1.7 | 16.76 | ✗ | whey (WPC) |
| PI-ING-000264 | PROTEIN GEL WPC · Sempre SEMPRE230 | whey_protein_concentrate_powder | 80.0 | 80.0 | **3.3** | 96.3 | 7.0 | 5.06 | ✗ | **low-lactose whey** |
| PI-ING-000237 | MILK PROTEIN CONCENTRATE WPC 75% | milk_protein_concentrate | 75.0 | 75.0 | 10.0 | 85.9 | 0.6 | 11.76 | ✗ | MPC (casein+whey) |
| PI-ING-000294 | WPC 60% | whey_protein_concentrate | 60.0 | 60.0 | **28.0** | 95.3 | 7.0 | 29.76 | ✗ | whey, high-lactose |
| PI-ING-001379 | HAMULSION SAH · Tate & Lyle | milk_whey_protein_blend | 55.0 | **0.0** | 27.0 | 89.7 | 4.2 | 29.69 | ✗ | protein/emulsifier blend |
| PI-ING-001667 | CHICKEN EGGS (whole egg pdr) | powdered_whole_egg | 47.5 | 0.0 | 0 | 93.8 | 39.0 | 7.31 | ✗ | whole egg (high fat) |
| PI-ING-000285 | Valio Eila PRO skim | lactose_free_skimmed_milk_powder | 47.0 | 47.0 | **41.2** | 90.3 | 0.9 | 79.80 | ✗ | skim powder (see anomaly) |
| PI-ING-000283 | Valio Eila sweet | lactose_free_skimmed_milk_powder | 37.0 | 37.0 | **52.4** | 91.0 | 0.6 | 99.60 | ✗ | skim powder (see anomaly) |
| PI-ING-000270 | SKIMMED MILK · Milk | skimmed_milk_powder | 35.7 | 35.7 | **51.0** | 89.7 | 0.8 | 58.02 | ✗ | **SMP** |
| PI-ING-001645 | EGG YOLK DRIED | dried_egg_yolk | 34.5 | 0.0 | 0 | 93.9 | 56.5 | 2.60 | ✗ | yolk (emulsifier) |
| PI-ING-000286 | Valio whole lactose | lactose_free_whole_milk_powder | 32.0 | 32.0 | 32.0 | 90.9 | 26.0 | 57.00 | ✗ | whole milk powder |
| PI-ING-000284 | Valio sweet whole | lactose_free_whole_milk_powder | 27.0 | 27.0 | 38.0 | 91.8 | 26.0 | 72.20 | ✗ | whole milk powder |
| PI-ING-000296 | WHOLE MILK · Milk | whole_milk_powder | 26.0 | 26.0 | 40.0 | 92.9 | 26.0 | 45.27 | ✗ | WMP |
| PI-ING-001650 | EMULSIFIER · Essenza | emulsifier_milk_protein_fiber | 21.0 | 0.0 | 32.9 | 90.4 | 9.8 | 38.05 | ✗ | protein/fibre blend |

**Recommended family "clean protein-lever" set** (high protein, low lactose/off-note):
`PI-ING-000264` (low-lactose whey, lactose 3.3%), `PI-ING-000237` (MPC 75%), `PI-ING-000295`
(WPC 80% — but lactose 15%, watch sandiness), plus plant options `PI-ING-000451` (pea) /
`PI-ING-000450`/`000452` (rice) for vegan lines with masking.

**GAPS reported honestly:**

1. **No true WPI (≥90% isolate) row** — the highest whey is WPC 80%. The cleanest low-lactose,
   high-protein lever the literature recommends (and the P2 tier leans on) **does not exist in the
   Mapper.** New verified WPI intake is an owner action.
2. **No pure micellar casein / caseinate row** — MPC 75% (`PI-ING-000237`, casein+whey blend) is the
   nearest. Pure micellar casein (best body/melt-resistance per Alvarez 2005) is absent.
3. **No soy protein row** — the Mapper's plant proteins are **pea and rice only**. Any soy claim
   needs a new verified row (and soy has the worst off-note profile anyway).
4. **"lactose-free" naming vs data anomaly** — `PI-ING-000285` / `000283` are subcategorised
   `lactose_free_skimmed_milk_powder` yet carry `lactose_percent` 41.2 / 52.4. Either the composition
   row logs pre-hydrolysis lactose (split to glucose+galactose but still tallied), or it is a data
   error. **Do not trust the "lactose-free" label for the sandiness guard** — the engine will read
   40–52% lactose from these rows. Flag for Mapper review.
5. **`aerating_protein_percent` is curated but ENGINE-IGNORED** — the Mapper distinguishes aerating
   (whey/casein/milk/plant = protein%) from non-aerating (egg, blends, emulsifier = 0). But the
   engine's `composition` type carries only `protein_percent` (`src/engine/types.ts`), and
   `calculateRecipe` sets the `aerating_protein` metric = **total** protein %
   (`src/engine/calculateRecipe.ts:148`). So the curated column is dropped at the engine boundary,
   and the engine treats egg/blend protein as if it aerates. See C5/C9.

### C3 — Per-source constraints as EXPLICIT, evidence-based warnings

These are **warnings/labels grounded in cited literature and in the ingredient's own Mapper
composition — never fabricated engine scores.** Each names its evidence.

- **W1 — WPI/whey chalkiness & bitterness cap.** When total mix protein (engine `aerating_protein`)
  exceeds **~10%**, warn *"chalky/gritty/bitter risk"* (Moss et al. 2023: 12–14% whey disliked). At
  the P2 tier (target 12 g/100 g) this warning is expected-on and is a **sensory disclosure**, not a
  block.
- **W2 — SMP / high-lactose sandiness.** This maps onto an **existing engine metric**:
  `lactose_sandiness_risk = lactose_g / water_g × 100` (`src/engine/statuses.ts:213`). When a
  high-lactose source (SMP `PI-ING-000270` @ 51%, WPC60 @ 28%, or the anomalous "lactose-free" skim
  @ 41–52%) pushes the mix above the band max, the engine's own indicator classifies **risky**.
  Cross-check against Tharp & Young's *total mix lactose < 7%*. **No new metric required — reuse the
  engine guard.**
- **W3 — Pea/soy/rice off-note cap.** For plant sources, warn and recommend capping plant protein at
  **~4–6%** with masking (JDS 2024 hedonic 3.9/3.8 vs 6.6 for milk protein; Hasan 2024). Plant
  routes are vegan-family; keep them out of the dairy protein bands.
- **W4 — WPI mineral / heat-stability.** If/when a real WPI row is added, warn on **high-WPI +
  high-heat** mixes (Ca²⁺-driven aggregation/gelation on pasteurisation). Advisory process note; the
  engine models no pasteurisation step.
- **W5 — WPC60 / "whey ≠ low-lactose."** `PI-ING-000294` is *whey* but 28% lactose — flag that not
  all whey is a clean lever; prefer `PI-ING-000264` (3.3%) or a real WPI. Illustrates *sources are
  not interchangeable*.
- **W6 — Egg/yolk fat & flavour.** Egg white aerates but the Mapper flags it `aer_prot=0`; whole
  egg/yolk carry 39–56% fat and custard flavour — treat as flavour/emulsion ingredients, not clean
  protein levers.

### C4 — PROPOSED target bands: protein family × −11 / −12 / −13

**Construction rule (auditable):** freezing-driven metrics (`pod`, `npac`, `ice_fraction`,
`alcohol`) are **inherited verbatim from the milk_gelato bands** at each temperature
(`src/engine/config/targets.ts`) — justified because protein does not depress the freezing point
(Part 1.1). Only the **protein, lactose/sandiness, solids, water, fat** metrics are re-anchored for
high protein, from the milk_gelato baseline shifted by the protein-solids the family adds. **Every
number is PROPOSED-FOR-OWNER-RATIFICATION — none is calibrated truth.** Uses only existing engine
metrics.

Inherited-from-milk_gelato per temperature (unchanged): `pod` −11/−12/−13 = [12,17]; `npac` =
[33,42]/[42,50]/[48,55]; `ice_fraction` = [45,54.5]/[46,54]/[46,52]; `alcohol` = [0,2.5] warn 2.5.

**Tier P1 — "Protein gelato" (default, ~8 g/100 g):**

| Metric | −11 | −12 | −13 | Baseline (milk −12) | Why shifted |
|---|---|---|---|---|---|
| aerating_protein | [7,9] | [7,9] | [7,9] | [3,6] | target ~8% total protein |
| protein_in_solids | [16,24] | [16,24] | [16,24] | [9,13] | 8% protein / ~40% solids ≈ 20% |
| lactose | [0,6] | [0,6] | [0,6] | [4,6] | min→0 (WPI/plant lactose-free); max = dairy sandiness ceiling |
| lactose_sandiness_risk | [0,9] | [0,9] | [0,9] | [5,9] | **guard max unchanged** (W2) |
| fat | [4,12] | [4,12] | [4,12] | [5,12] | allow leaner high-protein builds |
| total_solids | [34,46] | [34,46] | [36,46] | [31,44] | +~3–4% protein solids |
| water | [54,66] | [54,66] | [54,64] | [56,70] | complement of solids |

**Tier P2 — "High-protein gelato" (optional, ~12 g/100 g):**

| Metric | −11 | −12 | −13 | Why |
|---|---|---|---|---|
| aerating_protein | [10,13] | [10,13] | [10,13] | target ~12%; **W1 chalkiness warning expected-on** |
| protein_in_solids | [22,32] | [22,32] | [22,32] | 12% protein / ~44% solids ≈ 27% |
| lactose | [0,5] | [0,5] | [0,5] | tighter — P2 demands low-lactose sourcing (WPI/MPC) |
| lactose_sandiness_risk | [0,8] | [0,8] | [0,8] | tighter guard — more solids, less free water |
| fat | [3,12] | [3,12] | [3,12] | protein displaces fat |
| total_solids | [36,48] | [36,48] | [38,48] | +~7% protein solids |
| water | [52,64] | [52,64] | [52,62] | complement |
| pod / npac / ice / alcohol | inherit milk_gelato per-temperature | | | freezing structure unchanged |

If ratified, these would seed as new `status:'seeded'` rows exactly as the CONFIG 0.6.0 temperature
cells did (additive; milk_gelato @ −11 never edited; CONFIG_VERSION bump + golden re-baseline per
the `TEMPERATURE_AWARE_TARGET_BANDS_PLAN.md` §5 migration rules). **This doc does not perform that.**

### C5 — Functional roles

`protein_source` is the **hard family role** — it already exists in the canonical enum
(`src/features/formulation/ingredientRoles.ts:26`). Existing roles that also apply inside a protein
recipe: `primary_liquid` (milk/water base), `dairy_fat` / `plant_fat`, `milk_solids` (SMP/dry dairy),
`sweetener_sucrose` + `sugar_freezing_control`, `stabilizer`, `fiber_body`, `plant_liquid` (vegan
lines), `egg`, `water`, `flavor_other`.

**Role-resolution GAP found (owner decision, C9):** `resolveFunctionalRole` resolves **dairy**
protein powders to `milk_solids`, **not** `protein_source`. The dairy branch tests
`solids_percent >= 85` (which every dairy protein powder passes: WPC80 97%, MPC 85.9%, SMP 89.7%)
via a ternary that returns `'milk_solids'` in **both** arms (`ingredientRoles.ts:65`) — so the
`protein_percent >= 25 → protein_source` line below it is unreachable for dairy powders. Net effect
today:

- **Plant** proteins (rice/pea, Mapper category `protein` → engine `other`) → **`protein_source`**
  via the `protein_percent >= 30` fallback (`ingredientRoles.ts:76`). ✓
- **Egg white / whole egg** (`egg_product` → engine `other`, protein > 30) → **`protein_source`**. ✓
  (but egg is flavour-led — see W6)
- **Dairy** WPC/WPI/MPC/SMP/WMP → **`milk_solids`**, never `protein_source`. ✗

So the "hard protein role" is applied **inconsistently** across exactly the sources the family needs
most. Ratifying the family should include an owner decision on distinguishing a high-protein dairy
powder (`protein_percent ≥ ~40`) as `protein_source` vs `milk_solids`.

### C6 — Stabilizer / stabilizer-system dosage note for protein mixes

**Literature direction:** high-protein mixes bind more water (casein/MPC water-binding and viscosity
rise — Alvarez et al. 2005), so protein *itself* supplies some of the water-control and body that a
stabilizer would; several practitioner sources argue high-protein formulas can carry **less** added
stabilizer.

**But it is NOT provable in a way the engine can consume, so we do not adjust dose:**

- The engine has **no stabilizer-activity metric or band** — `detectViolations` covers only
  pod/npac/ice/water/solids/fat/protein/lactose/sandiness/alcohol, and no stabilizer appears in the
  solver `SELECTION_RULES` (documented verbatim in `src/features/formulation/stabilizerDosage.ts`).
  Moving the stabilizer dose produces **no engine-verified gradient**.
- The approved dosage window is **identity-locked** (Mapper `recommended_dosage_percent_min/max`,
  e.g. tara gum `PI-ING-000492` 0.2–1% of total mix) with **no protein-interaction term** and no
  category fallback.
- No cited study gives a **validated protein→stabilizer dose-reduction formula** for gelato.

**Recommendation:** keep the identity-locked Mapper window unchanged for protein mixes; do **not**
auto-reduce stabilizer for protein. If the owner wants a protein-aware dose, that is a new
calibration input (a stabilizer-activity target), explicitly **owner decision O5 (C9)** — stated
here as unresolved rather than invented.

### C7 — QP-seed architecture C applies UNCHANGED (linearity verified)

The correction solver seeds each single-lever exact-gram solution from a **linear-fractional ratio
model** and then verifies by re-running the full `calculateRecipe`. From `src/engine/corrections/
solver.ts`, every metric is expressed as `(N + n·m)/(D + d·m) = t`, solved for added grams `m`
(`solveAddition`, line 251):

- a band is a **constant** interval `[min,max]` in the metric — **independent of grams**;
- the metric value is a **ratio of two quantities that are each linear (affine, zero-intercept) in
  the ingredient grams**, because `component_g = grams × percent/100` and `total_batch_g = Σ grams`
  (`src/engine/composition.ts:58,51`). A ratio of two gram-linear sums is **linear-fractional** in
  the decision variables.

The protein-family metrics are **already** written in exactly this form in the live solver:

| Metric | N (numerator) | D (denominator) | Class | solver.ts |
|---|---|---|---|---|
| aerating_protein | protein_g | total batch B | linear-fractional | line 218 |
| protein_in_solids | protein_g | solids_g | linear-fractional | lines 224–234 |
| lactose | lactose_g | total batch B | linear-fractional | line 220 |
| lactose_sandiness_risk | lactose_g | water_g | linear-fractional | lines 236–247 |

These are the **same structural class** as `pod`, `fat`, `water`, `total_solids`, `npac` — all
linear-fractional-in-grams. **Adding a protein family changes only the band constants (data), never
the model form.** Therefore QP-seed architecture C is confirmed to apply to the protein metrics
**unchanged**; the bands are linear (constant) and the protein metrics are linear-fractional, as
required.

### C8 — Acceptance fixtures

Numbers below are back-of-envelope from the real Mapper compositions (per ~1000 g mix, ~4% dairy
base protein), to show the fixtures are physically sensible; exact grams come from the engine.

1. **P1 default hit (low-lactose whey).** Build ~8 g/100 g protein using the **low-lactose** whey
   `PI-ING-000264` (protein 80%, lactose 3.3%): ~+40 g protein ⇒ ~50 g whey adds only ~1.7 g
   lactose. Expect at −12: `aerating_protein ≈ 8 ∈ [7,9]` ✓; `protein_in_solids ≈ 20 ∈ [16,24]` ✓;
   `npac ∈ [42,50]` (inherited); `lactose_sandiness_risk` low, ≤ 9 ✓. **PASS.**
2. **Sources-not-interchangeable, same target via WPC80.** Same +40 g protein via `PI-ING-000295`
   (lactose 15%) adds ~7.5 g lactose ⇒ `lactose_sandiness_risk ≈ 8` — **borderline** at the band
   top. Demonstrates the guard discriminates whey grades even at identical protein.
3. **WPI-excess chalkiness warning.** Pushing to the P2 tier (`aerating_protein > 10`) fires warning
   **W1** (chalky/bitter, Moss 2023) — an **evidence-based label, not an engine score**; expected-on
   at P2 and surfaced as sensory disclosure. (A real WPI row must be added first — Gap 1.)
4. **High-SMP sandiness guard fires.** Reaching +4% protein via SMP `PI-ING-000270` (protein 35.7%,
   lactose 51%) needs ~112 g SMP ⇒ ~57 g added lactose. `lactose_sandiness_risk = lactose_g/water_g
   ×100 ≈ 16 ≫ 9` ⇒ the **existing** engine indicator classifies **risky** (`statuses.ts`), and
   Tharp & Young's <7% total-lactose rule is breached. **Guard fires today, no new code.**
5. **Role check.** Rice/pea/egg-white resolve to `protein_source`; **WPC/MPC/SMP resolve to
   `milk_solids`** (the C5 gap) — a fixture that pins current behaviour and the owner decision.

### C9 — Unavoidable owner decisions

- **O1 — Ratify targets & bands.** Approve (or revise) the P1/P2 targets (C1) and the
  protein-family × −11/−12/−13 bands (C4). Nothing seeds until ratified; seeding then follows the
  additive CONFIG-bump + golden-re-baseline path (`TEMPERATURE_AWARE_TARGET_BANDS_PLAN.md`).
- **O2 — Fill source gaps.** Decide whether to add verified **WPI**, **micellar casein/caseinate**,
  and (if wanted) **soy** rows to the Mapper — the family's cleanest levers are currently missing
  (Gaps 1–3).
- **O3 — `aerating_protein` semantics.** Decide whether the engine should consume the Mapper's
  curated `aerating_protein_percent` (distinguishing whey/casein/plant aeration from egg/blend
  non-aeration) instead of total protein %. Today the column is dropped (Gap 5); this is an
  **engine change** (out of scope here) requiring owner approval.
- **O4 — Role resolution for dairy protein powders.** Decide whether high-protein dairy powders
  should resolve to `protein_source` rather than `milk_solids` (the ternary-collapse gap, C5).
- **O5 — Stabilizer dose in protein mixes.** Confirm "no auto-adjust" (C6), or commission a
  stabilizer-activity calibration if a protein-aware dose is wanted. Not invented here.
- **O6 — "lactose-free" data anomaly.** Rule on `PI-ING-000285/000283` (labelled lactose-free,
  data shows 41–52% lactose) before they can be trusted by the sandiness guard (Gap 4).
- **O7 — EU claim thresholds.** Decide whether P1/P2 carry "source of protein" / "high protein"
  label claims; the engine computes protein_g & kcal/100 g but has **no claim gate** — claims are a
  legal/label decision.

---

## Sources

Peer-reviewed / textbook:
- Goff, H.D. & Hartel, R.W. (2013). *Ice Cream* (7th ed.). Springer.
- Tharp, B.W. & Young, L.S. (2013). *Tharp & Young on Ice Cream*. DEStech.
- Milk Proteins in Ice Cream — book chapter, [Springer / Advanced Dairy Chemistry (2016)](https://link.springer.com/chapter/10.1007/978-1-4939-2800-2_13).
- Alvarez, V.B. et al. (2005). Physical Properties of Ice Cream Containing Milk Protein Concentrates. *Journal of Dairy Science* 88. [link](https://www.sciencedirect.com/science/article/pii/S0022030205727521).
- Moss, R. et al. (2023). Evaluation of the sensory properties of thickened and protein-enhanced ice cream (CATA/TCATA). *Journal of Texture Studies* 54. [link](https://onlinelibrary.wiley.com/doi/full/10.1111/jtxs.12756).
- VanWees, S.R. et al. (2026). Microstructural and Physical Properties of High-Protein, High-Overrun Frozen Desserts. *Journal of Food Science*. [link](https://ift.onlinelibrary.wiley.com/doi/10.1111/1750-3841.70944).
- Physicochemical property characterization … plant-based ice cream with soy, pea, and milk proteins (2024). *Journal of Dairy Science*. [link](https://www.journalofdairyscience.org/article/S0022-0302(24)01081-6/fulltext).
- Hasan et al. (2024). Influence of Brown Rice, Pea, and Soy Proteins … Dairy-Free Frozen Dessert. *Food Science & Nutrition* 12. [link](https://onlinelibrary.wiley.com/doi/full/10.1002/fsn3.4494).
- Effect of Protein Concentrates and Isolates on the Rheological, Structural, Thermal and Sensory Properties of Ice Cream (2023). *Current Research in Nutrition and Food Science* 11(1). [link](http://www.foodandnutritionjournal.org/volume11number1/effect-of-protein-concentrates-and-isolates-on-the-rheological-structural-thermal-and-sensory-properties-of-ice-cream/).
- Quality attributes of high protein ice cream prepared by incorporation of whey protein isolate (2021). *Applied Food Research*. [link](https://www.sciencedirect.com/science/article/pii/S2772502221000299).
- The Use of High-Protein Preparations in Ice Cream Production (2025). *Foods* 14(3):345. [link](https://www.mdpi.com/2304-8158/14/3/345).
- Heat-stable whey protein isolate made using isoelectric precipitation and clarification (2024). *Journal of Dairy Science*. [link](https://www.sciencedirect.com/science/article/pii/S0022030224008221).
- Influence of calcium-binding salts on heat stability … whey protein isolate dispersions. [link](https://www.sciencedirect.com/science/article/abs/pii/S0958694618302747).

Regulatory / practitioner (clearly non-peer-reviewed):
- Regulation (EC) No 1924/2006 on nutrition and health claims, Annex (protein claims). [EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32006R1924).
- Protein in Ice Cream — [icecreamscience.com](https://www.icecreamscience.com/blog/protein-in-ice-cream).
- Best Protein Ice Cream Brands Ranked (2026) — commercial benchmark orientation. [link](https://www.highproteinsnackspro.com/blog/best-protein-ice-cream-brands-ranked).

Engine/Mapper evidence (this repo / staging, read-only): `src/engine/config/targets.ts`,
`.../version.ts`, `src/engine/calculateRecipe.ts`, `src/engine/composition.ts`,
`src/engine/statuses.ts`, `src/engine/corrections/solver.ts`, `src/engine/cost.ts`,
`src/features/formulation/ingredientRoles.ts`, `.../stabilizerDosage.ts`,
`src/data/ingredients/categoryMapping.ts`; staging `mapper_basement` (tunabqqrwabacxjcxxkz).

---

_Status: **PROTEIN SCIENCE — COMPLETE** (proposal only; all bands/targets labelled
PROPOSED-FOR-OWNER-RATIFICATION; engine untouched)._
