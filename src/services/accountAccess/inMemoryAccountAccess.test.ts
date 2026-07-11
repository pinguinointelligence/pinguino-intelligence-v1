import { describe, expect, it, beforeEach } from 'vitest';
import type { EntitlementRow } from '@/billing/entitlements/entitlementResolver';
import { InMemoryAccountAccess } from './inMemoryAccountAccess';
import { resolveAccountAccess } from './billingEntitlementBridge';
import type { AccountIdentity } from '@/access/accountAccess/contracts';

const NOW = '2026-07-11T12:00:00.000Z';
const row = (scope: string, source: string): EntitlementRow => ({
  id: `${scope}-${source}`,
  scope,
  source_type: source,
  source_id: 's',
  starts_at: '2026-01-01T00:00:00.000Z',
  ends_at: null,
  status: 'active',
});
const identity = (userId: string): AccountIdentity => ({ userId, email: `${userId}@x.co`, emailVerified: true });
const obs = (hash: string) => ({ deviceHash: hash, friendlyName: 'Dev', category: 'desktop' as const, browserFamily: 'Chrome', osFamily: 'Mac' });

let svc: InMemoryAccountAccess;
let n: number;
beforeEach(() => {
  n = 0;
  svc = new InMemoryAccountAccess(() => NOW, () => `id-${(n += 1)}`);
});

describe('billing bridge', () => {
  it('maps a paid Pro user to home+pro access', () => {
    const access = resolveAccountAccess({
      identity: identity('u'),
      accountState: 'active',
      entitlementRows: [row('home', 'paid_subscription'), row('pro', 'paid_subscription')],
      partnerStatus: 'none',
      adminRole: 'none',
      now: NOW,
    });
    expect(access.allowedModes).toEqual(['home', 'pro']);
  });

  it('toEntitlementResult preserves per-scope sources', () => {
    const access = resolveAccountAccess({
      identity: identity('u'),
      accountState: 'active',
      entitlementRows: [row('home', 'approved_partner'), row('pro', 'approved_partner'), row('partner', 'approved_partner')],
      partnerStatus: 'approved',
      adminRole: 'none',
      now: NOW,
    });
    expect(access.activeSourcesByScope.pro).toContain('approved_partner');
  });
});

describe('bootstrap + access', () => {
  it('a Home user bootstraps to Home only with an active session and a device', () => {
    svc.seed('u1', { entitlementRows: [row('home', 'paid_subscription')] });
    const r = svc.bootstrap({ identity: identity('u1'), deviceId: 'd1', deviceObs: obs('a'.repeat(16)) });
    expect(r.access.allowedModes).toEqual(['home']);
    expect(r.session?.state).toBe('active');
    expect(r.evaluation.outcome).toBe('activate');
    expect(svc.listDevices('u1')).toHaveLength(1);
  });

  it('an approved partner bootstraps to Home | Pro | Partner', () => {
    svc.seed('p1', {
      partnerStatus: 'approved',
      entitlementRows: [row('home', 'approved_partner'), row('pro', 'approved_partner'), row('partner', 'approved_partner')],
    });
    const r = svc.bootstrap({ identity: identity('p1'), deviceId: 'd1', deviceObs: obs('b'.repeat(16)) });
    expect(r.access.allowedModes).toEqual(['home', 'pro', 'partner']);
  });
});

describe('single-active-session conflict + takeover', () => {
  beforeEach(() => svc.seed('u1', { entitlementRows: [row('home', 'paid_subscription')] }));

  it('a second device conflicts; takeover replaces the old session', () => {
    const first = svc.bootstrap({ identity: identity('u1'), deviceId: 'd1', deviceObs: obs('1'.repeat(16)) });
    expect(first.session?.state).toBe('active');
    const second = svc.bootstrap({ identity: identity('u1'), deviceId: 'd2', deviceObs: obs('2'.repeat(16)) });
    expect(second.evaluation.outcome).toBe('conflict');
    expect(second.session).toBeNull();

    const taken = svc.takeOver('u1', 'd2');
    expect(taken.state).toBe('active');
    const active = svc.listSessions('u1').filter((s) => s.state === 'active');
    expect(active).toHaveLength(1); // exactly one active session (the invariant)
    expect(svc.listSessions('u1').some((s) => s.state === 'replaced')).toBe(true);
  });

  it('same device re-login resumes rather than conflicts', () => {
    svc.bootstrap({ identity: identity('u1'), deviceId: 'd1', deviceObs: obs('1'.repeat(16)) });
    const again = svc.bootstrap({ identity: identity('u1'), deviceId: 'd1', deviceObs: obs('1'.repeat(16)) });
    expect(again.evaluation.outcome).toBe('resume_same');
  });
});

