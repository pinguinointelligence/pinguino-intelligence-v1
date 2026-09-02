# Vegan Science & Authority Audit v2

**Date:** 2026-08-22
**Scope:** AUDIT / SCIENCE ONLY — no implementation, no deploy, no migration, no Mapper change.
**Science base:** `origin/staging` `8c5514307ffd8b84f26e94af68e1f0c4c2de3e46`
**Worktree:** `claude/vegan-science-authority-v2` (local only)

## RESULT

> **C. VEGAN V2 MUST REMAIN ADDITIVE ONLY**

The science is strong enough to justify a Vegan v2 — the two core modelling gaps are
confirmed by controlled experiment, not conjecture. It is **not** strong enough to license
new hard gates: every controlled study that separates fat source or protein source shows the
effect is **context-dependent and non-monotonic**, and one key interaction actually *reverses
direction* with protein composition. A derived fat/protein/structural layer must therefore
enter as **quality/structure evidence**, never as a new hard invalid gate, and every unknown
must fall back to today's behaviour.

One hard-band item does need the owner, and is listed in §7.

---

## 1. Current architecture — proven from code

| Question (§4.5) | Verdict | Proof |
| --- | --- | --- |
| **A.** 8% coconut ≈ 8% sunflower ≈ 8% cocoa butter — only fat % matters? | **CONFIRMED** | [composition.ts:89](src/engine/composition.ts:89) — `totals.fat_g += computeComponentGrams(g, c.fat_percent)`. Fat is a single scalar sum. No fat source, class, SFC or crystallisation state exists anywhere in the engine. |
| **B.** 3.6% pea ≈ 3.6% rice ≈ 3.6% soy — only protein % matters? | **CONFIRMED** | [composition.ts:90](src/engine/composition.ts:90) — `totals.protein_g += …`. Identical single scalar. For Vegan the dairy protein gates are additionally disabled (`aerating_dairy_protein`, `dairy_protein_share_in_solids` in `VEGAN_DISABLED_GATES`), so protein has **no structural role at all** in Vegan — only its mass in solids. |
| **C.** Structural carbohydrates collapse into generic solids/water? | **CONFIRMED** | Composition tracks `fiber_percent` but no Vegan band or gate consumes it. Inulin appears in exactly one place — a **fail-closed dosage ceiling** ([veganProfileConstraints.ts](src/features/formulation/veganProfileConstraints.ts), `VEGAN_INULIN_CALIBRATION_MAX_PERCENT = 8.31`) — never as a structural or freezing contributor. |
| **D.** Inulin / starch / β-glucan / hydrocolloids insufficiently separated? | **CONFIRMED** | Only two mechanisms exist: `assessStabilizerDosage` (an exact-identity dosage window) and the inulin ceiling. Starch and β-glucan have no representation of any kind. |

### 1.1 The finding the brief did not ask for: Vegan ice is dairy-calibrated

`ICE_ANCHOR_ROWS` contains **only** `milk_gelato` (3 rows) and `protein_gelato` (3 rows).
Vegan has **no anchor row of its own**, and
[iceAnchors.ts:141](src/engine/config/iceAnchors.ts:141) resolves
`seededAt(category) || seededAt('milk_gelato')`.

**Vegan ice fraction is therefore estimated from a dairy calibration, driven by NPAC alone.**
Sorbet is explicitly excluded from this fallback; Vegan is not. It is honestly documented
in-code as "a pre-existing, documented category-fallback approximation", but it is the single
largest unstated assumption in current Vegan physics.

There is a saving grace, and it is worth preserving: the professional Monitor status is
stricter than the estimate. `hasDirectSeededIceAuthority` requires
`row.category === recipe.category`
([freezingStabilityStatus.ts:56](src/features/recipe-constraints/freezingStabilityStatus.ts:56)),
so **Vegan can never certify GOOD freezing stability** — it correctly refuses to vouch for a
number it borrowed. The estimate and the certification already disagree, honestly.

## 2. Current hard bands — exact, and their real provenance

