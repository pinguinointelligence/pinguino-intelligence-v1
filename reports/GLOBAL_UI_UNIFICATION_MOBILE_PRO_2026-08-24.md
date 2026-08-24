# Global UI unification + mobile Pro UX — completion ledger (2026-08-24)

Branch `claude/ui-unification`, rebased on `origin/staging` @ `1da56d0`.
Owner brief: use the desktop `/pro/production` workbench as the visual master for
the whole authenticated application, and rebuild the mobile experience as the
same instrument fitted to one hand. **No deployment** (not requested).

## 0. What the inspection found (before any change)

- `/pro/production` is NOT a separate page: `production` is one of the three
  workbench sections of `ProWorkspacePage` (`isWorkbenchSection`), rendered by
  `StudioEngineSurface` → `IngredientBuilder` + `RecipeProfilePanel`.
- The Pro geometry tokens (`--pro-page-gutter`, `--pro-workbench-gap`,
  `--pro-dialog-gutter`) lived **inside `.theme-pro-light`**, so no screen
  outside the workbench could use them; every other page invented `max-w-6xl` +
  `px-6`.
- `AppShell` rendered **two different headers**: with `viewportLock` the
  hamburger was top-LEFT and the header was 82 px; without it the hamburger was
  top-RIGHT and the header was ~65 px. That is the "shell jumps" the brief names.
- Below `md` the ingredient table collapsed to `grid-cols-1`, so ONE ingredient
  occupied ~650 px of phone screen (name, % stepper + lock, g stepper + lock,
  price, ••• menu — all expanded, all at once).
- The mobile cockpit was a single black "Otwórz kokpit receptury" button; the
  four modules were only reachable inside the opened sheet.

## 1. Files / components changed

| File                                                                                                                                                      | Change                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `src/styles/tokens.css`                                                                                                                                   | **New `:root` geometry block** — the Pro numbers promoted to global tokens (+ `--pro-app-max-width`, `--pro-content-measure`, `--pro-mobile-gutter`, `--pro-header-height`, `--pro-bottom-nav-height`).                      |
| `src/styles/theme-pro-light.css`                                                                                                                          | Geometry declarations removed (now inherited); new `.ingredient-line-changed` marker.                                                                                                                                        |
| `src/features/shell/shellGeometry.ts`                                                                                                                     | **NEW** — the one page-geometry module (`APP_SHELL_MAX_WIDTH_CLASS`, `APP_HEADER_ROW`, `APP_PAGE_WORKSPACE`, `APP_PAGE_MEASURE`, `APP_PAGE_BLOCK`).                                                                          |
| `src/features/shell/AppShell.tsx`                                                                                                                         | One header row for both modes; hamburger FIRST on every screen; one header height; default width = the Production master.                                                                                                    |
| `src/components/ui/DialogShell.tsx`                                                                                                                       | **NEW** — the line-dialog modal primitive lifted out of `IngredientRow`, plus a `placement="bottom"` sheet variant (safe-area aware). Behaviour of the existing dialogs is unchanged.                                        |
| `src/features/ingredient-builder/IngredientLineControls.tsx`                                                                                              | **NEW** — `MobileIngredientLine` (collapsed row) + `MobileIngredientSheet` (editing view) + the shared `MainRoleGlyph`.                                                                                                      |
| `src/features/ingredient-builder/IngredientRow.tsx`                                                                                                       | Collapsed line below `lg`, table at `lg+`; the ••• menu body extracted to ONE `optionsList` consumed by both the desktop dialog and the mobile sheet; `changed` marker plumbing; `DialogShell`/`MainRoleGlyph` now imported. |
| `src/features/ingredient-builder/IngredientBuilder.tsx`                                                                                                   | Computes the change signatures; hides the in-toolbar action dock below `xl` (it is pinned above the mobile bar instead).                                                                                                     |
| `src/features/ingredient-builder/ingredientChangeHighlight.ts`                                                                                            | **NEW** — pure signature + diff model.                                                                                                                                                                                       |
| `src/features/ingredient-builder/ingredientChangeStore.ts`                                                                                                | **NEW** — persisted clean-state baseline + `useChangedIngredientLines`.                                                                                                                                                      |
| `src/features/pro-workbench/WorkbenchModuleTabs.tsx`                                                                                                      | One component, two placements (`variant="header"                                                                                                                                                                             | "bottom"`), collapse-on-re-tap, safe-area padding. |
| `src/features/studio/StudioEngineSurface.tsx`                                                                                                             | Bottom preview bar replaces the cockpit trigger; sheet never covers the bar; collapse is a route change; duplicate in-sheet tab row removed.                                                                                 |
| `src/components/shared/DestinationSurface.tsx`, `src/pages/recipes/MyRecipesPage.tsx`, `src/pages/NotFoundPage.tsx`, `src/pages/pro/ProWorkspacePage.tsx` | Normalized onto the shared workspace + the `pro-studio-radius-system theme-pro-light` scope.                                                                                                                                 |

