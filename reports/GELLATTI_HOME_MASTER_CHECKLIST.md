# GELLATTI — HOME CREATOR V1 · MASTER CHECKLIST

**Branch:** `claude/home-creator-v1` · **Worktree:** `~/Developer/pinguino-home-creator`
**Base:** `origin/staging` @ `423a76fc` (fetched 2026-08-30)
**Scope authority:** the Owner HOME Creator V1 prompt (2026-08-30). Every numbered section of that
prompt has at least one row here; multi-requirement sections are split into one row per requirement.

**Statuses:** `TODO` · `IN PROGRESS` · `IMPLEMENTED` · `TESTED` · `SERVED VERIFIED` ·
`BLOCKED — AUTH` · `BLOCKED — DATA` · `BLOCKED — OWNER DECISION` · `NOT APPLICABLE`

Columns are abbreviated for width; the full column set required by the prompt is:
ID · Area · Exact requirement · Existing implementation found? · Reused authority/component ·
New implementation required · Related routes · Related stores/services · API/database work ·
Admin/Community dependency · Desktop · Mobile · Test required · Served QA required · Status ·
Evidence · Blocker. Rows below carry all of them; `Exist?`/`New?`/`DB?`/`D`/`M`/`T`/`SQA` are the
yes/no columns.

---

## 0. Inventory of the base (`423a76fc`) — completed before any code was written

| Area | Finding |
| --- | --- |
| Public root | `/` → `RoleAwareEntryRoute entry="root"` → `LandingPage` (marketing) for anon; `/pro/recipe` for Pro; `/admin/overview` for Admin; `/home` for Home. **Root is NOT the creator today.** |
| Existing "Home" | `CustomerShellV1` (`/start`, `/home`) — 1738 lines, mobile-first, but built on `@/features/customer-flow` (a SEPARATE pure conversational core with its own `buildCustomerRecipeView`, `CATALOGUE_FIXTURES`), **not** on `recipeStore`. It is a second recipe presentation, not a second engine. |
| Pro workspace | `ProWorkspacePage` (`/pro`, `/pro/:section`) — sections recipe/monitor/versions/production/history/costs/exports/settings/machine. |
| Recipe authority | `src/stores/recipeStore.ts` (2787 lines) — `RecipeInput`, ingredients, toppings, Main/Crown, locks, Direction targets, batch, machine selection, `loadRecipeInput`, `markSaved`, `startNewRecipe`. |
| Preview/Apply authority | `src/features/constraint-studio/constraintStudioStore.ts` — `createOptimizePreview`, `applyPreview`, `undoLastApply`, `acceptBestDirectionCandidate`, Direction fallback, batch rescale, substitution. |
| Direction | `src/features/recipe-direction/recipeDirectionTargets.ts` — axes `sweetness`/`softness`/`creaminess`/`flavor`, range −2..+2, `DEFAULT_RECIPE_DIRECTION_TARGETS`. Store actions `setDirectionTarget`, `moveDirectionTarget`. |
| Machines | `src/features/machine-catalog` — 9 Home machines (Ninja CREAMi / Deluxe / Scoop&Swirl, Moulinex Freezi, Magimix Gelato Expert, Cuisinart ICE100E/ICE21E/ICE30BCE, KitchenAid, Sage Smart Scoop) + `machineKind: 'professional' \| 'home'`, `homeBatchRule.ts`, `machineOnboarding.ts`, `technologyMode.ts`. |
| Plans | `src/access/plans.ts` — `AccessTier = demo \| free \| pro`; **Home- and Pro-priced subscriptions BOTH resolve to `pro`** (`planFromSubscription` is price-id-agnostic). `EffectiveAccess.canHome/canPro/canAdmin` from `proCoreAccessStore`. |
| Community | `supabase/migrations/20260823140000_community_creators_sharing_v1.sql` + 5 follow-ups: `creator_profiles`, `community_publications`, `recipe_lineage` (**with `root_publication_id` + `root_creator_user_id`**), `recipe_share_links`, `recipe_ratings`, `publication_metrics`, `ranking_snapshots`, `community_reports`. `src/services/community.ts` (519 lines). Ranking = `RANKING_WEIGHTS_V1` (makers/makes/remixes/users + rating modifier). |
| Community gaps | **No `Like`** (only star `recipe_ratings`). **No publication Favourite** (`global_catalog_favorites` is for PRODUCTS). **No liked-by list.** `gellatti_publication_card_v1.based_on` resolves the **PARENT** publication, not the **ROOT** — prompt §38 requires the ORIGINAL creator. **No comments anywhere** (matches §89). |
| Scanner | `src/features/product-scanner` — `LiveProductScanner`, `barcode*`, `pipeline.ts`, `liveEvidenceQuota`, `customerAddedProducts`. Full analysis is quota'd; **no cheap free pre-scan tier**. |
| Production | `src/features/production-workspace` — the Production authority (steps, TARA, deviation, Rescue). |
| Partner | `src/features/partner`, `src/services/partner.ts`, `partnerShareAttribution.ts` (commercial attribution deliberately separate from lineage). |
| Admin | `src/pages/admin/AdminWorkspacePage.tsx` + `AdminRouteGuard`. |
| Locale | `src/copy/*` (`en.ts` etc.) + `src/features/*/…Copy.ts` per feature; FINAL_SAFE locale registry. |
| Guards | `npm run guard:owner-locked`, `guard:protected-paths`, `test:contracts` (`src/contracts/owner-locked`), `verify:staging`. |

---

## 1. Requirement rows

Legend for yes/no columns: `Y` = yes/required, `–` = no/not required, `?` = to be determined during the phase.

