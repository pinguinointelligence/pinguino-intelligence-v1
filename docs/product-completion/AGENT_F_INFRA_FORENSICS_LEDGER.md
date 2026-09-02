# AGENT F — INFRASTRUCTURE & DATA FORENSICS LEDGER (NIGHTLY P0)

Date: 2026-07-24 (run ~00:56 CEST / 2026-07-23 22:56 UTC)
Mode: STRICTLY READ-ONLY. Sources: public HTTPS fetches (curl), the staging-scoped Supabase
connector (SELECT-only), repo files + git history, and preserved local tool-result files.
No database writes, no deploys, no code changes. The ONLY file produced is this ledger.

Connector identity verified BEFORE any query: `get_project` → ref `tunabqqrwabacxjcxxkz`,
name `pinguino-staging`, region eu-west-1, Postgres 17.6.1.141, status ACTIVE_HEALTHY,
created 2026-07-12T14:26:36Z. The default `mcp__supabase__*` connector (a DIFFERENT,
non-staging project — hazard PI-INFRA-002) was NOT queried tonight, per rules.

---

## 1. Staging served bundle — https://staging.pinguinoai.com/

| Item | Evidence | Verdict |
|---|---|---|
| Served JS asset | `assets/index-DCJH1R2o.js` (1,309,172 B); CSS `assets/index-Cp5fjceK.css` | MATCHES expected hash |
| 3316f2b copy marker | `prowizoryczna` present (1 occurrence) | CONFIRMED |
| Inlined commit | `VITE_VERCEL_GIT_COMMIT_SHA: 4dfb097d14fe91c2cc7bd67e02265e6ac41123a2`, `VITE_VERCEL_GIT_COMMIT_REF: staging` | staging serves repo HEAD 4dfb097 |
| Vercel identity | project `prj_6h8PDTCUrdDdXNzfEfjJNsVL5BcE`, deployment `dpl_7tnuvt2vw9jJBiwPxxzZTLx7kg6P`, production URL `staging.pinguinoai.com`, repo `pinguinointelligence/pinguino-intelligence-v1` | separate staging Vercel project confirmed |
| Supabase target | `VITE_SUPABASE_URL: https://tunabqqrwabacxjcxxkz.supabase.co` (2 occurrences; only supabase host in bundle) | staging frontend → staging DB, correct |
| Anon key | one JWT inlined; decoded claims: iss=supabase, ref=tunabqqrwabacxjcxxkz, **role=anon**, iat 1783866396, exp 2099442396 | expected public key; NOT a leak |
| service_role leak check | zero occurrences of `service_role`; the anon JWT is the only JWT in the bundle | CLEAN |
| Sentry | `VITE_SENTRY_DSN: https://f2b073d563f14b91057259169c03a59f@o4511733616082944.ingest.de.sentry.io/4511733657239632` | Sentry configured on staging |
| Stripe keys | no `pk_live`, no `pk_test`, no `sk_*` | no publishable key shipped (checkout goes via edge functions) |
| Wrong-project refs | `riwipywgqobrulyzrzad` 0, `tjntmljkrxbpwjmkautu` 0, `MOOTOORS` 0 | CLEAN |
| Freshness | `Last-Modified: Thu, 23 Jul 2026 21:47:20 GMT`, Server: Vercel, X-Vercel-Cache HIT (cdg1) | redeployed 2026-07-23 evening |

## 2. Production served bundle — https://www.pinguinoai.com/

