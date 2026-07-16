/**
 * stripe-webhook (v2) — PURE effect-mapper tests + MIRROR lockstep pins.
 *
 * effects.ts is deployment-self-contained (Deno cannot import src/), so it
 * carries mirrors of the pure billing domain modules. These tests pin every
 * mirror 1:1 against its src/billing source of truth (the established repo
 * lockstep pattern) and unit-test the payload→row mappers directly.
 */
import { describe, expect, it } from 'vitest';
import {
  COMMISSION_ADJUSTMENT_ROW_KEYS,
  COMMISSION_ENTRY_ROW_KEYS,
  CUSTOMER_SUBSCRIPTION_ROW_KEYS,
  ENTITLEMENT_INSERT_ROW_KEYS,
  NO_CONTRACT_REASONS,
  addMonths,
  buildCommissionAdjustmentRow,
  buildCommissionEntryRow,
  buildCustomerSubscriptionRow,
  buildEntitlementInsertRow,
  commissionMonthDate,
  decideCommissionEligibility,
  decideEntitlementMirror,
  decideReversal,
  divideRoundHalfUp,
  epochToIso,
  extractCheckoutMapping,
  extractChargeSnapshot,
  extractConnectAccountSnapshot,
  extractInvoiceSnapshot,
  extractSubscriptionSnapshot,
  holdEligibilityIso,
  mapSubscriptionStatus,
  monthKeyMadrid,
  noContractNote,
  pickAttributionToLock,
  pickLatestRuleVersion,
  proportionalReversalCents,
} from '../../supabase/functions/stripe-webhook/effects.ts';
import {
  SUPPORTED_WEBHOOK_EVENTS,
  routeWebhookEvent,
} from '../../supabase/functions/stripe-webhook/handlers.ts';
import {
  addMonths as domainAddMonths,
  holdEligibilityUtcMs,
  monthKeyMadrid as domainMonthKeyMadrid,
} from '../billing/domain/holdCalendar';
import {
  applyRefund,
  applyDisputeLost,
  type CommissionAdjustment,
} from '../billing/domain/refundAdjustments';
import { divideRoundHalfUp as domainDivideRoundHalfUp } from '../billing/domain/types';
import { resolveEntitlements } from '../billing/entitlements/entitlementResolver';
import { planFromSubscription } from '../access/subscription';

// ── Madrid hold calendar mirror — lockstep with src/billing/domain/holdCalendar ──

describe('Madrid hold calendar mirror (H1–H4 lockstep)', () => {
  // Documented instants incl. DST both directions, leap year, year boundary.
  const INSTANTS = [
    Date.UTC(2026, 0, 15, 12, 0, 0), // plain CET January
    Date.UTC(2026, 2, 31, 22, 30, 0), // 2026-03-31T22:30Z = Apr 1 00:30 Madrid (H3 doc case)
    Date.UTC(2025, 11, 31, 23, 30, 0), // Madrid already Jan 1 (year boundary)
    Date.UTC(2026, 5, 15, 0, 0, 0), // CEST summer
    Date.UTC(2026, 9, 25, 1, 30, 0), // autumn DST transition morning
    Date.UTC(2028, 1, 29, 10, 0, 0), // leap day
  ];

  it('monthKeyMadrid matches the domain module for every pinned instant', () => {
    for (const ms of INSTANTS) {
      expect(monthKeyMadrid(ms), new Date(ms).toISOString()).toBe(domainMonthKeyMadrid(ms));
    }
  });

  it('addMonths matches the domain module across year boundaries', () => {
    for (const [key, offset] of [
      ['2026-01', 3],
      ['2025-12', 3],
      ['2026-10', 3],
      ['2026-11', 14],
    ] as const) {
      expect(addMonths(key, offset)).toBe(domainAddMonths(key, offset));
    }
  });

  it('holdEligibilityIso equals the domain holdEligibilityUtcMs instant (M+3 Madrid midnight)', () => {
    for (const ms of INSTANTS) {
      expect(holdEligibilityIso(ms), new Date(ms).toISOString()).toBe(
        new Date(holdEligibilityUtcMs(ms)).toISOString(),
      );
    }
  });

  it('pins the documented examples: Jan→Apr 1 CEST, Dec→Mar 1 CET', () => {
    expect(holdEligibilityIso(Date.UTC(2026, 0, 15, 12, 0, 0))).toBe('2026-03-31T22:00:00.000Z');
    expect(holdEligibilityIso(Date.UTC(2025, 11, 15, 12, 0, 0))).toBe('2026-02-28T23:00:00.000Z');
    expect(holdEligibilityIso(Date.UTC(2026, 2, 31, 22, 30, 0))).toBe('2026-06-30T22:00:00.000Z');
  });

  it('commissionMonthDate is the Madrid month pinned to day 1 (0018 CHECK shape)', () => {
    expect(commissionMonthDate(Date.UTC(2026, 0, 15, 12, 0, 0))).toBe('2026-01-01');
    // 22:30 UTC on Mar 31 is ALREADY April in Madrid — month membership is Madrid, not UTC
    expect(commissionMonthDate(Date.UTC(2026, 2, 31, 22, 30, 0))).toBe('2026-04-01');
  });
});

