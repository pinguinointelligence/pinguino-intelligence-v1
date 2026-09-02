# AGENT 4 — Test/Fixture/Hardcode Sweep + PINK Marking (Engine Authenticity)

**Date:** 2026-07-24 · **Base:** `nightly/integration` = `6f8e680` · **Branch:** `agent4/fixture-sweep`

Full-repo sweep (src + supabase migrations/seeds/functions + scripts + public + build config)
for runtime-REACHABLE non-production data: test/fixture/mock/demo/sample/golden/reference/
seed/fallback/placeholder/in-memory/fake/staging-only/reference_derived/fixed grams/fixed scores.

**Deliverables:**
- `src/features/design-review/nonProductionRegistry.ts` — typed registry (source file +
  identifier + why + replacement) for every marked surface;
- `src/features/design-review/NonProductionMarker.tsx` — the pink `TESTOWE / NIEPRODUKCYJNE`
  marker (block wrapper + compact badge), modelled on `ReviewMarkedModule`; tooltip carries the
  full provenance; nothing is removed or hidden;
- pink tokens: `--color-nonprod` (light, AA on paper) + `--color-nonprod-soft` (dark shell) in
  `src/styles/tokens.css`, with the `.theme-pro-dark` override in `src/styles/theme-pro-dark.css`
  (mirrors the `--color-review` pattern);
- tests: `nonProductionMarker.test.tsx` (registry completeness incl. file existence, tooltip
  content, tones, fail-fast lookup) + `nonProductionSurfaces.test.tsx` (markers render on marked
  surfaces; absent on genuine-production surfaces; marker never imported by engine/formulation
  logic) + fallback-badge cases in `IngredientPicker.test.tsx`.

**Rules applied:** nothing deleted, no function removed; formulation/constraint-studio LOGIC
untouched (Agent 3 owns it) — the `reference_derived` template is marked at the PRESENTATION
layer only (`ConstraintPreviewCard` provenance line); genuine production data is NOT marked.

---

## 1. Owner classification table

Legend — **Test-only**: reachable only from `*.test.*` files. **Runtime reachable**: served by a
route registered in a PRODUCTION build (`/dev/*` routes exist only when `import.meta.env.DEV`,
verified in `src/app/router.tsx`; standard Vite, no `define`/alias can force DEV in prod).

### 1.1 PINK-MARKED — non-production data reachable by customers (8 markers)

