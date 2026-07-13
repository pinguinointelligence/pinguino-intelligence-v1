# 00 — Customer UX Audit (Agent A, senior mobile UX)

> Static / heuristic audit reasoned from source + CSS classes. No dev server was
> run (single preview port reserved for main work). Target viewports:
> **390×844, 430×932, 768×1024, 1440×900**.
>
> Scope = the real customer-facing surfaces only:
> `HomePage → PIChat`, `StudioPage`, `MyRecipesPage`, `destinations/*`,
> `features/shell/*`, `components/shared|ui/*`, `copy/en.ts`, `access/plans.ts`.
>
> Docs-only. No code was changed. Severity: **S1 (blocks a real customer)** →
> **S4 (polish)**.

---

## How to read this

Each finding: **ID · Severity · Area · Where (file:line) · Problem · Why it hurts · Fix direction.**
The fix direction is specified in detail in `02_WIREFRAMES.md`, `03_INTERACTION_STATES.md`
and `06_POLISH_COPY.md`.

---

## TOP 10 — severity-ordered headline problems

| # | ID | Sev | One line |
|---|-----|-----|----------|
| 1 | A-01 | S1 | Customer flow lives on a **dark technical shell** (`bg-shell #1a1a1a`, `[color-scheme:dark]`) — the opposite of the white/light premium brief. |
| 2 | A-02 | S1 | **Body type is 14px, secondary 12px, micro-labels 10px and ~8.8px** — below mobile readability floor everywhere. |
| 3 | A-03 | S1 | **Advanced Studio is a dense lab dashboard** (2-col sticky rail, 8+ stacked technical panels, NPAC/POD/IF9/IF10 jargon) shown to customers right after the conversation. |
| 4 | A-04 | S1 | **No working microphone.** The mic is a decorative `aria-hidden` SVG + "Voice coming soon"; the brief's primary voice affordance does not exist. |
| 5 | A-05 | S1 | **No intent chips.** Flavor is captured verbatim with zero parsing — user cannot see/correct "Wanilia / Bazylia / Mięta". |
| 6 | A-06 | S1 | **The demo hides ingredient NAMES**, not just grams. Target = names + structure visible, only grams 🔒. Current redaction is wrong-shaped. |
| 7 | A-07 | S2 | **No equipment/device step.** Only temperature serving chips exist (Fresh/−11/−12/−13/−18); no Ninja / Ninja Swirl / Witryna cards, temperature is primary not secondary. |
| 8 | A-08 | S2 | **No "matching ready recipes" path and no recipe cards** (no photos, no honest match labels). After the summary the only exit is "Unlock PI Pro". |
| 9 | A-09 | S2 | **Info is re-asked.** The machine always asks batch even when the idea implies it ("Zrób 5 kg wanilii"); serving/batch are never pre-filled from intent. |
| 10 | A-10 | S2 | **Touch targets & tap density fail** — nav/menu link rows are `py-1.5` (~28px), chips `py-2.5` (~40px), many below the 44–48px floor; `MyRecipes` row crams 5 cells + 2 buttons. |

---

## FULL FINDINGS BY AREA

### 1. Readability & typography  (S1–S2)

- **A-02 · S1 · `ChatPrompt.tsx:38`, `ChoiceChips.tsx:36`, `DemoSummary.tsx`, `en.ts` micro-labels.**
  Dominant reading size is `text-sm` = **14px**; secondary `text-xs` = **12px**;
  status/confidence chips `text-[0.625rem]` = **10px**; mega-menu "soon" chip
  `text-[0.55rem]` ≈ **8.8px**. On a 390px phone this is under every accepted
  minimum (iOS/Material both target ≥16px body, ≥11px absolute floor for
  non-essential).
  *Why it hurts:* a gelato maker reads this in a bright kitchen, often 40+, often
  gloved. 12–14px body + 10px chips = squinting.
  *Fix:* body ≥17px, secondary ≥15px, micro-labels ≥13px, question/headline 28–32px.
  See `04_MOBILE_ACCEPTANCE_CHECKLIST.md §Type`.