// ── round-half-up mirror — lockstep with src/billing/domain/types.ts ─────────

describe('round-half-up division mirror (locked decision #2)', () => {
  it('matches the domain divideRoundHalfUp across a value grid', () => {
    const cases: Array<[number, number]> = [
      [0, 1],
      [1, 2], // exact half → rounds up
      [899, 1000],
      [900_000, 4900],
      [2900 * 333, 19900],
      [199 * 501, 999],
      [7, 3],
      [5, 4],
    ];
    for (const [num, den] of cases) {
      expect(divideRoundHalfUp(num, den), `${num}/${den}`).toBe(domainDivideRoundHalfUp(num, den));
    }
  });

  it('rounds exact halves UP on cents (the documented rule)', () => {
    expect(divideRoundHalfUp(1, 2)).toBe(1);
    expect(divideRoundHalfUp(3, 2)).toBe(2);
    expect(divideRoundHalfUp(25, 10)).toBe(3);
  });

  it('refuses non-integer or negative inputs like the domain module', () => {
    expect(() => divideRoundHalfUp(1.5, 2)).toThrow();
    expect(() => divideRoundHalfUp(-1, 2)).toThrow();
    expect(() => divideRoundHalfUp(1, 0)).toThrow();
  });

  it('proportionalReversalCents mirrors the R2 arithmetic', () => {
    // commission 900 on gross 4900, refund 1000 → 900000/4900 = 183.67… → 184
    expect(proportionalReversalCents(900, 4900, 1000)).toBe(184);
    // full refund → full commission
    expect(proportionalReversalCents(900, 4900, 4900)).toBe(900);
  });
});

// ── reversal decision — lockstep with refundAdjustments (R1–R5) ───────────────

describe('decideReversal — lockstep with applyRefund/applyDisputeLost', () => {
  const entry = { entryId: 'entry-1', commissionCents: 900, grossCents: 4900, currency: 'eur' as const };

  it('replays a partial-refund chain identically to the domain module (incl. the cap)', () => {
    const refunds = [1000, 2000, 4900]; // last one overshoots → cap
    let domainPrior: CommissionAdjustment[] = [];
    let mirrorPriorSum = 0;
    refunds.forEach((refundedGrossCents, i) => {
      const domainResult = applyRefund(entry, domainPrior, {
        sourceEventId: `re_fake_${i}`,
        refundedGrossCents,
      });
      const mirrorResult = decideReversal({
        commissionCents: entry.commissionCents,
        grossCents: entry.grossCents,
        refundedGrossCents,
        priorAdjustmentsSumCents: mirrorPriorSum,
      });
      expect(mirrorResult.apply, `refund ${i}`).toBe(domainResult.applied);
      if (domainResult.applied && mirrorResult.apply) {
        expect(mirrorResult.amountCents, `refund ${i}`).toBe(domainResult.adjustment.amountCents);
        domainPrior = [...domainPrior, domainResult.adjustment];
        mirrorPriorSum += mirrorResult.amountCents;
      }
    });
    // fully reversed: nothing left for a further refund
    expect(
      decideReversal({
        commissionCents: 900,
        grossCents: 4900,
        refundedGrossCents: 100,
        priorAdjustmentsSumCents: mirrorPriorSum,
      }),
    ).toEqual({ apply: false, reason: 'nothing_left_to_reverse' });
  });

  it('full reversal (refundedGrossCents null) mirrors applyDisputeLost — remaining only', () => {
    const partial = applyRefund(entry, [], { sourceEventId: 're_fake_a', refundedGrossCents: 1000 });
    expect(partial.applied).toBe(true);
    const prior = partial.applied ? [partial.adjustment] : [];
    const domainResult = applyDisputeLost(entry, prior, { sourceEventId: 'dp_fake_1' });
    const mirrorResult = decideReversal({
      commissionCents: 900,
      grossCents: 4900,
      refundedGrossCents: null,
      priorAdjustmentsSumCents: partial.applied ? partial.adjustment.amountCents : 0,
    });
    expect(domainResult.applied).toBe(true);
    expect(mirrorResult.apply).toBe(true);
    if (domainResult.applied && mirrorResult.apply) {
      expect(mirrorResult.amountCents).toBe(domainResult.adjustment.amountCents);
      expect(mirrorResult.fullyReversedAfter).toBe(true);
    }
  });
});

