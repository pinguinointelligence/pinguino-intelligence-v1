# PROTEIN SCIENCE & AUTHORITY AUDIT — v2

**Date:** 2026-08-22 (Phase A) / 2026-08-23 (closeout)
**Worktree:** `claude/protein-science-engine-v2` (fresh, from `origin/staging`)
**Starting staging SHA:** `8c5514307ffd8b84f26e94af68e1f0c4c2de3e46`
**Mapper base:** 2088 rows, SHA-256 `b13f5db4affd9c3be5ccbe59b40920053197a3697a3fa1bd4a859406e8baed38` — **unchanged**

**PHASE A VERDICT: C — PROTEIN V2 MUST REMAIN ADDITIVE ONLY.**
Implementation is scientifically defensible and needs no unresolved owner decision, but the
enhanced source/structure layer must stay advisory-and-ranking, because the catalog cannot
currently supply the ingredients the source science is built on (§13).

---

## 1. Current Protein architecture (as audited in code, not from notes)

| Concern | Where it lives (staging `8c55143`) |
|---|---|
| Profile registry | `src/spine/productProfiles.ts::proteinGelatoProfile` |
| Temperature bands | `src/spine/temperatureRegulator.ts` (`proteinGelatoMinus11/12/13`) |
| Target authority | `src/features/protein-gelato/proteinTarget.ts` |
| Ice / freezing | `src/engine/config/iceAnchors.ts` (`category: 'protein_gelato'` rows) |
| Optimizer integration | `src/features/constraint-studio/applyPipeline.ts` (18 call sites) |
| Linear pre-filter | `src/features/constraint-studio/mainTechnicalLinearBound.ts` |
| Hard constraint | `src/features/recipe-constraints/recipeConstraintAuthority.ts` |
| Rescue guard | `src/features/constraint-studio/rescueIngredientAdvisor.ts` |
| UI | `ProteinTargetControl.tsx`, `GoalSetup.tsx`, `WorkbenchSettingsLine.tsx`, `ConstraintPreviewCard.tsx` |
| Store | `src/stores/recipeStore.ts` (`target_protein_percent`, `setTargetProteinPercent`) |

Protein reuses the **Standard Gelato physical envelope by owner decision** and disables the four
dairy gates `lactose`, `lactose_sanding`, `aerating_protein`, `protein_share_in_solids`.

## 2. Current Protein hard bands (exact, transcribed)

| Metric | −11 °C | −12 °C | −13 °C |
|---|---|---|---|
| POD | 12–17 | 12–17 (ref 15.57) | 12–17 (ref 16.37) |
| NPAC | 33–42 | 42–50 (ref 46.18) | 48–55 (ref 53.15) |
| Ice fraction | 45–54.5 | 46–54 (ref 50.34) | 46–52 (ref 49.69) |
| Fat | 5–12 | 5–12 (ref 6.19) | 5–12 (ref 5.89) |
| Solids | 31–45 | 31–44 (ref 36.82) | 35–45 (ref 37.22) |
| Water | 57–70 | 56–70 (ref 63.18) | 55–65 (ref 62.78) |
| Stabilizer | required | required | required |
| **Protein target** | **20 % by mass, ±0.1 pp, HARD** | same | same |

## 3. Current user protein-target behaviour — and why it is wrong

`PROTEIN_GELATO_TARGET = { defaultPercent: 20, controlStepPercent: 1, inputStepPercent: 0.1,
tolerancePercent: 0.1 }`.

Audited facts:

1. **No UI control ever set it.** `setTargetProteinPercent` is called from **tests only**. In
   production the target was a fixed, invisible 20 % that the user could not see the origin of —
   `ProteinTargetControl` displayed it as "cel PI 20,0 %".
2. **It was a HARD gate.** `protein_target: 'hard'` in the profile; `protein_target_unmet` blocked
   Apply; `proteinTargetPercentBand` pre-filtered candidate vectors; the Apply door refused any
   candidate not within ±0.1 pp.
3. **It made the score monotone in protein.** `assessProteinTarget` returned 10 only on the target,
   then `9 − floor(residual/0.5)`. More protein was literally a better score.
4. **20 % protein BY MASS has no provenance.** It appears in no locked doc, no reference fixture and
   no study. The highest protein level in any controlled frozen-dessert dataset is **10 %**.
