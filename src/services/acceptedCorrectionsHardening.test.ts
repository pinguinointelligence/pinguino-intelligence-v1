/// <reference types="node" />
/**
 * Accepted-correction server-side tier enforcement — hardening slice guards.
 *
 * The enforcement artifacts are PROPOSAL-STAGE by design: the tier-policy SQL
 * is NOT applied and the Edge Function is NOT deployed (both are owner
 * approvals). These tests pin that state honestly and pin the security
 * invariants of the artifacts themselves, so nothing can drift or silently
 * pretend enforcement exists:
 *  - the proposal stays OUT of supabase/migrations until approved;
 *  - the Edge Function trusts ONLY the JWT (identity) and ONLY the
 *    server-written subscriptions cache (tier) — never the request body;
 *  - its draft contract is the SAME closed key set as the app's;
 *  - the live client create path is UNCHANGED (deploy-gated cutover);
 *  - the docs state the residual risk instead of overclaiming.
 *
 * Runtime behavior of the live path (anon rejected, Free rejected, owner
 * mismatch rejected, invalid drafts rejected, unknown keys rejected, no
 * update) is covered by acceptedCorrections.test.ts + acceptedCorrectionDraft
 * tests; the Deno function cannot execute under vitest, so its behavior is
 * pinned here at source level against the same shared contract.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACCEPTED_CORRECTION_DRAFT_KEYS } from '@/features/optimization/acceptedCorrectionDraft';

const ROOT = resolve(import.meta.dirname, '..', '..');
const proposalPath = join(
  ROOT,
  'docs',
  'spine',
  'proposals',
  'accepted_corrections_tier_policy.proposal.sql',
);
const functionPath = join(ROOT, 'supabase', 'functions', 'create-accepted-correction', 'index.ts');
const proposal = readFileSync(proposalPath, 'utf8');
const fn = readFileSync(functionPath, 'utf8');
const service = readFileSync(join(ROOT, 'src', 'services', 'acceptedCorrections.ts'), 'utf8');
const subscriptionSource = readFileSync(join(ROOT, 'src', 'access', 'subscription.ts'), 'utf8');
const planDoc = readFileSync(
  join(ROOT, 'docs', 'spine', 'ACCEPTED_CORRECTION_PERSISTENCE_PLAN.md'),
  'utf8',
);

describe('tier-policy proposal — exists, NOT applied, exact semantics', () => {
  it('lives OUTSIDE the live migration path and no tier migration is applied', () => {
    expect(proposalPath.includes('supabase')).toBe(false);
    const migrations = readdirSync(join(ROOT, 'supabase', 'migrations'));
    // 0003_billing_subscriptions legitimately exists; no TIER-policy migration does
    expect(migrations.some((f) => /tier/i.test(f))).toBe(false);
    // the ONLY accepted_corrections migration is still 0012 (ownership RLS)
    expect(migrations.filter((f) => /accepted_correction/i.test(f))).toEqual([
      '0012_accepted_corrections.sql',
    ]);
  });

  it('is explicitly labelled a non-applied proposal', () => {
    expect(/PROPOSAL — NOT APPLIED/.test(proposal)).toBe(true);
    expect(/MUST NOT be applied/.test(proposal)).toBe(true);
  });

  it('option A checks the server-written subscriptions cache with planFromSubscription semantics', () => {
    expect(/from public\.subscriptions s/.test(proposal)).toBe(true);
    expect(/s\.user_id = auth\.uid\(\)/.test(proposal)).toBe(true);
    expect(/'active', 'trialing'/.test(proposal)).toBe(true);
    expect(/past_due/.test(proposal)).toBe(true);
    expect(/current_period_end > now\(\)/.test(proposal)).toBe(true);
    // ownership stays: the tier check is IN ADDITION to owner-scoped insert
    expect(/auth\.uid\(\) = user_id/.test(proposal)).toBe(true);
    expect(/auth\.uid\(\) = created_by/.test(proposal)).toBe(true);
  });

  it('option A also pins an optional recipe link to the CALLER\'S OWN saved recipe', () => {
    expect(/recipe_id is null/.test(proposal)).toBe(true);
    expect(/from public\.saved_recipes r/.test(proposal)).toBe(true);
    expect(/r\.user_id = auth\.uid\(\)/.test(proposal)).toBe(true);
  });

  it('carries rollback for both options and the option-B revocation', () => {
    expect(/OPTION A ROLLBACK/.test(proposal)).toBe(true);
    expect(/OPTION B ROLLBACK/.test(proposal)).toBe(true);
    expect(/revoke insert on table public\.accepted_corrections from authenticated/.test(proposal)).toBe(
      true,
    );
  });

  it('status literals stay in lockstep with the pure planFromSubscription mapping', () => {
    for (const status of ["'active'", "'trialing'", "'past_due'"]) {
      expect(subscriptionSource.includes(status), `${status} in subscription.ts`).toBe(true);
      expect(proposal.includes(status.replaceAll("'", "'")), `${status} in proposal`).toBe(true);
    }
  });

  it('never touches Mapper tables or product PAC/POD columns', () => {
    expect(/mapper_basement|update public\.products|alter table public\.products/i.test(proposal)).toBe(
      false,
    );
  });
});

describe('Edge Function source — NOT deployed, trusts only JWT + server-written tier', () => {
  it('exists under supabase/functions and is labelled NOT DEPLOYED', () => {
    expect(existsSync(functionPath)).toBe(true);
    expect(/NOT DEPLOYED/.test(fn)).toBe(true);
  });

  it('identity comes only from the verified JWT — anon rejected', () => {
    expect(/auth\.getUser\(\)/.test(fn)).toBe(true);
    expect(/sign_in_required/.test(fn)).toBe(true);
    // the insert row's identity columns are FORCED from the JWT user
    expect(/user_id: user\.id/.test(fn)).toBe(true);
    expect(/created_by: user\.id/.test(fn)).toBe(true);
    // ...and never taken from the request body
    expect(/user_id:\s*d\./.test(fn)).toBe(false);
    expect(/created_by:\s*d\./.test(fn)).toBe(false);
  });

  it('tier comes only from the subscriptions cache — no client-provided tier field exists', () => {
    expect(/\.from\('subscriptions'\)/.test(fn)).toBe(true);
    expect(/subscription_status/.test(fn)).toBe(true);
    // no body-supplied plan/tier/pro flag is even read
    expect(/d\.(plan|tier|isPro|pro)\b/.test(fn)).toBe(false);
    expect(/exactCorrectionGrams/.test(fn)).toBe(false);
    expect(/pro_required/.test(fn)).toBe(true);
  });

  it('mirrors planFromSubscription statuses exactly (active | trialing | past_due grace)', () => {
    expect(/'active'/.test(fn)).toBe(true);
    expect(/'trialing'/.test(fn)).toBe(true);
    expect(/'past_due'/.test(fn)).toBe(true);
    expect(/current_period_end/.test(fn)).toBe(true);
  });

  it('duplicated closed key set is EQUAL to ACCEPTED_CORRECTION_DRAFT_KEYS', () => {
    const match = fn.match(/const DRAFT_KEYS = \[([\s\S]*?)\] as const/);
    expect(match).not.toBeNull();
    const body = match?.[1] ?? '';
    const keys = [...body.matchAll(/'([a-zA-Z]+)'/g)].map((m) => m[1] ?? '');
    expect(keys).toEqual([...ACCEPTED_CORRECTION_DRAFT_KEYS]);
  });

  it('uses the same rejection vocabulary as the app validator', () => {
    for (const literal of [
      'unexpected_key:',
      'missing_key:',
      'decision_not_saveable',
      'invalid_target_mode',
      'no_correction_actions',
      'source_recipe_hash_mismatch',
    ]) {
      expect(fn.includes(literal), literal).toBe(true);
    }
    // FNV-1a recomputation is really there (both magic constants)
    expect(fn.includes('0x811c9dc5')).toBe(true);
    expect(fn.includes('0x01000193')).toBe(true);
  });

  it('write-once: no update path of any kind', () => {
    expect(fn.includes('.update(')).toBe(false);
    expect(fn.includes('.upsert(')).toBe(false);
    expect(fn.includes('.delete(')).toBe(false);
  });

  it('touches exactly three tables — two read-own checks and the ONE insert', () => {
    const tables = [...fn.matchAll(/\.from\('([a-z_]+)'\)/g)].map((m) => m[1]).sort();
    expect([...new Set(tables)]).toEqual(['accepted_corrections', 'saved_recipes', 'subscriptions']);
    // the saved_recipes touch is a read-own recipe-link check, never a write
    expect(/from\('saved_recipes'\)\s*\.select\('id'\)/.test(fn.replace(/\s+/g, ' '))).toBe(true);
    expect(/recipe_not_owned/.test(fn)).toBe(true);
    // forbidden names checked in CODE only (the header comment may honestly
    // NAME what is never touched — same strip convention as the purity scans)
    const code = fn.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(/mapper_basement|inventory|pi_calculated|pac_value|pod_value/.test(code)).toBe(false);
    expect(/\.from\('products'\)/.test(code)).toBe(false);
    // the ONLY insert target is accepted_corrections
    const inserts = [...code.matchAll(/\.from\('([a-z_]+)'\)\s*\.insert\(/g)].map((m) => m[1]);
    expect(inserts).toEqual(['accepted_corrections']);
  });
});

describe('live create path — unchanged until deploy approval (no fake enforcement)', () => {
  it('the service still inserts directly and does NOT invoke the function', () => {
    expect(service.includes('functions.invoke')).toBe(false);
    expect(service.includes('.insert(draftToRow(draft))')).toBe(true);
  });

  it('the Studio control still uses the service create (no function wiring)', () => {
    const control = readFileSync(
      join(ROOT, 'src', 'features', 'optimization', 'SaveCorrectionControl.tsx'),
      'utf8',
    );
    expect(control.includes('createAcceptedCorrection')).toBe(true);
    expect(control.includes('functions.invoke')).toBe(false);
  });

  it('docs state the residual risk while the proposal is unapplied — no overclaim', () => {
    expect(/tier is still enforced client\/service-side/.test(planDoc)).toBe(true);
    expect(/NOT deployed/.test(planDoc)).toBe(true);
    expect(/not applied/i.test(planDoc)).toBe(true);
  });
});
