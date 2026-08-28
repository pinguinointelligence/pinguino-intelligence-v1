# Gellatti V2.1 — implementation and local served-runtime audit

Date: 2026-08-28

Branch: `codex/gellatti-v2-1-staging-ui`

Base / current `origin/staging`: `7edd90ea14299f3af47364a6dc119cc2b0970179`

## Authority and scope

The implementation follows the approved light `/pro/production` + Gellatti V2 direction and the owner-approved PRO Workbench V2.1 correction set. It is a visual migration of the existing runtime components, not a new design direction.

Hard contracts preserved:

- desktop PRO tab container remains anchored to the accepted right Workbench column;
- mobile PRO keeps the existing list + single bottom-sheet interaction model;
- the same closed padlock glyph is used for percent and gram locks;
- the existing crown/main-role behavior remains present;
- the Monitor retains all seven real modules and the existing expandable detail behavior;
- Production and Label gates remain driven by current runtime authority;
- `FriendlyLabMomentViewport` is not mounted;
- no Engine, Solver, Mapper, Product Intelligence, ProductBehavior, Scanner/TEXTIMPORT, Production/Rescue calculation, Label calculation, or current-result authority file was changed.

## Implemented visual migration

- shared public Gellatti wordmark replaces the obsolete AI lockup in the application shell, landing page and subscription page;
- Graphite `#191A1D`, Greige/Ivory and sparse Orange focus/action accents are aligned to the owner brand authority;
- desktop Recipe controls use the approved compact 32 px geometry while mobile quantity and lock controls remain 44 px;
- the percentage and gram controls retain their units in the value field and show a recognizable closed padlock in the dedicated lock cell;
- profile direction axes retain exactly `−2, −1, 0, +1, +2` and use the approved compact rail presentation;
- Recipe settings retain their current values and actions, with the approved visual order and 46 px desktop fields;
- Monitor uses icon / label / badge / rail / value / chevron geometry, with POD/NPAC/PAC before their rails and Ice Fraction in the existing expanded Freeze details;
- Production ready and active progress use the compact count + rail pattern; a score is only rendered when a real score exists;
- the existing heat acknowledgement is placed on the one matching desktop ingredient row; mobile retains the existing Production card and action unchanged;
- the existing production completion and Label transition logic are unchanged.

## PRO served-runtime proof

All screenshots below are from the real Vite-served application at `http://127.0.0.1:4176`, not static preview components.

| View       | Served route/state         | Desktop                                               | Exact 390 × 844                                                          | Local status                                                          |
| ---------- | -------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Recipe     | `/pro/recipe`              | `pro-recipe-1440x900.png`, `pro-recipe-1800x1000.png` | `pro-recipe-list-390x844.png`, `pro-recipe-ingredient-sheet-390x844.png` | PASS                                                                  |
| Monitor    | `/pro/recipe` → Monitor    | current DEV fixture is ProductBehavior-stale          | `pro-monitor-390x844.png`                                                | BLOCKED — authentic current runtime asks for product revalidation     |
| Production | `/pro/recipe` → Production | `pro-production-blocked-1440x900.png`                 | `pro-production-blocked-390x844.png`                                     | BLOCKED — authentic current runtime has no verified executable recipe |
| Label      | `/pro/recipe` → Label      | gated by current production completion authority      | `pro-label-blocked-390x844.png`                                          | BLOCKED — no completed run in the available DEV fixture               |

Desktop tab anchor measurements:

- 1440 px viewport: tab container `x = 891.25`, `right = 1411.195`; no horizontal overflow;
- 1800 px viewport: tab container `x = 1114.5625`, `right = 1768`; no horizontal overflow;
- switching Receptura / Monitor / Produkcja / Etykieta is covered by `desktopTabAnchorContract.test.tsx` and causes 0 px container movement.

Exact 390 px mobile measurements:

- one ingredient dialog, `x = 0`, `width = 390`, bottom-anchored at `y = 284`, height `560`;
- percent controls: minus `44`, input `44` high, plus `44`, lock `44`;
- grams controls: minus `44`, input `44` high, plus `44`, lock `44`;
- no horizontal overflow;
- Monitor, Production and Label each open one existing mobile Workbench dialog; no desktop controls are copied into mobile.

## Global local route audit

Desktop diagnostic screenshots were captured for the served routes below. Routes with document scroll produced content-area captures of `1425 × 891`; these are diagnostic artifacts and are not falsely labelled as exact `1440 × 900` acceptance proof. The Machine page capture is exact `1440 × 900`.