| Item | Evidence | Verdict |
|---|---|---|
| Served JS asset | `assets/index-BTR3SdkC.js` (1,308,394 B); CSS `assets/index-Cp5fjceK.css` (same hash as staging) | matches previously-known prod hash |
| Inlined commit | `VITE_VERCEL_GIT_COMMIT_SHA: 4dfb097d14fe91c2cc7bd67e02265e6ac41123a2`, `VITE_VERCEL_GIT_COMMIT_REF: main` | prod auto-deploys main; SAME source commit as staging tonight |
| Vercel identity | project `prj_7DQGL4Cy6kVHV28stgjAm5uOqt5y`, deployment `dpl_H141PZ7nuY6TCAxXkHdp1QEDQrgB`, production URL `www.pinguinoai.com`, `VITE_VERCEL_URL: pinguino-intelligence-ekxxrh9xw.vercel.app` | distinct prod Vercel project |
| Supabase URL | **ZERO** `*.supabase.co` hosts; no `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` strings; **zero JWTs** of any kind in the bundle | **prod ships NO Supabase configuration** |
| Consequence (code-grounded) | `src/lib/supabase/client.ts:15-30` — when env vars are absent, `isSupabaseConfigured=false` and `supabase=null`; app degrades gracefully (auth unavailable, demo/Studio work) | prod runs with NO backend at all; login/auth cannot work there |
| supabase-js library | the `@supabase/*` client CODE is bundled (auth-js error strings visible) but is never instantiated without env | library present, unconfigured |
| service_role / JWT leak | zero `service_role`, zero `eyJ…` JWT patterns | CLEAN |
| Wrong-project refs | `riwipywgqobrulyzrzad` 0, `tjntmljkrxbpwjmkautu` 0, `tunabqqrwabacxjcxxkz` 0, `MOOTOORS` 0 | CLEAN — no project ref of any kind embedded |
| Stripe | no `pk_live` / `pk_test` / `sk_*`. The only `STRIPE` strings are offer-catalogue metadata: `envVarName:"STRIPE_PRICE_…"` (11 offers, server-side env NAMES, no values) | no Stripe environment embedded; live-vs-test undecidable from prod bundle (nothing there) |
| Sentry | no DSN, no `sentry` strings beyond none | Sentry NOT configured on prod |
| 3316f2b marker | `prowizoryczna` present (same source commit) | consistent |
| Freshness | `Last-Modified: Thu, 23 Jul 2026 22:56:13 GMT`, X-Vercel-Cache MISS | fresh Vercel serve |

**Prod bottom line:** www.pinguinoai.com is a static, backend-less build of main@4dfb097.
Nothing secret is embedded; equally, NO backend (Supabase/Sentry/Stripe publishable) is
configured on the prod Vercel project's env.

## 3. Staging Supabase (tunabqqrwabacxjcxxkz)

| Item | Evidence | Verdict |
|---|---|---|
| Registered migrations | 31 entries: `0001_auth_my_recipes` … `0031_user_machine_preference_user_default` (versions 20260716101413 → 20260717134505) | ledger = 0001–0031 |
| Repo migration files | `supabase/migrations/0001…0035` (35 files) | repo is 4 ahead of ledger |
| 0032 / 0033 | NOT in registered ledger, but their objects EXIST: views `public.mapper_basement_search` and `public.mapper_basement_search_demo` both present | applied OUT-OF-BAND (SQL editor), as previously noted |
| 0034 / 0035 | NOT in ledger AND their side-effects absent: **no `_backup_legacy_products_0034/0035` tables exist** (they are created BEFORE any delete in both scripts) | **never applied on staging, in any form** |
| Edge functions (6, all ACTIVE) | `create-accepted-correction` v13 (verify_jwt true) · `stripe-webhook` v14 (verify_jwt false) · `stripe-subscription-webhook` v13 (false) · `create-checkout-session` v14 (true; updated ~2026-07-20) · `create-portal-session` v13 (true) · `create-connect-onboarding-link` v13 (true) | matches the provisioned set |
| Auth (read-only view) | `auth.users` = 3; `auth.identities` providers = `email, google` | email + Google active |
| Sentry DSN | inlined in staging bundle (section 1) | present |
| Mapper sanity | `mapper_basement` n_live_tup = 2,083 (n_tup_ins 2084, n_tup_del 1; autovacuum 2026-07-16 10:58 UTC) | canonical 2,083-row catalogue intact on staging |

## 4. Stripe environment (bundle + edge functions + SELECT-only tables)

| Item | Evidence | Verdict |
|---|---|---|
| Mode | `public.stripe_webhook_events`: 3 rows, all `livemode:"false"`, checkout session id prefix `cs_test_…`, dated 2026-07-20 19:30:59 UTC (`customer.subscription.created`, `checkout.session.completed`, `invoice.payment_succeeded`) | **TEST mode**, one full checkout flow exercised end-to-end on 2026-07-20 |
| Price catalog | `billing_price_catalog`: 11 offers (home/pro × monthly/yearly/15m × standard/launch/founding/partner), all with `stripe_price_id` set (`price_1Ts1…`) | catalog wired |
| Billing state | `billing_customers` 1 · `customer_subscriptions` 1 · `subscriptions` 2 | QA/test data only |
| Client keys | no publishable key in either bundle | payments only via JWT-gated edge functions |

