# NAPRAWA 1B — BOUNDED BEST-LEGAL SEARCH

Owner decision of 2026-09-19, **Variant B**. This file records what the decision changed,
what was built, what it measures, and what is still open. It supplements — and does not
replace — `P1-S-closure.md`, which recorded the conflict that this decision resolved.

## 1 · The decision, and what it does NOT license

The exact projection and the solver's own answer are the **fast, preferred first path**.
They are no longer the winner by construction. If a **legal** candidate sits strictly
nearer the requested Direction target in the same admissible space, that candidate is
published.

Variant B is **not** "find something at any price". These remain hard and are re-checked
on every challenger, with nothing relaxed:

user locks · Main / Crown authority and envelope · min/max ingredient constraints ·
profile constraints · machine and process constraints · the batch target ·
practicalization · the save gate · production eligibility · every owner-locked safety
contract other than the one deliberately superseded below.

A challenger that would need any of those loosened is not a candidate. It loses.

## 2 · GEL-P0-025 — amended, not deleted

`docs/OWNER_LOCKED_CONTRACTS.md` carries the amendment; the contract test
`src/contracts/owner-locked/sorbetDirectionOffBatchEligibility.contract.test.ts` is kept
and changed in **meaning**:

* **test 1** — was *"an off-batch draft is solved by the exact projection, not the general
  search"*. Now: the projection **must be tried** on an off-batch draft and what it yields
  must be legal and on batch.
* **test 1b (new)** — locks the amendment itself: whatever is published is legal and on
  batch, and **if it displaced the projection it must be strictly nearer**, measured on
  the engine's own Direction-substituted bands rather than asserted.

Everything else in that contract is unchanged and still locked: eligibility (off batch +
exactly one Main), the batch invariant, the crowned Main, the multi-Main draft staying
with the certified Main frontier, the no-Main GEL-P0-014 refusal, on-batch behaviour for
every Main count.

Commit `cadb49a5`, trailer `Owner-Locked-Change-Approved: GEL-P0-025`. The guard reports
**"OWNER-APPROVED contract change"** — it was not bypassed.

## 3 · Architecture — a SELECTOR, not a wider solver

This is the load-bearing difference from the attempt that had to be reverted.

The earlier attempt widened the solver's own search. It moved accepted trajectories
(seven `sharedDirectionNearestMatrix` cells, the multi-Main GEL-P0-025 case) and turned a
clean Preview into `no_proposal` on a constrained milk starter — **it cost a customer an
answer**.

The selector never touches the search:

```
1  the solver produces the incumbent exactly as it does today
2  challengers are generated FROM that incumbent
3  each challenger is built into a FULL Preview
4  a challenger wins only if that Preview is VALID and STRICTLY NEARER
5  otherwise the incumbent is published, byte for byte
```

A challenger that would cost a Preview loses at step 4. The failure mode is impossible by
construction rather than guarded against.

### Move shapes — solved, not guessed

At fixed total mass both axis metrics are **affine** in a mass-neutral gram transfer,
verified on the engine itself (POD 13.731241 → 13.803189 → 14.450721 → 17.328641 for
+1 / +10 / +50 g, and `applyCorrectionActions` realises the transfer byte-exact). One
probe per line therefore gives the engine's own response table, and the step that lands
the requested axes is **solved**:

* **single mover** — one line against a reference, landing ONE axis exactly;
* **paired movers** — two lines against a reference, landing BOTH axes exactly.

Both are move shapes this pipeline already makes elsewhere. Candidates are whole-gram,
because the incumbent they start from is the practicalized vector the customer receives —
optimizing the fractional vector would optimize something nobody gets.

Only the **preserving** rungs of each line's own ladder are used, so a positive user line
can never be collapsed to win a distance comparison.

## 4 · Performance bound (B3) — explicit, and measured

| bound | value |
|---|---|
| when it runs | once per **user-facing** Preview, at re-entrancy depth 1 only |
| never runs in | the Main frontier's probes, a soft-anchor probe, a nearest-level probe, a Rescue simulation |
| evaluation budget | **240** engine-priced challengers for the WHOLE Preview — not per round, not per solve |
| re-aiming passes | at most **4** |
| on exhaustion | the incumbent is published unchanged — a spent budget **never** becomes a claim of infeasibility |

Baselines to hold: `mainTechnicalMaximum.test.ts` **51.97 s** and the focused suites
**703.42 s / 1209 tests**, both measured at `3a77d85f` before this work.

