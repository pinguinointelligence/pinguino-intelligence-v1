# PINGÜINO Vegan Gelato Engine

Status: **PARTIAL — runtime profile implemented, scientific/data blockers explicit**

This document describes the canonical `vegan_gelato` profile implemented on
`codex/vegan-gelato-final`. It is a creamy plant-based frozen-dessert profile.
It is neither dairy Gelato with milk removed nor Sorbet renamed as Vegan.

## Product contract

- Internal category: `vegan_gelato`.
- Customer label: `Wegańskie`.
- Native temperatures: −11°C, −12°C and −13°C.
- Separate recipe-specific routes: neutral, fruit, nut paste, cocoa and
  Multi-Main fruit.
- Plant protein is optional. No dairy-protein minimum is inherited.
- Standard Gelato and Sorbet routing, targets and formulas remain unchanged.

## Fail-closed Vegan ingredient gate

Mapper rows are classified as one of:

- `VEGAN_VERIFIED`: `vegan=true`, active, Engine-approved and a Verified source,
  with no contradictory animal composition or identity evidence;
- `VEGAN_FALSE`: explicit `vegan=false` or meaningful animal evidence;
- `VEGAN_UNKNOWN`: insufficient reliable positive evidence;
- `VEGAN_CONFLICT`: reliable positive Vegan metadata contradicts meaningful
  animal evidence.

`dairy_free=true`, an empty allergen field, or a Vegan-looking product name is
not sufficient evidence. Precautionary allergen text alone does not negate an
otherwise verified composition because the current Mapper schema cannot always
separate cross-contact wording from composition. Category, identity and numeric
milk-fat/milk-solids/lactose evidence do negate it.

Auto-formulation and trustless Apply accept only `VEGAN_VERIFIED`. The gate is
performed both before Preview and again inside `VerifiedApply`, so a forged or
stale Preview cannot insert an unverified ingredient.

Mapper v1.0 audit (pinned by test):

| State | Count |
|---|---:|
| VEGAN_VERIFIED | 1001 |
| VEGAN_FALSE | 793 |
| VEGAN_UNKNOWN | 278 |
| VEGAN_CONFLICT | 11 |

The exact conflict ids are recorded in `VEGAN_CALIBRATION_LEDGER.md` and in the
eligibility regression test.

## Bounded verified formulation pool

The runtime does not scan arbitrary Mapper rows while solving. It uses a small,
role-filtered pool mirrored exactly from Mapper v1.0 and pinned field-by-field:

- oat drink `PI-ING-001565`;
- rice drink `PI-ING-001566`;
- almond drink `PI-ING-001587`;
- refined coconut oil `PI-ING-000163`;
- sunflower oil `PI-ING-000305`;
- pea protein `PI-ING-000451`;
- rice protein `PI-ING-000452`.

Canonical water, sucrose, dextrose, inulin and Tara identities are also accepted.
Mapper 2088 adds verified, engine-approved soy candidates. Automatic Soy
formulation remains restricted to the exact reviewed canonical IDs in the
verified Vegan toolbox; semantic name matching is forbidden. The
invalid `soya sauce` reference is deliberately ignored. Mapper coconut-milk rows
used by the external examples are `vegan=false`/`dairy_free=false`; they are not
silently relabelled or auto-used.

## Functional roles

The profile routes these real functional roles where relevant:

- water/carrier;
- verified plant beverage;
- verified plant fat;
- optional plant protein;
- sucrose;
- dextrose/freezing control;
- inulin/fibre/body;
- verified exact-identity stabilizer;
- Main fruit, nut paste, cocoa or multiple Main ingredients.

When Gelato is changed to Vegan, incompatible lines are reported rather than
deleted. A bounded adapter may recommend oat drink for a primary dairy liquid,
coconut oil for dairy fat, or pea protein for milk-solids structure. These are
candidate roles only, never 1:1 replacements; a fresh Vegan formulation Preview
is required.

## Dairy logic disabled for Vegan

The existing Vegan product profile omits dairy-positive requirements for:

- milk fat and animal fat;
- lactose;
- milk-solids/MSNF/SMMBC;
- dairy protein share;
- cream, skimmed milk powder and whey corrections.

Animal fat remains zero as a consequence of ingredient eligibility, not as a
creaminess target. Tests prove low-protein neutral Vegan and optional pea/rice
protein recipes both pass without a dairy gate.

## Native technical target profiles

These are the existing immutable Engine hard bands used for safety. This work
did not modify `TARGET_BANDS` or any Engine formula.

| Temp. | POD | NPAC | Ice % | Fat % | Solids % | Water % |
|---|---|---|---|---|---|---|
| −11°C | 13–25 | 35–52 | 45–61 | 0–12 | 30–43 | 54–72 |
| −12°C | 13–25 | 44–59 | 46–60 | 0–12 | 30–43 | 52–70 |
| −13°C | 13–25 | 50–64 | 46–58 | 0–12 | 30–43 | 50–67 |

