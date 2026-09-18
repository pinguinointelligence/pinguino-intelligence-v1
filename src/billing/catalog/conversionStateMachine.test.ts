/**
 * Monthly→annual conversion state machine — EXHAUSTIVE transition matrix
 * (§22.6): every (state × event) pair is asserted, plus the proration-
 * timestamp gate, idempotent duplicate confirm, async (SEPA) entitlement
 * invariants, benefit-consumption invariants and the concurrent-intent
 * winner decision.
 */
import { describe, expect, it } from 'vitest';
import {
  addTwelveMonthsUtc,
  benefitConsumedIn,
  buildConversionQuote,
  MONTHLY_CREDIT_POLICY,
  CONVERSION_TERMINAL_STATES,
  decideActiveIntent,
  entitlementDuring,
  isTerminal,
  newConversionIntent,
  transition,
  type ConversionEvent,
  type ConversionIntent,
  type ConversionState,
  type PreviewQuote,
} from './conversionStateMachine';

const QUOTE: PreviewQuote = {
  creditCents: 1234,
  amountDueCents: 3466,
  taxCents: 599,
  newRenewalDate: '2027-07-11',
  prorationTimestamp: 1_780_000_000,
};

const KEY = 'confirm-key-1';

/** Direct construction of an intent snapshot in any state. */
const intentIn = (state: ConversionState): ConversionIntent => ({
  id: 'intent-1',
  state,
  quote: state === 'draft' ? null : QUOTE,
  confirmIdempotencyKey:
    state === 'confirm_pending' || state === 'payment_processing' || state === 'completed'
      ? KEY
      : null,
  paymentPath: state === 'payment_processing' || state === 'completed' ? 'synchronous' : null,
  createdAt: 1_000,
});

const EVENTS: Record<string, ConversionEvent> = {
  preview: { type: 'preview', quote: QUOTE },
  confirm: { type: 'confirm', prorationTimestamp: QUOTE.prorationTimestamp, idempotencyKey: KEY },
  payment_started: { type: 'payment_started', path: 'synchronous' },
  payment_succeeded: { type: 'payment_succeeded' },
  payment_failed: { type: 'payment_failed' },
  abandon: { type: 'abandon' },
  expire: { type: 'expire' },
};

const ALL_STATES: ConversionState[] = [
  'draft',
  'previewed',
  'confirm_pending',
  'payment_processing',
  'completed',
  'failed',
  'abandoned',
  'expired',
];

/**
 * The locked matrix: state → event → resulting state ('DENY' otherwise).
 * 'REPLAY' = allowed as an idempotent no-transition replay.
 */
const MATRIX: Record<ConversionState, Record<string, ConversionState | 'DENY' | 'REPLAY'>> = {
  draft: {
    preview: 'previewed',
    confirm: 'DENY',
    payment_started: 'DENY',
    payment_succeeded: 'DENY',
    payment_failed: 'DENY',
    abandon: 'abandoned',
    expire: 'DENY',
  },
  previewed: {
    preview: 'previewed', // re-preview refreshes the quote
    confirm: 'confirm_pending',
    payment_started: 'DENY',
    payment_succeeded: 'DENY',
    payment_failed: 'DENY',
    abandon: 'abandoned',
    expire: 'expired',
  },
  confirm_pending: {
    preview: 'DENY',
    confirm: 'REPLAY', // same idempotency key → same result
    payment_started: 'payment_processing',
    payment_succeeded: 'DENY',
    payment_failed: 'DENY',
    abandon: 'abandoned',
    expire: 'expired',
  },
  payment_processing: {
    preview: 'DENY',
    confirm: 'REPLAY',
    payment_started: 'DENY',
    payment_succeeded: 'completed',
    payment_failed: 'failed',
    abandon: 'DENY', // a payment in flight must resolve
    expire: 'DENY',
  },
  completed: {
    preview: 'DENY',
    confirm: 'REPLAY',
    payment_started: 'DENY',
    payment_succeeded: 'DENY',
    payment_failed: 'DENY',
    abandon: 'DENY',
    expire: 'DENY',
  },
  failed: {
    preview: 'DENY',
    confirm: 'DENY',
    payment_started: 'DENY',
    payment_succeeded: 'DENY',
    payment_failed: 'DENY',
    abandon: 'DENY',
    expire: 'DENY',
  },
  abandoned: {
    preview: 'DENY',
    confirm: 'DENY',
    payment_started: 'DENY',
    payment_succeeded: 'DENY',
    payment_failed: 'DENY',
    abandon: 'DENY',
    expire: 'DENY',
  },
  expired: {
    preview: 'DENY',
    confirm: 'DENY',
    payment_started: 'DENY',
    payment_succeeded: 'DENY',
    payment_failed: 'DENY',
    abandon: 'DENY',
    expire: 'DENY',
  },
};