// ── entitlement mirror — three-way lockstep with planFromSubscription ────────

describe('decideEntitlementMirror — mirror of planFromSubscription via the resolver', () => {
  const NOW = new Date('2026-07-16T12:00:00.000Z');
  const FUTURE = '2026-08-01T00:00:00.000Z';
  const PAST = '2026-06-01T00:00:00.000Z';
  const STATUSES = [
    'active',
    'trialing',
    'past_due',
    'canceled',
    'incomplete',
    'incomplete_expired',
    'unpaid',
    'paused',
    'something_new',
  ];

  it('grants exactly when planFromSubscription grants Pro, for every status × window', () => {
    for (const status of STATUSES) {
      for (const currentPeriodEnd of [FUTURE, PAST, null]) {
        const plan = planFromSubscription(
          {
            stripe_subscription_id: 'sub_fake_1',
            stripe_customer_id: 'cus_fake_1',
            stripe_price_id: null,
            subscription_status: status,
            current_period_end: currentPeriodEnd,
            cancel_at_period_end: false,
          },
          NOW,
        );
        const decision = decideEntitlementMirror(status, currentPeriodEnd);
        // Feed the mirrored grant through the REAL resolver at the same instant:
        const rows = decision.grant
          ? [
              {
                id: 'ent-1',
                scope: 'pro',
                source_type: 'paid_subscription',
                source_id: 'cache-1',
                starts_at: '2026-01-01T00:00:00.000Z',
                ends_at: decision.endsAt,
                status: 'active',
              },
            ]
          : [];
        const resolved = resolveEntitlements(rows, NOW);
        expect(resolved.hasPro, `${status} / ${String(currentPeriodEnd)}`).toBe(plan === 'pro');
      }
    }
  });

  it('past_due grace is bounded by current_period_end, active/trialing open-ended', () => {
    expect(decideEntitlementMirror('active', null)).toEqual({ grant: true, endsAt: null });
    expect(decideEntitlementMirror('trialing', FUTURE)).toEqual({ grant: true, endsAt: null });
    expect(decideEntitlementMirror('past_due', FUTURE)).toEqual({ grant: true, endsAt: FUTURE });
    expect(decideEntitlementMirror('past_due', null)).toEqual({ grant: false });
    expect(decideEntitlementMirror('canceled', FUTURE)).toEqual({ grant: false });
  });

  it('builds only paid_subscription grants, granted_by system:webhook', () => {
    const row = buildEntitlementInsertRow({
      userId: 'user-1',
      product: 'home',
      subscriptionCacheId: 'cache-1',
      endsAt: null,
    });
    expect(row.source_type).toBe('paid_subscription');
    expect(row.granted_by).toBe('system:webhook');
    expect(row.status).toBe('active');
    expect(Object.keys(row).sort()).toEqual([...ENTITLEMENT_INSERT_ROW_KEYS].sort());
  });
});

// ── payload extraction mappers ────────────────────────────────────────────────

