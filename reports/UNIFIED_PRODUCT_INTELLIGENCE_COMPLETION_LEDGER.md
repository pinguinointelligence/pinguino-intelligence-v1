# Unified Product Intelligence — completion ledger

Date: 2026-08-14
Branch: `codex/unified-product-intelligence`  
Implementation base: `5f796583955fb82f5ab08ce2e0236cb48cccdc16` (`origin/staging`)
Pre-deployment implementation HEAD: `771da4f3a3552d54e0d17ceb904065eec9727bbd` plus the final reviewed worktree delta
Target: `staging.pinguinoai.com` / Supabase `tunabqqrwabacxjcxxkz` only
Production: unchanged

This ledger records the final implementation freeze before the staging apply. It must be
updated with served staging counts, RLS fixtures and deployment identifiers after the
authorized staging-only deployment.

## 1. Requested scope

Recover the preserved Global Catalog and Unified Product Intelligence work, consolidate it
onto one canonical `public.products` root, route every product source through one server
transaction, make one versioned resolver authoritative across every recipe/product module,
classify all 2,088 Mapper rows without invented science, preserve accepted Engine/Mapper/UI
behavior, reconcile the staging migration ledger, and prove the complete system on staging.

## 2. Completed work

- Consolidated product identity, immutable versions, evidence, behavior bindings, ingest
  events, review cases and account-private relations around canonical `public.products`.
- Migrated the former global catalog tables to locked archives and exposed only safe,
  read-only compatibility projections; no second writable product root remains.
- Implemented service-role-only `ingest_product_v1` and routed OCR, barcode, manual,
  administrator, catalog/spreadsheet, retailer, supplier, Shop, Franchise, internal
  subproduct and future-integration adapters through `catalog-submit` into that transaction.
- Added durable preflight quotas, payload-bound idempotency, duplicate pHash candidates,
  explicit same/different decisions, evidence finalization/cleanup, immutable versions,
  server-controlled verification/taxonomy/Mapper decisions and owner-private overlays.
- Implemented one server resolver plus terminal validator over exact product version,
  binding, Mapper/process authority, taxonomy/policy version, profile, temperature, role,
  scope, module and current private/reference price.
- Added database terminal guards for saved recipes, recipe versions and production runs.
- Unified Picker, Base, Topping, Main, Substitution, OPTIMAL, ECO, Cost, Monitor, Summary,
  Nutrition, Allergens, Process Guide, Production, Batch Rescue, Master Label, Save,
  Recipe Versions, Restore and Export on immutable per-line behavior snapshots.
- Removed the legacy Main bypass. Historical rows remain read-only and visibly
  `LEGACY_RECONSTRUCTED`; editing or terminal actions require a new fully resolved version.
- Added deterministic canonical Mapper-reference products/bindings and a resumable,
  retryable reclassification queue with authority fingerprints, stale-job supersession,
  per-entity locking, dependent catalog requeue and atomic current-binding publication.
- Classified all 2,088 Mapper rows with separate role and policy axes. Unknown or blocked
  rows carry exact evidence reasons; no Mapper source row or Engine formula was rewritten.
- Centralized Main floors/ceilings/hard limits in the SQL policy registry. Minimum-only
  evidence remains blocked; compound concentration, unknown ABV and unknown retained mass
  fail closed. Multi-Main preserves identity/ratio and uses separate group envelopes.
- Preserved desktop geometry and the existing premium UI primitives; pixel lock remains
  64/64.

## 3. Files changed

The final delta spans 88 tracked paths plus four new test/adapter fixtures. Principal areas:

- `supabase/migrations/20260813110300_canonical_product_root_and_ingest.sql`
- `supabase/migrations/20260813110400_product_behavior_classification_queue.sql`
- `supabase/functions/catalog-submit/index.ts`
- `src/services/{productIngest,productIntelligence,products,ocrIntakePersistence}.ts`
- `src/services/productSourceAdapters.ts`
- `src/features/product-intelligence/*`
- `src/features/{constraint-studio,ingredient-builder,pro-workbench,production-workspace,master-label}/*`
- `src/stores/recipeStore.ts`
- `scripts/auditUnifiedProductIntelligence.mjs`
- `scripts/captureDesktopPixelLock.mjs`
- `reports/MAPPER_2088_PRODUCT_BEHAVIOR_AUDIT.{csv,md}`
- `reports/reconciliation/*`
- `docs/formulation/{MAIN_FLAVOUR_ENVELOPE_REGISTRY,FLAVOUR_FLOOR_REGISTRY}.md`

The Mapper source CSV/process source files are byte-identical. Base Engine formulas were not
changed; the only Engine type addition is pricing provenance metadata that is excluded from
scientific calculations.

## 4. Tests added or changed

- Canonical-root migration, compatibility-view, RLS/grant and direct-write boundary tests.
- Edge/ingest tests for source authorization, evidence preflight, quotas, idempotency,
  duplicate candidates/disputes, OCR retry/session linking and cleanup.
- Resolver/context/terminal-validation tests, including nullable facts, private-price
  currentness, stale versions/bindings/policies and Base/Topping scope forgery.
- Reclassification tests for Mapper/process fingerprints, retry, supersession, dependency
  requeue and atomic publication.
