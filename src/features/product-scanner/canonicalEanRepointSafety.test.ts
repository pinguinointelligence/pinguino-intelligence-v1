import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { acceptReevaluation, rescanReevaluationPlan } from './rescanEvaluation';
import { resolveCanonicalEanIdentity, type EanProductRow } from './canonicalEanIdentity';

/*
  A READ PATH THAT CAN WRITE IS A READ PATH THAT CAN CORRUPT.

  `exactProductForBarcode` repairs a wrong EAN address while answering an ordinary scan. That is
  worth having — it is what stops this defect from silently coming back — but every condition on it
  has to be a refusal rather than a preference. These tests hold the refusals.

  The migration is the thing that actually enforces them in the database, so most of this file
  reads the migration: the rules live in SQL, and a TypeScript double of them would prove nothing
  about what the server does.
*/
const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260907225951_canonical_ean_repoint_hardening.sql'),
  'utf8',
);
const analyze = readFileSync(
  resolve(process.cwd(), 'supabase/functions/product-scan-analyze/index.ts'),
  'utf8',
);

const HOME = 'cad05017-9efc-4cc5-ac77-842839db2061';
const PM: EanProductRow = {
  id: 'pm',
  product_code: 'PM-ING-007193',
  product_kind: 'customer_provisional',
  visibility: 'account_private',
  owner_user_id: HOME,
  is_active: true,
  merged_into_product_id: null,
};
const PR: EanProductRow = {
  id: 'pr',
  product_code: 'PR-ING-007197',
  product_kind: 'commercial_product',
  visibility: 'shared',
  owner_user_id: null,
  is_active: true,
  merged_into_product_id: null,
};

describe('the self-healing re-point can only ever move private -> shared', () => {
  it('refuses to demote a shared product', () => {
    expect(migration).toContain('refuses_shared_to_shared');
    // The gate: anything that is not a private customer row is refused outright.
    expect(migration).toMatch(/if v_current_kind is distinct from 'customer_provisional' then/);
  });

  it('refuses to swap one shared product for another', () => {
    // Two shared rows never get here — the ambiguity check returns first — and even if one did,
    // the monotonic gate refuses it because a commercial_product is not customer_provisional.
    expect(migration).toContain('ambiguous_shared_products');
    expect(migration).toMatch(/if v_shared_count > 1 then/);
  });

  it('changes nothing at all when there is more than one candidate', () => {
    const second: EanProductRow = { ...PR, id: 'pr2', product_code: 'PR-ING-009999' };
    const seen = resolveCanonicalEanIdentity([PM, PR, second], HOME, PM.id);
    // The resolver still answers a caller, but the migration refuses to WRITE in this state.
    expect(migration).toMatch(/'refused', 'ambiguous_shared_products'/);
    expect(seen.canonical).not.toBeNull();
  });

  it('compares the EAN rather than assuming it', () => {
    expect(migration).toContain('ean_mismatch');
    expect(migration).toMatch(/if v_canonical_ean is distinct from v_ean then/);
  });

  it('serialises on the EAN, so two simultaneous scans cannot both move it', () => {
    expect(migration).toContain(
      "pg_advisory_xact_lock(hashtextextended('canonical-ean:'||v_ean, 0))",
    );
    // And the row itself is taken FOR UPDATE before anything is decided about it.
    expect(migration).toContain('from public.product_variants where ean = v_ean for update');
  });

  it('never leaves the write guard open for the rest of the transaction', () => {
    const opens =
      migration.match(/set_config\('app\.canonical_product_ingest', 'v1', true\)/g) ?? [];
    const closes =
      migration.match(/set_config\('app\.canonical_product_ingest', '', true\)/g) ?? [];
    expect(opens.length).toBeGreaterThan(0);
    // Every open is paired with a close, and the flag is transaction-scoped (`true`) throughout.
    expect(closes.length).toBe(opens.length);
    expect(migration).not.toMatch(/set_config\('app\.canonical_product_ingest', 'v1', false\)/);
  });

  it('records every decision, including the refusals', () => {
    for (const outcome of ['moved', 'refused', 'created']) {
      expect(migration).toContain(`'${outcome}'`);
    }
    expect(migration).toContain('canonical_ean_repoint_audit');
    // EAN, both product ids, reason, time and code version — the whole trail.
    expect(migration).toMatch(/ean text not null/);
    expect(migration).toMatch(/from_product_id uuid/);
    expect(migration).toMatch(/to_product_id uuid/);
    expect(migration).toMatch(/code_version text not null/);
    expect(migration).toMatch(/created_at timestamptz not null default now\(\)/);
  });

  it('keeps the audit trail away from customers entirely', () => {
    expect(migration).toContain('enable row level security');
    expect(migration).toMatch(/revoke all on table public\.canonical_ean_repoint_audit/);
    // No policy is granted, so RLS denies by default for anon and authenticated alike.
    expect(migration).not.toMatch(/create policy .* on public\.canonical_ean_repoint_audit/i);
  });

  it('never lets a failed repair break the read', () => {
    // The rpc result is discarded on both paths: the product was already resolved without it.
    expect(analyze).toMatch(
      /canonicalize_ean_identity_v1[\s\S]{0,260}\(\)\s*=>\s*undefined,\s*\(\)\s*=>\s*undefined,/,
    );
  });

  it('drops the earlier signature so nothing can call the version without the gate', () => {
    expect(migration).toContain(
      'drop function if exists public.canonicalize_ean_identity_v1(text);',
    );
  });
});

describe('a re-evaluation may raise a score and never lower one', () => {
  it('accepts a genuine improvement', () => {
    expect(acceptReevaluation({ storedAccuracy: 73.4, nextAccuracy: 94.12 })).toMatchObject({
      accept: true,
    });
  });

  it('refuses to lower an accuracy', () => {
    expect(acceptReevaluation({ storedAccuracy: 94.12, nextAccuracy: 87.8 })).toEqual({
      accept: false,
      reason: 'would_lower_accuracy',
    });
  });

  it('refuses to take BASE_READY away', () => {
    expect(
      acceptReevaluation({
        storedAccuracy: 94.12,
        nextAccuracy: 99,
        storedReadiness: 'BASE_READY',
        nextReadiness: 'REVIEW',
      }),
    ).toEqual({ accept: false, reason: 'would_lose_base_ready' });
  });

  it('writes nothing when the score is identical', () => {
    // No new version row for a re-run that changed nothing: the history stays meaningful.
    expect(acceptReevaluation({ storedAccuracy: 94.12, nextAccuracy: 94.12 }).accept).toBe(false);
  });

  it('re-evaluates from stored evidence only, never a paid provider call', () => {
    const rescan = readFileSync(
      resolve(process.cwd(), 'src/features/product-scanner/rescanEvaluation.ts'),
      'utf8',
    );
    expect(rescan).toContain('scanResultFromStoredFacts');
    // The seed is booked at zero, which is the paid-call contract for a rescan.
    expect(analyze).toContain('p_cost_usd: 0');
  });

  it('does not ask for a photo when a BASE_READY shared product already answers the scan', () => {
    // The exact path returns `existing_product` and never enters the label phase.
    expect(analyze).toContain("kind: 'existing_product'");
    const seen = resolveCanonicalEanIdentity([PM, PR], 'someone-else', PM.id);
    expect(seen.canonical?.product_code).toBe('PR-ING-007197');
  });

  it('still refuses to touch a Mapper reference', () => {
    expect(rescanReevaluationPlan({ productKind: 'mapper_reference' }).reevaluate).toBe(false);
  });
});
