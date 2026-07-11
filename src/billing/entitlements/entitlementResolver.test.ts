/**
 * Entitlement resolver — the §22.7 acceptance cases plus the exclusion /
 * overlap rules. Pure: fixed injected clock, no IO.
 */
import { describe, expect, it } from 'vitest';
import { resolveEntitlements, type EntitlementRow } from './entitlementResolver';

const NOW = new Date('2026-07-11T12:00:00.000Z');

let seq = 0;
const row = (overrides: Partial<EntitlementRow>): EntitlementRow => ({
  id: `ent-${++seq}`,
  scope: 'home',
  source_type: 'paid_subscription',
  source_id: `src-${seq}`,
  starts_at: '2026-07-01T00:00:00.000Z',
  ends_at: '2026-08-01T00:00:00.000Z',
  status: 'active',
  ...overrides,
});

describe('resolveEntitlements — §22.7 acceptance cases', () => {
  it('no rows (e.g. failed payment never created one) → nothing is granted', () => {
    const result = resolveEntitlements([], NOW);
    expect(result.hasHome).toBe(false);
    expect(result.hasPro).toBe(false);
    expect(result.hasPartnerMode).toBe(false);
    expect(result.home.sources).toEqual([]);
    expect(result.home.expiresAt).toBeNull();
  });

  it('a paid Home subscription grants home with its period end as expiry', () => {
    const paid = row({ scope: 'home', ends_at: '2026-08-01T00:00:00.000Z' });
    const result = resolveEntitlements([paid], NOW);
    expect(result.hasHome).toBe(true);
    expect(result.home.expiresAt).toBe('2026-08-01T00:00:00.000Z');
    expect(result.home.sources).toEqual([paid]);
  });

  it('a paid Pro subscription grants pro VERBATIM — home stays false (implication is the capability layer, not the resolver)', () => {
    const result = resolveEntitlements([row({ scope: 'pro' })], NOW);
    expect(result.hasPro).toBe(true);
    expect(result.hasHome).toBe(false);
    expect(result.hasPartnerMode).toBe(false);
  });

  it('an approved partner grants all three scopes without any Stripe object', () => {
    const rows = (['home', 'pro', 'partner'] as const).map((scope) =>
      row({
        scope,
        source_type: 'approved_partner',
        source_id: 'partner-1',
        ends_at: null,
      }),
    );
    const result = resolveEntitlements(rows, NOW);
    expect(result.hasHome).toBe(true);
    expect(result.hasPro).toBe(true);
    expect(result.hasPartnerMode).toBe(true);
    // approved-partner grants are open-ended until revoked
    expect(result.home.expiresAt).toBeNull();
    expect(result.partner.expiresAt).toBeNull();
  });

  it('an invite trial grants Home only, time-bounded', () => {
    const invite = row({
      scope: 'home',
      source_type: 'invite_home_trial',
      ends_at: '2026-08-10T00:00:00.000Z',
    });
    const result = resolveEntitlements([invite], NOW);
    expect(result.hasHome).toBe(true);
    expect(result.hasPro).toBe(false);
    expect(result.hasPartnerMode).toBe(false);
    expect(result.home.expiresAt).toBe('2026-08-10T00:00:00.000Z');
    expect(result.home.sources).toEqual([invite]);
  });

  it('overlap resolution: the longest-living active grant wins the expiry', () => {
    const short = row({ scope: 'home', ends_at: '2026-07-20T00:00:00.000Z' });
    const long = row({ scope: 'home', ends_at: '2026-09-01T00:00:00.000Z' });
    const result = resolveEntitlements([short, long], NOW);
    expect(result.hasHome).toBe(true);
    expect(result.home.expiresAt).toBe('2026-09-01T00:00:00.000Z');
    // both sources stay visible as the "why"
    expect(result.home.sources).toHaveLength(2);
  });
});

