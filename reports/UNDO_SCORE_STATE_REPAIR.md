# Apply → Undo score-state restoration

## Scope and baseline

- Starting staging SHA: `4b7da95fc7d37640e558f35efc660436df3cadde`
- Scope: the narrow P2 score/presentation restoration only.
- Mapper Basement SHA-256: `b13f5db4affd9c3be5ccbe59b40920053197a3697a3fa1bd4a859406e8baed38` (unchanged).
- No Supabase migration, secret, environment, billing, Home, Production, Starter, Recipe Library or Mapper change.

## Root cause

The pre-Apply `10/10` was the score of `preview.proposedInput`, explicitly presented as `PREVIEW` / `Podgląd`. The Apply history snapshot stored the recipe input, constraints, exclusions and ProductBehavior state, but omitted the complete score presentation: Preview, terminal, score source, recalculation flag and Apply authorizations/consents.

Undo correctly restored the recipe and incremented its monotonic draft revision. That revision change also marked the current recipe as awaiting recalculation and invalidated staged state. The subsequent staged-state clear removed Preview and its terminal. Because Undo neither restored a verified Preview nor completed a canonical current-recipe calculation, the cockpit fell through to `—/10 · Oczekuje na przeliczenie`.

Persistence could not repair that state: `awaitingRecalculation` is persisted, while Preview, terminal and Apply history are intentionally session-only.

## Repair

- Added explicit score provenance: `CURRENT_RECIPE`, `PREVIEW`, `APPLIED_RECIPE`.
- Captured the complete session-only pre-Apply presentation in the history record, including the full Preview, terminal, exact recalculation flag, working-state and ProductBehavior fingerprints, and the relevant consents/authorizations.
- Undo now immediately enters `WORKING`, revalidates current server ProductBehavior and both base/proposed fingerprints, and only then restores the cloned Preview.
- A safely restored Preview is rebound to the new monotonic draft revision and remains eligible for the normal trustless Apply door.
- An unsafe, stale or absent Preview is never copied. Undo instead completes a canonical calculation of the restored current recipe and terminates at `CURRENT_RECIPE` / `NO_CHANGE_NEEDED`.
- The score is always recalculated from the input selected by its source; no score number is stored or copied between vectors.

## P2 files

- `src/features/constraint-studio/applyPipeline.ts`
- `src/features/constraint-studio/constraintStudioStore.ts`
- `src/features/constraint-studio/undoScoreState.test.ts`
- `src/features/pro-workbench/scorePresentationSource.ts`
- `src/features/pro-workbench/WorkbenchIntelligenceHeader.tsx`

## Regression coverage

The new eight-test suite covers:

- exact recipe vector, roles, locks, ratios, settings, batch and direction intent restoration;
- Preview score/source/terminal/fingerprint restoration;
- restored Preview re-Apply eligibility;
- no invented score when pre-Apply presentation was awaiting;
- fallback completion with the real current-recipe score;
- invalidation after ProductBehavior version, lock or Main-role change;
- repeated Apply → Undo without stale-state accumulation;
- demoted positive Standard and locked Multi-Main fixtures.

Focused combined checkpoint: 14 files, 212 tests, all passed. The dedicated P2 file: 8/8 passed. Full repository: 512/512 test files and 6465/6465 tests passed. The prior staging baseline was 511 files and 6456 tests; the exact delta is eight P2 tests plus one net redesigned-Monitor contract test.

## Local gates

- `npm ci`: PASS; 274 packages audited, 0 vulnerabilities.
- `npm test -- --silent=passed-only --reporter=dot`: PASS; 512 files, 6465 tests, 140.56 s.
- `npm run typecheck`: PASS; 17.85 s.
- `npm run lint`: PASS with 0 errors and exactly two pre-existing Fast Refresh warnings; 23.42 s.
- `npm run build`: PASS; 1129 modules; 19.24 s. Existing chunk-size warning recorded.
- `npm run recipes:validate`: PASS; 2500/2500; 0.49 s.
- `npm run process:validate`: PASS; 2088 rows; 0.50 s.
- `npm run products:audit`: PASS; 2088 rows; 0.41 s.
- `npm audit --audit-level=high`: PASS; 0 vulnerabilities; 0.82 s.
- `git diff --check`: PASS; 0.04 s.

## Served staging QA

- Final implementation SHA: `8021e97f572bb79be4b1bca8df54b4b08f33847a`.
- Staging code deployment: `dpl_7NSjiMwS3GXgrXotp7R3qRt2D2h8`, `READY`, aliased to `https://staging.pinguinoai.com`.
- Served bundles: `assets/index-CFRWtAyt.js`, `assets/index-Ri54JWO6.css`.
- Vercel build log confirms branch `staging`, commit `8021e97`.

QA-01 — demoted positive Standard:

- Before Apply: Strawberry Main 120 g, Banana Standard 180 g, Kiwi Main 240 g; all four relevant gram/percent locks false; `PREVIEW`; `10/10 · Podgląd`.
- After Apply: `APPLIED_RECIPE`; `10/10`.
- After Undo: exact grams, roles and lock vector restored; `PREVIEW`; `10/10 · Podgląd`; `Otwórz podgląd` available.

QA-02 — locked Multi-Main:

- Before Apply: Strawberry Main 100 g with gram lock true; Banana Main 10 g with both locks false; `PREVIEW`; `10/10 · Podgląd`.
- After Apply: `APPLIED_RECIPE`; `10/10`.
- After Undo: exact grams, both Main roles and the complete lock vector restored; `PREVIEW`; `10/10 · Podgląd`; `Otwórz podgląd` available.

QA-03 — stale Preview:

- The safely restored Preview reopened with `Zastosuj zmiany` enabled, proving re-Apply eligibility after the monotonic revision restamp.
- Editing the restored current recipe by 1 g immediately removed `Otwórz podgląd`, changed the source to `AWAITING_CALCULATION` and did not expose the old score.

The automated suite independently asserts equality of the restored working-state and ProductBehavior fingerprints, revision restamping, ProductBehavior-version invalidation, lock invalidation and Main-role invalidation.

Browser console: 0 captured entries/errors. Network: the staging document, logo and served JS/CSS returned successfully; catalogue and ProductBehavior-backed Preview/Apply/Undo interactions completed without a visible failed request or error state.

Public production remained unchanged: deployment `dpl_H141PZ7nuY6TCAxXkHdp1QEDQrgB`, bundles `assets/index-BTR3SdkC.js` and `assets/index-Cp5fjceK.css`.

## Status

UNDO SCORE-STATE RESTORATION — READY FOR OWNER RETEST
