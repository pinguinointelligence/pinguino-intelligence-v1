# /pro/recipe UX REPAIR — LEDGER (2026-07-24)

Owner P0: the staging `/pro/recipe` design was REJECTED as chaotic (unreadable beige
right panel, labyrinth layout, missing red review marks, blank panels). This ledger
records the per-failure root cause, the fix, the proof, and the exact file list.

- Branch: `ux-repair/pro-recipe` (created FROM `nightly/integration` @ `510659b`)
- Scope: UI layer ONLY. No engine/formulation/store logic touched
  (`formulate.ts`, `recipeStore.ts`, `toolboxCanonical.ts` untouched).
- Logo: unchanged (hash-lock test green). No route/menu/function removed.

---

## FAILURE 1 — Right panel unreadable (ivory-on-ivory washout)

### Root cause (exact)

`.theme-pro-dark` (src/styles/theme-pro-dark.css) remaps the SAME tokens the
components consume, and intentionally flips `--color-ink` → `#efe9dc` (ivory) so the
primary action (`bg-ink text-paper`) becomes the ivory button on graphite.

But `CharcoalPanel` — the surface of Monitor Pro, the score card and the locked score
preview — filled with **`bg-ink text-ivory`**. Inside the scope that resolves to
**ivory background + ivory text**: the owner's "blank beige blocks" and washed-out
score cards ("Struktura / W złotym zakresie" invisible). The same poison pattern
existed in `status.ts` (`pro: 'border-ink bg-ink text-ivory'`, `premium/demo:
'bg-ivory text-ink'`) and `buttonStyles.ts` (`ivory: 'bg-ivory text-ink'`) — any
`ink×ivory` pairing collapses to ivory-on-ivory once ink means ivory.

### Fix (token/primitive level)

1. **New SURFACE token `--color-charcoal`** (src/styles/tokens.css): `#101113`
   (== ink) on light routes — zero visual change anywhere light. Inside
   `.theme-pro-dark` it maps to `var(--color-graphite-raised)` (`#1d1e22`) — a DARK
   elevated surface. Surface fills never ride the text token again.
2. `CharcoalPanel` → `bg-charcoal text-ivory` (dark surface + light text in BOTH
   themes).
3. `status.ts`: `pro` chip → `bg-charcoal text-ivory`; `premium`/`demo` ivory fills →
   `text-shell` (dark text that never remaps).
4. `buttonStyles.ts` `ivory` variant → `bg-ivory text-shell`.
5. `SectionLabel` shell-muted tone `text-ivory/50` → `text-ivory/65` (4.33:1 → 6.55:1
   on raised shell).
6. Sub-AA ivory text tiers (`/25 /30 /35 /40 /45 /50`) bumped to `/60`–`/65` across
   every component on the /pro/recipe surface (monitor, pi-panel, corrections,
   constraint-studio/ui, studio, studioFlow, optimization, pro-core, recipe-goal,
   ingredient-builder).
7. `--color-review` brightened `#e5484d` → `#ef6a6f` inside the scope (4.25:1 → 5.52:1
   on graphite-raised; ≥4.5:1 even over the `bg-review/10` badge tint).

### Contrast proof (computed from the real stylesheets, sRGB WCAG)

| Surface (in `.theme-pro-dark`) | Hex | vs `text-ivory #efe9dc` |
|---|---|---|
| `bg-charcoal` (CharcoalPanel / Monitor Pro) | `#1d1e22` | **13.77:1** |
| `bg-paper` (page) | `#131417` | 15.23:1 |
| `bg-shell` (engine lab) | `#1a1a1a` | 14.39:1 |
| `bg-shell-raised` (Card) | `#232323` | 12.99:1 |

| Text token on `#1d1e22` | Hex | Ratio |
|---|---|---|
| `status-ideal` | `#96a487` | 6.31:1 |
| `status-risky` / `gold-soft` | `#c2a05e` | 6.73:1 |
| `status-error` | `#c9917e` | 6.21:1 |
| `review` (red badges) | `#ef6a6f` | 5.52:1 |
| `stone-500` (secondary) | `#a6a39b` | 6.61:1 |
| `text-ivory/60` (composited `#9b9892`) | | 5.79:1 |
| `text-ivory/65` (composited `#a6a29b`) | | 6.55:1 |
| `text-ivory/70` (composited `#b0aca4`) | | 7.36:1 |

Live browser confirmation (worktree dev build, `/pro/recipe`, Pro persona):
CharcoalPanel computes `background-color: rgb(29,30,34)` + `color: rgb(239,233,220)`;
review badge computes `rgb(239,106,111)`; workbar/in-flow primary button computes
ivory `rgb(239,233,220)` fill + graphite `rgb(19,20,23)` text.

### Regression guard

`src/styles/themeProDarkContrast.test.tsx` (10 tests):
- parses `tokens.css` + `theme-pro-dark.css`, resolves `var()` chains — proves
  `--color-charcoal` is DARK (luminance < 0.05) while ink is light: the beige-panel
  bug is structurally impossible;
