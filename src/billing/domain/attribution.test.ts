/**
 * Module 7 tests — attribution.
 * Pins A1 (30-day window), A2 (explicit code overrides unconverted cookie),
 * A3 (paid lock can never be stolen), A4 (unattributed monthly → annual
 * conversion with code), A5 (attributed monthly keeps partner through
 * conversion), A6 (one partner per payment), A7 (self-referral typed
 * rejection), A8 (§4.6 benefit non-stacking, both directions).
 */

import { describe, expect, it } from 'vitest';
import {
  ATTRIBUTION_WINDOW_DAYS,
  ATTRIBUTION_WINDOW_MS,
  decideAttribution,
  decideFifteenMonthBenefit,
  type AttributionInput,
  type BenefitEvidence,
} from './attribution';

const DAY_MS = 24 * 60 * 60 * 1000;
const PAYMENT_AT = Date.UTC(2026, 6, 1, 12, 0, 0);

function baseInput(overrides: Partial<AttributionInput> = {}): AttributionInput {
  return {
    subjectUserId: 'user_buyer',
    paymentAtUtcMs: PAYMENT_AT,
    ...overrides,
  };
}

const COOKIE_P1 = {
  partnerId: 'partner_1',
  partnerUserId: 'user_p1',
  clickedAtUtcMs: PAYMENT_AT - 5 * DAY_MS,
};

const CODE_P2 = {
  partnerId: 'partner_2',
  partnerUserId: 'user_p2',
  enteredAtUtcMs: PAYMENT_AT - DAY_MS,
  codeValid: true,
};

describe('A1: 30-day window', () => {
  it('locked default is 30 days', () => {
    expect(ATTRIBUTION_WINDOW_DAYS).toBe(30);
    expect(ATTRIBUTION_WINDOW_MS).toBe(30 * DAY_MS);
  });

  it('cookie inside the window attributes', () => {
    expect(decideAttribution(baseInput({ cookie: COOKIE_P1 }))).toEqual({
      attributed: true,
      partnerId: 'partner_1',
      source: 'cookie',
    });
  });

  it('payment 1ms before window end still attributes; exactly 30 days does not', () => {
    const clickedAtUtcMs = PAYMENT_AT - 30 * DAY_MS;
    expect(
      decideAttribution(baseInput({ cookie: { ...COOKIE_P1, clickedAtUtcMs: clickedAtUtcMs + 1 } })),
    ).toMatchObject({ attributed: true });
    expect(decideAttribution(baseInput({ cookie: { ...COOKIE_P1, clickedAtUtcMs } }))).toEqual({
      attributed: false,
      reason: 'window_expired',
    });
  });

  it('cookie clicked AFTER the payment never attributes', () => {
    expect(
      decideAttribution(baseInput({ cookie: { ...COOKIE_P1, clickedAtUtcMs: PAYMENT_AT + 1 } })),
    ).toEqual({ attributed: false, reason: 'window_expired' });
  });

  it('window is configurable for tests/config', () => {
    const cookie = { ...COOKIE_P1, clickedAtUtcMs: PAYMENT_AT - 10 * DAY_MS };
    expect(decideAttribution(baseInput({ cookie, windowMs: 7 * DAY_MS }))).toEqual({
      attributed: false,
      reason: 'window_expired',
    });
    expect(decideAttribution(baseInput({ cookie, windowMs: 14 * DAY_MS }))).toMatchObject({
      attributed: true,
    });
  });
});