5. **It is almost certainly a unit confusion.** EU Regulation (EC) No 1924/2006 sets `HIGH PROTEIN`
   at **20 % of the ENERGY value**, not 20 % of mass. The two differ by roughly a factor of 2.4 in a
   gelato.

**What it actually produced.** The v1 engine's own calibration fixture at −11 °C, scored **10/10**:

```
Cream 30 % 110 g · WPC gel 247 g · Water 505 g · Sucrose 80 g · Dextrose 56 g · Tara gum 2 g
protein 20.0 %   fat 5.0 %   lactose 1.2 %   → 24.7 % protein powder in half a litre of water
```

That is not a gelato. It is the direct, mechanical consequence of a 20 %-by-mass hard target.

## 4. Recommendation on target removal

**Remove it — confirmed by science, not only by owner preference.** The owner's decision (§0) and
the evidence agree: there is no controlled dataset in which more protein improved a frozen dessert,
so a user-selected protein number can only ever damage the product. Protein % becomes an OUTPUT.

## 5. Hard vs preferred vs quality vs legacy classification

| Current rule | Class | v2 disposition |
|---|---|---|
| POD / NPAC / ice / water / solids / fat / stabilizer / alcohol bands | HARD | **unchanged** |
| `protein_target` 20 % ±0.1 by mass | **LEGACY HEURISTIC** (no provenance) | **removed** |
| Protein-product qualification | HARD (needed, was mis-specified) | **EU 1924/2006 HIGH PROTEIN, ≥20 % of energy** |
| Protein concentration effects (overrun, hardness, melting, sensory) | QUALITY | scored, never gating |
| Protein source functionality | QUALITY | ranking + warnings |
| Whey:casein ratio | QUALITY (contested) | tie-break + advisory only |
| Lactose load | QUALITY (reuses approved band) | scored, never gating |
| Protein:fat | ADVISORY | warning only, never scored |
| Emulsifier interaction | ADVISORY | documented, never scored |
| `lactose` / `lactose_sanding` / `aerating_protein` / `protein_share_in_solids` disabled | owner decision | **still disabled as HARD gates** |

## 6. Protein concentration evidence

**Roy, Abdul Hussain, Prasad & Khetra (2022), *Applied Food Research* 2(1) 100029,
DOI 10.1016/j.afres.2021.100029.** Buffalo-milk ice cream, constant 10 % fat / 15 % sugar / 0.15 %
stabiliser-emulsifier. Control took protein from SMP; 6/8/10 % samples replaced the SMP entirely
with WPI (87 % protein, 0.8 % fat, 2.0 % ash). Pasteurised 80 °C/1 min, homogenised 140 kg/cm²,
aged overnight, batch-frozen to −5 °C, hardened −20 °C, constant dasher speed.

| Protein % | Flow index n | Consistency k (Pa·sⁿ) | Overrun % | Melting rate g/min |
|---|---|---|---|---|
| 4 (control, SMP) | 0.86 | 0.18 | **94.9** | 0.26 |
| 6 (WPI) | 0.752 | 0.37 | **60.5** | 0.24 |
| 8 (WPI) | 0.68 | 1.61 | **44.3** | 0.54 |
| 10 (WPI) | 0.57 | 4.22 | **33.9** | 0.74 |

Hardness 13.60 → 47.66 N. G″(100 Hz) 10.9 → 34.3 Pa; G′ 7.25 → 32.7 Pa.