The temperature regulator's Vegan texture bands/clean centers are:

| Temp. | Regulator NPAC band | Clean center | Evidence |
|---|---|---|---|
| −11°C | 35–52 | 40–47 | internal derivation; not externally confirmed |
| −12°C | 44–59 | 48–54 | internal derivation; not externally confirmed |
| −13°C | 50–64 | 53.5–60 | anchored by the V02/external Vegan references |

### Temperature derivation

The −13°C flavor-specific references are the starting seeds. Temperature is
adapted through the observed sucrose↔dextrose freezing direction while keeping
the Main recipe structure fixed:

- −13°C: reference sucrose/dextrose allocation;
- −12°C: move up to 50 g from dextrose to sucrose;
- −11°C: move up to 90 g from dextrose to sucrose.

This uses the real ingredient-specific POD/PAC/NPAC formulas. It is not a
gram-for-gram sugar equivalence. Every proposed recipe is then evaluated against
the immutable native bands. Runtime snapshots prove NPAC is monotonic for every
implemented family: `NPAC(−11) < NPAC(−12) < NPAC(−13)`.

The −11/−12 recipes are internally coherent and regression-locked, but still
require owner production validation. They must not be represented as external
sensory calibration.

## Flavor routing

The recipe selector examines canonical Main roles:

- no recognized Main → neutral;
- one fruit Main → fruit;
- one nut-paste Main → nut;
- one cocoa Main → cocoa;
- more than one Main, all fruit → `mixed_main`;
- more than one Main, all nut or all cocoa → the matching role-specific strategy;
- heterogeneous Main roles → unsupported (never silently routed through a fruit seed).

There are 15 explicit runtime templates (five strategies × three temperatures).
No strategy falls back to Standard Gelato or Sorbet. Main identity is retained.
For Multi-Main, the canonical common-ratio contract is verified again at Apply;
1:1 and 2:1 fixtures remain exact.

## Stabilizer logic

Tara `PI-ING-000492` carries an approved Mapper dosage window of 0.2–1.0% of
total mix. All 1000 g final fixtures contain 2.000 g Tara, exactly the lower
bound. A floating-point epsilon fix makes the mathematical boundary stable; it
does not change dosage science.

The solver temporarily holds an inherited stabilizer dose during iteration so
normalization cannot erode it. Preview and trustless Apply independently reject:

- missing stabilizer;
- a verified stabilizer below or above its own exact-identity window;
- an unregistered stabilizer without an approved window.

PINGÜINO therefore does not copy MyGelato's 0 g pistachio result.

## Scoring, constraints and Apply

The displayed technical score is the existing native technical-fit score. A
score of 10 means no native Vegan hard-band violation and no fallback; it is not
a Recipe Direction sensory score.

Before Preview and again at Apply, the profile preserves:

- exact target batch;
- exact locks/exclusions;
- canonical identity/deduplication;
- Main identity and Multi-Main ratio;
- Vegan eligibility;
- approved stabilizer dosage;
- a bounded inulin calibration envelope;
- native Engine hard safety.

The inulin maximum is 8.31% only as a fail-closed envelope derived from the
highest owner-supplied external Vegan reference (83.1 g/1000 g). It is not a
universal inulin dosage recommendation. A solver candidate outside this envelope
is retained only for diagnosis and cannot become Preview/Apply.

## Base Engine scientific boundary

No changes were made to calculateRecipe, POD, PAC, NPAC, water, ice, fat,
protein or sugar formulas. The only change under `src/engine` is optional
metadata provenance on `EngineIngredientFlags`; it does not participate in
calculation.

The existing stabilizer epsilon repair is a proven numerical boundary fix in a
feature constraint module, not a scientific model change.

## Known limitations and explicit blockers

1. **FP/T50 unavailable.** The current Engine has no implemented freezing-point
   or 50%-frozen-water result fields/model. These values are not fabricated.
2. **Direction Targets unavailable in this branch.** The separate canonical
   target contract was not merged. Sweetness shift calibration is unapproved;
   sensory creaminess and flavor intensity are blocked by science/data. The
   technical 10/10 must not be presented as those target semantics.
3. **Soy unavailable.** Mapper v1.0 has no verified Engine-approved soy drink.
4. **High-water rescue blocked.** The solver found a native-safe mathematical
   candidate but it used 211.137 g inulin and 1.442 g Tara; the profile correctly
   withholds Preview/Apply. No honest safe rescue is currently proven.
5. **−11/−12 external validation pending.** Runtime behavior is derived from the
   canonical regulator and proven monotonic, but the bands are internally
   calibrated rather than externally confirmed.
6. **Substitution interaction is adapter-only.** Candidates and diagnostics are
   available to the existing blocked panel; an owner selection interaction is
   not invented as part of this Engine task.

These blockers are why the final status is PARTIAL rather than production
science-complete.
