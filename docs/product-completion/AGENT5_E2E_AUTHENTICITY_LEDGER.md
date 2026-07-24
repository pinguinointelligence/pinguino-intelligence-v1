# AGENT 5 — APPLICATION END-TO-END AUTHENTICITY LEDGER

Date: 2026-07-24 · Base: `nightly/integration` @ `6f8e680` · Branch: `agent5/e2e-authenticity`
Scope owned: services / adapters / repository selectors (`src/services/**`). Engine, formulation
(Agent 3) and UI pink markers/pages (Agent 4) untouched — findings that need UI treatment are in
§4 "Coordinate with Agent 4".

Question answered per module: (1) data source, (2) production adapter present + wired,
(3) runtime calculations real, (4) can a mock/in-memory fallback silently activate (exact
condition), (5) can customer output be produced without real backend/Engine.

---

## 1. Per-module audit table

| Module | Data source | Production adapter wired? | Runtime calc real? | Silent fake fallback possible? (condition) | Customer output without backend/Engine? |
|---|---|---|---|---|---|
| **Demo** | Local demo presets/ingredients (`src/data/demoPresets.ts`, `src/data/demoIngredients.ts`) + the REAL bundled engine | n/a by design (Masterplan §9: demo is local) | YES — the real engine runs client-side | No — demo is the declared product surface, honestly labeled demo; the DEV pro-override is env-gated (`src/access/useAccess.ts:33` — `import.meta.env.DEV && devOverridePro`) | Yes, by design (demo IS the offline product; engine is real) |
| **Home (CustomerShellV1)** | Real engine (local) + live Mapper search + entitlements | YES — entitlement sync wired in `src/app/providers.tsx:63-69` | YES | One residue: "Gotowe przepisy" list = `CATALOGUE_FIXTURES` (`src/features/customer-shell/CustomerShellV1.tsx:56`, `:743-745`, rendered `:1300-1304`) — fixture recipe cards on a customer surface, always active. REPORTED → Agent 4 (§4.1) | Ready-list cards yes (fixtures); recipe math no (engine) |
| **Pro (9-tab /pro)** | pro-core repositories + real engine | YES — `resolveRecipesRepository` (`src/features/pro-core/proCoreRecipeRepo.ts:51-69`) defaults to `supabaseRecipesBackendFactory()` | YES | NO — `selectProCoreRepository` (`src/services/proCore/repositorySelector.ts:34-38,58-68`): backend wins when configured; in-memory ONLY in DEV; otherwise throws `BackendNotConfiguredError` → honest `unavailable` state | No — persistence surfaces refuse honestly |
| **Ingredient search (Pro picker)** | LIVE server-side search `mapper_basement` (`src/services/ingredients.ts:75-115`) | YES (`useIngredientSearch` → `searchEngineApprovedIngredients`) | n/a (search) | WAS: unconfigured reads silently returned `[]` (`ingredients.ts` old :24,:36,:79,:119,:130) — looked like "no results". NOW GUARDED (§3.1). Feature-level: Pro + query error/empty rows → `demoLibrary('fallback')` (`src/features/ingredient-builder/ingredientLibrary.ts:121,129-132`) — status `'fallback'` IS in the contract; presentation reported → Agent 4 (§4.2) | Search results no; demo catalog only via explicit `'fallback'`/`'demo'` status |
| **Ingredient search (customer picker, Składniki PI)** | Demo-safe view 0033 + rich view 0032 (`src/services/productPicker/mapperSearch.ts:156-191,212-244`) | YES — default deps in `src/features/customer-shell/useIngredientResolution.ts:137-140` | n/a | NO — typed outcomes only: `not_configured` / `view_missing` / `unauthorized` / `error`, never invented values (`mapperSearch.ts:158,180,217,228-230`); legacy bundled 66-product sample RETIRED from this path (`useIngredientResolution.ts:207-212`); `SAMPLE_CATALOGUE`/`inMemoryCatalog` have test-only importers (export residue: §4.3) | No — anon gets honest 'unauthorized' for engine values |
| **Formulation (Agent 3 area — audit only)** | Bundled engine + constraint studio, all client-side | n/a (pure compute) | YES — real solver; ±25% routing removed; constrained optimum may honestly equal the null | NO fake-data fallback found in the solver path (fixtures live in tests/`__fixtures__` and `src/qa/engine-validation/fixtures.ts` = QA drift detectors, not runtime) | Output requires the real engine (bundled) — authentic |
| **Monitor (drawer + Monitor PI)** | LIVE engine result — `useStudioResult` (`src/features/pro-core/MonitorDrawer.tsx` header + `:15-16`) | n/a (pure compute over live result) | YES — recomputed on every change; tuning honestly gated by scientific approval (`CustomerShellV1.tsx:728-733`, `monitorTuningApproval`) | NO | Requires the engine result — authentic |
| **Save (first save)** | `saved_recipes`+`saved_recipe_meta`+`recipe_versions` via `SupabaseRecipes` | YES (`src/services/proCore/supabaseRecipes.ts:221+`) | n/a | Two honest branches, no fake save: (a) unconfigured prod → `BackendNotConfiguredError` (selector); (b) migration-0036 RPC missing (`PGRST202`/`42883` ONLY — `supabaseRecipes.ts:137-142`) → documented NON-transactional fallback (still real DB writes, compensating delete on failure, `:399-460`) — condition memoized `:227`, activation NOW LOGGED (§3.2). `supabaseRecipesFake.ts` = test-support only, zero non-test importers (verified) | No — save without backend throws; capability gate `:390-394` |
| **Versions / restore / history** | `recipe_versions` append-only, UNIQUE(recipe_id,version_number), 23505 retry (`supabaseRecipes.ts:284-304`) | YES (same repository) | n/a | NO — history is DB-authoritative (`nextVersionNumber` `:272-276`); in-memory twin only via DEV selector | No |
| **Costs** | `costsRepository` + pure costing domain | YES — `resolveCostsRepository` (`src/features/pro-core/proCoreCostsRepo.ts:43-58`) | YES — `src/features/pro-core/costing.ts` (pure; explicit density/unit-weight conversions only, never guessed VAT/currency) | NO — same honest selector pattern | No |
| **Nutrition** | Engine result (`nutrition_per_100g`) formatted by pure builders (`src/data/label/nutritionLabel.ts`) | n/a (derived from engine) | YES | NO | Requires engine — authentic |
| **Machines** | Static neutral catalog (routing/UX only, owner decision) + `MachinePreferenceStore` | YES — selector `src/services/machinePreference/machinePreferenceSelector.ts:40-44,64-75`; Supabase adapter exists (`supabaseMachinePreference.ts`, throws typed `MachinePreferenceBackendError`, never degrades) — backend factory wiring is the 0030 launch gate | n/a | NO — device-local (localStorage) store is a REAL production store for anon/demo with honest `isAccountScoped:false`; neither factory → typed not-configured error | Preference is device-real, honestly non-account-scoped |
| **Production** | `productionRepository` | YES — `resolveProductionRepository` (`src/features/pro-core/proCoreProductionRepo.ts:48-63`) | YES (independent batch recompute in Apply pipeline) | NO — same honest selector pattern | No |
| **Exports** | Engine result + cost snapshot → pure CSV (`src/features/pro-core/costExport.ts`) | n/a (client CSV) | YES | NO — capability-gated: `assertCanExport` refuses (`costExport.ts:23-25`); exact grams redacted without `canViewExactGrams` | Export refused without capability — honest |
| **Batch Rescue** | Spine router + multi-lever solver (`src/spine/batchRescueRouter.ts`, `src/features/optimization/batchRescueStepSolver.ts`, `batchRescueMultiLeverSolver.ts`) | n/a (pure engine-side compute) | YES | NO runtime fixture path (fixtures = tests only) | Requires engine — authentic |
| **Stock Shortage** | Spine router (`src/spine/stockShortageRouter.ts`) + verified-substitute contract (`src/features/optimization/verifiedSubstituteContract.ts`) | n/a (pure) | YES | NO | Requires engine — authentic |
| **Labels** | FIXED SAMPLE recipe `SAMPLE_LABEL_RESULT` (`src/pages/destinations/CreateLabelPage.tsx:9,15-17,25-27`) formatted by pure `@/data/label/*` builders | Not yet (sample surface by design) | YES (builders format real engine-shaped output) | The surface is fixture-fed but SELF-DECLARED (`sampleHeading`/`sampleNote` copy) — honest sample, not a silent fake. Wiring a saved recipe = product work, noted §4.4 | Yes — declared sample |
| **OCR / products intake** | Real OCR providers via explicit-id registry (`src/features/ocr-intake/provider/providerRegistry.ts:2-4,25-31` — "no fallback magic", unknown ids throw); persistence `ocrIntakeSessions/Evidence/Storage` | YES — `buildRealIntakeWiring()` (route `src/app/router.tsx:118`); persistence launch-gated on migrations 0022-0024 | YES (real tesseract runs; checksums recorded; demo session fabricates nothing claiming to be real — `src/features/ocr-intake/ui/demoSession.ts:1-15`, dev pages only) | WAS: unconfigured reads silently returned `[]`/`null` (8 read fns). NOW GUARDED (§3.1). Writes always threw loudly (`ocrIntakeSessions.ts:82,164,219,241,258,281,349,363`; `ocrIntakeStorage.ts:87,120`; `ocrIntakeEvidence.ts:81,198`) | No silent path left |
| **Products / snapshots / mapper review** | `public.products`, `product_snapshots` via services | YES (`src/services/products.ts`, `productSnapshots.ts`, `productStatusWrite.ts:56` throws unconfigured) | Mapper matching pure (`productMapper.ts`) | WAS: silent `[]`/`null` unconfigured reads (products old :37,:48,:168,:195; snapshots old :40,:52). NOW GUARDED (§3.1). Picker catalogue adapters are dependency-injected, bind no backend at import (`supabaseProductCatalog.ts:37-52`, `supabaseIngredientCatalog.ts:25-32`) | No |
| **Billing / entitlements** | RLS-scoped `subscriptions` + `entitlements` rows | YES — `getMySubscription` (`src/services/billing.ts:17-27`), `syncEffectiveAccess` (`src/services/accountAccess/liveEffectiveAccess.ts:121-138`) wired in `providers.tsx:63-69` | Pure resolvers (`billingEntitlementBridge`, `entitlementResolver`) | NO over-grant path: every failure resolves to `null` → honest 'demo' (`liveEffectiveAccess.ts:134-137`); store fails safe to 'free' (`src/stores/subscriptionStore.ts:32-35`); checkout returns typed `{ok:false,'unavailable'}` (`billingCheckout.ts:43`). WAS: unconfigured `getMySubscription` returned silent `null` — NOW GUARDED (§3.1). Frontend can never write entitlements (RLS) | Only demo access — fail-safe, never fake Pro |
| **Auth / account access** | Supabase auth | YES (`src/services/auth.ts`) | n/a | NO — every op returns `{ok:false, UNAVAILABLE}` when unconfigured (`auth.ts:37,45,60`); `isAuthAvailable` exported (`auth.ts:23`); null session with no backend is truthful (nobody CAN be signed in). `InMemoryAccountAccess` / `InMemoryVerification` / `InMemoryIngredientResolution` consumed ONLY by `/dev/*` pages whose routes are not created in production (`src/app/router.tsx:109-133`, all `import.meta.env.DEV &&`) | No |