- every surface token vs ivory ≥ 4.5:1; status/accent tokens ≥ 4.5:1 on raised
  charcoal;
- renders `UserMonitorPro`, `OverallScoreCard`, `NutritionCostScorePanel`,
  `CorrectionPanel`, `ConstraintPreviewCard`, `ReviewMarkedModule` with a REAL engine
  result and walks every text node: class → token → alpha-composited over its
  effective background — **no text node < 4.5:1**, and every Monitor background is
  dark (luminance < 0.2).

---

## FAILURE 2 — Labyrinth layout

### Root cause

`StudioEngineSurface` was a two-column lab: left goal+ingredients+Studio tools, right
a sticky rail stacking score card, Monitor, nutrition, corrections AND the advanced
tools — two competing scroll columns, the primary action far from the work.

### Fix — ONE primary path, top to bottom

**Before**

```
ProWorkbar (sticky)
ProRecalcPanel (under workbar)
┌───────────────────────────┬───────────────────────────┐
│ GoalSetup (big tier cards)│ OverallScoreCard          │
│ IngredientBuilder         │ UserMonitorPro            │
│ ConstraintStudioSection   │ NutritionCostScorePanel   │
│                           │ CorrectionPanel           │
│                           │ „Narzędzia zaawansowane"  │
│                           │  (assistant/guide/opt/IF) │
└───────────────────────────┴───────────────────────────┘
+ OwnerDiagnosticPanel in the page header
```

**After**

```
1. ProWorkbar (sticky, FROZEN: logo left, hamburger right, Przelicz primary, save)
2. Compact identity header (route · summary chips)
3. PRIMARY column (data-testid="pro-primary-flow"):
   – GoalSetup COMPACT two-row group (typ produktu + poziom jakości / tryb serwowania + partia)
   – IngredientBuilder (hero table)
   – „Przelicz z PI" (in-flow primary button — same canonical pipeline as the workbar)
   – ProRecalcPanel slot → Podgląd → „Zastosuj zmiany" / „Anuluj" → „Cofnij"
   – „Zapisz nową wersję" stays in the sticky workbar
4. SECONDARY (data-testid="pro-secondary-section") — ONE calm section, ALL collapsed:
   – Dopasowanie receptury (score) · Monitor PI — pełne moduły · Wartości odżywcze
     i koszt · Korekty PI (calm modules, core analysis)
   – red-marked modules (see Failure 3)
```

