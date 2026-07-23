# PINGÜINO — ONE DESIGN SYSTEM (Masterpiece UX/UI, Phase 4)

Date: 2026-07-24 · Agent G. Extends the binding Design Lock
(`.claude/skills/pinguino-studio-design/SKILL.md`) toward the owner's **dark professional
identity for the canonical Pro workspace**. Nothing here changes engine/formulation/data logic.

---

## 1. Token vocabulary (CSS, `src/styles/tokens.css`)

| Role | Token | Value | Notes |
|------|-------|-------|-------|
| Background (light workspaces) | `--color-paper` | `#ffffff` | landing/customer routes stay light-first |
| Background (dark professional) | `--color-graphite` | `#131417` | NEW — the Pro workspace canvas |
| Elevated dark surface | `--color-graphite-raised` | `#1d1e22` | NEW — raised cards on graphite |
| Brand shell (engine lab, Monitor) | `--color-shell` | `#1a1a1a` | unchanged; now reads as ELEVATED inside graphite |
| Shell raised | `--color-shell-raised` | `#232323` | unchanged |
| Hairline on shell | `--color-shell-line` | `#efe9dc1f` | unchanged |
| Text primary / primary action | `--color-ink` | `#101113` | flips to ivory `#efe9dc` in the dark scope |
| Text primary hover | `--color-ink-soft` | `#1a1c20` | flips to `#ddd5c4` |
| Brand ivory | `--color-ivory` / `--color-ivory-soft` | `#efe9dc` / `a3` | FINAL brand value (owner decision) |
| Status | `--color-status-ideal/risky/error` | desaturated lab tones | dark-scope variants auto-applied |
| Optimum (golden range ONLY) | `--color-gold` / `--color-gold-soft` | `#8a6c2e` / `#c2a05e` | never generic premium decoration |
| Attention (unsaved/pending) | `--color-attention` / `-soft` | `#8a5a2a` / `#cf9a5c` | NEW — replaces ad-hoc `amber-*` leaks |
| Owner review marker | `--color-review` | `#b3261e` (light) / `#e5484d` (dark scope) | NEW — the ONLY saturated red; owner/QA `DO PRZEGLĄDU` exclusively |
| Focus | `ring-ink/40` (light) → auto-ivory in dark scope | | visible on both schemes |
| Typography | `--font-sans` Hanken Grotesk · `--font-mono` IBM Plex Mono | | mono for ALL technical values (`MetricValue`) |
| Tracking | `--tracking-label: 0.18em` · `--tracking-wordmark: 0.32em` | | uppercase labels echo the wordmark |
| Radii | `rounded` sm–lg only; pills reserved for chips/toggles | | small radii per Design Lock |
| Shadows | hairline borders preferred; `shadow-lg/xl` only for floating layers (menus, drawers, overlay) | | minimal shadows |
| Motion | 150–240 ms ease-out; `motion-safe:` guarded; drawer curve `cubic-bezier(0.32,0.72,0,1)` | | calm motion, reduced-motion respected |

## 2. The dark professional scope (`.theme-pro-dark`, `src/styles/theme-pro-dark.css`)

ONE class re-maps the SAME tokens for a subtree (Tailwind v4 utilities resolve `var(--color-…)`).
Applied by the Pro workspace chrome (Phase 5). Consequences, with zero component forks:

- `bg-paper` → deep graphite `#131417`; `text-ink` → brand ivory; hairlines `border-ink/10` →
  ivory hairlines; `bg-ink text-paper` primary buttons → **ivory action on graphite** (the one
  disciplined accent — no new accent color introduced);
- the engine lab / Monitor drawer (`bg-shell`) becomes a slightly **elevated** dark surface —
  the light-header/dark-lab/light-tabs sandwich disappears;
- `color-scheme: dark` fixes native controls (selects, scrollbars);
- status/gold/attention tones swap to their AA dark-surface variants automatically;
- light routes (landing, `/start`, `/subscription`, `/profile/machine`) are untouched — light
  surfaces stay where they genuinely improve readability (owner rule).

**Avoided by construction**: flat white walls in Pro, cards-in-cards (hairlines + spacing carry
hierarchy), heavy gradients, neon, competing accents, excessive shadows.

## 3. Component hierarchy (reuse-first; no forks)

| Layer | Components | Rule |
|-------|-----------|------|
| Primitives (`src/components/ui`) | `Button`/`buttonClasses` (primary/ghost/ivory · sm/md), `Card`, `CharcoalPanel`, `SurfaceToneContext` | tokens only; tone via context, never props-drilling |
| Shared (`src/components/shared`) | `SectionLabel`, `MetricValue`, `StatusChip`, `IndicatorBar`, `ConfidenceBadge`, `EmptyState`, `PlanGate`, `UpgradePrompt`, `IvoryLogoMark`, `BrandLockup`, `DestinationSurface` | tone-aware via `useSurfaceTone` |
| Shell (`src/features/shell`) | `AppShell` (ONE header: logo left, hamburger right), `AppNavDrawer` (ONE right drawer, `appNav.ts` config) | no page hardcodes nav |
| Pro chrome (`src/features/pro-core`) | `ProWorkbar` (sticky primary actions), `ProRecalcPanel` (Preview→Zastosuj/Anuluj→Cofnij), `MonitorDrawer` (right drawer / bottom sheet), `ProMachineSelector`, `RecipeVersionsSection`, `ProSliceBackendState` | presentation reads stores; constraint-studio remains the only recipe writer |
| Design review (`src/features/design-review`) | `ReviewBadge`, `DesignReviewOverlay`, registry + pure gate | staging + owner/QA only; tested invisible to customers |
| Customer shell (`src/features/customer-shell/ui`) | TouchButton, BottomSheet, IngredientRow, StateViews, Toast, Skeleton… | SECOND system — consolidation target below |

