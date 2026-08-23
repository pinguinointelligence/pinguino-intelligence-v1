# Multi-Main closeout — Protein 1:1/2:1 proven; served programme blocked by machine load

**Date:** 2026-08-23 · staging only · production `main` `4dfb097` untouched.

| | |
|---|---|
| Starting `origin/staging` | `e02de60` |
| Final `origin/staging` | `2098b0b` |
| Global Main Authority | `27dae2f` landed mid-task; rebased onto it, used, not competed with |

## Closed this pass

**Protein Multi-Main 1:1 AND 2:1 are feasible.** The previous "2:1 infeasible" reading was a
FIXTURE defect. A deterministic sweep over the real Engine (7 Main-capable pairs × 3 temperatures ×
OPTIMAL/ECO × 6 loads = 252 candidates per ratio) finds **203 legal 1:1** and **201 legal 2:1**.

Root cause of the earlier 0/252: `main_ratio_weight ?? 1`. An undeclared weight already IS a 1:1
declaration, so a 2:1 gram split with no weight is a 1:1 recipe written wrong, and the solver
correctly renormalised it. Stating the weights is the whole difference. Pinned by its own case.

Pinned positive fixture — COCOA ALKALIZED 100 % + VANILLA paste, −11 OPTIMAL, 60 g total Main in
1000 g, through the REAL Apply door (`commitPreview`), not just Preview:

| ratio | grams | POD | NPAC | fat | protein |
|---|---|---|---|---|---|
| 1:1 | 30 / 30 | 15.36 | 41.78 | 8.20 % | 9.39 % |
| 2:1 | 40 / 20 | 14.94 | 41.75 | 8.53 % | 9.69 % |

Both: sum exactly 1000 g, zero 0 g rows, `detectViolations` empty, both lines still Main after
Apply, ratio exact. Order independence (§9) proven. Both Mains are USER-HELD under the new
authority, so no envelope is invented for them.

Committed sweep bounded to ~4.5 s (full 504-solve version documented for local widening).

## The second-full-suite failure — classified C (contention), proven

Failing test: `mainTechnicalMaximum.test.ts › does not cross the 20% ECO Main floor to chase an
extreme Direction target`, at **106 s**. The same test ran in **2 555 ms** earlier this session.

Interleaved A/B, same machine, alternating runs, to test whether the Global Main Authority slowed
the Main frontier:

| run | commit | seconds | load |
|---|---|---|---|
| 1 | BASE `1b19c55` (pre-authority) | **78** | 16.90 |
| 2 | HEAD `37d2887` (post-authority) | 37 | 24.05 |
| 3 | BASE `1b19c55` | 36 | 22.79 |
| 4 | HEAD `37d2887` | 55 | 23.27 |

Ranges overlap completely and the single slowest run is a BASE run. **No signal that the Main
authority regressed performance**; the variance tracks load, not commit. Not A (not introduced by
this work), not B (not incoming from staging) — C.

No global timeout was raised, no assertion weakened, no coverage reduced, no fixture removed.

## External blocker — shared-machine contention

This Mac has 8 cores. Load average over this pass: **7.8 → 10.1 → 14.3 → 24.6**, 15-min average
19.4, driven by other agents working the same repo concurrently. Consequences measured here:

- a 2.5 s solver test takes 106 s (≈40×);
- one full-suite run was killed by the OS (`exit 143` SIGTERM), another `exit 137`;
- §4's own instruction — "wait until load < 8, rerun" — could not be satisfied: load rose
  monotonically while waiting and never returned below 8.

Two clean consecutive full-suite runs, and the served UI programme (Protein 1:1/2:1, Sorbet 1:1/2:1,
Direction, NEAREST, Rescue, locks, P1-B, ECO, persistence v1/v2/restore-v3, parity, performance,
Production workspace) cannot be executed honestly under this. Each served case needs 25–35 s of
solver per Przelicz at idle; at this load that is minutes per interaction, and the browser MCP
dropped twice already.

## Verified at this SHA

29 focused tests green post-rebase (Protein Multi-Main positive 10, search 2, combined-percentage
17). Last clean full suite this pass: **641 files / 8070 PASS**. Typecheck clean, lint 0 errors,
Rescue bundle verified, `git diff --check` clean, Mapper untouched, production `main` untouched.
