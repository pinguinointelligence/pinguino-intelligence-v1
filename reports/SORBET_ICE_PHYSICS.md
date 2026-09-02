# Sorbet ice physics — local scientific audit

Date: 2026-08-21

Scientific branch: `codex/sorbet-ice-physics`

Safety base: `703d992be482d2534707f6787370f021258f1068`

Runtime integration status: **composition-sensitive candidate integrated on this branch; staging pending**

## Executive decision

The evidence is sufficient to resolve the denominator ambiguity, but not to ship a
trustworthy composition-sensitive Sorbet solver for arbitrary sucrose/glucose/fructose
mixtures.

- The scientifically supported meaning of an ice percentage in the inspected phase-
  diagram and DSC sources is **ice mass / total system mass**.
- The existing comment in `src/engine/iceFraction.ts` says “share of frozen water”, but
  the implementation does not compute water at all. That wording is not supported by
  the code or historical Sorbet records.
- The historical Sorbet values and bands are numerically plausible only as total-mix
  ice percentages. For example, S01's 57.43% of mix would equal 79.60% of its documented
  72.15% water; those are not the same metric.
- The existing runtime Sorbet value is a linear NPAC lookup against **milk-gelato**
  anchors. It is not a Sorbet thermodynamic result.
- A literature-backed non-ideal binary model is reproducible for water+sucrose and
  water+glucose. The source publishes no fructose coefficient and no multi-solute
  extension. Extrapolating those coefficients into arbitrary mixtures would invent
  authority.

This interim decision is superseded by the finalization in §14: the subsequently
recovered UASLP primary thesis contains the exact composition regressions that the
initial audit could not access. The original audit is retained below as a provenance
record rather than silently rewritten.

## 1. Current source-of-truth matrix

| Stage                  | Current source                                                                                | Current meaning/evidence                                            | Authority finding                                                              |
| ---------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Ingredient composition | `src/engine/composition.ts`                                                                   | Sums actual water and typed sucrose/glucose/dextrose/fructose grams | Suitable input seam; current demo dextrose is 92% dry and 8% water             |
| POD                    | `src/engine/pod.ts`                                                                           | Formulation sweetness metric                                        | Separate from ice thermodynamics                                               |
| PAC / NPAC             | `src/engine/pac.ts`                                                                           | PAC formulation factors; NPAC is normalized per water mass          | Useful formulation heuristic, not an equilibrium ice solver                    |
| Ice anchors            | `src/engine/config/iceAnchors.ts`                                                             | Three milk and three protein rows; no Sorbet row                    | Missing Sorbet authority                                                       |
| Ice estimate           | `src/engine/iceFraction.ts`                                                                   | Linear `(category,temp,NPAC)` interpolation/extrapolation           | Does not receive water or sugar composition; cannot mean measured frozen water |
| Category fallback      | `src/engine/iceFraction.ts`                                                                   | Missing category silently uses `milk_gelato`                        | Root cause of the false Sorbet authority                                       |
| Hard bands             | `src/engine/config/targets.ts`                                                                | Sorbet −11: 51–59; −12: 51–59; −13: 50–58                           | Unit not documented at introduction; values are consistent with total-mix ice  |
| Historic fixtures      | `src/spine/temperatureRegulator.ts` and `docs/pinguino-spine/Temperature_Regulator_SORBET.md` | S01/S02/S03 store `iceFraction` 57.43/55.95/54.28                   | No equation, denominator, source, or reproducible composition provenance       |
| Profile gate           | `src/engine/statuses.ts`                                                                      | Naked `ice_fraction` is compared directly with the hard band        | Inherits upstream ambiguity                                                    |
| Score                  | `src/engine/scoring.ts`                                                                       | Consumes classified indicator status                                | No independent ice math                                                        |
| Monitor                | PI monitor mapping/presentation files                                                         | Displays the engine metric/status                                   | No independent ice authority                                                   |
| Production             | Engine/readiness projection                                                                   | Consumes current engine/readiness evidence                          | Must not receive the research baseline as READY truth                          |

Data path today:

```text
ingredient composition -> water + sugar grams
                       -> POD/PAC/NPAC
NPAC + category + temperature -> milk/protein anchor lookup
                               -> naked ice_fraction_percent
                               -> hard profile gate -> Score/Monitor/Production
```

