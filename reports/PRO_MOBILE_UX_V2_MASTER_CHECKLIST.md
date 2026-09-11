# GELLATTI PRO MOBILE UX v2 — MASTER CHECKLIST

One persistent checklist for BOTH workstreams. Every checkpoint lists every item
individually. Legend: ⬜ NOT_STARTED · 🟨 ACTIVE · ⏸ WAITING_OWNER · ⛔ BLOCKED ·
🧪 IMPLEMENTED_TESTED · ✅ ACCEPTED · ↔ RECONCILIATION_REQUIRED · ➖ NOT_APPLICABLE

- Workstream A: branch `claude/pro-mobile-ux-v2-a`, landed as PR #259 → staging `ca3343d4`
  (deployment `dpl_6tAqR9HcEJqtPbtoPBBhexoztfwD`). **Owner accepted and closed A.**
- Workstream B: branch `claude/pro-mobile-ux-v2-b` from staging `ca3343d4`, merged with
  current staging `846f2886` before its PR, worktree `~/Developer/pinguino-pro-mobile-ux-v2`.
- **Execution gate:** satisfied — the owner started B explicitly („OWNER START — PRO MOBILE
  UX v2 / WORKSTREAM B", 2026-09-10) after accepting A.

## Checkpoint 4 — 2026-09-11 · Workstream B implemented, waiting for the owner's test

### Workstream A — technical stabilization

| #   | Item                                  | State       |
| --- | ------------------------------------- | ----------- |
| A1  | Single-finger mobile scroll           | ✅ ACCEPTED |
| A2  | Bottom nav / safe area / scroll end   | ✅ ACCEPTED |
| A3  | Settings navigation anchor            | ✅ ACCEPTED |
| A4  | Mobile Label crash                    | ✅ ACCEPTED |
| A5  | Duplicate double-arrow control        | ✅ ACCEPTED |
| A6  | Responsive recipe name                | ✅ ACCEPTED |
| A7  | Gelato hardness control               | ✅ ACCEPTED |
| A8  | Product card touch target             | ✅ ACCEPTED |
| A9  | Accidental text selection             | ✅ ACCEPTED |
| A10 | Unexplained fruit dot                 | ✅ ACCEPTED |
| A11 | Scroll / overlay stability regression | ✅ ACCEPTED |

### Workstream B — guided mobile flow

| #   | Item                                       | State                 | Outcome                                                                                                                                               |
| --- | ------------------------------------------ | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| B0  | Pre-start reconciliation                   | 🧪 IMPLEMENTED_TESTED | staging = A merge `ca3343d4`; #158 (lock glyph) and PACKAGE 2A share no B file; v2.2 SAFE (since integrated, #271) uses the same ProWorkbar save card |
| B1  | Target mobile information architecture     | 🧪 IMPLEMENTED_TESTED | four-module bottom bar kept; the dashboard belongs to Receptura; one next step at a time                                                              |
| B2  | Recipe dashboard as collapsible top sheet  | 🧪 IMPLEMENTED_TESTED | the dashboard hangs from the header and lifts into a sticky recipe bar (name · profile · stage) that brings it back                                   |
| B3  | Profile-first new recipe flow              | 🧪 IMPLEMENTED_TESTED | a new unconfirmed recipe opens on its settings once; confirming reveals the ingredients from above; a stored default skips it                         |
| B4  | Profile settings step navigation           | 🧪 IMPLEMENTED_TESTED | Krok n z 3 with back / forward and a progress rule, first run only; the desktop grid is unchanged                                                     |
| B5  | Target batch mass visual distinction       | 🧪 IMPLEMENTED_TESTED | whole-batch card beside the current total, mismatch explained; target kept in the collapsed row; no mass mathematics changed                          |
| B6  | Stateful primary CTA                       | 🧪 IMPLEMENTED_TESTED | settings → Przelicz → Zapisz recepturę → Przejdź do Monitora → Przejdź do Produkcji, from published facts only; PRO stays manual                      |
| B7  | Recipe save integration                    | 🧪 IMPLEMENTED_TESTED | „Zapisz recepturę" reveals the one existing name/save card; no second save system                                                                     |
| B8  | Remove redundant generic re-confirmation   | 🧪 IMPLEMENTED_TESTED | a Przelicz refused only for settings resumes after confirmation; a clean reopened saved version is not asked again; safety gates untouched            |
| B9  | Guided module transitions                  | 🧪 IMPLEMENTED_TESTED | View Transitions on the existing sheet: drop / lift / rise / sink / forward / back, ≤ 260 ms, off for reduced motion                                  |
| B10 | Product panel hierarchy                    | 🧪 IMPLEMENTED_TESTED | „Moja cena" folded until asked for in the product sheet; removing is its own row; every control kept                                                  |
| B11 | Product panel context / translucency       | 🧪 IMPLEMENTED_TESTED | the product sheet is the one translucent dialog tone; the edited line is marked and followed by its `recipe_line_id`                                  |
| B12 | Visual language consolidation              | 🧪 IMPLEMENTED_TESTED | every new surface uses the existing tokens (graphite pills, 9 px radius, legend boxes, ivory) — no third language                                     |
| B13 | Tutorial reconciliation — no second system | 🧪 IMPLEMENTED_TESTED | reconciled with the one tutorial (v2.2 §29, #271): B adds none and no hold-to-confirm; it anchors only HOME, so it never auto-starts over B3 on PRO   |
| B14 | Performance / mobile image loading         | 🧪 IMPLEMENTED_TESTED | the ≈1.7 MB tour PNGs ship as WebP (≈20–130 KB) at 960 / 1672 w, keyed per step, next step prefetched                                                 |

Completion: **A 11/11 accepted (100 %)** · **B 15/15 resolved (100 %)** — all 15 implemented +
tested; 0/15 owner-accepted · **total 26/26 resolved (100 %)**.

Gates on `5f2a62b9` (local): owner-locked guard OK · protected-paths — 2 semantic changes
(IngredientRow, IngredientLineControls) acknowledged by `Protected-Change:` trailers ·
owner-locked contracts 22 files / 215 tests ✅ · eslint `--max-warnings 0` on every changed file ✅.
The PR's first CI run failed at typecheck: the new `spatialTransition.test.ts` typed its View
Transitions stub against the DOM lib's required, overloaded `startViewTransition` (5 errors;
vitest does not typecheck, so it had run green). Fixed with a standalone stub type. On the head
merged with current staging (`846f2886`; conflict-free, no shared file) B's 12 test files
(7 new + 5 updated) pass 126/126. Merge gate: the PR's CI — contracts, typecheck, lint, full
suite, build, solver-contracts, direction-rescue.

Staging kept moving while the PR waited (strict up-to-date: nine merges by `a61446aa`); every
merge was conflict-free and shared no file with B, and CI was green on four of those heads.
Merging v2.2 SAFE (#271) tripped B13's contract, which had pinned „no tutorial exists" —
stricter than the owner's rule. It now pins the rule itself: one tutorial, B adds none, and
that tutorial (anchored only on HOME) never auto-starts on the PRO workbench.

Landed: PR #269 → staging `8684fb30` (squash tree == the CI-tested head `3126679c`, all four
jobs green, CLEAN), deploy `dpl_DC1W5iK8R4BjYbq1VqZCoZ7o72MU`, served `index-B5fNRi7H.js` /
`index-BwivwrM8.css` == its build log. Served QA (375 px, signed in, read-only): recipe bar,
first-run settings Krok 1–3 with the whole-batch card, „Potwierdź ustawienia" as the one next
step, the top-sheet dashboard with the one save card, the product sheet tone / fold / mark,
WebP tour images (`image/webp` 42–116 KB) and desktop 1280 unchanged. It also found one
defect: closing the first-run settings sheet dropped „Ustawienia czekają na potwierdzenie" and
the „settings first" step. Below 960 px Settings is mounted twice (the CSS-hidden desktop aside
and the sheet); the sheet copy cleared the published fact on unmount while its twin stayed
mounted with unchanged inputs, so nothing published it again. Fixed on
`claude/pro-mobile-ux-v2-b-settings-twin`: the fact is cleared only when the LAST copy unmounts.