---

## 2. Complete fallback-condition list (before this change)

Silent = the caller could not distinguish "backend absent" from "you have no data".

| # | Selector / fallback | Exact activation condition | Verdict before | Now |
|---|---|---|---|---|
| F1 | `chooseRepositoryMode` in-memory (`repositorySelector.ts:36`) | `!backendConfigured && import.meta.env.DEV && inMemoryDev factory` | Honest (DEV-only, `isLocalDev:true`, prod throws) | unchanged |
| F2 | `chooseMachinePreferenceStoreMode` local (`machinePreferenceSelector.ts:42`) | no backend factory wired (0030 launch gate) | Honest (real device store, `isAccountScoped:false`) | unchanged |
| F3 | Non-transactional first save (`supabaseRecipes.ts:139,341-376,399`) | RPC `create_recipe_with_v1` missing: `PGRST202`/`42883`/message match ONLY; memoized per session (`:227`) | Real-DB fallback, documented, but SILENT at runtime | **logged on activation** |
| F4 | 22 unconfigured service READS returning `[]`/`null` (products ×4, ingredients ×5, recipes ×2, acceptedCorrections ×1, productSnapshots ×2, billing ×1, ocrIntakeSessions ×5, ocrIntakeEvidence ×2, ocrIntakeStorage ×1) | `supabase === null` (env vars absent — i.e. a misbuilt bundle) | SILENT fake-empty customer output | **explicit guard** (§3.1) |
| F5 | `selectIngredientLibrary` → `demoLibrary('fallback')` (`ingredientLibrary.ts:121,129-132`) | Pro + (query error OR 0 rows) | Explicit in contract (`status:'fallback'`); presentation honesty = Agent 4 | reported §4.2 |
| F6 | `syncEffectiveAccess → null` (`liveEffectiveAccess.ts:125,134-137`) | no auth / no client / read error / junk rows | Honest by design (fail-safe demo, never over-grant) | unchanged |
| F7 | Live-search picker states (`mapperSearch.ts:158,180,217,228-230`) | client null / view missing / anon rich read | Honest typed outcomes | unchanged |
| F8 | Demo catalog for demo/non-Pro (`ingredientLibrary.ts:120`) | demo route or not Pro | By design (demo product surface) | unchanged |
| F9 | `CATALOGUE_FIXTURES` ready-recipes (`CustomerShellV1.tsx:743-745`) | always, on the ready-list phase | Customer-visible fixture data — UI-owned | reported §4.1 |
| F10 | `SAMPLE_LABEL_RESULT` label surface (`CreateLabelPage.tsx`) | always | Self-declared sample (honest) | reported §4.4 |

