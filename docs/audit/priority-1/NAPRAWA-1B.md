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

## 6 · Measured result

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

## 8 · Still open

* **B6 — LOCK-03.** Sweetness +1 and +2 on the locked sorbet still return the same vector.
  Per the owner's instruction the verdict waits on the mathematics: if both levels
  genuinely share one physical optimum, an identical answer is correct and no difference
  will be manufactured. That has not been established yet.
* **LOCK-02a / LOCK-02b** improve only 1.1×–1.3×. The selector starts from the incumbent,
  and on those cells the incumbent sits in a basin the bounded shapes do not leave.
* **B13 — served verification.** Egress to `staging.pinguinoai.com` and the Supabase
  project is blocked from this environment, so **nothing here is served-verified**.
