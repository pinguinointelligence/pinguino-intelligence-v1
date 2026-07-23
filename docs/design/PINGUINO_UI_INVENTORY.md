# PINGÜINO — COMPLETE UI INVENTORY (Masterpiece UX/UI, Phase 1)

Date: 2026-07-24 · Agent G (design-only worktree) · Baseline commit: `4dfb097`

Legend for **status** (owner-binding rule — never REMOVE):
`KEEP` · `RELOCATE` · `MERGE CANDIDATE` · `RENAME CANDIDATE` · `REVIEW` (red `DO PRZEGLĄDU` marker) · `OWNER DECISION` (pending).

Every REVIEW row also appears in `docs/design/PINGUINO_REVIEW_ITEMS.md` with a stable item id
(`RV-…`) consumed by the staging-only owner review mode (`src/features/design-review/`).

---

## 1. Routed pages (public + auth)

| # | Route | Persona | Current shell | Function | Data source | Design issue | Proposed destination | Status |
|---|-------|---------|---------------|----------|-------------|--------------|----------------------|--------|
| 1 | `/` | public | Customer-shell light system (`landingCopy`, `CustomerMenu`, `touchButtonClasses`) | Light marketing landing: hero → Monitor preview → Jak to działa → plans → FAQ → CTA | static `landingCopy.ts` + `landingMonitorDemo` | Coherent, PL, light-first. Uses the customer-shell token system, not `tokens.css` primitives (two design systems co-exist) | Stays the light public page; tokens consolidated in Phase 4 doc | KEEP |
| 2 | `/start` | public (Demo flow) | Own `ShellRoot` + `CustomerMenu` (customer-shell) | The guided customer flow: idea → machine → batch → result, ingredient resolution (Product Picker), Monitor PI section, resolution/substitution sheets | engine + bundled product snapshot | Agent D owns the persona/entitlement seam **tonight** — presentation notes recorded, no edits | Canonical customer flow | KEEP (boundary) |
| 3 | `/classic` | — | redirect → `/start` | legacy entry | — | none | keep redirect | KEEP |
| 4 | `/demo` | — | redirect → `/start` | legacy entry | — | none | keep redirect | KEEP |
| 5 | `/pro` + `/pro/:section` | pro (honest gate otherwise) | `AppShell` (light header) + light tab bar + light `ProWorkbar` + **dark** engine lab + dark recalc panel | THE canonical professional workspace; 9 sections | engine + recipeStore + constraint-studio + pro-core repos | **Light/dark sandwich**: light chrome, dark lab, light tabs — the “disconnected visual systems” feeling the owner names. Tab row is a second horizontal nav under the global header. Several tabs are notes, not workspaces (see §3) | Dark professional identity for the whole `/pro` chrome (Phase 5, token-scope wrapper — no logic change) | KEEP + Phase 5 restyle |
| 6 | `/studio` | — | redirect → `/pro/recipe` (query preserved) | legacy entry | — | none | keep redirect | KEEP |
| 7 | `/calculator` | — | redirect → `/pro/recipe` | legacy entry | — | none | keep redirect | KEEP |
| 8 | `/recipes` | public | `DestinationSurface` (AppShell + dark body) | Recipes hub (browse) | static; “Moje receptury” link is real, the rest are decorative placeholder tiles | English copy (`copy.nav.recipes`) on a customer path; placeholder tiles look clickable but are dead-looking decorative surfaces | PL copy pass; placeholder tiles clearly labeled as roadmap | REVIEW (RV-01) |
| 9 | `/my-recipes` | authed | `AppShell` light | Saved recipes list (aggregates; versions live in Pro → Wersje) | Supabase repo via react-query | Row of 5 metadata cells + 2 actions can crowd at 320 px; `Usuń` uses `window.confirm`; opens recipes via `navigate('/studio')` (redirect hop) | Keep; contextual polish post-merge (confirm dialog, mobile stacking) | KEEP + notes |
| 10 | `/label` | public | `DestinationSurface` dark | Create Label: sample nutrition declaration, QUID statement, CSV/print | engine sample recipe | English copy on a customer path; sample-only (honest) | PL copy pass post-merge | REVIEW (RV-02) |
| 11 | `/api` | public | `DestinationSurface` dark | API destination — all rows `ComingSoonRow` | static | English; 7 coming-soon rows, no action | Keep as roadmap surface; PL pass | REVIEW (RV-03) |
| 12 | `/work-with-us` | public | `DestinationSurface` dark | 4 partnership offers + mailto CTA | static | English copy on a customer path | PL pass post-merge | REVIEW (RV-04) |
| 13 | `/subscription` | public | Customer-shell LIGHT system (Track C rebuild) | Plans / conversion page; honest checkout state | `landingCopy.plans` + billing catalog | Coherent with landing. OK | Canonical plans page | KEEP |
| 14 | `/create-ingredient` | public | `DestinationSurface` dark | Create Ingredient destination — coming-soon rows | static | English; 6 coming-soon rows | Keep as roadmap surface; PL pass | REVIEW (RV-05) |
| 15 | `/profile/machine` | public | `CustomerSurface` light + `CustomerMenu` | Moja maszyna — machine settings, default batch, container | localStorage adapter (backend launch-gated) | Coherent light settings page; duplicated by Pro → Maszyna tab (see §3) | Keep as the full settings page; Pro tab remains the per-recipe selector | KEEP |
| 16 | `/products/import` | authed (import) | `DestinationSurface` dark | CSV product-catalog intake (generic/Mercadona/Colin) | products layer | Internal-first technical surface on a public route; English; no nav entry (direct URL only — allowed, documented) | Owner-only capability + `Diagnostyka właściciela` grouping post-merge | REVIEW (RV-06) |
| 17 | `/customer-v1` | — | redirect → `/start` | legacy preview path | — | none | keep redirect | KEEP |
| 18 | `*` | public | standalone | `NotFoundPage` 404 | — | Mixed EN headline + PL back-link in one view | One-language pass | REVIEW (RV-07) |

