# P1-S — CLOSURE STATEMENT

**Priority 1 is NOT closed.** The owner's closure rule is explicit: all five findings
FIXED **and** SERVED verified, negative controls passing, full CI green. Two of those
three conditions are unmet, and this file says exactly which and why.

## 1 · What is closed

| finding | closed? | proof |
|---|---|---|
| **AUD-SWEET-OD28** | **FIXED** (offline-staging-head) | Sweetness −1 REACHED: POD 13.751 ∈ [13, 14], NPAC 39.537 ∈ [39, 41], `detectViolations` `[]`, Σ 1340 g, whole grams, `diagnosticOnly false`. |
| **AUD-SWEET-13** | **FIXED** (offline-staging-head) | The rescue never offers a candidate farther from the requested level than the one the run already holds. Verified on all 8 cells. |

Both come from **two small changes**: the paired-exchange gate widened to a strict
superset (scoped to the solve that produces the shown preview), and the rescue's
improvement baseline moved from the untouched draft to the candidate the run already
holds.

## 2 · What is NOT closed — and why each was REVERTED rather than shipped

The exact-target search that closed LOCK-01, LOCK-02 and LOCK-03 was reverted in full.
Three independent findings from the suites forced it, in this order:

| # | what broke | consequence |
|---|---|---|
| 1 | Ranking both Sorbet generators by distance failed the OWNER-LOCKED contract `sorbetDirectionOffBatchEligibility.contract.test.ts` (**GEL-P0-025**): an off-batch Sorbet draft must be solved BY THE EXACT PROJECTION, not by the general search. | **LOCK-02 and LOCK-03 reverted** — they had reached 1.1×–30.8× nearer and unfrozen `line-1`, frozen at exactly 598 g in all 16 audited cells. |
| 2 | The preview-level aim turned a clean Preview into `no_proposal` on the milk starter at Sweetness +2 / Softness +2 carrying an exact, a percent and a range constraint (`recipeDirectionTargets.test.ts`). | **LOCK-01 reverted** — it had reached 0.0140, 22.6× nearer than the 0.3159 halt point. An improvement that costs the customer an answer elsewhere is not an improvement. |
| 3 | Removing the aim exposed that the in-solver half alone shifts accepted solver trajectories: seven `sharedDirectionNearestMatrix` cells and a SECOND case of GEL-P0-025 („a MULTI-Main off-batch draft is left to the certified Main frontier"). | The in-solver exact-target stage reverted as well; `draftCandidateVector.ts` has **no net change**. |

So LOCK-01, LOCK-02 and LOCK-03 all sit exactly at their audited halt points
(0.3159 · 1.111 / 3.111 / 2.4812 / 0.6474 / 1.0145 · byte-identical levels). Nothing was
given back beyond what was reverted, and nothing is claimed that is not measured.

**None of this is a dead end.** The search design is proven — the offline prototype in
`evidence/p1l-prototype.json` reaches distance 0.023–0.042 on the same cells, and the
production builds reached 22.6×–30.8× before being reverted. What is missing is the
integration work that makes it safe: it must not out-rank the Sorbet projection, must not
cost a Preview under constraints, and must not move accepted solver trajectories. That is
real work with a real design (below), not a matter of tuning.

### An owner-locked contract blocks the Sorbet half — OWNER DECISION NEEDED

The Sorbet route (LOCK-02, LOCK-03) was fixed by running BOTH candidate generators and
ranking them by distance instead of taking the first that merely improves. Measured, that
reached candidates **1.1×–30.8× nearer**, and it unfroze `line-1`, which had sat at exactly
598 g in all 16 audited cells.

It also **failed an owner-locked contract**:
`src/contracts/owner-locked/sorbetDirectionOffBatchEligibility.contract.test.ts`
(**GEL-P0-025**) — *"an off-batch draft is solved by the exact projection, not the general
search"*. Ranking by distance lets another generator out-rank the closed-form projection,
so the locked SHAPE of that repair is lost, together with its documented reason: the
projection answers in milliseconds where the general search took 50–92 s and, at ±30 g,
published a proposal carrying an Engine violation.

**AGENTS.md rule 11 is unambiguous — a locked contract is not rewritten to fit an
implementation — so the change was reverted.** The Sorbet route is back to its accepted
order of authority, and LOCK-02 and LOCK-03 are OPEN on that route.

The two requirements genuinely conflict as stated:

* GEL-P0-025 says the projection owns the answer for an off-batch Sorbet draft.
* P1-K INV-2 says a candidate presented as the nearest may not be beaten by another legal
  candidate the same run produced.

They can be reconciled — for example by keeping the projection's precedence while still
refusing to *label* its result „najbliższy" when the run holds something nearer, or by
letting the projection's candidate be refined toward the target rather than replaced — but
either is a change to accepted Sorbet behaviour and belongs to the owner, not to this task.

**Grouped approval request (AGENTS.md rule 13), one item:**

| | |
|---|---|
| **Locked contract** | GEL-P0-025 — `sorbetDirectionOffBatchEligibility.contract.test.ts` |
| **Current accepted behaviour** | The first Sorbet generator whose candidate improves the Direction measure wins; the closed-form exact projection is tried first and therefore owns the answer whenever it improves anything at all. |
| **Requested new behaviour** | The projection keeps its precedence, but its candidate may be refined toward the requested target by the same engine-verified exact-target stage, and the result may not be presented as „najbliższy" while the run holds a nearer legal candidate. |
| **Reason** | LOCK-02: the presented „nearest" is 26×–156× farther from the requested level than a candidate reachable in the same admissible space. LOCK-03: two different requested levels return the byte-identical proposal. |
| **Consequence** | Sorbet Direction proposals move (measured 1.1×–30.8× nearer); `line-1` and `line-5`, frozen in all 16 audited cells, start moving. |
| **Risk** | The projection's speed and its zero-violation guarantee must be preserved; the refinement must not reintroduce the 50–92 s general-search path GEL-P0-025 was written to avoid. Bounded by the existing per-solve evaluation budget. |
| **Alternatives** | (a) leave LOCK-02/LOCK-03 open on Sorbet; (b) change only the LABEL, so the dialog stops calling a non-nearest candidate „najbliższy" without changing which candidate is produced; (c) the full ranking change, which is what failed the contract. |
| **Exact affected files / functions** | `src/features/constraint-studio/applyPipeline.ts` → `buildSorbetDirectionCandidatePreview`; `src/features/recipe-direction/sorbetNearestDirectionSearch.ts` → `searchSorbetNearestDirectionCandidate` (its contract holds Main, Inulin and the stabilizer byte-exact, which is what keeps `line-5` frozen). |

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
