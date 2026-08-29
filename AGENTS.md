# PINGÜINO DEVELOPMENT RULES

## Core workflow

1. Never claim that a task is complete without inspecting the actual repository state.
2. Before changing accepted behavior, identify all accepted flows that could be affected.
3. Preserve all previously accepted and working functionality unless the user explicitly requests a change.
4. Add or retain regression tests for accepted behavior before modifying related code.
5. After every change, run the relevant focused tests and the full required test suite.
6. Do not deploy to production unless the user explicitly requests production deployment.
7. Never modify secrets, production credentials, billing configuration or environment files without explicit permission.
8. Never modify the `mapper_basement` dataset automatically.
9. Prefer the smallest correct change over broad refactoring.
10. Do not hide failing tests, warnings, incomplete implementations or blockers.

## Owner-locked contracts

**SERVED + TESTED + OWNER-APPROVED = OWNER-LOCKED. Owner-locked behavior is immutable by default.**

11. If a test in `src/contracts/owner-locked/` fails, **the implementation is wrong by default**.
    Never rewrite a locked contract to fit an implementation. This rule exists because it already
    happened: `f5d57bdf` deleted the Crown/Main row control and rewrote the guard test to expect its
    absence, in one commit, and the suite stayed green.
12. A normal implementation task must not modify `src/contracts/owner-locked/**`. Adding a new
    contract is always allowed. Changing or deleting one requires explicit owner approval, recorded
    as a commit trailer `Owner-Locked-Change-Approved: <CONTRACT-ID>`.
13. When a task genuinely requires changing locked behavior, do **not** change it and do **not** ask
    one contract at a time. Collect **every** required change into **one** grouped approval request:
    locked contract · current accepted behavior · requested new behavior · reason · consequence ·
    risk · alternatives · exact affected files and functions. Then wait for explicit owner approval.
14. Design, language, copy, cleanup, refactor and "visibility" tasks must produce **zero** semantic
    drift on any path in `scripts/protectedPaths.json`. Commit names are never trusted — the diff is
    classified. Surface anything that changes conditions, callbacks, mutations, thresholds, solver
    inputs, authority, persistence or data transforms, and record it as `Protected-Change: <file> — <what>`.
15. Before pushing to `staging`, run `npm run verify:staging` and keep it green. Work from a clean
    worktree on the latest `origin/staging` — never a stale dirty checkout, and never resolve a
    conflict by wholesale-copying an older version of a protected file.

The ledger of accepted contracts is `docs/OWNER_LOCKED_CONTRACTS.md`.

## PINGÜINO frozen product rules

The six canonical customer-visible machine or serving choices are:

- −11°C
- −12°C
- −13°C
- Świeże
- Ninja Gelato
- Ninja Swirl

“Ninja 2” is not an approved name and must not be introduced.

Internal routing:

- Świeże → −11°C
- Ninja Gelato → −13°C
- Ninja Swirl → −11°C

Demo must hide all ingredient grams. Home and Pro must display exact ingredient grams.

Saved recipe rules:

- Demo: saving blocked
- Home: maximum one saved recipe
- Pro: unlimited saved recipes

The `mapper_basement` dataset must never be automatically modified.

## Completion gate

Every completed task must end with a completion ledger containing:

1. Requested scope.
2. Completed work.
3. Files changed.
4. Tests added or changed.
5. Exact test commands executed.
6. Test results.
7. Previously accepted flows retested.
8. Deployment environment verified.
9. Remaining incomplete items.
10. Exact blockers and required external actions.
11. Git diff and commit status.

Do not accept vague statements such as “done”, “implemented” or “should work” as proof.