Source of truth: [temperatureRegulator.ts](src/spine/temperatureRegulator.ts) →
[targets.ts:213-260](src/engine/config/targets.ts:213).

| Metric | −11 °C | −12 °C | −13 °C |
| --- | --- | --- | --- |
| POD | 13–25 | 13–25 | 13–25 |
| NPAC | 35–52 | 44–59 | **50–64** |
| NPAC clean centre | — | 48–54 | **53.5–60.0** |
| Ice fraction | 45–61 | 46–60 | **46–58** |
| Fat | 0–12 | 0–12 | 0–12 |
| Solids | 30–43 | 30–43 | 30–43 |
| Water | 54–72 | 52–70 | **50–67** |
| Stabilizer | required | required | required |

The queue's historical baseline matches the **−13 cell exactly**. It is confirmed current.

**Provenance is not uniform, and this matters.**

- **−13 °C** — `locked_pinguino_v0_1`, note: *"observed calibration anchor — external
  calibration data directly exposed Vegan −13 °C"*, with `lockedReference` and
  `mediumEvidence` points (POD 22.08 / 20.58; NPAC 59.47 / 53.75; ice 51.06 / 51.35;
  fat 5.08 / 4.21; solids 36.24 / 36.17; water 63.76 / 63.83).
- **−11 and −12 °C** — `locked_pinguino_internal_v0_1`, note: *"derived from PINGUINO
  temperature logic — **locked internal v0.1, not externally confirmed**"*.

So exactly **one** of three Vegan cells rests on observed data. The other two are internal
extrapolation, self-declared as unconfirmed.

### 2.1 Band classification (§4.6) — no band changed in this audit

| Band | Classification | Rationale |
| --- | --- | --- |
| Water ≥ 0, mass balance, ice ∈ [0,100] | **HARD physics** — KEEP | Thermodynamic identities. |
| POD 13–25 (all temps) | **PREFERRED/TARGET** — KEEP, reclassify | Sweetness is a perception target, not a failure mode. Identical across all three temperatures, which is itself a sign it is a product-design envelope, not physics. |
| NPAC −13 50–64 | **HARD (formulation)** — KEEP | The only externally anchored freezing-power band. |
| NPAC −11 35–52 / −12 44–59 | **OWNER DECISION REQUIRED** | Self-declared "not externally confirmed". Currently enforced with the same authority as the anchored −13 band. |
| NPAC clean centre 53.5–60 | **PREFERRED/QUALITY** — KEEP as-is | Already correctly modelled as a centre, not a gate. |
| Ice 46–58 (−13) | **KEEP but RECLASSIFY** | Anchored at −13, but computed through the **milk_gelato** fallback (§1.1). The band is defensible; its input is borrowed. |
| Ice 45–61 (−11) / 46–60 (−12) | **OWNER DECISION REQUIRED** | Unconfirmed band **and** borrowed estimator. |
| Fat 0–12 | **PREFERRED/TARGET** — KEEP, reclassify | No evidence supports 12% as a physical ceiling for plant fat; §3.1 shows fat *source* dominates fat *level* for structure. |
| Solids 30–43, Water 50–67 | **PREFERRED/TARGET** — KEEP | Formulation envelope. |
| Stabilizer required | **HARD (safety/structure)** — KEEP | Fail-closed, correct. |
| Inulin ≤ 8.31% | **KEEP but RECLASSIFY** | A calibration envelope from one owner reference, correctly labelled as such in code. §3.4 shows inulin is functionally active well below this. |

## 3. Scientific evidence

Every number below is quoted with its source, table and units. No coefficient is transferred
into Gellatti by this audit.

### 3.1 Fat source changes structure at constant fat % — proposition A is refuted

Ng et al. (2023), *Int. J. Food Sci. Technol.* 58(7):3912, **DOI 10.1111/ijfs.16493**,
Tables 1 and 3. Plant-based frozen dessert; only the oil is swapped at ~9.89% fat.

