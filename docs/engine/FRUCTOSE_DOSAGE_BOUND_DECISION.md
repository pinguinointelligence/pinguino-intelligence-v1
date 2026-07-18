# Fructose dosage-bound — decision package (owner input required)

Date: 2026-07-18 · Read-only audit against **STAGING `tunabqqrwabacxjcxxkz`** `mapper_basement` (2083 rows,
verified). No engine change and no DB write. This records the ONE decision the owner must make before fructose
can enter the solver toolbox (`DEFAULT_CORRECTION_CANDIDATES`), and states plainly what is and is not derivable
from approved data.

## 1. The verified record — `PI-ING-000496 · FRUCTOSE · Sweetener · Dry`

| Field | Value | Field | Value |
|---|---|---|---|
| `ingredient_category` / `subcategory` | sweetener / fructose | `verification_status` | **Verified** (confidence 98) |
| `fructose_percent` | 99.8 | `total_sugars_percent` | 99.8 |
| `pod_value` (sweetness, sucrose=100) | **169.66** | `sweetness_factor` (POD coeff.) | **1.7** |
| `pac_value` (anti-freezing, sucrose=100) | **189.638** | `freezing_factor` (PAC coeff.) | **1.9002** |
| `approved_for_engines` | **true** | `approved_for_base` | true |
| `vegan` / dairy-free | true / yes | `cost_per_kg` | 3.5 |
| **`recommended_dosage_percent_min`** | **NULL** | **`recommended_dosage_percent_max`** | **NULL** |

Every other fructose-bearing approved row has the **same NULL dosage bounds**:
`PI-ING-000502` GLUCOSE FRUCTOSE SYRUP (fructose 33; POD 91.21 / PAC 146.4),
`PI-ING-001323` FRUTTOSIOMIX base-mix (fructose 67; POD 118.796 / PAC 137.62),
`PI-ING-001381` SUGAR CARAMEL (fructose 50), `PI-ING-001649` INTEGRA FIBRE (fructose 53) — all
`recommended_dosage_percent_min/max = NULL`.

## 2. The decision the owner must make

Fructose can be built into the toolbox from the composition profile alone (POD/PAC/NPAC derive from the coefficient
tables exactly as `inulin`/`dextrose` already do). **The only missing datum is a dosage bound, and it is not
derivable — it is an owner input.** The owner must specify:

| # | Decision | Notes / current state |
|---|---|---|
| 1 | **Minimum %** — lower bound | No approved record supplies one (`recommended_dosage_percent_min = NULL`). |
| 2 | **Maximum %** — upper bound | No approved record supplies one (`recommended_dosage_percent_max = NULL`). This is the safety-critical value: fructose's PAC ≈ 1.9× sucrose means small masses move the freezing point hard. |
| 3 | **Unit / basis** | `%` of total mix mass? of total sugars? of the sugar blend? The `recommended_dosage_percent_*` columns are `%`; the basis must be stated so the solver interprets a bound consistently. |
| 4 | **Applicable profiles** | gelato / sorbet / vegan. Data supports a broad candidate (vegan + dairy-free, so no dairy gate), but broad-vs-profile-restricted is a product decision, not a data fact. |
| 5 | **Role in the solver** | Which violation rules select it. Physically it is "dextrose-strength freezing-point depression + higher-than-sucrose sweetness", so the natural insertions mirror `dextrose`: `pod_low`, `npac_low`, `ice_fraction_high`. This changes proposal ordering/ties, not capability. |
| 6 | **Contraindications** | Owner to confirm. Candidates: hygroscopicity / stickiness and accelerated browning at high load; perceived-sweetness ceiling (POD 1.7 makes it easy to over-sweeten); interaction with other high-PAC sugars (dextrose/invert) risking a too-soft set. None of these are encoded as data; they inform the max %. |

## 3. Interaction the bound must respect (physics, from the verified record)

- **Sweetness (POD).** `pod_value = 169.66`, coefficient `sweetness_factor = 1.7` — fructose is ~1.7× as sweet as
  sucrose (industry commonly quotes ~1.73). A dosage max must keep total POD inside the recipe's sweetness target;
  because it is sweeter per gram, the useful window is narrower than for sucrose.
- **Freezing (PAC).** `pac_value = 189.638`, coefficient `freezing_factor = 1.9002` — ~1.9× sucrose's
  anti-freezing power, i.e. dextrose-class softening. This is why the **maximum** is the load-bearing bound: a few
  extra grams can push the mix below the target serving hardness / over the ice-fraction limit.
- **Solver limits today.** `CorrectionCandidate` has **no per-candidate dosage field**; the only limits are global
  (`MIN_ACTION_GRAMS = 0.05`, `MAX_ADDITION_FACTOR = 2× batch`). So enforcing a fructose max needs BOTH (a) the
  owner's numeric bound AND (b) a schema addition (`dosage_min/max` on `CorrectionCandidate`) — see the Starter
  Pack toolbox policy (`docs/engine/STARTER_PACK_TOOLBOX_POLICY_2026-07-18.md`).

## 4. Source of any proposed bound — explicit statement

**No numeric dosage bound is proposed in this document, because none exists in any approved PINGÜINO record.**
`recommended_dosage_percent_min/max` is NULL on `PI-ING-000496` and on every fructose-bearing row above; the
coefficient tables yield POD/PAC/NPAC but say nothing about a safe dose window. Any minimum/maximum entered into
the engine is therefore an **OWNER INPUT** (or must first be added to an approved `mapper_basement` record with a
cited source), not a value derivable from the data. Until the owner supplies decisions #1–#6, fructose should
remain out of `DEFAULT_CORRECTION_CANDIDATES` (its current state — present only as a composition % elsewhere).
