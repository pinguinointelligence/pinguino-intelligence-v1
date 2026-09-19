# P1-S — CLOSURE STATEMENT

**Priority 1 is NOT closed.** The owner's closure rule is explicit: all five findings
FIXED **and** SERVED verified, negative controls passing, full CI green. Two of those
three conditions are unmet, and this file says exactly which and why.

## 1 · What is closed

| finding | closed? | proof |
|---|---|---|
| **AUD-SWEET-OD28** | **FIXED** (offline-staging-head) | Sweetness −1 REACHED: POD 13.751 ∈ [13, 14], NPAC 39.537 ∈ [39, 41], `detectViolations` `[]`, Σ 1340 g, whole grams, `diagnosticOnly false`. Regression test asserts the level is reached, the goal is not silently substituted, the strawberry lock is byte-exact and the solve is deterministic. |
| **AUD-SWEET-13** | **FIXED** (offline-staging-head) | The rescue never offers a candidate farther from the requested level than the one the run already holds. Verified on all 8 cells. |

## 2 · What is NOT closed

| finding | distance to the requested band | why it is not closed |
|---|---|---|
| **LOCK-01** | 0.3159 → **0.0140** (22.6× nearer) | Still `consent_best_candidate`, not `reached`. The last 0.003 POD needs a combination of whole-gram moves across more than three lines at once; the stage solves over at most two movers plus a reference, so that combination is outside the shapes it can express. |
| **LOCK-02** | 0.647–3.111 → **1.1×–30.8×** nearer | Two cells (A · −1 and A · −2) improve only 1.1×–1.5×. The aim is a bounded greedy search and stays path-dependent there. |
| **LOCK-03** | narrowed on both levels (1.111 → 0.728 and 3.111 → 2.728) but **still byte-identical** | The requested level still does not reach the search on this recipe. One intermediate build DID separate them — and that build broke the accepted cross-level contract in `recipe-direction/sharedDirectionNearestMatrix.test.ts` („no other reachable candidate is nearer to this row's band"). Restoring that contract restored the byte-identity. **The two cannot be reconciled by tuning the greedy; they need the beam below.** The accepted contract won, and the gap is recorded rather than asserted away. |

### The one technical step that would close them

Keep the **top-K** candidates per stage instead of a single winner (a small fixed-width
beam over the same move generator), and allow **three movers plus a reference** so a
whole-gram combination across four lines is expressible. The LOCK-03 / cross-level
conflict above is the sharpest evidence that this is the right next step rather than more
tuning: a greedy that is tuned to separate the levels stops being the nearest, and a
greedy that is tuned to be the nearest stops separating the levels. A beam is what
removes the trade-off, because it stops the path deciding the answer. Both are contained changes to
the same authority — no new science, no new admissible space, no new gate — and the
offline prototype already demonstrates the result they reach (distance 0.023–0.042 on
the same sorbet cells). They are **not** included here because they change the search
shape of a protected path and the evidence for the exact width and depth should be
gathered first.

## 3 · Blocked, not skipped — `[H]` items needing the owner

* **P1-Q — served verification.** Egress from this environment is blocked for
  `staging.pinguinoai.com`, the Supabase project and `*.vercel.app`. **Nothing below is
  served-verified.** The owner must either open egress for a session or run the five
  cases on the served build. The exact five cases, with their before/after numbers, are
  in `P1-G-witnesses.md`; no easier substitute was used.
* **P1-A — served SHA.** Unknown for the same reason. The *audited* SHA `e8ba58a0` is an
  ancestor of the current staging head `7fe10d4c` and **every** CORE path in scope is
  byte-identical between them, so the fix is authored against the right code — but that
  is an inference about the branch, not an observation of the deployed build.

## 4 · Deliberate consequences the owner should know about

* Where the rescue used to offer a worse path it now offers **nothing** (7 of 8 sorbet
  cells). That is honest, and the records still say why
  (`reason: 'no_material_improvement'`), but it removes a button the customer used to
  see. The applicable candidate CORE holds is still not surfaced — that is the UI half of
  AUD-SWEET-05, which the owner placed outside this block.
* **Cost, measured rather than assumed.** The escape costs extra engine evaluations, and
  the first cut of it was far too expensive: `mainTechnicalMaximum.test.ts` went from
  **51.97 s** to minutes, because the exact-target stage re-ran at full width on every
  round of every solve and a single preview solves many times. It is now bounded three
  ways — the escape is opt-in and only the two routes that build the SHOWN preview ask
  for it; each whole solve gets ONE `DIRECTION_ESCAPE_SOLVE_BUDGET` (400) rather than one
  per round; and the preview-level aim shares one `DIRECTION_AIM_EVALUATION_BUDGET` (300)
  across both acceptance rules and all passes. Re-measured on the same file:
  **54.14 s, 46/46 passing — a 4 % overhead.**

## 5 · Not started, as instructed

Priority 2 (HOME/PRO parity — AUD-CORE-PARITY-01), Priority 3 (Main/Crown/lock order
dependence), Priority 4 (Direction mapping as its own block) and Priority 5 (UI
genuine-infeasible) were **not** started.