describe('extractCheckoutMapping', () => {
  it('maps client_reference_id + customer id', () => {
    expect(
      extractCheckoutMapping({ id: 'cs_fake_1', client_reference_id: 'user-1', customer: 'cus_fake_1' }),
    ).toEqual({ user_id: 'user-1', stripe_customer_id: 'cus_fake_1' });
  });

  it('falls back to metadata.pi_user_id and expanded customer objects', () => {
    expect(
      extractCheckoutMapping({
        id: 'cs_fake_2',
        client_reference_id: null,
        metadata: { pi_user_id: 'user-2' },
        customer: { id: 'cus_fake_2' },
      }),
    ).toEqual({ user_id: 'user-2', stripe_customer_id: 'cus_fake_2' });
  });

  it('refuses when either reference is missing — nothing safe to map', () => {
    expect(extractCheckoutMapping({ id: 'cs_fake_3', customer: 'cus_fake_3' })).toBeNull();
    expect(extractCheckoutMapping({ id: 'cs_fake_4', client_reference_id: 'user-4' })).toBeNull();
  });
});

describe('extractSubscriptionSnapshot — version-robust period extraction', () => {
  it('reads pre-Basil top-level periods', () => {
    const snapshot = extractSubscriptionSnapshot({
      id: 'sub_fake_1',
      customer: 'cus_fake_1',
      status: 'active',
      current_period_start: 1_780_000_000,
      current_period_end: 1_782_000_000,
      cancel_at_period_end: true,
      items: { data: [{ price: { id: 'price_fake_1' } }] },
      latest_invoice: 'in_fake_1',
    });
    expect(snapshot.currentPeriodEndEpoch).toBe(1_782_000_000);
    expect(snapshot.priceId).toBe('price_fake_1');
    expect(snapshot.latestInvoiceId).toBe('in_fake_1');
    expect(snapshot.cancelAtPeriodEnd).toBe(true);
  });

  it('reads Basil item-level periods when top-level is absent', () => {
    const snapshot = extractSubscriptionSnapshot({
      id: 'sub_fake_2',
      customer: { id: 'cus_fake_2' },
      status: 'past_due',
      items: {
        data: [
          {
            price: { id: 'price_fake_2' },
            current_period_start: 1_780_000_000,
            current_period_end: 1_782_000_000,
          },
        ],
      },
    });
    expect(snapshot.customerId).toBe('cus_fake_2');
    expect(snapshot.currentPeriodEndEpoch).toBe(1_782_000_000);
  });
});

describe('extractInvoiceSnapshot — version-robust subscription linkage', () => {
  it('reads the pre-Basil top-level subscription', () => {
    const snapshot = extractInvoiceSnapshot({
      id: 'in_fake_1',
      status: 'paid',
      amount_paid: 4900,
      customer: 'cus_fake_1',
      subscription: 'sub_fake_1',
      payment_intent: 'pi_fake_1',
      status_transitions: { paid_at: 1_780_000_000 },
    });
    expect(snapshot.subscriptionId).toBe('sub_fake_1');
    expect(snapshot.paymentIntentId).toBe('pi_fake_1');
    expect(snapshot.paidAtEpoch).toBe(1_780_000_000);
  });

  it('reads the Basil parent.subscription_details linkage', () => {
    const snapshot = extractInvoiceSnapshot({
      id: 'in_fake_2',
      status: 'paid',
      amount_paid: 999,
      parent: { subscription_details: { subscription: 'sub_fake_2' } },
    });
    expect(snapshot.subscriptionId).toBe('sub_fake_2');
  });
});

describe('commission eligibility + status mapping', () => {
  it('C6 mirror: only paid, positive invoices are commissionable', () => {
    const paid = extractInvoiceSnapshot({ id: 'in_fake_1', status: 'paid', amount_paid: 4900 });
    expect(decideCommissionEligibility(paid)).toEqual({ eligible: true });
    const open = extractInvoiceSnapshot({ id: 'in_fake_2', status: 'open', amount_paid: 4900 });
    expect(decideCommissionEligibility(open)).toEqual({ eligible: false, reason: 'invoice_not_paid' });
    const zero = extractInvoiceSnapshot({ id: 'in_fake_3', status: 'paid', amount_paid: 0 });
    expect(decideCommissionEligibility(zero)).toEqual({ eligible: false, reason: 'zero_value_invoice' });
  });

  it('deleted subscriptions store canceled (mapping.ts mirror)', () => {
    expect(mapSubscriptionStatus('customer.subscription.deleted', 'active')).toBe('canceled');
    expect(mapSubscriptionStatus('customer.subscription.updated', 'past_due')).toBe('past_due');
    expect(mapSubscriptionStatus('customer.subscription.updated', 'brand_new_status')).toBe(
      'brand_new_status',
    );
  });

  it('epochToIso mirrors the v1 mapping', () => {
    expect(epochToIso(1_780_000_000)).toBe(new Date(1_780_000_000 * 1000).toISOString());
    expect(epochToIso(null)).toBeNull();
  });
});