| ID | Area | Exact requirement | Exist? | Reused authority / component | New? | Routes | Stores / services | API / DB | Admin/Community dep. | D | M | T | SQA | Status | Evidence | Blocker |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| H-01-1 | Architecture | HOME is not a second application — no `HomeEngine`/`HomeSolver`/`HomeRecipe`/`HomeCrown`/`HomeProductBehavior`/`HomeMachineAuthority`/`HomeProductionAuthority` | – | `recipeStore`, `constraintStudioStore`, `@/engine` | Y (guard) | – | – | – | – | Y | Y | Y | – | TESTED | boundary test forbidding those symbols | |
| H-01-2 | Architecture | HOME and PRO are presentation layers over the SAME live state (one `RecipeInput`) | – | `recipeStore` | Y | `/`, `/pro/*` | `recipeStore` | – | – | Y | Y | Y | Y | TESTED | | |
| H-01-3 | Architecture | HOME reuses Engine, Solver, Product Catalog, Mapper identities, ProductBehavior, Main/Crown, Multi-Main, manual grams, Recalculate/Preview/Apply/Undo, Direction, Machine, batch, toppings, Rescue, Production, persistence, immutable versions, Community attribution/lineage | Y (all) | listed authorities | – (wiring only) | – | all | – | – | Y | Y | Y | Y | TODO | | |
| H-02-1 | Authority | Functional authority = newest `origin/staging`; visual = Gellatti V2.1 + Design Book; language = FINAL_SAFE locale | Y | `src/copy`, V2.1 tokens | – | – | – | – | – | Y | Y | – | – | TODO | worktree from `423a76fc` | |
| H-02-2 | Authority | OWNER-LOCKED functionality unchanged unless this prompt authorises presentation/orchestration integration | Y | `src/contracts/owner-locked` | – | – | – | – | – | – | – | Y | – | TESTED | `npm run guard:owner-locked` green | |
| H-03-1 | Safety | STAGING ONLY — never touch `origin/main`, prod deployment, prod Supabase, real Stripe, real customer data, prod secrets | – | – | – | – | – | – | – | – | – | – | – | TODO | `git log origin/main` unchanged at close | |
| H-03-2 | Safety | Stripe TEST MODE only | Y | existing test keys | – | – | `billing` | – | – | – | – | – | Y | TODO | | |
| H-03-3 | DB | Every migration additive, forward-only, staging-only, RLS-safe, non-destructive, documented; no historical migration deleted/rewritten | – | `supabase/migrations` | Y | – | – | Y | – | – | – | Y | Y | TESTED | | |
| H-04-1 | Git | Dedicated clean worktree + branch `claude/home-creator-v1`, not shared with other sessions | – | – | Y | – | – | – | – | – | – | – | – | IMPLEMENTED | `~/Developer/pinguino-home-creator` @ `423a76fc` | |
| H-04-2 | Git | Every batch: staging → feature branch → tests → owner-locked contracts → protected-path gate → typecheck/lint/build → push → PR → green → merge → deploy → served QA | – | `verify:staging` | Y | – | – | – | – | – | – | Y | Y | TODO | | |
| H-04-3 | Git | Never push directly to staging; no `--admin` bypass; no force-push | – | branch protection | – | – | – | – | – | – | – | – | – | TODO | | |
| H-06-1 | Process | `reports/GELLATTI_HOME_MASTER_CHECKLIST.md` exists with one row per requirement, all 17 columns | – | – | Y | – | – | – | – | – | – | – | – | IMPLEMENTED | this file | |
| H-06-2 | Process | Checklist updated after every phase | – | – | Y | – | – | – | – | – | – | – | – | IN PROGRESS | | |
| H-07-1 | Process | `reports/GELLATTI_HOME_REQUIREMENT_TRACEABILITY.md` maps every ID → source files, tests, served proof, status | – | – | Y | – | – | – | – | – | – | – | – | TODO | | |
| H-08-1 | Mobile | Mobile-first; primary viewport 390×844 | – | V2.1 tokens, `shellGeometry` | Y | `/` | – | – | – | Y | Y | Y | Y | IMPLEMENTED | | |
| H-08-2 | Mobile | Verify 360 px, 375 px, larger modern phones, desktop 1440×900 | – | – | Y | `/` | – | – | – | Y | Y | – | Y | TODO | | |
| H-08-3 | Mobile | No horizontal overflow anywhere; no clipped required action | – | – | Y | `/` | – | – | – | Y | Y | Y | Y | TODO | | |
| H-08-4 | Mobile | Desktop is the wider version of mobile — not a compressed Pro Workbench | – | – | Y | `/` | – | – | – | Y | Y | – | Y | TODO | | |
| H-09-1 | Routing | Public root `/` opens directly into HOME Creator (no marketing landing before the product) | Y (landing today) | `RoleAwareEntryRoute` | Y | `/` | `roleAwareEntry.ts` | – | – | Y | Y | Y | Y | IMPLEMENTED | | |
| H-09-2 | Routing | Community feed, Shop, Partner, Franchise, About, Pricing, Recipes index are NOT on the creator canvas — reachable via hamburger only | Y (nav) | `AppNavDrawer`, `navConfig` | Y | `/` | – | – | – | Y | Y | Y | Y | TODO | | |
| H-10-1 | Header | Fixed/sticky header: `GELLATTI · [HOME\|PRO] · Sign in/Account · ☰` | Partly | `TopNav`, `AppShell` | Y | all | – | – | – | Y | Y | Y | Y | IMPLEMENTED | | |
| H-10-2 | Header | Hamburger opens the LEFT-side drawer (existing owner decision) | Y | `AppNavDrawer` | – | all | – | – | – | Y | Y | Y | Y | IMPLEMENTED | | |
| H-10-3 | Header | Sign in is discreet, near account/menu; login is never forced at entry | – | `authStore` | Y | `/` | `authStore` | – | – | Y | Y | Y | Y | TODO | | |
| H-10-4 | Header | Header remains stable while HOME progresses through stages | – | – | Y | `/` | – | – | – | Y | Y | Y | Y | IMPLEMENTED | | |
| H-11-1 | Plan UI | Anonymous / signed-in-without-plan: show `[HOME\|PRO]`, both explorable as demo | – | `useAccess`, `EffectiveAccess` | Y | `/`, `/pro/*` | `proCoreAccessStore` | – | – | Y | Y | Y | Y | TESTED | | |
| H-11-2 | Plan UI | Active segment = black bg / white text; inactive = white-greige bg / black text; reversed when PRO active; **no dots** | – | V2.1 tokens | Y | `/` | – | – | – | Y | Y | Y | Y | TESTED | | |
| H-11-3 | Plan UI | Active HOME subscriber: PRO is NOT shown at all — no locked/grey PRO, no permanent "Upgrade", no constant upsell | – | – | Y | `/` | `proCoreAccessStore` | Y (plan tier) | – | Y | Y | Y | Y | TESTED | | |
| H-11-4 | Plan UI | Active PRO subscriber: `[HOME\|PRO]` shown, full access to both | – | – | Y | `/`, `/pro/*` | – | – | – | Y | Y | Y | Y | TESTED | | |
| H-11-5 | Plan data | A HOME-priced subscription must be distinguishable from a PRO-priced one (today both collapse to tier `pro`) | – | `plans.ts`, `subscription.ts` | Y | – | `subscriptionStore`, `services/billing` | Y | – | – | – | Y | Y | TODO | | |
| H-12-1 | Account | PRO subscriber starts in PRO after login | Y | `roleAwareEntry` | – | `/` | – | – | – | Y | Y | Y | Y | TODO | | |
| H-12-2 | Account | New Account Setting "Default experience after login: PRO \| HOME", default `PRO` | – | `AccountSettingsPage`, `userRecipeDefaults` | Y | `/account` | `services/userRecipeDefaults` | Y | – | Y | Y | Y | Y | TESTED | | |
| H-12-3 | Account | The login default is the SETTING, never the last visited view | – | – | Y | `/` | – | – | – | – | – | Y | Y | TESTED | | |
| H-13-1 | Routing | Active HOME subscriber opening a legacy `/pro/...` URL is redirected to the corresponding HOME location — never an upgrade wall | – | `LegacyDestinationRedirect` | Y | `/pro/*` | – | – | – | Y | Y | Y | Y | TESTED | | |
| H-13-2 | Routing | `/pro/recipe` → HOME recipe; `/pro/production` → HOME preparation; other PRO-only pages → nearest coherent HOME location | – | – | Y | `/pro/*` | – | – | – | Y | Y | Y | Y | TESTED | | |
| H-14-1 | One recipe | HOME↔PRO switch does NOT clone the recipe, create a version, reset it, reload another, or recalculate automatically | – | `recipeStore` | Y | `/`, `/pro/*` | `recipeStore` | – | – | Y | Y | Y | Y | TESTED | | |
| H-14-2 | One recipe | Switch does NOT reset machine, batch, Direction, hidden PRO settings, or Production progress | – | – | Y | – | `recipeStore`, `production-workspace` | – | – | Y | Y | Y | Y | TODO | | |
| H-15-1 | Mapping | PRO Receptura → HOME live recipe | – | – | Y | – | – | – | – | Y | Y | Y | Y | TESTED | | |
| H-15-2 | Mapping | PRO Produkcja → HOME preparation at the SAME Production step (ingredient 4 → ingredient 4); switching back keeps the step | – | `production-workspace` | Y | – | production store | – | – | Y | Y | Y | Y | TODO | | |
| H-15-3 | Mapping | PRO Monitor → HOME recipe screen; remember previous PRO module so returning restores Monitor | – | – | Y | – | view-mode store | – | – | Y | Y | Y | Y | TODO | | |
| H-15-4 | Mapping | PRO Etykieta → HOME recipe screen; remember module; Label state unchanged | – | `master-label` | Y | – | – | – | – | Y | Y | Y | Y | TODO | | |
| H-16-1 | Machine | HOME machine selector never offers Professional | – | `machineCatalogData` | Y | `/` | `recipeStore` | – | – | Y | Y | Y | Y | TESTED | | |
| H-16-2 | Machine | A Professional-configured recipe viewed in HOME keeps Professional + temperature + mode + batch, shows no warning, forces no Home machine | – | `recipeStore.machineKind` | Y | `/` | `recipeStore` | – | – | Y | Y | Y | Y | TESTED | | |
| H-16-3 | Machine | For a Professional recipe HOME shows `Amount / 1000 g / Change` — no container wording | – | `batchPresentation` | Y | `/` | – | – | – | Y | Y | Y | Y | TESTED | | |
| H-16-4 | Machine | Navigating to HOME machine selection shows only Home machines + Other machine; Professional is re-selectable only in PRO | – | – | Y | `/` | – | – | – | Y | Y | Y | Y | TESTED | | |
| H-17-1 | Intent | First HOME screen: "Create your own ice cream recipe. Like a pro." + "What flavour are we making today?" via the localisation architecture | – | `src/copy` | Y | `/` | – | – | – | Y | Y | Y | Y | TESTED | | |
| H-17-2 | Intent | One elegant input area supporting text, voice and scan | – | `MicrophoneButton`, scanner | Y | `/` | – | – | – | Y | Y | Y | Y | TESTED | | |
| H-17-3 | Intent | No preset Banana/Mango/Chocolate tiles; any idea may be described | – | – | Y | `/` | – | – | – | Y | Y | Y | Y | TESTED | | |
| H-18-1 | Intent | Before the first recipe exists there is NO Score, NO live Recalculate, NO live recipe edits | – | – | Y | `/` | – | – | – | Y | Y | Y | Y | TESTED | | |
| H-18-2 | Intent | Resolved intent renders as removable chips (`Banana ×`, `Oreo ×`, `Peanut butter ×`) | – | `FlavorChip` | Y | `/` | intent store | – | – | Y | Y | Y | Y | TESTED | | |
| H-18-3 | Intent | CTA `Create my recipe` starts product resolution → recipe matching → Top100 matching → profile if needed → machine if needed → first generation | – | – | Y | `/` | – | – | – | Y | Y | Y | Y | TODO | | |
| H-19-1 | Intent | Text, voice and scanner are three input methods into ONE intent — no separate journeys | – | – | Y | `/` | – | – | – | Y | Y | Y | Y | TESTED | | |
| H-20-1 | Voice | Voice accepts complete natural sentences and extracts profile + ingredient concepts + role when clearly stated | – | Web Speech API | Y | `/` | intent parser | – | – | Y | Y | Y | Y | TESTED | | |
| H-20-2 | Voice | Chips shown for correction; no separate transcript page | – | – | Y | `/` | – | – | – | Y | Y | Y | Y | TESTED | | |
| H-21-1 | Intent | Several items may be added in sequence in any combination of text/voice/scan and are treated as one intention before `Create my recipe` | – | – | Y | `/` | – | – | – | Y | Y | Y | Y | TESTED | | |
| H-22-1 | Identity | Resolve user terms through Product Catalog / Mapper / canonical identity / ProductBehavior / SKU identities BEFORE recipe matching | Y | `services/products`, `ingredient-resolution`, Mapper | Y (wiring) | `/` | `services/ingredientResolution` | – | – | Y | Y | Y | Y | TESTED | | |
| H-22-2 | Identity | Never match recipes against guessed product text; never invent semantic substitution | – | – | Y | – | – | – | – | – | – | Y | Y | TESTED | | |
| H-23-1 | Identity | Ambiguous text/voice → simple real-product choice list (e.g. several Oreo SKUs, Chocolate vs Cocoa vs Spread); no photos required | – | `product-picker` | Y | `/` | `services/productPicker` | – | – | Y | Y | Y | Y | TESTED | | |
| H-24-1 | Identity | Where existing Gellatti mapping already collapses several SKUs to one canonical identity, HOME uses that authority — no new equivalence layer | Y | Mapper canonical identity | – | – | – | – | – | – | – | Y | – | TODO | | |
| H-25-1 | Intent | Multilingual + typo-tolerant intent (strawberry/truskawka/fresa/Erdbeere; whisky cola/whiskey & coke/whisky z colą; mojito/mochito/mojitto) | Partly | `polishFlavorSynonyms` | Y | `/` | intent parser | – | – | Y | Y | Y | Y | TESTED | | |
| H-25-2 | Intent | Understanding only — everything resolves to real Gellatti identities before matching/formulation | – | – | Y | – | – | – | – | – | – | Y | Y | TESTED | | |
| H-26-1 | Scanner | Cheap demo pre-check: no expensive Product Scanner analysis for non-paying users | Partly | `product-scanner/pipeline` | Y | `/` | `services/productScanner` | Y | – | Y | Y | Y | Y | TODO | | |
| H-26-2 | Scanner | Free pre-scan may recognise obvious fresh produce, detect EAN, and check whether the EAN is already known | – | `barcodeDecoder`, `eanLookupEvidence` | Y | `/` | – | Y | – | Y | Y | Y | Y | TODO | | |
| H-26-3 | Scanner | Free pre-scan must NOT run full OCR, internet research, nutrition evidence research, full catalog analysis or the costly Scanner flow | – | – | Y | – | – | Y | – | – | – | Y | Y | TODO | | |
| H-27-1 | Scanner | Known EAN → use the existing identified product | Y | `intimportCanonicalLookup` | Y (wiring) | `/` | – | – | – | Y | Y | Y | Y | TODO | | |
| H-27-2 | Scanner | Unknown EAN → HOME/PRO subscription gate before full analysis; no free lookup beyond "do we already know this EAN" | – | – | Y | `/` | – | Y | – | Y | Y | Y | Y | TODO | | |
| H-28-1 | Scanner | Unknown EAN: pre-scan → paywall → purchase/login → automatically continue full Scanner with the SAME temporary image (no re-photograph) | – | `ocrIntakeStorage`, scanner session | Y | `/` | scanner continuation | Y | – | Y | Y | Y | Y | TODO | | |
| H-28-2 | Scanner | Existing privacy/deletion lifecycle applies to the retained image afterwards | Y | `ocrIntakeEvidence` | – | – | – | – | – | – | – | Y | – | TODO | | |
| H-29-1 | Scanner | Obvious fresh produce resolves cheaply; on low confidence ask "What is this? Apple / Pear / Search ingredient" | – | – | Y | `/` | – | – | – | Y | Y | Y | Y | TODO | | |
| H-29-2 | Scanner | Never guess; never trigger the expensive Scanner merely to disambiguate simple produce | – | – | Y | – | – | – | – | – | – | Y | Y | TODO | | |
| H-30-1 | Paywall | Product creation / full Scanner requires HOME or PRO subscription; after purchase the flow resumes exactly where it stopped | – | `billingCheckout` | Y | `/` | `subscriptionStore` | Y | – | Y | Y | Y | Y | TODO | | |
| H-31-1 | Profile | A stated/implied profile (Gelato/Sorbet/Protein/Vegan) is not asked again and filters all matching | – | `ProductCategory` | Y | `/` | `recipeStore` | – | – | Y | Y | Y | Y | TESTED | | |
| H-31-2 | Profile | Unknown profile → show the four choices | – | – | Y | `/` | – | – | – | Y | Y | Y | Y | TESTED | | |
| H-32-1 | Matching | Search the current official Gellatti recipe library | Y | `services/recipes`, flavour catalogue | Y | `/` | `services/recipes` | ? | – | Y | Y | Y | Y | TODO | | |
| H-32-2 | Matching | STRICT: every user-requested ingredient identity must be present; never show "similar" recipes missing a requested ingredient | – | – | Y | – | matching module | – | – | – | – | Y | Y | TESTED | | |
| H-32-3 | Matching | Extra ingredients are allowed and shown as `Also includes: Caramel` | – | – | Y | `/` | – | – | – | Y | Y | Y | Y | TESTED | | |
| H-33-1 | Matching | Explicit role (topping / mix-in / pieces at the end) must be respected by matching | – | topping model | Y | – | matching module | – | – | – | – | Y | Y | TESTED | | |
| H-33-2 | Matching | If role was not specified the recipe may define it | – | – | Y | – | – | – | – | – | – | Y | Y | TESTED | | |
| H-34-1 | Matching | Community search covers ONLY the current Community Top 100 | Y (ranking) | `topRecipes`, `ranking.ts` | Y | `/` | `services/community` | Y | Y | Y | Y | Y | Y | TESTED | | |
| H-34-2 | Matching | Same strict matching rules for Community | – | – | Y | – | – | – | Y | – | – | Y | Y | TESTED | | |
| H-34-3 | Matching | If several Community recipes match, only the highest-ranked one is the Community candidate | – | – | Y | – | – | – | Y | – | – | Y | Y | TESTED | | |
| H-35-1 | Matching | One official match + no Community match → adopt official automatically, briefly showing e.g. `Mojito · Sorbet` | – | – | Y | `/` | – | – | – | Y | Y | Y | Y | TESTED | | |
| H-35-2 | Matching | Multiple official matches → popup | – | – | Y | `/` | – | – | – | Y | Y | Y | Y | TESTED | | |
| H-35-3 | Matching | Any Community match → popup (including the single-Community-no-official case) | – | – | Y | `/` | – | – | Y | Y | Y | Y | Y | TESTED | | |
| H-35-4 | Matching | A Community user's recipe is NEVER adopted automatically | – | – | Y | – | – | – | Y | – | – | Y | Y | TESTED | | |
| H-36-1 | Matching | Popup shows recipe images, a `Gellatti recipes` section with every official exact match, and a `From Community` section with at most one result (highest-ranked exact match) carrying image + author + Top100 rank | – | `CommunityRecipeCard` | Y | `/` | – | Y | Y | Y | Y | Y | Y | TODO | | |
| H-36-2 | Matching | Popup always includes `Create my own`, and shows additional ingredients clearly | – | – | Y | `/` | – | – | – | Y | Y | Y | Y | TODO | | |
| H-37-1 | Lineage | Selecting a Community recipe leaves the original unchanged and creates an editable draft/copy with lineage kept | Y | `recordDerivation`, `recipe_lineage` | Y (wiring) | `/` | `services/community` | Y | Y | Y | Y | Y | Y | TODO | | |
| H-37-2 | Lineage | The draft adapts later to the user's machine/batch and allows the existing edits | – | `recipeStore` | Y | `/` | – | – | – | Y | Y | Y | Y | TODO | | |
| H-38-1 | Lineage | Public attribution ALWAYS points at the ORIGINAL creator (Maria → Tomek → Anna all read "Based on original recipe by Maria") | **Partly — `based_on` resolves the PARENT** | `recipe_lineage.root_creator_user_id` | Y (SQL fix) | `/@handle/:slug`, `/community` | `services/community` | Y | Y | Y | Y | Y | Y | TESTED | | |
| H-38-2 | Lineage | `View original` link is included | – | `AttributionByline` | Y | `/` | – | Y | Y | Y | Y | Y | Y | TODO | | |
| H-38-3 | Lineage | Same rule for official Gellatti recipes → "Based on original recipe by Gellatti" | – | – | Y | – | – | Y | Y | Y | Y | Y | Y | TODO | | |
| H-38-4 | Lineage | Becoming the original DNA creator requires `Create my own` | – | – | Y | – | – | – | Y | – | – | Y | Y | TODO | | |
| H-39-1 | Lineage | Lineage survives any later edit; it is never severed because many ingredients changed | Y (stamped once) | `resolveLineage` | – | – | – | Y | Y | – | – | Y | Y | TODO | | |
| H-40-1 | Matching | Profile filter applies to both the official library and Community Top 100 (e.g. "Mojito Sorbet" → only Sorbet) | – | – | Y | `/` | – | Y | Y | Y | Y | Y | Y | TESTED | | |
| H-41-1 | Create | `Create my own` uses the resolved intent ingredients | – | `intentRecipeDraft` | Y | `/` | `recipeStore` | – | – | Y | Y | Y | Y | IMPLEMENTED | | |
| H-41-2 | Create | Known profile → skip the profile step; unknown → "How do you want to make it?" (Gelato/Sorbet/Protein/Vegan) | – | – | Y | `/` | – | – | – | Y | Y | Y | Y | TESTED | | |
| H-41-3 | Create | Desktop supplementary text may use hover; mobile must not depend on hover | – | – | Y | `/` | – | – | – | Y | Y | Y | Y | TESTED | | |
| H-42-1 | Machine | A saved Home machine is used automatically and never asked again; shown as `Ninja CREAMi Deluxe · 1 container` + `Change` | Y | `machinePreference` service | Y | `/` | `services/machinePreference` | – | – | Y | Y | Y | Y | IMPLEMENTED | | |
| H-42-2 | Machine | Anonymous preference stored locally and adopted into the account after signup | Y (local store) | `localStorageMachinePreferenceStore` | Y | `/` | – | Y | – | Y | Y | Y | Y | TODO | | |
| H-43-1 | Machine | HOME chooser offers supported Home machines + `Other machine`; never Professional | – | `machineCatalogData` | Y | `/` | – | – | – | Y | Y | Y | Y | TESTED | | |
| H-43-2 | Machine | `Other machine` asks only what the current machine flow needs, primarily capacity | Y | `machineOnboarding` | – | `/` | – | – | – | Y | Y | Y | Y | IMPLEMENTED | | |
| H-44-1 | Machine | Machine+profile batch uses the existing canonical authority; no new batch values | Y | `homeBatchRule`, `machineRecipeBatchMatrix` | – | – | `recipeStore` | – | – | – | – | Y | Y | TESTED | | |
| H-45-1 | Amount | Container-first amount control `− 1 container +`, starting at one container; canonical grams from the current authority | Partly | `BatchSelector`, `recommendedBatchGramsOf` | Y | `/` | `recipeStore.setBatchGrams` | – | – | Y | Y | Y | Y | TESTED | | |
| H-46-1 | Amount | Manual exact total grams (e.g. `1850 g`) is kept exactly and shown with existing capacity guidance `1850 g · 3 containers` | Y | `deriveBatchGuidance` | Y | `/` | – | – | – | Y | Y | Y | Y | TESTED | | |
| H-46-2 | Amount | Selecting 2 containers afterwards returns to the canonical 2-container amount | – | – | Y | `/` | – | – | – | Y | Y | Y | Y | TESTED | | |
| H-47-1 | Machine | Changing the machine inside a recipe affects only that recipe; the account default is unchanged | Y (recipe-scoped) | `recipeStore.setMachineSelection` | Y | `/` | – | – | – | Y | Y | Y | Y | TODO | | |
| H-47-2 | Machine | A saved recipe remembers its recipe-specific machine; a new recipe uses the account default again | Y | `userRecipeDefaults` | – | – | – | – | – | – | – | Y | Y | TODO | | |
| H-48-1 | Generation | The first recipe builds a full base automatically — the user is never asked to choose milk/sugar/stabiliser first | Y | `intentRecipeDraft` STARTER_TEMPLATES, Engine | Y | `/` | `recipeStore` | – | – | Y | Y | Y | Y | IMPLEMENTED | | |
| H-49-1 | Crown | A Crown-eligible user-added product turns Crown on automatically per the current PRO authority | Y | `canonical module eligibility`, `setMainIngredient` | Y | `/` | `recipeStore` | – | – | Y | Y | Y | Y | TESTED | | |
| H-49-2 | Crown | If the current system does not allow Crown it is not bypassed; no new classification | – | – | – | – | – | – | – | – | – | Y | Y | TESTED | | |
| H-50-1 | Crown | Crown and Multi-Main behave exactly as today; manual gram edits use existing semantics; Crown off/on where allowed | Y | `recipeStore` | – | `/` | – | – | – | Y | Y | Y | Y | TODO | | |
| H-51-1 | Live | Everything becomes live only after the first recipe is built; edits update the shared recipe | – | – | Y | `/` | `recipeStore` | – | – | Y | Y | Y | Y | IMPLEMENTED | | |
| H-52-1 | Display | HOME shows: editable name, Score, machine/amount, ingredient name, grams, Crown, Topping marker, simple sweetness, Add ingredient, Add topping, Save recipe, Share with Community when eligible, Let's make it | – | – | Y | `/` | – | – | Y | Y | Y | Y | Y | IMPLEMENTED | | |
| H-52-2 | Display | HOME hides: percentages, PI-ING, product IDs, POD/PAC/NPAC, solids, kcal, cost, supplier data, regulatory data | – | – | Y | `/` | – | – | – | Y | Y | Y | Y | IMPLEMENTED | | |
| H-53-1 | Naming | A natural recipe name is proposed automatically and is immediately editable; no separate naming step | – | – | Y | `/` | `recipeStore` | – | – | Y | Y | Y | Y | TESTED | | |
| H-54-1 | Display | Ingredient row shows only name, grams, Crown where applicable, Topping marker | – | – | Y | `/` | – | – | – | Y | Y | Y | Y | IMPLEMENTED | | |
| H-54-2 | Display | Demo shows `🔒 ••• g` — never a fake value | Y (redaction) | `demoSafeRecipe`, `plans.ts` | Y | `/` | – | – | – | Y | Y | Y | Y | IMPLEMENTED | | |
| H-55-1 | Actions | Every ingredient has a `⋯` menu: Remove, Find substitute where supported, "I don't have this ingredient" | Y (Pro) | `createSubstitutionPreview`, `markIngredientUnavailable` | Y | `/` | `constraintStudioStore` | – | – | Y | Y | Y | Y | IMPLEMENTED | | |
| H-55-2 | Actions | Base and flavour ingredients are not functionally separated | – | – | Y | `/` | – | – | – | Y | Y | Y | Y | TODO | | |
| H-56-1 | Actions | `Add ingredient` reuses the SAME Pro picker (search, filters, voice, scanner, catalogue, ProductBehavior) with a simpler HOME presentation | Y | `product-picker` | Y | `/` | `services/productPicker` | – | – | Y | Y | Y | Y | TODO | | |
| H-57-1 | Actions | On the live recipe screen: "Want to add anything else?" → Add ingredient / Add topping-mix-in | – | – | Y | `/` | – | – | – | Y | Y | Y | Y | IMPLEMENTED | | |
| H-57-2 | Actions | Topping uses the existing Topping behavior, has no Crown, and has editable grams | Y | `addTopping`, `ToppingRow` | Y | `/` | `recipeStore` | – | – | Y | Y | Y | Y | TODO | | |
| H-58-1 | Actions | Only where genuinely ambiguous ask "How do you want to use it? Ingredient / Topping"; never ask unnecessarily | – | – | Y | `/` | – | – | – | Y | Y | Y | Y | TODO | | |
| H-59-1 | Score | After the first recipe the current Score is shown live using the existing authority; no new score calculation | Y | `recipe-score`, `pi-monitor` | Y (wiring) | `/` | – | – | – | Y | Y | Y | Y | TESTED | | |
| H-60-1 | Recalculate | Where existing semantics require it, show `Przelicz i popraw` using the current Recalculate/Preview/Apply workflow | Y | `constraintStudioStore` | Y | `/` | – | – | – | Y | Y | Y | Y | TODO | | |
| H-60-2 | Recalculate | Never auto-apply silently if PRO would not; show current Score + action; no verbose delta explanation | – | – | Y | `/` | – | – | – | Y | Y | Y | Y | TODO | | |
| H-61-1 | Sweetness | HOME exposes Less sweet = −1, Balanced = 0, Sweeter = +1 using the existing Direction Sweetness axis | Y | `recipeDirectionTargets` | Y | `/` | `recipeStore.setDirectionTarget` | – | – | Y | Y | Y | Y | TESTED | | |
| H-62-1 | Sweetness | Viewing HOME projects PRO ±2: −2/−1 → Less sweet, 0 → Balanced, +1/+2 → Sweeter, WITHOUT changing the underlying value | – | – | Y | `/` | – | – | – | Y | Y | Y | Y | TESTED | | |
| H-62-2 | Sweetness | Tapping writes the exact HOME value −1/0/+1; no memory/restore of the previous ±2 | – | – | Y | `/` | – | – | – | Y | Y | Y | Y | TESTED | | |
| H-63-1 | Direction | Hardness is not shown in HOME; its hidden value is preserved and sweetness edits must not change it | – | `softness` axis | Y | `/` | – | – | – | Y | Y | Y | Y | TESTED | | |
| H-64-1 | Direction | All other hidden PRO settings are preserved — hidden never means reset | – | – | Y | – | – | – | – | – | – | Y | Y | TODO | | |
| H-65-1 | Persistence | No auto-save; `Save recipe` is explicit and reuses the current immutable version semantics | Y | `markSaved`, `services/recipes` | Y | `/` | – | Y | – | Y | Y | Y | Y | TODO | | |
| H-66-1 | Production | `Let's make it` works on an unsaved draft — Save is never forced first | Y (Pro) | `executableRecipeHandoff` | Y | `/` | – | – | – | Y | Y | Y | Y | TODO | | |
| H-67-1 | Production | HOME preparation uses the existing Production authority with simplified step-by-step Gellatti language, preserving every real requirement | Y | `production-workspace` | Y | `/` | production store | – | – | Y | Y | Y | Y | TODO | | |
| H-67-2 | Production | HOME users never see the technical Production dashboard, LOT management, regulatory Label, or cost | – | – | Y | `/` | – | – | – | Y | Y | Y | Y | TODO | | |
| H-68-1 | Rescue | Provide `I added too much` → "How much does the scale show now?" using the existing Rescue; no new solver | Y | Production Rescue | Y | `/` | – | – | – | Y | Y | Y | Y | TODO | | |
| H-69-1 | Production | Topping preparation shows a general instruction at the correct later stage; no per-topping science invention | – | – | Y | `/` | – | – | – | Y | Y | Y | Y | TODO | | |
| H-70-1 | Scope | Post-production Too hard/Too soft feedback flow is NOT implemented (owner rejected) | – | – | – | – | – | – | – | – | – | – | – | NOT APPLICABLE | owner rejection recorded | |
| H-71-1 | Demo | Anonymous/free users can explore HOME and PRO with all exact grams hidden; Score stays visible | Y (redaction) | `plans.ts`, `demoSafeRecipe` | Y | `/`, `/pro/*` | – | – | – | Y | Y | Y | Y | IMPLEMENTED | | |
| H-72-1 | Paywall | Paid HOME actions: reveal grams, precise gram edit, Save, Let's make it, Add own product | – | – | Y | `/` | `subscriptionStore` | – | – | Y | Y | Y | Y | TODO | | |
| H-72-2 | Paywall | The HOME paywall offers a plan choice: HOME or PRO | – | `SubscriptionPage` | Y | `/subscription` | `services/billing` | Y | – | Y | Y | Y | Y | TODO | | |
| H-73-1 | Paywall | PRO demo is view-only; navigation allowed; any edit/action raises the PRO paywall ONLY (never a HOME offer for a PRO-only action) | – | – | Y | `/pro/*` | – | – | – | Y | Y | Y | Y | TODO | | |
| H-74-1 | Plan | HOME subscriber: full HOME, no visible PRO in the normal header, no constant upgrade pressure | – | – | Y | `/` | – | – | – | Y | Y | Y | Y | TODO | | |
| H-75-1 | Plan | PRO subscriber: full HOME + PRO, default login PRO unless the Account Setting says HOME | – | – | Y | `/` | – | Y | – | Y | Y | Y | Y | TODO | | |
| H-76-1 | Continuity | After login/payment preserve draft, ingredients, intent, profile, machine, amount, toppings, current step and the temporary Scanner image — never restart | – | – | Y | `/` | draft persistence | Y | – | Y | Y | Y | Y | TODO | | |
| H-77-1 | Continuity | Exactly one local anonymous draft, surviving refresh and return, adopted after login | – | `localStorage` | Y | `/` | draft store | – | – | Y | Y | Y | Y | TODO | | |
| H-78-1 | Continuity | Anonymous machine preference remembered locally and adopted after login | Y | `localStorageMachinePreferenceStore` | Y | `/` | – | – | – | Y | Y | Y | Y | TODO | | |
| H-79-1 | Continuity | A returning user with an unfinished draft sees a `Continue your recipe` card (recipe + machine) with `Continue`, and may also start a new idea | – | – | Y | `/` | draft store | – | – | Y | Y | Y | Y | TODO | | |
| H-80-1 | Continuity | Only one anonymous draft; before replacement confirm "Start a new recipe? Your current draft will be replaced." (Cancel / Start new) | – | – | Y | `/` | – | – | – | Y | Y | Y | Y | TODO | | |
| H-81-1 | Routing | HOME subscriber opens a saved recipe in HOME; PRO subscriber in the currently selected view; demo in the current demo view with grams masked — same recipe, no copy | – | `loadRecipeInput` | Y | `/recipes` | `services/recipes` | – | – | Y | Y | Y | Y | TODO | | |
| H-82-1 | UX | Sequential calm screen-like sections — not a dashboard, not one overloaded screen; header fixed | – | – | Y | `/` | – | – | – | Y | Y | Y | Y | TESTED | | |
| H-82-2 | UX | Each stage normally feels like one screen but may grow; NO nested scroll areas; NOT forced to 100vh; a long ingredient list extends the document naturally | – | – | Y | `/` | – | – | – | Y | Y | Y | Y | TESTED | | |
| H-83-1 | UX | Stage flow: intent → recipe selection if needed → profile if needed → machine if needed → live recipe → preparation after Let's make it | – | – | Y | `/` | stage machine | – | – | Y | Y | Y | Y | IMPLEMENTED | | |
| H-83-2 | UX | After a CTA smoothly move to the next section; from the second stage provide a subtle Back; the user may scroll back naturally | – | – | Y | `/` | – | – | – | Y | Y | Y | Y | IMPLEMENTED | | |
| H-83-3 | UX | No dots, no `1/7` stepper, no separate navigation menu | – | – | Y | `/` | – | – | – | Y | Y | Y | Y | TESTED | | |
| H-84-1 | UX | Required unanswered stages cannot be skipped; forward motion comes only from an explicit CTA; completed sections may be revisited | – | – | Y | `/` | – | – | – | Y | Y | Y | Y | TESTED | | |
| H-85-1 | UX | Going back and changing machine/profile → `Done` updates the SAME recipe using existing logic and returns to the live recipe position, without replaying every stage | – | – | Y | `/` | `recipeStore` | – | – | Y | Y | Y | Y | TODO | | |
| H-86-1 | UX | Changing the core idea (Banana → Mango) after a recipe exists is treated as a New Recipe with a replacement confirmation | – | – | Y | `/` | – | – | – | Y | Y | Y | Y | TESTED | | |
| H-87-1 | Community | HOME and PRO subscribers may publish; Partner status is NOT required | ? (verify) | `publishRecipe` | Y | `/` | `services/community` | Y | Y | Y | Y | Y | Y | TODO | | |
| H-87-2 | Community | Photo is mandatory; prompt "Share with Community / Add a photo and see what others think"; camera or gallery | Partly | `PublishToCommunityDialog` | Y | `/` | – | Y | Y | Y | Y | Y | Y | TODO | | |
| H-88-1 | Community | A publication is never overwritten; a later recipe version may be published again as a NEW publication and the old one stays unchanged | ? (verify) | `community_publications` | Y | – | – | Y | Y | – | – | Y | Y | TODO | | |
| H-89-1 | Community | Comments are NOT implemented | Y (absent) | – | – | – | – | – | Y | – | – | Y | – | TESTED | grep proof that no comment table/UI exists | |
| H-90-1 | Community | Support Like, Save/Favourite and ranking/Top 100 | **Like/Favourite MISSING** | `ranking.ts` | Y | `/community` | `services/community` | Y | Y | Y | Y | Y | Y | TESTED | | |
| H-91-1 | Community | Clicking the like count shows a list of avatar + display name + link to public profile; no messaging action | – | `CreatorCard` | Y | `/community` | – | Y | Y | Y | Y | Y | Y | TESTED | | |
| H-92-1 | Scope | Community private messaging NOT implemented; recorded in backlog; no placeholder button | – | – | Y (backlog doc) | – | – | – | – | – | – | – | – | TODO | backlog entry | |
| H-93-1 | Community | Anonymous/free users may browse Community, open a publication, see image/creator/ranking and use it as a starting point; grams stay masked | Partly | `demoSafeRecipe` | Y | `/community` | – | – | Y | Y | Y | Y | Y | TODO | | |
| H-94-1 | Community | Like and Save/Favourite require login but NOT a paid subscription; a free account may like/favourite and still not see grams | – | – | Y | `/community` | – | Y | Y | Y | Y | Y | Y | TESTED | | |
| H-95-1 | Partner | Publishing does not require Partner; if the creator later becomes Partner, earnings/commission attribution begins only from Partner activation + code/link issuance — never retroactive | Y (separate module) | `partnerShareAttribution` | Y | `/partner` | `services/partner` | Y | Y | Y | Y | Y | Y | TODO | | |
| H-96-1 | Community | A Top100 match card includes photo, recipe name, author, ranking and original lineage where applicable | – | – | Y | `/` | – | Y | Y | Y | Y | Y | Y | TODO | | |
| H-97-1 | Connected | Build every missing connected implementation HOME needs: API endpoints, DB columns/tables, RLS, recipe matching query, Top100 search query, lineage persistence, immutable publication versioning, likes, liked-by, favourites, plan gates, anonymous draft adoption, anonymous machine adoption, scanner continuation after purchase, default HOME/PRO setting, route mappings, Community profile links, Admin visibility | – | – | Y | many | many | Y | Y | Y | Y | Y | Y | TODO | | |
| H-97-2 | Connected | No fake front end — every connected flow works end-to-end | – | – | Y | – | – | Y | Y | – | – | Y | Y | TODO | | |
| H-98-1 | Admin | Admin can inspect Community publications, original creator DNA, source recipe, publication status, image, rank, likes/favourites counts, QA/test seed marker, test accounts, plan/entitlement state, Partner activation timing, code issued timestamp, attribution start timestamp | Partly | `AdminWorkspacePage` | Y | `/admin/*` | `services/adminControl` | Y | Y | Y | Y | Y | Y | TODO | | |
| H-98-2 | Admin | No unrelated broad Admin features; use the Gellatti Design Book | – | – | Y | `/admin/*` | – | – | – | Y | Y | – | Y | TODO | | |
| H-99-1 | Design | HOME feels clean, warm, premium, calm, modern, human, simple | – | Design Book | Y | `/` | – | – | – | Y | Y | – | Y | TODO | | |
| H-99-2 | Design | Palette: white, ivory, controlled greige, graphite/black, restrained Gellatti orange, green only for positive Score/ready | – | V2.1 tokens | Y | `/` | – | – | – | Y | Y | Y | Y | TESTED | | |
| H-99-3 | Design | Typography: Manrope; IBM Plex Mono only where numerical data needs it | Y | existing font stack | Y | `/` | – | – | – | Y | Y | Y | Y | TODO | | |
| H-99-4 | Design | No generic SaaS dashboard, no technical lab framing, no pseudo-Italian marketing, no excessive shadows/borders/cards | – | – | Y | `/` | – | – | – | Y | Y | – | Y | TODO | | |
| H-100-1 | Design | Every new connected surface (Community, Admin, Account, Subscription, Product selection, Scanner gate, match popup) uses the same Design Book — one visual system only | – | shared components | Y | many | – | – | Y | Y | Y | Y | Y | TODO | | |
| H-101-1 | A11y | Verify keyboard focus, focus-visible, aria labels, tap targets, hover/pressed/disabled/loading/error states, reduced-motion | – | – | Y | `/` | – | – | – | Y | Y | Y | Y | TODO | | |
| H-101-2 | A11y | Screen-reader labels for masked grams, Crown, Topping and paywalls; no reliance on hover on mobile | – | – | Y | `/` | – | – | – | Y | Y | Y | Y | TODO | | |
| H-102-1 | Locale | Use the existing locale architecture; never hardcode raw contracts into visible UI; preserve placeholders; never translate enums/keys | Y | FINAL_SAFE registry | Y | `/` | `src/copy` | – | – | Y | Y | Y | Y | TESTED | | |
| H-102-2 | Locale | Polish staging copy is natural Polish; English resources natural English preserving approved meaning | – | – | Y | `/` | – | – | – | Y | Y | Y | Y | TESTED | | |
| H-103-1 | QA data | Exactly 50 staging-only symbolic Community publications, each with an image, marked `QA / STAGING SEED`, with cleanup capability, never in Production | – | – | Y | `/community` | seed script | Y | Y | – | – | Y | Y | TODO | | |
| H-103-2 | QA data | Seeds span Gelato, Sorbet, Vegan, Protein and cover single-ingredient match, multiple exact ingredients, extra ingredients, explicit Topping role, profile filtering, official lineage, user-original DNA, 1st- and 2nd-generation variations, same DNA through multiple variations | – | – | Y | – | – | Y | Y | – | – | Y | Y | TODO | | |
| H-103-3 | QA data | Images are existing safe internal recipe images or clearly staging-generated QA visuals — never scraped copyrighted web images | – | `publicationImages.ts` | Y | – | – | Y | – | – | – | Y | Y | TODO | | |
| H-104-1 | QA data | Distribution: ≥15 original user DNA, ≥10 variants of official Gellatti recipes, ≥15 variants of user originals, ≥5 second-generation variants still pointing at the first original creator, ≥5 exact-match recipes for strict HOME search combinations | – | – | Y | – | – | Y | Y | – | – | Y | Y | TODO | | |
| H-104-2 | QA data | Some recipes carry additional ingredients so `Also includes` is testable; some carry explicit toppings | – | – | Y | – | – | Y | Y | – | – | Y | Y | TODO | | |
| H-105-1 | QA accounts | 10 dedicated staging QA accounts created through legitimate staging QA/Admin paths, never customer accounts, never weakening production auth | Partly (`home@`,`pro@`,`admin@`) | `staging:seed-qa-accounts` | Y | – | seed script | Y | Y | – | – | Y | Y | TODO | | |
| H-105-2 | QA accounts | Roles 1–10: anonymous-via-storage, signed-in free, HOME subscriber, PRO subscriber, PRO-with-HOME-default, Maria (original creator), Tomek (variant of Maria), Anna (variant of Tomek retaining Maria as DNA), likes/favourites user, pre-Partner→Partner creator | – | – | Y | – | – | Y | Y | – | – | Y | Y | TODO | | |
| H-105-3 | QA accounts | No passwords/secrets committed to the repository; a local/staging QA credential manifest lives outside source control and the account list is given to the Owner in the final report | – | – | Y | – | – | – | – | – | – | Y | – | TODO | manifest path + `.gitignore` proof | |
| H-106-1 | QA matrix | Verify plan matrix: ANONYMOUS (HOME+PRO demo, masked), FREE (demo + like/favourite allowed), HOME (full HOME, no PRO in header), PRO (both, default PRO), PRO-preferred-HOME (login starts HOME) | – | – | Y | `/`, `/pro/*` | – | – | – | Y | Y | Y | Y | TODO | | |
| H-107-1 | QA DNA | Maria→Tomek→Anna: B and C both publicly read "Based on original recipe by Maria"; `View original` opens Maria's A; internal history may keep the full chain | – | – | Y | `/community` | – | Y | Y | Y | Y | Y | Y | BLOCKED — AUTH | | |
| H-107-2 | QA DNA | Repeat once with an official Gellatti recipe → user variation → "Based on original recipe by Gellatti" | – | – | Y | – | – | Y | Y | Y | Y | Y | Y | BLOCKED — AUTH | | |
| H-108-1 | QA Partner | Publish while not Partner → no attribution; activate Partner via the legitimate staging flow; issue code/link; create future attributed activity; attribution starts only from activation/code time; earlier activity is not retroactive; no invented commission rates | – | `partnerShareAttribution` | Y | `/partner` | `services/partner` | Y | Y | – | – | Y | Y | TODO | | |
| H-109-1 | QA social | Multiple QA users Like, Favourite, remove Like, remove Favourite, refresh, verify persistence, no duplicates, liked-by list, open profiles; no comments | – | – | Y | `/community` | – | Y | Y | Y | Y | Y | Y | TODO | | |
| H-110-1 | QA Top100 | With 50 seeded publications verify all eligible ranking states; HOME search inspects ONLY Top100; several Community matches → highest-ranked exact match only; existing ranking authority, no second formula | – | `ranking.ts` | Y | `/top100` | – | Y | Y | Y | Y | Y | Y | TODO | | |
| H-111-1 | Tests | Automated matching acceptance matrix: exact official only, multiple official, official+Community, Community only, no match, strict all-ingredient rejection, extra ingredient accepted+labelled, profile filter, explicit topping role, multilingual synonym, typo, ambiguous SKU resolution, existing canonical mapping, Community highest-rank, Create my own | – | – | Y | – | – | – | Y | – | – | Y | – | TODO | | |
| H-112-1 | Tests | Machine acceptance across every supported Home machine: saved-preference skip, anonymous local preference, profile-specific batch, one container, multiple containers, manual amount, capacity guidance, recipe-only machine change, saved recipe's own machine, Professional recipe viewed in HOME without reset; no machine-science rework | – | – | Y | – | – | – | – | Y | Y | Y | Y | TODO | | |
| H-113-1 | Tests | Recipe interaction acceptance: live Score, manual grams, Crown auto-enable, non-eligible Crown not bypassed, Crown off/on, Multi-Main, add/remove ingredient, substitute, missing ingredient, add topping, topping grams, sweetness, hidden Hardness preserved, Recalculate/Preview/Apply, name edit, Save/version, unsaved Let's make it | – | – | Y | – | – | – | – | Y | Y | Y | Y | TODO | | |
| H-114-1 | Tests | Preparation acceptance for ≥1 valid recipe per profile: HOME preparation, same underlying Production, step continuity, TARA, process requirements, machine instructions, topping step, Rescue, completion; LOT/Label never exposed to HOME | – | – | Y | – | – | – | – | Y | Y | Y | Y | TODO | | |
| H-115-1 | Tests | Demo/paywall acceptance from HOME demo and PRO demo; HOME paid action → HOME+PRO choice; PRO-only action → PRO-only purchase; after entitlement the same draft and same screen | – | – | Y | – | – | – | – | Y | Y | Y | Y | TODO | | |
| H-116-1 | Tests | Anonymous continuity acceptance: refresh, close/reopen, HOME↔PRO, machine persistence, Continue card, new-recipe replacement confirmation, login adoption, purchase adoption, scanner image continuation | – | – | Y | – | – | – | – | Y | Y | Y | Y | TODO | | |
| H-117-1 | Docs | `reports/GELLATTI_HOME_ROUTE_STATE_INVENTORY.md` lists all current and new routes/states incl. public HOME, PRO demo, HOME recipe, HOME preparation, account, plan selection, scanner gates, recipe popup, Community, profiles, liked-by modal, Admin connected pages, error/empty/loading states | – | – | Y | – | – | – | – | – | – | – | – | TODO | | |
| H-118-1 | Process | Work in the 10 coherent phases; multiple protected PRs allowed; do not wait between phases | – | – | Y | – | – | – | – | – | – | – | – | IN PROGRESS | | |
| H-119-1 | Tests | Heavy E2E/seed/matrix tooling behind explicit commands (`home:e2e`, `home:seed-community`, `home:acceptance`) and NOT inside ordinary `npm test` | – | `vitest.acceptance.config.ts` pattern | Y | – | `package.json` | – | – | – | – | Y | – | TESTED | | |
| H-120-1 | Tests | Before every merge run owner-locked contracts, protected-path gate, route tests, locale tests, plan/auth tests, typecheck, lint, build, `git diff --check`; never weaken existing tests | – | `verify:staging` | Y | – | – | – | – | – | – | Y | – | TESTED | | |
| H-121-1 | Served QA | Every merged phase verified on `staging.pinguinoai.com` (not only localhost) at 390×844 and 1440×900 with screenshots and state evidence | – | Browser pane | Y | – | – | – | – | Y | Y | – | Y | TODO | | |
| H-122-1 | Process | After implementation re-review EVERY row: run the test, run served QA, attach evidence, mark SERVED VERIFIED or BLOCKED with the exact reason; never claim PASS without evidence; never silently omit blocked points | – | – | Y | – | – | – | – | – | – | – | – | TODO | | |
| H-123-1 | Docs | `reports/GELLATTI_HOME_FINAL_ACCEPTANCE.md` with the full required summary (SHA, deployment IDs, bundle, routes, states, every flow, blockers) | – | – | Y | – | – | – | – | – | – | – | – | TODO | | |
| H-124-1 | Docs | Final report in the prescribed format | – | – | Y | – | – | – | – | – | – | – | – | TODO | | |
| H-125-1 | Process | Do not declare completion early — completion requires all 8 listed conditions | – | – | – | – | – | – | – | – | – | – | – | TODO | | |