---

## 3. Changes made (services/adapters/selectors only)

### 3.1 `src/services/backendGuard.ts` (NEW) + 22 read-site conversions

Policy (mirrors `repositorySelector` honesty): `emptyUnconfiguredRead(surface, empty)` —
* **DEV/test build** → returns the honest empty value but LOGS once per surface (never silent);
* **production build** (`import.meta.env.PROD`) → `console.error` + throws
  `BackendNotConfiguredReadError` (`code: 'backend_not_configured'`) — the same loud refusal the
  write paths always had (`throw new Error(UNAVAILABLE)`). A correctly built staging/prod bundle
  always configures Supabase, so this branch can only fire in a misconfigured build.

Pure decision `chooseUnconfiguredReadBehavior(isProdBuild)` is separated from the env read and
fully tested. Converted sites (current line numbers):

* `src/services/products.ts:38,49,169,196` — `listMyProducts`, `getProduct`, `findOwnedProductBy`, `findExistingProductForIdentity`
* `src/services/ingredients.ts:25,37,80,121,132` — all five reads; `listIngredientsByIds([])` stays an honest plain empty (nothing was asked for)
* `src/services/recipes.ts:18,28` — `listMine`, `get`
* `src/services/acceptedCorrections.ts:163` — `listMyAcceptedCorrections`
* `src/services/productSnapshots.ts:41,53` — `listProductSnapshots`, `getLatestSnapshot`
* `src/services/billing.ts:18` — `getMySubscription` (the fail-safe-to-free store behaviour is unchanged in DEV; a misbuilt prod bundle now leaves console evidence instead of silently showing "Free")
* `src/services/ocrIntakeSessions.ts:97,135,182,195,307` — `listBatches`, `loadBatch`, `loadSession`, `listSessions`, `listSessionImages`
* `src/services/ocrIntakeEvidence.ts:102,209` — `listOcrRuns`, `listEvidence`
* `src/services/ocrIntakeStorage.ts:110` — `createIntakeImageSignedUrl`