| # | Location | Value / data | Test-only | Runtime reachable | Current customer impact | Action |
|---|---|---|---|---|---|---|
| 1 | `src/features/customer-flow/__fixtures__/catalogueFixtures.ts` → `CustomerShellV1.tsx:744` | `CATALOGUE_FIXTURES` — 8 fixture ready-recipe cards (metadata only, placeholder image paths); PL titles via `customerShellCopy.catalogueTitles` | No | **YES — `/start`** ready-recipe list | Customer browses and selects "ready recipes" that are test fixtures, not a real catalogue | **PINK-marked** (`start-ready-catalogue`, banner over the list). Replace with the owner-approved catalogue read from the PI base |
| 2 | `src/features/customer-flow/readyRecipeMatching.ts` (`selectReadyRecipe`/`buildRecipeStructure` over fixture cards) | Working draft built FROM a fixture card — structure only, no engine grams | No | **YES — `/start`** result phase (`selectedDraft`) | The "recipe" the customer opens from a ready card is a fixture-derived preview (honest `fixtureNotice` copy already exists) | **PINK-marked** (`start-ready-draft`, banner on the draft result). Replace with real catalogue recipes + engine numbers |
| 3 | `src/data/label/sampleLabelRecipe.ts` → `CreateLabelPage.tsx` | `SAMPLE_LABEL_RESULT` — DEFAULT_PRESET (demo `milk-base`) run through the REAL `calculateRecipe` at module load | No | **YES — `/label`** (whole page: nutrition declaration, ingredient statement, cost block, CSV, print) | Every visitor sees a fixed sample recipe's nutrition/costs; honest "sample" copy exists but the data is never the user's | **PINK-marked** (`label-sample-recipe`, block marker at top). Replace with label generation from the user's saved recipe |
| 4 | `src/data/demoPresets.ts` → `src/stores/recipeStore.ts:238,527` | `DEFAULT_PRESET` (`milk-base`) seeds the initial + reset recipe state | No | **YES — `/pro/recipe`** (and `/studio`, `/calculator` redirects) | A fresh Pro editor opens on the demo starter recipe | **PINK-marked** (`pro-demo-library`, banner in `RecipeTab`). Replace with empty/last-user-recipe start |
| 5 | `src/data/demoIngredients.ts` → `ingredient-builder/ingredientLibrary.ts` | `DEMO_INGREDIENTS` — 12+ literature compositions, `confidence_score:85`, `is_verified:false`, REFERENCE EUR/kg cost estimates; serves demo/non-Pro pickers AND the silent Pro fallback on Supabase error/empty rows (`selectIngredientLibrary` lines 120–131) | No | **YES — `/pro/recipe`** picker + all preset recipes + nutrition/cost panels | Compositions/costs presented in the editor are literature/estimates, not the verified PI base; a Pro user can silently fall back to them | **PINK-marked** (same `pro-demo-library` entry) + **dynamic badge when `status:'fallback'` is actually active** (`IngredientPicker.tsx`, `nonprod-marked-picker-fallback`) — the fallback state is now visibly distinct from `ready` (Agent 5 handoff item 2). Replace with verified PI library, no demo fallback |
| 6 | `src/features/formulation/templateRegistry.ts` — `fruit_gelato_ref_v1` | `reference_derived` formulation template (repo raspberry-premium derived; staging-only, NOT approved science) | No | **YES — `/pro/recipe`** Przelicz z PI preview when the fruit profile routes to this template | Preview provenance line already says `reference_derived`; the pink badge makes it unmissable | **PINK-marked at PRESENTATION layer only** (`preview-reference-template`, compact badge in `ConstraintPreviewCard`; approved templates show NO badge — tested). Replace when the template reaches `approved` |
| 7 | `src/pages/destinations/RecipesHubPage.tsx` | `RecipeTile` + `ImagePlaceholder` — decorative catalogue tiles ("PINGÜINO recipes", "Featured", categories) with NO collection behind them | No | **YES — `/recipes`** | Page implies a browsable catalogue that does not exist (only "Moje receptury" is real) | **PINK-marked** (`recipes-hub-tiles`, block marker around both tile grids; the real `/my-recipes` tile still works inside). Replace with real collections |
| 8 | `src/pages/landing/landingMonitorDemo.ts` → `LandingPage.tsx` | `buildLandingMonitorDemo()` — REAL Monitor + REAL engine on a FIXED vanilla payload; already honestly tagged „Przykład” (owner Slice F binding decision) | No | **YES — `/`** hero | Marketing example; honest tag exists, data is still non-user | **PINK-marked** (`landing-monitor-example`, compact badge beside the „Przykład” tag). KEEP as honest example per owner decision; future: interactive demo |

### 1.2 DEV-ONLY — bundled in dev builds, dead-code-eliminated from production

`import.meta.env.DEV` is stock Vite (no `define`/alias overrides in `vite.config.ts`,
`netlify.toml`, `vercel.json`); all `/dev/*` routes are conditionally registered in
`src/app/router.tsx:109–133` and tree-shaken from prod bundles.