- **A-11 · S3 · `en.ts` uppercase tracked labels (`tracking-label`, `tracking-[0.08em]`).**
  Small-caps micro-labels ("HERO FLAVOR", "PI PREVIEW") at 10–12px + letter-spacing
  read as decorative noise, not information. Restrict small-caps to true section
  eyebrows at ≥13px.

- **A-12 · S3 · `ChatPrompt.tsx:16`, `DestinationSurface.tsx:28`.**
  `font-light` (300) at large sizes on a dark ground lowers contrast/legibility.
  Use 400 for reading weights; reserve 300 for ≥28px display only.

### 2. Contrast  (S2)

- **A-13 · S2 · pervasive `text-ivory/60`, `/55`, `/45`, `/40`, `/35`.**
  Ivory `#efe9dc` at 35–45% opacity on `#1a1a1a` falls **below WCAG AA (4.5:1)**
  for body text (e.g. `/40` ≈ 2.4:1). Placeholder `placeholder:text-ivory/35`,
  hint `text-ivory/40`, notes `text-ivory/45` are all sub-AA.
  *Fix:* on the new light surface, body text ≥ `#1a1a1a` on white (AAA); any muted
  text ≥ 4.5:1. Never encode meaning in <4.5:1 text.

- **A-14 · S2 · `TopNav.tsx:110` inactive nav `text-ivory/75`; `MegaMenuItem.tsx` links `text-ivory/65`.**
  Interactive labels sit at 65–75% — muddy affordance; selected vs unselected is a
  subtle opacity shift, not a clear state.

### 3. Hierarchy & one-goal-per-screen  (S1–S2)

- **A-03 · S1 · `StudioPage.tsx:129-208`.**
  A single screen mounts: summary, preset selector, GoalSetup, IngredientBuilder,
  OverallScoreCard, PIPanel, NutritionCostScorePanel, CorrectionPanel,
  StudioAssistantShell, StudioFlowGuidePanel, an Optimization-preview block and
  BranchWorkflowPreviews. That is **12 competing goals** on one page. Violates
  "one primary goal per screen".
  *Fix:* the customer result is ONE calm recipe card; everything technical collapses
  under "Dane techniczne" (see `07_HIDE_VS_SHOW.md`). Studio stays as an
  expert/Pro surface, not the default customer destination.

- **A-15 · S2 · `PIChat.tsx` question uses `<h2>` while `ChatPrompt` uses `<h1>`.**
  Heading levels flip between steps; the "one question" is not consistently the
  primary H1. Each conversational step should own a single H1 question.

### 4. Line length & spacing  (S3)

- **A-16 · S3 · `DestinationSurface.tsx:32` blurb `max-w-xl` on `text-lg`.**
  Fine on desktop; verify measure ≤ ~68ch. Body blocks elsewhere are `max-w-xl`
  inside an already-narrow column — acceptable, keep 60–72ch.
- **A-17 · S3 · `DemoSummary.tsx` `p-8` card with `space-y-2` rows** — rows are tight
  (`justify-between`, baseline) and at 390px the label+value can collide. Give
  key/value rows a min 12px gap and allow wrap.

### 5. Navigation  (S2)

- **A-18 · S2 · `TopNav.tsx:84` centered nav `hidden xl:block`.**
  Below **1280px** (i.e. 390 / 430 / 768 all) the entire 8-item mega-nav is replaced
  by a flat hamburger list (`AppMenu`). So **every mobile + tablet customer** loses
  the mega-menu structure and gets a long flat drawer of 8 destinations + 3
  "coming soon" rows. Discovery collapses exactly where most customers are.
- **A-19 · S2 · `AppMenu.tsx:67-93`.**
  The mobile drawer lists all 8 nav items flat, then "My Recipes", then Production /
  Saved as disabled "Soon" rows, then account, then engine label. Mixed live +
  dead + system rows with no grouping or priority.
- **A-20 · S3 · `TopNav.tsx` mega-menus are hover/focus only.**
  Hover-intent (`scheduleClose`, 120ms) has no touch equivalent; on tablet
  (768, touch) the centered nav is hidden anyway, but if the breakpoint is ever
  lowered, hover menus are unreachable by touch.