The water and typed-sugar values exist, but the ice function never receives them.

## 2. Git/history evidence

- Commit `50281bb` introduced S01/S02/S03 and the locked values. The fixture text says
  only “Ice fraction”; it contains no formula or denominator.
- Commit `70fcbd7` copied the bands into `TARGET_BANDS` as `ice_fraction`.
- Current `git blame` for the Sorbet target rows points to `70fcbd7`.
- `src/engine/iceFraction.ts` documents the milk fallback and calls it
  “CALIBRATION-PENDING”.

No historical commit inspected establishes frozen-water or freezable-water authority.

## 3. Denominator audit

The inspected primary paper by Pongsawatmanit and Miyawaki explicitly defines `xi` as
“the ice fraction in total system” in Eq. 8. Its worked phase-diagram example also
subtracts remaining liquid water from the unit mass of the original solution, yielding
ice mass per unit original system.

The 2025 frozen-dessert paper determines ice from DSC enthalpy and its Eq. 7 normalizes
by `m_water + m_solute`, again total sample mass.

The lemon Sorbet source uses the freeze-concentration mass balance
`x_ice = 1 - w0/w_eq(T)`, also a total-initial-system mass fraction.

### Numeric check against the historic fixtures

| Fixture | Documented water | Documented old ice | If ice is % of mix: frozen fraction of documented water |
| ------- | ---------------: | -----------------: | ------------------------------------------------------: |
| S01     |           72.15% |             57.43% |                                                  79.60% |
| S02     |           70.71% |             55.95% |                                                  79.13% |
| S03     |           69.18% |             54.28% |                                                  78.46% |

Conclusion: a denominator mismatch existed between the `iceFraction.ts` prose and the
most plausible meaning of the historic values. The numeric bands themselves are not
proven incompatible with total-mix ice and were therefore not changed.

## 4. Equations and coefficient provenance

### Model 0 — ideal colligative baseline (implemented for research only)

Pongsawatmanit & Miyawaki (1993), Eq. 1:

```text
ln(Xw) = -(DeltaHf/R) * (1/T - 1/Tf)
```

where `Xw` is water mole fraction, `T` and `Tf` are kelvin, `R=8.314 J mol-1 K-1`,
and the paper specifies `DeltaHf=6003 J mol-1` near the freezing point. The harness
uses molar masses 18.01528 g/mol water, 342.2965 g/mol sucrose and 180.156 g/mol for
glucose/dextrose/fructose. These standard molar masses convert actual dry component
mass to moles; they are not commercial PAC factors.