## 2. Shared primitives introduced / consolidated

1. `shellGeometry.ts` — the single source of page origin, gutters, width, header.
2. `components/ui/DialogShell.tsx` — one modal primitive (centered + bottom sheet)
   for row menus, substitute/required/data dialogs and the mobile ingredient sheet.
3. `WorkbenchModuleTabs` — one module navigation, two placements.
4. `optionsList` in `RecipeRow` — one options model, two consumers.
5. `MainRoleGlyph` — one crown, used by the table row and the mobile sheet.
6. `ingredientChangeHighlight` — one change model, one CSS marker class.

## 3. Desktop

Preserved exactly: the two-column split, the 1776 px workspace, the 82 px
header, the module tabs in the header, the editor card geometry, the ingredient
table, the Monitor pane, the review zone.
Changed: the hamburger is the first header element on **every** screen (it
already was on the workbench); non-workbench screens now inherit the workbench's
origin, gutters, width and header height; a changed ingredient line carries the
attention rail.
Measured at 1440 px: hamburger `left: 29`, `top: 23`, header `82 px`, content
origin `29` — **identical** on `/pro/production` and on `/production`.

## 4. Mobile

- Collapsed recipe: name · % · g. The full recipe + toppings + final mass now fit
  one 390×844 screen (previously ~1 ingredient per screen).
- Tap a line → bottom sheet: name + `?` (existing ingredient-data dialog), price
  with `Zmień` (existing `CustomerPriceEditor`), Main crown (existing authority,
  honest block reason), line cost, "Więcej opcji składnika" = the desktop menu.
- Thumb zone: full-width `%` and `g` `DirectNumberControl`s — the same −/value/+/lock
  language as desktop — plus `Gotowe`. Grams control sits at y≈810 of 932.
- Bottom preview bar `Receptura | Monitor | Produkcja | Etykieta`: tap = open,
  tap the open one = collapse, tap another = switch. Collapse/switch are ROUTE
  changes (`/pro/recipe`, `/pro/monitor`, `/pro/production`, `?panel=summary`).
- The sheet stops above the bar, so the control that opened it is always tappable;
  the score / `Przelicz` strip sits directly above the bar.

## 5. Changed-ingredient marker (§8)

Presentation only. A line is marked when its signature — product identity,
grams, lock, Main role, required, unavailable, effective €/kg, price source —
differs from the baseline captured at the last accepted state. Baseline is
re-captured on a cold start, on the dirty→clean EDGE (save / load), and when
another recipe/version is opened. Visual: an **inset** 2 px `--color-attention`
rail (cannot shift the row), a 4 % tint, and attention-coloured numerals on
mobile. `--color-attention` is the system's existing "pending / unsaved /
requires attention" token — no new colour, and deliberately not `--color-gold`,
which the design lock reserves for the golden range.

## 6. Business logic

Untouched. No Engine, solver, PAC/POD/NPAC, pricing, Apply/Preview, save/version,
RLS, API or persistence change. The only store added is a presentation baseline.

## 7. Verification

- Typecheck: PASS. Lint (changed areas): 0 errors, 0 warnings. Build: PASS.
- Tests: 660 files / 8410 tests — 8309 pass, 100 skipped, and **1 CPU-budget
  flake**: `mainTechnicalMaximum.test.ts > does not cross the 20% ECO Main floor
…` exceeded its own 60 s budget (81 s) while a dev server and a browser were
  competing for the machine. Re-run in isolation on the same tree: **45/45 PASS**
  in 74 s. No solver code is touched by this branch. Affected-area suites
  (`shell`, `pages/pro`, `ingredient-builder`, `pro-workbench`, `studio`):
  70 files / 807 tests PASS. New: `ingredientChangeHighlight.test.ts` (14) and
  `mobileProUx.test.tsx` (14).
