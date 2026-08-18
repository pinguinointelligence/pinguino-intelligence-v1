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
