/**
 * Monthly → annual (partner benefit) conversion — PURE state machine.
 *
 * The conversion flow the app drives INSIDE Pinguino (never the Stripe
 * portal): preview a proration quote, confirm against the SAME proration
 * timestamp, execute payment (synchronous card or asynchronous SEPA), and
 * only flip entitlement/benefit on definitive success.
 *
 * Locked semantics (§22.6, test-pinned exhaustively):
 *  - states: draft → previewed → confirm_pending → payment_processing →
 *    completed | failed | abandoned | expired;
 *  - a confirm is valid ONLY against the exact proration timestamp of the
 *    stored preview quote — anything else demands a fresh preview;
 *  - the preview quote carries {creditCents, amountDueCents, taxCents,
 *    newRenewalDate, prorationTimestamp} — integer cents, no floats;
 *  - ASYNC (SEPA) payments keep the MONTHLY entitlement fully intact while
 *    `payment_processing`; only `completed` switches entitlement to annual;
 *  - failed / expired / abandoned: monthly stays intact AND the single-use
 *    benefit is NOT consumed (only `completed` consumes it);
 *  - duplicate confirm with the SAME idempotency key is an idempotent
 *    replay (same result, no second transition); a DIFFERENT key while a
 *    confirm is in flight is refused;
 *  - concurrent intents: exactly one active winner (deterministic decision).
 */

export type ConversionState =
  | 'draft'
  | 'previewed'
  | 'confirm_pending'
  | 'payment_processing'
  | 'completed'
  | 'failed'
  | 'abandoned'
  | 'expired';

export const CONVERSION_TERMINAL_STATES: readonly ConversionState[] = [
  'completed',
  'failed',
  'abandoned',
  'expired',
];

export function isTerminal(state: ConversionState): boolean {
  return CONVERSION_TERMINAL_STATES.includes(state);
}

/** The proration preview quote — integer cents only. */
export interface PreviewQuote {
  creditCents: number;
  amountDueCents: number;
  taxCents: number;
  /** ISO date the annual subscription would renew on after conversion. */
  newRenewalDate: string;
  /** Stripe proration timestamp the quote was computed at (epoch seconds). */
  prorationTimestamp: number;
}

export type PaymentPath = 'synchronous' | 'asynchronous';

/** The full intent snapshot the machine transitions over. */
export interface ConversionIntent {
  id: string;
  state: ConversionState;
  quote: PreviewQuote | null;
  confirmIdempotencyKey: string | null;
  paymentPath: PaymentPath | null;
  /** Epoch millis; used only by the concurrent-winner decision. */
  createdAt: number;
}

export function newConversionIntent(id: string, createdAt: number): ConversionIntent {
  return {
    id,
    state: 'draft',
    quote: null,
    confirmIdempotencyKey: null,
    paymentPath: null,
    createdAt,
  };
}

export type ConversionEvent =
  | { type: 'preview'; quote: PreviewQuote }
  | { type: 'confirm'; prorationTimestamp: number; idempotencyKey: string }
  | { type: 'payment_started'; path: PaymentPath }
  | { type: 'payment_succeeded' }
  | { type: 'payment_failed' }
  | { type: 'abandon' }
  | { type: 'expire' };

export type DenialReason =
  | 'invalid_from_state'
  | 'proration_timestamp_mismatch'
  | 'conflicting_confirm_key'
  | 'no_quote';

export type TransitionResult =
  | { allowed: true; intent: ConversionIntent; idempotentReplay: boolean }
  | { allowed: false; reason: DenialReason; intent: ConversionIntent };

const deny = (intent: ConversionIntent, reason: DenialReason): TransitionResult => ({
  allowed: false,
  reason,
  intent,
});

const move = (
  intent: ConversionIntent,
  patch: Partial<ConversionIntent>,
  idempotentReplay = false,
): TransitionResult => ({
  allowed: true,
  intent: { ...intent, ...patch },
  idempotentReplay,
});

/**
 * The single transition function. Pure: returns the next intent snapshot (or
 * a denial that leaves the input untouched). Denials NEVER mutate state —
 * a stale confirm leaves the intent previewed so the client re-previews.
 */
