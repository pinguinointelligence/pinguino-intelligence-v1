import { describe, expect, it } from 'vitest';
import { resolveEffectiveAccess } from './effectiveAccess';
import { canEnterMode, defaultMode, resolvePersistedMode } from './modeResolver';
import type {
  AccountState,
  AdminRole,
  EffectiveAccessInput,
  EntitlementResultLike,
  PartnerStatus,
} from './contracts';

const ent = (over: Partial<EntitlementResultLike> = {}): EntitlementResultLike => ({
  hasHome: false,
  hasPro: false,
  hasPartnerMode: false,
  sourcesByScope: {},
  explanation: [],
  ...over,
});

const input = (over: Partial<EffectiveAccessInput> = {}): EffectiveAccessInput => ({
  identity: { userId: 'u1', email: 'a@b.c', emailVerified: true },
  accountState: 'active' as AccountState,
  entitlements: ent(),
  partnerStatus: 'none' as PartnerStatus,
  adminRole: 'none' as AdminRole,
  ...over,
});

describe('resolveEffectiveAccess — entitlement scenarios', () => {
  it('a Home subscription grants Home only', () => {
    const a = resolveEffectiveAccess(
      input({ entitlements: ent({ hasHome: true, sourcesByScope: { home: ['paid_subscription'] } }) }),
    );
    expect([a.canHome, a.canPro, a.canPartner, a.canAdmin]).toEqual([true, false, false, false]);
    expect(a.allowedModes).toEqual(['home']);
  });

  it('a Pro subscription grants Pro (exact grams + professional scaling)', () => {
    const a = resolveEffectiveAccess(
      input({ entitlements: ent({ hasHome: true, hasPro: true, sourcesByScope: { home: ['paid_subscription'], pro: ['paid_subscription'] } }) }),
    );
    expect([a.canHome, a.canPro]).toEqual([true, true]);
    expect(a.exactGrams).toBe(true);
    expect(a.professionalScaling).toBe(true);
    expect(a.allowedModes).toEqual(['home', 'pro']);
  });

  it('an APPROVED partner gets free Home + Pro + Partner (no paid subscription)', () => {
    const a = resolveEffectiveAccess(
      input({
        partnerStatus: 'approved',
        entitlements: ent({
          hasHome: true,
          hasPro: true,
          hasPartnerMode: true,
          sourcesByScope: { home: ['approved_partner'], pro: ['approved_partner'], partner: ['approved_partner'] },
        }),
      }),
    );
    expect(a.allowedModes).toEqual(['home', 'pro', 'partner']);
    expect(a.partnerAnalytics).toBe(true);
  });

  it('a SUSPENDED partner loses partner mode AND partner-only Home/Pro (stale-entitlement defence)', () => {
    const a = resolveEffectiveAccess(
      input({
        partnerStatus: 'suspended',
        entitlements: ent({
          hasHome: true,
          hasPro: true,
          hasPartnerMode: true,
          sourcesByScope: { home: ['approved_partner'], pro: ['approved_partner'], partner: ['approved_partner'] },
        }),
      }),
    );
    expect([a.canHome, a.canPro, a.canPartner]).toEqual([false, false, false]);
    expect(a.allowedModes).toEqual([]);
    expect(a.denialReasons.some((r) => /partner status is 'suspended'/.test(r))).toBe(true);
  });

  it('a suspended partner who ALSO has a paid Pro subscription keeps Pro (multiple sources)', () => {
    const a = resolveEffectiveAccess(
      input({
        partnerStatus: 'suspended',
        entitlements: ent({
          hasHome: true,
          hasPro: true,
          hasPartnerMode: true,
          sourcesByScope: { home: ['approved_partner'], pro: ['approved_partner', 'paid_subscription'], partner: ['approved_partner'] },
        }),
      }),
    );
    expect(a.canPro).toBe(true); // pro survives because a paid_subscription source remains
    expect(a.canHome).toBe(false); // home was partner-only → lost
    expect(a.canPartner).toBe(false);
  });

  it('an admin grant enables Admin but NOT partner (separate concepts)', () => {
    const a = resolveEffectiveAccess(input({ adminRole: 'super_admin' }));
    expect(a.canAdmin).toBe(true);
    expect(a.accountAdministration).toBe(true);
    expect(a.canPartner).toBe(false);
    expect(a.allowedModes).toEqual(['admin']);
  });

  it('a blocking account state denies EVERYTHING even with entitlements', () => {
    for (const state of ['suspended', 'security_locked', 'disabled'] as AccountState[]) {
      const a = resolveEffectiveAccess(
        input({ accountState: state, adminRole: 'super_admin', entitlements: ent({ hasHome: true, hasPro: true, hasPartnerMode: true }) }),
      );
      expect(a.allowedModes).toEqual([]);
      expect(a.saveRecipes).toBe(false);
      expect(a.denialReasons.some((r) => r.includes(state))).toBe(true);
    }
  });

  it('preserves the Billing explanation trail verbatim', () => {
    const a = resolveEffectiveAccess(
      input({ entitlements: ent({ hasHome: true, explanation: ['home granted by paid_subscription until 2027'] }) }),
    );
    expect(a.denialReasons).toContain('home granted by paid_subscription until 2027');
  });
});

describe('mode resolution', () => {
  const proAccess = resolveEffectiveAccess(
    input({ entitlements: ent({ hasHome: true, hasPro: true, sourcesByScope: { home: ['paid_subscription'], pro: ['paid_subscription'] } }) }),
  );

  it('defaults to the highest-priority allowed mode', () => {
    expect(defaultMode(proAccess)).toBe('pro');
  });

  it('honours a valid persisted mode', () => {
    const r = resolvePersistedMode(proAccess, 'home');
    expect(r.mode).toBe('home');
    expect(r.rejectedStored).toBe(false);
  });

  it('rejects a stored mode that is no longer authorized and falls back safely', () => {
    const r = resolvePersistedMode(proAccess, 'partner');
    expect(r.mode).toBe('pro');
    expect(r.rejectedStored).toBe(true);
  });

  it('canEnterMode is the server-side guard (never widened by the client)', () => {
    expect(canEnterMode(proAccess, 'pro')).toBe(true);
    expect(canEnterMode(proAccess, 'admin')).toBe(false);
  });
});