---

## 5. PRODUCTS TABLE FORENSICS — conclusion first

**No rows ever disappeared from staging. `public.products` on tunabqqrwabacxjcxxkz has
been empty since the project was provisioned (2026-07-16). Every observation of "69
products on staging" was a read through the DEFAULT `mcp__supabase__` connector — which
points at a DIFFERENT (non-staging) Supabase project (hazard PI-INFRA-002) — mislabelled
as staging. The "empty table" is not a deletion event; it is a connector-identity error.**

### Evidence chain (each item independently checkable)

1. **Current state:** `products` = 0 rows, `product_snapshots` = 0 rows.
2. **No backup/renamed tables:** `information_schema.tables` matching `%product%` or
   `%backup%` in `public`: only `products`, `product_snapshots`, `production_run*`.
   No `_backup_legacy_products_0034/0035` → 0034/0035 never executed here (each script
   creates its backup tables BEFORE deleting).
3. **The current relation NEVER held a row:** `pg_stat_user_tables` for `products` and
   `product_snapshots`: `n_tup_ins = 0, n_tup_upd = 0, n_tup_del = 0`, never vacuumed or
   analyzed. A DELETE or TRUNCATE of 69 previously-inserted rows would leave
   `n_tup_ins ≥ 69` (counters are cumulative and survive TRUNCATE).
4. **Not a stats reset:** neighbouring tables retain their counters from provisioning day
   (`mapper_basement` ins=2084/del=1, autovacuum 2026-07-16; `saved_recipes` ins=15/del=7).
   A crash/global reset would have zeroed those too.
5. **Not a drop-and-recreate:** `pg_class` OIDs sit in ORIGINAL migration order —
   `mapper_basement` 17762 (0006) < `products` 17789 (0007) < `products_code_seq` 17841
   (0010) < `product_snapshots` 17864 (0011) < `accepted_corrections` 17890 (0012) <
   `ocr_intake_sessions` 18586 (0022) < `production_runs` 19108 (0028) <
   `user_machine_preference` 19336 (0030). A recreated `products` would carry an OID above
   19336.
6. **Sequence never fired:** `pg_sequences.last_value` for `products_code_seq` is NULL —
   `nextval` has never been called on this database. 69 imported rows would have consumed
   the sequence (codes PR-ING-000002…000070 imply ~69 nextval calls wherever they were
   actually created).
7. **Where the 69-row reads really came from:** the snapshot generator preserved in the
   session scratchpad (`genSnapshot.mjs`, 2026-07-17 22:38) reads its input from
   `…/tool-results/mcp-supabase-execute_sql-1784320570665.txt` — the result of a
   **`mcp__supabase__execute_sql`** call, i.e. the DEFAULT connector, NOT the
   staging-scoped connector (`mcp__11ad34eb…`). That file (2026-07-17 22:36) contains all
   **69** distinct `PR-ING-0000xx` codes with full row data. A second preserved result,
   `mcp-supabase-execute_sql-1784397099472.txt` (2026-07-18 19:51 — the 43-row semantic
   audit read), also contains all **69** codes with nutrition columns. Both underpin the
   docs/commits that claimed "verified read-only against staging".
8. **Repo timeline of the belief:** cef736c (2026-07-17 23:01) "wire the 69 staging
   products" added `src/data/products/customerCatalogueSnapshot.ts` whose header says
   "exported from the staging project (tunabqqrwabacxjcxxkz) on 2026-07-17" — that header
   text is generated INSIDE `genSnapshot.mjs` (hard-coded label), while the data came from
   the misconnected call (item 7). 0323f65 (2026-07-18 18:44) retired the bundled file;
   9426c28 / 1064958 (2026-07-18) added the file-only 0034/0035 scripts whose "reference
   audits" used the same wrong connector.
9. **Project-memory corroboration:** PI-INFRA-002 (recorded during PRO CORE S1-S3, ~07-19/20)
   independently discovered `mcp__supabase__` = NOT staging. The staging-live provisioning
   memory (2026-07-16) lists 29 migrations + 2,083 Mapper rows + bucket + 6 functions —
   and NO products seed. No products seed script for tunab exists in the repo or scratchpad
   (the Jul-16 `seed_batches`/`seed_parts` artifacts are the mapper_basement 2,083 seed).

### Answers to the mandated questions

