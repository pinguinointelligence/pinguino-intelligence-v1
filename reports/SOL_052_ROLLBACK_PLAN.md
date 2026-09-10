# SOL-052 rollback plan

This plan is prepared against the read-only deployment inventory captured on 2026-09-08. The
shared Supabase project is `tunabqqrwabacxjcxxkz`; running any deploy command below requires a
separate approval.

## Edge Function sources

| Function                | Active version | Active bundle hash                                                 | Exact rollback source                                                                                                          |
| ----------------------- | -------------: | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `product-scan-analyze`  |             31 | `8e6514a21505dedd51521b8468a6cb902ddf43ae01e042e6fc88cf7a6c868085` | all relative sources from `f05ae4550289df58b0da7483ff255338f085b36c`                                                           |
| `product-scan-finalize` |             46 | `252af432bbb7adba6b39d474eb2be1450fa8a3836c702aed1a0657350c3782d9` | `f05ae4550289df58b0da7483ff255338f085b36c`, except `_shared/productScanner.ts` from `174de7e1ce7aad3259255ad5fb66573a5d25cc98` |

The finalizer is a deployed hybrid; a checkout of one Git SHA is not an exact rollback bundle.
Before backend activation, retain the complete bundles returned by the Supabase Management API in
the incident artefact store and verify the version, hash and `verify_jwt=true` metadata.

A local reconstruction rehearsal uses a fresh temporary directory, then overlays the one hybrid
dependency:

```bash
git archive f05ae4550289df58b0da7483ff255338f085b36c -- supabase/functions src \
  | tar -xf - -C /private/tmp/sol052-edge-rollback
git archive 174de7e1ce7aad3259255ad5fb66573a5d25cc98 \
  -- supabase/functions/_shared/productScanner.ts \
  | tar -xf - -C /private/tmp/sol052-edge-rollback
```

After reconstructing those exact source trees, the restore commands are:

```bash
SUPABASE_TELEMETRY_DISABLED=1 supabase functions deploy product-scan-analyze \
  --project-ref tunabqqrwabacxjcxxkz --use-api
SUPABASE_TELEMETRY_DISABLED=1 supabase functions deploy product-scan-finalize \
  --project-ref tunabqqrwabacxjcxxkz --use-api
```

Do not pass `--no-verify-jwt`; both active functions require JWT verification.

## Database definitions

Before activation, capture `pg_get_functiondef`, owner, ACL and `proconfig` for:

- `gellatti_upsert_customer_added_product_v1(uuid,uuid,text,jsonb,jsonb,jsonb,jsonb)`;
- `resolve_exact_products_by_gtin_v1(text,text)`;
- `search_products_v1(text,text,text,text[],boolean,text,text,integer,integer,jsonb)`;
- `canonicalize_ean_identity_v1(text,uuid)`.

The executable inverse is
`supabase/rollbacks/20260908101050_sol_052_publication_eligibility.rollback.sql`. It restores all
four definitions before dropping the two SOL-052 helpers. It is transactional and safe to retry.
It cannot undo requests executed while the new definitions were active; snapshot the affected
`products`, `product_versions`, `product_variants`, `customer_added_products`,
`customer_added_product_accounts`, `product_scan_sessions` and `canonical_ean_repoint_audit` rows
at the activation boundary.

## Local drill

The forward migration and inverse rollback are exercised against in-memory PostgreSQL by:

```bash
npx --yes deno run --no-lock --allow-read --node-modules-dir=auto \
  scripts/verifySol052MigrationRollback.ts
```

The drill asserts: first apply, second apply is a no-op, nested/flat/blocked helper behavior,
byte-equivalent restoration of all four RPC definitions, and a second rollback as a no-op.

For the Edge rollback rehearsal, run a Deno module-load smoke against the reconstructed directory
with a temporary import map (`"@/": "./src/"`) and a stubbed `Deno.serve`. This parses and loads the
exact historical dependency graphs without opening a listener or calling Supabase. The active
historical finalizer has three pre-existing strict type errors under Deno 2.9, so exact rollback is
validated by its active deployed hash plus the successful `--no-check` module-load drill; the new
SOL-052 functions themselves must pass strict `deno check`.
