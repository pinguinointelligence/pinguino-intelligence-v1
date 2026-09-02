# Unified Product Intelligence — completion ledger

Date: 2026-08-14
Branch: `codex/unified-product-intelligence`
Implementation base: `5f796583955fb82f5ab08ce2e0236cb48cccdc16`
Staging implementation HEAD before this ledger commit: `2d30ce35243f75e1fe2b10f553395f4fb841349e`
Target: `https://staging.pinguinoai.com` / Supabase `tunabqqrwabacxjcxxkz` only
Production: untouched
Final status: **READY FOR OWNER QA**

## 1. Requested scope

Recover and reconcile the preserved Global Product Catalog and Unified Product Intelligence
work; consolidate product identity onto one canonical root; route product sources through one
server transaction; make one versioned resolver authoritative across recipe/product modules;
classify all 2,088 Mapper rows without invented science; preserve accepted Engine, Mapper and
pixel-locked UI behavior; deploy to staging only; and prove the served candidate before owner
QA.

## 2. Completed work

- Consolidated product identity, immutable versions, evidence, behavior bindings, ingest
  events, review cases and account-private relations around canonical `public.products`.
- Migrated the former global catalog tables to locked compatibility projections. There is no
  second client-writable product root.
- Implemented service-role-only `ingest_product_v1` and routed OCR, barcode, manual,
  administrator, catalog/spreadsheet, retailer, supplier, Shop, Franchise, internal
  subproduct and future-integration adapters through `catalog-submit` into that transaction.
- Added durable preflight quotas, payload-bound idempotency, duplicate evidence and explicit
  decisions, immutable versions, server-owned taxonomy/verification/Mapper decisions,
  evidence finalization and owner-private overlays.
- Implemented one server resolver and terminal validator over exact product version,
  binding, Mapper/process authority, taxonomy/policy version, profile, temperature, role,
  scope, module and private/reference price context.
- Added terminal database guards for saved recipes, recipe versions and production runs.
- Unified Picker, Base, Topping, Main, Substitution, OPTIMAL, ECO, Cost, Monitor, Summary,
  Nutrition, Allergens, Process Guide, Production, Batch Rescue, Master Label, Save, Recipe
  Versions, Restore and Export on immutable per-line behavior authority.
- Added canonical Mapper-reference products and a resumable reclassification queue with
  authority fingerprints, stale-job supersession, entity locking, dependent requeue and
  atomic current-binding publication.
- Classified all 2,088 Mapper rows on independent behavior-role and policy-status axes.
  Unknown/blocked rows retain exact review reasons; no Mapper source row was rewritten.
- Centralized Main envelopes in the SQL policy registry, kept insufficient science/data
  fail-closed, and retained identity/ratio/group limits for Multi-Main.
- Applied every migration through `20260813112100` to linked staging, deployed the JWT-protected
  `catalog-submit` Edge function, processed the complete reclassification queue and ran live
  authenticated two-account/three-account staging fixtures.
- Removed all ephemeral QA accounts and retired their private fixtures while preserving the
  expected immutable audit/version history.

## 3. Files changed

The recovered and reconciled implementation contains 369 tracked paths across 32 commits from
the preserved staging base; that count includes byte-preserving forensic backup evidence.
Principal implementation/evidence areas are:

- `supabase/migrations/20260813110000_global_product_catalog.sql` through
  `supabase/migrations/20260813112100_revoke_client_policy_taxonomy_dml.sql`
- `supabase/functions/catalog-submit/index.ts`
- `src/services/{productIngest,productIntelligence,products,ocrIntakePersistence}.ts`
- `src/services/productSourceAdapters.ts`
- `src/features/product-intelligence/*`
- `src/features/{constraint-studio,ingredient-builder,global-catalog,pro-workbench,production-workspace,master-label}/*`
- `src/stores/recipeStore.ts`
- `scripts/auditUnifiedProductIntelligence.mjs`
- `scripts/captureDesktopPixelLock.mjs`
- `reports/MAPPER_2088_PRODUCT_BEHAVIOR_AUDIT.{csv,md}`
- `reports/reconciliation/*`
- `reports/qa/pixel-lock/*`
- product, resolver, intake and Main-policy documentation under `docs/`

