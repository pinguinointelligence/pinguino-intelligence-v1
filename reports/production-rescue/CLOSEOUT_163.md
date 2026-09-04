# Production Rescue closeout — the final merged behaviour (#163)

**This report, not the PR description, is the technical authority for what shipped.**
The PR body describes an intermediate `alreadyAuthorized` approach that was rejected by
the owner and replaced before merge; the merged tree also carries follow-up work
(a durable supersession audit migration, store and Edge `logic.ts` changes, and a
`.fixture.ts` renaming) that the PR body predates.

Merged as `3149f3456485ef54bd713de2635635beb5489a80` on `staging`, 2026-09-04 18:52:02Z.
Production/`main` untouched at `0a523544`.

## The defect

Durable run `2fc85403-2394-4582-a211-4736bfc4ef8e`: BANANA planned 300 g, weighed 345 g.
Rescue was authorized and stored at 1149.9 g. Every reload then ended in
„Nie udało się odzyskać partii". The run was still `in_progress` with `completed_at` NULL,
so completion was never reached — the failure was **durable recovery**.

The swallowed exception, proven by execution:

```
Grupa Main przekracza twardy limit 30.0%.
```

Support lines were scaled by k = 1.15 (700 → 805 g) so BANANA would sit at exactly 30 %,
its published hard limit. Two land on a half tenth and round DOWN
(`(113*1.15).toFixed(1)` = `"129.9"`, `(55*1.15).toFixed(1)` = `"63.2"`), so support was
804.9, the denominator 1149.9 instead of 1150.0, and `345 / 1149.9` = **30.0026 %**.

**Structural cause — two authorities judging one candidate.** Build/authorization gated on
`assessProductionHardSafety` (engine violations, machine capacity, native profile), which
never consults the Main envelope. Recovery re-validated through
`evaluateRecipeConstraintAuthority` (BATCH_RESCUE), which does. So a candidate could be
persisted in a state only its own recovery path rejects.

## What shipped

**1. One terminal authority, at practicalization.** `assessProductionRescue` runs the
canonical `evaluateRecipeConstraintAuthority` on the **practicalized 0.1 g vector** — the
thing that actually gets persisted and re-validated forever after. A failing candidate is
skipped and the bounded add-only search continues to the next practical target. Because
`productionRescue.ts` is inside the Rescue Edge bundle, App and Edge share the identical
gate by construction.

**2. Recovery supersedes; it never blesses and never strands.**
`hydrateProductionSessionFromRun` re-judges a durably accepted rescue with that same
authority. Valid → reconstruct as before. Invalid → keep every physical gram (restored
from the durable actuals), keep the authorization as audit in `supersededRescue`, and do
**not** adopt its target, so the deviation flow recomputes an add-only rescue from the
current vessel through the gate above. `applyVerifiedRescueInput` always validates; the
`alreadyAuthorized` escape hatch does not exist in the merged tree.

**3. Durable supersession audit.** `20260904173339_production_rescue_supersession_audit.sql`
patches `production_apply_rescue_v1` so a new valid snapshot records
`supersededRescueRevision` / `supersededRescueAcceptedAt`, naming the authorization it
replaces. Append-only: the old authorization and event rows stay as evidence and physical
actuals are untouched.

**4. Fixture fidelity.** The earlier "14 tests failed" was not evidence about where the
authority belongs — every failure was a fixture that cannot model Production:
four session factories supplied no `plannedComposition` at all (`behaviorSnapshots: {}` →
`product_behavior_invalid`); `productBehaviorTestSnapshots` cannot know server-resolved
Main policies, so BANANA arrived with `hardLimitPercent: null` and was blocked as
uncalibrated; no line was marked an approved liquid dairy carrier, so a Main requiring one
was refused; and `productionRescueEdgeAuthorization` used `{ schemaVersion, lineId }` stubs
with no `moduleEligibility`, which crashed the authority outright. Repaired in
`productionTestComposition.fixture.ts` from the real persisted run. **No policy is
invented**: a Main with no published calibration is modelled as
`MAIN_CAPABLE_UNCALIBRATED`, a real supported state.

**The tara scare was not tara.** Measured on the real scenario, tara is 3 g against a band
max of 5 g in both candidates (1007 g and 1044.5 g) — legal. Those tests were failing on
the BANANA policy and carrier gaps. Genuine `aggregate_above_maximum` refusals occur only
in other scenarios at larger batches, where the search continues past them; the band is
proportional (`floor(batch × 0.5 %)`), so add-only growth raises the ceiling. No stabilizer
science changed. No Main limit, PAC/NPAC, Engine band, ProductBehavior, capacity rule or
Mapper entry changed.

## Served proof — the owner's own run, on the fixed build

| | pre-fix | post-fix |
|---|---|---|
| status | `in_progress` | **`completed`** 18:57:19Z |
| actual_revision | 8 | 15 |
| rescue_revision | 1 | 2 |
| events | 37 | 65 |
| completion snapshot | — | present (1) |

The candidate transition, from the durable event log:

| time | rev | option | finalMassG | BANANA % |
|---|---|---|---|---|
| 16:19:04Z | 1 | `restore_original_recipe` | 1149.9 | 30.0026 — refused on reload |
| 18:56:01Z | 2 | `restore_original_recipe` | **1150.1** | **29.9974 — accepted** |

Accepted vector: MILK 492.2, CREAM **130**, SMP 46, SUCROSE 69, DEXTROSE **63.3**,
TARA 4.6, BANANA 345. CREAM and DEXTROSE keep the 0.1 g that rounding used to give away.
The final actual vector equals that plan exactly, so every top-up executed. The
`rescue_applied` / `rescue_accepted` events for revision 2 carry
`supersededRescueRevision: 1`, `supersededRescueAcceptedAt: 2026-09-04T16:19:04.947269Z`.

## App/Edge parity

Probed live against the deployed staging function (a deliberately wrong expected SHA, which
the function rejects **before** any DB access — nothing mutated):

```
app  PRODUCTION_RESCUE_BUNDLE_SHA256 = 177c39a8509cee98f1b27d12f571d5a68ec0d7b0cddf433d14c097602db89878
edge actualEngineBundleSha256        = 177c39a8509cee98f1b27d12f571d5a68ec0d7b0cddf433d14c097602db89878   MATCH
```

`production-rescue-authorize` v27, `verify_jwt: true`, project `tunabqqrwabacxjcxxkz`.
Source closure `61e879e9e7070bc3b581881050f29a3920ae2ca0a0408d693bdea58696dbc082` is declared
by the same generated metadata module that reported the matching bundle SHA; it was inferred
from that, not probed independently. `production-rescue:bundle-check` passes and the
committed bundle hashes to exactly the declared value (351010 bytes).

## Regression cover

`productionRescueHydrationAuthority.test.ts` (12 cases) pins, on the real numbers:
the 1149.9 g candidate is over the limit by rounding alone; the Main envelope refuses it;
removing the lost 0.1 g is the whole difference; the exact thrown message; the build-time
gate does not see the violation; a NEW rescue carrying it is refused; recovery supersedes
rather than stranding or blessing; and the **B/C transition** — candidate N (1149.9 g)
refused, candidate N+1 (1150.1 g) accepted by the same authority, inside the hard limit,
at or above the derived minimum legal batch, and reopenable by recovery. Both vectors are
concrete, so no assertion can pass vacuously.

`productionRescueSupersession.migration.test.ts` covers the durable audit.

## Not covered here

A fresh end-to-end served Banana run with the numbered screenshot set was not completed in
this pass; the evidence above is the owner's real run recovering and completing on the
fixed build, which exercises the same path on real data.