- Three pre-existing source-lock tests were updated because this brief
  deliberately supersedes them: `canonicalShell` (hamburger LEFT everywhere),
  `desktopStructureLock` (geometry moved into the shared module),
  `finalProWorkbenchDesign` (bottom preview bar replaces the cockpit trigger).
- Browser QA at 1440 / 1280 / 1024 / 834 / 768 / 430 / 390 / 375: no horizontal
  page overflow, no clipped controls, no sub-44 px touch targets.

## 8. Open / not done

- **Pre-existing, unrelated — now filed separately** as
  `reports/BUG_DEMO_PRESET_BASE_RECIPE_AUTHORITY.md` (owner decision 2026-08-24:
  out of scope for this UI workstream, no solver/authority change here):
  on the DEV demo preset a gram edit is refused with
  "Brak zatwierdzonego uprawnienia BASE_RECIPE dla: milk-base:milk_3_5"
  (product-behaviour authority). Reproduced on `origin/staging` **before** these
  changes — not a regression, but it means the served change-marker path was
  exercised via required/unavailable/price, not via grams, in local QA.
- Authenticated served QA on staging still needs an owner sign-in (Claude never
  types credentials).
- The mobile cockpit sheet keeps its accepted fixed height (92 dvh). **Owner
  decision 2026-08-24: KEEP the 92 dvh contract** — it is not to be changed
  merely to remove empty space on a short panel.
- **Owner decision 2026-08-24:** the three updated source-lock tests (hamburger
  side, shared geometry location, cockpit trigger) are ACCEPTED; this ledger is
  the standing explanation of why they changed.
- **Owner decision 2026-08-24:** the collapsed ingredient layout stays below
  `lg`; the five-column desktop table must not be squeezed into 768–1024 px if
  that requires truncating ingredient names.
- **Owner decision 2026-08-24:** the changed-line treatment stays on the
  attention/pending token — it is NOT to be switched to gold.
- `vite.qa.config.ts` is a local, untracked QA-only config (this worktree links
  `node_modules` to a sibling). Not committed.

## 9. Served staging QA — two defects found in this work and fixed

Both were invisible on the DEV demo preset and only appeared against a real
authenticated Pro recipe ("QA Lost PL.zoltka UNLOCKED v2", 8 base lines).

1. **Five of eight lines falsely marked as changed.** Two independent causes,
   both found only against real data:
   a. the signatures were read from the `items` the surface was RENDERING, and
   Produkcja hands `IngredientBuilder` the production forecast instead of the
   planning result — so a module switch looked like an edit. Fixed by reading
   the CANONICAL recipe vector (`storeItems`), identical in every module.
   b. the real cause of the 5/8: the baseline was frozen at first render, but
   the owner's „MOJA CENA" overrides are FETCHED AFTER first paint. The five
   marked lines were exactly the five carrying a „Moja" price — proven by
   dumping the stored baseline (`…|1.2000|mapper_reference`) against the
   hydrated value. Fixed by making the rule explicit: a line is marked when
   it differs from the last ACCEPTED state, and the baseline therefore tracks
   the signatures for as long as `recipeStore.dirty === false`. Any async
   hydration is absorbed; every real edit still dirties the draft and stays
   marked until saved or applied.
   Deliberate, documented consequence: a value that never dirties the draft — an
   account-level price, the required/unavailable UX flags — is absorbed rather
   than marked, because the app persists it immediately and there would be no
   pending state for the marker to clear on. Regression tests: "reads the change
   signature from the CANONICAL recipe vector, not the rendered one" and "keeps
   the baseline on the CLEAN draft, so async hydration cannot fake a change".
2. **The sheet header truncated the catalog name.** Real Mapper names
   ("CREAM 30% · Mlekovita Cream · Chilled") are longer than a phone line, and
   the detail view truncated too — so the full name was unreachable on mobile.
   Fixed: the sheet header wraps; the collapsed list row still keeps one line.
   Regression test: "shows the WHOLE catalog name in the detail view".

3. **Lines marked while showing identical numbers.** A percentage edit
   rebalances the other lines and can leave a residue below the displayed
   precision: served QA left SUCROSE at 135.0004 g and INULIN at 120.9996 g,
   both still rendering `135 g` and `121 g`, yet both marked. The signature
   compared grams at three decimals while the row shows one. Fixed: the
   comparison now rounds exactly the way the display rounds, so the marker only
   ever claims a change the owner can read off the row. Rounding stays
   display-only — nothing re-enters the Engine or any saved value. Regression
   test: "compares at the precision the row SHOWS, so an invisible residue is
   not marked".
