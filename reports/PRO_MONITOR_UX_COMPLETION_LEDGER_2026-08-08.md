# PRO Monitor UX — completion ledger

Date: 2026-08-08

Branch: `codex/pro-monitor-ux`

Base: `4a83fca7aa68dcaad5fd39925f0291144579d588` (`codex/pro-profile-preflight`)

Deployment: intentionally not performed

## 1. Requested scope

Redesign only the contextual PINGÜINO Pro Monitor tab. Preserve the ingredient editor,
Profile preflight/layout (except the explicitly shared six-axis component/state),
Production, Summary, educational score detail, Engine science, target bands, solver,
Apply/Undo, canonical ingredient identity and unrelated persistence.

The approved Monitor contract is one technical score, the exact shared six-axis control,
six compact technology modules, protected red/green/gold position scales, honest grey
no-evaluation states, secondary Nutrition/Cost, compact corrections when meaningful and
a separate ADVANCED owner-diagnostics area.

## 2. Completed work

- Replaced the historical customer-facing Monitor stack with six compact modules:
  Zamrożenie; Słodycz i cukry; Woda i ciała stałe; Tłuszcz i kremowość; Białko i
  struktura; Stabilność i ryzyka.
- Kept core metrics visible and placed secondary causes in per-module details.
- Problem modules open their cause rows automatically.
- Reused the exact `ProfileDirectionAxes` component and shared target store. Four
  adjustable targets remain independent from the actual Engine marker and do not change
  ingredient grams.
- Kept one score only through the existing `monitorScoreView` technical-score seam.
- Removed normal-customer noise required by the owner: data confidence, production
  readiness, trial-batch recommendation, coverage intro, historical Tryb Expert,
  repeated pins, duplicate score/card and duplicate raw metrics.
- Added five-part red/green/gold/green/red visual scales without rendering proprietary
  numeric target ranges.
- Added concise metric help that works on hover and tap.
- Added a compact unconfirmed-preflight reminder that opens Profile and disappears after
  confirmation.
- Kept Nutrition/Cost secondary and marked `DO PRZEGLĄDU`; kept owner diagnostics in a
  separate `ADVANCED` area.
- Corrected the browser-discovered empty-recipe presentation defect: metrics without a
  value/band now render a grey `?` scale with no actual marker.
- Preserved the underlying historical customizable Monitor layout/pin reducers without
  mounting that stack in normal Pro Monitor.

## 3. Files changed

Application presentation:

- `src/features/pro-workbench/MonitorLiveSummary.tsx`
- `src/features/pro-workbench/MonitorPanelContent.tsx`
- `src/features/pro-workbench/ProfessionalMonitorModules.tsx` (new)
- `src/features/pro-workbench/professionalMonitorModel.ts` (new)
- `src/features/pro-workbench/RecipeProfilePanel.tsx` (Monitor → Profile callback only)

Tests:

- `src/features/pro-workbench/professionalMonitorUx.test.tsx` (new)
- `src/features/pro-workbench/monitorMathematicalFreeze.test.ts` (new)
- `src/features/pro-workbench/monitorParity.test.tsx`
- `src/features/pro-workbench/monitorParityVerified.test.tsx`
- `src/pages/pro/finalProWorkbenchDesign.test.tsx`
- `src/pages/pro/proRecipeUxRepair.test.tsx`

Evidence:

- `reports/PRO_MONITOR_UX_COMPLETION_LEDGER_2026-08-08.md`
- 14 PNG files in `reports/qa/pro-monitor-ux/`

No files under `src/engine`, `src/features/formulation`, `mapper_basement`, the canonical
recipe store, Preview/Apply/Undo or persistence implementations were changed.

## 4. Tests added or changed

- Added 10 focused Monitor UX contract tests.
- Added a five-fixture mathematical freeze comparing the redesigned raw Monitor values
  to the pre-redesign Monitor mapping for POD, PAC, NPAC, ice, water, total solids, fat,
  aerating protein, protein in solids, lactose and lactose-risk values.
- Replaced obsolete historical-parity assertions that explicitly required removed owner-
  rejected UI with the approved six-module/one-score contract.
- Retained real `/pro/monitor` host verification, current-draft Engine value checks,
  protected-range checks, one-scroll-surface checks and desktop/mobile shared-source
  checks.
- Updated two broader Pro acceptance suites only where their old expectations required
  `UserMonitorPro` and the duplicate `OverallScoreCard` in the normal Monitor.

## 5. Exact commands executed

Final validation commands:

```text
npm run typecheck
npm run lint
npm test -- --run src/features/pro-workbench/professionalMonitorUx.test.tsx src/features/pro-workbench/monitorMathematicalFreeze.test.ts src/features/pro-workbench/monitorParity.test.tsx
npm test -- --run src/features/pro-workbench/professionalMonitorUx.test.tsx src/features/pro-workbench/monitorMathematicalFreeze.test.ts src/features/pro-workbench/monitorParity.test.tsx src/features/pro-workbench/monitorParityVerified.test.tsx src/pages/pro/finalProWorkbenchDesign.test.tsx src/pages/pro/proRecipeUxRepair.test.tsx
npm test -- --run src/features/pro-workbench/monitorParity.test.tsx src/features/pro-workbench/monitorParityVerified.test.tsx src/features/pro-workbench/monitorSummaryView.test.ts src/features/pro-workbench/proProfilePreflightUx.test.tsx src/pages/pro/finalProWorkbenchDesign.test.tsx src/pages/pro/proRecipeUxRepair.test.tsx src/features/pro-workbench/professionalMonitorUx.test.tsx src/features/pro-workbench/monitorMathematicalFreeze.test.ts
npm test -- --run
npm run build
```