| Treatment | Overrun % | Hardness N | Partial coalescence % |
| --- | --- | --- | --- |
| 6% chickpea + **sunflower** (6CP-SO) | 18.74 | 24.77 | 839.67 |
| 6% chickpea + **coconut** (6CP-CO) | **42.51** | **32.85** | 1065.10 |
| 3% chickpea + soymilk + **sunflower** (3CP3SM-SO) | 27.46 | 2.58 | 51.65 |
| 3% chickpea + soymilk + **coconut** (3CP3SM-CO) | **49.56** | **5.77** | **13.47** |

Swapping *only* the fat source changes overrun by **2.27×** and hardness by **+33%** at 6% CP,
and overrun by 1.80× and hardness by 2.24× at mixed protein.

**The critical detail:** partial coalescence moves from 839.67 → 1065.10 (coconut *higher*)
in one protein context and 51.65 → 13.47 (coconut *lower*) in the other. **The direction
reverses.** The authors attribute the mechanism to SFC: *"CO has high crystallinity and solid
fat content at temperatures as low as 25 °C, whereas SO is characterised by low crystallinity
and low solid content."*

This single reversal is the strongest argument in this audit against a quantitative
per-fat-class coefficient. A fat effect that flips sign with protein composition cannot be
represented as an additive modifier.

### 3.2 Protein source changes structure at constant protein % — proposition B is refuted

Hasan, Thoo & Siow (2024), *Food Sci. Nutr.*, **DOI 10.1002/fsn3.4494**, PMCID PMC11606870,
Tables 1 and 5. Formulation held identical: fat 10%, protein **3.6%**, sugar 15%, stabiliser
0.25%, emulsifier 0.1%. Aged 4 °C overnight, frozen 50 min, hardened −18 °C / 48 h.

| Protein (3.6% in all) | Overrun % | Hardness N | First drip min | Melting rate %/min |
| --- | --- | --- | --- | --- |
| Brown rice (78% protein) | **47.50 ± 2.13** | **20.02 ± 2.35** | 36.78 ± 2.54 | **0.29 ± 0.01** |
| Pea (80% protein) | 37.88 ± 1.10 | **26.37 ± 2.11** | 37.33 ± 2.50 | **0.12 ± 0.01** |
| Soy (90% protein) | 40.78 ± 2.07 | 22.24 ± 2.25 | 38.11 ± 2.47 | 0.19 ± 0.01 |

At **identical macro protein**: overrun spans 9.6 points (25%), hardness 6.35 N (32%), and
melting rate differs **2.4×** between pea and rice. Sensory acceptance ordered
soy > pea > rice (Fig. 4), all above the 5/9 threshold.

A subtlety worth carrying into any implementation: **first-drip time is nearly identical
(36.78–38.11 min, ~4%) while melting *rate* differs 2.4×.** They are different physical
quantities and must not be conflated into one "melting" metric.

### 3.3 Protein response is non-monotonic — no universal protein band is defensible

*Food and Humanity* (2025), **DOI 10.1016/j.foohum.2025.100557**. Coconut milk : soy protein
powder ratios 55:0, 51:4, 49:6, 47:8, 45:10.

- Overrun: **12% → 25% → back to ~10%** as SPP rises to 10%. An **inverted-U**.
- Melting rate falls monotonically (~3 → 0 mL/min) as SPP rises.
- Viscosity, gel strength and viscoelasticity rise monotonically with SPP.
- Authors' conclusion: soy protein should be **< 6% w/w** for optimal sensory attributes.

Overrun peaks and then collapses while melting improves monotonically — the "best" protein
level depends on which property you optimise. Encoding one study's optimum as a universal
hard max would be exactly the error §4.7D warns against.

### 3.4 Inulin is not a hydrocolloid — and it is freeze-active

*LWT* (2018), **DOI 10.1016/j.lwt.2018.03.010**. Coconut-milk ice cream.
Inulin 0.8 / 1.6 / 2.4 / 3.2 / 4.0 g per 100 g; LBG 0.2 / 0.4 / 0.6 / 0.8 g per 100 g.