Owner test on staging (the acceptance scenarios): new recipe on a phone opens its settings
from the top → Krok 1–3 → confirm lifts them into the recipe bar → Przelicz → Zapisz recepturę
→ Przejdź do Monitora → Przejdź do Produkcji; reopen a saved recipe (no second confirmation);
product sheet (Moja cena folded, removing apart, the edited line marked); desktop ≥ 960 px
unchanged. Real finger gestures and the transitions' feel need a real phone.

## Checkpoint 3 — 2026-09-10 · owner review round (A8 + A10)

### Workstream A — technical stabilization

| #   | Item                                  | State                 | Outcome                                                                                         |
| --- | ------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------- |
| A1  | Single-finger mobile scroll           | 🧪 IMPLEMENTED_TESTED | one scroll owner per layout + one counted page lock (`46ffd02e`)                                |
| A2  | Bottom nav / safe area / scroll end   | 🧪 IMPLEMENTED_TESTED | measured bottom-stack variable, 62 px → 0 px (`46ffd02e`)                                       |
| A3  | Settings navigation anchor            | 🧪 IMPLEMENTED_TESTED | reveal in the visible copy + route-transition race fixed (`46ffd02e`)                           |
| A4  | Mobile Label crash                    | 🧪 IMPLEMENTED_TESTED | React #185 twin-mount loop fixed; isolated from v2.2 SAFE (`1ab0ae1a`)                          |
| A5  | Duplicate double-arrow control        | ➖ NOT_APPLICABLE     | ALREADY CORRECT TECHNICALLY / UX DIFFERENTIATION DEFERRED TO B10/B12                            |
| A6  | Responsive recipe name                | 🧪 IMPLEMENTED_TESTED | wraps below 60rem, CSS-only; desktop unchanged (`8cb984bb`)                                     |
| A7  | Gelato hardness control               | 🧪 IMPLEMENTED_TESTED | rule kept, customer-language reason shown (`0bb7ff92`); the tester's recipe is a served-QA item |
| A8  | Product card touch target             | 🧪 IMPLEMENTED_TESTED | whole row on every touch device, ≥ 960 px tablets included; the SAME ••• panel (`1b693fa7`)     |
| A9  | Accidental text selection             | 🧪 IMPLEMENTED_TESTED | opt-in `gellatti-touch-control` on touch controls only (`46ffd02e`)                             |
| A10 | Unexplained fruit dot                 | 🧪 IMPLEMENTED_TESTED | dot removed from the desktop row and the mobile line; „Częściowo szacowane" kept (`1b693fa7`)   |
| A11 | Scroll / overlay stability regression | 🧪 IMPLEMENTED_TESTED | multi-viewport pass + focus-return test (`c5e66025`); one DEV-only artifact proven              |