---

## 2. Status roll-up — as of `0fae188b` (2026-08-30, local verification only)

| Status | Rows | Meaning |
| --- | --- | --- |
| `TESTED` | 72 | Implemented with automated tests green. **Not yet verified on staging.** |
| `IMPLEMENTED` | 21 | Built and verified by hand in the local browser at 375×812; no automated test yet. |
| `IN PROGRESS` | 2 | Process rows (checklist upkeep, phase sequencing). |
| `NOT APPLICABLE` | 1 | H-70-1 — the owner rejected the post-production feedback flow. |
| `TODO` | 115 | Not started. |
| **Total** | **211** | |

**Nothing is marked `SERVED VERIFIED`.** Per §122 that mark requires evidence from
`staging.pinguinoai.com`, and this branch has not been merged or deployed yet. Local
browser verification is recorded as `IMPLEMENTED`, deliberately one rung lower.

### Evidence for this batch

| What | Evidence |
| --- | --- |
| Full suite | 842 files / 10,237 tests passed, 0 failures (`npx vitest run`, exit 0) |
| Owner-locked guard | `owner-locked guard: OK — no accepted contract was modified.` |
| Protected-path guard | `protected-path guard: OK — no protected functional path was touched.` |
| Contracts | 12 files / 127 tests |
| Typecheck / lint / build | clean; lint 0 errors (7 pre-existing warnings); `git diff --check` clean |
| Staging DB | 3 migrations applied and verified against `tunabqqrwabacxjcxxkz` |
| Browser (375×812) | root = creator; profile stage skipped for "truskawka sorbet"; 9 Home machines, no Professional; "Ninja CREAMi Deluxe · 1 pojemnik"; 5-line Sorbet base; name "Truskawka Sorbet"; Score 4/10; grams masked |

