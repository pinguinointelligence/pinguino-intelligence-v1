import { describe, expect, it } from 'vitest';
import type { UtcMs } from '@/billing/domain/types';
import {
  commissionIneligibilityReason,
  decideShareAttribution,
  isCommissionEligible,
  partnerIdForNewShare,
  type ShareJourneyEvidence,
} from './partnerShareAttribution';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 7, 1, 12, 0, 0);
const at = (offsetMs: number): UtcMs => T0 + offsetMs;

const KATARZYNA = 'user-katarzyna';
const JAN_USER = 'user-jan';
const JAN_PARTNER = 'partner-jan';
const MARYSIA_USER = 'user-marysia';
const MARYSIA_PARTNER = 'partner-marysia';

const journey = (over: Partial<ShareJourneyEvidence> = {}): ShareJourneyEvidence => ({
  partnerId: JAN_PARTNER,
  partnerUserId: JAN_USER,
  partnerStatusNow: 'active',
  shareLinkId: 'share-1',
  openedAtUtcMs: at(0),
  ...over,
});

describe('§32 — ONE centralized precedence policy, one partner per payment', () => {
  it('an existing paid lock always wins; a later share can never steal it', () => {
    expect(
      decideShareAttribution({
        existingAttribution: { partnerId: 'partner-first', lockedAtUtcMs: at(-DAY) },
        shareJourney: journey(),
        subjectUserId: KATARZYNA,
        paymentAtUtcMs: at(DAY),
      }),
    ).toEqual({ attributed: true, partnerId: 'partner-first', source: 'existing_lock' });
  });

  it('an explicit valid code at checkout outranks the share journey', () => {
    expect(
      decideShareAttribution({
        explicitCode: {
          partnerId: 'partner-code',
          partnerUserId: 'user-code',
          enteredAtUtcMs: at(DAY),
          codeValid: true,
        },
        shareJourney: journey(),
        subjectUserId: KATARZYNA,
        paymentAtUtcMs: at(2 * DAY),
      }),
    ).toEqual({ attributed: true, partnerId: 'partner-code', source: 'explicit_code' });
  });

  it('the share journey outranks a passive stored referral', () => {
    expect(
      decideShareAttribution({
        storedReferral: {
          partnerId: 'partner-cookie',
          partnerUserId: 'user-cookie',
          clickedAtUtcMs: at(-DAY),
        },
        shareJourney: journey(),
        subjectUserId: KATARZYNA,
        paymentAtUtcMs: at(DAY),
      }),
    ).toEqual({ attributed: true, partnerId: JAN_PARTNER, source: 'share_journey' });
  });

  it('falls back to the stored referral when no share journey applies', () => {
    expect(
      decideShareAttribution({
        storedReferral: {
          partnerId: 'partner-cookie',
          partnerUserId: 'user-cookie',
          clickedAtUtcMs: at(-DAY),
        },
        subjectUserId: KATARZYNA,
        paymentAtUtcMs: at(DAY),
      }),
    ).toEqual({ attributed: true, partnerId: 'partner-cookie', source: 'stored_referral' });
  });

  it('attributes at most ONE partner even with all four kinds of evidence present', () => {
    const decision = decideShareAttribution({
      existingAttribution: { partnerId: 'p-lock', lockedAtUtcMs: at(-DAY) },
      explicitCode: {
        partnerId: 'p-code',
        partnerUserId: 'u-code',
        enteredAtUtcMs: at(0),
        codeValid: true,
      },
      shareJourney: journey(),
      storedReferral: { partnerId: 'p-cookie', partnerUserId: 'u-cookie', clickedAtUtcMs: at(0) },
      subjectUserId: KATARZYNA,
      paymentAtUtcMs: at(DAY),
    });
    expect(decision.attributed).toBe(true);
    expect(decision).toHaveProperty('partnerId', 'p-lock');
  });

  it('is deterministic — same evidence, same answer', () => {
    const input = {
      shareJourney: journey(),
      subjectUserId: KATARZYNA,
      paymentAtUtcMs: at(DAY),
    };
    expect(decideShareAttribution(input)).toEqual(decideShareAttribution(input));
  });
});

