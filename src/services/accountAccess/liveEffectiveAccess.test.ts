/**
 * Live account-access sync — the runtime entitlements → EffectiveAccess bridge that
 * makes Home and Pro two different products (owner P0 2026-07-18).
 *
 * Covers the PURE derivation (home vs pro vs demo, expired/revoked exclusion), the
 * defensive row parser (junk never fabricates a grant), and the fetch adapter over a
 * fake Supabase client (success / query error / bad-row dropping). vitest is node-env,
 * so the IO adapter is exercised with an injected fake client — no live backend.
 */
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EntitlementRow } from '@/billing/entitlements/entitlementResolver';
import {
  deriveEffectiveAccess,
  fetchActiveEntitlementRows,
  parseEntitlementRow,
} from './liveEffectiveAccess';

const NOW = '2026-07-18T12:00:00.000Z';

const row = (over: Partial<EntitlementRow>): EntitlementRow => ({
  id: 'ent-1',
  scope: 'home',
  source_type: 'paid_subscription',
  source_id: 'sub-1',
  starts_at: '2026-01-01T00:00:00.000Z',
  ends_at: null,
  status: 'active',
  ...over,
});

/* ------------------------------------------------------------------ */
/* Pure derivation                                                     */
/* ------------------------------------------------------------------ */

describe('deriveEffectiveAccess — entitlement rows drive Home vs Pro', () => {
  const derive = (rows: EntitlementRow[]) =>
    deriveEffectiveAccess({ userId: 'user-1', email: 'a@b.com', entitlementRows: rows, now: NOW });

  it('no rows → demo (canHome/canPro both false), but signed-in can save', () => {
    const access = derive([]);
    expect(access.canHome).toBe(false);
    expect(access.canPro).toBe(false);
    expect(access.exactGrams).toBe(false);
    expect(access.saveRecipes).toBe(true); // signed-in + active account
  });

  it('an active home grant → canHome only (Home is NOT Pro)', () => {
    const access = derive([row({ scope: 'home' })]);
    expect(access.canHome).toBe(true);
    expect(access.canPro).toBe(false);
    expect(access.exactGrams).toBe(false); // exactGrams is Pro-only in EffectiveAccess
    expect(access.professionalScaling).toBe(false);
    expect(access.allowedModes).toContain('home');
    expect(access.allowedModes).not.toContain('pro');
  });

  it('an active pro grant → canPro (+ exact grams + professional scaling)', () => {
    const access = derive([row({ id: 'ent-pro', scope: 'pro' })]);
    expect(access.canPro).toBe(true);
    expect(access.exactGrams).toBe(true);
    expect(access.professionalScaling).toBe(true);
    expect(access.allowedModes).toContain('pro');
  });

  it('holding both home and pro grants resolves to pro-capable (Pro wins downstream)', () => {
    const access = derive([row({ scope: 'home' }), row({ id: 'ent-pro', scope: 'pro' })]);
    expect(access.canHome).toBe(true);
    expect(access.canPro).toBe(true);
  });

  it('a revoked or expired row does NOT grant its scope', () => {
    expect(derive([row({ scope: 'pro', status: 'revoked' })]).canPro).toBe(false);
    expect(
      derive([row({ scope: 'pro', status: 'active', ends_at: '2026-06-01T00:00:00.000Z' })]).canPro,
    ).toBe(false); // ended before NOW
    expect(
      derive([row({ scope: 'home', status: 'active', starts_at: '2026-12-01T00:00:00.000Z' })])
        .canHome,
    ).toBe(false); // not yet started
  });

  it('an admin_grant home row (the QA provisioning path) grants Home without any Stripe', () => {
    const access = derive([row({ scope: 'home', source_type: 'admin_grant', source_id: 'admin-1' })]);
    expect(access.canHome).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Defensive row parser                                                */
/* ------------------------------------------------------------------ */

describe('parseEntitlementRow — junk never fabricates a grant', () => {
  it('accepts a well-formed row verbatim', () => {
    const r = row({});
    expect(parseEntitlementRow({ ...r })).toEqual(r);
  });

  it('drops rows missing required fields (→ null, never a partial grant)', () => {
    expect(parseEntitlementRow(null)).toBeNull();
    expect(parseEntitlementRow('nope')).toBeNull();
    expect(parseEntitlementRow({})).toBeNull();
    expect(parseEntitlementRow({ ...row({}), id: '' })).toBeNull();
    expect(parseEntitlementRow({ ...row({}), scope: 123 })).toBeNull();
    expect(parseEntitlementRow({ ...row({}), starts_at: undefined })).toBeNull();
    expect(parseEntitlementRow({ ...row({}), ends_at: 5 })).toBeNull(); // wrong type
  });

  it('preserves a null ends_at (open-ended grant)', () => {
    expect(parseEntitlementRow({ ...row({}), ends_at: null })?.ends_at).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Fetch adapter (fake client)                                         */
/* ------------------------------------------------------------------ */

/** Minimal chainable fake of the Supabase query builder used by the adapter. */
function fakeClient(result: { data: unknown[] | null; error: { message: string } | null }) {
  const eqUser = vi.fn();
  const eqStatus = vi.fn().mockResolvedValue(result);
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn((col: string) => {
      if (col === 'user_id') {
        eqUser(col);
        return builder;
      }
      eqStatus(col);
      return Promise.resolve(result);
    }),
  };
  const from = vi.fn(() => builder);
  return { client: { from } as unknown as Pick<SupabaseClient, 'from'>, from, builder };
}

describe('fetchActiveEntitlementRows — reads own rows, drops junk, throws on error', () => {
  it('queries the entitlements table scoped to the user and active status', async () => {
    const { client, from, builder } = fakeClient({ data: [row({ scope: 'pro' })], error: null });
    const rows = await fetchActiveEntitlementRows(client, 'user-42');
    expect(from).toHaveBeenCalledWith('entitlements');
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-42');
    expect(builder.eq).toHaveBeenCalledWith('status', 'active');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.scope).toBe('pro');
  });

  it('silently drops malformed rows in the result set', async () => {
    const { client } = fakeClient({
      data: [row({ scope: 'home' }), { id: '', broken: true }, null],
      error: null,
    });
    const rows = await fetchActiveEntitlementRows(client, 'user-42');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.scope).toBe('home');
  });

  it('treats a null data set as no rows', async () => {
    const { client } = fakeClient({ data: null, error: null });
    expect(await fetchActiveEntitlementRows(client, 'user-42')).toEqual([]);
  });

  it('throws on a query error so the caller can fail safe to demo', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'rls denied' } });
    await expect(fetchActiveEntitlementRows(client, 'user-42')).rejects.toThrow('rls denied');
  });
});