- **Higher inulin *and* lower LBG → higher overrun.** They act in **opposite directions** on
  the same property. This is direct evidence that inulin ≠ hydrocolloid stabiliser.
- LBG reduces melting; inulin does not do so equivalently.
- Neither affected hardness.
- **Increasing inulin *and* LBG both decreased the cryoscopic temperature** — inulin is
  **freeze-active**, not inert bulk solids.

Their effective dose ranges differ ~5× (inulin 0.8–4.0 vs LBG 0.2–0.8), which is itself
evidence they are different functional classes. The dosages are *not* transferable to
Gellatti as authority — one coconut-milk formulation is not a universal window.

### 3.5 Fat SFC is the mechanism, but the data does not support inventing curves

Sonwai et al., **DOI 10.1007/s13197-022-05507-z**, PMCID PMC9304505, Fig. 2. Palm kernel oil /
soybean oil / palm stearin ternary blends vs milk fat.

- Milk fat: ~22–34% SFC at 20–25 °C, 0% above 35 °C.
- Blends G (80/15/5 PS33) and J–L (PS38) track milk fat above 20 °C; H and I retain solids
  above 37 °C.
- Ternary blends show two endothermic peaks: one at **−17.4 to −13.3 °C** and one at
  23.3–25.3 °C, vs milk fat's single main peak at 15.7 °C.
- Microstructure comparable to milk fat (spherulites with needle-like crystals).

The **−17.4 to −13.3 °C endotherm sits inside the gelato serving range**, which is precisely
where a fat-blind model is most exposed. But this paper reports **no overrun and no hardness**
for a frozen dessert, and covers PKO/SBO/PS — not coconut, sunflower or cocoa butter. It
supports a **qualitative fat functional class**; it does **not** supply an SFC curve for the
fats Gellatti actually uses.

### 3.6 Emulsifier/stabiliser and protein source do *not* drive ice crystal size

Sözeri Atik et al. (2025), *J. Texture Stud.*, **DOI 10.1111/jtxs.70035**. Soy and pea protein
isolates × MDG / polysorbate 80 at 0.15% and 0.30% × stabiliser 0% / 0.2% / 0.4%.

- **Mean ice crystal size was not affected** by emulsifier type, emulsifier level, stabiliser
  level, or protein source.
- Partial coalescence increased with increasing PS80.
- MDG gave higher total drip-through than PS80.

This is the most architecturally important result in the audit. Structural functionality acts
on **coalescence and melting**, not on ice crystal size. It is direct evidence for keeping the
freezing/ice layer separate from the fat/protein functionality layer — and against letting a
derived structural class modify ice or NPAC.

### 3.7 β-glucan — mechanistic only, and explicitly dairy

*Molecules* 28(7):2924 (2023), **DOI 10.3390/molecules28072924**, PMCID PMC10096017. Low-fat
(2%) **milky** ice cream.

- β-glucan at 0.5% depressed cryoscopic temperature by **0.166 °C** vs Cremodan SI 320 at the
  same 0.5% (**0.078 °C**) — a **2.1×** difference — inhibiting free-water freezing between
  −5 and −10 °C.
- Mechanism: β-glucan forms more energy bonds *"due to specific interaction with **milk
  proteins**"*.

The mechanism is explicitly dairy-protein-mediated. **No coefficient from this paper may
enter Vegan.** It establishes only that soluble β-glucan is freeze-active enough to matter.

## 4. Freezing model audit (§4.10)

I ran the real Sorbet composition-sensitive solver
([sorbetFreezingPhysics.ts](src/engine/sorbetFreezingPhysics.ts) —
Chen equation with Grajales-Lagunes E/B regressions) against the owner's MyGelato Vegan −13
benchmark composition (Water 626 / Sucrose 180 / Dextrose 70 / Inulin 40 / Tara 4 / fat 80).