No behavioural change for a correctly configured backend; no UI change; no deletions.

### 3.2 `src/services/proCore/supabaseRecipes.ts` — fallback activation logged

When `isFunctionMissing` flips `rpcFirstSaveUnavailable` (the ONLY condition that activates the
documented non-transactional first save), a `console.warn` now names the missing migration-0036
RPC and the consequence. The weaker path can no longer engage invisibly.

### 3.3 Tests added

* `src/services/backendGuard.test.ts` — pure policy; DEV logged-empty semantics (once per
  surface); PRODUCTION throws typed+attributable and never returns the empty value.
* `src/services/unconfiguredReads.guard.test.ts` — wiring proof for ALL 22 converted reads:
  mocked null client → empty value AND the surface tag appears in the log (so a regression back
  to a silent return fails the suite). Existing `ocrIntake.unconfigured.test.ts` (reads empty,
  writes throw) stays green by construction.

### 3.4 Gate-integrity fix (environment artifact, pre-existing on `6f8e680`)

5 migration-content test files (`src/features/ingredients/*.migration.test.ts`, 14 tests) failed
on ANY Windows autocrlf checkout — verified failing on the pristine base commit. Cause: git
stores the migrations LF (`git ls-files --eol`: `i/lf w/crlf`) but checks them out CRLF; the
tests' per-line comment strip `/--.*$/` cannot cross the stray `\r`, so SQL comments leaked into
the "executable" text and boundary assertions (e.g. "no anon") tripped. Fix: normalize
`\r\n → \n` at file read in those 5 tests — zero assertion changes, identical behaviour on LF
platforms. (Files are migration-guard tests, not Agent 3/4 surfaces.)