- **When did rows disappear?** Never, on staging. Bound: `products` on tunab has had zero
  inserts from provisioning (2026-07-16 10:14 UTC migration batch) to tonight's check
  (2026-07-23 ~23:00 UTC). No deletion event exists to date.
- **Which migration/commit/action is responsible?** None on staging. The responsible
  ERROR is the connector misconnection (PI-INFRA-002): the Jul-17/18 product reads,
  the bundled "staging snapshot" (cef736c), and the 0034/0035 reference audits all ran
  against the default `mcp__supabase__` project while labelled staging. 0034/0035
  themselves were never applied on tunab (and would have been a no-op there).
- **Only the legacy import, or possibly private user products?** On staging: nothing was
  lost — zero rows ever existed, so zero private products existed or were lost. In the
  misconnected project (as of the last preserved read, 2026-07-18 19:51): exactly 69 rows,
  all `source_type='mercadona'`, codes PR-ING-000002…000070 — one legacy import batch.
  The only write path (`src/services/productCatalogImport.ts` →
  `createProductWithIdentity`) is own-row RLS-gated (single signed-in owner), matching the
  0034 header's "one owner". No evidence of any other user's private products.
- **Does a backup exist anywhere?** Not as DB tables on staging (0034/0035 never ran, so
  no `_backup_*` tables). File-level copies of the full catalogue DO survive, all local:
  1. `tool-results/mcp-supabase-execute_sql-1784320570665.txt` (2026-07-17; 69 codes,
     picker columns + matched mapper references),
  2. `tool-results/mcp-supabase-execute_sql-1784397099472.txt` (2026-07-18; 69 codes,
     richer identity/nutrition columns),
  3. git blob `cef736c:src/data/products/customerCatalogueSnapshot.ts` (66 active rows +
     references; recover with `git show cef736c:src/data/products/customerCatalogueSnapshot.ts`),
  4. semantic row-by-row audit docs: `docs/product-audit/LEGACY_PRODUCTS_43_ROW_AUDIT_2026-07-18.md`
     and `LEGACY_PRODUCTS_MAPPING_2026-07-18.md`.
  Additionally the rows presumably still live in the misconnected project (external check
  required — see below).
- **Does the schema remain valid for future private OCR/manual products?** YES. `products`
  has its full 88-column shape; RLS present and own-row scoped (`products_select/insert/
  update/delete_own`; `product_snapshots_select/insert_own`); `products_code_seq` intact
  (untouched); OCR tables 0022–0024 and verification tables 0026 exist. Nothing needs
  restoring for the architecture to work; the table is simply awaiting its first real row.

**Nothing was restored, seeded, or modified tonight (read-only mandate).**

---

## 6. EXTERNAL ACTIONS (owner / Nicolas only)

1. **Identify the default `mcp__supabase__` connector's project** (Supabase dashboard →
   which ref; expected: old prod `riwipywgqobrulyzrzad`) and run ONE read there:
   `select count(*), min(product_code), max(product_code) from public.products;`
   Expected 69 / PR-ING-000002 / PR-ING-000070. This closes the last unverifiable link
   (Agent F was forbidden from touching that connector tonight).
2. **Fix or remove the misconnected connector** (PI-INFRA-002) so no future session can
   read/write the wrong project while believing it is staging. This single hazard produced
   the entire "products disappeared" scare.
3. **Decide where the products catalogue should live.** If staging is to hold the retained
   set, re-import deliberately into tunab from the surviving file copies (owner-run, not
   agent-run). Only after that decision does applying 0035 (on the project that actually
   holds the rows) make sense; as written, both 0034/0035 are no-ops on tunab today.
4. **Prod backend decision:** www.pinguinoai.com currently ships with NO Supabase env →
   auth/login cannot work on prod by construction. If intentional (public demo shell),
   no action; if not, set `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (and
   `VITE_SENTRY_DSN`) on Vercel project `prj_7DQGL4Cy6kVHV28stgjAm5uOqt5y` — pointing at
   whichever project is designated production (NOT decided by this ledger).
5. **No Supabase PITR/log inspection is needed for tunab** — there is no deletion event to
   investigate on staging. Skip that expense unless step 1 contradicts the 69-row expectation.
6. Housekeeping: register 0032/0033 in the migration ledger (or note them as permanently
   out-of-band) so `list_migrations` stops under-reporting applied schema.