| Declaration | Solver outcome |
| --- | --- |
| Inulin+Tara+fat counted as inert dry solids | **`available`** — sugar share of dry solids **0.6684**, inside the validated domain [0.571, 0.95]; Chen E 0.0508, B 0.0871; **FP −3.25 °C**; **ice 45.20%** of mix; 72.20% of initial water frozen |
| Fat excluded from dry solids | `unavailable` — `mass_balance_mismatch` |
| Inulin+Tara (44 g) declared freeze-active | **`unavailable`** — `unsupported_freeze_active_solute` |

Three conclusions, all consequential:

1. **The domain guard checks sugar *share*, not matrix *identity*.** A Vegan mix with 8% fat,
   4% inulin and 0.4% tara lands inside a domain validated on **five real-fruit sorbet
   systems**. The solver would answer confidently for a matrix it was never fitted on. Sharing
   it with Vegan without an added matrix guard would manufacture false confidence.
2. **Where it does answer, the freezing point is close and the ice fraction is not.** Solver
   FP **−3.25 °C** vs MyGelato's displayed **−3.16 °C** (Δ 0.09 °C); solver ice **45.20%** vs
   MyGelato's displayed raw ice **51.15%** (Δ ≈ 6 points). Note 45.20% also falls **below** the
   current Vegan −13 ice band minimum of 46.
3. **Declared honestly, it fails closed.** §3.4 proves inulin *is* freeze-active. Declaring it
   so makes the solver refuse — which is the correct posture, and shows the model has no
   inulin coefficient to offer.

**Recommendation.** A universal low-molecular-solute layer (water, sucrose, dextrose/glucose,
fructose) **is** scientifically shareable — that part is thermodynamics. The
**Grajales-Lagunes E/B regressions are not**: they are fitted to fruit dry-solids composition.
Vegan v2 should share the *thermodynamic core* and require its own composition parameters,
with an explicit matrix guard, before it may speak. It must **not** simply call the Sorbet
solver. Bound-water assumptions for protein, fibre and inulin are **unsupported** by anything
in the current evidence set.

## 5. Mapper coverage (§4.17) — measured, no paid call, no Mapper mutation

Computed by running the **real production** `assessMapperVeganEligibility` over the real
2088-row Mapper base (local harness, `src/features/vegan-audit/__audit__/`).

### 5.1 Vegan eligibility counts — recomputed, and materially different from the baseline

| Status | Historical baseline (queue) | **Actual, current** |
| --- | --- | --- |
| VEGAN_VERIFIED | 1001 | **1275** |
| VEGAN_FALSE | 793 | **784** |
| VEGAN_UNKNOWN | 278 | **11** |
| VEGAN_CONFLICT | 11 | **18** |
| Total | 2083 | **2088** |

The baseline was stale, exactly as the queue anticipated. UNKNOWN has collapsed from 278 to
**11** and VERIFIED has grown by 274. **18** conflicts now exist and are worth an owner look.

### 5.2 Derived-evidence coverage across the 1275 VEGAN_VERIFIED products

| Signal | Count | Share |
| --- | --- | --- |
| Water % present | 1275 | **100%** |
| Fat % present | 1275 | **100%** |
| Protein % present | 1275 | **100%** |
| Fibre % present | 1275 | **100%** |
| Fat-bearing (> 0.5% fat) | 414 | — |
| → fat **class** deterministically inferable | 203 | **49.0%** |
| Protein-bearing (> 0.5% protein) | 526 | — |
| → protein **class** deterministically inferable | 168 | **31.9%** |
| Inulin identifiable | 28 | — |
| Starch identifiable | 72 | — |
| **β-glucan explicit** | **0** | **0%** |
| Hydrocolloid identifiable | 272 | — |
| Emulsifier identifiable | 146 | — |
| `stabilizer_activity` present | 774 | 60.7% |
| Full dosage window present | 156 | 12.2% |

**Coverage summary (§4.23 items 14–16).** Explicit amounts: **100%** (water, fat, protein,
fibre). Deterministically inferred functional class: **49.0%** of fat-bearing products,
**31.9%** of protein-bearing products. Baseline fallback: **51.0%** of fat-bearing and
**68.1%** of protein-bearing products.