**The decisive statistic (the authors' own, p < 0.05):** 6 % protein was **not significantly
different** from the 4 % control for hardness, body-and-texture or meltdown. **8 % and 10 % were
significantly worse on all of them**, and 8/10 % additionally lost flavour score to the whey note.

Two further findings recorded verbatim because they matter to Gellatti:

- The authors report that reaching 8 % protein with **SMP instead of WPI** gave "an unacceptable
  product with very low overrun and too hard body". **Source, not the protein number, decides
  whether a protein level is reachable at all.**
- "Generally, ice cream contains about 4 % protein and this level is optimum as far as the sensory
  quality of the product is concerned."

**Correction to a common secondary summary:** several indexes paraphrase this paper as showing
"slower melting rates". The paper's own Table/Fig. 3 shows melting rate **increasing** 0.26 → 0.74
g/min. v2 uses the paper, not the paraphrase, and does not score melting either way.

**PROTEIN EFFECT IS NON-LINEAR AND MONOTONE ADVERSE. More protein is never free.**

## 7. Protein source functionality evidence

**VanWees, Rankin & Hartel (2026), *Journal of Food Science*, DOI 10.1111/1750-3841.70944.**
Identical formulation for all three treatments — 6 % protein, 12 % fat, 6.3 % lactose, 14.51 %
sucrose, 0.2 % stabiliser — protein supplied by MPC (7.32 % powder), sodium caseinate (6.54 %) or
WPI (6.48 %), with 0 or 0.15 % mono-/diglycerides, at 100 % and 150 % overrun.

| Measure (0 % MDG, 100 % overrun) | MPC | NaCN | WPI |
|---|---|---|---|
| Apparent viscosity (mPa·s) | 299 | **466** | **123** |
| Mean ice crystal (µm) | 35.7 | **41.9** | **32.5** |
| Mean air cell (µm) | 35.0 | 35.4 | 34.0 |
| Fat destabilization (%) | 4.73 | 3.53 | 7.22 |
| Fat destabilization @0.15 % MDG (%) | 19.4 | **3.87** | **34.8** |
| Drip-through (%·min⁻¹) | 1.39 | 1.61 | 0.769 |
| Melting induction (min) | 27.9 | 22.9 | 24.6 |

**At identical total protein, mix viscosity spans 3.8× and mean ice-crystal size spans 29 % purely
from the protein source.** Sodium caseinate is essentially inert to added emulsifier (3.53 → 3.87 %)
while WPI is transformed by it (7.22 → 34.8 %).

Note also that the three treatments needed **different powder masses for the same 6 % protein**
(MPC 7.32 %, NaCN 6.54 %, WPI 6.48 %) — the extra mass is lactose, minerals and moisture that enter
the recipe whether or not anyone accounts for them.

**SAME TOTAL PROTEIN % ≠ SAME FROZEN-DESSERT STRUCTURE.**

## 8. Whey : casein evidence — and an honest directional conflict

***International Journal of Food Properties* (2025), DOI 10.1080/10942912.2025.2459390.**
Fixed 4.5 % protein / 13 % fat / 42 % solids; whey:casein 13/87, 20/80, 33/67, 45/55, 54/46.

- Casein-dominant (13/87): overrun **56.21 ± 2.45 %**, hardness **52.13 ± 2.25 N**
- Whey-dominant (54/46): overrun **20.83 ± 3.10 %**, hardness **75.18 ± 3.47 N**
- Meltdown onset delayed **1.8-fold** in 20/80 versus 54/46

**Recorded, not resolved:** IJFP finds casein-dominant mixes aerate better and melt later, while
JFS 2026 finds sodium caseinate gives the **coarsest ice and the fastest drip-through**. They
measure different things (meltdown onset vs. drip rate) on different casein forms (native micellar
casein inside milk protein vs. isolated NaCN). **v2 therefore uses whey:casein only as a low-weight
tie-break and an advisory note, and never deducts a score point for it.**

Class-level composition used for the functional derivation (no fake per-product ratios):
bovine milk protein ≈ 80 % casein / 20 % whey; MPC and milk powders retain that split by definition;
whey fractions are whey-only; caseinates and micellar casein are casein-only.

## 9. Fat : protein interaction

Every controlled fixture sits at 6–13 % fat (AFR 10 %, JFS 12 %, JDS 12 %, IJFP 13 %) with 4.5–10 %
protein — a protein:fat envelope of roughly 0.34–1.67. **There is no controlled protein:fat series
in the literature**, so v2 asserts no optimum and deducts no points. A candidate outside that
envelope gets an ADVISORY note that it is beyond the evidence, nothing more.

Mechanistically the interaction is real — JFS 2026 attributes structure to "emulsified fat globule
membrane composition", and AFR 2022 shows protein progressively displacing fat destabilization
(D90 15.95 µm at 4 % protein → 5.97 µm at 10 %) — but real is not the same as quantified.

## 10. Lactose / mineral evidence

**Physical Properties of Ice Cream Containing Milk Protein Concentrates**, *J. Dairy Sci.*
88(3):862–871 (2005), DOI 10.3168/jds.S0022-0302(05)72752-1. MPC 56 / MPC 85 substituted for nonfat
milk solids at constant protein, solids held with polydextrose; DSC freezing/melting. Higher MPC
gave **increased fat destabilization, narrower melting curves and greater shape retention**; up to
50 % NDM substitution produced minimal change. *Only the abstract was retrievable from an open
source — the numeric DSC table is behind Elsevier. P4 is therefore a QUALITATIVE fixture and no
number from this paper is used as a coefficient.*

Reference compositions (Center for Dairy Research / ADPI / USDEC):
WPC 80 ≈ 5–7 % fat, 4–5 % lactose, 4 % ash · WPI < 1 % fat, ~1 % lactose, 2 % ash ·
MPC 42 ≈ 46 % lactose, MPC 80/85 ≈ 4 % lactose · calcium caseinate ≈ 90.9 % protein, 0.1 % lactose,
4.5 % ash.

**Gellatti's own catalog proves the point.** At equal protein delivered:

| Source | Protein % | Lactose per g protein |
|---|---|---|
| WPC 60 % (`PI-ING-000294`) | 60 | **0.467 g** |
| WPC 80 % (`PI-ING-000295`) | 80 | **0.188 g** |

The v1 engine reached its 20 % target with 327 g of WPC 60 and produced **9.45 % lactose** — above
even the approved sanding-risk maximum of 9 % — with the lactose gates disabled and no penalty.

**Minerals: NOT AVAILABLE.** `ash_percent` exists as a Mapper column with 1344 non-null cells and
**zero non-zero values across all 2088 rows**. No mineral differentiation between protein sources
can be claimed. `salt_percent` is populated (1636 non-zero) and already enters PAC.

## 11. Freezing authority — audited, documented, NOT changed

1. **Protein contributes no colligative freezing-point depression.** It is a very large molecule
   relative to sugars, lactose, polyols and salts. The Base Engine already models this correctly:
   `src/engine/pac.ts` derives PAC/NPAC from the sugar spectrum, lactose, alcohol and salt, and
   protein enters no PAC term. **This is physically right and needs no change.**
2. **Source-driven freezing differences are therefore ALREADY captured** — swapping a high-lactose
   source (WPC 60, MPC, SMP) for a low-lactose one at equal protein moves lactose, hence NPAC, hence
   ice fraction and hardness, through existing physics. Verified in test: the same fixture with WPC 60
   vs WPC 80 produces measurably different NPAC.
3. **The unvalidated part, stated honestly:** the three `protein_gelato` rows in
   `src/engine/config/iceAnchors.ts` are **verbatim copies of the milk_gelato anchors**
   (source tag `owner_approved_standard_physics`). They were never measured on a high-protein serum
   phase. **v2 does not touch them, does not claim them as validated, and adds no protein-specific
   freezing constant.** Sorbet's composition-sensitive solver was deliberately **not** copied into
   Protein: Sorbet's physics is low-molecular solutes in water, which is not the open question here.
4. The genuinely open question is bound/unfreezable water in a concentrated protein serum. No
   approved anchor exists. None was invented.

## 12. Process behaviour

AFR 2022 pasteurised at 80 °C/1 min and attributes part of its viscosity rise to **whey protein
denaturation** plus calcium-mediated polymerisation. LWT 2021 (DOI 10.1016/j.lwt.2021.111903,
same group, 6–10 % protein WPI) shows that sweeping a GMS:polysorbate-80 blend from 0 to 100 % PS80
**lowers the consistency coefficient and enlarges fat-globule clumps**, improving texture.

Consequence: **structure is a function of protein × process × emulsifier, not of protein %.**
Gellatti has no emulsifier-blend authority and `processUnknown` covers 1389 of 2088 Mapper rows, so
v2 states this as an advisory and refuses to score it. No ordinary Protein recipe is blocked for
unknown processing.

## 13. Mapper coverage — the constraint that caps this work

Deterministic, offline, zero paid lookups
(`src/features/protein-gelato/proteinBehaviorCoverage.report.test.ts`).

```
mapperRows              2088
proteinRelevantRows      295   (protein ≥ 10 %)
byEvidence   EXPLICIT     11 · DETERMINISTICALLY_INFERRED  23 · UNKNOWN 261
byClass      whey_protein_concentrate 3 · mixed_dairy_protein 6 · milk_powder 4
             skim_milk_powder 3 · fluid_dairy 9 · fermented_dairy 2
             plant_protein 3 · egg_protein 4 · unknown 261
lactosePerProteinKnown  295/295      fatPerProteinKnown 295/295
ashNonNull 1344          ashNonZero 0
unclassifiedDairyProteinSources: []
```

**The blocking finding for the source science:**

| Source the science requires | Rows in Mapper |
|---|---|
| Whey protein isolate (WPI) | **0** |
| Micellar casein | **0** |
| Sodium / calcium caseinate | **0** |
| MPC 85 | **0** |
| WPC | 3 |
| Ambiguous "MILK PROTEIN CONCENTRATE WPC 75 %" (`PI-ING-000237`) | 1 (self-contradicting) |
| SMP / milk powders | 7 |
| Plant / egg protein | 7 |

The three strongest studies (JFS 2026, IJFP 2025, JDS 2005) are built on WPI, NaCN, micellar casein
and MPC 85 — **none of which exist in the catalog.** A source-differentiated engine can be built,
but today it can only separate whey-concentrate / mixed-milk / plant / unknown on real data.
**This is precisely why the verdict is C (additive only) rather than A.**

Two secondary data-quality findings, reported not fixed (Mapper is immutable):

- The **display name strips the physical form**: `skimmed_milk_powder` renders as
  "SKIMMED MILK · Milk" and `whole_milk_powder` as "WHOLE MILK · Milk". Since `EngineIngredient.name`
  is the display name, name evidence alone would classify a 3 %-moisture powder as fluid milk. v2
  works around this with a composition tier (water ≤ 15 % ⇒ powder), never by editing the Mapper.
- `PI-ING-000237` asserts both MPC and WPC in one name. v2 refuses to pick a winner and returns
  `mixed_dairy_protein` with `wheyCaseinClass: 'unknown'` rather than inventing precision.

## 14. Derived ProteinBehavior recommendation

Runtime-derived from facts the canonical product already carries — **name + engine category +
verified composition**. No new Mapper column, no `proteinFunctionalClass`, no `wheyCaseinRatio`, no
`proteinForm` in the 2088-row SoT.

- `sourceClass`: WPI · WPC · MPC · micellar casein · caseinate · SMP · milk powder · fluid dairy ·
  fermented dairy · plant · egg · mixed dairy · unknown
- `sourceEvidence`: EXPLICIT | DETERMINISTICALLY_INFERRED | UNKNOWN
- `wheyCaseinClass` + `caseinSharePercent` (class-level only, or null)
- `form`: isolate | concentrate | whole_matrix | unknown
- `lactosePerProteinGram`, `fatPerProteinGram` — the "equal protein ≠ equal chemistry" numbers
- Short acronyms match on **word boundaries**; multi-word phrases as substrings

**UNKNOWN is never a penalty.** An unclassified protein source stays fully usable and falls back to
baseline behaviour, per owner rule §22. Pinned by test.

## 15. Scientific validation set

| ID | Fixture | Type | Source |
|---|---|---|---|
| P1 | WPI concentration 4/6/8/10 % | **QUANTITATIVE** — the 4-point overrun series is reproduced exactly by `overrunProxyAtProteinPercent`, and the 6 %/8 % significance breakpoint calibrates the penalty step | AFR 2022 Table 1 |
| P2 | MPC / NaCN / WPI at fixed 6 % | QUALITATIVE direction — same protein, different structure | JFS 2026 Tables 3/4/7 |
| P3 | Whey:casein series at 4.5 % protein | QUALITATIVE, **contested direction recorded** | IJFP 2025 |
| P4 | MPC 56/85 substitution + DSC | QUALITATIVE only — numeric table not open-access | JDS 2005 |
| P5 | High-protein WPI × emulsifier | QUALITATIVE, advisory only | LWT 2021 |
| P6 | Lactose/mineral source difference | **QUANTITATIVE on Gellatti's own data** — WPC 60 vs WPC 80, 0.467 vs 0.188 g lactose per g protein, and the resulting NPAC difference | Mapper + `pac.ts` |
| P7 | Representative Gellatti Protein recipes | 13 fixtures across −11/−12/−13, dairy/plant/Skyr/WPC60/WPC80/MPC, Main and Multi-Main | `proteinCalibration.report.test.ts` |

Process-specific overrun and hardness are **not** numerically reproduced. They are machine-,
homogenisation- and ageing-dependent (§11 of the brief) and are used only as ranking proxies.

## 16. Exact Protein v2 implementation design

**HARD (one rule).** `assessProteinQualification` — Regulation (EC) No 1924/2006, Annex,
HIGH PROTEIN: at least 20 % of the food's energy from protein. Computed from values the Base Engine
already produces (`nutrition_per_100g.kcal`, `.protein_g`). The minimum protein mass % that earns
the claim for a given composition is exact:

```
requiredProteinPercent = nonProteinKcalPer100g / 16
        (solving 4P / (4P + nonProteinKcal) = 0.20 for P)
```

**Relaxation proof — no currently-legal recipe becomes illegal.** The energy rule requires
`protein ≥ 0.5625 × fat + 0.25 × carbohydrate`. A recipe sitting at the old 20 %-by-mass gate would
need more than **35 % fat** to fail the energy rule; the Protein profile's own fat band is 5–12 %.
The change is a relaxation plus a quality layer, never a new restriction.

**QUALITY (never invalidates).** `assessProteinStructure` — score = 10 − penalties, floor 1:

| Penalty | Rule | Provenance |
|---|---|---|
| `proteinExcess` | 1 point per **2.0 pp** of protein above `requiredPercent`, cap 6 | AFR 2022 measured in 2 pp steps; every step from 6 % up was a significant further loss |
| `beyondEvidence` | flat 1 above 10 % protein | no controlled dataset exists above 10 % |
| `lactoseLoad` | 1 above 9 % lactose, +1 per further 3 pp, cap 2 | reuses the **already-approved** `lactose_sandiness_risk` 5–9 band, as QUALITY not as a gate |

**ADVISORY (never scored).** fat outside 6–13 %, protein:fat outside 0.34–1.67, whey-dominant
aeration risk, casein-dominant ice-coarsening risk, unknown source class.

**OPTIMIZER.** `fitProteinFormulation` sweeps a bounded deterministic ladder from
`requiredPercent` upward in 0.5 pp steps over a 3 pp span (≤ 7 probes), solving each rung with the
**unchanged v1 exact solver** and ranking candidates:

1. earns the claim ≻ does not (the one hard rule)
2. then higher structural quality
3. then **LESS protein** — the explicit anti-"more is better" tie-break
4. then less movement from the user's draft

The user's existing draft competes as a candidate, so grams never move to reach an equal-or-worse
formulation.

**UI.** `ProteinContentReadout` (strictly read-only; no input, slider or button) replaces
`ProteinTargetControl`. The Score ring gains `Białko x,y%` beside it in Protein mode only.

## 17. Unresolved science

1. **Bound/unfreezable water in a high-protein serum.** The `protein_gelato` ice anchors are copies
   of the milk_gelato anchors and are unvalidated above ~4 % protein. Documented, not pretended.
2. **The −13 °C tension.** At −13 °C the richer composition pushes the claim requirement to ~9.4–10 %
   protein — i.e. a legally-qualified Protein product at −13 °C sits at the **very top of, or just
   past, the controlled-evidence window**. Measured in the report fixtures (Neutral −13 → 10.03 %,
   Vanilla −13 → 10.02 %). This is a real product-design tension, not a bug, and v2 handles it by
   formulating anyway and charging the beyond-evidence penalty.
3. **No controlled protein:fat series exists.** Advisory only.
4. **Whey:casein direction is contested** between IJFP 2025 and JFS 2026 (§8). Tie-break only.
5. **JDS 2005 DSC numbers are not open-access.** P4 stays qualitative.
6. **Emulsifier authority does not exist in Gellatti**, so the strongest structural lever the
   literature identifies (protein × emulsifier) cannot be modelled at all.

## 18. Owner decisions still required

**None to proceed.** The binding decision in §0 of the brief is implemented. Two items are
owner *opportunities*, not blockers:

1. **Catalog gap (§13).** WPI, micellar casein, caseinate and MPC 85 do not exist in the Mapper. The
   derived taxonomy already handles all four; it simply never fires. Adding them through the normal
   verified-ingredient route would activate the JFS 2026 / IJFP 2025 science with no code change.
2. **Mapper display names strip the physical form** ("SKIMMED MILK" for a powder). Worked around,
   not fixed, because the Mapper is immutable in this task.