### Defects found and fixed during this batch

1. **Machine lost on first generation** (§16/§42/§44) — `rebuildNewRecipeStarter` is a
   NEW draft and replaces the machine with the account default, so a chosen Ninja
   reverted to Professional while batch and temperature stayed correct. Fixed by
   ordering; pinned by `homeMachineSurvivesStarter.test.ts`, which reproduces the
   defect as well as proving the fix.
2. **Header scrolled away** (§10) — `AppShell`'s header was static. Added an opt-in
   `stickyHeader` prop (default `false`, so no other page changes).
3. **DNA credited the wrong creator** (§38) — pre-existing since 2026-08-23;
   `based_on` resolved the parent instead of the lineage root. Fixed in SQL.

### Known gaps in what was built (not yet addressed)

- **Ingredient rows read technically.** The live recipe shows the canonical Mapper
  name verbatim — `WATER · Liquid`, `SUCROSE SUGAR · Sweetener · Dry`. §54 asks for
  the ingredient NAME and §99 forbids technical lab framing. The canonical value is
  DATA and must not be mutated (§102), so this needs a HOME display map, not an edit
  to the catalogue. **Not yet built.**
- **Intent ingredients are not yet added to the recipe.** The first recipe is a
  correct, complete base for the profile, but the user's own flavour (truskawka) is
  not yet a line in it — that requires the §56 picker integration
  (`ServerIngredientPicker` + `useIngredientLibrary`), which is identified but not
  wired. This is the single largest functional gap in the current build.