### Workstream B — guided mobile flow (gated)

| #   | Item                                       | State           |
| --- | ------------------------------------------ | --------------- |
| B0  | Pre-start reconciliation gate              | ⏸ WAITING_OWNER |
| B1  | Target mobile information architecture     | ⏸ WAITING_OWNER |
| B2  | Recipe dashboard as collapsible top sheet  | ⏸ WAITING_OWNER |
| B3  | Profile-first new recipe flow              | ⏸ WAITING_OWNER |
| B4  | Profile settings step navigation           | ⏸ WAITING_OWNER |
| B5  | Target batch mass visual distinction       | ⏸ WAITING_OWNER |
| B6  | Stateful primary CTA                       | ⏸ WAITING_OWNER |
| B7  | Recipe save integration                    | ⏸ WAITING_OWNER |
| B8  | Remove redundant generic re-confirmation   | ⏸ WAITING_OWNER |
| B9  | Guided module transitions                  | ⏸ WAITING_OWNER |
| B10 | Product panel hierarchy                    | ⏸ WAITING_OWNER |
| B11 | Product panel context / translucency       | ⏸ WAITING_OWNER |
| B12 | Visual language consolidation              | ⏸ WAITING_OWNER |
| B13 | Tutorial reconciliation — no second system | ⏸ WAITING_OWNER |
| B14 | Performance / mobile image loading         | ⏸ WAITING_OWNER |

Completion: **A 11/11 resolved (100 %)** — 10 implemented + tested, 1 already correct
technically (A5, UX differentiation deferred to B10/B12); 0/11 owner-accepted ·
**B 0/15 (0 %)** · **total 11/26 (42 %)**.

## A8 + A10 — what changed (`1b693fa7`, test-only type fix `136f775c`)

- **A8.** Below 960 px the collapsed line already was one tap target (unchanged). From
  960 px the desktop-layout recipe row and topping row gain a tap surface painted UNDER the
  row's own content, shown only by `@media (pointer: coarse)`. A tap on the name, the icon or
  empty space falls through to it and calls the SAME action as ••• (`openRowMenu`,
  `openToppingMenu`) — no second flow. Steppers, inputs, locks, the crown, the ⋮⋮ drag handle
  and ••• keep their own taps (`pointer-events` re-enabled, `[draggable='true']` included).
  The surface is `aria-hidden`, `tabIndex −1` and has only an `onClick`; ••• stays the keyboard
  and assistive-technology path and a panel opened from the row returns focus to •••. A mouse
  or trackpad never renders it. No z-index (no stacking context). The recipe row reuses its own
  desktop wrapper as the positioning box, so the protected `IngredientRow.tsx` diff is 44 lines.