## 5 · What "nearest" means here (B7)

> Among the **legal** candidates this run actually considered, the one whose
> engine-measured distance to the **requested** target is smallest.

It is not the first found, not the projection because it ran first, not a sibling level's
candidate that happens to sit closer, and not a rescue candidate measured from the wrong
baseline. The ranked vector is the **published** one, because practicalization can round
an exact candidate back out of the band.

The search space is **bounded**, so what this returns is *the best in the legal space that
was searched* — not a proof of the global optimum. That distinction is stated wherever it
matters rather than implied.

## 6 · Measured result — FIRST build (two-rung ladder)

> Superseded by § 6b. Kept because the numbers below are the evidence that the first
> build was already an improvement, and because § 6b is only readable against them.

Distances are Σ Direction severity points on the engine's own bands. "halt" is what CORE
published on the audited SHA.

| case | halt | with the selector | factor |
|---|---|---|---|
| **LOCK-01** butter-pecan, 80 g sugar lock, sweetness +1 | 0.3159 | **0.0230** (POD 14.9883 against [15, 16]) | **13.7×** |
| **LOCK-02d** sorbet B, softness −1 | 0.6474 | **0.0210** | **30.8×** |
| **LOCK-02e** sorbet B, softness −2 | 1.0145 | **0.0440** | **23.1×** |
| **LOCK-02c** sorbet B, sweetness −1 | 2.4812 | 1.0200 | 2.4× |
| **LOCK-02a** sorbet A, sweetness −1 | 1.1110 | 0.8280 | 1.3× |
| **LOCK-02b** sorbet A, sweetness −2 | 3.1110 | 2.8280 | 1.1× |
| **LOCK-03** sorbet B, sweetness +1 / +2 | 1.726 / 3.726 | 1.570 / 3.570 | 1.1× / 1.0× |
| **OD-28** | refused | **reaches −1**, POD 13.751, 0 violations | — |

## 7 · Negative controls (B8)

Four shapes, each making the requested level unreachable through a **different**
authority, so a selector that cheated by relaxing something would pass every LOCK test and
fail here:

| control | construction | verdict |
|---|---|---|
| B8.1 hard lock | every line pinned at its grams | refuses |
| B8.2 Main / Crown | the Main crowned and pinned, every sugar line pinned | refuses |
| B8.3 profile-bound | the Sorbet softness −2 dead end the audit proved real | refuses |
| B8.4 machine / process | machine capacity far below the requested batch | refuses |

Each asserts **two** things: the level is not claimed as reached, **and** whatever is
published is still engine-legal. Refusing is allowed; publishing something illegal is not.

## 6b · The defect the FIRST build still had — and the fix

`sharedDirectionNearestMatrix.test.ts` §8 is an accepted cross-level contract: for any
requested level **L**, the candidate delivered for L must be at least as near to L's own
band as every sibling level's candidate is. The first build **failed** it:

```
sorbet @ −13 · level +1 → POD 21.7877  (0.2123 from its band [22, 22])
sorbet @ −13 · level +2 → POD 21.2966  (2.7034 from its band [24, 24])
                                  ↑ the +1 candidate is 2.2123 from band 24 — NEARER
```

Both levels start from a **byte-identical incumbent** (WATER 135 / SUCROSE 86 /
DEXTROSE 125, POD 21.2693), so this is not an input difference. Raising the budget from
240/4 to 600/10 did **not** fix it, which is how the real cause was found rather than
guessed — a trace of the selector's own candidates showed:

