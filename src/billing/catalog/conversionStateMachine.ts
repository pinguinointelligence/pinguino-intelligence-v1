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
