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
| **LOCK-01** | P1 | CONFIRMED FALSE INFEASIBLE | **IMPROVED, NOT CLOSED** | Distance to the requested band 0.3159 → **0.0290** (10.9× nearer), still engine-clean, the 80 g sugar lock held byte-exact. Still `consent_best_candidate`, not `reached`; the only reaching witness needs a material user-intent collapse the applier refuses. | `evidence/p1cde-locks-after-fix.json` |
| **LOCK-02** | P1 | CONFIRMED — presented "nearest" 38–274× farther | **IMPROVED, NOT CLOSED**; the multiplier is **corrected to 26×–156×** (the audit measured one axis on a randomised witness search; this is the engine's two-axis severity) | 1.4×–13.2× nearer across the five cells, all engine-clean, locks held. The **structural** half of the finding is closed: `line-1` sat at exactly 598 g and `line-5` at exactly 55 g in all 16 cells and now moves (225 / 366 / 433 / 544 / 629 g). | `evidence/p1cde-locks-after-fix.json` |
| **LOCK-03** | P1 | CONFIRMED — −1 and −2 byte-identical | **PARTIALLY FIXED** | Config A now returns **different** proposals for −1 and −2 (POD 18.690 vs 18.736). Config B `+1`/`+2` still return the same vector — and on the evidence that may be correct rather than defective: with `SUCROSE` locked at 104 g and softness pinned to the exact point 37.5, the nearest feasible point in the POD-increasing direction genuinely is the same for both. What is still missing is the **signal** that the level was separately attempted, which is presentation and outside this block. | `evidence/p1cde-locks-after-fix.json` |

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