describe('pickAttributionToLock — decision-7 precedence', () => {
  const paidAt = Date.parse('2026-07-10T00:00:00.000Z');
  const candidate = (id: string, method: string, expires: string, created: string) => ({
    id,
    method,
    status: 'pending',
    window_expires_at: expires,
    created_at: created,
  });

  it('explicit code beats an unconverted cookie', () => {
    const picked = pickAttributionToLock(
      [
        candidate('a-cookie', 'referral_link', '2026-08-01T00:00:00Z', '2026-07-05T00:00:00Z'),
        candidate('a-code', 'explicit_code', '2026-08-01T00:00:00Z', '2026-07-01T00:00:00Z'),
      ],
      paidAt,
    );
    expect(picked?.id).toBe('a-code');
  });

  it('expired windows never lock', () => {
    expect(
      pickAttributionToLock(
        [candidate('a-old', 'referral_link', '2026-07-01T00:00:00Z', '2026-06-01T00:00:00Z')],
        paidAt,
      ),
    ).toBeNull();
  });

  it('newest evidence wins within a method', () => {
    const picked = pickAttributionToLock(
      [
        candidate('a-1', 'referral_link', '2026-08-01T00:00:00Z', '2026-07-01T00:00:00Z'),
        candidate('a-2', 'referral_link', '2026-08-01T00:00:00Z', '2026-07-08T00:00:00Z'),
      ],
      paidAt,
    );
    expect(picked?.id).toBe('a-2');
  });
});

// ── closed row payloads — pinned key lists (no unknown key can ride along) ───

describe('closed row payloads', () => {
  it('customer_subscriptions row carries EXACTLY the writer-owned 0015 columns', () => {
    const row = buildCustomerSubscriptionRow({
      eventType: 'customer.subscription.updated',
      userId: 'user-1',
      snapshot: extractSubscriptionSnapshot({
        id: 'sub_fake_1',
        customer: 'cus_fake_1',
        status: 'active',
        items: { data: [{ price: { id: 'price_fake_1' } }] },
      }),
      offer: {
        offer_key: 'home_monthly_standard',
        product: 'home',
        cadence: 'monthly',
        variant: 'standard',
        commission_cadence: 'monthly',
      },
      livemode: false,
    });
    expect(Object.keys(row).sort()).toEqual([...CUSTOMER_SUBSCRIPTION_ROW_KEYS].sort());
    // benefit lifecycle + attribution linkage are orchestrator-owned — never here
    for (const forbidden of [
      'stripe_schedule_id',
      'attribution_id',
      'continuity_armed',
      'benefit_used',
      'latest_payment_intent_id',
    ]) {
      expect(CUSTOMER_SUBSCRIPTION_ROW_KEYS).not.toContain(forbidden);
    }
  });

  it('commission entry row carries EXACTLY the 0018 insert columns, held + eligible_at from the hold calendar', () => {
    const earnedAt = Date.UTC(2026, 0, 15, 12, 0, 0);
    const row = buildCommissionEntryRow({
      partnerId: 'partner-1',
      attributionId: 'attr-1',
      subscriptionCacheId: 'cache-1',
      stripeSubscriptionId: 'sub_fake_1',
      stripeInvoiceId: 'in_fake_1',
      stripePaymentIntentId: 'pi_fake_1',
      offerKey: 'home_yearly_standard',
      product: 'home',
      commissionCadence: 'annual',
      tier: 'standard',
      ruleVersion: 1,
      amountCents: 900,
      earnedAtUtcMs: earnedAt,
      livemode: false,
    });
    expect(Object.keys(row).sort()).toEqual([...COMMISSION_ENTRY_ROW_KEYS].sort());
    expect(row.status).toBe('held');
    expect(row.currency).toBe('eur');
    expect(row.eligible_at).toBe(new Date(holdEligibilityUtcMs(earnedAt)).toISOString());
  });

  it('duplicate deliveries produce byte-identical rows (deterministic mappers)', () => {
    const input = {
      partnerId: 'partner-1',
      attributionId: 'attr-1',
      subscriptionCacheId: 'cache-1',
      stripeSubscriptionId: 'sub_fake_1',
      stripeInvoiceId: 'in_fake_1',
      stripePaymentIntentId: null,
      offerKey: 'pro_yearly_standard',
      product: 'pro',
      commissionCadence: 'annual',
      tier: 'gold',
      ruleVersion: 1,
      amountCents: 3900,
      earnedAtUtcMs: Date.UTC(2026, 6, 1, 8, 0, 0),
      livemode: true,
    };
    expect(buildCommissionEntryRow(input)).toEqual(buildCommissionEntryRow({ ...input }));
  });

  it('adjustment row carries EXACTLY the 0018 append-only columns and only DB-legal kinds', () => {
    const row = buildCommissionAdjustmentRow({
      partnerId: 'partner-1',
      commissionEntryId: 'entry-1',
      amountCents: -184,
      kind: 'refund_reversal',
      reason: 'charge.refunded',
      sourceEventKey: 'obj:re_fake_1',
    });
    expect(Object.keys(row).sort()).toEqual([...COMMISSION_ADJUSTMENT_ROW_KEYS].sort());
    // 0018 CHECK: refund_reversal | dispute_reversal | manual — the mapper's
    // kind union deliberately excludes 'manual' (admin-only) and cannot
    // express 'dispute_reinstatement' (vocabulary gap → skipped_no_contract).
  });

  it('pickLatestRuleVersion selects the highest version cell (rates append, never mutate)', () => {
    expect(
      pickLatestRuleVersion([
        { version: 1, amount_cents: 900 },
        { version: 2, amount_cents: 950 },
      ]),
    ).toEqual({ version: 2, amount_cents: 950 });
    expect(pickLatestRuleVersion([])).toBeNull();
  });
});