**β-glucan explicit coverage is exactly zero.** §4.13's warning is not hypothetical — there
is no oat product in the Mapper carrying a β-glucan figure, so any β-glucan term in Vegan v2
would be invented. It must not be built.

Protein-class coverage at 31.9% is the binding constraint: **more than two thirds of
protein-bearing Vegan products would fall back to baseline.** Any architecture that gates on
protein class is therefore unusable.

### 5.3 No-blocking proof (§4.18) — the number is 0

> **VEGAN_VERIFIED products rendered unusable by unknown enhanced metadata: 0**

This holds **by construction**, and that is the point: the simulation only passes because the
proposed layer is additive-only — unknown fat class, unknown protein class and unknown
structural class all resolve to today's behaviour. Given §5.2 (68.1% of protein-bearing
products have no inferable class), **any non-additive architecture would fail this test
outright and must be rejected on sight.**

### 5.4 Deterministic classifier feasibility (§4.19)

| Probe | Fat class | Protein class | Structural class | Confidence | False-positive risk |
| --- | --- | --- | --- | --- | --- |
| coconut oil | `coconut_lauric` | — | — | High | Low — but "coconut milk"/"coconut sugar" need exclusion |
| sunflower oil | `liquid_sunflower` | — | — | High | Low; "sunflower lecithin" is an emulsifier, not a fat phase |
| cocoa butter | `cocoa_butter` | — | — | High | Must not catch "cocoa powder" / "cocoa mass" |
| olive oil | `olive` | — | — | High | Low |
| soy drink | — | `soy` | — | Medium | "soy lecithin" must not read as protein |
| pea protein | — | `pea` | — | High | Low |
| rice protein | — | `rice` | — | High | "rice syrup" is a sugar, not protein |
| pistachio paste | `nut_fat_matrix` | `nut` | — | Medium | Correctly dual-class — nut pastes are both |
| hazelnut paste | `nut_fat_matrix` | `nut` | — | Medium | As above |
| oat drink | — | `oat` | — | Medium | Oat is mostly starch; "oat protein" ≠ "oat drink" |
| inulin | — | — | `inulin` | High | Low |
| tara gum / guar gum / locust bean gum | — | — | `hydrocolloid` | High | Low |

All 14 probes classified as intended. The named failure modes above (lecithin, rice syrup,
cocoa powder, coconut sugar) are the exclusions any implementation must carry. Every
unresolved case returns `null` → baseline.

## 6. MyGelato — external holdout only (§4.15, §4.16)

**Fat conclusion.** Across coconut oil, sunflower oil and cocoa butter at the same 80 g in an
otherwise identical Vegan −13 formula, the displayed MyGelato balance metrics were
**effectively identical** (POD 23.28, PAC 30.56, NPAC 48.26, FP −3.16 °C, 50% frozen water
−6.75 °C, raw ice 51.15%, fat 8%, solids 36.68%, water 63.32%). Auto-balance likewise
produced effectively the same structure across all three fats.

The **only** permitted conclusion: *the displayed MyGelato balance metrics did not visibly
distinguish these fat sources in this controlled test.* Nothing is claimed about their
internal algorithm. Read against §3.1 — where the same swap moved overrun 2.27× in a
peer-reviewed controlled trial — this says a balance-metric view is simply **blind to the
axis where fat source actually acts**. Gellatti's current model is blind in the same way, and
it is not evidence that the axis does not exist.

**Protein conclusion.** Rice protein (43.17 g, 83.4% protein, 3.61% display total) vs pea
protein (44.06 g, 81.7%, 3.60%) at Vegan −13 gave raw ice **50.45%** vs **50.40%** — almost
identical — and both showed aerating protein **0** and protein share in solids **0**. The
compositions were **not** perfectly matched (pea carried far more salt, 0.22 vs 0.01, plus
slightly different fat and fibre), so the PAC/NPAC gap (26.83 vs 28.06) is **not**
protein-source modelling proof and is not treated as such.