- **A10.** Owner decision: the small estimated-data dot beside the ingredient icon is removed
  from the desktop row AND the mobile line, with no replacement badge. The estimated flag still
  drives the product data view („Częściowo szacowane" / „Zweryfikowane"); the dead hover copy
  `estimatedHint` is deleted.

## Evidence

### A8 / A10 — local dev server on this branch (DEV persona PRO, no Supabase), Checkpoint 3

- **Touch tablet ≥ 960 px.** The pane's touch emulation (coarse pointer, 5 touch points)
  plus a 1024 px viewport meta gives a 1041 px layout with `(pointer: coarse)` and
  `(min-width: 60rem)` both true, so the desktop rows render natively.
- Hit-tests with the browser's own `elementFromPoint` on the MILK 3.5% row: icon, name and
  the empty space next to the name → the surface; the ⋮⋮ handle → its own `<span draggable>`;
  − / + steppers, the % input and ••• → themselves. The surface computes z-index `auto`,
  `touch-action: auto` (panning untouched), `tabIndex −1`, `aria-hidden`, React handlers
  `onClick` only.
- Taps (click dispatched on the hit-tested element): name → `row-menu-new-recipe-0-milk_3_5`
  opens (Moja cena · Usuń z receptury); Escape → focus on „Opcje składnika MILK 3.5% …".
  Icon → the same. ••• → the same panel id. Drag handle, grams lock (toggled, then restored)
  and stepper + → no panel.
- **Desktop mouse** 1280 × 900 (fine pointer, hover): the surface is `display: none`, not
  rendered; a click on the name hits the name `<span>` and opens nothing; ••• opens the panel;
  Escape → focus on •••; the row's tab order is its 9 controls, the surface not among them.
- **Phone** 375 × 812 (coarse): the desktop row is hidden; a tap on the collapsed line
  opens `ingredient-mobile-sheet-new-recipe-0-milk_3_5`. 0 estimated dots on desktop rows
  and mobile lines.
- **Not drivable here:** real CDP one-finger input (a tap and a swipe) timed out twice
  because the Claude window was covered. No-tap-on-scroll therefore rests on the design (an
  `onClick`-only surface: a pan never produces a click; `touch-action: auto`) and **needs
  served confirmation on a real touch tablet**.
- Tests: RED before implementation 10 failed / 3 passed (2 files); drag-handle RED 1 failed /
  18 passed; GREEN 3 files / 19 tests (recipe row, topping row, stylesheet contract). Focused
  regression 183 files / 1798 tests passed.

### Checkpoint 2 (A1–A7, A9, A11)

Served staging `d9507eed`, 375 × 812, an existing PRO session in the Browser pane:

- A2 before: Monitor sheet scrolled to its end left 62 px under the score / „Przelicz" strip.
- A4 before: tapping Etykieta showed „Nie udało się wyświetlić tej części aplikacji…";
  console: React #185 thrown from `setLabelDraft`.
- The session then expired. Claude may not type passwords, so there is no served
  after-check. **Served mobile QA by the owner is still required.**

Local dev server on this branch (DEV persona PRO, no Supabase):

- A1: below 60rem the ingredient pane computes `overflow-y: visible` /
  `overscroll-behavior: auto` at 375 × 600, 375 × 812, 430 × 932 and 768 × 1024; at
  1280 × 800 it is back to `auto` / `contain`. Page lock: product sheet, drawer and
  cockpit lock while open and unlock afterwards. A real one-finger drag could not be
  driven: the Browser pane was hidden, so no touch input reaches it.
- A2 before → after, 375 × 600: Monitor 62 → 0 px, Produkcja 62 → 0 px, Etykieta
  62 → 0 px. After: 0 px on all three at 375 × 812, 0 px on Monitor and Etykieta at
  430 × 932 and 768 × 1024. The Recipe document ends exactly at the strip (482 / 482).
  The Etykieta „Drukuj" bar sits above the strip (418 < 482). Desktop: stack variable
  `0px`, document padding `0px`.
