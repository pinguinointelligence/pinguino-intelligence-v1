# Gellatti PRO recipe design refresh

## Implemented scope

The existing `/pro/recipe` workbench was updated in place. Existing recipe, lock, Main/Multi-Main, topping, save/versioning, calculation and routing behavior was reused; the page was not replaced with a new architecture.

- Header: exact owner-provided transparent logo asset, adjacent PRO badge, calculation/AI region and aligned module tabs.
- Shell: one consistent light visual system for Recipe, Monitor, Production and Label panels.
- Recipe editor: integrated percent/gram locks, compact two-line cost cell, safer long names, adjacent ingredient/topping actions.
- Recipe profile: only Sweetness and Hardness direct five-position controls; compact settings and one confirmation action; existing recipe name/new/save/menu workbar; collapsed nutrition/cost summary.
- Product picker: opaque left-pane desktop surface, full mobile sheet, shared ingredient/topping component, approved metadata filters, brand/category and article search, scoped help tooltip, independent favorite action and explicit add action.
- Monitor: seven approved modules in the right pane, shared aligned scale grid, centered symmetric green bands, black result point and boundary-to-point red exception segment. POD, NPAC and PAC appear only in their approved modules. Expansion state is independent and locally scoped.
- Responsive behavior: CSS Grid/Flexbox/container queries; right-panel internal single-column transitions; existing mobile module switching; no page scaling, zoom or whole-page horizontal scroll solution.

## Reused implementation

The existing AppShell, StudioEngineSurface, IngredientBuilder, ProductPickerPopover, recipe/profile stores, ProWorkbar, recipe settings controls, monitor calculations and Production/Label content remain authoritative. No calculation formula or persisted recipe schema was redesigned.

## Integrity

- Exact logo SHA-256 in the repository and owner source: `b1c85e5a47fb25ab296668e17a04f33df56d6701aba4525d2fd9ee6fd72b7721`.
- Mapper Basement SHA-256 unchanged: `b13f5db4affd9c3be5ccbe59b40920053197a3697a3fa1bd4a859406e8baed38`.
- No environment, secret, Supabase migration, billing, production-database or production-deployment change.
- No new dependency was added.

## Local verification

- Focused design/recipe/P2 checkpoint: 14 files, 212 tests, all passed.
- Updated prior visual-contract group: 10 files, 139 tests, all passed.
- Full repository: 512/512 files and 6465/6465 tests passed.
- Typecheck, build, recipes/process/products validators, npm audit and diff check passed.
- Lint passed with exactly two pre-existing Fast Refresh warnings and no errors.

Baseline screenshots:

- `/Users/tomaszboro22/.codex/visualizations/2026/08/18/01a015b2-8bc9-7bc0-aefb-e440161b5579/pinguino-design/before/profile.png`
- `/Users/tomaszboro22/.codex/visualizations/2026/08/18/01a015b2-8bc9-7bc0-aefb-e440161b5579/pinguino-design/before/search.png`
- `/Users/tomaszboro22/.codex/visualizations/2026/08/18/01a015b2-8bc9-7bc0-aefb-e440161b5579/pinguino-design/before/monitor.png`

Local implementation screenshots:

- `/Users/tomaszboro22/.codex/visualizations/2026/08/18/01a015b2-8bc9-7bc0-aefb-e440161b5579/pinguino-design/after/profile-local.png`
- `/Users/tomaszboro22/.codex/visualizations/2026/08/18/01a015b2-8bc9-7bc0-aefb-e440161b5579/pinguino-design/after/picker-local.png`

## Served authenticated staging QA

- Implementation SHA: `8021e97f572bb79be4b1bca8df54b4b08f33847a`.
- Deployment: `dpl_7NSjiMwS3GXgrXotp7R3qRt2D2h8`, `READY`, `https://staging.pinguinoai.com`.
- Served JS/CSS: `assets/index-CFRWtAyt.js`, `assets/index-Ri54JWO6.css`.
- Exact owner logo loaded from `/logo/gellattiLOGO.png`.
- Ingredient picker: opaque white surface; all nine approved filters; name/brand/article-number search; favorite action did not add the item; explicit `+` did; scoped information popover exposed only the product name and article label; no technical identifier was exposed.
- Ingredient and topping routes used the same picker and wrote to separate base/topping sections. No recipe/version was saved.
- Gram edits updated percentages, percent edits updated grams, and percent/gram locks remained independent.
- Monitor exposed exactly the seven approved modules and only POD/NPAC/PAC abbreviations. The forbidden nutrition/process copy was absent.
- Two Monitor modules remained open concurrently. Production and Label retained the shared light shell; Production was not started.