describe('exhaustive transition matrix — every state × every event', () => {
  for (const state of ALL_STATES) {
    for (const [eventName, event] of Object.entries(EVENTS)) {
      const expected = MATRIX[state][eventName]!;
      it(`${state} + ${eventName} → ${expected}`, () => {
        const result = transition(intentIn(state), event);
        if (expected === 'DENY') {
          expect(result.allowed).toBe(false);
          expect(result.intent.state).toBe(state); // denial never mutates
        } else if (expected === 'REPLAY') {
          expect(result.allowed).toBe(true);
          if (!result.allowed) return;
          expect(result.idempotentReplay).toBe(true);
          expect(result.intent.state).toBe(state); // no second transition
        } else {
          expect(result.allowed).toBe(true);
          if (!result.allowed) return;
          expect(result.idempotentReplay).toBe(false);
          expect(result.intent.state).toBe(expected);
        }
      });
    }
  }

  it('terminal states are exactly completed/failed/abandoned/expired', () => {
    expect([...CONVERSION_TERMINAL_STATES].sort()).toEqual(
      ['abandoned', 'completed', 'expired', 'failed'].sort(),
    );
    for (const state of ALL_STATES) {
      expect(isTerminal(state), state).toBe(CONVERSION_TERMINAL_STATES.includes(state));
    }
  });
});

describe('proration-timestamp gate between preview and execute', () => {
  it('a confirm against a DIFFERENT proration timestamp is refused and the state stays previewed', () => {
    const result = transition(intentIn('previewed'), {
      type: 'confirm',
      prorationTimestamp: QUOTE.prorationTimestamp + 1,
      idempotencyKey: KEY,
    });
    expect(result).toMatchObject({
      allowed: false,
      reason: 'proration_timestamp_mismatch',
    });
    expect(result.intent.state).toBe('previewed'); // client re-previews
  });

  it('re-preview refreshes the quote, and only the NEW timestamp confirms', () => {
    const newQuote: PreviewQuote = { ...QUOTE, prorationTimestamp: QUOTE.prorationTimestamp + 60 };
    const repreviewed = transition(intentIn('previewed'), { type: 'preview', quote: newQuote });
    if (!repreviewed.allowed) throw new Error('expected re-preview to be allowed');
    expect(repreviewed.intent.quote).toEqual(newQuote);

    const staleConfirm = transition(repreviewed.intent, {
      type: 'confirm',
      prorationTimestamp: QUOTE.prorationTimestamp,
      idempotencyKey: KEY,
    });
    expect(staleConfirm.allowed).toBe(false);

    const freshConfirm = transition(repreviewed.intent, {
      type: 'confirm',
      prorationTimestamp: newQuote.prorationTimestamp,
      idempotencyKey: KEY,
    });
    expect(freshConfirm.allowed).toBe(true);
  });

  it('the preview quote carries the full locked shape in integer cents', () => {
    const result = transition(newConversionIntent('intent-9', 5), {
      type: 'preview',
      quote: QUOTE,
    });
    if (!result.allowed) throw new Error('expected preview to be allowed');
    expect(result.intent.quote).toEqual({
      creditCents: 1234,
      amountDueCents: 3466,
      taxCents: 599,
      newRenewalDate: '2027-07-11',
      prorationTimestamp: 1_780_000_000,
    });
  });
});

