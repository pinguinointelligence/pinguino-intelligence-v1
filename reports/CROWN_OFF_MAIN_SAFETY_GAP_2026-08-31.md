# CROWN-OFF MAIN SAFETY GAP — separate safety-authority defect

**Status:** OPEN — recorded, not fixed. Deliberately excluded from the Crown MAX
fix (owner instruction, 2026-08-31 §4).
**Severity:** P0 safety authority. A published `hard_limit_percent` can be
exceeded by ~30 percentage points with a clean 10/10 result.

## Served evidence

Saved recipe `CROWN-391` (`saved_recipes.id f6c53aba-5aeb-4c35-a46c-7dcf4bcf8ae0`),
Gelato / Ninja CREAMi Deluxe / 670 g / OPTIMAL / STRAWBERRIES `PI-ING-001553`.
All three versions sum to exactly 670 g and carry `formulation_strategy: optimal`.

| v | time (UTC) | STRAWBERRIES | `lock_type` | anchor | % of 670 | MILK 3.5% | carrier % |
|---|---|---|---|---|---|---|---|
| 1 | 18:29:39 | 214 g | `main` (Crown ON) | — | 31.94 % | 201 g | **30.00 %** |
| 2 | 18:30:22 | 300 g | `unlocked` | 300 | 44.78 % | 70 g | 10.45 % |
| 3 | 18:37:30 | **391 g** | `unlocked` | 450 | **58.36 %** | 2 g | 0.30 % |

Published authority for this product — `product_behavior_policy_versions`,
`main-berry-fresh-dairy` **v2, published**, `milk_gelato`, basis
`FRUIT_EQUIVALENT`, equivalent factor 1:

| bound | percent | at 670 g |
|---|---|---|
| `eco_floor_percent` | 25 | 167.5 g |
| `optimal_ceiling_percent` | 35 | 234.5 g |
| `hard_limit_percent` | **45** | **301.5 g** |
| `liquid_dairy_carrier_floor_percent` | 30 | 201 g |

v3 exceeds the hard limit by 13.4 points (89.5 g) and holds 0.30 % carrier
against a 30 % floor, yet is accepted.

## Exact reason the hard Main limit disappears when Crown is OFF

`src/features/product-intelligence/mainEnvelope.ts`, `verifyMainEnvelope`:

```ts
const mains = input.recipe.items.filter(
  (item) => item.lock_type === 'main' && !technicalOnlyMainLineIds.has(item.id) && !userHeld.has(item.id),
);
if (mains.length === 0) {
  return { ok: true, equivalentPercent: null, targetPercent: null, hardLimitPercent: null, policyId: null };
}
```

With Crown OFF no line carries `lock_type === 'main'`, so `mains` is empty and
the function returns **`ok: true` with every field null** before any of the three
limits is evaluated. `verifyMainTechnicalCarrier` fails open the same way: it
derives `dairyFloor` only from `lock_type === 'main'` lines and returns `[]` when
there are none.

**The whole Main envelope — floor, preference ceiling, hard limit and the liquid
dairy carrier rule — is scoped to the Main ROLE, and a product only holds that
role while Crown is ON.** Nothing re-checks a Main-capable ingredient that is
merely present at 58 % of the batch. The score authority therefore reports 10/10
truthfully: it never consulted the Main policy.

A second, narrower carve-out sits on the same line: `!userHeld.has(item.id)`
skips the envelope for `MAIN_CAPABLE_UNCALIBRATED` products
(`mainCapability.ts`: `userHeld: state === 'MAIN_CAPABLE_UNCALIBRATED'`). That
one is documented (GLOBAL MAIN AUTHORITY §6/§21) and is a calibration fact, not
an anchor effect — it is not the cause here, because `PI-ING-001553` resolves
`MAIN_CAPABLE` / `EXACT_PRODUCT`.

## Why this is NOT evidence for a higher Crown maximum

v3's 391 g escaped the Main authority entirely; it is not proof that a safe MAX
must reach 391 g. Crown MAX stays bounded by `hard_limit_percent`. Recorded
explicitly so a later reader cannot mistake 391 g for a feasibility witness.

## Owner semantics to preserve

- Crown OFF → the current/user grams are the ANCHOR: stay as close as safely
  possible. "Anchor" must not mean "bypass a hard safety limit".
- Crown ON → maximize to the hard safety frontier (fixed under GEL-P0-027).

## Smallest future fix surface

Evaluate the hard safety limit and the carrier rule from **product capability**
rather than from the Crown toggle:

1. `mainEnvelope.ts` — split the envelope into
   - a **role-scoped sensory band** (floor + OPTIMAL preference target), which
     legitimately applies only while Crown is ON, and
   - a **capability-scoped safety band** (`hard_limit_percent` + liquid dairy
     carrier), evaluated for every line whose snapshot resolves
     `MAIN_CAPABLE` / `MAIN_PROFILE_SPECIFIC`, Crown ON or OFF.
   Concretely: in `verifyMainEnvelope`, replace the blanket
   `if (mains.length === 0) return ok` early return with a fall-through that
   still runs the safety band over Main-capable lines; and in
   `verifyMainTechnicalCarrier`, derive `dairyPolicies` from Main-capable
   snapshots instead of `lock_type === 'main'` lines.
2. No policy percentages change.
3. Regression: the served v3 vector (391 g / 58.36 % / carrier 0.30 %) must fail
   closed with `main_above_hard_limit` **and** `liquid_dairy_carrier_below_floor`
   while `lock_type` stays `unlocked`; and a Crown-OFF anchor at or below the
   hard limit must still be honoured unchanged.

Expect this to change existing accepted behaviour for Crown-OFF drafts, so it
needs its own owner decision and its own served QA — which is why it is not
bundled with the Crown MAX fix.