| Route            | Served result             | Artifact                           | Local status                                            |
| ---------------- | ------------------------- | ---------------------------------- | ------------------------------------------------------- |
| `/`              | public Home/landing       | `global-home-1425x891.png`         | PASS diagnostic                                         |
| `/how-it-works`  | How it works              | `global-how-it-works-1425x891.png` | PASS diagnostic                                         |
| `/shop`          | Shop empty/coming state   | `global-shop-1425x891.png`         | PASS diagnostic                                         |
| `/franchise`     | Franchise                 | `global-franchise-1425x891.png`    | PASS diagnostic                                         |
| `/community`     | Community empty state     | `global-community-1425x891.png`    | PASS diagnostic                                         |
| `/top100`        | Top 100 empty state       | `global-top100-1425x891.png`       | PASS diagnostic                                         |
| `/recipes`       | Recipe library            | `global-recipes-1425x891.png`      | PASS diagnostic                                         |
| `/products`      | Product catalog plan gate | `global-products-1425x891.png`     | PASS diagnostic                                         |
| `/products/scan` | Scanner                   | `global-scanner-1425x891.png`      | PASS diagnostic                                         |
| `/production`    | Production hub plan gate  | `global-production-1425x891.png`   | PASS diagnostic                                         |
| `/labels`        | Labels hub                | `global-labels-1425x891.png`       | PASS diagnostic                                         |
| `/account`       | Account                   | `global-account-1425x891.png`      | PASS diagnostic                                         |
| `/machine`       | Machine empty state       | `global-machine-1440x900.png`      | PASS exact desktop                                      |
| `/subscription`  | Plans                     | `global-subscription-1425x891.png` | PASS diagnostic                                         |
| `/api`           | Integrations coming state | `global-api-1425x891.png`          | PASS diagnostic                                         |
| `/work-with-us`  | Work with us              | `global-work-with-us-1425x891.png` | PASS diagnostic                                         |
| `/admin`         | non-admin guard           | `global-admin-1425x891.png`        | BLOCKED — available local owner fixture is not an admin |

The partial `375 × 812` captures are retained only as responsive diagnostics. They are not counted as the required exact 390 px final acceptance proof.

## Functional parity audit

- No prohibited domain/math paths appear in the diff.
- Recipe quantity events, lock callbacks, main-role callbacks, settings callbacks and recalculation authority are unchanged.
- Monitor values continue to come from the existing monitor view; only presentation order and row density changed.
- The Production heat action still calls the existing `acknowledgeHeatInformation`; it has no new process selection or calculation.
- Production score rendering only suppresses an absent (`null`) score; no score is computed in the UI.
- Production and Label prerequisite gates were exercised and continue to block honestly against the available stale DEV fixture.
- Mobile screens use the existing tabs, dialogs and callbacks.

## Repository gates

| Gate                                                    | Result                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------- |
| Focused global + PRO UI/responsive/functional contracts | PASS — 16 files, 239 tests                                          |
| Focused global route/shell contracts                    | PASS — 5 files, 35 tests                                            |
| Previously interrupted import/lock files                | PASS — 3 files, 63 tests                                            |
| Full suite (`npm test`)                                 | PASS — 788 files passed, 23 skipped; 9663 tests passed, 122 skipped |
| Typecheck (`npm run typecheck`)                         | PASS                                                                |
| Lint (`npm run lint`)                                   | PASS                                                                |
| Production build (`npm run build`)                      | PASS                                                                |
| Whitespace (`git diff --check`)                         | PASS                                                                |
| Prohibited-path diff audit                              | PASS — no changed files                                             |

The full suite retained the repository's known non-failing OCR diagnostic `failed to load ./ita.special-words`. The first full attempt overlapped a separate full-suite process from another worktree and two imports hit temporary-directory `ENOSPC`; those files passed 63/63 in isolation, then the clean full rerun passed in full.

## Acceptance state

This is local served-runtime proof only. It is not deployed-staging proof and cannot close the global recovery workstream.

Repository deployment history confirms that a push to `origin/staging` is the established automatic trigger for the linked Vercel project `pinguino-staging` (`prj_6h8PDTCUrdDdXNzfEfjJNsVL5BcE`). This branch has not been pushed, so no Vercel deployment was triggered in this implementation pass.

**GLOBAL UI/UX REDESIGN — OPEN / IMPLEMENTATION IN PROGRESS**

Remaining owner-acceptance gates:

- obtain usable staging QA fixtures/roles for ProductBehavior-valid Monitor, ready and active Production, completed Production, Label, and admin details;
- push/deploy only after all repository gates pass;
- recapture every required route from the deployed staging commit at desktop and exact 390 × 844;
- compare deployed screenshots to the approved authority and mark PASS / PARTIAL / FAIL / BLOCKED.