## 4. Customer-shell ↔ core token mapping (consolidation contract)

| customer-shell (`ui/tokens.ts`) | Core equivalent | Action (post-P0 merge — Agent D owns the seam tonight) |
|---------------------------------|-----------------|--------------------------------------------------------|
| `color.textPrimary` (`text-ink`) | `--color-ink` | already aligned |
| `color.textSecondary/Muted` (stone scale) | `--color-stone-*` | aligned by construction |
| `focusRing` | `ring-ink/40` pattern | identical recipe — keep one exported constant |
| `touchButtonClasses('primary')` | `buttonClasses('primary')` + 44 px touch min | merge into one button recipe with a `touch` size |
| `radius.card` / `elevation.card` | `rounded-lg` + hairline | one card recipe |
| `BottomSheet` | `MonitorDrawer` mobile mode | one sheet foundation (focus trap + Escape + return + safe-area) |
| `StateViews` (Empty/Error/Loading) | `EmptyState` + `ProSliceBackendState` | one state-component family (see §6) |

## 5. Buttons, inputs, rows, badges (canonical recipes)

- **Primary**: `buttonClasses('primary')` — ink-on-paper (light) / ivory-on-graphite (dark scope).
  Exactly ONE primary per view: `Przelicz z PI` in the workspace; save is workbar-primary in the
  naming row only.
- **Secondary**: `ghost` hairline. **Tertiary**: text link `underline decoration-ink/25`.
- **Inputs**: `rounded-md border-ink/15 bg-paper text-ink placeholder:text-stone-400
  focus:border-ink/40` — identical dark via scope.
- **Ingredient rows**: name (truncating) · mono grams (`tabular-nums`) · lock glyph+state ·
  hairline dividers (`divide-ink/5` light · `divide-ivory/10` shell).
- **Status badges**: `StatusChip` tones only (ideal/risky/error/attention); review-red is NEVER a
  product status.
- **Score**: `Dopasowanie receptury` + mono value + coverage note (`Oceniono N z M obszarów.`) —
  truthful partial presentation is part of the design system, not optional copy.

## 6. State presentation (every major area)

Canonical shapes (all already exist — the system rule is WHICH to use when):
`EmptyState` (what's missing + one action) · loading = quiet text/skeleton, never a full-screen
loader for small updates · partial = value + coverage/`prowizoryczne` note · warning/error =
status tone + what happened + whether data changed + next action (`Błąd zapisu — spróbuj
ponownie`) · unavailable = honest backend chip (`Zaplecze danych · Nieskonfigurowane w tej
wersji`).

### Cost states (presentational contract for Agent E's three-state data contract)

| Data state | Presentation |
|-----------|--------------|
| complete | `koszt partii` · `koszt 1 kg` · `koszt porcji` (mono, per-serving rows) |
| partial | known cost + „Brakuje cen: N składników” + affected ingredient list + action `Uzupełnij ceny` |
| none | empty state + one action to add prices — never an unexplained dash |

Integration point recorded in the ledger; presentational components build against Agent E's merged
contract shape post-P0.

## 7. Navigation & layout system

- ONE header (`AppShell`): logo left (placement/scale only — artwork hash-locked), hamburger right.
- ONE drawer (`AppNavDrawer` + `appNav.ts`): grouped, capability-filtered, active-state aware.
- Pro section switcher: subordinate second-level tabs INSIDE the dark scope (never a competing
  global nav); duplicated drawer entries stay + red-marked until owner decides.
- Workbar: sticky; primary actions never require scrolling; safe-area padded.
- Desktop editor grid: `1fr + minmax(380px,420px)` sticky lab rail; mobile: single column,
  Monitor/menus as sheets; no nested scroll regions; no horizontal page scroll ever.

## 8. Iconography

One stroke family (round caps, 1.6–1.7 px): hamburger, close, edit, kebab, flag (review). No
emoji, no filled icon mixing. Meaning never by color alone (badges carry text + glyph).

## 9. Accessibility baseline (system-wide)

Keyboard: every interactive reachable; drawers/sheets get focus trap + Escape + focus return
(AppNavDrawer = reference implementation; MonitorDrawer parity is a recorded follow-up).
Focus visible on both schemes (`ring-ink/40` auto-flips). Semantic headings per route; drawers
carry `role="dialog"` + labels; current page via `aria-current`. Touch targets ≥ 44 px (`min-h-11`).
Contrast: AA for text tokens on their surfaces (dark-scope stone/status variants chosen for AA).
200 % zoom: rem-based type + wrapping rows. Reduced motion: all animation `motion-safe:`.