Browser QA servers (both stopped after verification):

```text
npm run preview -- --host 127.0.0.1 --port 4174
npx vite --config .tmp/vite.monitor-qa.config.ts --host 127.0.0.1 --port 4175
```

The temporary Vite QA configuration was deleted and is not part of the change.

## 6. Test results

- Typecheck: PASS.
- Lint: PASS with 0 errors and 2 pre-existing Fast Refresh warnings in
  `src/app/router.tsx` and `src/features/pro-core/RecipeVersionsSection.tsx`.
- Focused mathematical/UX/model suite: 3 files, 25 tests PASS.
- Final focused Monitor/Pro integration suite: 6 files, 76 tests PASS.
- Extended Monitor/Profile/Pro integration suite: 8 files, 100 tests PASS.
- Full suite: 398 files, 5395 tests PASS.
- Production build: PASS; 1025 modules transformed.
- Final bundles:
  - JavaScript: `dist/assets/index-BdRv_F1d.js`
  - CSS: `dist/assets/index-jHFWkB9E.css`
- Existing build warning retained: main JavaScript chunk is larger than 500 kB.
- Vitest prints the existing non-fatal `failed to load ./ita.special-words` line; process
  exits 0 with all tests passing.

## 7. Previously accepted flows retested

- Full repository suite retested Engine science, formulation, Preview/Apply/Undo,
  canonical ingredient identity/deduplication, locks/exclusions, current-draft sync,
  Profile preflight, Production, Summary, saved-recipe rules and Pro workbench layout.
- Five golden recipes proved exact numerical equality between old and redesigned Monitor
  raw values.
- The exact shared Profile axes were verified in Monitor; moving sweetness target from
  position 50 to 100 left the actual marker at 50 and Sucrose at 130 g.
- Preflight reminder opened Profile; after `Potwierdź ustawienia`, its Monitor count was 0.
- Problem recipe: score 4/10 and affected modules/details automatically opened.
- Stabilizer risk: Stability module/details automatically opened without changing the
  existing technical-score calculation.
- Empty recipe: `—/10`, 0 actual markers and all unevaluated metrics rendered grey.
- Tooltip was visibly open after tap on mobile.

## 8. Deployment environment verified

- No staging or production deployment was requested or performed.
- Production preview at `http://127.0.0.1:4174/pro/monitor` served the built application
  and correctly showed the Pro paywall without an authenticated Pro session.
- Visual/interactive QA used the repository's built-in DEV Pro persona at
  `http://127.0.0.1:4175/pro/monitor`; both QA servers were stopped afterward.
- Desktop viewport: 1440×900; page `scrollX=0`, `scrollY=0`, body width 1440/1440.
- Mobile viewport: 390×844; body and dialog width 390/390 with no horizontal overflow.
- Browser console: 0 errors; only the expected DEV warning that the products backend is
  not configured.

## 9. Remaining incomplete items

- Pink direction-target controls remain explicitly `STEROWANIE W PRZYGOTOWANIU`; this
  task intentionally did not connect them to solver reformulation.
- Nutrition/Cost remains `DO PRZEGLĄDU` by owner instruction.
- Owner diagnostics remains intentionally separate and ADVANCED.
- A truly authenticated production-mode Pro browser session was not available locally;
  the production bundle itself was built and served, while interaction QA used DEV Pro.
- Existing Fast Refresh warnings and large-chunk warning remain outside this scope.

## 10. Exact blockers and required external actions

- Owner visual verification is required for the final Monitor hierarchy and density.
- If production-mode browser evidence behind real access is required, an authenticated
  Pro session/backend configuration must be supplied. No bypass was attempted.
- Deployment requires a separate explicit owner request; none was performed.

## 11. Git diff and commit status

- Scope is isolated on `codex/pro-monitor-ux`, based on the accepted Profile commit.
- Protected Engine/formulation/recipe-store/Preview paths have an empty diff.
- All scoped code, tests, this ledger and the screenshot evidence are intended to be
  committed together in the branch HEAD.
- The mandatory `.codex/run-review` marker is created only after the commit and therefore
  remains intentionally uncommitted.
- No push, merge, rebase, deployment or mapper dataset change was performed.

## Screenshot evidence

Desktop:

1. `reports/qa/pro-monitor-ux/01-healthy-desktop.png`
2. `reports/qa/pro-monitor-ux/02-shifted-sweetness-desktop.png`
3. `reports/qa/pro-monitor-ux/03-freezing-expanded-desktop.png`
4. `reports/qa/pro-monitor-ux/04-sugars-expanded-desktop.png`
5. `reports/qa/pro-monitor-ux/05-problem-state-desktop.png`
6. `reports/qa/pro-monitor-ux/06-stability-problem-desktop.png`
7. `reports/qa/pro-monitor-ux/07-owner-diagnostics-desktop.png`
8. `reports/qa/pro-monitor-ux/08-owner-diagnostic-values-desktop.png`
9. `reports/qa/pro-monitor-ux/09-no-evaluation-desktop.png`

Mobile:

10. `reports/qa/pro-monitor-ux/10-healthy-mobile.png`
11. `reports/qa/pro-monitor-ux/11-freezing-expanded-mobile.png`
12. `reports/qa/pro-monitor-ux/12-problem-state-mobile.png`
13. `reports/qa/pro-monitor-ux/13-no-evaluation-mobile.png`
14. `reports/qa/pro-monitor-ux/14-metric-tooltip-mobile.png`