describe('owner rule 2026-08-23 — only an ACTIVE partner can earn, never retroactively', () => {
  it('a suspended partner generates no attribution from a link they made while active', () => {
    expect(
      decideShareAttribution({
        shareJourney: journey({ partnerStatusNow: 'suspended' }),
        subjectUserId: KATARZYNA,
        paymentAtUtcMs: at(DAY),
      }),
    ).toEqual({ attributed: false, reason: 'partner_not_active' });
  });

  it('a terminated partner is refused with the same rule', () => {
    expect(
      decideShareAttribution({
        shareJourney: journey({ partnerStatusNow: 'terminated' }),
        subjectUserId: KATARZYNA,
        paymentAtUtcMs: at(DAY),
      }),
    ).toEqual({ attributed: false, reason: 'partner_not_active' });
  });

  it('an inactive partner does NOT shadow a valid stored referral', () => {
    expect(
      decideShareAttribution({
        shareJourney: journey({ partnerStatusNow: 'suspended' }),
        storedReferral: { partnerId: 'p-cookie', partnerUserId: 'u-cookie', clickedAtUtcMs: at(0) },
        subjectUserId: KATARZYNA,
        paymentAtUtcMs: at(DAY),
      }),
    ).toEqual({ attributed: true, partnerId: 'p-cookie', source: 'stored_referral' });
  });

  it('a share made while NOT an active partner carries no partner id — permanently', () => {
    expect(partnerIdForNewShare({ partnerId: null, partnerStatus: null })).toBeNull();
    expect(partnerIdForNewShare({ partnerId: JAN_PARTNER, partnerStatus: 'suspended' })).toBeNull();
    expect(partnerIdForNewShare({ partnerId: JAN_PARTNER, partnerStatus: 'terminated' })).toBeNull();
    expect(partnerIdForNewShare({ partnerId: JAN_PARTNER, partnerStatus: 'active' })).toBe(JAN_PARTNER);
  });

  it('recipe success is NOT an argument to commission eligibility', () => {
    // The predicate takes ONLY partner status. There is no creator metric in
    // its signature, so popularity cannot create a payment entitlement (§83).
    expect(isCommissionEligible({ status: 'active' })).toBe(true);
    expect(isCommissionEligible({ status: 'suspended' })).toBe(false);
    expect(isCommissionEligible({ status: null })).toBe(false);
    expect(commissionIneligibilityReason({ status: null })).toBe('not_a_partner');
    expect(commissionIneligibilityReason({ status: 'suspended' })).toBe('partner_suspended');
    expect(commissionIneligibilityReason({ status: 'terminated' })).toBe('partner_terminated');
    expect(commissionIneligibilityReason({ status: 'active' })).toBeNull();
  });

  it('attribution expires with the window and does not live forever (§33)', () => {
    expect(
      decideShareAttribution({
        shareJourney: journey({ openedAtUtcMs: at(-31 * DAY) }),
        subjectUserId: KATARZYNA,
        paymentAtUtcMs: at(0),
      }),
    ).toEqual({ attributed: false, reason: 'no_evidence' });
  });
});

describe('§49 — anti-fraud', () => {
  it('a partner opening their OWN share link earns nothing', () => {
    expect(
      decideShareAttribution({
        shareJourney: journey({ partnerId: MARYSIA_PARTNER, partnerUserId: MARYSIA_USER }),
        subjectUserId: MARYSIA_USER,
        paymentAtUtcMs: at(DAY),
      }),
    ).toEqual({ attributed: false, reason: 'self_referral' });
  });

  it('no evidence at all is a typed refusal, not a silent default partner', () => {
    expect(
      decideShareAttribution({ subjectUserId: KATARZYNA, paymentAtUtcMs: at(0) }),
    ).toEqual({ attributed: false, reason: 'no_evidence' });
  });
});

describe('§73/§74 — creator, sharer and partner stay three separate facts', () => {
  it('J: Marysia is creator AND sharer AND partner — she is attributed once', () => {
    const decision = decideShareAttribution({
      shareJourney: journey({ partnerId: MARYSIA_PARTNER, partnerUserId: MARYSIA_USER }),
      subjectUserId: KATARZYNA,
      paymentAtUtcMs: at(DAY),
    });
    expect(decision).toEqual({
      attributed: true,
      partnerId: MARYSIA_PARTNER,
      source: 'share_journey',
    });
  });

  it('K: Jan shares MARYSIA\'s recipe — Jan earns, and nothing here touches authorship', () => {
    const decision = decideShareAttribution({
      shareJourney: journey(), // creator is Marysia; the journey only knows Jan
      subjectUserId: KATARZYNA,
      paymentAtUtcMs: at(DAY),
    });
    expect(decision).toEqual({ attributed: true, partnerId: JAN_PARTNER, source: 'share_journey' });
    // The decision object has no authorship field at all — it cannot express
    // „Jan is now the author", which is the structural guarantee (§23).
    expect(Object.keys(decision).sort()).toEqual(['attributed', 'partnerId', 'source']);
  });
});
