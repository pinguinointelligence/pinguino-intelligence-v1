# CROWN_OFF_INCOMPATIBLE_MULTI_MAIN_SAFETY_GAP

**Status:** OPEN — recorded, not fixed. Deliberately excluded from PR #93
(owner instruction, 2026-09-02).
**Severity:** P2. Narrower than the primary Crown-OFF gap that #93 closed, but it
is the same class: an absolute safety rule that does not run.

## What #93 fixed, and what it did not

PR #93 moved the absolute safety band (Main hard limit + approved liquid dairy
carrier floor) off the Crown toggle and onto Main CAPABILITY, engaging once the
canonical group equivalent share reaches the published `eco_floor_percent`.

It carries a deliberate **complete-or-nothing** guard: if any Main-capable line
in the recipe is user-held/uncalibrated, or a multi-Main group has no derivable
combined envelope, the band SKIPS and pre-#93 behaviour stands.

That guard exists because the first implementation regressed an accepted Protein
contract: the capability group saw only the calibrated member (banana, 35.2%)
while its uncalibrated sibling (cranberry) was invisible, and judged banana
against its own SINGLE-product hard limit of 17.1%. Judging a partial Main group
against a single-product envelope manufactures a violation no published policy
supports. The guard is correct — but it leaves this residual.

## The residual

`resolveMultiMainEnvelope` returns `null` when Main bases/families are genuinely
incompatible. In that case `mainGroupFacts` returns `null` and the safety band
returns `[]`.

| | Crown ON | Crown OFF |
|---|---|---|
| incompatible multi-Main families | refuses with `multi_main_policy_unknown` | **nothing enforced** |

So two or more UNCROWNED Main-capable products from incompatible families can
still, in principle, exceed a hard limit or starve the carrier without any Main
safety rule running. Crown ON already fails closed on the same recipe.

The same skip applies when a Main-capable line is user-held/uncalibrated
(`MAIN_CAPABLE_UNCALIBRATED`), since that product publishes no envelope numbers
to enforce.

## Not reproduced served

This is a code-path residual identified during the #93 forensic. It was NOT
reproduced on staging: the owner's served case is a single calibrated Main
(`PI-ING-001553`), which #93 does close — proven served on
`8b7244eb` (see the served ledger in that PR).

## Why it was not fixed in #93

Closing it means deciding what the combined envelope IS for incompatible
families — i.e. inventing a combination rule where the published policy set
provides none. Candidate approaches, none authorised:

1. Use the **minimum** `hard_limit_percent` across members as a conservative
   bound. Simple and fail-safe, but it is a new rule, not a published number.
2. Refuse outright (`multi_main_policy_unknown`) with Crown OFF as well. Safest,
   but it changes accepted Crown-OFF behaviour for every incompatible-family
   recipe, including ones customers may have saved.
3. Require calibration before a Main-capable line may exceed the engagement
   threshold at all. Cleanest semantically, largest blast radius.

Each needs its own owner decision, its own blast-radius measurement and its own
served QA — which is why it is recorded here rather than bundled.

## Do not claim

**CROWN OFF SAFETY is NOT fully frozen** while this is open. The primary gap is
fixed and served-proven; this narrower path is not.