Molar-mass provenance: NIST Chemistry WebBook SRD 69 entries for
[water](https://webbook.nist.gov/cgi/cbook.cgi?ID=C7732185) (18.0153 rounded),
[sucrose](https://webbook.nist.gov/cgi/cbook.cgi?ID=C57501) (342.2965),
[D-glucose](https://webbook.nist.gov/cgi/cbook.cgi?ID=C50997) (180.1559) and
[fructose](https://webbook.nist.gov/cgi/cbook.cgi?ID=C57487) (180.1559). The code's
180.156 is the six-significant-figure rounding; 18.01528 retains the conventional
higher-precision water value. These values are exact input-property conversions, not
fitted parameters and have no calibration residual.

At a target temperature the harness bisects remaining liquid water until the serum
water activity equals ice equilibrium. It keeps the following outputs separate:

```text
iceMassFractionOfMix = ice mass / initial total mixture mass
frozenFractionOfInitialWater = ice mass / initial water mass
```

`freezableWater` and `boundWater` stay `null`; no coefficient was invented.

### Model 1 — published non-ideal binary phase diagram

Pongsawatmanit & Miyawaki (1993), Eqs. 2, 3 and 5:

```text
aw = gamma_w * Xw
ln(gamma_w) = -(alpha'/T) * (1-Xw)^2
```

Published fitted `alpha'` values:

| Solute   | alpha' | Unit | Source range                                           | Status                   |
| -------- | -----: | ---- | ------------------------------------------------------ | ------------------------ |
| glucose  |    836 | K    | binary phase diagram, approx. 0–70% w/w and 0 to −30°C | implemented, binary only |
| sucrose  |   1800 | K    | binary phase diagram, approx. 0–70% w/w and 0 to −20°C | implemented, binary only |
| fructose |      — | —    | not published in this source                           | fail-closed              |

The values were fitted by the paper to its phase diagrams; they were not digitized or
refit here. The harness refuses mixtures under this model.

### Pham/Schwartzberg empirical equation — audited, not selected

Pongsawatmanit & Miyawaki (1993), Eq. 8:

```text
xi = (xw - xb) * (1 - Tf/T)
```

The paper defines `xi` as ice fraction in the total system, `xw` as water content,
`xb` as bound-water content and uses Celsius for `T` and initial freezing point `Tf`.
It fits `xb` and `Tf` to each DSC material. The repository has no justified `xb` for
arbitrary Sorbet or Inulin grades, so the equation cannot become runtime authority.

### Lemon Sorbet DSC curve — validation oracle only

Arellano Salazar (2012), Fig. 3.1, source-restricted to −13..0°C:

```text
w_eq(T) = -0.137*T - 0.0202*T^2 - 0.00167*T^3 - 0.0000529*T^4
x_ice(T) = 1 - 0.252/w_eq(T)
```

`w_eq` and initial `w0=0.252` are mass fractions. The polynomial was published as an
empirical fit (`R2=0.997`) to this one lemon Sorbet DSC curve. The coefficients are
directly transcribed, not re-fitted/digitized. They are not transferable mixture
coefficients.

## 5. Scientific sources inspected

1. R. Pongsawatmanit, O. Miyawaki, _Measurement of Temperature-dependent Ice
   Fraction in Frozen Foods_, BBB 57(10), 1650–1654 (1993),
   DOI [10.1271/bbb.57.1650](https://doi.org/10.1271/bbb.57.1650). Primary paper,
   complete five-page scan inspected. Binary glucose/sucrose phase diagrams, water
   activity model, DSC comparison, explicit total-system denominator.
2. R. Ablett, M. J. Izzard, P. J. Lillford, _Differential scanning calorimetric
   study of frozen sucrose and glycerol solutions_, Faraday Trans. 88, 789–794
   (1992), DOI [10.1039/FT9928800789](https://doi.org/10.1039/FT9928800789).
   Supports strong non-ideality/freeze concentration; sucrose maximum freeze
   concentration around 81.2% and Tg' around −40°C. No arbitrary mixture rule.
3. H. Wang et al., _Functionality of sugars and sugar replacers in model frozen
   dessert systems_, Current Research in Food Science 11, 101128 (2025),
   DOI [10.1016/j.crfs.2025.101128](https://doi.org/10.1016/j.crfs.2025.101128).
   Open PDF and equations/tables inspected. Hydration numbers vary with temperature
   and concentration; systems are single-solute and omit fructose and mixtures.
4. M. A. Ruiz-Cabrera et al., _State diagrams for mixtures of low molecular weight
   carbohydrates_, J. Food Eng. 171, 185–193 (2016),
   DOI [10.1016/j.jfoodeng.2015.10.038](https://doi.org/10.1016/j.jfoodeng.2015.10.038).
   Sixteen pure/binary/ternary fructose-glucose-sucrose systems and Chen fits are
   reported. The accessible primary record confirms mixture dependence and R2>0.94,
   but the full parameter/data tables required for a faithful arbitrary-ratio solver
   were not available. No values were guessed.
5. M. P. Arellano Salazar, _Experimental characterization and modelling of
   multiphase systems during the freezing process at the pilot scale: application
   to sorbet manufacturing in scraped surface heat exchangers_ (2012),
   [HAL pastel-01059043](https://pastel.hal.science/pastel-01059043). Primary thesis
   composition and DSC equilibrium polynomial inspected through the deposited record.

MyGelato/SmartGelato was treated only as owner-collected black-box holdout data. No
formula, PAC factor, NPAC factor or coefficient was copied or fitted to it.

## 6. Candidate comparison

### Freezing-point reproduction on the six published binary points

These points are **calibration reproduction**, not independent holdout, because the
paper fitted `alpha'` to the same phase diagrams.

| System (% w/w) | Published phase T (°C) | Ideal T (°C) | Ideal abs. error | Published-binary T (°C) | Abs. error |
| -------------- | ---------------------: | -----------: | ---------------: | ----------------------: | ---------: |
| glucose 29.3   |                   −4.7 |       −4.133 |            0.567 |                  −4.626 |      0.074 |
| glucose 38.3   |                   −7.4 |       −6.084 |            1.316 |                  −7.141 |      0.259 |
| glucose 50.1   |                  −12.2 |       −9.541 |            2.659 |                 −12.082 |      0.118 |
| sucrose 31.3   |                   −2.7 |       −2.427 |            0.273 |                  −2.797 |      0.097 |
| sucrose 42.7   |                   −4.6 |       −3.918 |            0.682 |                  −4.874 |      0.274 |
| sucrose 52.1   |                   −7.8 |       −5.634 |            2.166 |                  −7.589 |      0.211 |

| Model            | MAE (°C) | RMSE (°C) | Maximum error (°C) |
| ---------------- | -------: | --------: | -----------------: |
| ideal baseline   |    1.277 |     1.547 |              2.659 |
| published binary |    0.172 |     0.190 |              0.274 |

The ideal model degrades materially as serum concentration increases and is rejected
for runtime use.

### Owner-supplied 1000 g pure/binary/ternary holdout at −12°C

The table below reports the research ideal baseline only. The last column is the raw
external MyGelato UI number whose denominator is unknown. It was not used for fitting.

| Nominal 250 g sugar system | Ideal ice % mix | Ideal frozen initial water % | Raw external ice UI % | Non-ideal authority                                                                       |
| -------------------------- | --------------: | ---------------------------: | --------------------: | ----------------------------------------------------------------------------------------- |
| sucrose                    |           64.31 |                        86.32 |                 60.23 | published binary available: 58.78% mix                                                    |
| dextrose                   |           55.14 |                        74.02 |                 60.65 | glucose binary proxy exists only if canonical dry molecular form is confirmed: 49.45% mix |
| fructose                   |           55.14 |                        74.02 |                 58.70 | unavailable                                                                               |
| sucrose/dextrose 125/125   |           59.73 |                        80.17 |                 60.49 | unavailable                                                                               |
| sucrose/fructose 125/125   |           59.73 |                        80.17 |                 59.55 | unavailable                                                                               |
| dextrose/fructose 125/125  |           55.14 |                        74.02 |                 59.68 | unavailable                                                                               |
| ternary 84/83/83           |           58.22 |                        78.15 |                 59.92 | unavailable                                                                               |

The external values cannot resolve the science because their denominator and ingredient
dry-matter assumptions are unknown.

## 7. Lemon Sorbet validation

Published formulation: 73.81% listed water, 14.6% sucrose, 8.0% fructose, 0.09%
dextrose, 3% lemon concentrate at 60 Brix and 0.5% stabilizer blend; reported initial
freezing point about −2.63°C.

| Temperature | Published DSC `w_eq` | Re-derived observed ice % mix |
| ----------- | -------------------: | ----------------------------: |
| −11°C       |            0.5110611 |                       50.6908 |
| −12°C       |            0.5240256 |                       51.9107 |
| −13°C       |            0.5253131 |                       52.0286 |

A simplified ideal reconstruction (`w0=0.252`, known sugars, unknown concentrate/
stabilizer solids non-colligative) predicts initial freezing at −2.14°C and 61.35,
62.59 and 63.63% mix ice at −11/−12/−13: about 10.66, 10.68 and 11.60 percentage
points above the DSC curve. Because the concentrate acids and stabilizer chemistry are
not fully specified, this is a diagnostic rejection of the ideal baseline, not a fit.

## 8. Inulin and stabilizer treatment

- Inulin remains optional under the owner formulation policy: 0 allowed; if present,
  2–8%; preferred 4%; hard max 8%.
- The current canonical product lacks the degree of polymerization/grade needed for a
  quantitative hydration or bound-water coefficient.
- The harness counts Inulin dry mass in total solids and serum mass, but assigns no
  colligative particles and reports the uncertainty.
- Stabilizer authority is separate. No equilibrium coefficient is assigned. Whole-
  gram executable dose rules in the WIP are unchanged.

## 9. S01/S02/S03 re-evaluation

The locked document values cannot be reproduced from the current canonical surrogate:
the document expects 72.15/70.71/69.18% water, whereas the current 86%-water raspberry
surrogate plus current 92%-dry dextrose, 95%-dry Inulin and 88%-dry tara yields
70.4586/69.0246/67.4796% water. This provenance mismatch is independent of ice math.

| Fixture |   T | POD / NPAC locked | Old ice | Old denominator          | Current-composition water / solids | Ideal ice % mix | Ideal frozen initial water % | Published non-ideal result | Hard-band finding                                                   |
| ------- | --: | ----------------: | ------: | ------------------------ | ---------------------------------: | --------------: | ---------------------------: | -------------------------- | ------------------------------------------------------------------- |
| S01     | −11 |     19.16 / 37.71 |   57.43 | undocumented; likely mix |                  70.4586 / 29.5414 |         58.9236 |                      83.6286 | unsupported multi-solute   | ideal value exceeds 51–59 by 0 only (inside), but non-authoritative |
| S02     | −12 |     19.97 / 44.18 |   55.95 | undocumented; likely mix |                  69.0246 / 30.9754 |         56.9017 |                      82.4369 | unsupported multi-solute   | ideal value inside 51–59, but non-authoritative                     |
| S03     | −13 |     21.21 / 52.22 |   54.28 | undocumented; likely mix |                  67.4796 / 32.5204 |         54.5595 |                      80.8533 | unsupported multi-solute   | ideal value inside 50–58, but non-authoritative                     |

The current milk fallback at the locked NPAC values would produce approximately 49.53,
50.36 and 49.72%, respectively; those are unrelated to the documented fixture values.
At the legal NPAC minima the preserved audit proves maxima of only 50.3748% at −12 and
49.8393% at −13, hence the current 100-cell authority block.

No fixture expectation was changed.

## 10. Hard-band recommendation

Do not loosen or numerically change 51–59 / 51–59 / 50–58 in this task. Evidence says:

1. the intended denominator is most plausibly total-mix ice;
2. the lemon DSC curve and ideal diagnostic values can coexist numerically with the
   bands;
3. no validated arbitrary-mixture model yet proves the exact limits or fixture centers.

Before runtime integration, the owner decision package should explicitly rename the
metric to `ice_mass_fraction_of_mix_percent` and decide whether the legacy bands remain
after validation on full mixture data. `frozen_fraction_of_initial_water` should be a
separate metric, never compared to those numbers.

## 11. Required missing evidence

One of the following is needed before a production candidate can be honest:

- the full Ruiz-Cabrera pure/binary/ternary parameter/data tables plus a published or
  independently validated interpolation rule for arbitrary sugar ratios; or
- a primary multi-solute water-activity model with interaction parameters covering
  sucrose, glucose/dextrose and fructose over approximately 50–75% freeze-concentrated
  serum and −11..−13°C; plus independent DSC holdout; or
- Gellatti-owned DSC/freezing-curve measurements across designed pure, binary, ternary,
  fruit-acid and Inulin-grade mixtures, with measured uncertainty.

Canonical dextrose molecular form/dry fraction and Inulin DP/grade also need explicit
product facts before applying a quantitative non-ideal coefficient.

## 12. Harness and validation status

`src/engine/science/sorbetIceCalibration.ts` is deterministic, React-free and not
exported from the Engine. It supports arbitrary simplified mixtures under an explicitly
non-authoritative ideal baseline, a fail-closed published binary model, mass conservation,
bounded bisection, explicit denominators, convergence diagnostics and the lemon DSC
validation oracle.

The statements below describe the original audit checkpoint. See §14–§19 for the
completed model, runtime integration and current acceptance results.

## 13. Local validation ledger

| Command                                                                                                                                               | Result                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `npm test -- src/engine/science/sorbetIceCalibration.test.ts`                                                                                         | PASS, 12/12                                                                                                   |
| `npm test -- src/features/recipe-direction/sorbetDirectionTargetMatrix.test.ts src/engine/iceFraction.test.ts src/spine/temperatureRegulator.test.ts` | PASS, 64/64; existing matrix truth remains 50 executable −11 cells and 100 authority-blocked −12/−13 cells    |
| `npm test`                                                                                                                                            | PASS, 546 files / 6831 tests; non-failing OCR stderr `failed to load ./ita.special-words` was emitted, exit 0 |
| `npm run typecheck`                                                                                                                                   | PASS                                                                                                          |
| `npm run lint`                                                                                                                                        | PASS, 0 errors; two pre-existing Fast Refresh warnings                                                        |
| `npm run build`                                                                                                                                       | PASS; existing bundle-size warning                                                                            |
| `npm run products:audit`                                                                                                                              | PASS; Mapper 2088, SHA-256 `b13f5db4affd9c3be5ccbe59b40920053197a3697a3fa1bd4a859406e8baed38`                 |
| `npm run mapper:runtime-audit`                                                                                                                        | PASS                                                                                                          |
| `npm run process:validate`                                                                                                                            | PASS, 2088 rows, zero alignment differences                                                                   |
| `npm run catalog:mapper-only:validate`                                                                                                                | PASS, no outside-Mapper catalog records                                                                       |
| `npm run production-rescue:bundle-check`                                                                                                              | PASS, bundle SHA-256 `1913daac6392069e109c6fd20d2b04d456d271cad96e8cf6a0017f5ef672d588`                       |
| `git diff --check`                                                                                                                                    | PASS                                                                                                          |

The full suite includes the existing Gelato 150-cell matrix and Protein regressions;
both passed after the research files were added. No accepted runtime behavior changed.

## 14. Final recovered composition model

The missing table/equations were recovered from the UASLP primary research thesis
underlying the Grajales-Lagunes publication route. Its design fixes citric acid and
pectin at 0.025 dry-mass fraction each and varies fructose/glucose/sucrose on a
simplex with `XF+XG+XS=0.95` (Table 6.1). Chen Eq. 7 is:

```text
Tm = Tw + (beta/lambda_w) * ln(
  (xw - B*xs) / (xw - B*xs + E*xs)
)
```

with `beta=1860 kg °C/kmol`, `lambda_w=18.01528 kg/kmol`, `xs` dry-solids mass
fraction and `xw=1-xs`. Published Scheffé regressions (Eqs. 9–10) are:

```text
E = 0.081 XF + 0.071 XG + 0.064 XS
  + 0.039 XF XG - 0.002 XF XS + 0.074 XG XS
  + 0.545 XF XG XS

B = 0.172 XF + 0.223 XG + 0.114 XS
  + 0.144 XF XG + 0.243 XF XS - 0.106 XG XS
  - 5.175 XF XG XS
```

`XF/XG/XS` are fractions of **all dry solids**, not a re-normalized sugar-only
simplex. Dextrose uses its actual dry D-glucose mass and therefore contributes to
`XG`; its declared product water remains water. This exact interpretation reproduces
the paper's modeled real-juice E/B rows for tuna, orange, mango, strawberry and
pineapple.

Main publication: Grajales-Lagunes et al., Journal of Food Engineering (2018), DOI
[10.1016/j.jfoodeng.2018.02.025](https://doi.org/10.1016/j.jfoodeng.2018.02.025).
The exact accessible equation/table source is Mendoza Cardoso, UASLP (2017),
Tables 6.1/7.1/7.2/7.6 and Eqs. 7/9/10.

## 15. Solver and validity contract

- Production code: `src/engine/sorbetFreezingPhysics.ts`.
- Chen Eq. 7 is inverted algebraically for the equilibrium `xs`; the result is
  checked against the initial composition and the physical `xw-B*xs>0` bound.
- No rounding occurs inside thermodynamics; whole grams remain a formulation-layer
  execution rule.
- Supported runtime temperature is exactly −11..−13°C.
- The model is bounded to the published combined source domain: modeled F/G/S are
  0.571..0.95 of dry solids (the five real juices through the simplex design).
- Fibre, Inulin, pectin-like/stabilizer dry matter and other non-freezing dry matter
  stay in total dry solids and total-mix mass. They receive no invented colligative
  coefficient.
- Any significant lactose, polyol, alcohol, salt or unnamed sugar returns
  `unavailable` for that recipe. Canonical trace declarations below 0.05% of
  total mix are treated as composition precision and receive no coefficient;
  at or above 0.05% the model fails closed. This produces a null ice result and
  explicit `composition_invalid` evidence rather than false readiness.

Canonical mass balance:

```text
initial total mix = initial water + total dry solids
equilibrium serum = remaining liquid water + total dry solids
ice mass = initial water - remaining liquid water
iceMassFractionOfMix = ice mass / initial total mix
frozenFractionOfInitialWater = ice mass / initial water
```

Only the first percentage enters the existing `ice_fraction_percent` hard bands.

## 16. Source validation and independent holdout

The exact E/B regressions are pinned for all seven source design shapes: three pure,
three binary and the ternary centroid. They also reproduce the modeled E/B values of
all five real juices to the source table's precision.

Residuals against the individually fitted Table 7.1 Chen parameters are reported
honestly (the composition regression is not an exact interpolation):

| Validation class          | E absolute error | B absolute error |
| ------------------------- | ---------------: | ---------------: |
| Pure fructose             |          0.00195 |          0.05150 |
| Binary maximum (FG/FS/GS) |          0.00912 |          0.08624 |
| Ternary centroid          |          0.00029 |          0.00006 |

The source itself reports weaker regression evidence for B (Table 7.2: `R²=0.599`,
adjusted `R²≈-0.0036`, overall `p=0.527`, CV `49.65%`) than E (`R²=0.840`,
adjusted `R²=0.599`, `p=0.123`, CV `9.87%`). The implementation therefore keeps a
strict composition domain and fails closed for unmodeled freeze-active solutes.

Independent lemon Sorbet holdout (not fitted):

| Metric                 | Published DSC | New model | Signed error |
| ---------------------- | ------------: | --------: | -----------: |
| Initial freezing point | about −2.63°C | −2.3316°C |    +0.2984°C |
| Ice / mix at −11°C     |      50.6908% |  55.5769% |   +4.8861 pp |
| Ice / mix at −12°C     |      51.9107% |  56.8216% |   +4.9109 pp |
| Ice / mix at −13°C     |      52.0286% |  57.8747% |   +5.8460 pp |

The new composition model is materially closer than the rejected ideal baseline and
keeps all three predictions within the existing Sorbet hard bands. The holdout error
is retained; no coefficient was fitted to lemon or MyGelato.

## 17. Runtime integration and historic fixtures

`calculateRecipe` now routes only `category='sorbet'` through the composition model.
`estimateIceFraction` explicitly returns null for unseeded Sorbet, so the old
`milk_gelato` fallback cannot become Sorbet truth. Gelato and Protein retain their
accepted anchor implementation unchanged.

Current-composition S01/S02/S03 recalculation:

| Fixture | Temperature | New ice / total mix | Existing hard band | Result |
| ------- | ----------: | ------------------: | -----------------: | ------ |
| S01     |       −11°C |            54.8958% |             51–59% | inside |
| S02     |       −12°C |            52.9930% |             51–59% | inside |
| S03     |       −13°C |            50.6712% |             50–58% | inside |

The historic locked values remain provenance records; the runtime result now follows
the actual current composition.

## 18. Direction matrix and performance

All 150 cells (3 temperatures × 2 strategies × 5 Sweetness × 5 Hardness) are
evaluated without any `authority_blocked` state:

| Temperature | LEGAL exact physical target | NEAREST_ACHIEVABLE | Total |
| ----------- | --------------------------: | -----------------: | ----: |
| −11°C       |                          38 |                 12 |    50 |
| −12°C       |                          32 |                 18 |    50 |
| −13°C       |                          24 |                 26 |    50 |
| Total       |                          94 |                 56 |   150 |

`NEAREST_ACHIEVABLE` means the exact POD/NPAC point is incompatible with an
independent hard gate (often ice fraction) or a non-negative canonical
water/sucrose/dextrose solution while Main, optional Inulin and stabilizer remain
unchanged. No hard gate is loosened.

The exact three-role feasibility evaluation takes about 25 ms for all 150 cells in
the focused test. Six real representative Preview paths (three temperatures × two
strategies) take about 4.2–5.2 seconds each on this development machine and retain
the generic hard-safety/whole-gram/constraints/Main/Apply gates.

## 19. Final branch gate (integration/deployment pending)

The scientific/runtime candidate now has composition-sensitive fructose,
glucose/dextrose, sucrose and interaction authority; explicit total-mix denominator;
−11/−12/−13 support; no milk fallback; fail-closed unsupported solutes; and a truthful
150-cell Direction classification. Full repository validation, staging integration,
deployment and served browser QA are recorded only after they actually run.

The completed local candidate passed 547 test files / 6857 tests, typecheck, lint
(zero errors; two pre-existing Fast Refresh warnings), build, products audit,
Mapper runtime audit, process validation, Mapper-only catalog validation, Production
Rescue bundle check and `git diff --check`. The generated Rescue bundle SHA-256 is
`09df43be7d5c03f9aac3759816c19f2e76b70f9f6ed1a5dc83164edc193dca44`.