export function transition(intent: ConversionIntent, event: ConversionEvent): TransitionResult {
  switch (event.type) {
    case 'preview': {
      // Preview from draft; re-preview refreshes a stale quote.
      if (intent.state === 'draft' || intent.state === 'previewed') {
        return move(intent, { state: 'previewed', quote: event.quote });
      }
      return deny(intent, 'invalid_from_state');
    }

    case 'confirm': {
      // Idempotent replay: the SAME key re-arrives after the confirm was
      // accepted (retry, double click, redelivered request) → same result,
      // no second transition, no second charge.
      if (
        (intent.state === 'confirm_pending' ||
          intent.state === 'payment_processing' ||
          intent.state === 'completed') &&
        intent.confirmIdempotencyKey !== null &&
        intent.confirmIdempotencyKey === event.idempotencyKey
      ) {
        return move(intent, {}, true);
      }
      if (intent.state !== 'previewed') return deny(intent, 'invalid_from_state');
      if (!intent.quote) return deny(intent, 'no_quote');
      if (intent.quote.prorationTimestamp !== event.prorationTimestamp) {
        // The preview the user saw is not the one being executed → refuse;
        // the client must preview again (state unchanged).
        return deny(intent, 'proration_timestamp_mismatch');
      }
      return move(intent, {
        state: 'confirm_pending',
        confirmIdempotencyKey: event.idempotencyKey,
      });
    }

    case 'payment_started': {
      if (intent.state !== 'confirm_pending') return deny(intent, 'invalid_from_state');
      return move(intent, { state: 'payment_processing', paymentPath: event.path });
    }

    case 'payment_succeeded': {
      if (intent.state !== 'payment_processing') return deny(intent, 'invalid_from_state');
      return move(intent, { state: 'completed' });
    }

    case 'payment_failed': {
      if (intent.state !== 'payment_processing') return deny(intent, 'invalid_from_state');
      return move(intent, { state: 'failed' });
    }

    case 'abandon': {
      // A payment in flight cannot be abandoned — it must resolve first.
      if (
        intent.state === 'draft' ||
        intent.state === 'previewed' ||
        intent.state === 'confirm_pending'
      ) {
        return move(intent, { state: 'abandoned' });
      }
      return deny(intent, 'invalid_from_state');
    }

    case 'expire': {
      // Only a quote (or an unexecuted confirm) can go stale.
      if (intent.state === 'previewed' || intent.state === 'confirm_pending') {
        return move(intent, { state: 'expired' });
      }
      return deny(intent, 'invalid_from_state');
    }
  }
}

/**
 * Entitlement during a conversion intent: the monthly subscription stays
 * FULLY intact until definitive success — including the whole asynchronous
 * (SEPA) `payment_processing` window. Only `completed` is annual.
 */
export function entitlementDuring(state: ConversionState): 'monthly' | 'annual' {
  return state === 'completed' ? 'annual' : 'monthly';
}

/** The single-use benefit is consumed by `completed` and nothing else. */
export function benefitConsumedIn(state: ConversionState): boolean {
  return state === 'completed';
}

/**
 * Concurrent intents → single active winner. Deterministic: the EARLIEST
 * created non-terminal intent wins (tie broken by id, ascending); every
 * other non-terminal intent must be abandoned by the caller. No
 * non-terminal intents → no winner (a fresh draft may be created).
 */
export function decideActiveIntent(
  intents: ReadonlyArray<Pick<ConversionIntent, 'id' | 'state' | 'createdAt'>>,
): { winnerId: string | null; loserIds: string[] } {
  const active = intents
    .filter((intent) => !isTerminal(intent.state))
    .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const winner = active[0];
  if (!winner) return { winnerId: null, loserIds: [] };
  return { winnerId: winner.id, loserIds: active.slice(1).map((intent) => intent.id) };
}

/* ------------------------------------- credit authority (owner 2026-09-18) -- */

