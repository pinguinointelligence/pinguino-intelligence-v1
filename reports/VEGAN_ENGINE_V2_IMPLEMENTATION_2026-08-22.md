# Vegan Engine v2 — Additive Functional Physics Implementation

**Date:** 2026-08-22
**Scope:** LOCAL IMPLEMENTATION ONLY — no staging push, no staging deploy, no production deploy, no migration, no Mapper mutation.
**Base:** `origin/staging` `8c5514307ffd8b84f26e94af68e1f0c4c2de3e46`
**Branch / worktree:** `claude/vegan-engine-v2` — `~/Developer/pinguino-intelligence-v1-vegan-engine-v2`
**Science authority:** `reports/VEGAN_SCIENCE_AUTHORITY_V2.md` (verdict **C. VEGAN V2 MUST REMAIN ADDITIVE ONLY**)

## RESULT

> **A. VEGAN ENGINE V2 READY FOR CONTROLLED INTEGRATION**

Vegan v2 adds a derived, versioned, deterministic structural model on top of the
existing Vegan Engine. It changes **no band, no coefficient, no eligibility rule,
no Mapper row and no engine number**. Every unresolved class falls back to
today's behaviour, and the number the owner asked to be zero is zero:

> **VEGAN_VERIFIED products blocked by unknown enhanced metadata: 0**

---

## 1. Architecture

```
immutable Mapper / Overlay / ProductBehavior   (UNCHANGED)
        ↓  read-only canonical facts
VeganBehaviorFacts        ← one narrow adapter, runtime AND audit share it
        ↓  pure, versioned, memoised
deriveVeganBehavior(facts) → VeganBehavior
        ↓  EXPLICIT / DETERMINISTICALLY_INFERRED / UNKNOWN
assessVeganRecipeStructure(input) → structural quality + explainable reasons
        ↓  tie-break only
optimizer candidate ranking · Rescue candidate ranking
        ↓
existing HARD physics remains the sole authority
```

Three layers stay strictly separate and only the third is new:

| Layer | Owner | Changed by Vegan v2 |
| --- | --- | --- |
| **HARD** — profile / safety / physics constraints | `targets.ts`, `veganProfileConstraints.ts`, `veganEligibility.ts` | **No** |
| **PREFERRED** — formulation targets, preferred regions | Direction / formulation | **No** |
| **QUALITY / STRUCTURE** — derived structural intelligence | `features/vegan-structure/` | **New, additive** |

No second Vegan database exists. No derived tag is ever written back to the
Mapper base. The classifier has no network, no LLM and no per-calculation DB
research; results are memoised on a fingerprint of the exact canonical facts
plus the model version.

## 2. Derived `VeganBehavior` schema

`src/features/vegan-structure/veganBehaviorTaxonomy.ts`,
`VEGAN_BEHAVIOR_MODEL_VERSION = '2.0.0'`.

```ts
VeganBehavior {
  modelVersion, identityKey,
  fat:     { amountPercent, amountEvidence, source, functionalClass, evidence },
  protein: { amountPercent, amountEvidence, source, form, functionalClass, evidence },
  structuralCarbohydrates: [{ structuralClass, evidence, amountPercent }],
  hydrocolloids:           [{ hydrocolloidClass, evidence }],
  emulsifiers:             [{ emulsifierClass, evidence }],
  reasons: string[]        // deterministic machine-readable trace
}
```

Amount evidence and class evidence are **separate**: a product may have a known
fat amount and an unknown fat class, which is exactly the audit's §5.2 reality.

## 3. Evidence levels

| Level | Meaning | Example |
| --- | --- | --- |
| `EXPLICIT` | the canonical identity names the functional material itself | `PEA PROTEIN ISOLATE` → pea / isolate; `REFINED COCONUT OIL` → coconut |
| `DETERMINISTICALLY_INFERRED` | a source token **plus** a corroborating composition fact | `COCONUT MILK` with 17 % fat → lauric fat phase |
| `UNKNOWN` | no rule fires | 7 % fat, source not establishable → amount known, class UNKNOWN |

`UNKNOWN` is never a defect and never a penalty. An LLM guess can never become
runtime safety authority — the classifier is pure pattern + composition.

## 4. Fat taxonomy (minimal, audit-supported)