The canonical Mapper and process source files remain byte-identical. Base Engine formulas were
not changed; the additive Engine type metadata is pricing provenance only and is excluded from
scientific calculations.

## 4. Tests added or changed

- Canonical-root migration, compatibility, RLS/grant and direct-write boundary tests.
- Edge/ingest tests for source authorization, evidence preflight, quotas, idempotency,
  duplicate decisions, OCR retry/session linking and cleanup.
- Resolver/context/terminal-validation tests for nullable facts, private-price currentness,
  stale versions/bindings/policies and Base/Topping scope forgery.
- Reclassification tests for Mapper/process fingerprints, retry, supersession, dependency
  requeue, entity locking and atomic publication.
- Main policy, liquid-carrier boundary, form/concentration/ABV, temperature and Multi-Main
  envelope tests.
- Cross-module snapshot tests for substitution, Monitor, Summary, Cost, Production, Label,
  Save, Restore and legacy inspection.
- Pixel-lock fixture authority and current pixel/structural evidence.

## 5. Exact commands executed

Final local freeze:

```text
npm test -- --run --maxWorkers=1
npm run typecheck
npm run lint
npm run build
npm run recipes:validate
npm run process:validate
npm run products:audit
npm audit --audit-level=high
node scripts/captureDesktopPixelLock.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/buildPixelLockReport.ps1
node --input-type=module -e "<pgsql-parser loop over migrations 20260813110300..20260813112100>"
npx supabase migration list --linked
npx supabase db push --dry-run --linked
npx supabase functions list --project-ref tunabqqrwabacxjcxxkz
npx supabase secrets list --project-ref tunabqqrwabacxjcxxkz --output json
git diff --check
```

Authorized staging application and live fixtures executed during this completion run:

```text
npx supabase db push --linked
npx supabase functions deploy catalog-submit --project-ref tunabqqrwabacxjcxxkz
node .tmp-upi-staging-qa.mjs
node .tmp-upi-cleanup.mjs
```

The two temporary QA scripts were removed after their accounts/fixtures were cleaned up.
The served frontend was inspected with the in-app browser at `/` and `/pro`.

## 6. Test results

- Full Vitest: **474 files / 6,144 tests PASS**, exit 0, 441.73 s.
- TypeScript: PASS.
- ESLint: PASS, 0 errors; two pre-existing Fast Refresh warnings remain in
  `src/app/router.tsx` and `src/features/pro-core/RecipeVersionsSection.tsx`.
- Production build: PASS; the existing large-chunk advisory remains.
- Recipes: 2,500/2,500 manifest rows PASS; source SHA-256
  `23837d15c0a8a194dad36ee845296cffc3e872fd63297c801b236b6b7c6ef68c`.
- Process metadata: 2,088/2,088 aligned, 22 columns, PASS; 1,389 rows remain honestly
  `UNKNOWN` pending evidence.
- Product audit: 2,088/2,088 unique PASS; role/policy totals reconcile exactly.
- Dependency audit: 0 vulnerabilities.
- Native PostgreSQL parser: every migration from `20260813110300` through
  `20260813112100` PASS (10300: 153 statements; 10400: 108; all later patches parsed).
- Pixel lock: **64/64 DOM anchors PASS**, **8/8 logo/wordmark assertions PASS**; closed structural
  difference 0.281325%, picker difference 0.3279%, both below 0.5%.
- Served frontend: landing and `/pro` loaded with title `PINGÜINO Intelligence`; no browser
  console errors.

## 7. Previously accepted flows retested

- Gelato, Sorbet, Vegan and Protein Engine/calibration suites.
- Main identity, 1:1 / 2:1 / 1:1:1 Multi-Main ratios and whole-gram Apply.
- liquid-dairy-carrier 299/300/301 g boundary and Protein exemption.
- ECO missing-price honesty and private/reference price precedence; OPTIMAL remains
  price-independent.
