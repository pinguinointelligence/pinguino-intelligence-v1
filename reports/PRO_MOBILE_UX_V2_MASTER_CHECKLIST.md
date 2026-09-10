# GELLATTI PRO MOBILE UX v2 — MASTER CHECKLIST

One persistent checklist for BOTH workstreams. Every checkpoint lists every item
individually. Legend: ⬜ NOT_STARTED · 🟨 ACTIVE · ⏸ WAITING_OWNER · ⛔ BLOCKED ·
🧪 IMPLEMENTED_TESTED · ✅ ACCEPTED · ↔ RECONCILIATION_REQUIRED · ➖ NOT_APPLICABLE

- Branch / worktree: `claude/pro-mobile-ux-v2-a` · `~/Developer/pinguino-pro-mobile-ux-v2`
- Base: `origin/staging` `d9507eed` (2026-09-10 14:00, #256) = served staging
  `dpl_DLHTExYJqGzM5xYr8aTU798nLszn`. Staging has since moved to `27961655` (#257); this
  branch merges into it cleanly (`git merge-tree`, no shared files).
- **Execution gate:** Workstream B starts ONLY after A's full A1–A11 final ledger AND
  the owner's exact words `OWNER APPROVAL — START WORKSTREAM B`.

## Checkpoint 2 — 2026-09-10 · Workstream A final

### Workstream A — technical stabilization

| #   | Item                                  | State                 | Outcome                                                                  |
| --- | ------------------------------------- | --------------------- | ------------------------------------------------------------------------ |
| A1  | Single-finger mobile scroll           | 🧪 IMPLEMENTED_TESTED | one scroll owner per layout + one counted page lock (`46ffd02e`)         |
| A2  | Bottom nav / safe area / scroll end   | 🧪 IMPLEMENTED_TESTED | measured bottom-stack variable, 62 px → 0 px (`46ffd02e`)                |
| A3  | Settings navigation anchor            | 🧪 IMPLEMENTED_TESTED | reveal in the visible copy + route-transition race fixed (`46ffd02e`)    |
| A4  | Mobile Label crash                    | 🧪 IMPLEMENTED_TESTED | React #185 twin-mount loop fixed; isolated from v2.2 SAFE (`1ab0ae1a`)   |
| A5  | Duplicate double-arrow control        | ➖ NOT_APPLICABLE     | ALREADY CORRECT — NO CHANGE: two live actions, neither legacy            |
| A6  | Responsive recipe name                | 🧪 IMPLEMENTED_TESTED | wraps below 60rem, CSS-only; desktop unchanged (`8cb984bb`)              |
| A7  | Gelato hardness control               | 🧪 IMPLEMENTED_TESTED | Outcome B: rule preserved, customer-language reason shown (`0bb7ff92`)   |
| A8  | Product card touch target             | ➖ NOT_APPLICABLE     | ALREADY CORRECT — NO CHANGE on phones (full-row target since `042a3134`) |
| A9  | Accidental text selection             | 🧪 IMPLEMENTED_TESTED | opt-in `gellatti-touch-control` on touch controls only (`46ffd02e`)      |
| A10 | Unexplained fruit dot                 | ➖ NOT_APPLICABLE     | ALREADY CORRECT — NO CHANGE: it is the estimated-data marker, kept       |
| A11 | Scroll / overlay stability regression | 🧪 IMPLEMENTED_TESTED | multi-viewport pass + focus-return test; one DEV-only artifact proven    |

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

Completion: **A 11/11 resolved (100 %)** — 8 implemented + tested, 3 already correct;
0/11 owner-accepted · **B 0/15 (0 %)** · **total 11/26 (42 %)**.

## Evidence

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
  and scrolls to the top. That is React StrictMode's DEV-only double effect: with a
  control placed before the row, a production mount returns focus to the line, and the
  same test inside StrictMode reproduces the jump. `DialogShell` is unchanged.

Gates on this branch:

- `npm run verify:staging` PASS: owner-locked guard OK; protected-path guard OK
  (`IngredientLineControls.tsx` PRESENTATION −1/+1); owner-locked contracts 22 files /
  215 tests; `tsc -b`; lint 0 errors; build ✓.
- Full suite: 1071 files passed, 25 skipped; 13489 tests passed, 129 skipped; 0 failures.

## Workstream B — dependency and ownership map (planning only, no B code)

Recorded during Workstream A; B0 must re-inspect the live repository before any edit.

| B item | Depends on (A)                        | Files / systems likely touched                                                                                            | Overlap to reconcile                                                                                                                |
| ------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| B1     | A2, A3                                | `StudioEngineSurface.tsx`, `WorkbenchModuleTabs.tsx`, `ProWorkspacePage.tsx`                                              | —                                                                                                                                   |
| B2     | A1 (one scroll owner), A2 (stack var) | `StudioEngineSurface.tsx` (sheet + stack), `RecipeProfilePanel.tsx`, `mobileCockpitModal.ts`                              | A1/A2/A3 hunks in the same files; the desktop column stays mounted on phones (twin copies)                                          |
| B3     | A3                                    | `WorkbenchSettingsLine.tsx`, `recipeProfileStore`, new-recipe starter (`recipes/newRecipeStarter.ts` is a PROTECTED path) | account-default question in P1-A memory                                                                                             |
| B4     | —                                     | settings sequence components                                                                                              | v2.2 SAFE tutorial step pattern (`src/features/tutorial/*`)                                                                         |
| B5     | —                                     | batch control (`DirectNumberControl.tsx`, `WorkbenchSettingsLine.tsx`)                                                    | **open PR #158** (`codex/pro-recipe-lock-recalc`) edits `DirectNumberControl.tsx` (merge-tree clean with A)                         |
| B6     | A2, A3                                | `WorkbenchRecipeActionDock.tsx`, `ProRecalcPanel.tsx`, currentness state                                                  | **active Codex** `codex/mapper-authority-proposed-input` edits `ProRecalcPanel.tsx`, `applyPipeline.ts`, `constraintStudioStore.ts` |
| B7     | A6                                    | `ProWorkbar.tsx` (A6 added the wrapping name presentation)                                                                | **v2.2 SAFE** mounts `<ProWorkbar variant="panel">` in `ProductionCockpit.tsx` — reuse, never clone                                 |
| B8     | A3                                    | `ProRecalcPanel.tsx` (SETTINGS_CONFIRMATION_REQUIRED), `ProWorkspacePage.tsx`                                             | same active Codex branch as B6                                                                                                      |
| B9     | A1, A2, A3 (route race)               | `StudioEngineSurface.tsx`, `WorkbenchModuleTabs.tsx`, `mobileCockpitModal.ts`, `workbenchRoute.ts`                        | A3's `reconcileMobileCockpitRoute` is the navigation state authority to build on                                                    |
| B10    | A5, A8, A10                           | `IngredientRow.tsx`, `IngredientLineControls.tsx` (both PROTECTED), `IngredientPriceControl.tsx`                          | A5 two ⇄ icons for two live actions; A8 ••• only on ≥ 960 px touch tablets; A10 dot meaning not visible at a glance                 |
| B11    | A1 (sheet scroll), A8                 | `IngredientLineControls.tsx` sheet, `DialogShell.tsx` (A1 changed its lock)                                               | `recipe_line_id` identity is the only link                                                                                          |
| B12    | —                                     | shared radii / buttons                                                                                                    | frozen Direction contrast, frozen header                                                                                            |
| B13    | —                                     | **v2.2 SAFE** `src/features/tutorial/*`, `AppShell.tsx`, `AppNavDrawer.tsx`                                               | A1 changed the drawer's lock hunk; v2.2 SAFE adds a menu row further down (merge-tree clean)                                        |
| B14    | —                                     | `public/brand/*` (v2.2 SAFE adds profile images), image components                                                        | —                                                                                                                                   |

## Checkpoint 1 — 2026-09-10 · Workstream A start (history)

A1 🟨 · A2 🟨 · A3 🟨 · A4 🧪 (`1ab0ae1a`) · A5 🟨 · A6 🟨 · A7 🟨 · A8 🟨 · A9 🟨 ·
A10 🟨 · A11 ⬜ · B0–B14 each ⏸ WAITING_OWNER (B0 ⏸ · B1 ⏸ · B2 ⏸ · B3 ⏸ · B4 ⏸ · B5 ⏸ ·
B6 ⏸ · B7 ⏸ · B8 ⏸ · B9 ⏸ · B10 ⏸ · B11 ⏸ · B12 ⏸ · B13 ⏸ · B14 ⏸). Completion then:
A 1/11 (9 %) · B 0/15 · total 1/26 (4 %).