describe('A2: explicit code vs passive cookie (both override directions)', () => {
  it('explicit VALID code entered before conversion OVERRIDES an unconverted cookie', () => {
    expect(decideAttribution(baseInput({ cookie: COOKIE_P1, explicitCode: CODE_P2 }))).toEqual({
      attributed: true,
      partnerId: 'partner_2',
      source: 'explicit_code',
    });
  });

  it('reverse direction: INVALID code does NOT override — the cookie wins', () => {
    expect(
      decideAttribution(
        baseInput({ cookie: COOKIE_P1, explicitCode: { ...CODE_P2, codeValid: false } }),
      ),
    ).toEqual({ attributed: true, partnerId: 'partner_1', source: 'cookie' });
  });

  it('code entered AFTER the payment does not apply — the cookie wins', () => {
    expect(
      decideAttribution(
        baseInput({ cookie: COOKIE_P1, explicitCode: { ...CODE_P2, enteredAtUtcMs: PAYMENT_AT + 1 } }),
      ),
    ).toEqual({ attributed: true, partnerId: 'partner_1', source: 'cookie' });
  });

  it('explicit valid code alone attributes', () => {
    expect(decideAttribution(baseInput({ explicitCode: CODE_P2 }))).toEqual({
      attributed: true,
      partnerId: 'partner_2',
      source: 'explicit_code',
    });
  });

  it('invalid code alone → typed invalid_code refusal', () => {
    expect(decideAttribution(baseInput({ explicitCode: { ...CODE_P2, codeValid: false } }))).toEqual({
      attributed: false,
      reason: 'invalid_code',
    });
  });
});

describe('A3/A5: paid lock can never be stolen', () => {
  const LOCK = { partnerId: 'partner_locked', lockedAtUtcMs: PAYMENT_AT - 90 * DAY_MS };

  it('a later explicit code can NEVER steal a locked subscription', () => {
    expect(decideAttribution(baseInput({ existingAttribution: LOCK, explicitCode: CODE_P2 }))).toEqual({
      attributed: true,
      partnerId: 'partner_locked',
      source: 'existing_lock',
    });
  });

  it('a later cookie can never steal either', () => {
    expect(decideAttribution(baseInput({ existingAttribution: LOCK, cookie: COOKIE_P1 }))).toEqual({
      attributed: true,
      partnerId: 'partner_locked',
      source: 'existing_lock',
    });
  });

  it('A5: already-attributed monthly KEEPS its partner through conversion (code at conversion ignored)', () => {
    // Conversion payment: subscription already paid-locked to partner_locked;
    // buyer enters partner_2's code at conversion time.
    const decision = decideAttribution(
      baseInput({ existingAttribution: LOCK, explicitCode: CODE_P2, cookie: COOKIE_P1 }),
    );
    expect(decision).toEqual({ attributed: true, partnerId: 'partner_locked', source: 'existing_lock' });
  });
});

describe('A4: previously-unattributed monthly converting to annual', () => {
  it('valid code at conversion attributes the conversion (and future renewals use the lock)', () => {
    // No existing attribution (monthly was never attributed) + valid code.
    const decision = decideAttribution(baseInput({ explicitCode: CODE_P2 }));
    expect(decision).toEqual({ attributed: true, partnerId: 'partner_2', source: 'explicit_code' });
  });
});

describe('A6/A7: single partner + self-referral', () => {
  it('A6: a decision names exactly ONE partner', () => {
    const decision = decideAttribution(baseInput({ cookie: COOKIE_P1, explicitCode: CODE_P2 }));
    expect(decision.attributed).toBe(true);
    if (decision.attributed) {
      expect(typeof decision.partnerId).toBe('string');
    }
  });

  it('A7: self-referral alone → typed self_referral rejection', () => {
    expect(
      decideAttribution(
        baseInput({ explicitCode: { ...CODE_P2, partnerUserId: 'user_buyer' } }),
      ),
    ).toEqual({ attributed: false, reason: 'self_referral' });
    expect(
      decideAttribution(baseInput({ cookie: { ...COOKIE_P1, partnerUserId: 'user_buyer' } })),
    ).toEqual({ attributed: false, reason: 'self_referral' });
  });

  it('A7: self-referring code evidence is discarded — a valid other-partner cookie still attributes', () => {
    expect(
      decideAttribution(
        baseInput({ explicitCode: { ...CODE_P2, partnerUserId: 'user_buyer' }, cookie: COOKIE_P1 }),
      ),
    ).toEqual({ attributed: true, partnerId: 'partner_1', source: 'cookie' });
  });

  it('A7: self-referring cookie discarded — a valid other-partner code still attributes', () => {
    expect(
      decideAttribution(
        baseInput({ cookie: { ...COOKIE_P1, partnerUserId: 'user_buyer' }, explicitCode: CODE_P2 }),
      ),
    ).toEqual({ attributed: true, partnerId: 'partner_2', source: 'explicit_code' });
  });

  it('no evidence at all → no_evidence', () => {
    expect(decideAttribution(baseInput())).toEqual({ attributed: false, reason: 'no_evidence' });
  });

  it('decisions are immutable and deterministic', () => {
    const a = decideAttribution(baseInput({ cookie: COOKIE_P1 }));
    expect(Object.isFrozen(a)).toBe(true);
    expect(a).toEqual(decideAttribution(baseInput({ cookie: COOKIE_P1 })));
  });
});