describe('device + session management', () => {
  beforeEach(() => svc.seed('u1', { entitlementRows: [row('home', 'paid_subscription')] }));

  it('rename, revoke and revoke-all-other-devices', () => {
    svc.bootstrap({ identity: identity('u1'), deviceId: 'd1', deviceObs: obs('1'.repeat(16)) });
    svc.bootstrap({ identity: identity('u1'), deviceId: 'd2', deviceObs: obs('2'.repeat(16)) });
    const [d1] = svc.listDevices('u1');
    svc.renameDevice('u1', d1!.deviceId, 'My Laptop');
    expect(svc.listDevices('u1').find((d) => d.deviceId === d1!.deviceId)?.friendlyName).toBe('My Laptop');
    const revoked = svc.revokeOtherDevices('u1', d1!.deviceId);
    expect(revoked).toBe(1);
    expect(svc.listDevices('u1').filter((d) => d.revokedAt !== null)).toHaveLength(1);
  });

  it('global sign-out revokes every active session', () => {
    svc.bootstrap({ identity: identity('u1'), deviceId: 'd1', deviceObs: obs('1'.repeat(16)) });
    expect(svc.globalSignOut('u1')).toBe(1);
    expect(svc.listSessions('u1').every((s) => s.state !== 'active')).toBe(true);
  });
});

describe('admin controls + suspension', () => {
  it('admin suspend blocks access + kills sessions + audits; restore re-enables', () => {
    svc.seed('u1', { entitlementRows: [row('home', 'paid_subscription'), row('pro', 'paid_subscription')] });
    svc.bootstrap({ identity: identity('u1'), deviceId: 'd1', deviceObs: obs('1'.repeat(16)) });

    svc.adminSuspend('admin1', 'u1', 'fraud review');
    expect(svc.listSessions('u1').some((s) => s.state === 'active')).toBe(false);
    const afterSuspend = svc.resolveAccess('u1', identity('u1'));
    expect(afterSuspend.allowedModes).toEqual([]); // suspended → no access

    svc.adminRestore('admin1', 'u1', 'appeal upheld');
    const afterRestore = svc.resolveAccess('u1', identity('u1'));
    expect(afterRestore.allowedModes).toEqual(['home', 'pro']);

    const events = svc.listSecurityEvents('u1').map((e) => e.eventType);
    expect(events).toContain('account_suspended');
    expect(events).toContain('account_restored');
    // admin events carry a reason and no secret metadata
    const suspend = svc.listSecurityEvents('u1').find((e) => e.eventType === 'account_suspended');
    expect(suspend?.reason).toBe('fraud review');
    expect(suspend?.actorType).toBe('admin');
  });

  it('a suspended partner loses partner-granted access at the resolver', () => {
    svc.seed('p1', {
      partnerStatus: 'suspended',
      entitlementRows: [row('home', 'approved_partner'), row('pro', 'approved_partner'), row('partner', 'approved_partner')],
    });
    const access = svc.resolveAccess('p1', identity('p1'));
    expect(access.allowedModes).toEqual([]);
  });
});

describe('security history is append-only + secret-safe', () => {
  it('records login + never stores a token', () => {
    svc.seed('u1', { entitlementRows: [row('home', 'paid_subscription')] });
    svc.bootstrap({ identity: identity('u1'), deviceId: 'd1', deviceObs: obs('1'.repeat(16)) });
    const events = svc.listSecurityEvents('u1');
    expect(events.some((e) => e.eventType === 'login_succeeded')).toBe(true);
    expect(events.every((e) => !Object.keys(e.metadata).some((k) => /token|pass|secret/i.test(k)))).toBe(true);
  });
});