---

## 4. Coordinate with Agent 4 (reported, NOT implemented — UI-owned)

1. **Ready-recipes fixtures on Home**: `CustomerShellV1.tsx:56,743-745,1300-1304` renders
   `CATALOGUE_FIXTURES` (fixture recipe cards) to customers on the ready-list phase. Needs either
   an honest "przykładowe" marker or a real catalogue source.
2. **Pro picker 'fallback' status presentation**: `selectIngredientLibrary` returns
   `status:'fallback'` (12-ingredient demo catalog) for a Pro user on query error/empty
   (`ingredientLibrary.ts:121,129-132`). Verify the picker visibly distinguishes 'fallback' from
   'ready' so a Pro user never mistakes the demo catalog for PI Base.
3. **Export residue**: `src/features/product-picker/index.ts:14,16` still exports
   `inMemoryCatalog` / `SAMPLE_CATALOGUE` (importers today: tests only). Candidate for removal at
   the next feature-index cleanup — left in place (no deletions in my lane).
4. **Create Label sample**: `CreateLabelPage` is a declared fixed-sample surface; wiring it to a
   saved recipe is future product work, not a fake to fix.

## 5. Verdict

After this change there is **no code path in a production build that can silently substitute
mock, in-memory, fixture or empty data for a real backend read** in the services layer: backend
absent → typed loud refusal (reads now match writes); DEV conveniences remain but are logged and
env-gated; in-memory adapters are reachable only through DEV-only routes and the DEV-only
selector branch. Remaining fixture-fed customer surfaces (§4.1, §4.4) are UI-owned and reported.