/**
 * How the monthly → annual credit is computed. This is a BUSINESS rule that
 * deliberately DIVERGES from Stripe's default `create_prorations`:
 *
 *   'full_current_period' — the ENTIRE amount paid for the current monthly
 *   period is credited against the annual price, regardless of how much of
 *   that month has elapsed. Converting on day 2, day 15 or day 28 costs the
 *   customer exactly the same. The annual term then STARTS at the current
 *   monthly period start, so the already-paid month becomes the first month
 *   of the year — twelve new months are NOT appended after it.
 *
 * Stripe's own unused-time proration would credit only the remaining days,
 * which converting late makes strictly worse for the customer; the owner's
 * rule is "you lose nothing by starting monthly", so it is fixed-credit.
 *
 * The constant is named (not implied) so any future change is a visible edit
 * to this authority rather than a silent drift inside a UI component.
 */
export const MONTHLY_CREDIT_POLICY = 'full_current_period' as const;
export type MonthlyCreditPolicy = typeof MONTHLY_CREDIT_POLICY;

export interface ConversionQuoteInput {
  /** Price of the monthly offer the customer is currently paying, in cents. */
  monthlyAmountCents: number;
  /** Price of the annual offer being converted to, in cents. */
  annualAmountCents: number;
  /**
   * Start of the CURRENT paid monthly period (ISO date or datetime). The
   * annual term is anchored here, so the paid month becomes month 1 of 12.
   */
  currentPeriodStart: string;
  /** Stripe proration timestamp the quote is pinned to (epoch seconds). */
  prorationTimestamp: number;
  /** Tax on the amount due, in cents. Defaults to 0 (tax computed server-side). */
  taxCents?: number;
}

/** The preview quote plus the display figures the conversion screen shows. */
export interface ConversionQuote extends PreviewQuote {
  policy: MonthlyCreditPolicy;
  /** The annual price before the credit, in cents. */
  annualAmountCents: number;
  /** ISO date the annual term STARTS on (= the current monthly period start). */
  annualPeriodStart: string;
  /** annualAmountCents / 12, rounded to the cent — the effective monthly. */
  effectiveMonthlyCents: number;
}

/**
 * Add twelve months to an ISO date, UTC, clamping an overflowing day-of-month
 * (29–31 Feb never exists, so 2028-02-29 + 12m → 2029-02-28). Returns `YYYY-MM-DD`.
 */
export function addTwelveMonthsUtc(iso: string): string {
  const base = new Date(iso);
  if (Number.isNaN(base.getTime())) throw new Error(`invalid period start: ${iso}`);
  const year = base.getUTCFullYear() + 1;
  const month = base.getUTCMonth();
  const day = base.getUTCDate();
  const lastDayOfTargetMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const target = new Date(Date.UTC(year, month, Math.min(day, lastDayOfTargetMonth)));
  return target.toISOString().slice(0, 10);
}

/**
 * Build the conversion preview quote under `MONTHLY_CREDIT_POLICY`.
 *
 * Integer cents only. The credit is the full monthly price, capped at the
 * annual price so `amountDueCents` can never go negative (a configuration
 * where a month costs more than a year produces a zero-due quote, never a
 * refund — refunds are not part of this flow).
 *
 * PURE: the server re-computes this same function over the authoritative
 * subscription row before charging; the client preview is never trusted.
 */
export function buildConversionQuote(input: ConversionQuoteInput): ConversionQuote {
  const { monthlyAmountCents, annualAmountCents, currentPeriodStart, prorationTimestamp } = input;
  const taxCents = input.taxCents ?? 0;

  const creditCents = Math.min(monthlyAmountCents, annualAmountCents);
  const amountDueCents = annualAmountCents - creditCents + taxCents;
  const annualPeriodStart = new Date(currentPeriodStart).toISOString().slice(0, 10);

  return {
    policy: MONTHLY_CREDIT_POLICY,
    creditCents,
    amountDueCents,
    taxCents,
    annualAmountCents,
    annualPeriodStart,
    // The annual term runs twelve months from the CURRENT period start, so the
    // already-paid month is month 1 — not a thirteenth month bolted on the end.
    newRenewalDate: addTwelveMonthsUtc(currentPeriodStart),
    effectiveMonthlyCents: Math.round(annualAmountCents / 12),
    prorationTimestamp,
  };
}