describe('resolveEntitlements — exclusion rules', () => {
  it('a revoked row grants nothing', () => {
    const result = resolveEntitlements([row({ status: 'revoked' })], NOW);
    expect(result.hasHome).toBe(false);
  });

  it('a status-expired row grants nothing', () => {
    const result = resolveEntitlements([row({ status: 'expired' })], NOW);
    expect(result.hasHome).toBe(false);
  });

  it('a clock-expired row (status still active, ends_at in the past) grants nothing', () => {
    const stale = row({ status: 'active', ends_at: '2026-07-01T00:00:00.000Z' });
    const result = resolveEntitlements([stale], NOW);
    expect(result.hasHome).toBe(false);
    expect(result.explanation.join('\n')).toContain('ended');
  });

  it('a future row (starts_at after now) grants nothing yet', () => {
    const future = row({
      starts_at: '2026-08-01T00:00:00.000Z',
      ends_at: '2026-09-01T00:00:00.000Z',
    });
    const result = resolveEntitlements([future], NOW);
    expect(result.hasHome).toBe(false);
    expect(result.explanation.join('\n')).toContain('not started');
  });

  it('an unknown future status is treated as NOT active (defensive)', () => {
    const result = resolveEntitlements([row({ status: 'pending_review' })], NOW);
    expect(result.hasHome).toBe(false);
  });

  it('boundary: ends_at exactly now is already ended; starts_at exactly now is already started', () => {
    const endsNow = row({ ends_at: NOW.toISOString() });
    const startsNow = row({
      starts_at: NOW.toISOString(),
      ends_at: '2026-08-01T00:00:00.000Z',
    });
    expect(resolveEntitlements([endsNow], NOW).hasHome).toBe(false);
    expect(resolveEntitlements([startsNow], NOW).hasHome).toBe(true);
  });
});

describe('resolveEntitlements — multi-source independence', () => {
  it('revoking one source never hides another: the admin grant keeps home alive after the subscription grant is revoked', () => {
    const revokedSub = row({ scope: 'home', status: 'revoked' });
    const adminGrant = row({
      scope: 'home',
      source_type: 'admin_grant',
      ends_at: null,
    });
    const result = resolveEntitlements([revokedSub, adminGrant], NOW);
    expect(result.hasHome).toBe(true);
    expect(result.home.sources).toEqual([adminGrant]);
    expect(result.home.expiresAt).toBeNull();
  });

  it('an open-ended source among dated ones means the scope never expires', () => {
    const dated = row({ scope: 'pro', ends_at: '2026-08-01T00:00:00.000Z' });
    const openEnded = row({
      scope: 'pro',
      source_type: 'admin_grant',
      ends_at: null,
    });
    const result = resolveEntitlements([dated, openEnded], NOW);
    expect(result.hasPro).toBe(true);
    expect(result.pro.expiresAt).toBeNull();
    expect(result.pro.sources).toHaveLength(2);
  });

  it('scopes resolve independently: pro expiring never shortens home', () => {
    const home = row({ scope: 'home', ends_at: '2026-12-01T00:00:00.000Z' });
    const pro = row({ scope: 'pro', ends_at: '2026-07-15T00:00:00.000Z' });
    const result = resolveEntitlements([home, pro], NOW);
    expect(result.home.expiresAt).toBe('2026-12-01T00:00:00.000Z');
    expect(result.pro.expiresAt).toBe('2026-07-15T00:00:00.000Z');
  });

  it('a row with an unknown scope is ignored (and named in the trail) without affecting known scopes', () => {
    const weird = row({ scope: 'enterprise' });
    const home = row({ scope: 'home' });
    const result = resolveEntitlements([weird, home], NOW);
    expect(result.hasHome).toBe(true);
    expect(result.explanation.join('\n')).toContain("unknown scope 'enterprise'");
  });

  it('the explanation trail names every considered row: granted, excluded, and the per-scope summary', () => {
    const active = row({ scope: 'home', ends_at: '2026-08-01T00:00:00.000Z' });
    const revoked = row({ scope: 'home', status: 'revoked' });
    const result = resolveEntitlements([active, revoked], NOW);
    const trail = result.explanation.join('\n');
    expect(trail).toContain(`granted home/paid_subscription#${active.id}`);
    expect(trail).toContain(`excluded home/paid_subscription#${revoked.id}`);
    expect(trail).toContain('scope home: granted by 1 source(s)');
  });
});