| Location | Value / data | Test-only | Runtime reachable | Customer impact | Action |
|---|---|---|---|---|---|
| `src/services/accountAccess/inMemoryAccountAccess.ts` | `InMemoryAccountAccess` (Map-based account/session/device/billing-bridge) | No | dev-only (`/dev/account-access`) | None — prod uses `liveEffectiveAccess` → Supabase `entitlements`, fail-safe to demo | KEEP; Supabase adapter stays launch-gated |
| `src/services/mapperVerification/inMemoryVerification.ts` | `InMemoryVerification` | No | dev-only (`/dev/product-verification`) | None | KEEP |
| `src/services/ingredientResolution/inMemoryIngredientResolution.ts` | `InMemoryIngredientResolution` | No | dev-only (`/dev/ingredient-resolution`) | None | KEEP |
| `src/services/proCore/inMemoryRecipes.ts` / `inMemoryProduction.ts` / `inMemoryCosts.ts` | in-memory Pro repos | No | dev-only — `repositorySelector.chooseRepositoryMode` returns `in_memory_dev` ONLY when `isDev`; prod = Supabase or an HONEST `BackendNotConfiguredError` banner (never silent in-memory; A5's `backendGuard` throws typed `backend_not_configured` in prod builds) | None | KEEP |
| `src/pages/dev/MapperSmokePage.tsx:26–27` | hardcoded STAGING ids `PR-ING-000002` / `18313d47-ddad-4e4e-b1f9-ba39c9ad9434` (the one staging identifier inside a prod-imported module tree) | No | dev-only; excluded from prod bundle via DEV substitution + tree-shake (pinned by `MapperSmokePage.security.test.ts`) | None | KEEP; noted as the sole staging constant in `src/` |
| `src/data/products/productIntelligenceSimulation.ts` | pure batch simulation | No | dev-only (`/dev/product-intelligence-preview`) | None | KEEP |
| `src/features/pi-monitor/piMonitorFixtures.ts` (`PI_MONITOR_FIXTURES`) | monitor demo fixtures | No | dev-only (`/dev/pi-monitor`) | None | KEEP |
| `src/features/optimization/*Fixtures.ts` (optimizationPreview / branchRecalculation / verifiedSubstitute) | numeric preview fixtures | No | dev-only (`/dev/optimization-preview`, `/dev/branch-recalculation-preview`) + tests | None (BranchWorkflowPreviewPanel test pins fixtures are never imported by the customer panel) | KEEP |
| `src/features/ingredient-resolution/__fixtures__/resolutionFixtures.ts` | resolution `CATALOGUE_FIXTURES` (products) | No | dev-only (`/dev/ingredient-resolution`) | None | KEEP |
| `src/features/studio/PresetSelector.tsx` (`DEMO_PRESETS` QA scenarios) | preset switcher | No | dev-only (`StudioEngineSurface.tsx:131` renders it only when DEV) | None | KEEP |
| `src/pages/dev/studioPickerProofFixture.ts` + all other `/dev/*` pages | assorted harness fixtures | No | dev-only | None | KEEP |

### 1.3 TEST-ONLY — never bundled beyond tests

| Location | Value / data | Action |
|---|---|---|
| `src/qa/engine-validation/fixtures.ts` (B1–B3 drift detectors; grams from the repo's own `fruit_gelato_ref_v1`) | engine QA fixtures | KEEP |
| `src/features/recipe-constraints/constraintFixtures.ts` (`starterMilkBase`, `jim-beam`) | constraint test builders | KEEP |
| `src/features/customer-flow/readyRecipeMatching.test.ts`, `src/engine/__fixtures__/**`, `src/features/ocr-intake/__fixtures__/**`, `src/services/proCore/supabaseRecipesFake.ts` ("TEST SUPPORT ONLY") | test fixtures/fakes | KEEP |
| `src/features/product-picker/sampleCatalogue.ts` (`SAMPLE_CATALOGUE`, `PSAMPLE-*`) + `inMemoryCatalog.ts` | honest sample picker catalogue — the old public „Produkty” tab was REMOVED; **no runtime importer** (verified: only tests + the feature barrel re-export; the live picker uses the Mapper read model via `services/productPicker/mapperSearch`), side-effect-free module tree-shakes out of prod chunks (Agent 5 handoff item 3) | KEEP as test support; candidate for `__fixtures__/` move later |

### 1.4 GENUINE PRODUCTION DATA — verified, NOT marked

| Location | Value / data | Why NOT marked |
|---|---|---|
| `supabase/seed/mapper_basement_v1_0.sql` (2,083 rows) + `ingredients_v0_94/v0_95` (542 rows each) | the real ingredient library | Production data (RLS-gated). Note: some rows carry cosmetic provenance placeholders (`brand='Standard'`, `country='General'`, `last_reviewed_by='ChatGPT'`, `source_url='General'`) — data-quality cleanup item, not fake measurements |
| `supabase/migrations/0014` (11 locked pricing offers, Stripe ids deliberately NULL) + `0018` (12 commission rates) + `0024` (storage bucket) | production config | Real owner-locked config; consumed by checkout/webhook functions + `src/billing/catalog/priceCatalog.ts` mirror (pinned 1:1 by tests) |
| `src/features/machine-catalog/machineCatalogData.ts` | Annex-A machine capacities, statuses `provisional`/`conflicting_sources`/`needs_review`, `null` = never guessed | Spec-sourced honest data with full provenance; no invented capacity or batch anywhere (owner final decision 2026-07-17.3) |
| `src/data/engines.ts`, `servingProfiles.ts`, `productProfiles.ts` | engine/serving/product routing config | Honest: only −11°C active; future engines labeled, never faked |
| Entitlement/billing paths (`billing/entitlements/entitlementResolver.ts`, `access/subscription.ts`, `accountAccess/liveEffectiveAccess.ts`, `stores/subscriptionStore.ts`) | — | **No fallback over-grant exists**: empty/unavailable DB → `free`/`demo`/`null`, every time; DEV Pro override is DEV-gated |
| `/subscription`, `/my-recipes`, `/profile/machine`, `/products/import`, live Mapper search in `ResolutionSheet` | real offer catalogue, user rows, machine prefs, CSV import, 2,083-row read model | Genuine production paths — negative tests pin that they carry NO pink marker |
| Machine preference store (`localStorageMachinePreferenceStore` + `services/machinePreference/machinePreferenceSelector`) | device-local store for anon/demo | A legitimate production store (`isAccountScoped:false`), not a fake adapter |
| `supabase/functions/*` (7 edge functions) | — | No hardcoded test/demo/fallback responses (verified) |
| `public/` | brand favicon + logo only | No data files shipped |
| Coming-soon rows (`/api`, `/create-ingredient`, parts of `/work-with-us`) | `ComingSoonRow` labels + decorative `ImagePlaceholder` | Explicit, truthful "wkrótce" copy — no data claim (contrast: `/recipes` tiles MIMIC a catalogue → marked) |
| `src/pages/home/HomePage.tsx` | legacy dark AI Home | Unrouted by owner decision (kept in tree, listed in design-review RV items) |
| Migrations `0033`–`0035` | demo-safe search view + legacy Mercadona cleanup | STAGING-only annotated; deletes are backed up + allow-listed; agent MCP is read-only |

---

## 2. Marker component contract

- Badge: `TESTOWE / NIEPRODUKCYJNE` + flask glyph (meaning never carried by color alone).
- Tooltip (`title` + `aria-label`): `Źródło: <file> · <identifier>` / `Dlaczego nieprodukcyjne: …`
  / `Docelowo: …` — built by `nonProductionTooltip()` from the registry.
- `data-testid`: `nonprod-marked-<id>` (block) / `nonprod-badge-<id>` (badge).
- Tones: default (paper + `.theme-pro-dark` auto-override) and `tone="dark"` for the black-shell
  destinations. Both AA ≥ 4.5:1 (`#a8256b` on paper; `#f082b4` on `#1a1a1a`).
- Unknown id throws (a typo can never render an empty marker).

## 3. Gates

- `npx tsc -b` → clean.
- `npx eslint .` → **0 errors** (2 pre-existing react-refresh warnings in `router.tsx` /
  `RecipeVersionsSection.tsx`, untouched).
- `npx vitest run` → **FULL suite green** (373 files / 5015+ tests, incl. the new marker,
  surface, and fallback tests; nothing removed).
- Environment note: this worktree initially checked out with CRLF (`core.autocrlf=true`), which
  broke the comment-stripping regex (`--.*$` cannot consume `\r`) in 14 pre-existing migration
  guard tests (files 0007–0011) — reproduced on the CLEAN base `6f8e680`, i.e. NOT caused by this
  work. Fixed locally by `git config core.autocrlf false` + re-checkout of `supabase/` (LF).
  Repo-level hardening candidate (out of my scope): `.gitattributes` `*.sql text eol=lf` or
  `\r?$` in the guard regexes.

## 4. Counts

- **Pink-marked runtime-reachable items: 8** (7 registry entries; `pro-demo-library` renders in
  two places — the static RecipeTab provenance banner and the DYNAMIC picker-fallback badge).
- Dev-only items classified: 11 groups · Test-only: 4 groups · Genuine production (unmarked,
  negative-tested): 12 groups.