describe('duplicate and conflicting confirms', () => {
  it('the same idempotency key replays idempotently at every post-confirm stage', () => {
    for (const state of ['confirm_pending', 'payment_processing', 'completed'] as const) {
      const result = transition(intentIn(state), EVENTS.confirm!);
      expect(result.allowed, state).toBe(true);
      if (!result.allowed) continue;
      expect(result.idempotentReplay, state).toBe(true);
      expect(result.intent, state).toEqual(intentIn(state)); // byte-identical result
    }
  });

  it('a DIFFERENT idempotency key while a confirm is in flight is refused', () => {
    for (const state of ['confirm_pending', 'payment_processing', 'completed'] as const) {
      const result = transition(intentIn(state), {
        type: 'confirm',
        prorationTimestamp: QUOTE.prorationTimestamp,
        idempotencyKey: 'a-second-key',
      });
      expect(result.allowed, state).toBe(false);
    }
  });
});

describe('async (SEPA) path — entitlement and benefit invariants', () => {
  it('async payment keeps the monthly entitlement intact through the whole processing window', () => {
    const started = transition(intentIn('confirm_pending'), {
      type: 'payment_started',
      path: 'asynchronous',
    });
    if (!started.allowed) throw new Error('expected payment_started to be allowed');
    expect(started.intent.paymentPath).toBe('asynchronous');
    expect(entitlementDuring(started.intent.state)).toBe('monthly');
    expect(benefitConsumedIn(started.intent.state)).toBe(false);
  });

  it('ONLY completed flips entitlement to annual and consumes the benefit', () => {
    for (const state of ALL_STATES) {
      expect(entitlementDuring(state), state).toBe(state === 'completed' ? 'annual' : 'monthly');
      expect(benefitConsumedIn(state), state).toBe(state === 'completed');
    }
  });

  it('failure / expiry / abandon leave monthly intact and the benefit unconsumed', () => {
    for (const state of ['failed', 'expired', 'abandoned'] as const) {
      expect(entitlementDuring(state)).toBe('monthly');
      expect(benefitConsumedIn(state)).toBe(false);
    }
  });
});

describe('concurrent intents — single active winner', () => {
  it('the earliest non-terminal intent wins; later actives are the losers to abandon', () => {
    const decision = decideActiveIntent([
      { id: 'c', state: 'previewed', createdAt: 300 },
      { id: 'a', state: 'confirm_pending', createdAt: 100 },
      { id: 'b', state: 'draft', createdAt: 200 },
      { id: 'z', state: 'completed', createdAt: 50 }, // terminal — not in play
    ]);
    expect(decision).toEqual({ winnerId: 'a', loserIds: ['b', 'c'] });
  });

  it('ties on createdAt break deterministically by id', () => {
    const decision = decideActiveIntent([
      { id: 'b', state: 'draft', createdAt: 100 },
      { id: 'a', state: 'draft', createdAt: 100 },
    ]);
    expect(decision).toEqual({ winnerId: 'a', loserIds: ['b'] });
  });

  it('all-terminal (or empty) → no winner, a fresh draft may start', () => {
    expect(decideActiveIntent([])).toEqual({ winnerId: null, loserIds: [] });
    expect(
      decideActiveIntent([
        { id: 'a', state: 'failed', createdAt: 1 },
        { id: 'b', state: 'expired', createdAt: 2 },
      ]),
    ).toEqual({ winnerId: null, loserIds: [] });
  });
});