The final served geometry measurement for all seven Monitor scales was identical: left `1203.14`, right `1387.52`, width `184.38`, center `1295.33` CSS px. Accepted ranges remained symmetrically centered. Out-of-range scales rendered only the red boundary-to-point segment. Whole-page horizontal overflow was `0`.

## Responsive evidence

The real Chrome viewport override was exercised at 1920×1080, 1600×900, 1440×900, 1366×768, 1280×720, 1024×768 and 390×844. Chrome UI reduced the measured content viewport slightly; the measured inner widths were 1745, 1454, 1309, 1242, 1163, 931 and 354 px respectively. Every state had zero whole-page horizontal overflow.

- At the three largest content widths, the editor and right panel remained side by side.
- At a right-panel width below the 540 px container threshold, settings collapsed to one column.
- At lower widths the existing full-width editor and modal cockpit replaced the squeezed two-pane layout.
- The phone cockpit was a real `aria-modal="true"` dialog, had no internal horizontal overflow and rendered settings in one column.
- The phone picker was an opaque full-height panel with search, all nine filters, manual-add action and no whole-page horizontal overflow.

Served screenshots:

- `/Users/tomaszboro22/.codex/visualizations/2026/08/18/01a015b2-8bc9-7bc0-aefb-e440161b5579/pinguino-design/after/served/profile-1597x684.jpg`
- `/Users/tomaszboro22/.codex/visualizations/2026/08/18/01a015b2-8bc9-7bc0-aefb-e440161b5579/pinguino-design/after/served/picker-1597x684.jpg`
- `/Users/tomaszboro22/.codex/visualizations/2026/08/18/01a015b2-8bc9-7bc0-aefb-e440161b5579/pinguino-design/after/served/monitor-final-1597x684.jpg`
- `/Users/tomaszboro22/.codex/visualizations/2026/08/18/01a015b2-8bc9-7bc0-aefb-e440161b5579/pinguino-design/after/served/viewport-1920x1080.jpg`
- `/Users/tomaszboro22/.codex/visualizations/2026/08/18/01a015b2-8bc9-7bc0-aefb-e440161b5579/pinguino-design/after/served/viewport-1600x900.jpg`
- `/Users/tomaszboro22/.codex/visualizations/2026/08/18/01a015b2-8bc9-7bc0-aefb-e440161b5579/pinguino-design/after/served/viewport-1440x900.jpg`
- `/Users/tomaszboro22/.codex/visualizations/2026/08/18/01a015b2-8bc9-7bc0-aefb-e440161b5579/pinguino-design/after/served/viewport-1366x768.jpg`
- `/Users/tomaszboro22/.codex/visualizations/2026/08/18/01a015b2-8bc9-7bc0-aefb-e440161b5579/pinguino-design/after/served/viewport-1280x720.jpg`
- `/Users/tomaszboro22/.codex/visualizations/2026/08/18/01a015b2-8bc9-7bc0-aefb-e440161b5579/pinguino-design/after/served/viewport-1024x768.jpg`
- `/Users/tomaszboro22/.codex/visualizations/2026/08/18/01a015b2-8bc9-7bc0-aefb-e440161b5579/pinguino-design/after/served/viewport-390x844.jpg`
- `/Users/tomaszboro22/.codex/visualizations/2026/08/18/01a015b2-8bc9-7bc0-aefb-e440161b5579/pinguino-design/after/served/mobile-cockpit-390x844.jpg`
- `/Users/tomaszboro22/.codex/visualizations/2026/08/18/01a015b2-8bc9-7bc0-aefb-e440161b5579/pinguino-design/after/served/mobile-picker-390x844.jpg`

One source-data limitation remains visible but is not introduced by this change: catalogue rows without a dedicated article-number field render the available `Nr art.` label without a separate value. Rows whose catalogue name contains the supplier article number remain searchable by that exact number (verified with `233601`). No parser was invented that could misclassify percentages or product-name numerals as article authority.

Staging is ready for Owner visual retest. Public production was not changed.
