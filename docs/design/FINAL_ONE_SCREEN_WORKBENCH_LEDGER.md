# FINAL — ONE-SCREEN PRO WORKBENCH (Agent M, 2026-07-24)

**Branch:** `agentm/monitor-completeness` (base `a55f5fc` = nightly/integration)
**Owner contract:** the professional `/pro/recipe` editor is ONE SCREEN — zero page scroll
during normal editing at 1366×768 / 1440×900 / 1920×1080; the Monitor PI is a LIVE,
always-visible right panel; everything non-core moves below the fold, red-marked, with an
explicit owner inventory (decision = OCZEKUJE). NO-DELETION RULE absolute.

---

## 1. Architecture shipped

```
┌────────────────────────────────────────────────────────────────────────────┐
│ AppShell header (logo · persona · ONE hamburger)             lg: shrink-0  │
│ ProWorkbar — ONE row ≤64 px: name · save · context · version/status ·      │
│              Monitor PI · Przelicz z PI · ⋯                                │
│ pink demo-library marker (compact single line)                             │
├────────────────────────────────────────────────────────────────────────────┤
│ WorkbenchSettingsLine ≤80 px: Typ | Poziom | Serwowanie | Partia g |       │
│   Maszyna → /pro/machine | Więcej ustawień (popover: capacity/flavor/cost) │
│   + engine-route chip (Silnik −11°C…)                                      │
├───────────────────────────────────┬────────────────────────────────────────┤
│ EDITOR 62 % — IngredientBuilder   │ MONITOR PI 38 % — MonitorPanelContent  │
│ layout="workbench":               │ LIVE (useStudioResult, recomputed on   │
│  header (fixed)                   │ every draft change):                   │
│  rows: internal scroll #1         │  B2 summary (permanent)                │
│  batch total (fixed)              │  B3 detailed modules (collapsible)     │
│  add-ingredient slot (fixed)      │  B4 advanced red-marked                │
│                                   │  internal scroll #2                    │
├───────────────────────────────────┴────────────────────────────────────────┤
│ WorkbenchActionBar: Masa partii · [preview ready → Otwórz podgląd]         │
│                     [applied → confirmation + Cofnij] · idle hint          │
└────────────────────────────────────────────────────────────────────────────┘
   ▼ intentional scroll only
┌────────────────────────────────────────────────────────────────────────────┐
│ RED REVIEW ZONE (StudioReviewZone): owner inventory TABLE (module | funkcja│
│ | miejsce | rekomendacja | OCZEKUJE) + red-marked functional modules:      │
│ Studio tools · Assistant · Flow guide · Optimization preview ·             │
│ IF9/IF10 Batch Rescue + Stock Shortage · (DEV) Preset scenarios            │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Zero-page-scroll mechanism:** `AppShell viewportLock` → shell root
  `lg:h-dvh lg:overflow-hidden lg:flex lg:flex-col`; `main` is the ONE intentional
  scroll surface (`lg:flex-1 lg:min-h-0 lg:overflow-y-auto`); the
  `pro-viewport-region` is `lg:h-full` so the whole edit loop fits the viewport
  exactly; the review zone extends `main` below the fold. Exactly TWO internal
  scrolls inside the workbench (ingredient rows + Monitor panel) — proven by test.
- **Przelicz z PI** = compact centered OVERLAY `w-[min(660px,92vw)]` (520–720 px),
  `role="dialog"`, backdrop; Zastosuj closes it ONLY on a successful apply (a
  verify-blocked apply keeps the honest `BlockedApplyNotice` in view); Anuluj closes.
  After apply the bottom action bar carries the confirmation + Cofnij.
- **One hamburger:** the visible tab row is REMOVED; all 9 destinations keep stable
  `/pro/<section>` routes in `appNav.ts`; `/pro/machine` ADDED to the menu
  (`proMachine`, order 19). `/pro/monitor` renders the same workbench with the
  Monitor panel focus-ringed.
- **Mobile:** everything flows vertically (no viewport lock); the Monitor is the
  bottom sheet (`MonitorDrawer`) rendering the SAME `MonitorPanelContent`; the
  recalc overlay is the same dialog; no horizontal overflow introduced.
- **Proof, twice:** (a) structural vitest proofs (node env — the CSS containment
  contract is viewport-width-independent on `lg`); (b) a REAL-browser acceptance run
  (local worktree dev server, Chrome pane) with live DOM measurements — see §1a.

### 1a. Real-browser acceptance measurements (2026-07-25, worktree dev server)

8-row recipe (milk-base starter + Raspberry + Inulin added through the REAL picker —
„Strawberry" does not exist in the demo catalog, Raspberry is the structural stand-in;
batch 1200 g, LIVE score recomputed 9/10 → 8/10 on add — real-time Monitor proven).

| Measurement | 1366×768 | 1440×900 | 1920×1080 | Budget |
|---|---|---|---|---|
| `scrollingElement.scrollHeight` vs viewport | 768 = 768 | 900 = 900 | 1080 = 1080 | **zero page scroll** ✔ |
| Workbar height | 63 px | 63 px | 63 px | ≤64 ✔ |
| Settings line | 53 px | 53 px | 53 px | 48–80 ✔ |
| Ingredient row | 50 px | 50 px | 50 px | 44–56 ✔ |
| Monitor panel width | 38 % | 38 % | 38 % | 35–40 ✔ |
| Rows internal scroll | 161/407 (scrolls) | 293/407 (scrolls) | all 8 visible | internal only ✔ |
| Add slot + action bar in viewport | yes | yes | yes | ✔ |
| Review zone top | exactly 768 | exactly 900 | exactly 1080 | below the fold ✔ |
| Przelicz overlay dialog | — | — | 660 px, centered, honest best-safe result | 520–720 ✔ |
| Mobile 375×812 | no horizontal overflow (375 = 375); desktop aside `display:none`; bottom sheet opens with FULL panel (summary + Expert + owner diagnostics + score + axes), one scroll surface | | | ✔ |

Two real defects were found and fixed DURING this run:
1. **Phantom page scroll (+128 px at every size):** the review-table's `sr-only`
   `<caption>` (position:absolute) escaped the scroll container's clipping in Chrome
   and extended the ROOT scroll exactly to its offset → replaced with `aria-label`
   on the `<table>`. After the fix: scrollHeight == viewport at all three sizes.
2. **Workbar 122 px:** the note-toggle link and the save-blocked message each forced
   a full-width row on desktop → both inline (`lg:w-auto lg:shrink-0`); the OPEN
   note textarea keeps its contextual full-width line. After: 63 px.

## 2. B1 Monitor parity inventory (executable: `src/features/pro-workbench/monitorParity.test.tsx`)

Pre-redesign reference: the pinned right rail of `cdb7902^` (`OverallScoreCard` +
`UserMonitorPro` + `NutritionCostScorePanel` + `CorrectionPanel` + advanced-tools
`<details>` + header `OwnerDiagnosticPanel`).

| Element | Previously present | Component exists | Mounted | Data connected | Visible after click / in panel | Restored location |
|---|---|---|---|---|---|---|
| Overall technical score /10 + label | yes (OverallScoreCard) | yes | yes | `recipeMatchScore(result.scores)` via `monitorScoreView` seam | yes | Summary (permanent) + score card detail section |
| Native / provisional / partial state | partial (coverage note only) | yes (NEW `buildMonitorAssessment`) | yes | indicator `band_status`/`category_fallback`/`temperature_fallback` | yes | Summary `monitor-assessment` |
| Coverage (assessed n of m) | yes (score card) | yes | yes | `result.indicators` banded vs total | yes | Summary + score card |
| Iteration count | post-redesign addition (393105f) | yes (OwnerDiagnosticPanel) | yes | `preview/previewIssue.iteration` (constraint store) | yes (ADVANCED) | Monitor → Zaawansowane → Diagnostyka właściciela |
| Stop reason | post-redesign addition | yes (OwnerDiagnosticPanel + BestSafeResultView) | yes | `iteration.stopReason`, best-safe issue | yes (ADVANCED + recalc overlay) | same + Przelicz overlay |
| Struktura/Miękkość/Słodycz/Kremowość/Pełnia/Stabilność | yes (§14.1 cards) | yes | yes | `buildUserMonitorSummaryCards(result)` (worst-of bandPosition) | yes | Summary axes + full §14 panel cards |
| Readiness (Gotowość produkcyjna) | yes | yes | yes | `deriveRecipeReadiness(result)` | yes | Summary + §14 panel |
| Zachowanie w temperaturze | yes (§14.2) | yes | yes | serving temp + ice_fraction indicator | yes | §14 module (forceAllModules) |
| Cukry i słodycz | yes | yes | yes | pod indicator + PAC + sugar breakdown | yes | §14 module |
| Woda i faza mrożona | yes | yes | yes | water + ice_fraction indicators | yes | §14 module |
| Tłuszcze i kremowość | yes | yes | yes | fat indicator + totals.fat_g | yes | §14 module |
| Białka i struktura | yes | yes | yes | aerating_protein/protein_in_solids + totals | yes | §14 module |
| Ciała stałe i pełnia | yes | yes | yes | total_solids + fiber totals | yes | §14 module |
| Stabilizacja (+provenance sentence) | rows yes; provenance NEW | yes | yes | npac/lactose indicators + `assessStabilizerDosage(input)` sentence | yes | §14 module + `stabilization-provenance` |
| Alkohol | yes (Składniki specjalne) | yes | yes | alcohol indicator + salt total | yes | §14 module „Składniki specjalne" |
| Advanced Engine metrics (POD/PAC/NPAC/ice) | yes (Tryb Expert, layout-OFF by default) | yes | yes — **forceAllModules** renders it always | `result.pod/pac/npac_points`, `ice_fraction_percent` | yes | §14 module „Tryb Expert" |
| Warnings | yes | yes | yes | `buildWarnings(result)` | yes | Summary primary signal + §14 panel list |
| Recommendations / Korekty PI | yes (CorrectionPanel) | yes | yes | `proposeCorrections` (redact per capability) | yes | Detail section „Korekty PI" |
| Nutrition (per 100 g) | yes | yes | yes | `result.nutrition_per_100g` | yes | Detail section „Wartości odżywcze i koszty" |
| Koszt/kg + **partia** + porcja + missing-price | koszt/kg+porcje yes; **partia NEVER rendered before** | yes | yes | `result.costs` incl. `total_cost` (NEW „Koszt partii" row) + honest `costEmpty` | yes | same detail section |
| Owner diagnostics | yes (header of old surface) | yes | yes | result/input/corrections + constraint store | yes (red ADVANCED) | Monitor → Zaawansowane |
| Fallback/calibration notes | yes | yes | yes | `buildFallbackNotes(result)` | yes | §14 panel |
| Pewność danych (TEXT) | yes | yes | yes | `deriveRecipeDataConfidence(result)` | yes | Summary + §14 panel |

**B5 truthful states (tested):** insufficient → exact „Brak wystarczających danych do
oceny." + hint, detailed layer stays mounted (never blank); provisional → „Ocena
częściowa / prowizoryczna" + source + coverage + reason; native → exact violated bands
(value + `zakres min–max`) or the honest all-in-band sentence; 10/10 remains the score
adapter's presentation.

**B6 (tested):** `MonitorPanelContent` introduces NO `overflow-hidden`, `max-h-*`,
nested scroll or zero-height loss; the hosts own the single scroll surface (desktop
aside `lg:overflow-y-auto`, mobile sheet `overflow-y-auto`).

**Score-split seam:** the summary layer reads score fields ONLY through
`monitorScoreView()` (`src/features/pro-workbench/monitorSummaryView.ts`). When the
parallel technical/flavor/cost adapter merges, integration is a rewrite of that one
function body (test-pinned).

## 3. Review-zone inventory (rendered as the owner table, decision = OCZEKUJE)

| Module | Miejsce | Status |
|---|---|---|
| Narzędzia partii i blokad (Studio) | /pro/recipe → strefa przeglądu | OCZEKUJE |
| Asystent PI (szkic) | strefa przeglądu | OCZEKUJE |
| Przewodnik przepływu | strefa przeglądu | OCZEKUJE |
| Podgląd optymalizacji (+ SaveCorrectionControl) | strefa przeglądu | OCZEKUJE |
| Ratunek partii · Braki magazynowe (IF9/IF10) | strefa przeglądu | OCZEKUJE |
| Diagnostyka właściciela | Monitor PI → Zaawansowane | OCZEKUJE |
| Scenariusze demo (DEV) | strefa przeglądu (dev-only) | OCZEKUJE |

Nothing was removed or CSS-hidden: the only responsive `hidden` is the desktop Monitor
aside, whose full content mobile receives via the bottom sheet (test-pinned).

## 4. Files changed

**New** (`src/features/pro-workbench/`): `monitorSummaryView.ts`,
`MonitorLiveSummary.tsx`, `MonitorPanelContent.tsx`, `WorkbenchSettingsLine.tsx`,
`WorkbenchActionBar.tsx`, `ProReviewZone.tsx` + tests `monitorSummaryView.test.ts`,
`monitorParity.test.tsx`.

**Reworked:** `StudioEngineSurface.tsx` (workbench + exported `StudioReviewZone`; all
legacy module mounts and pinned literals kept in-file), `ProWorkspacePage.tsx` (tab row
removed, viewportLock, `/pro/monitor` focus), `ProRecalcPanel.tsx` (overlay),
`MonitorDrawer.tsx` (full panel content), `ProWorkbar.tsx` (one-row lg),
`IngredientBuilder.tsx` (`layout="workbench"` additive), `UserMonitorPro.tsx`
(`forceAllModules` + provenance note, additive), `NutritionCostScorePanel.tsx`
(„Koszt partii" row), `AppShell.tsx` (`viewportLock` additive), `appNav.ts`
(+`proMachine`), `copy/en.ts` (ADDITIVE keys only: `shell.items.proMachine`,
`studio.metrics.costBatch`, `proWorkbench.*`, `monitorPi.*`).

**Tests updated:** `proRecipeUxRepair.test.tsx` (rewritten to the one-screen owner
proofs incl. 3-resolution contract, 10-step flow, 8-ingredient acceptance fixture,
review-zone inventory, overlay contract), `ProWorkspacePage.test.tsx` (one-hamburger
destinations), `canonicalPro.test.tsx` (menu grew to 9 Pro subitems — additive).

## 5. Gates

- `tsc -b` — clean
- `eslint .` — 0 errors (2 pre-existing react-refresh warnings in untouched files)
- `vitest run` — FULL suite green (see final message for the count)
- `npm run build` — green (see final message)

## 6. Owner follow-ups (honest limits)

1. **Screenshot files** — the real-browser acceptance ran headless (the browser pane
   was not displayed, so frame compositing — and therefore screenshots — timed out).
   Every layout claim was instead verified with LIVE DOM measurements (§1a). One
   visual pass with the pane displayed (or on staging) captures the three
   resolutions for the owner's eyes; the numbers are already proven.
2. The acceptance recipe used **Raspberry** as the fruit line — „Strawberry" does not
   exist in the demo catalog. Same structural shape (8 rows, fruit + fiber +
   stabilizer); rename lands whenever the verified PI library replaces the demo set.
3. The `RV-12` review badge now renders on `/pro/monitor` above the workbench
   (owner/QA sessions only) — decide whether it stays after acceptance.
4. Score split (technical/flavor/cost) — one-line rewire in `monitorScoreView` when
   the parallel agent's adapter lands.