// ── connect account mirror + honest no-contract coverage ─────────────────────

describe('connect account mirror + no-contract coverage', () => {
  it('extracts exactly the two 0016 mirror columns', () => {
    expect(
      extractConnectAccountSnapshot({ id: 'acct_fake_1', details_submitted: true, payouts_enabled: false }),
    ).toEqual({ id: 'acct_fake_1', detailsSubmitted: true, payoutsEnabled: false });
  });

  it('charge snapshot lists refunds for per-refund reversal keys', () => {
    const charge = extractChargeSnapshot({
      id: 'ch_fake_1',
      amount: 4900,
      invoice: 'in_fake_1',
      payment_intent: 'pi_fake_1',
      refunds: { data: [{ id: 're_fake_1', amount: 1000, status: 'succeeded', charge: 'ch_fake_1' }] },
    });
    expect(charge.refunds).toHaveLength(1);
    expect(charge.refunds[0]?.id).toBe('re_fake_1');
  });

  it('every supported event is either handled by a writer or an explicit no-contract no-op', () => {
    const HANDLED_KINDS = new Set([
      'checkout_completion',
      'subscription_state_sync',
      'commissionable_payment',
      'invoice_voided',
      'invoice_uncollectible',
      'refund_reversal',
      'dispute_lifecycle',
      'connect_account_status',
    ]);
    for (const eventType of SUPPORTED_WEBHOOK_EVENTS) {
      const intent = routeWebhookEvent(eventType);
      expect(intent, eventType).not.toBeNull();
      const covered = HANDLED_KINDS.has(intent!.kind) || eventType in NO_CONTRACT_REASONS;
      expect(covered, eventType).toBe(true);
    }
  });

  it('no-contract notes are stable, prefixed strings; contracted events have none', () => {
    expect(noContractNote('payout.paid')).toBe('skipped_no_contract:no_stripe_payout_id_column');
    expect(noContractNote('charge.dispute.funds_reinstated')).toBe(
      'skipped_no_contract:adjustment_kind_vocabulary_lacks_reinstatement',
    );
    expect(noContractNote('transfer.reversed')).toBe(
      'skipped_no_contract:adjustment_requires_single_commission_entry',
    );
    // events WITH writers never carry a no-contract note
    for (const eventType of [
      'checkout.session.completed',
      'customer.subscription.updated',
      'invoice.paid',
      'invoice.payment_succeeded',
      'invoice.voided',
      'invoice.marked_uncollectible',
      'charge.refunded',
      'refund.created',
      'refund.updated',
      'charge.refund.updated',
      'charge.dispute.funds_withdrawn',
      'account.updated',
    ]) {
      expect(noContractNote(eventType), eventType).toBeNull();
    }
  });
});
