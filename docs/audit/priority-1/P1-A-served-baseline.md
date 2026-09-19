# P1-A — SERVED BASELINE / EXACT SHA

Date: 2026-09-19. Repo: `pinguinointelligence/pinguino-intelligence-v1`.

```
AUDITED SHA : e8ba58a0bcce40c82c1def435aec14906c373f75   (origin/staging at audit time)
SERVED SHA  : UNKNOWN — NOT VERIFIABLE FROM THIS SESSION
CURRENT origin/staging HEAD : 7fe10d4cecb50dbd712bc71b6f6115cab4b3f73d
```

## Why SERVED SHA is unknown  →  [H] HELP / EXTERNAL ACTION NEEDED

Outbound egress from this sandbox is blocked for every served surface:

| target | result |
|---|---|
| `https://staging.pinguinoai.com/` | HTTP 000 / connection refused by proxy |
| `https://tunabqqrwabacxjcxxkz.supabase.co/rest/v1/` | HTTP 000 / connection refused by proxy |
| `*.vercel.app` | 403 (recorded during the audit) |

There is therefore no way to read the deployed build id, the deployed bundle, or
the served DB from here. **Owner action required** (either one):
1. open egress to `staging.pinguinoai.com` + the Supabase project for this session, or
2. run the served steps manually and paste the results (the 25-step served-QA
   checklist from the audit, Appendix F, is written for exactly this).

Everything below is therefore labelled `offline-staging-head` and was produced
against the **current** `origin/staging` head `7fe10d4c`, not against a served build.

## RELEVANT CORE DIFF — audited SHA e8ba58a0 → current staging head 7fe10d4c

`e8ba58a0` IS an ancestor of `7fe10d4c` (62 commits, 52 src files, +3603/−569).

| P1-A area | files changed in `e8ba58a0..7fe10d4c` | verdict |
|---|---|---|
| Direction (`src/features/recipe-direction/**`) | 0 | **RELEVANT CORE DIFF: NONE** |
| Feasibility + fallback + solver + candidate selection (`src/features/constraint-studio/**`) | 0 | **NONE** |
| Engine (`src/engine/**`) | 0 | **NONE** |
| Practicalization / rounding (`src/features/practical-recipe/**`) | 0 | **NONE** |
| Main / Crown / locks (`constraint-studio`, `recipeStore.ts`) | 0 | **NONE** |
| Profile / machine constraint input (`src/features/machine-onboarding/**`, `machine-catalog`) | 0 | **NONE** |
| PRO core (`src/features/pro-core/**`) | 0 | **NONE** |
| Owner-locked contracts (`src/contracts/owner-locked/**`) | 0 | **NONE** |
| HOME (`src/features/home-creator/**`) | 3 — `HomePreparation.tsx` + 2 tests | **PRESENT but NOT RELEVANT** (preparation screen, not recalculation) |
| Studio (`src/features/studio/**`) | 7 — `StudioEngineSurface.tsx`, new `monitorPanelResize.ts` + tests | **PRESENT but NOT RELEVANT** (monitor panel layout; `buildRecipeInput.ts` unchanged) |

**Conclusion: every CORE path in the Priority 1 scope is byte-identical between the
audited SHA and the current staging head.** The audit's findings therefore transfer
to `7fe10d4c` without re-derivation, and the fix is authored on `7fe10d4c`.

## Working base for the fix

`claude/gifted-heisenberg-q6qay8` was pointing at `origin/main` (7fa36890), which is
**618 commits behind staging** and carries a *different* constraint-studio CORE
(`applyPipeline.ts`, `constraintStudioStore.ts`, `draftCandidateVector.ts`,
`directionFallback.ts` all differ). Fixing there would fix code that is not served.
The branch had **0 commits of its own** and **does not exist on origin**, so it was
re-pointed at `origin/staging` (7fe10d4c) — no work discarded.