- Stabilizer safety, practicalization, Preview/Apply/Undo and stale/forged rejection.
- OCR quick/multi-image save, duplicate/open-existing/manual completion and rate retry.
- Base/Topping composition, substitution and completed-production snapshot reproduction.
- Save/version/restore immutability, historical inspection and terminal database guards.
- Monitor/Summary/Nutrition/Allergens/Process/Master Label frozen-authority projections.
- The six canonical machine/serving choices, Demo/Home/Pro visibility/save rules and desktop
  pixel lock.
- Live staging ingest creation, exact idempotent replay, payload mismatch rejection,
  cross-account private-price isolation, internal-product isolation, protected-write denial,
  service-RPC denial and all four quota buckets.

## 8. Deployment environment verified

- Linked Supabase project: staging `tunabqqrwabacxjcxxkz`.
- Local and remote migration histories align through `20260813112100`.
- Final `db push --dry-run --linked`: exit 0, `upToDate=true`, no migrations/seeds/roles
  pending.
- `catalog-submit`: ACTIVE, version 1, `verify_jwt=true`, deployed SHA-256
  `44503ad6ff8124d0db4c9aceb7273ce336b10498db82db72471e21b0c74fa8b0`.
- `CATALOG_RISK_HMAC_SECRET`: present. Optional `CATALOG_OCR_VERIFY_URL`,
  `CATALOG_OCR_VERIFY_KEY` and `TURNSTILE_SECRET_KEY`: absent by explicit staging choice;
  the implementation fails closed to BLUE/RED and database quotas.
- Post-cleanup live counts: products total 2,100; active products 2,088; active Mapper
  references 2,088; product versions 2,100; current product behavior bindings 2,100;
  current Mapper behavior bindings 2,088; catalog audit 2,088; Mapper audit 2,088.
- Queue: pending 0, running 0, failed 0, superseded 0, succeeded 2,100.
- `https://staging.pinguinoai.com/` and `/pro` served successfully with no console errors.
- No production project, credentials, environment or deployment was modified.

## 9. Remaining incomplete items

- Owner acceptance QA of the served product workflow remains, by definition, the next gate.
- Independent server OCR GREEN attestation and Turnstile challenge cannot be exercised until
  the optional staging secrets/endpoints are supplied. Their absence cannot fabricate GREEN;
  it produces honest BLUE/RED and quota behavior.
- The 1,389 process `UNKNOWN` rows and other `BLOCKED_DATA` / `BLOCKED_SCIENCE` bindings require
  reviewed source/science evidence. They are an explicit data-review backlog, not silently
  inferred implementation.
- Two existing Fast Refresh lint warnings and the Vite chunk-size advisory are non-blocking
  maintenance debt.

## 10. Exact blockers and required external actions

There is no known internal P0/P1/P2 blocker to beginning owner QA on staging. Required owner or
external actions are:

1. run owner acceptance scenarios on the served staging UI;
2. if GREEN OCR and Turnstile behavior must be accepted in this QA round, provide the staging
   verifier URL/key and Turnstile secret, then rerun those served fixtures;
3. review evidence-blocked Mapper/process rows before publishing any new scientific policy;
4. authorize production separately only after owner QA — this work grants no production
   permission.

## 11. Git diff and commit status

- Preserved recovery checkpoints remain in history; no recovered artifact was lost.
- The staging implementation is a linear 32-commit sequence from base `5f79658` through
  `2d30ce3` before this ledger/evidence commit.
- `origin/staging` contained `2d30ce3` at the final ledger write and all implementation
  migrations/function code were already pushed.
- This ledger and refreshed pixel evidence are included in the final QA-evidence commit; its
  hash is reported in the final handoff because a commit cannot embed its own stable hash.
- The post-commit handoff must verify a clean worktree, `origin/staging` containment and
  `git diff --check` before reporting completion.