Permitted conclusion: *raw ice was almost identical and both displayed structural protein
metrics remained 0.* Again, §3.2 shows a real 2.4× melting-rate difference at matched protein
— invisible to both systems.

**MyGelato was used only as an external holdout. No MyGelato coefficient enters Gellatti.**

## 7. Owner decisions required

1. **Vegan −11 / −12 NPAC and ice bands.** They are enforced today with the same authority as
   the externally anchored −13 cell, while the code itself records them as *"not externally
   confirmed"*. Either accept them explicitly as owner-set formulation targets, or downgrade
   them from hard gates to preferred bands. This audit changed nothing.
2. **Vegan ice via the dairy `milk_gelato` fallback (§1.1).** Accept it explicitly as a
   documented approximation, or commission Vegan anchor rows. Note the Monitor status already
   refuses to certify GOOD on it — so the honest option is available at no cost.
3. **18 VEGAN_CONFLICT products** — up from 11. Worth a review pass; they are fail-closed
   today, so nothing is unsafe.

## 8. Recommended model (§4.20)

| Candidate | Verdict |
| --- | --- |
| **V0** — current Vegan unchanged | Rejected. §3.1/§3.2 confirm two real, measurable gaps. |
| **V1** — current hard physics + derived quality/structure modifiers | **RECOMMENDED** |
| **V2** — shared canonical low-molecular freezing + derived fat/protein functionality | Partially adopt: the shared thermodynamic core is sound (§4), but Vegan needs its own composition parameters and a matrix guard. Defer until those exist. |
| **V3** — quantitative SFC / protein functionality coefficients | **Reject now.** §3.1 shows the fat effect **reverses sign** with protein context; §3.3 shows protein response is non-monotonic; §3.5 supplies no SFC curve for coconut/sunflower/cocoa butter. This would be false precision. |

**V1, strictly additive.** Concretely:

- Hard physics, hard bands and Vegan eligibility: **unchanged**.
- Add a derived, versioned, reproducible `VeganBehavior` with `EXPLICIT` /
  `DETERMINISTICALLY_INFERRED` / `UNKNOWN` levels for fat class, protein class and structural
  class, computed from existing Mapper identity/ingredients — **no Mapper column added, no
  retagging of 2088 rows**.
- Surface it as **quality/structure advice only** (aeration, melting, coalescence, hardness
  direction). Never a hard invalid gate. Never an ice or NPAC modifier — §3.6 shows structural
  factors do not drive ice crystal size.
- `UNKNOWN` → today's behaviour, always. Non-negotiable, per §5.3.
- **Do not build a β-glucan term** — coverage is 0% (§5.2).
- Separate inulin from hydrocolloids (§3.4) and keep the existing inulin ceiling as the
  fail-closed envelope it already is.

## 9. Validation set (§4.21) — 7 fixtures