### 6. Density & "no mobile tables"  (S2)

- **A-10 / A-21 · S2 · `MyRecipesPage.tsx:79-107`.**
  Each saved recipe is a `flex-wrap` row containing an inner **non-wrapping**
  `flex items-center gap-5` with 5 stat cells (Product/Serving/Engine/Batch/Updated)
  + Open + Delete. `copy.recipes.columns` literally models a **table**. At 390px the
  inner group overflows or crushes. This is the "dense mobile table" the brief bans.
  *Fix:* one card per recipe — name + photo + 2 key facts + primary action; details
  in the card body, not a column strip.

- **A-22 · S2 · `StudioPage` right rail `lg:sticky lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto`.**
  A sticky internally-scrolling rail = nested scroll; on tablet portrait (768) the
  2-col grid `lg:grid-cols-[1fr_minmax(380px,420px)]` collapses to stacked, but the
  rail keeps its overflow behavior — nested scroll traps.

### 7. Horizontal scroll risk  (S2)

- **A-23 · S2 · `MyRecipesPage.tsx:86` inner `flex gap-5` (no wrap)** — highest overflow
  risk at 390/430. Must become vertical.
- **A-24 · S3 · `DemoSummary` rows `justify-between gap-4`** with long PL values
  (e.g. "Storage / Retail −18°C") can push width; allow wrap/truncate.
- **A-25 · S3 · `StudioPage` header `flex items-center gap-4`** with StatusChip +
  ModeToggle + Save button + back link — crowds < 430px.

### 8. Jargon & cognitive load  (S1–S2)

- **A-26 · S1 · everywhere.**
  Customer-visible jargon leaking today: **"−11°C Engine"**, **"PI Preview"**,
  **"PI Profile Indicators"**, **"NPAC / POD / Ice fraction / aerating protein /
  protein in solids / lactose sandiness risk"**, **"IF9/IF10"**, **"regulator-shadow"**,
  **"Optimization preview"**, **"dispatcher"** (spine), raw violation/warning codes.
  A customer asking for "lody waniliowe" should never meet "NPAC".
  *Fix:* full hide/show contract in `07_HIDE_VS_SHOW.md`.
- **A-27 · S2 · `en.ts landing.pillars` / `chat.process`.**
  Marketing explains determinism well, but the customer conversation should carry
  **zero** engine vocabulary until the "Dane techniczne" disclosure.

### 9. Conversion path  (S2)

- **A-08 · S2 · `PIChat.tsx:124-128` → `DemoSummary.tsx:101-107`.**
  After the summary the ONLY forward action is `onUnlock` → sets DEV plan `pro`
  and jumps to `/studio`. There is:
  - no "Stwórz nową recepturę" vs "Pokaż pasujące gotowe receptury" fork,
  - no Home-vs-Pro choice (brief wants "Wybierz Home" / "Zobacz Pro"),
  - a single unlock card exists (good bones) but it lands in a dashboard, not a
    calm recipe.
- **A-28 · S3 · `StudioPage.tsx:77`.**
  Upgrade is DEV-only (`import.meta.env.DEV`) and flips a session flag; there is no
  real customer upgrade destination wired into the conversational result. Acceptable
  pre-billing, but the UX must present the two clean choices as spec'd.

### 10. Demo comprehension  (S1)

- **A-06 · S1 · `DemoSummary.tsx` + `demoHints.ts`.**
  Today the demo shows **directional hints only** (area + direction + confidence)
  and a generic process list — **no ingredient names, no structure, no photo, no
  device/mode recipe card**. A first-time customer cannot tell *what the recipe is*.
  The brief's demo must show **names + full structure + product type + photo +
  device/mode + description + substitutions + prep**, hiding **only grams (🔒)**.
  This is the single biggest comprehension gap and it inverts the current redaction
  shape (currently over-redacts names; must under-redact to names, over-redact only
  grams). See `07_HIDE_VS_SHOW.md` for the redact-at-source contract.

### 11. Recipe discovery  (S2)