GoalSetup: the four big quality-tier cards became compact segmented buttons (full
description preserved in the `title` tooltip); same testids, same store actions,
tier still before the collapsed advanced tuning (canonicalWorkbench proofs green).
`ProWorkspacePage.RecipeTab` passes `onRecalc` + `recalcSlot` into the surface — the
recalc preview now opens IN the primary path (verified live: „Receptura znajduje się
już w zatwierdzonym zakresie…" renders inside `pro-primary-flow`).

---

## FAILURE 3 — Red review marks missing

### Fix

New `ReviewMarkedModule` (src/features/design-review/ReviewMarkedModule.tsx): red
LEFT border (`border-l-review`) + red badge (flag glyph + text — never color alone),
native `<details>` collapsed by default, module fully functional inside. **NOT gated**
behind `VITE_DESIGN_REVIEW` / `useReviewMode` — visible immediately on every build of
this page (proven by test: the source contains no env/gating). The session-gated
`ReviewBadge` (RV-12/RV-13) is unchanged and its customer-invisibility tests stay
green.

### Red-marked modules on /pro/recipe

| Module | testid | Badge |
|---|---|---|
| Narzędzia partii i blokad (Studio) — batch rescale, feasibility, history (legacy Studio remnants) | `review-marked-studio-tools` | `DO PRZEGLĄDU` |
| Asystent PI (szkic) | `review-marked-assistant` | `OPCJONALNE` |
| Przewodnik przepływu | `review-marked-flow-guide` | `OPCJONALNE` |
| Podgląd optymalizacji (+ SaveCorrectionControl) | `review-marked-optimization` | `OPCJONALNE` |
| Ratunek partii · Braki magazynowe (IF9/IF10 — Batch Rescue + Stock Shortage) | `review-marked-branch-previews` | `ADVANCED / REVIEW` |
| Diagnostyka właściciela (owner QA diagnostics, kept, collapsed) | `review-marked-owner-diagnostic` | `ADVANCED` |

Decision note: the four core analysis modules (score / Monitor / nutrition /
corrections) are collapsed CALM modules without a red mark — they are the product's
own analysis layer, not experimental/legacy surface; the red marks cover everything
the owner listed (Batch Rescue, Stock Shortage, deep diagnostics, experimental
recommendation modules, legacy Studio remnants).

Guard: `src/pages/pro/proRecipeUxRepair.test.tsx` (11 tests) — badges render with
their exact texts on `/pro/recipe`, are collapsed by default, the marker is ungated;
all 9 workspace tabs render; the canonical nav config keeps its full 16-entry list;
every legacy module is still mounted (no `display:none`, no `hidden` utility);
`src/app/routes.test.tsx` (pre-existing route inventory) stays green.

---

## FAILURE 4 — Truthful states

1. **No blank panels** — the Failure-1 token fix makes every panel render dark with
   light text; every panel already carries an honest empty state (Monitor: „Dodaj
   składniki…", corrections: honest incomplete/none copy).
2. **Preview 0 g lines** — `ConstraintPreviewCard` now splits `unchanged` lines that
   are 0 g before AND after into a de-emphasized bottom block
   (`data-testid="preview-zero-unchanged"`): heading „Linie 0 g" + note „Te pozycje
   formulacja celowo pozostawiła puste (0 g, bez zmian) — nie wpływają na wynik."
   (ADDED keys `preview.zeroUnchangedHeading/zeroUnchangedNote` in
   constraintStudioCopy). Totals/batch-invariant lines still sum over ALL lines.
3. **Cost honesty** — `NutritionCostScorePanel` cost block with `costs === null` now
   renders `data-testid="cost-empty-state"`: „Brak cen składników — dodaj ceny, aby
   zobaczyć koszt." (ADDED key `studio.metrics.costEmpty`). Never a blank box; with
   cost data present the per-kg/serving rows render as before in the secondary
   section.
4. Monitor tab note updated to a truthful ADDED key (`proWorkspace.monitorNoteDrawer`)
   — the old key claimed the Monitor lives in a „right column" that no longer exists
   (old key kept; ADD-only copy rule respected).

---

## File list

**Styles / primitives (root fix)**
- src/styles/tokens.css — `--color-charcoal` surface token (ADD)
- src/styles/theme-pro-dark.css — charcoal stays dark in scope; review red → `#ef6a6f`
- src/components/ui/CharcoalPanel.tsx — `bg-ink` → `bg-charcoal`
- src/components/ui/buttonStyles.ts — ivory variant `text-ink` → `text-shell`
- src/components/shared/status.ts — pro/premium/demo chip fills de-poisoned
- src/components/shared/SectionLabel.tsx — shell muted tone `/50` → `/65`

**Layout / structure**
- src/pages/pro/ProWorkspacePage.tsx — RecipeTab wires `onRecalc` + `recalcSlot`; monitor tab note
- src/features/studio/StudioEngineSurface.tsx — primary path + ONE secondary section + red marks
- src/features/recipe-goal/GoalSetup.tsx — compact two-row core setup
- src/features/design-review/ReviewMarkedModule.tsx — NEW always-visible red marker

**Truthful states**
- src/features/constraint-studio/ui/ConstraintPreviewCard.tsx — 0 g de-emphasis block
- src/features/pi-panel/NutritionCostScorePanel.tsx — honest cost empty state
- src/copy/en.ts — ADDED keys: `studio.secondary.*`, `studio.metrics.costEmpty`, `proWorkspace.monitorNoteDrawer`
- src/features/constraint-studio/constraintStudioCopy.ts — ADDED keys: `preview.zeroUnchangedHeading/Note`

**Contrast alpha bumps (class-only, presentation)**
- src/features/user-monitor/UserMonitorPro.tsx
- src/features/pi-panel/{OverallScoreCard,PIPanel}.tsx
- src/features/corrections/CorrectionPanel.tsx
- src/features/constraint-studio/ui/{ConstraintHistoryPanel,ConstraintStudioSection,FeasibilityNotice,RangeConstraintEditor,SaveVersionControl}.tsx
- src/features/studio/{OwnerDiagnosticPanel,PresetSelector,StudioModeToggle,StudioSummary}.tsx
- src/features/studio/locked/{LockedCalculatorPreview,LockedPanel,LockedScorePreview}.tsx
- src/features/studioFlow/{StarterDraftPreview,StudioAssistantShell,StudioFlowGuidePanel}.tsx
- src/features/optimization/{BranchWorkflowPreviewPanel,BranchWorkflowPreviews,OptimizationPreviewPanel,SaveCorrectionControl}.tsx
- src/features/pro-core/ProRecalcPanel.tsx
- src/features/ingredient-builder/{IngredientBuilder,IngredientPicker,IngredientRow,ServerIngredientPicker}.tsx

**Tests (NEW)**
- src/styles/themeProDarkContrast.test.tsx — 10 contrast proofs (token + rendered-component)
- src/pages/pro/proRecipeUxRepair.test.tsx — 11 structure/badge/no-removal/truthful-state proofs

## Gates

- `npx tsc -b` — clean
- `npx eslint .` — 0 errors (2 pre-existing fast-refresh warnings, untouched files)
- `npx vitest run` — **4952/4952 green** (4931 baseline + 21 new; full suite includes
  logo hash-lock, route inventory, designReview customer-invisibility, canonical
  workbench, frozen-surface source pins)
- `npm run build` — green

Note: an environment artifact was neutralized before the gates — the agent worktree
was checked out with `core.autocrlf=true` (CRLF working copies broke 5 pre-existing
SQL/source-reading suites); the working copy was normalized back to LF (matching the
index — zero content diffs) and `core.autocrlf=false` set per-worktree only.
