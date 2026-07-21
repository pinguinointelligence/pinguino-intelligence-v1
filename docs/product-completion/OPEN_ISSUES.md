# PINGÜINO — Master Open-Issue Ledger

Completion gate (owner rule, 2026-07-20): an issue is `CLOSED` only after the exact
owner-visible behavior is verified in the exact environment the owner tests.
`CODE_COMPLETE` and `DEPLOYED_NOT_VERIFIED` are **not** `CLOSED`.

Statuses: `OPEN` · `IN_PROGRESS` · `CODE_COMPLETE` · `DEPLOYED_NOT_VERIFIED` ·
`VERIFIED_STAGING` · `VERIFIED_PRODUCTION` · `BLOCKED_EXTERNAL` · `CLOSED`.

---

## PI-P0-001 — Production live Mapper catalogue unavailable

- **ID:** PI-P0-001
- **Date:** 2026-07-20
- **Owner request:** On desktop at `https://pinguinoai.com`, the ingredient picker
  (`Wybierz produkt` → `Składniki PI`) shows *"Katalog składników na żywo nie jest
  jeszcze dostępny w tym środowisku…"*, while the same search works on the phone
  (staging). Close before any other work.
- **Environment:** PRODUCTION — `pinguinoai.com` (308→) `www.pinguinoai.com`.
  Vercel project `pinguino-intelligence` (`prj_7DQGL4Cy6kVHV28stgjAm5uOqt5y`),
  deploys branch `main` → target production.
- **Priority:** P0
- **Status:** `BLOCKED_EXTERNAL`

### Root cause (PROVEN, not inferred)
The message is the `mapperSearch` guard `{ kind: 'unavailable', reason:
'not_configured' }` (`src/services/productPicker/mapperSearch.ts:158,217`), reached
when `supabase === null` because `isSupabaseConfigured` is false
(`src/lib/supabase/client.ts`) — i.e. `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
were empty at build time.

Evidence:
- Production serves bundle `/assets/index-1xzp6Gr1.js`. Fetched it (1.21 MB) and it
  contains **zero `*.supabase.co` URLs** → no Supabase URL was inlined.
- The production deployment is **fresh** (`ef8152b`, main, READY, 2026-07-20 20:50) —
  a current build that still lacks the URL, so the vars are **not set in the
  production project's Production environment** (a fresh build would have baked them).
- Contrast: staging (`pinguino-staging`, branch `staging`) bundle **does** inline
  `https://tunabqqrwabacxjcxxkz.supabase.co` → catalogue works on the phone.
- Backend readiness on staging Supabase `tunabqqrwabacxjcxxkz`: `mapper_basement_search`
  and `mapper_basement_search_demo` both exist; `demo_view` returns **2070** rows
  (anon-readable via 0033). So once production points at a configured Supabase, the
  catalogue works.

Excluded causes: not an old build (prod is at current `main` `ef8152b`); not a
missing view on tunab (both present); not www/non-www split (apex 308→www, same
deployment); not fixtures/hardcoding.

### Files
- `src/services/productPicker/mapperSearch.ts` (guard — correct, no code change needed)
- `src/lib/supabase/client.ts` (env-gated client — correct)
- Vercel project `pinguino-intelligence` env config (the actual defect location)

### Commits
None — this is a configuration/deployment defect, not a code defect. The smallest
proven fix is environment config + redeploy, not a code edit.

### Verification (to CLOSE)
On `https://pinguinoai.com` (desktop + mobile, anon + Home + Pro, hard refresh):
milk gelato → new recipe → `Wybierz produkt` → `Składniki PI` → search `wanilia`,
`mięta`, `bazylia`, `mleko`, `dekstroza`, `inulina`, `stabilizator` → real `PI-ING-*`
IDs return, selection updates RecipeInput, Engine runs, Monitor available, and no
"unavailable" message appears.

### Blocker (external — owner/Nicolas)
Production Vercel env is not my infrastructure to change, and the backend model is an
owner decision. Two things are required and neither can be done from here.

### Next action (single exact external action)
1. **Decide the pre-launch backend model** (owner):
   - RECOMMENDED (pre-launch): point production at the already-verified staging
     Supabase `tunabqqrwabacxjcxxkz` (it has all migrations + data + the two views +
     entitlements). Implication: production and staging then **share one database**
     (the QA accounts home@/pro@ pw 123456 and test data would be live on prod) —
     acceptable pre-launch, must be explicit. OR
   - Provision a SEPARATE production Supabase project (NOT `riwipywgqobrulyzrzad`
     unless fully re-provisioned) with migrations 0001–0033 + `mapper_basement` seed +
     0032/0033 views + all secrets BEFORE switching.
2. **Set the two env vars** on the `pinguino-intelligence` Vercel project, **scoped to
   the Production environment** (copy them verbatim from the `pinguino-staging` project
   to use tunab): `VITE_SUPABASE_URL = https://tunabqqrwabacxjcxxkz.supabase.co` and
   `VITE_SUPABASE_ANON_KEY = <the staging anon key>`.
3. **Redeploy production** (env vars bake at build time — an existing build will not
   pick them up). Confirm the new bundle inlines the Supabase URL, then run the
   verification above.

Verification after: the served production bundle contains `tunabqqrwabacxjcxxkz.supabase.co`
and the catalogue search returns real `PI-ING-*` results on `pinguinoai.com`.
Redeploy required: **YES**.

---

## PI-INFRA-002 — `mcp__supabase__` connector points at a non-staging project

- **ID:** PI-INFRA-002
- **Date:** 2026-07-21
- **Priority:** P1 (latent safety hazard — no incident)
- **Status:** `OPEN` (mitigation active)

### Finding (PROVEN)
There are two Supabase MCP connectors in this session:
- `mcp__11ad34eb…` — `list_projects` returns **only** `tunabqqrwabacxjcxxkz` (pinguino-staging). Correctly scoped to staging.
- `mcp__supabase__` — points at a project whose `public` schema has **10 tables**
  (`accepted_corrections, billing_customers, ingredients, ingredients_final_v0_95_no_npac,
  mapper_basement, product_snapshots, products, profiles, saved_recipes, subscriptions`) and
  **none** of the pro-core / entitlements / account-access tables. This is the **old
  production schema** (`riwipywgqobrulyzrzad`), i.e. the DB the prod app can't currently reach
  (see PI-P0-001), **not** staging.

### Risk
If any tooling/agent assumes `mcp__supabase__` == staging and issues a write (`apply_migration`
/ `execute_sql` INSERT/UPDATE), it hits **production**. The standing rule is NEVER write to
`riwipywgqobrulyzrzad`.

### Mitigation (in force)
All staging DB work goes through `mcp__11ad34eb…` with explicit
`project_id: tunabqqrwabacxjcxxkz`. `mcp__supabase__` is treated read-only until re-scoped.
No writes were issued to it (S2 proofs used the staging connector).

### Next action (owner/Nicolas, optional)
Re-scope or disconnect the `mcp__supabase__` connector so it cannot reach prod, or relabel it
so its target is unambiguous.