- **A-29 · S2 · `RecipesHubPage.tsx`, `MegaMenu browse`, `navConfig`.**
  Every recipe tile is a decorative `ImagePlaceholder` (faint `bg-ivory/[0.05]`);
  most link nowhere (`to` omitted → dead tile). "PINGÜINO Recipes / Featured /
  Recent / Start from" all point to `/recipes` or nothing. There is **no real
  recipe catalogue, no photos, no per-recipe page**. The brief's "5–6 ready-recipe
  cards" have no data source yet.

### 12. Accessibility  (S2)

- **A-30 · S2 · `ChatPrompt.tsx:27` mic is `aria-hidden` decorative** — voice is
  announced ("Voice coming soon") but not operable; screen-reader users get a dead
  hint.
- **A-31 · S2 · contrast (A-13) fails AA** for muted text — an accessibility, not
  just aesthetic, defect.
- **A-32 · S3 · `ChoiceChips.tsx:24` uses `aria-pressed`** (good) but chips are the
  only selected-state signal via color inversion; add a check/tick and a non-color
  cue.
- **A-33 · S3 · `MyRecipesPage.tsx:101` delete uses `window.confirm`** — native
  blocking dialog, not a designed, reversible confirmation; jarring on mobile.
- **A-34 · S3 · focus ring** deliberately softened to `rgba(239,233,220,0.35)`
  1px outline (`TopNav.tsx:25`) — on the new light surface re-verify focus meets
  3:1 non-text contrast.

### 13. Trust  (S2–S3)

- **A-35 · S2 · dead ends erode trust.**
  Pervasive "Coming soon" (`navConfig` label/api/ingredient/team + AppMenu
  Production/Saved). Many nav clicks resolve to a placeholder `DestinationSurface`
  ("In the works"). A customer clicking 4 menu items and hitting 4 placeholders
  distrusts the whole product.
- **A-36 · S2 · honesty guardrail (positive, keep).**
  `intakeToRecipe.ts:35` pins temperature to the real −11°C engine and never fakes
  future engines; `demoHints` throws if a result is not redacted; `PlanGate` never
  mounts locked children. These are strong trust primitives — the new UX must reuse
  them, not regress them. **Do NOT introduce fake "94% match".**
- **A-37 · S3 · `en.ts landing` fake-precise sample** "Add 34.7 g sucrose and
  178.0 g milk 3.5%" is *real* determinism messaging (good) but shows exact grams
  in marketing copy while the product hides them from Demo — reconcile tone.

### 14. Protein / unsupported honesty  (S1) — see GAPS

- **A-38 · S1 · `productProfiles.ts:41-48`, `intakeToRecipe.ts:16-21`.**
  Protein has **no Engine profile**; it is silently remapped to `milk_gelato` /
  `milk-base` preset with a calm pendingNote, and a full recipe is produced. The
  brief requires Protein to **return a deterministic unsupported/validation state**,
  capturing intent honestly and **never fabricating** a recipe. Current behavior
  fabricates a milk recipe under a soft note. **Flagged in GAPS.**

---

## Positive foundations worth preserving

- Redact-at-source machinery: `PlanGate` (never mounts locked children),
  `RedactedCorrectionProposal` (no numeric/name fields), the `redact` solver flag.
- A single canonical gram-visibility capability already exists: **`canViewExactGrams`**
  (in `plans.ts` *and* `proCoreCapabilities.ts`) — the new UX gates grams on this,
  never on `isPro`.
- Honest engine/temperature pinning and pendingNotes.
- A calm, single upgrade card pattern (`UpgradePrompt`) — right instinct, wrong
  surface (dark, dashboard).
- Centralized typed copy in `en.ts` — makes the Polish UI copy swap clean.

---

## Severity tally

- **S1:** A-01, A-02, A-03, A-04, A-05, A-06, A-26, A-38  (8)
- **S2:** A-07, A-08, A-09, A-10, A-13, A-14, A-18, A-19, A-21, A-22, A-23, A-27, A-29, A-30, A-31, A-35, A-36  (17)
- **S3/S4:** the remainder (readability polish, spacing, focus, trust tone).