- **Scan button is inert.** Wired to nothing rather than to a fake result (§26 cheap
  pre-check is not built).
- Add ingredient / Add topping / Save / Share / Let's make it are rendered but not yet
  wired to their authorities.

---

## 3. Blockers discovered during verification

### B1 — DNA served proof needs an authenticated save path (`BLOCKED — AUTH`, rows H-107-1/2)

I attempted to prove the §38 fix end-to-end by constructing a real
Maria → Tomek → Anna chain directly on staging. The insert was refused:

```
ERROR: P0001: authentication required
CONTEXT: PL/pgSQL function assert_recipe_behavior_authority_v1(jsonb,jsonb,'SAVE')
         PL/pgSQL function recipe_behavior_write_guard_v1()
```

`saved_recipes` carries a write guard that requires an authenticated session. **This is
the guard working correctly, and I did not bypass it** — planting QA rows past a
protective trigger would invalidate the very thing the proof is supposed to establish.
The transaction rolled back completely (verified: 0 QA creators, 0 QA recipes,
0 QA publications, 0 lineage rows remain).

The chain must therefore be built through the app's own authenticated save + publish
path — which is exactly what §105 means by "legitimate staging QA/Admin paths", and is
part of the unstarted §103/§104 seed work.

**What IS proven about §38 today:** the SQL resolves `based_on` from
`coalesce(root_publication_id, parent_publication_id)`; a source test pins that and all
17 card keys; and `gellatti_publication_card_v1` executes correctly on staging
(returns `based_on: null` for the one existing publication, which is an original with
no lineage — the correct answer).

