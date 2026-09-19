# COMPLETION LEDGER — PRIORITY 1 CLOSURE (FALSE INFEASIBLE / CANDIDATE SELECTION / NEAREST FEASIBLE)

## 1 · Requested scope
Root cause → fix → test → merge → served verification for exactly five findings:
**AUD-SWEET-OD28, LOCK-01, LOCK-02, LOCK-03, AUD-SWEET-13**. HOME/PRO parity,
Main/Crown/lock order dependence, Direction mapping and UI genuine-infeasible were
explicitly out of scope and were not started.

## 2 · Completed work
* All five findings reproduced at the current staging head through the real store doors.
* Three root causes located by controlled experiment, not inference.
* Three authority-level fixes in shared CORE. No strawberry / Ninja / −1 / HOME-only
  exception, no UI auto-accept masking, no hard-coded nearest.
* 14 regression tests over frozen drafts; four genuinely-infeasible negative controls.
* The audit's own numbers re-measured: two are corrected in the evidence.

## 3 · Files changed
| file | protected? | change |
|---|---|---|
| `src/features/constraint-studio/applyPipeline.ts` | **yes** | paired-exchange gate widened to a strict superset; `aimDirectionVariants` / `aimAtDirectionTarget` / `rankDirectionCandidate`; Sorbet generators ranked by distance; whole-gram aiming |
| `src/features/constraint-studio/draftCandidateVector.ts` | **yes** | new `sweepExactDirectionTarget` + `searchExactDirectionTargetCandidate`; `accept`, `acceptanceRule`, `allowMaterialDeviation`, `wholeGrams` options |
| `src/features/constraint-studio/starterPackDirectionRescue.ts` | no | improvement baseline is the proven candidate, not the draft |
| `src/features/constraint-studio/directionFalseInfeasible.regression.test.ts` | new | the P1-K invariants |
| `src/features/constraint-studio/__fixtures__/directionFalseInfeasibleDrafts.json` | new | the ten frozen drafts |
| `docs/audit/priority-1/**` | new | P1-A…P1-S evidence and raw probe JSON |

`src/contracts/owner-locked/**` — **untouched**. Owner-locked guard: OK.
Protected-path guard: 2 semantic changes, both acknowledged with `Protected-Change:` trailers.

## 4 · Tests added or changed
Added `directionFalseInfeasible.regression.test.ts` (14 tests) and its fixture.
**No existing test was modified or deleted.**

## 5 · Exact test commands executed
```
npx tsc --noEmit -p tsconfig.json
npx eslint src/features/constraint-studio/{applyPipeline,draftCandidateVector,starterPackDirectionRescue}.ts \
           src/features/constraint-studio/directionFalseInfeasible.regression.test.ts
npm run guard:owner-locked
npm run guard:protected-paths
npx vitest run src/features/constraint-studio/directionFalseInfeasible.regression.test.ts
npx vitest run src/features/constraint-studio src/features/recipe-direction src/contracts/owner-locked
```

## 6 · Test results
* typecheck — **PASS** (0 errors)
* eslint on every changed file — **PASS** (0 findings)
* `guard:owner-locked` — **PASS**
* `guard:protected-paths` — **PASS**, 2 semantic changes acknowledged
* new regression suite — **14/14 PASS**; **11/14 FAIL** with the three CORE changes reverted
* focused suites (`constraint-studio`, `recipe-direction`, `owner-locked`) — **see §10**

## 7 · Previously accepted flows retested
* The four genuinely-infeasible negative controls still refuse (`no_proposal`,
  `BLOCKED_WITH_EXACT_ACTION`, no fallback best, no rescue). The solver was **not**
  made "always feasible".
* OD-29 genuine-infeasible handling is untouched: the CORE contract payload did not change.
* The Direction fallback ladder (GEL-P0-013) is untouched — the fix is upstream of it.
* HOME and PRO consume the same shared CORE; no HOME-only or PRO-only path was added.

## 8 · Deployment environment verified
**NONE.** No deployment was performed and none was requested. Everything is labelled
`offline-staging-head` (7fe10d4c).

## 9 · Remaining incomplete items
* **LOCK-01, LOCK-02, LOCK-03 are improved but NOT closed** — see `P1-S-closure.md` §2
  for the measured gap and the one technical step that would close it.
* **P1-Q served verification not performed for any of the five findings.**
* The applicable candidate CORE holds is still not surfaced to the customer in the
  Sorbet cells (the UI half of AUD-SWEET-05 — out of scope here).

## 10 · Exact blockers and required external actions
* **`[H]` Served access.** Egress to `staging.pinguinoai.com`, the Supabase project and
  `*.vercel.app` is blocked from this environment. Required: open egress for a session,
  or run the five cases on the served build. Until then no finding may be marked
  SERVED VERIFIED and Priority 1 cannot close.
* **`[?]` Owner decision.** Whether to spend the next step on closing LOCK-01/02/03
  (top-K beam + three movers in the same stage — a further protected-path change), or to
  accept the current 27×–32× improvement and move to Priority 2.

## 11 · Git diff and commit status
Branch `claude/gifted-heisenberg-q6qay8`, based on `origin/staging` (7fe10d4c).
```
772c56a4  Priority 1 closure — evidence for the false-infeasible / candidate-selection block
917d1de0  CORE: a Direction refusal must be a fact about the recipe, not about the search
9d1e083a  CORE: aim at the whole-gram vector, because that is the one the customer gets
```
All pushed. **No pull request was opened** and none was requested. Nothing was merged,
no database was touched, PR-ING and the scanner are untouched.