describe('A8 (§4.6): 15-month benefit non-stacking', () => {
  function evidence(overrides: Partial<BenefitEvidence> = {}): BenefitEvidence {
    return {
      paymentKind: 'initial_annual_purchase',
      attributed: true,
      benefitAlreadyGrantedForSubscription: false,
      userHadPriorBenefit: false,
      isPartnersOwnFreeEntitlement: false,
      hadInviteTrial: false,
      ...overrides,
    };
  }

  it('qualifying initial annual purchase → ONE 15-month benefit', () => {
    expect(decideFifteenMonthBenefit(evidence())).toEqual({ granted: true, benefitMonths: 15 });
  });

  it('qualifying conversion to annual → benefit', () => {
    expect(decideFifteenMonthBenefit(evidence({ paymentKind: 'conversion_to_annual' }))).toEqual({
      granted: true,
      benefitMonths: 15,
    });
  });

  it('NO repeat on renewals', () => {
    expect(decideFifteenMonthBenefit(evidence({ paymentKind: 'annual_renewal' }))).toEqual({
      granted: false,
      reason: 'renewal_not_eligible',
    });
  });

  it('NO cancel-and-rebuy repeat (payment kind)', () => {
    expect(decideFifteenMonthBenefit(evidence({ paymentKind: 'rebuy_after_cancel' }))).toEqual({
      granted: false,
      reason: 'rebuy_not_eligible',
    });
  });

  it('NO cancel-and-rebuy repeat (lifetime prior benefit under a fresh initial purchase)', () => {
    expect(decideFifteenMonthBenefit(evidence({ userHadPriorBenefit: true }))).toEqual({
      granted: false,
      reason: 'rebuy_not_eligible',
    });
  });

  it('NO second code stacking on the same subscription', () => {
    expect(decideFifteenMonthBenefit(evidence({ benefitAlreadyGrantedForSubscription: true }))).toEqual({
      granted: false,
      reason: 'stacking_rejected',
    });
  });

  it('unattributed purchase gets no benefit', () => {
    expect(decideFifteenMonthBenefit(evidence({ attributed: false }))).toEqual({
      granted: false,
      reason: 'not_attributed',
    });
  });

  it("partner's own free entitlement is NOT eligible", () => {
    expect(decideFifteenMonthBenefit(evidence({ isPartnersOwnFreeEntitlement: true }))).toEqual({
      granted: false,
      reason: 'partner_free_entitlement_not_eligible',
    });
  });

  it('invite-trial users ARE eligible when buying annual through a partner', () => {
    expect(decideFifteenMonthBenefit(evidence({ hadInviteTrial: true }))).toEqual({
      granted: true,
      benefitMonths: 15,
    });
  });

  it('invite-trial user converting to annual is eligible too', () => {
    expect(
      decideFifteenMonthBenefit(evidence({ hadInviteTrial: true, paymentKind: 'conversion_to_annual' })),
    ).toEqual({ granted: true, benefitMonths: 15 });
  });

  it('payment kind is checked before attribution (deterministic refusal order)', () => {
    expect(
      decideFifteenMonthBenefit(evidence({ paymentKind: 'annual_renewal', attributed: false })),
    ).toEqual({ granted: false, reason: 'renewal_not_eligible' });
  });

  it('decisions are immutable', () => {
    expect(Object.isFrozen(decideFifteenMonthBenefit(evidence()))).toBe(true);
  });
});
