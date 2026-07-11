/**
 * Module 8 tests — inviteCodes.
 * Pins I1 (format, injectable RNG, unambiguous alphabet, distinct namespace),
 * I2 (state machine legal edges only), I3 (one live code per slot +
 * replacements), I4 (redemption guard incl. one-per-lifetime + typed
 * refusals), I5 (grant spec), I6 (pool math, default 5 slots).
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INVITE_POOL_SLOTS,
  DEFAULT_INVITE_TRIAL_DAYS,
  IllegalInviteTransitionError,
  INVITE_CODE_ALPHABET,
  INVITE_CODE_PREFIX,
  INVITE_TERMINAL_STATES,
  InvalidRandomSourceError,
  LEGAL_INVITE_TRANSITIONS,
  assertInviteTransition,
  canRedeemInvite,
  canTransitionInvite,
  generateInviteCode,
  isInviteCodeFormat,
  isInviteTerminal,
  normalizeInviteCode,
  repairInvitePool,
  type InviteCodeState,
  type InviteCodeView,
  type RandomInt,
  type RedeemingUserView,
} from './inviteCodes';
import { BillingDomainError } from './types';

/** Deterministic RNG stub: yields the given indexes in order, then wraps. */
function stubRng(sequence: readonly number[]): RandomInt {
  let i = 0;
  return () => {
    const value = sequence[i % sequence.length] as number;
    i += 1;
    return value;
  };
}