`lauric_solid_fat` · `cocoa_butter_fat` · `liquid_vegetable_oil` ·
`nut_fat_matrix` · `mixed_plant_fat` · `unknown`
(with the finer `source`: coconut, palm_kernel, cocoa_butter, sunflower,
soybean, rapeseed, olive, nut_or_seed, mixed, unknown).

**No SFC curve, no per-class coefficient, no additive modifier of any kind** is
attached. Audit §3.1 shows the partial-coalescence direction *reverses* with
protein composition (839.67 → 1065.10 in one context, 51.65 → 13.47 in the
other), so an additive fat coefficient is refuted by the evidence itself, and
§3.5 supplies no SFC data for coconut, sunflower or cocoa butter.

8 % coconut is **not** treated as 8 % sunflower for structural quality — and
neither is made invalid by its class. A test pins that this is enforced against
the two byte-identical toolbox oil payloads.

Named exclusions carried (audit §5.4): sunflower/soy **lecithin** is an
emulsifier, **cocoa powder / cocoa mass** is not a cocoa-butter fat phase,
**coconut sugar / coconut water** is not a lauric fat phase.

## 5. Protein taxonomy (minimal, audit-supported)

Sources: soy · pea · rice · chickpea · oat · nut_or_seed · mixed · unknown.
Forms (only where safely determinable): isolate · concentrate ·
whole_food_matrix · unknown.
Functional classes: `functional_plant_protein_isolate` ·
`whole_food_plant_protein_matrix` · `mixed_plant_protein` · `unknown`.

**No universal protein ideal / min / max exists.** Audit §3.3 shows the response
is non-monotonic (overrun 12 → 25 → ~10 %), so one study's optimum must never
become a band. Protein functionality is used only for structural-quality
prediction, optimizer preference / tie-breaking and explainable reasons — never
for a new hard rejection.

Named exclusions: **rice syrup** is a sugar, **soybean oil** is a fat, **soy
lecithin** is an emulsifier — none of them are protein evidence.

## 6. Structural carbohydrates

`inulin` · `starch` · `oat_matrix` · `soluble_fibre` · `beta_glucan_explicit` ·
`unknown_structural_solids` — kept functionally distinct.

- **Inulin is never collapsed into the hydrocolloid taxonomy.** Audit §3.4 shows
  inulin and LBG act in *opposite* directions on overrun. The approved toolbox
  payload for Inulin carries `category: 'stabilizer'`; a dedicated rule prevents
  that from turning inulin into a hydrocolloid, even an unknown one.
- **Oat is qualitative only.** An oat identity yields `oat_matrix` and never a
  β-glucan quantity.
- **No β-glucan term is built.** `beta_glucan_explicit` is accepted *only* from a
  stated canonical quantity. Measured Mapper coverage is **0 of 1275** — the test
  asserts it.
- Maltodextrin is deliberately **not** classified as structural starch: it is a
  hydrolysed carbohydrate the Engine already models through DE.

## 7. Stabiliser / hydrocolloid handling

Classes: tara · guar · locust_bean · xanthan · carrageenan · pectin · agar ·
cellulose_gum · other_unknown. An unidentifiable stabiliser records
`other_unknown` at `UNKNOWN` evidence and therefore contributes nothing.

**No new universal Vegan stabiliser hard band was created.** The existing
`assessStabilizerDosage` exact-identity window and the fail-closed
`VEGAN_INULIN_CALIBRATION_MAX_PERCENT = 8.31` envelope are untouched. The
quality model does understand the distinction the owner asked for: a recipe with
a hydrocolloid system scores structurally above one carrying only inulin/fibre
solids, and emits the reason `inulin_is_not_a_hydrocolloid_system`.

## 8. Freezing baseline isolation (§14)

Vegan has **no ice anchor row of its own**. Its ice fraction is estimated through
the documented `milk_gelato` (dairy) category fallback.

1. **Numerical behaviour is preserved exactly** — `estimateIceFraction` returns
   the same values; the golden ice/recipe fixtures are green and unchanged.
2. **The dependency is isolated in ONE named seam**: `resolveIceAnchorRows` in
   `src/engine/config/iceAnchors.ts` (a pure extraction of the previous inline
   rule — the generated Edge bundle diff shows it is semantically identical).
3. **`src/engine/config/veganFreezingAuthority.ts`** states the truth explicitly
   and testably: `resolveIceAuthorityProvenance('vegan_gelato', t)` returns
   `kind: 'borrowed_dairy_anchor'`, `sourceCategory: 'milk_gelato'`,
   `categoryValidated: false`, `label: 'baseline_legacy_calibrated'`.