### 1.1 DEV-only routes (dev builds only; dead-code-eliminated in production)

`/dev/mapper-smoke`, `/dev/mapper-batch-6`, `/dev/mapper-review`, `/dev/mapper-status`,
`/dev/enrichment-preview`, `/dev/snapshot-audit`, `/dev/studio-picker-proof`, `/dev/intake-hub`,
`/dev/ocr-intake`, `/dev/ocr-batch`, `/dev/reference-proposals`, `/dev/spine`,
`/dev/product-intelligence-preview`, `/dev/pi-calculated-activation-preview`,
`/dev/optimization-preview`, `/dev/branch-recalculation-preview`, `/dev/pi-monitor`,
`/dev/account-access`, `/dev/product-verification`, `/dev/ingredient-resolution`,
`/dev/pro-recipes`, `/dev/pro-production`, `/dev/pro-costs`.

Persona: internal QA. Shell: various technical layouts. Status: **KEEP** — they are the QA
separation working as designed (never linked in nav, never in production builds). No red markers
needed: normal customers can never reach them.

---

## 2. Navigation systems (the duplication the owner feels)

| Item | Where | Function | Design issue | Proposed destination | Status |
|------|-------|----------|--------------|----------------------|--------|
| `AppNavDrawer` + `appNav.ts` | AppShell pages (`/pro`, `/my-recipes`, destinations) | THE canonical hamburger drawer (right side), grouped Nawigacja / PINGÜINO Pro / Konto, capability-filtered | — (frozen accepted baseline) | The one primary navigation | KEEP |
| `CustomerMenu` | `/`, `/start`, `/subscription`, `/profile/machine` | A SECOND hamburger drawer implementation (customer-shell) with its own item list | Duplicated navigation implementation — two drawers, two item sources, drift risk (canonicalPro proof 6 already asserts label parity for customer items) | MERGE into one drawer implementation driven by `appNav.ts` after P0 merge (CustomerShellV1 seam is owned tonight) | MERGE CANDIDATE (RV-08) |
| `TopNav` + `MegaMenu` + `MegaMenuItem` + `navConfig.ts` | unrouted (legacy Phase 6C black shell; `ShellLayout` used only by unrouted `HomePage`) | Legacy centered top-nav + Tesla mega menus | Legacy Studio-era remnant kept in tree; not reachable from any route; `ImagePlaceholder` from `MegaMenuItem` is still imported by `RecipesHubPage` | Keep in tree (owner rule: delete nothing); consolidation proposal: extract `ImagePlaceholder` to shared, then archive shell legacy after owner decision | REVIEW (RV-09) |
| `AppMenu` | unrouted legacy left-drawer | Legacy left hamburger menu | Superseded by AppNavDrawer; canonicalShell test asserts no routed page uses it | Keep unrouted; owner decision later | REVIEW (RV-10) |
| `ShellLayout` | unrouted (`HomePage` only) | Legacy black AI-first shell | HomePage itself is unrouted (owner decision 2026-07-17) | Keep unrouted | REVIEW (RV-11) |
| Pro tab bar | `/pro/*` | 9-section second-level nav | A second horizontal nav under the global header; on mobile it scrolls horizontally; duplicated entries with the drawer's PINGÜINO PRO group (same 8 sections + Maszyna) | Phase 5: restyle as the workspace's section switcher (visually subordinate to the header); drawer stays the global nav | KEEP + restyle |

---

## 3. PINGÜINO Pro workspace anatomy (`/pro`)

### 3.1 Workbar (`ProWorkbar` — sticky, always visible)