describe('I1: alphabet + generation', () => {
  it('alphabet has no ambiguous characters (0, O, 1, I, L)', () => {
    for (const forbidden of ['0', 'O', '1', 'I', 'L']) {
      expect(INVITE_CODE_ALPHABET).not.toContain(forbidden);
    }
    expect(INVITE_CODE_ALPHABET).toHaveLength(31);
    expect(new Set(INVITE_CODE_ALPHABET).size).toBe(31);
  });

  it('generates the canonical PIH-XXXX-XXXX shape', () => {
    const code = generateInviteCode(stubRng([0]));
    expect(code).toBe('PIH-2222-2222'); // index 0 → '2'
    expect(code).toMatch(/^PIH-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
  });

  it('is pure: the injected RNG fully determines the code', () => {
    const seq = [5, 17, 2, 20, 8, 24, 1, 12];
    expect(generateInviteCode(stubRng(seq))).toBe(generateInviteCode(stubRng(seq)));
  });

  it('different RNG output → different code', () => {
    expect(generateInviteCode(stubRng([1]))).not.toBe(generateInviteCode(stubRng([2])));
  });

  it('throws a typed error when the injected RNG misbehaves', () => {
    expect(() => generateInviteCode(stubRng([31]))).toThrow(InvalidRandomSourceError);
    expect(() => generateInviteCode(stubRng([-1]))).toThrow(InvalidRandomSourceError);
    expect(() => generateInviteCode(stubRng([2.5]))).toThrow(InvalidRandomSourceError);
  });
});

describe('I1: normalization + namespace separation', () => {
  it('normalizes case-insensitively to the canonical hyphenated form', () => {
    expect(normalizeInviteCode('pih-7k4m-9q2d')).toEqual({ ok: true, code: 'PIH-7K4M-9Q2D' });
  });

  it('accepts missing or spaced separators', () => {
    expect(normalizeInviteCode('PIH7K4M9Q2D')).toEqual({ ok: true, code: 'PIH-7K4M-9Q2D' });
    expect(normalizeInviteCode('  pih 7k4m 9q2d  ')).toEqual({ ok: true, code: 'PIH-7K4M-9Q2D' });
  });

  it('rejects a missing/incorrect brand prefix (clearly distinct from partner codes)', () => {
    expect(normalizeInviteCode('ABC-7K4M-9Q2D')).toEqual({ ok: false, reason: 'bad_prefix' });
    expect(normalizeInviteCode('NINJAMARIA')).toEqual({ ok: false, reason: 'bad_prefix' });
  });

  it('rejects a wrong body length', () => {
    expect(normalizeInviteCode('PIH-7K4M-9Q2')).toEqual({ ok: false, reason: 'bad_shape' });
    expect(normalizeInviteCode('PIH-7K4M-9Q2DX')).toEqual({ ok: false, reason: 'bad_shape' });
  });

  it('rejects ambiguous characters (never in the alphabet)', () => {
    expect(normalizeInviteCode('PIH-OK4M-9Q2D')).toEqual({ ok: false, reason: 'invalid_characters' });
    expect(normalizeInviteCode('PIH-7K4M-9Q1D')).toEqual({ ok: false, reason: 'invalid_characters' });
    expect(normalizeInviteCode('PIH-LK4M-9Q0D')).toEqual({ ok: false, reason: 'invalid_characters' });
  });

  it('rejects empty input', () => {
    expect(normalizeInviteCode('')).toEqual({ ok: false, reason: 'empty' });
    expect(normalizeInviteCode('  - ')).toEqual({ ok: false, reason: 'empty' });
  });

  it('isInviteCodeFormat routes shapes correctly', () => {
    expect(isInviteCodeFormat('PIH-7K4M-9Q2D')).toBe(true);
    expect(isInviteCodeFormat('NINJAMARIA')).toBe(false);
  });

  it('generated codes always normalize to themselves', () => {
    const code = generateInviteCode(stubRng([3, 7, 11, 15, 19, 23, 27, 30]));
    expect(normalizeInviteCode(code)).toEqual({ ok: true, code });
  });
});

describe('I2: invite code state machine', () => {
  it('happy path available → reserved → sent → redeemed', () => {
    expect(assertInviteTransition('available', 'reserved')).toBe('reserved');
    expect(assertInviteTransition('reserved', 'sent')).toBe('sent');
    expect(assertInviteTransition('sent', 'redeemed')).toBe('redeemed');
  });

  it('reservation release: reserved → available', () => {
    expect(canTransitionInvite('reserved', 'available')).toBe(true);
  });

  it.each(['available', 'reserved', 'sent'] as const)('%s can expire and be revoked', (from) => {
    expect(canTransitionInvite(from, 'expired')).toBe(true);
    expect(canTransitionInvite(from, 'revoked')).toBe(true);
  });

  it.each([
    ['available', 'sent'],
    ['available', 'redeemed'],
    ['sent', 'available'],
    ['sent', 'reserved'],
    ['redeemed', 'available'],
    ['expired', 'available'],
    ['revoked', 'reserved'],
    ['redeemed', 'revoked'],
  ] as const)('illegal transition %s → %s throws typed error', (from, to) => {
    expect(() => assertInviteTransition(from, to)).toThrow(IllegalInviteTransitionError);
  });

  it('typed error carries from/to', () => {
    try {
      assertInviteTransition('redeemed', 'available');
      expect.unreachable('should have thrown');
    } catch (error) {
      const typed = error as IllegalInviteTransitionError;
      expect(typed).toBeInstanceOf(IllegalInviteTransitionError);
      expect(typed.from).toBe('redeemed');
      expect(typed.to).toBe('available');
    }
  });

  it('terminal states have no outgoing transitions', () => {
    expect(INVITE_TERMINAL_STATES).toEqual(['redeemed', 'expired', 'revoked']);
    for (const state of INVITE_TERMINAL_STATES) {
      expect(LEGAL_INVITE_TRANSITIONS[state]).toEqual([]);
      expect(isInviteTerminal(state)).toBe(true);
    }
    expect(isInviteTerminal('available')).toBe(false);
  });

  it('exhaustive pin: exactly 11 legal transitions out of 36 ordered pairs', () => {
    const states = Object.keys(LEGAL_INVITE_TRANSITIONS) as InviteCodeState[];
    expect(states).toHaveLength(6);
    let legal = 0;
    for (const from of states) {
      for (const to of states) {
        if (canTransitionInvite(from, to)) legal += 1;
        else expect(() => assertInviteTransition(from, to)).toThrow(IllegalInviteTransitionError);
      }
    }
    expect(legal).toBe(11);
  });
});

describe('I4/I5: redemption guard', () => {
  const CODE_SENT: InviteCodeView = { state: 'sent', reservedEmailNormalized: 'friend@example.com' };

  function user(overrides: Partial<RedeemingUserView> = {}): RedeemingUserView {
    return {
      authenticated: true,
      emailVerified: true,
      email: 'friend@example.com',
      isApprovedPartner: false,
      hadInviteTrialEver: false,
      hasActivePaidEntitlement: false,
      ...overrides,
    };
  }

  it('I5: success returns the exact grant spec (default 30 days, no Stripe, no commission)', () => {
    expect(DEFAULT_INVITE_TRIAL_DAYS).toBe(30);
    const decision = canRedeemInvite(CODE_SENT, user());
    expect(decision).toEqual({
      ok: true,
      grant: {
        scope: 'home',
        days: 30,
        autoRenew: false,
        createsStripeObjects: false,
        createsCommission: false,
      },
    });
  });

  it('trial length is configurable', () => {
    const decision = canRedeemInvite(CODE_SENT, user(), { trialDays: 14 });
    expect(decision).toMatchObject({ ok: true, grant: { days: 14 } });
    expect(() => canRedeemInvite(CODE_SENT, user(), { trialDays: 0 })).toThrow(BillingDomainError);
  });

  it('redeems from reserved as well as sent', () => {
    expect(
      canRedeemInvite({ state: 'reserved', reservedEmailNormalized: 'friend@example.com' }, user()),
    ).toMatchObject({ ok: true });
  });

  it('email match is exact after normalization (case/whitespace-insensitive)', () => {
    expect(canRedeemInvite(CODE_SENT, user({ email: '  Friend@Example.COM ' }))).toMatchObject({ ok: true });
  });

  it('requires an authenticated user', () => {
    expect(canRedeemInvite(CODE_SENT, user({ authenticated: false }))).toEqual({
      ok: false,
      reason: 'not_authenticated',
    });
  });

  it('requires a verified email', () => {
    expect(canRedeemInvite(CODE_SENT, user({ emailVerified: false }))).toEqual({
      ok: false,
      reason: 'email_not_verified',
    });
  });

  it.each(['redeemed', 'expired', 'revoked', 'available'] as const)(
    'code in state %s is not redeemable (left unconsumed, typed reason)',
    (state) => {
      expect(
        canRedeemInvite({ state, reservedEmailNormalized: 'friend@example.com' }, user()),
      ).toEqual({ ok: false, reason: 'code_not_redeemable' });
    },
  );

  it('refuses on reservation email mismatch', () => {
    expect(canRedeemInvite(CODE_SENT, user({ email: 'other@example.com' }))).toEqual({
      ok: false,
      reason: 'email_mismatch',
    });
    expect(
      canRedeemInvite({ state: 'sent', reservedEmailNormalized: null }, user()),
    ).toEqual({ ok: false, reason: 'email_mismatch' });
  });

  it('ONE invite trial per lifetime', () => {
    expect(canRedeemInvite(CODE_SENT, user({ hadInviteTrialEver: true }))).toEqual({
      ok: false,
      reason: 'prior_invite_trial',
    });
  });

  it('explicit admin override allows a repeat trial', () => {
    expect(
      canRedeemInvite(CODE_SENT, user({ hadInviteTrialEver: true }), { adminOverrideRepeatTrial: true }),
    ).toMatchObject({ ok: true });
  });

  it('approved partners cannot redeem', () => {
    expect(canRedeemInvite(CODE_SENT, user({ isApprovedPartner: true }))).toEqual({
      ok: false,
      reason: 'approved_partner_not_eligible',
    });
  });

  it('users with an active paid Home/Pro entitlement cannot redeem', () => {
    expect(canRedeemInvite(CODE_SENT, user({ hasActivePaidEntitlement: true }))).toEqual({
      ok: false,
      reason: 'active_paid_entitlement',
    });
  });

  it('check order is deterministic: authentication is reported first', () => {
    expect(
      canRedeemInvite(
        { state: 'revoked', reservedEmailNormalized: null },
        user({ authenticated: false, emailVerified: false, isApprovedPartner: true }),
      ),
    ).toEqual({ ok: false, reason: 'not_authenticated' });
  });

  it('decisions are immutable', () => {
    expect(Object.isFrozen(canRedeemInvite(CODE_SENT, user()))).toBe(true);
  });
});

describe('I3/I6: pool math + replacements', () => {
  /** Fresh sequential RNG per call: 0,1,2,… mod alphabet size — every 8-draw window is unique. */
  function sequentialRng(): RandomInt {
    let n = 0;
    return (maxExclusive: number) => {
      const value = n % maxExclusive;
      n += 1;
      return value;
    };
  }

  it('I6: an empty pool gets the default 5 slots, one code each', () => {
    expect(DEFAULT_INVITE_POOL_SLOTS).toBe(5);
    const plan = repairInvitePool([], sequentialRng());
    expect(plan.replacements).toHaveLength(5);
    expect(plan.anomalies).toHaveLength(0);
    const codes = plan.replacements.map((r) => r.code);
    expect(new Set(codes).size).toBe(5); // all distinct
    const slotIds = plan.replacements.map((r) => r.slotId);
    expect(new Set(slotIds).size).toBe(5);
  });

  it('a slot with exactly one live code needs nothing', () => {
    const plan = repairInvitePool(
      [
        { slotId: 's1', codes: [{ code: 'PIH-AAAA-2222', state: 'available' }] },
        { slotId: 's2', codes: [{ code: 'PIH-BBBB-2222', state: 'sent' }] },
      ],
      sequentialRng(),
      { slotCount: 2 },
    );
    expect(plan.replacements).toHaveLength(0);
    expect(plan.anomalies).toHaveLength(0);
  });

  it('I3: a slot whose code went terminal gets exactly one replacement for the SAME slot', () => {
    const plan = repairInvitePool(
      [
        { slotId: 's1', codes: [{ code: 'PIH-AAAA-2222', state: 'redeemed' }] },
        { slotId: 's2', codes: [{ code: 'PIH-BBBB-2222', state: 'available' }] },
      ],
      sequentialRng(),
      { slotCount: 2 },
    );
    expect(plan.replacements).toHaveLength(1);
    expect(plan.replacements[0]?.slotId).toBe('s1');
  });

  it.each(['redeemed', 'expired', 'revoked'] as const)(
    'I3: replacement generated after %s',
    (terminal) => {
      const plan = repairInvitePool(
        [{ slotId: 's1', codes: [{ code: 'PIH-AAAA-2222', state: terminal }] }],
        sequentialRng(),
        { slotCount: 1 },
      );
      expect(plan.replacements).toHaveLength(1);
    },
  );

  it('slot history: terminal codes + one live code → healthy, no replacement', () => {
    const plan = repairInvitePool(
      [
        {
          slotId: 's1',
          codes: [
            { code: 'PIH-AAAA-2222', state: 'redeemed' },
            { code: 'PIH-BBBB-2222', state: 'revoked' },
            { code: 'PIH-CCCC-2222', state: 'reserved' },
          ],
        },
      ],
      sequentialRng(),
      { slotCount: 1 },
    );
    expect(plan.replacements).toHaveLength(0);
  });

  it('anomaly: more than one live code in a slot is reported, not "fixed"', () => {
    const plan = repairInvitePool(
      [
        {
          slotId: 's1',
          codes: [
            { code: 'PIH-AAAA-2222', state: 'available' },
            { code: 'PIH-BBBB-2222', state: 'sent' },
          ],
        },
      ],
      sequentialRng(),
      { slotCount: 1 },
    );
    expect(plan.replacements).toHaveLength(0);
    expect(plan.anomalies).toEqual([{ slotId: 's1', liveCount: 2 }]);
  });

  it('replacement codes avoid collisions with existing pool codes', () => {
    // RNG that first reproduces an existing code, then something fresh.
    const existing = generateInviteCode(stubRng([0]));
    const collidingThenFresh = stubRng([0, 0, 0, 0, 0, 0, 0, 0, 5, 5, 5, 5, 5, 5, 5, 5]);
    const plan = repairInvitePool(
      [{ slotId: 's1', codes: [{ code: existing, state: 'redeemed' }] }],
      collidingThenFresh,
      { slotCount: 1 },
    );
    expect(plan.replacements[0]?.code).not.toBe(existing);
  });

  it('missing slots are topped up with synthesized non-colliding ids', () => {
    const plan = repairInvitePool(
      [{ slotId: 'slot-1', codes: [{ code: 'PIH-AAAA-2222', state: 'available' }] }],
      sequentialRng(),
      { slotCount: 3 },
    );
    expect(plan.replacements).toHaveLength(2);
    const ids = plan.replacements.map((r) => r.slotId);
    expect(ids).not.toContain('slot-1');
    expect(new Set(ids).size).toBe(2);
  });

  it('slotCount is configurable and validated', () => {
    expect(repairInvitePool([], sequentialRng(), { slotCount: 2 }).replacements).toHaveLength(2);
    expect(() => repairInvitePool([], sequentialRng(), { slotCount: 0 })).toThrow(BillingDomainError);
    expect(() => repairInvitePool([], sequentialRng(), { slotCount: 1.5 })).toThrow(BillingDomainError);
  });

  it('plans are immutable', () => {
    const plan = repairInvitePool([], sequentialRng());
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.replacements)).toBe(true);
  });

  it('prefix constant matches generated output', () => {
    expect(INVITE_CODE_PREFIX).toBe('PIH');
    expect(generateInviteCode(sequentialRng()).startsWith('PIH-')).toBe(true);
  });
});