- A3: sheet closed on /pro/recipe → the settings line lands 12 px below the scroller
  top, with focus on `workbench-settings-line`. From an open Monitor, both a settings
  request and the bar's Receptura tap used to close the sheet about 200 ms later; both
  now open Receptura.
- A6: at 375 × 812 the wrapping field is displayed and the input hidden. A 100-character
  name grows it from 27 px to 119 px (about 5 lines); ZAPISZ, ••• and „Nowa receptura"
  stay below the text and do not overlap. Desktop keeps the single-line input
  (`inline-block`, ellipsis).
- A11: closing the mobile product sheet on the DEV server sends focus to the hamburger
  and scrolls to the top (re-observed at Checkpoint 3). That is React StrictMode's
  DEV-only double effect: with a control placed before the row, a production mount returns
  focus to the line, and the same test inside StrictMode reproduces the jump.
  `DialogShell` is unchanged.

## Gates on this branch (Checkpoint 3, HEAD `136f775c`)

- The first `verify:staging` run at `1b693fa7` stopped at `tsc -b` with one error: the
  live-draft render in `proRecipeStateRegression.test.tsx` still passed the removed
  `estimated` prop (vitest ignores an unknown prop). Fixed in `136f775c`; the gates below
  ran on `136f775c`.
- `npm run verify:staging` PASS (HEAD `136f775c`): owner-locked guard OK; protected-path
  guard 2 SEMANTIC changes ACKNOWLEDGED via `Protected-Change:` (`IngredientRow.tsx`
  −16/+28, `IngredientLineControls.tsx` −11/+1); owner-locked contracts 22 files / 215
  tests; `tsc -b`; lint 0 errors (8 warnings, all in files this branch does not touch);
  build ✓.
- Full suite (`npx vitest run`, HEAD `136f775c`): 1074 files passed, 25 skipped (1099);
  13508 tests passed, 129 skipped (13637); 0 failures.
- Merge safety: `git merge-tree` against current `origin/staging` `53d7f3cb` — clean, no
  shared file. Pairwise clean with `claude/gellatti-v22-safe` `c55233e4` (shares
  `AppNavDrawer.tsx`), `claude/package-2a-priority-crowns` `0c0c79b9`,
  `codex/mapper-authority-proposed-input` `af703e56` and `codex/pro-recipe-lock-recalc`
  `667420b7` / PR #158 (shares `DirectNumberControl.tsx`, `IngredientTableUx.test.tsx`).

Checkpoint 2 gates (HEAD `c5e66025`): `verify:staging` PASS; full suite 1071 files passed,
25 skipped; 13489 tests passed, 129 skipped; 0 failures.

## Remaining served QA (owner signed in; Claude may not type passwords)

1. Phone: one-finger scroll of the recipe, bottom of every module above the strip, settings
   link lands, Etykieta opens without the error screen (A1–A4, A11).
2. Touch tablet ≥ 960 px (iPad landscape): tap name / icon / empty row space → the product
   panel; stepper, lock, crown, ⋮⋮ handle, ••• keep their own taps; a swipe that starts on a
   row scrolls and never opens the panel (A8).
3. Desktop mouse: row unchanged, only ••• opens the panel (A8).
4. No dot beside any ingredient icon; „Częściowo szacowane" in an estimated product's data
   view (A10).
5. The tester's Gelato recipe for the disabled hardness regulator and its reason (A7).

## Workstream B — dependency and ownership map (planning only, no B code)

Recorded during Workstream A; B0 must re-inspect the live repository before any edit.

