# P1-R — AUDIT STATUS UPDATE

This file **supplements** the audit of 2026-09-18
(`AUDYT_RECEPTUR_CORE_PROFILE_MASZYNY_PRING_2026-09-18.md`). Nothing in that report
is deleted or rewritten: every original finding, its evidence, its root cause and its
severity stand exactly as recorded. What changes here is **status**, plus the fix, the
tests and the post-fix evidence — so the audit trail survives intact.

Fix commit: `917d1de0` on `claude/gifted-heisenberg-q6qay8`.
Regression tests: `src/features/constraint-studio/directionFalseInfeasible.regression.test.ts`
(14 tests; **11 of them fail** when the three CORE changes are reverted).
Frozen drafts: `src/features/constraint-studio/__fixtures__/directionFalseInfeasibleDrafts.json`.

All post-fix evidence is labelled `offline-staging-head` (7fe10d4c). **No finding below
is marked SERVED VERIFIED** — the served build is unreachable from this environment
(see `P1-A-served-baseline.md`), so P1-Q is open for every one of them.

| finding | severity | audit status | status now | what changed | evidence |
|---|---|---|---|---|---|
| **AUD-SWEET-OD28** | P1 | CONFIRMED FALSE INFEASIBLE | **FIXED** (served verification pending) | Sweetness −1 is now REACHED: POD 13.751 ∈ [13, 14], NPAC 39.537 ∈ [39, 41], `detectViolations` `[]`, Σ 1340 g, whole grams, `diagnosticOnly false`. The refusal and the fallback to 0 are gone. | `evidence/p1h-trace-baseline.json` (before) · `evidence/p1h-trace-after-fix.json` (after) · `evidence/od28f-savegate.json` |
| **AUD-SWEET-13** | P1 | CONFIRMED (6/7 cells) | **FIXED** — and the finding is **strengthened**: it was **7 of 7** on the engine's own two-axis measure, not 6 of 7 | The rescue's improvement baseline is now the candidate the run already holds. In the 7 cells it answers it never offers a candidate farther from the requested level; in `softness/+1`, where a genuinely better candidate exists, it now finds it (0.0995 → 0.0928 instead of 0.1195). | `evidence/p1f-sweet13-after-fix.json` |
| **LOCK-01** | P1 | CONFIRMED FALSE INFEASIBLE | **NOT FIXED** | It WAS closed — a preview-level aim reached 0.0140, **22.6× nearer** than the 0.3159 halt point. That aim also turned a clean Preview into `no_proposal` on the milk starter at Sweetness +2 / Softness +2 with an exact, a percent and a range constraint (`recipeDirectionTargets.test.ts`). An improvement that costs the customer an answer elsewhere is not an improvement, so it was removed. Removing it then exposed that the in-solver half shifts accepted trajectories across `sharedDirectionNearestMatrix` and a second case of the owner-locked Sorbet projection contract, so that was reverted too. | `evidence/p1cde-locks-after-fix.json` |
| **LOCK-02** | P1 | CONFIRMED — presented "nearest" 38–274× farther | **NOT FIXED**; the multiplier is **corrected to 26×–156×** (the audit measured one axis on a randomised witness search; this is the engine's two-axis severity) | It WAS closed — ranking both Sorbet generators by distance reached candidates **1.1×–30.8× nearer** and unfroze `line-1`, which sat at exactly 598 g in all 16 audited cells. That failed the OWNER-LOCKED contract GEL-P0-025, so it was reverted. See the grouped approval request in `P1-S-closure.md`. | `evidence/p1cde-locks-after-fix.json` |
| **LOCK-03** | P1 | CONFIRMED — −1 and −2 byte-identical | **NOT FIXED** | Reverted with LOCK-02: the improvement came from the same Sorbet ranking change that failed GEL-P0-025. An earlier build did separate the two levels — and the move shape that separated them was the same one whose absence broke the accepted cross-level contract in `recipe-direction/sharedDirectionNearestMatrix.test.ts`. The two requirements pull against each other under a greedy search; closing this needs the beam described in `P1-S-closure.md`, not more tuning. | `evidence/p1cde-locks-after-fix.json` |

## VARIANT B UPDATE — supersedes the three `NOT FIXED` rows above

The owner's decision `NAPRAWA 1B — WARIANT B` amended GEL-P0-025 (exact projection is the
**preferred first path**, not the final authority) and authorised a bounded search for the
nearest legal candidate. The table above is **not** rewritten — it records what was true
before that decision. This section records what is true after it. Full write-up, including
every measurement and the two bounds' sizing:
`NAPRAWA-1B.md`. Regression tests: 20 in
`directionFalseInfeasible.regression.test.ts`.

