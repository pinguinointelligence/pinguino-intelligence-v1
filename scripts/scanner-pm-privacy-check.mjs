/**
 * PM privacy, checked as the customer — not as a policy reading.
 *
 * A private product (`PM-ING-*`, `visibility='account_private'`) must be readable by its owner and
 * by nobody else. This signs in as two repository-owned QA accounts and asks the database the same
 * questions the app asks: the owner's own list, and a direct read of the other account's row.
 *
 * Read-only. It writes nothing and deletes nothing.
 *
 *   GELLATTI_STAGING_ANON_KEY=<anon> node scripts/scanner-pm-privacy-check.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const REF = 'tunabqqrwabacxjcxxkz';
const URL = `https://${REF}.supabase.co`;
const ANON = process.env.GELLATTI_STAGING_ANON_KEY;
if (!ANON) throw new Error('GELLATTI_STAGING_ANON_KEY is required');
const password = /const FIXED_PASSWORD = '([^']+)'/.exec(
  readFileSync(resolve('scripts/seed-staging-admin.mjs'), 'utf8'),
)?.[1];
if (!password) throw new Error('repository staging fixture password missing');

/** the owner's two evidence records from the 2026-09-07 regression */
const OWNED = ['PM-ING-007193', 'PM-ING-007194'];

async function as(email) {
  const client = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`sign-in failed for ${email}`);
  return { client, userId: data.user.id };
}

const report = {};
for (const email of ['home@home.com', 'pro@pro.com']) {
  const { client, userId } = await as(email);
  const { data: rows } = await client
    .from('products')
    .select('product_code,visibility,owning_account_id')
    .in('product_code', OWNED);
  const { data: unverified } = await client.rpc('gellatti_my_unverified_products_v1');
  report[email] = {
    userId,
    visibleEvidenceRows: (rows ?? []).map((r) => r.product_code).sort(),
    unverifiedListSize: Array.isArray(unverified) ? unverified.length : null,
  };
}

const home = report['home@home.com'];
const pro = report['pro@pro.com'];
const ok = home.visibleEvidenceRows.length === OWNED.length && pro.visibleEvidenceRows.length === 0;
console.log(
  JSON.stringify(
    { verdict: { ownerSeesBoth: home.visibleEvidenceRows.length === 2, crossAccountVisible: pro.visibleEvidenceRows.length }, report },
    null,
    2,
  ),
);
process.exit(ok ? 0 : 1);