* the +2 request **did** generate much nearer candidates (distance 1.07 against the
  incumbent's 2.88) — and every one of them was refused by `detectViolations` as
  `ice_fraction/low`, `water/low`, `total_solids/high`;
* the +1 request generated a legal one because its step was short enough.

**Root cause.** A solved step was offered at exactly two lengths, `scale` and `scale / 2`,
where `scale` is the clamp to the ladder box. A FAR target solves a LONG step, and a long
step leaves the **engine's legal region** far earlier than it leaves the ladder box — so
both rungs were illegal and the far request was left with nothing. The box was bounding
the search; the bands were not.

**Fix.** Along one solved ray every axis metric moves affinely, so distance to the
requested target is monotone up to the exact landing point and the best point on the ray
is the **farthest legal one**. A fixed-depth bisection (6 probes, its own accounted
budget) finds it. This is a bounded line search on **one** ray: the move shapes, the
ladder box and the candidate budget are untouched, and where the whole step is already
legal the behaviour is byte-identical to the first build.

`reachable === 0` — a ray refused from its very first gram — leaves the incumbent standing.
Nothing is relaxed to avoid that.

## 6c · Measured result — SHIPPED build

Baseline restated, because it is **not** the one in § 6: the incumbent is what this branch
publishes with the selector switched off (`directionNearestPass`), on the same fixtures, so
the factor isolates the selector alone. Σ Direction severity points.

| case | incumbent | delivered | factor | first build |
|---|---|---|---|---|
| **LOCK-01** butter-pecan, 80 g sugar lock, sweetness +1 | 2.52079 | **0.01000** (POD 14.9971) | **252.1×** | 13.7× |
| **LOCK-02d** sorbet B, softness −1 | 0.64737 | **0.02055** | **31.5×** | 30.8× |
| **LOCK-02e** sorbet B, softness −2 | 1.01452 | **0.04429** | **22.9×** | 23.1× |
| **LOCK-02c** sorbet B, sweetness −1 | 2.48116 | 0.97823 | 2.5× | 2.4× |
| **LOCK-02a** sorbet A, sweetness −1 | 1.11099 | 0.65306 | 1.7× | 1.3× |
| **LOCK-02b** sorbet A, sweetness −2 | 3.11099 | 2.65306 | 1.2× | 1.1× |
| **LOCK-03** sorbet B, sweetness +1 / +2 | 2.774 / 4.774 | 1.570 / 3.570 | 1.8× / 1.3× | 1.1× / 1.0× |
| **OD-28** | reaches −1 | reaches −1, 0 violations | — | — |
| **CONTROL-C2** the proven dead end | 0.02000 | 0.02000 — **still refuses** | 1.0× | — |

And the contract that exposed the defect now holds, with the two levels agreeing:

```
sorbet @ −13 · level +1 → POD 21.7877   WATER 132 / SUCROSE 97 / DEXTROSE 117
sorbet @ −13 · level +2 → POD 21.7877   WATER 132 / SUCROSE 97 / DEXTROSE 117
```

Both requests converge on the same point because the **legal frontier binds before either
band is reached** — which is the answer to B6, below.

## 6d · Sizing the two bounds (B3)

Neither number is padding, and both were measured rather than chosen. Holding everything
else fixed:

| | 240 / 4 | 240 / 10 | 600 / 10 |
|---|---|---|---|
| LOCK-01 | 87.9× | 87.9× | **254.8×** ← the candidate budget binds |
| LOCK-02c | 4.2× | **4.4×** | 4.4× ← the pass count binds |
| every other lock cell, and the whole Sorbet nearest matrix | identical | identical | identical |

Cost at 600/10: `mainTechnicalMaximum.test.ts` **53.08 s** against its ~52–54 s baseline,
because the depth gate keeps the selector out of inner previews. The full owner-locked
suite runs 24 files / 235 tests in 115.11 s.

## 7 · Negative controls (B8)

Four shapes, each making the requested level unreachable through a **different**
authority, so a selector that cheated by relaxing something would pass every LOCK test and
fail here:

| control | construction | verdict |
|---|---|---|
| B8.1 hard lock | every line pinned at its grams | refuses |
| B8.2 Main / Crown | the Main crowned and pinned, every sugar line pinned | refuses |
| B8.3 profile-bound | the Sorbet softness −2 dead end the audit proved real | refuses |
| B8.4 machine / process | machine capacity far below the requested batch | refuses |

Each asserts **two** things: the level is not claimed as reached, **and** whatever is
published is still engine-legal. Refusing is allowed; publishing something illegal is not.
All four still refuse on the shipped build.

## 8 · B6 — LOCK-03: the mathematics, then the verdict

The owner's instruction was *najpierw matematyka, potem verdict* — do not manufacture a
difference because the labels differ. The mathematics:

* On the locked sorbet, sweetness **+1** and **+2** deliver the byte-identical vector
  `[629, 157, 104, 51, 55, 4]`, POD 20.473509.
* That vector is a **verified local optimum for both requests**: no whole-gram
  mass-neutral transfer between two adjustable lines is strictly nearer to either. The
  same holds for the −1 / −2 pair on config A, `[484, 299, 79, 79, 55, 4]`.
* On Sorbet −13 the +1 / +2 pair likewise converges on one point, `[132, 97, 117]`.

So an identical vector for two levels is the **correct** answer here: both requests are
bounded by the same frontier, and no legal candidate between them exists in the space this
pipeline searches. What must still separate the levels is the distance the verdict
reports, and it does — 0.65306 for −1 against 2.65306 for −2, 1.570 against 3.570 on
config B. Neither is reported as reached.

Pinned by `LOCK-03: the shared vector is a local optimum, and the verdict still separates
the levels` in `directionFalseInfeasible.regression.test.ts`.

This is a statement about **the legal space this pipeline searches**, not a proof of a
global optimum — see § 9.

## 9 · The LOCK-02 residue — root-caused, and NOT fixed here

LOCK-02a / LOCK-02b still move only 1.7× / 1.2×. That is not where the search gave up; it
is where an **authority** stops it, and the cause is exact.

An independent bounded sweep of the same draft finds
`[484, 283, 71, 79, 79, 4]`. Forced into the selector it passes **every** publish gate and
the selector then climbs further still:

| case | delivered today | with that vector admitted | factor |
|---|---|---|---|
| LOCK-02a | 0.65306 | **0.02000** (POD 18.0041) | **32.7×** |
| LOCK-02b | 2.65306 | **0.15935** | **16.6×** |
| LOCK-02c | 0.97823 | 0.84085 | 1.2× |

It is unreachable because it moves **INULIN from 55 g to 79 g**, and nothing in this
pipeline may move inulin on this draft:

1. `withOwnerInulinPolicyHold` writes the owner's dosage **band** onto the line as
   `{ mode: 'range', minGrams: 20, maxGrams: 80 }` (2 %–8 % of a 1000 g batch);
2. `isHeldByConstraint` in `draftCandidateVector.ts` treats **any** mode other than `ai`
   as a full **hold**, so the line is dropped from the adjustable vector entirely;
3. … although 79 g is **inside** the owner's own band, and although that same file
   documents inulin as *"available as the approved solids/body lever"*.

So a **band is being enforced as a lock**, and every search in the pipeline loses the
lever — not only a Direction request.

**Not changed here, deliberately.** Making the band behave as a band changes which lines
the solver may move on **every** recipe: it is a semantic change on a protected path
(`scripts/protectedPaths.json`), far outside a Direction fix, and the owner's Variant B
decision is explicit that constraints are not to be loosened to improve a result. The
mechanism is pinned instead, by `LOCK-02 residue: the owner inulin BAND removes the line
from the adjustable vector entirely`, so the day it changes the test says so.

### Owner decision requested

| | |
|---|---|
| **Authority** | `withOwnerInulinPolicyHold` (`ownerInulinPolicy.ts`) × `isHeldByConstraint` (`draftCandidateVector.ts`) |
| **Accepted behaviour today** | inulin governed by the owner band leaves the adjustable vector; no search may move it, in any direction, on any recipe |
| **Requested behaviour** | the owner band bounds the line's ladder (`min` ≤ g ≤ `max`) instead of removing it |
| **Reason** | the nearest legal candidate for a Direction request needs inulin **inside** the owner's own band |
| **Consequence** | LOCK-02a 32.7× nearer, LOCK-02b 16.6×; inulin becomes a solver lever on every recipe |
| **Risk** | every accepted gram trajectory that currently cannot touch inulin may change; the owner minimum (20 g) becomes reachable from above, so the *lower* edge of the band needs the same scrutiny as the upper |
| **Alternatives** | (a) leave as is — LOCK-02a/b stay at 1.7× / 1.2×; (b) admit the band only for lines the Direction selector moves, which splits one authority into two and is worse |
| **Files** | `src/features/constraint-studio/draftCandidateVector.ts` (`isHeldByConstraint`), `src/features/product-intelligence/ownerInulinPolicy.ts` (`withOwnerInulinPolicyHold`) |

## 10 · Still open

* **B13 — served verification.** Egress to `staging.pinguinoai.com` and the Supabase
  project is blocked from this environment, so **nothing here is served-verified**. Every
  figure above is labelled `offline-staging-head`.
* **The LOCK-02 residue** above, pending the owner decision in § 9.
* **HOME/PRO parity** is Priority 2 and was not touched. No HOME-only or PRO-only
  behaviour was introduced: the selector sits in the shared preview pipeline and is gated
  only by depth and by probe markers, never by module.
