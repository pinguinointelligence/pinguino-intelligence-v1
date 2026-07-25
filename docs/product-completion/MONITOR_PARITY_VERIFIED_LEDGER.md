# MONITOR PI — 100 % HISTORICAL PARITY, **VERIFIED** NOT ASSERTED

**Owner addendum item 5 · Agent D · 2026-07-25**
Base: `nightly/integration` @ `fb2924f` · Branch: `agentd/monitor-parity-verified`

> Owner's rule: *„The full historical Monitor must still be restored in 100 %: complete /10
> technical score; all indicators; all detailed modules; costs; corrections; recommendations;
> diagnostics; nothing removed. Questionable modules remain and are marked red below the core
> workbench."*
>
> A previous agent reported parity as done. **This ledger does not trust that report.** The
> inventory below was re-derived from git history, and every row was re-proved against the
> markup of the **real product route**, not against a component rendered in isolation.

---

## 0. VERDICT

**Parity is genuinely 100 % — but it was NOT 100 % when I started.** Every historical element is
mounted, data-connected and reachable, and the mobile sheet is byte-for-byte the same Monitor as
the desktop panel. One real defect was found and closed: **owner-diagnostic values were being
visually clipped** inside the narrow Monitor column — content present in the DOM but *lost to
layout*, which the owner's contract forbids. One reachability gap remains open because its fix
lives in another owner's file (§6).

---

## 1. HOW THE HISTORICAL INVENTORY WAS RE-DERIVED

The redesign commit is **`6d612eb`** — *„feat(pro): ONE-SCREEN workbench — zero page scroll, LIVE
Monitor PI panel, full B1 parity"*. Its parent **`a55f5fc`** is therefore the last complete
pre-redesign tree. Commands used:

```
git log --oneline --all -- src/features/pro-workbench      # → 6d612eb is the redesign
git log --format='%H %P %s' -1 6d612eb                     # → parent a55f5fc
git show a55f5fc:src/features/studio/StudioEngineSurface.tsx
git show a55f5fc:src/features/pro-core/MonitorDrawer.tsx
git show a55f5fc:src/pages/pro/ProWorkspacePage.tsx
git log --oneline -S"PIPanel } from" -- src/            # → PIPanel retired at 1c1f95f
```

**What `a55f5fc` actually rendered** (the „SECONDARY" analysis section of
`StudioEngineSurface`, all inside collapsed `<details>`):

| # | Pre-redesign module | Component |
|---|---|---|
| 1 | `secondary-module-score` | `OverallScoreCard` |
| 2 | `secondary-module-monitor` | `UserMonitorPro` (§14.1 cards + §14.2 modules + §14.3 customize) |
| 3 | `secondary-module-nutrition` | `NutritionCostScorePanel` |
| 4 | `secondary-module-corrections` | `CorrectionPanel` |
| 5–9 | red-marked `studio-tools` / `assistant` / `flow-guide` / `optimization` / `branch-previews` | legacy tools |
| 10 | red-marked `owner-diagnostic` | `OwnerDiagnosticPanel` |

Two findings that correct the record:

- **The pre-redesign `MonitorDrawer` mounted only `UserMonitorPro`.** Today it mounts the full
  `MonitorPanelContent`. The mobile Monitor is *richer* than the historical one, not poorer.
- **The pre-redesign `/pro/monitor` route rendered a NOTE, not a Monitor**
  (`ReviewBadge RV-12` + `w.monitorNoteDrawer`). Today it renders the whole workbench with the
  panel focused. Also a strict improvement.