describe('credit authority — the whole paid month counts, not Stripe unused time', () => {
  const HOME = { monthlyAmountCents: 999, annualAmountCents: 4900 };
  const PRO = { monthlyAmountCents: 2499, annualAmountCents: 19900 };
  const TS = 1_780_000_000;

  it('charges HOME 39,01 € and PRO 174,01 € on top of the paid month', () => {
    const home = buildConversionQuote({
      ...HOME,
      currentPeriodStart: '2026-09-10',
      prorationTimestamp: TS,
    });
    expect(home.creditCents).toBe(999);
    expect(home.amountDueCents).toBe(3901); // 49,00 − 9,99

    const pro = buildConversionQuote({
      ...PRO,
      currentPeriodStart: '2026-09-10',
      prorationTimestamp: TS,
    });
    expect(pro.creditCents).toBe(2499);
    expect(pro.amountDueCents).toBe(17401); // 199,00 − 24,99
  });

  it('costs the SAME on day 2, day 15 and day 28 of the monthly period', () => {
    const due = (start: string) =>
      buildConversionQuote({ ...HOME, currentPeriodStart: start, prorationTimestamp: TS })
        .amountDueCents;
    // A Stripe unused-time proration would differ at each of these.
    expect(new Set([due('2026-09-02'), due('2026-09-15'), due('2026-09-28')])).toEqual(
      new Set([3901]),
    );
    expect(MONTHLY_CREDIT_POLICY).toBe('full_current_period');
  });

  it('anchors the annual term at the CURRENT period start — the paid month is month 1 of 12', () => {
    const q = buildConversionQuote({
      ...HOME,
      currentPeriodStart: '2026-09-10',
      prorationTimestamp: TS,
    });
    expect(q.annualPeriodStart).toBe('2026-09-10');
    // Twelve months from the paid month's start — NOT thirteen months of access.
    expect(q.newRenewalDate).toBe('2027-09-10');
  });

  it('credits only the CURRENT period — never accumulated historical months', () => {
    // Same quote whether this is the customer's 1st or 30th monthly period:
    // the input carries no history, so no history can be credited.
    const q = buildConversionQuote({
      ...PRO,
      currentPeriodStart: '2024-01-31',
      prorationTimestamp: TS,
    });
    expect(q.creditCents).toBe(2499);
    expect(q.creditCents).toBeLessThanOrEqual(PRO.monthlyAmountCents);
  });

  it('clamps an overflowing day-of-month instead of rolling into March', () => {
    expect(addTwelveMonthsUtc('2028-02-29')).toBe('2029-02-28');
    expect(addTwelveMonthsUtc('2026-01-31')).toBe('2027-01-31');
    expect(addTwelveMonthsUtc('2026-03-31T09:30:00.000Z')).toBe('2027-03-31');
  });

  it('never produces a negative amount due, and adds tax on top of the net', () => {
    const inverted = buildConversionQuote({
      monthlyAmountCents: 9900,
      annualAmountCents: 4900,
      currentPeriodStart: '2026-09-10',
      prorationTimestamp: TS,
    });
    expect(inverted.amountDueCents).toBe(0);
    expect(inverted.creditCents).toBe(4900);

    const taxed = buildConversionQuote({
      ...HOME,
      currentPeriodStart: '2026-09-10',
      prorationTimestamp: TS,
      taxCents: 897,
    });
    expect(taxed.amountDueCents).toBe(3901 + 897);
  });

  it('is accepted by the state machine as a real PreviewQuote', () => {
    const quote = buildConversionQuote({
      ...HOME,
      currentPeriodStart: '2026-09-10',
      prorationTimestamp: TS,
    });
    const previewed = transition(newConversionIntent('c-1', 0), { type: 'preview', quote });
    expect(previewed.allowed).toBe(true);
    const confirmed = transition(
      previewed.allowed ? previewed.intent : newConversionIntent('x', 0),
      {
        type: 'confirm',
        prorationTimestamp: quote.prorationTimestamp,
        idempotencyKey: 'k-1',
      },
    );
    expect(confirmed.allowed).toBe(true);
    expect(quote.effectiveMonthlyCents).toBe(408); // 49 € / 12 ≈ 4,08 €
  });
});