| Element | Function | Issue | Status |
|---------|----------|-------|--------|
| Recipe name / inline `Nazwa receptury` input | new-recipe naming + rename | — (matches the owner's NEW RECIPE state rule) | KEEP |
| `Zapisz recepturę` / `Zapisz nową wersję (vN+1)` | canonical save beside the name | — | KEEP |
| `…` menu: `Zapisz jako nową recepturę`, `Zmień nazwę`, `Dodaj notatkę`, `Archiwizuj recepturę` | contextual recipe actions | `Archiwizuj` confirm uses `window.confirm`; target list (§ contextual actions) wants more entries here post-merge (Wersje, Koszt, Eksport, Produkcja shortcuts) | KEEP + RELOCATE-in candidates |
| Context line (`machine · serving · batch` / `product · tier · °C · g`) | where am I / which recipe | — | KEEP |
| Version + status line (`DD.MM.YYYY · vN`, saved/dirty/error) | saved-state truth | — | KEEP |
| `Monitor PI` (secondary) | opens MonitorDrawer | — | KEEP |
| `Przelicz z PI` (primary, dark) | stages the ONE optimize preview + opens ProRecalcPanel | — | KEEP |

### 3.2 Sections (tabs)

| Tab | Content today | Issue | Status |
|-----|--------------|-------|--------|
| Receptura | Workbar + ProRecalcPanel + dark `StudioEngineSurface` | The one real workspace | KEEP |
| Monitor | Static note (“the active panel is in Receptura”) | A section that is only a note — navigation to an explanation | REVIEW (RV-12): relocate to opening the Monitor drawer directly post-merge |
| Wersje | Real `RecipeVersionsSection` | — | KEEP |
| Produkcja | Honest backend state + “arrives later” | honest, correct pattern | KEEP |
| Historia | Note only | roadmap note | KEEP |
| Koszty | Honest backend state + note | Agent E owns the three-state cost contract — presentation to be built against it (integration point recorded) | KEEP |
| Eksporty | Note only | roadmap note | KEEP |
| Ustawienia | Access chip + account + machine link | — | KEEP |
| Maszyna | `ProMachineSelector` (per-recipe) + link to `/profile/machine` | Potential duplicate with `/profile/machine`; roles differ (per-recipe vs default) — needs one sentence of copy distinguishing them | REVIEW (RV-13) |

### 3.3 Engine lab (`StudioEngineSurface`, dark)

| Panel | Function | Gating | Issue | Status |
|-------|----------|--------|-------|--------|
| `SectionLabel` route header + `StudioSummary` | which engine route / context | — | duplicates workbar context partially (two context lines in view) | REVIEW (RV-14, presentation only) |
| `OwnerDiagnosticPanel` | owner/QA diagnostics | staging Pro | correctly separated | KEEP |
| `PresetSelector` (Demo scenarios) | QA scenarios | DEV only | correctly separated | KEEP |
| `GoalSetup` | product type / tier / serving / batch / advanced | — | — | KEEP |
| `IngredientBuilder` | ingredients, grams, locks, search (Agent C owns search internals) | fullFormula | — | KEEP (boundary) |
| `ConstraintStudioSection` | locks/preview/apply (Agent A owns) | fullFormula | — | KEEP (boundary) |
| `OverallScoreCard` | Dopasowanie receptury 1–10 + coverage | technicalView | — | KEEP |
| `UserMonitorPro` | Monitor Pro modular panel | technicalView | — | KEEP |
| `NutritionCostScorePanel` | per-100 g, cost, scores | technicalView | EN table labels inside PL workspace (advanced detail: allowed, noted) | KEEP |
| `CorrectionPanel` | corrections list | redaction per plan | — | KEEP |
| `Narzędzia zaawansowane` (collapsed details) | StudioAssistantShell, StudioFlowGuidePanel, Podgląd optymalizacji, `BranchWorkflowPreviews` (IF9/IF10) | paid/dev flags | correctly collapsed; naming is customer-safe | KEEP |
| Locked previews (`LockedCalculatorPreview` etc.) | Free-Preview decorative locks | !fullFormula | — | KEEP |

### 3.4 Overlays

| Overlay | Type | A11y today | Status |
|---------|------|-----------|--------|
| `MonitorDrawer` | right drawer (desktop) / bottom sheet (mobile), dark | backdrop, scroll lock, Escape; **no focus trap / focus return** (drawer for nav has both) | KEEP + a11y note (post-merge parity with AppNavDrawer) |
| `ProRecalcPanel` | inline dark panel under workbar (Preview → Zastosuj/Anuluj → Cofnij) | inline (no overlay semantics needed) | KEEP |
| `AppNavDrawer` | right drawer | full: trap, Escape, return, scroll lock, safe-area | KEEP |
| Auth modal (`AuthModalHost`) | modal | (existing) | KEEP |
| Customer `BottomSheet` / `ResolutionSheet` / `SubstitutionSheet` | bottom sheets (customer flow) | (customer-shell system) | KEEP (boundary) |
| Workbar `…` popup | menu popup | outside-click close; no arrow-key roving focus | KEEP + a11y note |

---

## 4. Design-system inventory (current state — two-and-a-half systems)

| System | Where | Pieces |
|--------|-------|--------|
| **tokens.css + ui primitives** (Design Lock) | Pro, destinations, MyRecipes, shell | `--color-paper/ink/ink-soft/shell/shell-raised/shell-line/ivory/ivory-soft/status-*/gold/gold-soft`; fonts Hanken Grotesk + IBM Plex Mono; `tracking-label/wordmark`; `Button`, `Card`, `CharcoalPanel`, `SectionLabel`, `MetricValue`, `StatusChip`, `IndicatorBar`, `PlanGate`, `UpgradePrompt`, `ConfidenceBadge`, `EmptyState`, `IvoryLogoMark`, `buttonClasses`, `SurfaceToneContext` (paper/shell) |
| **customer-shell tokens.ts** | `/`, `/start`, `/subscription`, `/profile/machine` | `customerSpec`, `type`, `color`, `notice`, `radius`, `elevation`, `motion`, `focusRing`, `touch`, `safeArea`, `cardShell`, `touchButtonClasses` + 20 components (TouchButton, BottomSheet, IngredientRow, Toast, Skeleton, StateViews…) |
| **Raw Tailwind palette leaks** | ProWorkbar (`text-amber-700`), ProRecalcPanel (`text-amber-300/90`), stone-* everywhere | ad-hoc colors outside the token set |

Consolidation: Phase 4 (`PINGUINO_DESIGN_SYSTEM.md`) — one token vocabulary, the dark professional
scope for Pro, review-red token, and a mapping table customer-shell ↔ core tokens. The two component
sets are NOT force-merged tonight (CustomerShellV1 is an owned seam); the doc records the target.

---

## 5. Mixed-language / technical-copy areas (customer-visible)

| Area | Issue | Status |
|------|-------|--------|
| `/recipes`, `/label`, `/api`, `/work-with-us`, `/create-ingredient` | English customer copy (`copy.nav.*`) in a PL product | REVIEW (RV-01…RV-05) |
| `NotFoundPage` | EN headline + PL back link | REVIEW (RV-07) |
| `NutritionCostScorePanel`, `PI Profile Indicators` labels | EN technical labels inside the Pro lab | allowed (advanced professional detail) — noted, no marker |
| `copy.menu`, `copy.nav`, `copy.chat`, `copy.home` namespaces | legacy EN namespaces feeding unrouted legacy shells | REVIEW (RV-09/RV-10/RV-11 scope) |

---

## 6. Logo lock (CRITICAL — recorded before any implementation)

| Asset | Path | Dimensions / aspect | SHA-256 |
|-------|------|--------------------|---------|
| Favicon (canonical vector mark) | `public/brand/favicon.svg` | 627 bytes, square viewBox | `66557d73e74ec13458fbc0f81433578197d2e6b143ccf9e5b6441560ff8453b4` |
| Logo reference (photographic reference) | `public/brand/logo_reference.jpeg` | 1000×1000 px (1:1), 39 069 bytes, progressive JPEG | `8d28d57b5eb0708881a3b11a291f3c3092dd7e4108da6ed36aeed2083ce67dd7` |

In-app rendering: `IvoryLogoMark` (SVG component) + `PINGÜINO` wordmark text — placement only,
proportional scaling only. A hash-lock test (`src/components/shared/logoAssetLock.test.ts`) asserts
both files are byte-identical to the values above.

---

## 7. Boundary log (files owned by other agents tonight — read, never edited)

| Owned area | Owner | What Phase 5/6 wanted there | Resolution |
|-----------|-------|------------------------------|------------|
| `src/features/formulation/**`, `src/features/constraint-studio/**` | Agent A | Preview section presentation (`Zmieniono / Dodano przez PI / Usunięto / Zachowano / Efekt` visual grouping lives in `ConstraintPreviewCard`) | Wireframed only (Phase 2 §Preview); integration point recorded in ledger — no edits |
| ingredient search service + `ingredientPresentation` + picker result components | Agent C | Picker result presentation polish | Wireframed only; no edits |
| `CustomerShellV1` persona/entitlement seam | Agent D | One-drawer consolidation (`CustomerMenu` → appNav) | Recorded as MERGE CANDIDATE (RV-08); no edits |
| recipe/version/costs repositories | Agent E | Cost three-state presentation | Presentational contract documented in design system doc §Cost states; build post-merge against Agent E's contract |