**Retired-before-the-redesign (deliberate, not a regression):** the flat 11-bar `PIPanel`
(`src/features/pi-panel/PIPanel.tsx`) was replaced by `UserMonitorPro` at `1c1f95f` — the commit
comment says so explicitly (*„Replaces the flat 11-bar PIPanel wall (audit #15); the original
technical table vocabulary lives on in its Expert module"*). It is now dead code, unreferenced by
the app. I did **not** delete it (nothing removed), and I **re-pinned the guarantee it used to
carry**: a test now derives the indicator list from the *engine result itself* and demands every
indicator the engine computes be rendered in the Monitor. That is a stronger guarantee than the
hand-written list it replaces — if the engine ever gains a 12th indicator, the suite fails until
the Monitor shows it.

---

## 2. THE PARITY TABLE

Evidence column legend — every row was proved against `PANEL`, the `pro-monitor-panel` subtree
sliced out of a **real `ProWorkspacePage` render at `/pro/recipe`** (not a hand-built fixture).

| ID | Element | Present before | Component exists | Mounted now | Fed the CURRENT engine result | Reachable | Restored |
|---|---|---|---|---|---|---|---|
| P01 | Technical **/10** score + §15.1 label | ✔ `OverallScoreCard` | ✔ | ✔ `monitor-summary-score`, `monitor-detail-score` | ✔ `recipeTechnicalFit(RESULT)` → `10/10` | ✔ summary layer, never collapsed | ✔ |
| P02 | native / provisional / partial state | ✔ | ✔ | ✔ `monitor-assessment` | ✔ `data-state="native"` from engine provenance flags | ✔ | ✔ |
| P03 | Assessed **coverage** | ✔ `score-coverage` | ✔ | ✔ | ✔ „Oceniono 11 z 11 obszarów." recomputed & matched | ✔ | ✔ |
| P04 | §14.1 status badge | ✔ | ✔ | ✔ `monitor-summary-badge` | ✔ „Test rekomendowany" | ✔ | ✔ |
| P05 | **Six quality axes** + TEXT readings | ✔ | ✔ | ✔ `monitor-axis-{struktura…stabilnosc}` | ✔ worst-of over engine `bandPosition` | ✔ | ✔ |
| P06 | Production readiness (§20.5) | ✔ | ✔ | ✔ `monitor-summary-readiness` | ✔ | ✔ | ✔ |
| P07 | Data confidence (§20.5) | ✔ | ✔ | ✔ `monitor-summary-confidence` | ✔ | ✔ | ✔ |
| P08 | Serving-temperature behaviour | ✔ | ✔ | ✔ `user-monitor-module-temperatura` | ✔ `−11°C` from the live draft | ✔ | ✔ |
| P09 | Sugars & sweetness | ✔ | ✔ | ✔ `…-cukry` | ✔ sucrose/dextrose/lactose grams = `RESULT.sugar.*` | ✔ | ✔ |
| P10 | Water & frozen phase | ✔ | ✔ | ✔ `…-woda` | ✔ | ✔ | ✔ |
| P11 | Fats & creaminess | ✔ | ✔ | ✔ `…-tluszcze` | ✔ `RESULT.totals.fat_g` | ✔ | ✔ |
| P12 | Proteins & structure | ✔ | ✔ | ✔ `…-bialka` | ✔ `RESULT.totals.protein_g` | ✔ | ✔ |
| P13 | Total solids & body | ✔ | ✔ | ✔ `…-ciala_stale` | ✔ | ✔ | ✔ |
| P14 | Stabilisation **+ provenance sentence** | ✔ (module) / provenance NEW | ✔ | ✔ `…-stabilizacja`, `stabilization-provenance` | ✔ from `assessStabilizerDosage(input)` | ✔ | ✔ |
| P15 | Alcohol | ✔ | ✔ | ✔ `…-specjalne` | ✔ | ✔ | ✔ |
| P16 | **Advanced engine metrics** (POD/PAC/NPAC/ice) | ✔ | ✔ | ✔ `…-expert` | ✔ `pod_points` 15,9 · `pac_points` 23,7 · `npac_points` 37,2 | ✔ **in the CORE, never marked optional** | ✔ |
| P17 | Engine + config version provenance | ✔ | ✔ | ✔ | ✔ `0.4.0` / `0.7.0` from `RESULT` | ✔ | ✔ |
| P18 | §14.3 „Dostosuj widok" (toggles/pin/reset) | ✔ | ✔ | ✔ | n/a (layout state) | ✔ | ✔ |
| P19 | Nutrition per 100 g | ✔ | ✔ | ✔ `monitor-detail-nutrition` | ✔ kcal/fat/protein = `RESULT.nutrition_per_100g` | ✔ | ✔ |
| P20 | Costs — per kg, **batch**, per portion, honest missing-price | ✔ (batch row added by redesign) | ✔ | ✔ | ✔ `cost_per_kg` / `total_cost` = `RESULT.costs` | ✔ | ✔ |
| P21 | PI corrections / recommendations | ✔ `CorrectionPanel` | ✔ | ✔ `monitor-detail-corrections` | ✔ live `proposeCorrections` | ✔ | ✔ |
| P22 | Engine **warnings** (all) + ONE primary signal | ✔ | ✔ | ✔ `monitor-primary-signal` + full list in `UserMonitorPro` | ✔ | ✔ | ✔ |
| P23 | Owner diagnostics (resolved engine input) | ✔ | ✔ | ✔ `review-marked-monitor-owner-diagnostic` → `owner-diagnostic` | ✔ band cell, batch, locks, exclusions | ✔ **was CLIPPED — see §4** | ✔ *(after fix)* |
| P24 | Solver **iteration count** + **stop reason** + trajectory | ✔ | ✔ | ✔ | ✔ rows present; honest `—` when no preview is staged | ✔ **was CLIPPED — see §4** | ✔ *(after fix)* |
| P25 | Band provenance + stabilizer dosage provenance | ✔ | ✔ | ✔ | ✔ „Tara gum 5.00 g = 0.44 % · okno 0.2–1 % …" | ✔ **was CLIPPED — see §4** | ✔ *(after fix)* |

**Executable form:** `src/features/pro-workbench/monitorParityVerified.test.tsx` — 40 tests, the
25 inventory rows run as `it.each`. A future regression fails the suite, not a document.

---

## 3. WHY THE PREVIOUS PARITY PROOF WAS NOT ENOUGH

`monitorParity.test.tsx` (kept, not replaced — it pins the *component* contract) proves host
wiring by **grepping source text**:

```ts
expect(drawer).toContain('<MonitorPanelContent');
expect(surface).toContain('<MonitorPanelContent');
```

That cannot detect a Monitor that is mounted but fed a stale/hardcoded result, nor one that is
mounted but unreachable. The new suite renders the **real route** and compares the rendered
numbers against an **independently recomputed** `calculateRecipe(buildRecipeInput(<live store>))`.

**Harness limitation, stated plainly:** the repo test env is `node` + `renderToStaticMarkup`, so
React takes the SSR path and zustand v5 serves `getInitialState()`. I proved this directly —
after `setBatchGrams(4321)` and `removeItem(...)`, `getState()` reported `4321 / 5 items` while
the render still emitted `batch=1000 items=6`. **Mutating the store between renders cannot change
node-rendered markup**, so no node test in this repo can prove „the Monitor re-renders on edit".
Data-connection is therefore proved the only honest way available: recompute the engine result
from the same state the host renders from and require those exact values in the host's Monitor —
a hardcoded or stale fixture fails. Live re-render on edit was confirmed separately in the real
browser (§5).

---

## 4. GAP FOUND AND CLOSED (inside my owned files)

### GAP-1 — Owner diagnostics were **clipped**: content present in the DOM, lost to layout

`OwnerDiagnosticPanel` renders each value as `<dd class="min-w-0 truncate text-right …">`.
Tailwind's `truncate` = `overflow:hidden` + `text-overflow:ellipsis` + `white-space:nowrap`. That
was authored for the pre-redesign **full-width `max-w-4xl`** column. The redesign moved the panel
into a **38 % column**, and the values started being cut.

**Measured in Chrome (not inferred), `/pro/recipe`, 8-ingredient acceptance recipe:**

| Viewport | Row | Content width | Box width | **Lost** |
|---|---|---|---|---|
| 1366×768 | `Dawka stabilizatora` | 540 px | 224 px | **316 px (~58 %)** |
| 1366×768 | `Dawka stabilizatora — pochodzenie` | 258 px | 102 px | **156 px** |
| 1920×1080 | `Dawka stabilizatora` | — | — | **105 px** |

The text actually being hidden was the scientific payload:
`Tara gum 5.00 g = 0.44 % · okno 0.2–1 % mieszanki (PI-ING-000492) · w oknie` — i.e. the approved
dosage window and the in-window verdict. It clips at **every** tested viewport, and it would get
worse after a recalculation, when the long rows (role trace, violation trajectory, stop reason,
added-by-PI, exclusions) fill up.

**Why the previous suite missed it:** it asserted `expect(html).not.toContain('overflow-hidden')`.
`truncate` is a single utility whose *class name* contains no such substring, so the check passed
over a genuinely clipping element.

**Fix** — `src/features/pro-workbench/MonitorPanelContent.tsx` (mine). The row markup belongs to
another owner's component, so the column that imposes the narrow width takes responsibility for
it, presentation-only:

```tsx
<div
  className="mt-2 [&_dd]:overflow-visible [&_dd]:text-left [&_dd]:break-words [&_dd]:whitespace-normal [&_dd]:text-clip"
  data-testid="monitor-advanced-unclipped"
>
```

Descendant-selector specificity `(0,2,1)` beats `.truncate` `(0,1,0)`. Verified in the production
bundle (`dist/assets/index-BzDSheqF.css`):

```
.\[\&_dd\]\:overflow-visible dd{overflow:visible}
.\[\&_dd\]\:whitespace-normal dd{white-space:normal}
.\[\&_dd\]\:text-clip       dd{text-overflow:clip}
.\[\&_dd\]\:break-words     dd{overflow-wrap:break-word}
```

**Re-measured in Chrome after the fix — clipped elements 2 → 0 at 1366, 0 at 1440, 0 at 1920, 0
in the mobile sheet.** `Dawka stabilizatora` now wraps to 3 full lines,
`getComputedStyle` = `overflow: visible · text-overflow: clip · white-space: normal`.
No value, gating, wording or diagnostic was added, removed or changed.

**Re-pinned as a guarantee** (`monitorParityVerified.test.tsx`): *every* `truncate` occurrence
inside the Monitor must fall inside the un-truncating wrapper, and the wrapper must reverse all
three parts of `truncate`. The old `overflow-hidden`/`max-h-`/`line-clamp` checks are kept and
extended.

---

## 5. LAYOUT / VIEWPORT MEASUREMENTS

**Method — stated explicitly as the owner asked.** Real Chrome, real dev build of *this branch*
(`vite` on `:5174` from the worktree), 8-ingredient acceptance recipe
(Strawberry / Milk 3.5 % / Cream 30 % / SMP / Sucrose / Dextrose / Inulin / Tara gum), persona
`pro`. Numbers come from live Blink layout — `getBoundingClientRect()`, `getComputedStyle()`,
`scrollHeight` vs `clientHeight`, and `window.scrollTo(0, 5000)` followed by reading `scrollY`.
**Screenshots were NOT captured: the Browser pane was not displayed, so the page never
composited frames and every `screenshot` call timed out.** Layout measurement was unaffected —
these are real engine-computed geometries, not DOM estimates.

| Viewport | body scrolls? | `scrollY` after `scrollTo(0,5000)` | doc scroll/client | ingredient rows | editor pane | Monitor panel | action bar | clipped in Monitor |
|---|---|---|---|---|---|---|---|---|
| **1366×768** | **NO** | **0** | 768 / 768 | **8** | 245→724, 838 px | 245→724, **513 px** | 724→768 ✔ | **0** |
| **1440×900** | **NO** | **0** | 900 / 900 | **8** | 245→856, 884 px | 245→856, **542 px** | 856→900 ✔ | **0** |
| **1920×1080** | **NO** | **0** | 1080 / 1080 | **8** | 245→1036, 1181 px | 245→1036, **724 px** | 1036→1080 ✔ | **0** |

Ingredients and the Monitor are **visible together** at every viewport (identical `top`/`bottom`),
and the primary actions (workbar `76→139`, action bar at the fold) are reachable **without
scrolling**.

**Scroll surfaces (1366×768)** — exactly the documented three, no accidental fourth:

| Surface | scrollHeight / clientHeight | Purpose |
|---|---|---|
| `main` | 1605 / 692 | the ONE intentional page scroll → the red review zone below the fold |
| `ingredient-rows-scroll` | 407 / 216 | the editor's own row scroll |
| `pro-monitor-panel` (aside) | 774 / 479 | the Monitor's own scroll — its growth never scrolls the page |

**Mobile bottom sheet vs desktop panel (375×812)** — the strongest possible equality check, the
full `data-testid` sets compared in both directions:

```
desktop panel elements : 35
bottom sheet elements  : 35
only in desktop        : []      ← empty
only in sheet          : []      ← empty
clipped in sheet       : 0
nested scrollers in sheet : 0     (the sheet itself is the ONE scroll surface)
body scroll locked     : hidden
```

The sheet is **not** a reduced Monitor — it is the same component with the same content.

---

## 6. GAP THAT NEEDS ANOTHER OWNER'S FILE (open)

### GAP-2 — `/pro/monitor` presents **no Monitor at all** below the `lg` breakpoint

**Exact reason it is not closed here:** the fix belongs to
`src/pages/pro/ProWorkspacePage.tsx`, which is **not in my ownership list**
(mine: `src/features/pi-panel/**`, `src/features/pro-workbench/**`, my new tests).

**Reproduced in Chrome**, 375×812, `/pro/monitor`, persona `pro`:

```
path                  : /pro/monitor
desktopPanelInDOM     : true
desktopPanelDisplay   : "none"     ← the aside is `hidden lg:block`
desktopPanelRect      : 0
drawerOpen            : false      ← the bottom sheet starts closed
anyMonitorVisibleNow  : FALSE
```

The Monitor deep-link route shows the ingredient editor and nothing else; `focusMonitor` only
adds a focus ring to an element that is `display:none` at this width. The user has to discover
and tap „Monitor PI". Content is not *lost* (the sheet has everything once opened), but the route
does not honour its own name on phones/tablets.

**Exact one-line fix for the Integration Owner** — `ProWorkspacePage.tsx`, in `RecipeWorkbench`:

```diff
-  const [monitorOpen, setMonitorOpen] = useState(false);
+  // /pro/monitor deep-link: below `lg` the pinned panel is display:none, so the
+  // bottom sheet IS the Monitor — open it so the route honours its own name.
+  const [monitorOpen, setMonitorOpen] = useState(focusMonitor);
```

Low conflict risk: one line, one hook, no shared state.

### GAP-3 — `truncate` still lives at source in `src/features/studio/OwnerDiagnosticPanel.tsx`

Neutralised for the Monitor by GAP-1's wrapper and pinned by test, so **there is no remaining
content loss**. Flagged only so the Integration Owner knows the root class is still in another
owner's component; if that panel is ever mounted in another narrow column it will clip again.
Not closed here for the same ownership reason.

---

## 7. REVIEW-MARKING CONTRACT — verified

| Requirement | Status | Evidence |
|---|---|---|
| Questionable/advanced modules **remain mounted** | ✔ | `review-marked-{assistant, flow-guide, optimization, branch-previews, studio-tools}` all present in the page render |
| …marked **red**, **below** the core workbench | ✔ | `pro-review-zone` (`border-t-2 border-review/60`) starts at `top: 768` at 1366×768 — below the fold, reached only by an intentional `main` scroll; its index in the markup is **after** `pro-monitor-panel` |
| Owner diagnostics marked `ADVANCED` **but functional** | ✔ | `review-marked-monitor-owner-diagnostic` carries `ADVANCED` + `border-l-review`, and `owner-diagnostic` with all its rows is inside |
| **Core Monitor summary never marked optional** | ✔ | no `review-marked` substring occurs anywhere before the advanced section |
| **Core engine metrics never marked optional** | ✔ | „Tryb Expert" (POD/PAC/NPAC/ice) sits inside the *unmarked* core Monitor module — index strictly before the advanced section |
| Nothing removed, nothing CSS-hidden | ✔ | no `display:none`, no `class="… hidden …"`, no `max-h-`, no `line-clamp-`, no nested scroller inside the Monitor content |

---

## 8. GATES

| Gate | Result |
|---|---|
| `npx tsc -b` | **clean** |
| `npx eslint .` | **0 errors**, 2 pre-existing `react-refresh` warnings (`router.tsx`, `RecipeVersionsSection.tsx`) — expected |
| `npx vitest run` | **386 files / 5262 tests, all passing** — baseline on `fb2924f` was 385 / 5222; **+1 file, +40 tests, 0 lost** |
| `npm run build` | **green** (`✓ built in 1.08s`) |

No frozen invariant was touched: no `src/engine/**` change, no `TARGET_BANDS`/PAC/POD/NPAC/ice
edit, no `ENGINE_VERSION`/`CONFIG_VERSION` change, no store change, no formulation or
constraint-studio change. **No existing test expectation was modified or deleted** — the only
change to non-test source is the presentation-only wrapper in §4.

---

## 9. FILES CHANGED

| File | Change |
|---|---|
| `src/features/pro-workbench/MonitorPanelContent.tsx` | GAP-1 fix — un-truncating wrapper + `data-testid="monitor-advanced-unclipped"`, with an in-file comment naming this owner addendum and carrying the measured numbers |
| `src/features/pro-workbench/monitorParityVerified.test.tsx` | **NEW** — the 25-row inventory as 40 executable tests against the real host |
| `docs/product-completion/MONITOR_PARITY_VERIFIED_LEDGER.md` | **NEW** — this ledger |