| B item | Depends on (A)                        | Files / systems likely touched                                                                                            | Overlap to reconcile                                                                                                                                     |
| ------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1     | A2, A3                                | `StudioEngineSurface.tsx`, `WorkbenchModuleTabs.tsx`, `ProWorkspacePage.tsx`                                              | —                                                                                                                                                        |
| B2     | A1 (one scroll owner), A2 (stack var) | `StudioEngineSurface.tsx` (sheet + stack), `RecipeProfilePanel.tsx`, `mobileCockpitModal.ts`                              | A1/A2/A3 hunks in the same files; the desktop column stays mounted on phones (twin copies)                                                               |
| B3     | A3                                    | `WorkbenchSettingsLine.tsx`, `recipeProfileStore`, new-recipe starter (`recipes/newRecipeStarter.ts` is a PROTECTED path) | account-default question in P1-A memory                                                                                                                  |
| B4     | —                                     | settings sequence components                                                                                              | v2.2 SAFE tutorial step pattern (`src/features/tutorial/*`)                                                                                              |
| B5     | —                                     | batch control (`DirectNumberControl.tsx`, `WorkbenchSettingsLine.tsx`)                                                    | **open PR #158** (`codex/pro-recipe-lock-recalc`) edits `DirectNumberControl.tsx` (merge-tree clean with A)                                              |
| B6     | A2, A3                                | `WorkbenchRecipeActionDock.tsx`, `ProRecalcPanel.tsx`, currentness state                                                  | **active Codex** `codex/mapper-authority-proposed-input` edits `ProRecalcPanel.tsx`, `applyPipeline.ts`, `constraintStudioStore.ts`                      |
| B7     | A6                                    | `ProWorkbar.tsx` (A6 added the wrapping name presentation)                                                                | **v2.2 SAFE** mounts `<ProWorkbar variant="panel">` in `ProductionCockpit.tsx` — reuse, never clone                                                      |
| B8     | A3                                    | `ProRecalcPanel.tsx` (SETTINGS_CONFIRMATION_REQUIRED), `ProWorkspacePage.tsx`                                             | same active Codex branch as B6                                                                                                                           |
| B9     | A1, A2, A3 (route race)               | `StudioEngineSurface.tsx`, `WorkbenchModuleTabs.tsx`, `mobileCockpitModal.ts`, `workbenchRoute.ts`                        | A3's `reconcileMobileCockpitRoute` is the navigation state authority to build on                                                                         |
| B10    | A5, A8, A10                           | `IngredientRow.tsx`, `IngredientLineControls.tsx` (both PROTECTED), `IngredientPriceControl.tsx`, `ToppingRow.tsx`        | A5: the two ⇄ icons are two live actions — B10/B12 must make them distinguishable; A8: the row surface IS the touch path, keep it; A10: no badge returns |
| B11    | A1 (sheet scroll), A8                 | `IngredientLineControls.tsx` sheet, `DialogShell.tsx` (A1 changed its lock)                                               | `recipe_line_id` identity is the only link; A8 panels return focus to •••                                                                                |
| B12    | A5                                    | shared radii / buttons                                                                                                    | A5 ⇄ differentiation (with B10); frozen Direction contrast, frozen header                                                                                |
| B13    | —                                     | **v2.2 SAFE** `src/features/tutorial/*`, `AppShell.tsx`, `AppNavDrawer.tsx`                                               | A1 changed the drawer's lock hunk; v2.2 SAFE adds a menu row further down (merge-tree clean)                                                             |
| B14    | —                                     | `public/brand/*` (v2.2 SAFE adds profile images), image components                                                        | —                                                                                                                                                        |

## Checkpoint 2 — 2026-09-10 · Workstream A final (history)

A1 🧪 · A2 🧪 · A3 🧪 · A4 🧪 · A5 ➖ · A6 🧪 · A7 🧪 · A8 ➖ (then: correct on phones only) ·
A9 🧪 · A10 ➖ (then: dot kept as the estimated-data marker) · A11 🧪 · B0–B14 each ⏸
WAITING_OWNER (B0 ⏸ · B1 ⏸ · B2 ⏸ · B3 ⏸ · B4 ⏸ · B5 ⏸ · B6 ⏸ · B7 ⏸ · B8 ⏸ · B9 ⏸ · B10 ⏸ ·
B11 ⏸ · B12 ⏸ · B13 ⏸ · B14 ⏸). The owner review rejected the A8 and A10 verdicts; both were
implemented at Checkpoint 3.

## Checkpoint 1 — 2026-09-10 · Workstream A start (history)

A1 🟨 · A2 🟨 · A3 🟨 · A4 🧪 (`1ab0ae1a`) · A5 🟨 · A6 🟨 · A7 🟨 · A8 🟨 · A9 🟨 ·
A10 🟨 · A11 ⬜ · B0–B14 each ⏸ WAITING_OWNER (B0 ⏸ · B1 ⏸ · B2 ⏸ · B3 ⏸ · B4 ⏸ · B5 ⏸ ·
B6 ⏸ · B7 ⏸ · B8 ⏸ · B9 ⏸ · B10 ⏸ · B11 ⏸ · B12 ⏸ · B13 ⏸ · B14 ⏸). Completion then:
A 1/11 (9 %) · B 0/15 · total 1/26 (4 %).