| finding | status before Variant B | status now | measured |
|---|---|---|---|
| **LOCK-01** | NOT FIXED | **FIXED** (served verification pending) | incumbent 2.52079 → delivered **0.01000**, POD 14.9971 against band [15, 16] — **252.1×** nearer, with the 80 g sugar lock held byte-exact |
| **LOCK-02** | NOT FIXED | **PARTLY FIXED, residue ROOT-CAUSED** | softness cells 31.5× / 22.9× nearer, sweetness cells 1.2×–2.5×. The residue is **not** a search failure: the nearest legal candidate needs INULIN at 79 g, **inside** the owner's own 20–80 g band, and `isHeldByConstraint` drops any line carrying a non-`ai` constraint from the adjustable vector — so the band is enforced as a lock. Admitting that one vector takes LOCK-02a to **0.02000** (32.7×) and LOCK-02b to **0.15935** (16.6×). Owner decision requested in `NAPRAWA-1B.md` § 9; **nothing was loosened here.** |
| **LOCK-03** | NOT FIXED | **EXPLAINED — the identical vector is correct** | „Najpierw matematyka": +1 and +2 converge on one vector because it is a **verified local optimum for both** — no whole-gram mass-neutral transfer between two adjustable lines is nearer to either. The verdict still separates the levels by distance (1.570 against 3.570). No difference was manufactured. Bounded-space statement, not a global-optimum proof. |

A defect the first Variant B build introduced and this one removes: it broke the accepted
cross-level contract `recipe-direction/sharedDirectionNearestMatrix.test.ts` §8 — on
Sorbet −13 the request for Sweetness **+2** published POD 21.2966 while **+1**, from a
byte-identical incumbent, published 21.7877, so a sibling level's candidate sat nearer to
+2's own band than +2's did. Root cause: a solved step was offered at only two lengths, and
a far target's long step leaves the engine's legal region long before it leaves the ladder
box, so **every** rung was illegal. Fixed by a fixed-depth bisection for the farthest legal
point on the ray. Both levels now deliver POD 21.7877. Guarded by `INV-2: a farther request
never converges worse than a nearer one on the same draft`.

## Findings the fix touches but does NOT close (recorded, not acted on)

* **AUD-SWEET-05 / RC-INF-2 (P2)** — the Sorbet exact-preference point (`min = max`, `reached`
  at 1e-9) means no non-zero Sorbet level can be formally `reached` at whole grams. Every
  Sorbet candidate above is therefore still `reached: false` no matter how near it is. Untouched.
* **The dialog precedence that hides `directionBestCandidate`** — RC-3 stops the rescue
  offering a *worse* path, which in 7 of 8 cells now means it offers *nothing*. That is
  honest, but the applicable candidate CORE holds is still not offered to the customer.
  This is the UI half of AUD-SWEET-05 and is outside the Priority 1 block the owner defined.
* **AUD-CORE-PARITY-01 (P1)** — HOME/PRO divergence on a Main 0 g line. Explicitly deferred
  to Priority 2 by the owner; the fix here is in shared CORE and both doors consume it
  identically, so it neither closes nor worsens that finding.

## Recommended, not done

Promote **INV-1** and **INV-2** to `src/contracts/owner-locked/` once LOCK-01/02/03 are
closed. Adding a contract is always allowed, but locking now would lock a partial state —
and the defect this whole block is about is precisely a locked contract being made to
agree with the implementation.

Still the recommendation after Variant B: LOCK-02 carries a live owner decision, so the
state is still partial.

## What this block did NOT do

**Priority 2 was not started.** No HOME-only or PRO-only behaviour was introduced — the
selector lives in the shared preview pipeline and is gated only by re-entrancy depth and
by internal probe markers, never by module. Any parity drift observed stays recorded for
Priority 2 rather than fixed here.