### B2 — `Solver time contracts (isolated)` fails environmentally (blocks merge)

`recipeVectorProximity.test.ts` fails in CI with `Error: Test timed out in 5000ms`;
the same case runs in **2386 ms locally** and the file is 23/23 green in 17.7 s.
The identical job fails on **`staging` itself in 4 of its last 6 runs**
(33319256204, 33317673042, 33316195344, 33312556703 fail; 33320490721, 33314969409
pass). This branch touches no solver code and the protected-path guard confirms it.

**Deliberately not "fixed" by relaxing the timing budget** — that is the failure mode
AGENTS.md rule 11 exists to prevent, and it would delete the only signal a real solver
regression would trip. Raised as a PR comment for an owner decision (re-run / explicit
documented `testTimeout` / larger runner).

---

## 4. Local verification limit (important when reading §1 evidence)

This worktree has **no `.env`**, so Supabase is unconfigured locally. Two consequences:

1. The intent → identity → recipe-line path **cannot be exercised locally**. The search
   correctly returns `unavailable` and the chip correctly stays unresolved, so the
   local browser run proves the *honest-failure* behaviour and nothing more.
2. Everything verified locally so far — root routing, stage flow, profile skipping,
   machine selection, starter generation, Score, masked grams — runs off the local
   demo catalogue and the pure authorities, so those results stand.

Identity resolution is therefore being verified against the PR's Vercel preview
(`pinguino-staging-git-1a5e9c-…vercel.app`), which carries real backend env.

### Bug found and fixed by browser QA (2026-08-30)

**Non-English intent resolved to nothing.** The Mapper catalogue is named in ENGLISH
(`STRAWBERRIES`) while §25 explicitly invites `truskawka` / `fresa` / `Erdbeere`.
Searching the user's raw word matched zero rows for every non-English user — the intent
was understood perfectly by the parser and then discarded at the catalogue boundary.
`catalogueSearchTerms()` now tries the canonical concept first and the raw word second.
This adds no translation layer and no equivalence (§24): the concept is only a search
string, and whatever comes back still goes through the normal ranking and the §23
choice.

This is a good example of why §121 exists — the unit tests were all green and the
defect was only visible against a real catalogue.