4. **It is never presented as plant-validated.**
   `hasOwnPlantValidatedVeganIceAuthority()` returns `false` today and flips to
   `true` the moment seeded `vegan_gelato` rows exist — the single predicate a
   future Vegan freezing authority has to satisfy. No Vegan ice constant was
   invented and Sorbet's solver was **not** substituted.
5. Vegan is **not** made globally unavailable over this open question. The
   professional Monitor status already refuses to certify GOOD on the borrowed
   number (`hasDirectSeededIceAuthority` requires the own category), so the
   honest posture already exists and is preserved.

## 9. −11 / −12 / −13 provenance (§15)

Support and numerical targets are **unchanged** and pinned by test:

| Metric | −11 | −12 | −13 |
| --- | --- | --- | --- |
| POD | 13–25 | 13–25 | 13–25 |
| NPAC | 35–52 | 44–59 | 50–64 |
| Ice fraction | 45–61 | 46–60 | 46–58 |
| Fat | 0–12 | 0–12 | 0–12 |
| Solids | 30–43 | 30–43 | 30–43 |
| Water | 54–72 | 52–70 | 50–67 |

`VEGAN_TEMPERATURE_BAND_PROVENANCE` now records, in code and under test, which
cell rests on what:

- **−13 °C** — `externally_anchored`, `locked_pinguino_v0_1` (observed calibration anchor, V02).
- **−11 / −12 °C** — `internal_unconfirmed`, `locked_pinguino_internal_v0_1`
  ("derived from PINGUINO temperature logic — locked internal v0.1, not
  externally confirmed").

Nothing was removed and nothing was recalibrated. Future Vegan freezing work can
now replace these without ambiguity about which cell was ever observed.

## 10. Compatibility proof

| Check | Result |
| --- | --- |
| Mapper rows | **2088** |
| Mapper SHA-256 | `b13f5db4affd9c3be5ccbe59b40920053197a3697a3fa1bd4a859406e8baed38` — **unchanged** |
| VEGAN_VERIFIED | **1275** |
| VEGAN_FALSE | **784** |
| VEGAN_UNKNOWN | **11** |
| VEGAN_CONFLICT | **18** — remain fail-closed, none guessed into VERIFIED |
| Blocked by unknown enhanced metadata | **0** |
| Existing Vegan tests | **5 files / 35 tests PASS** — no expected value changed |
| Full suite | **574 files / 7198 tests PASS** |

Counts recomputed from the current branch with the real production
`assessMapperVeganEligibility`; they match the science audit's independent
recomputation exactly.

## 11. Coverage (measured, no paid call, no web call)

Across the **1275 VEGAN_VERIFIED** products:

| Signal | Count / share |
| --- | --- |
| Fat amount present | 1275 (100 %) |
| Protein amount present | 1275 (100 %) |
| Fibre amount present | 1275 (100 %) |
| Fat-bearing (> 0.5 %) | 414 |
| → fat class **EXPLICIT** | 116 |
| → fat class **DETERMINISTICALLY_INFERRED** | 87 |
| → fat class **UNKNOWN** | 211 |
| → **share known** | **49.0 %** |
| Protein-bearing (> 0.5 %) | 526 |
| → protein class **EXPLICIT** | 7 |
| → protein class **DETERMINISTICALLY_INFERRED** | 157 |
| → protein class **UNKNOWN** | 362 |
| → **share known** | **31.2 %** |
| Inulin identifiable | 29 |
| Starch identifiable | 118 |
| Oat matrix identifiable | 5 |
| **β-glucan explicit** | **0** |
| Hydrocolloid identifiable (known class) | 313 |
| Stabiliser present but identity unknown | 479 |
| Emulsifier evidence | 119 |

Fat functional classes among fat-bearing products: nut_fat_matrix 105,
lauric_solid_fat 45, liquid_vegetable_oil 26, mixed_plant_fat 20,
cocoa_butter_fat 7, unknown 211.
Protein sources among protein-bearing products: nut_or_seed 115, soy 31, rice 7,
oat 4, mixed 4, pea 2, chickpea 1, unknown 362.

**Enhancement depth across all 1275 VEGAN_VERIFIED products:**

| Level | Count |
| --- | --- |
| FULL_ENHANCEMENT | **263** |
| PARTIAL_ENHANCEMENT | **315** |
| BASELINE_FALLBACK | **697** |
| **BLOCKED_DUE_TO_ENHANCED_UNKNOWN** | **0** |

Protein-class coverage at 31.2 % is the binding constraint the audit predicted:
more than two thirds of protein-bearing products fall back to baseline, which is
precisely why a gating architecture was rejected and an additive one built.

## 12. Validation fixtures (V1–V7)

`src/features/vegan-structure/veganScienceValidationFixtures.test.ts` — five
qualitative/architectural holdouts and two mechanistic-only fixtures.
**Zero numeric calibration fixtures**: Gellatti is never asked to reproduce a
process-dependent overrun, melting rate or hardness value.

| ID | Source | What is asserted |
| --- | --- | --- |
| **V1** | DOI 10.1002/fsn3.4494 | rice / pea / soy are all three distinguished at matched protein; the trial's numbers are **not** encoded as coefficients |
| **V2** | DOI 10.1111/ijfs.16493 | sunflower and coconut separate at identical fat %; the fat class carries **no** additive modifier (the coalescence direction reverses) |
| **V3** | DOI 10.1016/j.foohum.2025.100557 | the same class is reported at 4 % and 10 % soy protein — no universal optimum is ever derived |
| **V4** | DOI 10.1007/s13197-022-05507-z | four fat families are distinguishable qualitatively, with no SFC curve |
| **V5** | DOI 10.1111/jtxs.70035 | **negative control**: the derived behaviour exposes no ice, NPAC, crystal-size, freezing or cryoscopic output at all |
| **V6** | DOI 10.1016/j.lwt.2018.03.010 | inulin is outside the hydrocolloid taxonomy; the paper's dosage windows are **not** transferred |
| **V7** | DOI 10.3390/molecules28072924 | no β-glucan term: an oat identity never yields a β-glucan class; only a stated quantity is accepted |

## 13. MyGelato holdout

MyGelato remains an external behaviour reference only. **No MyGelato coefficient,
POD, PAC, NPAC or raw-ice value entered Gellatti.** The useful assertion is
satisfied: Vegan v2 *does* internally distinguish functional fat and protein
source classes where authoritative evidence exists — the axis on which the
MyGelato balance-metric view was demonstrably blind — while matching MyGelato is
neither attempted nor required.

## 14. Optimizer integration (§12)

One seam, in `applyPipeline.ts`, at the accepted-candidate ranking:

```ts
accepted.sort(
  (left, right) =>
    right.score - left.score ||
    compareVeganStructuralCandidates(left.executableInput, right.executableInput),
);
```

- Every candidate in `accepted` is at the **same Main allocation** (Main lines are
  locked for that frontier step), so Main grams and Multi-Main ratios cannot move.
- The comparator is consulted **only** after an exact technical-score tie.
- It returns `0` for every non-Vegan profile and whenever **either** side's
  structural evidence is `UNKNOWN` — an unknown side never loses.
- It cannot reject: a structurally weaker but legal candidate stays legal and
  stays available.

## 15. Rescue integration (§17)

`rescueIngredientAdvisor.ts` keeps its VEGAN_VERIFIED-only candidate authority,
its simulation-only contract, its `MAX_RESCUE_CANDIDATES = 4` bound and its
material-improvement evidence rule verbatim. The only addition: when two
recommended candidates reach the **same** Direction axes at the **same**
remaining distance (≤ 1e-9), the structurally stronger executable projection
wins. Nothing is auto-added; `VEGAN_UNKNOWN` / `VEGAN_CONFLICT` / `VEGAN_FALSE`
are never proposed.

## 16. No-blocking proof

The derived layer is not an input to eligibility, to any hard band or to any
dosage authority — it cannot block by construction. That is asserted three ways:

1. over all **2088** Mapper rows: products blocked by unknown enhanced metadata = **0**;
2. at runtime: a product with `fat.evidence === 'UNKNOWN'` and
   `protein.evidence === 'UNKNOWN'` produces **no** eligibility issue;
3. by identity: `VEGETABLE FAT PREPARATION` (unknown class) and
   `REFINED COCONUT OIL` (known class) with identical composition produce
   **byte-identical** engine results, percentages and violation lists.

## 17. Representative recipe matrix (§25)

14 cases, all deterministic, all eligibility-clean, covering −11 / −12 / −13 and
both OPTIMAL and ECO:

| | Case | Derived system |
| --- | --- | --- |
| A | neutral baseline | inulin + tara, no fat/protein class |
| B | coconut-fat | `lauric_solid_fat` / coconut |
| C | liquid sunflower-oil | `liquid_vegetable_oil` / sunflower |
| D | cocoa-butter | `cocoa_butter_fat` |
| E | soy-protein | `functional_plant_protein_isolate` / soy |
| F | pea-protein | `functional_plant_protein_isolate` / pea |
| G | rice-protein | `functional_plant_protein_isolate` / rice |
| H | oat-matrix | `oat_matrix`, no β-glucan |
| I | pistachio / nut | `nut_fat_matrix` |
| J | mixed fat system | `mixed_plant_fat` / mixed |
| K | unknown-fat-class fallback | fat class UNKNOWN → baseline |
| L | unknown-protein-class fallback | protein class UNKNOWN → baseline |
| M | Multi-Main 1:1 | ratio preserved, no 0 g executable row |
| N | Multi-Main 2:1 | ratio preserved, no 0 g executable row |

B vs C: identical engine proof, different structural class.
B vs K: identical engine proof, class UNKNOWN, no added violation.
M / N: `buildOptimizePreview` returns `ok`, Main identity and ratio weights
`[1,1]` / `[2,1]` preserved, zero 0 g rows.

The assessment is also **temperature-independent** — proof that it can never act
as an ice or NPAC modifier.

## 18. Tests

| File | Tests |
| --- | --- |
| `src/features/vegan-structure/deriveVeganBehavior.test.ts` | 25 |
| `src/features/vegan-structure/veganStructureAssessment.test.ts` | 14 |
| `src/features/vegan-structure/veganEngineV2Invariants.test.ts` | 14 |
| `src/features/vegan-structure/veganScienceValidationFixtures.test.ts` | 11 |
| `src/features/vegan-structure/veganOptimizerIntegration.test.ts` | 7 |
| `src/features/vegan-structure/__audit__/veganCoverageV2.audit.test.ts` | 5 |
| **Total focused** | **6 files / 76 tests PASS** |

### The 15 critical invariants (§26)

| # | Invariant | Where asserted |
| --- | --- | --- |
| 1 | unknown enhanced metadata never blocks VEGAN_VERIFIED | invariants + coverage audit (0 over 2088 rows) |
| 2 | baseline numerical legality stable | assessment tests (identical engine proof) + full suite |
| 3 | known fat class changes structural assessment | assessment tests (coconut vs sunflower) |
| 4 | known protein source changes structural assessment | assessment tests (soy / pea / rice) |
| 5 | inulin ≠ hydrocolloid replacement | classifier + assessment + V6 |
| 6 | oat matrix not blindly reduced | classifier + V7 |
| 7 | no invented β-glucan amount | classifier + coverage audit (0) + V7 |
| 8 | no invented SFC curve | invariants (source guard) + V2/V4 |
| 9 | ProductBehavior unchanged | invariants (source guard: no import, no shadow) |
| 10 | Main unchanged | invariants (Multi-Main preview) |
| 11 | Multi-Main ratios unchanged | invariants (1:1 and 2:1) |
| 12 | Rescue remains VEGAN_VERIFIED-only | invariants (`rescueCandidateFamily`) |
| 13 | no 0 g executable rows | invariants (Multi-Main preview) |
| 14 | no Mapper mutation | invariants (SHA-256 pin + no-write guard) |
| 15 | deterministic same input → same VeganBehavior | classifier + assessment + whole-Mapper replay |

## 19. Full validation (one complete pass)

| Command | Result |
| --- | --- |
| `npm test` | **574 files / 7198 tests PASS** (exit 0) |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 — 0 errors, 2 pre-existing warnings |
| `npm run build` | exit 0 |
| `npm run products:audit` | exit 0 — mapper SHA `b13f5db4…` |
| `npm run mapper:runtime-audit` | exit 0 — 2088 active, reports unchanged |
| `npm run process:validate` | exit 0 — 2088 rows, 0 alignment differences |
| `npm run catalog:mapper-only:validate` | exit 0 |
| `npm run production-rescue:bundle-check` | exit 0 — `ca0d47f4…` |
| `git diff --check` | clean |

## 20. Runtime files changed

**New (7 runtime + 6 test):**

- `src/features/vegan-structure/veganBehaviorTaxonomy.ts`
- `src/features/vegan-structure/veganBehaviorFacts.ts`
- `src/features/vegan-structure/deriveVeganBehavior.ts`
- `src/features/vegan-structure/veganBehaviorRuntime.ts`
- `src/features/vegan-structure/veganStructureAssessment.ts`
- `src/features/vegan-structure/index.ts`
- `src/engine/config/veganFreezingAuthority.ts`

**Modified (6):**

- `src/engine/config/iceAnchors.ts` — extracted `resolveIceAnchorRows` + `ICE_ANCHOR_CATEGORY_FALLBACK` (behaviour identical)
- `src/engine/iceFraction.ts` — uses the named seam instead of the inline rule (behaviour identical)
- `src/engine/index.ts` — exports the provenance API
- `src/engine/__fixtures__/allowedEngineFunctions.ts` — 3 new allowlisted exports
- `src/features/constraint-studio/applyPipeline.ts` — one tie-break at the accepted-candidate sort
- `src/features/constraint-studio/rescueIngredientAdvisor.ts` — one tie-break at equal axes and equal distance

**Regenerated (3):** `supabase/functions/_shared/generated/productionRescueEngine.{bundle.mjs,manifest.json,metadata.mjs}`
— `iceFraction.ts` sits inside the Production Rescue Edge source closure, so the
bundle was rebuilt deterministically. The **source closure is unchanged at 53
files** (no governed closure change); only the extracted function moved.
New bundle hash `ca0d47f47c8467b7a73c7a8641ae738b1c90f24c17ce68e2f04261fcafb15eca`
(261 846 bytes). **Integration action:** the Production Rescue Edge function needs
a redeploy whenever this branch reaches an environment.

## 21. Deliberate deferrals

- **Monitor / UI (§28).** No Monitor change was made. Feeding derived structural
  truth into `Tłuszcz i kremowość` / `Białko i struktura` / `Stabilność i ryzyka`
  is possible and safe at the model level, but the owner has pending work on
  LIVE CURRENT SCORE / BEFORE-AFTER / continuous Direction scoring (§29), and a
  parallel agent is modifying staging. The assessment is fully tested and ready
  to be consumed; wiring it into a domain surface is a separate, one-file task.
- **Score (§11, §29).** No Score formula, weight or submetric was touched.
  Vegan v2 provides truthful domain inputs only.
- **Shared thermodynamic freezing core (audit V2 candidate).** Deferred, as the
  audit recommends: Vegan needs its own composition parameters and a matrix
  guard before it may borrow the Sorbet solver's core. The interface boundary
  now exists so this can be done independently.

## 22. Unresolved science items (owner decisions, unchanged by this task)

1. **Vegan −11 / −12 NPAC and ice bands** are enforced with the same authority as
   the externally anchored −13 cell while the code records them as "not
   externally confirmed". Now labelled truthfully in
   `VEGAN_TEMPERATURE_BAND_PROVENANCE`; still enforced identically. Owner call:
   accept them explicitly as owner-set targets, or downgrade them to preferred.
2. **Vegan ice via the dairy `milk_gelato` fallback.** Now isolated, labelled
   `baseline_legacy_calibrated` and never claimed as plant validation. Owner
   call: accept explicitly, or commission Vegan anchor rows
   (`hasOwnPlantValidatedVeganIceAuthority` is the single gate).
3. **18 VEGAN_CONFLICT products** — fail-closed today, nothing unsafe, worth a
   review pass.
4. **Protein-class coverage at 31.2 %** is the binding coverage constraint. It
   can only rise with better canonical identity data, never with a guess.

## 23. Provenance note

`reports/VEGAN_SCIENCE_AUTHORITY_V2.md` is included in this branch **byte-identical**
(SHA-256 `5f29995980c2f92630391d1731b8324c61709574788077fd241dbc64cff96281`) to the
copy on `claude/vegan-science-authority-v2` (`cebfea0`), so this implementation is
self-contained. If that branch is integrated first, the file merges without conflict.

---

**NO MAPPER BASE CHANGE · NO STAGING PUSH · NO STAGING DEPLOY · NO PRODUCTION DEPLOY**
**NO VEGAN_VERIFIED PRODUCT BLOCKED DUE TO MISSING ENHANCED METADATA**