- Main policy, carrier boundary, form/concentration/ABV, temperature and Multi-Main tests.
- Cross-module snapshot tests for substitution, Monitor, Summary, Cost, Production, Label,
  Save, Restore and legacy inspection.
- Pixel-lock fixture authority was made complete without changing production geometry.

## 5. Exact commands executed on the final local freeze

```text
npm test -- --run --maxWorkers=1 --reporter=dot
npm run typecheck
npm run lint
npm run build
npm run recipes:validate
npm run process:validate
npm run products:audit
npm audit --audit-level=high
node scripts/captureDesktopPixelLock.mjs
node --input-type=module -e <pgsql-parser command for 10300 and 10400>
npx supabase migration list --linked
npx supabase db push --dry-run --linked
npx supabase functions list --project-ref tunabqqrwabacxjcxxkz
npx supabase secrets list --project-ref tunabqqrwabacxjcxxkz
git diff --check
```

Focused post-review reruns additionally covered the canonical migration, catalog security,
classification queue, Main envelope, flavour floor, server validator, OCR persistence,
Master Label, Monitor and Production seams.

## 6. Test results

- Full Vitest: **473 files / 6,126 tests PASS**.
- Final focused rereview: **10 files / 137 tests PASS**.
- TypeScript: PASS.
- ESLint: PASS, 0 errors; two pre-existing Fast Refresh warnings remain in
  `src/app/router.tsx` and `src/features/pro-core/RecipeVersionsSection.tsx`.
- Production build: PASS; the existing large-chunk advisory remains.
- Recipes: 2,500/2,500 manifest rows PASS; source SHA-256
  `23837d15c0a8a194dad36ee845296cffc3e872fd63297c801b236b6b7c6ef68c`.
- Process metadata: 2,088/2,088 aligned, 22 columns, PASS.
- Product audit: 2,088/2,088 unique, PASS.
- Dependency audit: 0 vulnerabilities.
- Native PostgreSQL parser: 10300 = 152 statements PASS; 10400 = 106 PASS.
- Pixel lock: **64/64 PASS**.
- `git diff --check`: PASS before this ledger update; rerun is required before commit.

## 7. Previously accepted flows retested

- Gelato, Sorbet, Vegan and Protein Engine/calibration suites.
- Main identity, 1:1 / 2:1 / 1:1:1 Multi-Main ratios and whole-gram Apply.
- dairy-carrier 299/300/301 g boundary and Protein exemption.
- ECO missing-price honesty and private/reference price precedence; OPTIMAL remains price-free.
- Stabilizer safety, practicalization, Preview/Apply/Undo and stale/forged rejection.
- OCR quick/multi-image save, duplicate/open-existing/manual completion and rate retry.
- Base/Topping composition, substitution and completed production snapshot reproduction.
- Save/version/restore immutability, historical inspection and terminal DB guards.
- Monitor/Summary/Nutrition/Allergens/Process/Master Label frozen-authority projections.
- canonical six machine/serving choices, Demo/Home/Pro visibility/save rules and desktop UI lock.

## 8. Deployment environment verified

- Linked project ref resolves to staging `tunabqqrwabacxjcxxkz`.
- Local/remote migration history is aligned for 41 applied versions through
  `20260812034500`.
- Linked dry-run exits 0 and proposes exactly five forward migrations:
  `20260813110000` through `20260813110400`.
- Linked staging currently has no deployed `catalog-submit` function.
- `CATALOG_RISK_HMAC_SECRET` exists in the staging secret store. Optional
  `CATALOG_OCR_VERIFY_URL`, `CATALOG_OCR_VERIFY_KEY` and `TURNSTILE_SECRET_KEY`
  are absent, which is an accepted authenticated-staging configuration.
- No remote mutation had been performed at this pre-deployment ledger freeze.

## 9. Remaining incomplete items

The local implementation has no known P0/P1/P2 code blocker after the final focused/full
gates. The following required acceptance work is intentionally still pending at this point:

1. create the final implementation commit and push only `staging`;
2. apply the five forward migrations to staging;
3. deploy `catalog-submit` and the frontend to staging only;
4. execute served two-account RLS/rate/duplicate/future-product/module fixtures;
5. record live canonical product/version/binding/catalog counts and clean up ephemeral QA data.

Evidence-blocked Mapper/process rows are not unfinished code. They stay fail-closed with
exact reasons until reviewed source/science data exists.

## 10. Exact blockers and required external actions

At this pre-deployment checkpoint the only blocker to the final status is missing served
staging proof. If migration application, Edge deployment or an authenticated fixture fails,
the release remains `NOT READY — INTERNAL WORK REMAINS` until the responsible code/config is
fixed and all gates rerun. Production must remain untouched.

## 11. Git diff and commit status

- Preserved safety checkpoints: `b1f18496887758e8b6a4863d0bba6ebb31f0ca74` and
  byte-equivalent recovery commit `aa65bca`.
- Branch: `codex/unified-product-intelligence`.
- `origin/staging` remains the untouched implementation base
  `5f796583955fb82f5ab08ce2e0236cb48cccdc16` and is an ancestor of this branch.
- Final implementation delta is intentionally unstaged at this ledger write.
- No push, migration apply, function deployment, frontend deployment or production action
  has yet occurred.