| ID | Source | Formulation held constant | Variable | Measured outputs | Direction Gellatti should reproduce | Use |
| --- | --- | --- | --- | --- | --- | --- |
| **V1** | DOI 10.1002/fsn3.4494, T1/T5 | fat 10%, protein 3.6%, sugar 15%, stab 0.25%, emul 0.1%; 4 °C age, 50 min freeze, −18 °C/48 h | rice / pea / soy | overrun 47.50/37.88/40.78 %; hardness 20.02/26.37/22.24 N; melt 0.29/0.12/0.19 %/min | rice → highest overrun, lowest hardness, fastest melt; pea → slowest melt, hardest | **Qualitative holdout** |
| **V2** | DOI 10.1111/ijfs.16493, T1/T3 | ~9.89% fat, matched protein level | sunflower vs coconut | overrun 18.74→42.51 and 27.46→49.56; hardness 24.77→32.85 and 2.58→5.77; coalescence 839.67→1065.10 and 51.65→13.47 | coconut → higher overrun and hardness in both contexts; **coalescence direction is protein-dependent** | **Qualitative holdout — and the guard against additive fat coefficients** |
| **V3** | DOI 10.1016/j.foohum.2025.100557 | coconut-milk base | SPP 0/4/6/8/10 | overrun 12→25→~10 %; melt ~3→0 mL/min; viscosity ↑ | overrun **non-monotonic**; melting monotonic | **Qualitative holdout — forbids a universal protein optimum** |
| **V4** | DOI 10.1007/s13197-022-05507-z, Fig. 2 | PKO/SBO/PS blends vs milk fat | blend ratio | SFC vs T; endotherms −17.4…−13.3 °C and 23.3–25.3 °C | fat class must be distinguishable **within the serving range** | **Mechanistic only — no numeric calibration** |
| **V5** | DOI 10.1111/jtxs.70035 | soy / pea isolate | MDG vs PS80 at 0.15/0.30%; stab 0/0.2/0.4% | ice crystal size **unaffected**; coalescence ↑ with PS80; MDG → more drip | structural factors must **not** move ice crystal size | **Negative control — architectural guard** |
| **V6** | DOI 10.1016/j.lwt.2018.03.010 | coconut-milk ice cream | inulin 0.8–4.0; LBG 0.2–0.8 g/100 g | overrun ↑ with inulin, ↓ with LBG; hardness unaffected; both ↓ cryoscopic T | inulin and LBG are **distinct classes with opposite overrun signs** | **Qualitative holdout** |
| **V7** | DOI 10.3390/molecules28072924 | 2% fat **milky** ice cream | β-glucan 0.5% vs Cremodan 0.5% | ΔT_cryo −0.166 vs −0.078 °C | soluble β-glucan is freeze-active | **Mechanistic only — dairy mechanism, never calibration** |

Five qualitative/architectural holdouts, two mechanistic-only. **Zero numeric calibration
fixtures** — the evidence does not support any.

## 10. Provenance (§4.22)

Every numeric claim above carries paper, DOI, table/figure, units, formulation and processing
context, and is marked direct or inferred. No magic constants were introduced. No MyGelato
coefficient was used. No coefficient from any paper was transferred into Gellatti — this
audit produced **no runtime code**.

## 11. Exact next implementation task

Build `deriveVeganBehavior(ingredient) → { fatClass, proteinClass, structuralClass, level }`
as a **pure, versioned, unexported-from-runtime** module with:

1. the classifier patterns validated in §5.4, including the named exclusions
   (lecithin, rice syrup, cocoa powder/mass, coconut sugar/milk);
2. `UNKNOWN` as the default for every unresolved case;
3. a test asserting **0** VEGAN_VERIFIED products change usability — the §5.3 invariant, run
   over all 2088 rows as a CI gate;
4. **no** engine wiring in that task. Surfacing it as advice is a separate, later task, after
   the owner resolves §7.

## 12. Validation (§4.24)

| Check | Result |
| --- | --- |
| Existing Vegan tests | **35 passed / 5 files** |
| Mapper row count | **2088** |
| Mapper fingerprint | `b13f5db4affd9c3be5ccbe59b40920053197a3697a3fa1bd4a859406e8baed38` — **unchanged** |
| Runtime code modified | **none** — `git status` shows only the untracked local audit harness |
| Migrations added | **none** |
| Deployments | **none** |

Files added (local audit harness only, not wired to runtime):

- `src/features/vegan-audit/__audit__/veganAuthority.audit.test.ts`
- `src/features/vegan-audit/__audit__/veganFreezingProbe.audit.test.ts`
- `reports/VEGAN_SCIENCE_AUTHORITY_V2.md`

---

NO MAPPER BASE CHANGE
NO STAGING DEPLOY FROM VEGAN AUDIT
NO PRODUCTION DEPLOY
NO VEGAN_VERIFIED PRODUCT BLOCKED DUE TO MISSING ENHANCED METADATA
MYGELATO USED ONLY AS EXTERNAL HOLDOUT
