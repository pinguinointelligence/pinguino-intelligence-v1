# PINGÜINO INTELLIGENCE — MASTERPLAN V1

**Status:** Canonical product & technical blueprint for the full MVP. All implementation work must comply with this document. Changes to this document require explicit product-owner approval.

**Created:** 2026-06-11 · **Document version:** 1.0 · **Repository:** `pinguino-intelligence-v1`

---

## Table of contents

1. [Product definition](#1-product-definition)
2. [Core philosophy](#2-core-philosophy)
3. [Brand & Design Lock](#3-brand--design-lock)
4. [Product modes — ECO / CLASSIC / PREMIUM / SIGNATURE](#4-product-modes--eco--classic--premium--signature)
5. [Access tiers & capability gating](#5-access-tiers--capability-gating)
6. [Demo sales flow](#6-demo-sales-flow)
7. [The seven-page user workflow](#7-the-seven-page-user-workflow)
8. [Production-first workflow & Actual Batch Mode](#8-production-first-workflow--actual-batch-mode)
9. [Architecture](#9-architecture)
10. [Exact-correction protection](#10-exact-correction-protection)
11. [Folder structure](#11-folder-structure)
12. [Deterministic calculation engine](#12-deterministic-calculation-engine)
13. [Golden Middle priority order](#13-golden-middle-priority-order)
14. [Flavor-priority logic](#14-flavor-priority-logic)
15. [MyGelato calibration system](#15-mygelato-calibration-system)
16. [Ingredient intelligence](#16-ingredient-intelligence)
17. [Database plan (Supabase)](#17-database-plan-supabase)
18. [OpenAI backend plan](#18-openai-backend-plan)
19. [Security rules](#19-security-rules)
20. [Implementation phases](#20-implementation-phases)
21. [Testing & verification rules](#21-testing--verification-rules)
22. [Risks & open questions](#22-risks--open-questions)
23. [Glossary](#23-glossary)

---

## 1. Product definition

**PINGÜINO Intelligence** is a premium AI gelato intelligence platform — a professional, subscription-based tool that guides a producer step by step from idea to a final, production-ready gelato recipe.

PINGÜINO is **not** just a gelato calculator. It is:

1. **AI Gelato Recipe Designer** — goal-driven recipe creation
2. **Live Production Assistant** — guides during physical production
3. **Recipe Correction System** — exact, deterministic corrections ("Add 34.7 g sucrose and 178.0 g milk 3.5 % to rebalance the mixture.")
4. **Ingredient Intelligence Database** — verified and confidence-scored ingredient data
5. **Label Generator** — production-ready label content per recipe and batch
6. **Business / Product Tier Engine** — ECO / CLASSIC / PREMIUM / SIGNATURE optimization
7. **Subscription-based professional tool** — Demo → Basic → Pro, plus Admin

**Hard rule:** the calculation engine is deterministic, formula-based, and reproducible. AI may explain, analyze, and suggest — **AI never replaces the core math engine.** Every number shown to the user comes from the engine.

### 1.1 Beyond the app — the PINGÜINO commercial ecosystem

PINGÜINO Intelligence is one pillar of a larger commercial ecosystem: **PINGÜINO Machines** (all-in-one production/display/mobile hardware offer), **PINGÜINO Ready Mixtures** (ready-to-use mixtures and flavour packs), **PINGÜINO Ingredients** (professional powders, bases and ingredient packs), and the **PINGÜINO Partner Network** (the public "Find PINGÜINO Gelato Near You" map with verified partner badges), plus **Hello PI**, the conversational recipe assistant. The business layer — four commercial offers, partner map, customer dashboard, Hello PI, and future ecosystem tables — is specified canonically in [PINGUINO_COMMERCIAL_ECOSYSTEM_V1.md](PINGUINO_COMMERCIAL_ECOSYSTEM_V1.md). It extends this masterplan; it never overrides the engine plan or the app build order.

---

## 2. Core philosophy

Most gelato calculators focus on technology only. PINGÜINO balances **six dimensions simultaneously**:

1. Taste
2. Structure
3. Serving temperature
4. Cost
5. Production reality
6. Business goal

**Founding principle — auto-balance is not always the best recipe.** A technically balanced recipe can still be *worse* if balancing reduced the main flavor too much. PINGÜINO understands the difference between a technically perfect mixture and a great product. This is encoded in the engine through the [Golden Middle priority order](#13-golden-middle-priority-order) and [Flavor-priority logic](#14-flavor-priority-logic).

---

## 3. Brand & Design Lock

> **This section is binding. All UI work must comply. Deviations require product-owner approval.**

PINGÜINO Intelligence must look like a timeless, premium food-tech company — *premium laboratory software built for a 100-year company*, relevant for 10+ years.

### Direction (required)

- Tesla / Apple inspired: clean, precise, premium
- **Mostly white workspaces**
- **Black / deep charcoal contrast sections** (echoing the logo block)
- Brand ivory: **`#EFE8DC`** (`#efe8dcff`)
- High-end typography, elegant spacing
- Premium laboratory feeling

### Forbidden (required)

- Childish ice-cream styling, candy colors, rainbow status palettes
- Cartoon gauges, mascot illustrations
- Generic SaaS dashboard patterns, gradient-heavy hero clichés

### Design tokens

| Token | Value | Use |
|---|---|---|
| `--paper` | `#FFFFFF` | Primary workspace background |
| `--ink` | `#101113` | Deep charcoal: contrast bands, nav rail, text |
| `--ivory` | `#EFE8DC` | Brand accent: on dark surfaces, key highlights |
| Warm-gray scale | 50–900 | Secondary text, surfaces, dividers |
| Hairline border | 1 px, ~10 % alpha ink | All separation; minimal shadows |
| Status: ideal | desaturated sage | Never bright green |
| Status: risky | desaturated olive-amber | Never yellow-candy |
| Status: error | desaturated terracotta | Never alarm red |

### Typography

- **Hanken Grotesk** — UI and display (closest free neo-grotesque to the Apple/Tesla feel)
- **Uppercase, wide-tracked section labels** — echoing the "P I N G Ü I N O" wordmark
- **IBM Plex Mono (tabular)** — all grams, percentages, and laboratory numbers
- Self-hosted via `@fontsource`; swappable through tokens; font samples shown for sign-off before Phase 1 UI work

### Geometry

- 4 px spacing base; generous landing sections (96–160 px vertical)
- Small radii (4–8 px); minimal shadows; **linear indicator bars** (laboratory precision, no circular candy gauges)

### Brand assets

- Logo reference: `public/brand/logo_reference.jpeg` (ivory penguin mark + wordmark on deep charcoal)
- **Needed from product owner:** SVG / transparent versions and a light-background (charcoal-on-white) variant for white workspaces
- Favicon derived from the penguin mark

---

## 4. Product modes — ECO / CLASSIC / PREMIUM / SIGNATURE

> **Modes are engine behaviors, not styling.** Each mode changes calculation priorities, correction-candidate ranking, main-ingredient policy, and score weighting. Defined in `src/engine/config/modes.ts`.

| | Goal | Engine behavior | Overall-score weights (cost / tech / flavor)* |
|---|---|---|---|
| **ECO** | Lowest possible cost, technically stable, acceptable taste. Hotels, buffets, vending, high volume. | Minimum main ingredient (category minimum allowed); more base ingredients; correction candidates ranked **cheapest-first** (water, milk, SMP, base solids); stable texture over flavor. | ≈ .45 / .40 / .15 |
| **CLASSIC** | Balanced gelato-shop product: good taste, good cost, stable structure. | Pure Golden Middle: band-center seeking; medium main ingredient; balanced sweetness and creaminess; balanced candidates. | ≈ .25 / .40 / .35 |
| **PREMIUM** | High flavor intensity, better mouthfeel, stronger identity. | **Raised main-ingredient floor**; solver rebalances *around* the main ingredient and never blindly reduces it; mouthfeel candidates ranked up (cream, egg yolk, inulin). | ≈ .15 / .40 / .45 |
| **SIGNATURE** | Maximum perceived flavor — a product worthy of brand signature. | Highest main-ingredient priority **plus flavor boosters**: roasted variants, concentrates, pastes, infusions, salt, alcohol, acidity balance (ingredients flagged `is_flavor_booster`). Must remain technically stable. Maximum perceived flavor ≠ only maximum amount of main ingredient. | ≈ .10 / .35 / .55 |

\* Defaults; configurable in `config/modes.ts`, tuned against calibration fixtures.

---

## 5. Access tiers & capability gating

Four access levels. A single capability matrix (`src/access/plans.ts`) is the **only** source of gating truth in the client; Supabase RLS is the server-side truth for stored data.

| Capability | Guest / Demo | Basic | Pro | Admin |
|---|---|---|---|---|
| Demo calculation, mode/temp/batch selection | ✔ | ✔ | ✔ | ✔ |
| PI Profile Indicators Panel | ✔ | ✔ | ✔ | ✔ |
| Ingredient scope | limited demo set | extended | **full database** | full + manage |
| Custom ingredient creation | ✘ | limited | unlimited | unlimited |
| Exact correction grams | **✘ (never)** | ✘ | ✔ | ✔ |
| AI guidance | limited (rule-based) | limited AI suggestions | full AI assistant | full + diagnostics |
| Recipe saving | preview only | limited count | unlimited | unlimited |
| Label generation | preview (watermarked) | basic preview | **full + export** | full |
| Export PDF / production sheet | ✘ | ✘ | ✔ | ✔ |
| ECO/CLASSIC/PREMIUM/SIGNATURE optimization | view modes | partial | **full optimization** | full |
| Actual Batch Mode | ✘ | ✘ | ✔ | ✔ |
| Camera / OCR (Phase 5) | ✘ | ✘ | ✔ | ✔ |
| Technical values (POD/PAC/NPAC/ice fraction…) | ✘ | ✘ | ✔ | ✔ |
| Formula settings, coefficients, confidence management | ✘ | ✘ | ✘ | ✔ |
| Verified-ingredient management, advanced diagnostics | ✘ | ✘ | ✘ | ✔ |

```ts
// src/access/plans.ts — single source of truth
type Plan = 'demo' | 'basic' | 'pro';            // + isAdmin boolean (role, not plan)
interface Capabilities {
  exactCorrectionGrams: boolean;
  ingredientScope: 'demo' | 'extended' | 'full';
  maxSavedRecipes: number;                        // Infinity for pro
  maxCustomIngredients: number;
  labelGeneration: 'none' | 'preview' | 'full';
  exportPdf: boolean;
  actualBatchMode: boolean;
  aiAssistant: 'none' | 'limited' | 'full';
  ocr: boolean;
  adminValues: boolean;
  modeOptimization: 'view' | 'partial' | 'full';
}
```

All gating UI flows through `useAccess()` + the `PlanGate` component (blur/lock + contextual upgrade prompt). Client mode never exposes copyable formulas; Admin mode can show technical values.

---

## 6. Demo sales flow

> **The public demo is a conversion tool, designed end-to-end.**

- Landing page leads with a strong primary CTA: **"Start PI Demo"** (alternate copy: "Test PINGÜINO Intelligence").
- Clicking it starts an **instant Studio session** — no account, `plan = 'demo'`, persisted in localStorage.

**Demo users CAN:**

- Start a demo calculation
- Select product mode, target serving temperature, batch size
- Use the basic demo ingredient subset only
- See the full PI Profile Indicators Panel
- See limited guidance (rule-based, honestly labeled)
- Preview label generation (watermarked)
- Preview recipe saving
- See subscription upgrade prompts

**Demo users CANNOT:**

- See exact correction grams — **never** (see [§10](#10-exact-correction-protection))
- Access the full ingredient database
- Create unlimited custom ingredients
- Export labels
- Save unlimited recipes
- Use camera/OCR
- Use full Pro AI corrections
- Use Actual Batch Mode
- Access technical Admin values

**Upgrade prompts fire naturally at the moment of intent** — clicking Export, opening Actual Batch, requesting exact grams — via `PlanGate`, with contextual teaser copy:

> *"Your mixture can be improved. PINGÜINO Pro calculates the exact correction amount."*

No nagging banners. A save attempt triggers the account-creation prompt (the demo → signup conversion point).

---

## 7. The seven-page user workflow

The Studio guides the user from idea to production-ready recipe. Routes: `/` landing · `/demo` · `/studio` (stepper: Goal → Build → Finalize) · `/library` · `/ingredients` · `/labels/:recipeId` · `/pricing` · `/admin` · `/settings` · `/auth/*`.

### Page 1 — Recipe Goal Setup

The user selects:

1. **Product mode:** ECO / CLASSIC / PREMIUM / SIGNATURE (cards explain calculation behavior, not just style)
2. **Product category:** milk gelato · fruit gelato · nut gelato · chocolate gelato · alcohol gelato · sorbet · vegan gelato · custom
3. **Target serving temperature:** e.g. −11 °C, −12 °C, −14 °C, −18 °C
4. **Batch size:** grams, kg, or liters. **All internal calculations use grams.** Liters are converted via a category density assumption (configurable, ≈ 1.05–1.25 g/ml); the user **confirms or overrides** the estimated batch mass.
5. **Machine capacity:** 2 L max / 5 L max / custom — drives capacity warnings.
6. **Recipe goals:** sweetness (low/normal/high) · flavor intensity (light/balanced/strong/maximum) · creaminess (light/classic/premium/dense) · cost priority (low/balanced/premium) · main-ingredient priority (normal/high/maximum possible) · dietary (vegan, lactose-free, low sugar, no added sugar, alcohol, gluten-free, allergen-aware)
7. **Output type:** create new recipe · improve existing recipe · fix production mistake · create label · create sales name / menu description

### Page 2 — Ingredient Builder + live calculation

Ingredient sources: ① PINGÜINO Base Ingredients ② Verified Ingredient Database ③ Add from label/packaging with AI assessment ④ Manual creation ⑤ (Phase 5) camera/barcode/OCR scan.

Each ingredient row: name · category · **planned grams** · **actual grams** · % of batch · lock/unlock · lock type · production step · cost · notes.

**Lock types:** `unlocked` · `locked by grams` · `locked by percentage` · `locked as main ingredient` · `locked as already added` · `locked as required ingredient`. **Ingredients already added in production are always locked.**

Every change recalculates the engine instantly (live).

### Page 3 — PI Profile Indicators Panel

Sticky right-side panel: **PI — Profile Indicators Panel.**

**Client-facing indicators:** Structure · Freezing Stability · Sweetness · Creaminess · Flavor Intensity · Water Balance · Solids Balance · Fat Balance · Milk Solids Balance · Alcohol Risk · Lactose Risk · Sandiness Risk · Cost per kg · Cost per serving · Overall Score.

**Statuses:** Ideal · Good · Risky · Too soft · Too hard · Too sweet · Too weak · Too expensive · Premium · Needs correction.

**Pro/Admin values (gated):** POD · PAC · NPAC · ice fraction · fat % · protein % · lactose % · water % · total solids % · alcohol % · stabilizer ratio · cost/kg · cost/portion.

Client mode does not expose copyable formulas; Admin mode shows technical values.

### Page 4 — Active AI Correction Panel

Not just a "Fix recipe" button — the app **actively tells the user what to do while building**. The correction panel reads the current deterministic calculation result and generates a structured correction proposal.

- **Pro:** exact corrections — *"Add 34.7 g sucrose and 178.0 g milk 3.5 %."*
- **Demo:** redacted — *"Add balancing ingredients to improve texture. Unlock Pro for exact grams."*

Actions per suggestion: **Apply** · **Edit** · **Ignore** · **"I added a different amount"** (writes actual grams and locks the line as `already_added`).

### Page 5 — Actual Batch Mode (critical feature; Pro)

See [§8](#8-production-first-workflow--actual-batch-mode).

### Page 6 — Label Creation

After balancing, generate: product name · ingredient list (descending by weight) · allergens · nutrition values per 100 g · batch number · production date · **best-before suggestion** · storage instructions · alcohol warning if needed · allergen warning · public description.

> **Best-before is only a suggestion. Final responsibility belongs to the producer.** This disclaimer appears on every generated label.

All numbers come from the engine; AI only words the text (see [§18](#18-openai-backend-plan)).

### Page 7 — Finalization

Save recipe · add to favorites · duplicate · create variants · **create ECO/CLASSIC/PREMIUM/SIGNATURE versions** · export PDF · print production sheet · generate label · generate product photo concept · generate product story · generate menu description · add tasting notes · add production notes · add cost and margin target.

---

## 8. Production-first workflow & Actual Batch Mode

> The app is not only for planning. It must support **real production** — and the engine supports this from day 1, so Actual Batch Mode (Phase 4) is a UI task, not an engine retrofit.

- Every recipe line carries `plannedGrams` + optional `actualGrams`. The engine always computes on **effective grams** = `actualGrams ?? plannedGrams`.
- If the user physically adds a different amount than planned, they enter the real amount; that line becomes **locked as `already_added`** and can never be reduced by the solver — only additions are allowed.

**Actual Batch Mode table:**

| Column | Meaning |
|---|---|
| Ingredient | line reference |
| Planned grams | original plan |
| Actual grams | what was really added |
| Difference | actual − planned (e.g. planned sucrose 34.7 g, actual 50.0 g → **+15.3 g**) |
| Impact | indicator deltas: result-on-actuals vs result-on-planned |
| Correction needed | yes/no, from band violations on the actual state |

**Rescue loop:** the engine recalculates the recipe from the actual batch state, then runs the correction solver with `already_added` locks to produce rescue instructions — exact grams for Pro ("add 178.0 g milk 3.5 % to absorb the excess sucrose"), direction-only guidance for Demo/Basic.

---

## 9. Architecture

**Single Vite SPA + Supabase backend.** One repository, no monorepo tooling.

| Layer | Choice |
|---|---|
| Frontend | Vite + React + TypeScript (strict), React Router v7, Tailwind CSS v4 + themed shadcn/ui primitives |
| Working state | Zustand (`recipeStore` — engine recalcs on every change), `sessionStore` (plan/access) |
| Server state | TanStack Query v5 (Phase 2+) |
| Forms / validation | react-hook-form + zod |
| Engine | `src/engine/` — pure TypeScript, **zero dependencies, no React, no IO**, fully deterministic |
| Backend | Supabase: Postgres + RLS, Auth, Storage (Phase 5 scans), **Edge Functions (Deno)** — the only place the OpenAI key lives |
| Payments | Stripe Checkout + webhooks (Phase 4) |
| Tests | Vitest: unit + golden fixtures + MyGelato calibration fixtures |
| CI | GitHub Actions: typecheck + test + build |

**AI boundary (hard rule):** the engine computes all numbers; AI only explains, words, extracts, and suggests. Edge functions receive *engine-computed snapshots* and never compute nutrition/POD/PAC themselves.

**Data flow (Studio):** `recipeStore → engine.calculateRecipe(input) → RecipeResult → PI Panel + Correction Panel + Label data`.

**Phase 1 needs no backend at all:** the demo flow runs on local seed data + localStorage.

---

## 10. Exact-correction protection

> **Design commitment. Demo users must never see exact correction grams.**

1. **Redact-at-source (MVP):** the engine API is `proposeCorrections(input, { redact })`. With `redact: true` (any demo session), exact gram values are stripped **inside the engine call** — the unredacted proposal exists only transiently inside the pure function and is **never stored in app state, props, or localStorage**. Demo UI components physically cannot render grams because they never receive them. Demo correction copy comes from a fixed teaser catalog in `src/copy/teasers.ts`, e.g. *"PINGÜINO Pro can calculate the exact amount to add."*
2. **Server-side migration path (binding):** the correction solver (`src/engine/corrections/`) is written IO-free and portable so it can be **moved verbatim into a Supabase Edge Function (`solve-corrections`)**, removing the exact-correction business logic from the client bundle entirely. This move is scheduled as the **Phase 5 hardening item**.
3. **Residual MVP risk (accepted, documented):** until the Phase 5 move, the solver code ships inside the JS bundle; a determined user could invoke it via devtools. Accepted for MVP; see [§22 Risks](#22-risks--open-questions).

---

## 11. Folder structure

```
pinguino-intelligence-v1/            # repo root
├─ docs/
│  └─ PINGUINO_MASTERPLAN_V1.md      # this document (canonical blueprint)
├─ public/brand/                     # logo assets, favicon, og-image
├─ src/
│  ├─ app/                           # App.tsx, router.tsx, providers.tsx, AppLayout
│  ├─ pages/                         # landing/, studio/, library/, ingredients/,
│  │                                 # labels/, pricing/, admin/, settings/, auth/
│  ├─ features/                      # recipe-goal/, ingredient-builder/, pi-panel/,
│  │                                 # corrections/, actual-batch/, label-generator/,
│  │                                 # finalization/, ingredient-creator/, subscription/
│  ├─ engine/                        # PURE deterministic core (§12)
│  │  ├─ types.ts, index.ts
│  │  ├─ config/                     # coefficients.ts, targets.ts, modes.ts,
│  │  │                              # priorities.ts, density.ts, version.ts
│  │  ├─ composition.ts, pod.ts, pac.ts, iceFraction.ts,
│  │  ├─ statuses.ts, scoring.ts, nutrition.ts, cost.ts
│  │  ├─ corrections/                # solver.ts, candidates.ts, verify.ts, redact.ts
│  │  └─ __fixtures__/
│  │     ├─ golden/                  # synthetic reference recipes (Phase 1)
│  │     └─ mygelato/                # REAL calibration fixtures (§15)
│  ├─ data/                          # baseIngredients.ts (~30 seed), demoLimits.ts
│  ├─ stores/                        # recipeStore.ts, sessionStore.ts
│  ├─ services/                      # supabase.ts, recipes.ts, ingredients.ts, ai.ts (Phase 2+)
│  ├─ access/                        # plans.ts (capability matrix), useAccess.ts
│  ├─ copy/                          # ALL user-facing strings, typed (en.ts, teasers.ts)
│  ├─ components/ui/                 # themed primitives
│  ├─ components/shared/             # StatusChip, IndicatorBar, PlanGate, MetricValue,
│  │                                 # SectionLabel, ConfidenceBadge, EmptyState…
│  ├─ lib/                           # units.ts (g/kg/L + density), format.ts, currency.ts
│  └─ styles/tokens.css              # design tokens (Design Lock §3)
├─ supabase/                         # Phase 2+
│  ├─ migrations/, seed.sql
│  └─ functions/                     # ai-assistant/, ai-label/, ai-ingredient-extract/,
│                                    # solve-corrections/ (Phase 5), _shared/
├─ .github/workflows/ci.yml
└─ index.html, vite.config.ts, tsconfig.json, package.json, .env.example, .gitignore
```

---

## 12. Deterministic calculation engine

Pure-function pipeline. Entry point: `calculateRecipe(input: RecipeInput): RecipeResult`. Same input → same output, always. Full float precision internally; rounding only at display (0.1 g / 0.1 %). Every result is stamped with `ENGINE_VERSION` + `CONFIG_VERSION`.

### 12.1 Ingredient data model (per 100 g)

Every ingredient stores: `water_percent`, `solids_percent`, `fat_percent`, `protein_percent`, `carbohydrate_percent`, `sugar_percent`, `sucrose_percent`, `glucose_percent`, `dextrose_percent`, `fructose_percent`, `lactose_percent`, `polyol_percent`, `fiber_percent`, `salt_percent`, `alcohol_percent`, `kcal_per_100g`, `pod_value`, `pac_value`, `npac_value`, `cost_per_kg`, `confidence_score`.

### 12.2 Composition (per the canonical formulas)

```
ingredientContribution = ingredient_grams / total_batch_grams
component_g            = ingredient_grams × component_percent / 100

total_<component>_g    = Σ component_g          (water, solids, fat, protein, lactose,
                                                 sucrose, glucose, dextrose, fructose,
                                                 polyol, fiber, salt, alcohol)

<component>_percent    = total_<component>_g / total_batch_g × 100
```

**Alcohol is treated separately from solids and water** — it has strong freezing impact and its own indicator.

### 12.3 POD (relative sweetness)

Stored-value-first: if an ingredient has a verified `pod_value`, use it. Otherwise derive from the sugar breakdown using configurable coefficients (`config/coefficients.ts`):

| Component | Coefficient (default) | Spec range |
|---|---|---|
| Sucrose | 1.00 | 1.00 |
| Dextrose / glucose | 0.74 | 0.70–0.75 |
| Fructose | 1.73 | 1.70–1.75 |
| Lactose | 0.16 | 0.15–0.20 |
| Invert sugar | 1.25 | — |
| Polyols | per ingredient | ingredient-specific |
| Honey / glucose syrups / special | stored `pod_value` | use stored value |

```
pod_points = Σ(component_g × pod_coefficient) / total_batch_g × 100
```

### 12.4 PAC / NPAC (freezing-power)

Same stored-value-first rule, with **separate configurable coefficient tables** for PAC and NPAC. No hardcoded magic numbers — all coefficients live in config.

| Component | Default coefficient | Notes |
|---|---|---|
| Sucrose | 1.00 | reference |
| Dextrose | 1.90 | stronger freezing effect than sucrose (required) |
| Fructose | 1.90 | stronger freezing effect than sucrose (required) |
| Lactose | 1.00 | |
| **Alcohol** | **7.40** | must strongly increase freezing depression (required) |
| Salt | ~11.7 | flagged for calibration; admin-tunable |
| Glucose syrups | by **DE value** | dry-syrup values depend on DE; stored per ingredient |
| Honey / liquid glucose syrup | stored `pac_value` / `npac_value` | use stored when available |

```
npac_points = Σ(component_g × npac_coefficient) / total_batch_g × 100
```

If an ingredient has verified `pac_value` / `npac_value`, use it; otherwise estimate from the sugar breakdown and alcohol. The **normalization basis is configurable** (`per_total_mass`, default per the canonical formula, vs `per_water_mass`) and will be settled against MyGelato calibration fixtures (§15).

### 12.5 Ice fraction (MVP scoring model)

Anchor-matrix interpolation on (target temperature, NPAC): at −11 °C, NPAC 33 → ≈ 54.5 % ice and NPAC 42 → ≈ 45 % (inverse-linear within the band, matching the paired target ranges below); anchor rows at −8 / −14 / −18 °C; all anchors configurable. **Documented upgrade path:** replace with a freezing-point-depression curve model in a later phase without changing the engine API.

### 12.6 Target ranges (configurable by category and temperature)

Reference bands for **milk gelato at −11 °C** (from current tests — seeded verbatim into `config/targets.ts`):

| Metric | Target range |
|---|---|
| POD | 12–17 |
| NPAC | 33–42 |
| Ice fraction | 45–54.5 |
| Lactose | 4–6 |
| Lactose sandiness risk | 5–9 |
| Fat | 5–12 |
| Aerating protein | 3–6 |
| Protein share in solids | 9–13 |
| Total solids | 31–45 |
| Water | 57–70 |
| Alcohol | 0–2.5 for stable gelato; warning above |

Other categories/temperatures ship as estimated defaults flagged for tuning; all bands keyed by `(product_category, target_temp band)`.

### 12.7 Statuses

Each indicator maps band distance to the status vocabulary: **Ideal · Good · Risky · Too soft · Too hard · Too sweet · Too weak · Too expensive · Premium · Needs correction** (directional labels chosen by indicator and side of the band).

### 12.8 Scoring

1. **Technical Score** — freezing stability, NPAC/PAC, POD, ice fraction, water, solids, fat, protein, lactose, alcohol, stabilizer ratio (band-distance subscores, weighted by priority).
2. **Flavor Score** — main-ingredient percentage vs mode target, flavor-mode goal match, ingredient intensity, premium/signature logic.
3. **Cost Score** — cost/kg, cost/portion vs the user's cost priority.
4. **Overall Score** — mode-weighted combination (§4): ECO more cost weight; CLASSIC balanced; PREMIUM more flavor + structure; SIGNATURE highest flavor/perceived-flavor weight while remaining technically stable.

### 12.9 Correction engine

Deterministic solver (`corrections/solver.ts`):

1. Rank band violations by the [Golden Middle priority order](#13-golden-middle-priority-order), then severity.
2. Build candidate actions from the correction-ingredient set — sucrose, dextrose, skimmed milk powder, milk 3.5 %, cream 30 %, inulin, tara gum, salt, water (sorbet/vegan), main ingredient (only if flavor priority allows) — honoring **locks** (already-added lines can never be reduced), **mode rules** (§14), dietary constraints, and machine capacity.
3. For paired violations, solve the small mass-change-aware linear system in added grams (additions change total mass; cross-multiplied percentage targets remain linear) → exact answers like *"add 34.7 g sucrose + 178.0 g milk 3.5 %"*.
4. **Verify every proposal by re-running the full engine** on the hypothetical recipe (≤ 3 refinement rounds); reject any proposal that worsens a higher-priority band.
5. Emit ranked `CorrectionProposal[]` with reason codes, affected indicators, and predicted deltas.
6. Apply the redaction layer for demo sessions (§10).

**Canonical correction rules (from spec):** sweetness too low → add sucrose or dextrose depending on POD/NPAC need · NPAC too low → add dextrose/glucose/fructose source · NPAC too high / too soft → reduce high-PAC ingredients if unlocked, or add solids/fat/base · fat too low → add cream or butter · fat too high → add milk/water/fruit/base solids per recipe type · solids too low → add SMP, inulin, or dry solids · water too high → add solids or reduce watery ingredient if unlocked · alcohol too high → warn (cannot always fix), add solids/fat/base or reduce alcohol if unlocked · lactose too high → reduce milk powder/lactose sources if unlocked.

### 12.10 Nutrition & cost

Per-100 g label values from ingredient kcal contributions (fallback Atwater: fat 9, protein 4, carbohydrate 4, alcohol 7, fiber 2, polyols 2.4 kcal/g); cost/kg, cost/serving, batch cost. Currency-agnostic engine; default display EUR.

---

## 13. Golden Middle priority order

> **Required.** The engine optimizes toward **band centers in a fixed priority order** — the best stable compromise, never maximizing one metric at the expense of a higher-priority one. Stored in `config/priorities.ts`; used for violation ranking AND proposal tie-breaking.

1. **Feasibility & safety** — machine capacity, locked-line integrity, dietary constraints, alcohol warning
2. **Freezing stability / ice fraction**
3. **NPAC / PAC**
4. **POD**
5. **Water / total solids**
6. **Fat**
7. **Protein**
8. **Lactose & sandiness risk**
9. **Stabilizer ratio**
10. **Flavor priority** (main-ingredient preservation per mode)
11. **Cost**

A proposal that improves a higher-priority dimension wins over one that perfects a lower one. A proposal is **rejected** if it fixes a lower-priority band by breaking a higher-priority one.

---

## 14. Flavor-priority logic

> **Required — core product advantage.** Auto-balance must never blindly reduce the main flavor ingredient to perfect technical values.

- In **PREMIUM / SIGNATURE**, the main ingredient (lock type `main`, or the highest-flavor line) gets a **hard floor**: the solver treats it as reduce-forbidden and resolves technical violations by adjusting everything else (sugars split, dairy ratio, solids, stabilizer).
- If a technical band is unreachable without touching the main ingredient, the engine **says so explicitly** — e.g. *"Structure can only be fixed by reducing hazelnut paste below your Premium floor — consider Signature boosters or accept Risky structure."* This trade-off message is a first-class `CorrectionProposal` kind, never a silent flavor downgrade.
- In **ECO / CLASSIC**, the main ingredient is adjustable within category min/max, but is still last in the reduction order before cost-driven candidates.

---

## 15. MyGelato calibration system

> **Required.** The engine is calibrated against **real test recipes**, not only synthetic goldens.

- **Location:** `src/engine/__fixtures__/mygelato/` — created in Phase 1 with a typed schema and placeholder files; **real data filled in later from the product owner's screenshots and manual records.**
- **Two fixture kinds** (one `CalibrationFixture` discriminated union):
  - **Ingredient fixtures** — assert per-ingredient POD/PAC/NPAC derivation matches known values: `honey`, `dry-glucose-syrup-39de`, `liquid-glucose-syrup`, `inulin`, `alcohol-jim-beam`, `mascarpone`, `pistachio-paste`.
  - **Recipe fixtures** — full mixes asserting indicator outcomes within tolerance: `chocolate`, `raspberry`, `apple`, `banana`, plus any of the above used in complete recipes.
- **Schema:**

  ```ts
  { kind: 'ingredient' | 'recipe', name: string, status: 'pending' | 'active',
    input: IngredientComposition | RecipeLine[],
    expected: { pod?, pac?, npac?, iceFraction?, indicators? },
    tolerance: number }
  ```

- `calibration.test.ts` iterates all fixtures — **skips `pending`, fails on `active` misses.**
- **Calibration workflow:** when an active fixture disagrees → adjust `config/coefficients.ts` / `config/targets.ts` **only** (never per-recipe hacks) → bump `CONFIG_VERSION` → all goldens + calibration fixtures must pass together. This is why every coefficient lives in config, not inline.

---

## 16. Ingredient intelligence

Every ingredient carries a **confidence score**:

| Score | Meaning |
|---|---|
| 100 % | verified |
| 95–99 % | very high confidence |
| 90–95 % | high confidence |
| 80–90 % | good estimated |
| < 80 % | needs verification |

**Sources:** verified database · producer label · OCR scan · manual input · AI estimation · external public database · user-created.

**Rule:** AI (and the UI) must always distinguish verified vs estimated values. AI-extracted or AI-estimated ingredients are never auto-verified (`is_verified = false`, source recorded). The `ConfidenceBadge` component surfaces this everywhere ingredients appear.

---

## 17. Database plan (Supabase)

Phase 2+. Tables per spec; additions marked **(+)** with rationale.

### ingredients

`id, name, brand, category, subcategory, is_base_ingredient, is_verified, is_dairy, is_animal_origin, is_powder, contains_egg_protein, water_does_not_need_stabilization, denatured_protein, kcal_per_100g, water_percent, solids_percent, fat_percent, saturated_fat_percent, protein_percent, carbohydrate_percent, sugar_percent, sucrose_percent, glucose_percent, dextrose_percent, fructose_percent, lactose_percent, polyol_percent, fiber_percent, salt_percent, alcohol_percent, pod_value, pac_value, npac_value, cost_per_kg, confidence_score, source_type, source_url, notes, created_at, updated_at`
**(+)** `created_by uuid NULL` (user-created rows) · `is_public bool` · `allergens text[]` (EU-14, required for label allergen aggregation) · `de_value numeric NULL` (glucose syrups) · `is_flavor_booster bool` (SIGNATURE candidate pool).

### recipes

`id, user_id, name, product_type, recipe_mode, target_temperature, target_batch_grams, target_batch_liters, machine_capacity_liters, status, overall_score, tech_score, flavor_score, cost_score, is_favorite, created_at, updated_at`
**(+)** `parent_recipe_id` + `variant_mode` (duplicates and ECO/CLASSIC/PREMIUM/SIGNATURE variants) · `tasting_notes`, `production_notes` · `sell_price_per_kg`, `target_margin_percent` (Page 7) · `goals jsonb` (Page 1 selections) · `density_g_per_ml` (confirmed liters→grams assumption).

### recipe_items

`id, recipe_id, ingredient_id, planned_grams, actual_grams, locked, lock_type, production_step, notes, created_at, updated_at` — `lock_type` enum: `unlocked | grams | percent | main | already_added | required`.

### recipe_scores

`id, recipe_id, pod, pac, npac, ice_fraction, water_percent, solids_percent, fat_percent, protein_percent, lactose_percent, alcohol_percent, sandiness_risk, stability_status, sweetness_status, texture_status, flavor_status, created_at`
**(+)** `engine_version`, `config_version` — a saved score records which formula config produced it (reproducibility across calibration-driven config changes).

### ai_logs

`id, user_id, recipe_id, action_type, user_prompt, ai_response, structured_json, created_at`

### product_scans

`id, user_id, image_url, detected_text, extracted_json, ingredient_id, confidence_score, created_at`

### profiles

`id, email, full_name, plan, created_at, updated_at` — `plan` enum `basic | pro` **(+)** `is_admin bool` (admin is a role, not a plan).

### subscriptions

`id, user_id, plan, status, provider, current_period_end, created_at, updated_at` **(+)** `provider_customer_id`, `provider_subscription_id` (Stripe).

### favorites

`id, user_id, recipe_id, created_at`

### (+) labels

`id, recipe_id, batch_number, production_date, best_before, content_json, created_at` — persisted label generations (implied by export + batch numbers).

### (+) app_config

`key, value jsonb, version, updated_by` — Admin-tunable engine coefficients/targets overriding the shipped TS defaults (Phase 3+).

### Row-level security

- Own-rows policies on `recipes`, `recipe_items`, `recipe_scores`, `favorites`, `ai_logs`, `product_scans`, `labels`, `profiles`.
- `ingredients` readable when `is_base_ingredient OR is_verified OR is_public OR created_by = auth.uid()`; writable by owner.
- Admin-wide access via `is_admin`.
- **RLS is the server-side truth for all gating of stored data; client gating is UX.**

---

## 18. OpenAI backend plan

OpenAI is used for: recipe explanation · product-label OCR analysis · ingredient data extraction · missing-value estimation · correction explanation · recipe variant generation · product names · label text · menu descriptions · translation · customer-friendly reports.

**Supabase Edge Functions (Deno)** — the only place the OpenAI key exists. Model id configurable via env.

| Function | Phase | Purpose |
|---|---|---|
| `ai-assistant` | 3 | action_type + **engine-computed snapshot** + context → explanation, suggestions, variants, names, menu text. System prompt enforces: *never compute — only explain engine numbers.* Structured JSON out (zod-validated client-side), logged to `ai_logs`. |
| `ai-ingredient-extract` | 3 (text) / 5 (image) | pasted label text or image → ingredient JSON with per-field confidence; always `is_verified = false`, `source_type ∈ {label, ocr, ai_estimated}`. |
| `ai-label` | 3 | wording only: name, public description, storage text, allergen phrasing. All numbers passed in from the engine. |
| `solve-corrections` | 5 | hardening: the portable corrections module moved server-side (§10). |

Functions verify the Supabase JWT and read `profiles.plan` for per-plan rate limits. Demo users get no AI calls — Phase 1 demo "AI guidance" is honest rule-based template messaging generated from the correction engine's reason codes.

**Hello PI (planned):** the conversational entry point into PINGÜINO Intelligence — text chat first (extends `ai-assistant`, Phase 3), real-time voice later. Full specification in [PINGUINO_COMMERCIAL_ECOSYSTEM_V1.md §6A](PINGUINO_COMMERCIAL_ECOSYSTEM_V1.md#6a-hello-pi--conversational-recipe-creation-assistant). It obeys this section's AI boundary unchanged: PI collects intent and emits structured recipe requests; the deterministic engine computes all values, indicators and corrections.

---

## 19. Security rules

1. **Never expose the OpenAI key in the frontend.** Backend/serverless (Edge Function) routes only.
2. Frontend env (`.env`, gitignored; `.env.example` committed):

   ```
   VITE_SUPABASE_URL=
   VITE_SUPABASE_PUBLISHABLE_KEY=
   ```

3. Server-side env (Supabase function secrets only):

   ```
   OPENAI_API_KEY=
   SUPABASE_SECRET_KEY=        # only if needed server-side
   ```

4. RLS on every user-data table; admin powers via `is_admin`, never via client flags alone.
5. Demo redaction at engine source (§10); exact-correction logic scheduled for server-side migration.
6. Client mode never exposes copyable formulas; technical values are plan-gated.
7. AI logs (`ai_logs`) record prompts/responses for audit; no secrets in logs.
8. Stripe webhooks verified by signature (Phase 4).

---

## 20. Implementation phases

### Phase 1 — Deterministic core + demo (no backend)

Landing page · demo flow · Recipe Goal Setup · Ingredient Builder · deterministic calculation engine (full pipeline + corrections + redaction + fixtures) · PI Panel · basic correction suggestions · demo/pro gating UI.
*Engine notes:* Actual-Batch semantics (effective grams, `already_added` locks) and MyGelato fixture schema are built **now**, even though their UI/data arrive later.

### Phase 2 — Supabase

Auth + profiles · recipe saving (recipes/recipe_items/recipe_scores) · ingredient database with RLS · manual ingredient creation · recipe library · favorites.

### Phase 3 — AI

OpenAI Edge Function routes (`ai-assistant`, `ai-label`, `ai-ingredient-extract` for pasted text) · AI assistant UI · label generation page · ingredient label analysis · `ai_logs` · demo teasers wired to real Pro AI.

### Phase 4 — Production & monetization

Actual Batch Mode UI (§8) · Pro subscription gating via Stripe Checkout + webhooks · recipe variants (ECO/CLASSIC/PREMIUM/SIGNATURE versions) · export PDF + production sheet.

### Phase 5 — Advanced

Camera/OCR (Supabase Storage + vision) · barcode / external public database lookup · advanced product database · self-learning feedback · **`solve-corrections` server-side hardening (§10)**.

### Beyond the app — ecosystem rollout

The commercial ecosystem (machine catalog, ready-mixtures and ingredient-pack commerce, partner map, public flavour pages, Hello PI voice mode) is staged separately as E1–E4 in [PINGUINO_COMMERCIAL_ECOSYSTEM_V1.md §9](PINGUINO_COMMERCIAL_ECOSYSTEM_V1.md#9-relation-to-the-current-mvp) and does not alter app Phases 1–5 above.

### Build order within Phase 0/1 (approved)

0. Environment (install Node.js LTS) + repo flatten + this masterplan ✅
1. Scaffold (Vite/TS/Tailwind/Router/Zustand/Vitest/ESLint/CI)
2. Design system (tokens, fonts, primitives, copy module)
3. **Engine first, test-driven** (types → config → composition → pod → pac → iceFraction → statuses → scoring → nutrition/cost → corrections → fixtures)
4. Seed data (~30 base ingredients + demo subset)
5. Studio (Goal → Builder → PI Panel → Corrections → Finalize stub)
6. Landing + demo session wiring
7. Phase 1 acceptance verification (§21)

---

## 21. Testing & verification rules

**Engine (Vitest, `npm test`):**

- Golden fixtures: reference recipes (e.g. fior di latte) must land inside the §12.6 bands (POD 12–17, NPAC 33–42, ice 45–54.5, …).
- MyGelato calibration runner: schema validated, `pending` fixtures skipped, `active` fixtures enforced (§15).
- Invariants: component sums ≤ batch mass · mass conservation in corrections · locked / `already_added` lines never reduced · main-ingredient floor held in PREMIUM/SIGNATURE · **no accepted proposal worsens a higher-priority band** (property test on §13) · determinism snapshots (same input → identical output).

**Gating:**

- Demo session state inspection: **no exact gram values present** in store, props, or localStorage for redacted proposals; teaser copy renders instead.
- `PlanGate` fires contextual upgrade prompts on Export / Actual Batch / exact-grams intents.

**App (manual demo walk, every release):**

Landing → Start PI Demo → Goal Setup (modes, temperature, batch g/kg/L + density confirm) → add ingredients → PI Panel updates live → corrections show Pro grams / demo teasers correctly → Finalize shows upgrade prompts.

**Design:**

- Visual check against the Design Lock (§3): white workspace, charcoal bands, ivory accents, mono lab numerals, no candy colors, no SaaS-dashboard patterns.

**CI:**

- GitHub Actions: typecheck + test + build must be green on `main`.

**Reproducibility:**

- Saved scores carry `engine_version` + `config_version`; any coefficient change bumps `CONFIG_VERSION` and must keep all goldens + active calibration fixtures passing.

---

## 22. Risks & open questions

1. **Client-side solver exposure (MVP)** — demo never *sees* grams (redact-at-source), but the solver code ships in the bundle until the Phase 5 `solve-corrections` move. Accepted, binding hardening item.
2. **NPAC definition needs calibration** — the canonical formula (per total batch mass) and the 33–42 band must be validated against MyGelato fixtures; normalization basis kept configurable. **Product owner to supply fixture data (screenshots / manual values) for the 11 named references early in Phase 1.**
3. **Ice fraction is an approximation** (anchor interpolation); freezing-curve upgrade path documented.
4. **Seed ingredient data** is literature-based (confidence < 100) pending product-owner verification; calibration fixtures are the correction mechanism.
5. **Salt / polyol PAC coefficients** vary by source — flagged defaults, admin-tunable.
6. **Is Basic free or paid?** Business decision pending; schema and gating work either way (assumed free signup tier).
7. **Label legal compliance** — EU 1169/2011 assumed for ingredient ordering / allergens; confirm target market(s) before Phase 3 label export. Best-before always a suggestion + producer-responsibility disclaimer.
8. **Liters→grams density** — category defaults ≈ 1.05–1.25 g/ml, always user-overridable.
9. **Currency** — default EUR, configurable; engine is currency-agnostic.
10. **Logo exists only as JPEG on dark** — SVG / transparent / light-background variants needed from product owner.
11. **PDF export approach** (Phase 4) — print-CSS production sheet first; `@react-pdf/renderer` for branded label PDFs; decide at Phase 4 start.

---

## 23. Glossary

| Term | Meaning |
|---|---|
| **POD** | Potere Dolcificante — relative sweetening power (sucrose = reference) |
| **PAC** | Potere Anti-Congelante — anti-freezing (freezing-point-depression) power of sugars |
| **NPAC** | Net/normalized anti-freezing power including alcohol and salts — PINGÜINO's primary freezing-stability metric |
| **Ice fraction** | Estimated share of water frozen at the target serving temperature |
| **DE value** | Dextrose Equivalent of glucose syrups — drives their POD/PAC |
| **SMP** | Skimmed milk powder |
| **Golden Middle** | PINGÜINO's optimization principle: band centers, fixed priority order (§13) |
| **Effective grams** | `actualGrams ?? plannedGrams` — what the engine always computes on |
| **PI Panel** | Profile Indicators Panel (Page 3) |
| **PlanGate** | The single UI gating primitive (blur/lock + contextual upgrade prompt) |
| **Redact-at-source** | Demo gram-stripping inside the engine call (§10) |
| **MyGelato fixtures** | Real test-recipe calibration data (§15) |
| **Design Lock** | The binding brand/design constraints (§3) |
