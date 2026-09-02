/**
 * ONE settlement authority, shared by both paths.
 *
 * The webhook and the browser-return reconciliation must not be two payment
 * state machines that happen to agree. They import this, so they agree by
 * construction.
 *
 * PURE — no IO, no Deno APIs — so the app suite can test it directly.
 *
 * The rule: a Checkout Session may settle an order only when it IS that
 * order's session, in the expected mode and currency, carrying EXACTLY the
 * total that was handed to the provider when the session was created, and the
 * provider says the money arrived. "At least the item subtotal" is not enough:
 * a €70, €74 or €100 event must never settle a €73.80 order.
 */

export interface ShopOrderAuthority {
  id: string;
  status: string;
  paidAt: string | null;
  expectedTotalCents: number | null;
  expectedCurrency: string | null;
  sessionId: string | null;
}

export interface ShopSessionFacts {
  orderId: string | null;
  sessionId: string | null;
  mode: string | null;
  paymentStatus: string | null;
  status: string | null;
  amountTotal: number | null;
  currency: string | null;
}

export type SettlementVerdict =
  | { kind: 'settle' }
  | { kind: 'expire' }
  | { kind: 'refuse'; note: string };

/** The mode a Gellatti shop checkout is always created in. */
export const SHOP_CHECKOUT_MODE = 'payment' as const;

/** Terminal states no event may move. */
const TERMINAL = ['refunded', 'cancelled'];

export function decideShopSettlement(
  order: ShopOrderAuthority,
  session: ShopSessionFacts,
): SettlementVerdict {
  // 1. This event must belong to THIS order's session. Metadata alone is
  //    self-description; the recorded session id is the authority.
  if (!session.sessionId) return { kind: 'refuse', note: 'shop_session_id_missing' };
  if (order.sessionId && order.sessionId !== session.sessionId) {
    return { kind: 'refuse', note: `shop_order_session_mismatch:${order.id}` };
  }

  // 2. Terminal states are never regressed, by any event, in any order.
  if (TERMINAL.includes(order.status)) {
    return { kind: 'refuse', note: `shop_order_terminal:${order.status}` };
  }
  if (order.status === 'paid') {
    // An expiry arriving late must not unpay a settled order.
    return { kind: 'refuse', note: 'shop_order_already_paid' };
  }

  // 3. An expired, unpaid session may close a still-pending order.
  if (session.status === 'expired' && session.paymentStatus !== 'paid') {
    return order.status === 'pending'
      ? { kind: 'expire' }
      : { kind: 'refuse', note: `shop_order_not_expirable:${order.status}` };
  }

  // 4. Session completion is NOT payment. The provider must say it was paid —
  //    a completed-but-unpaid session (Bancontact, EPS, MB WAY, Satispay…)
  //    settles later, through async_payment_succeeded, or never.
  if (session.paymentStatus !== 'paid') {
    return { kind: 'refuse', note: `shop_order_not_paid:${session.paymentStatus ?? 'unknown'}` };
  }

  // 5. The mode must be the one the Shop creates.
  if (session.mode && session.mode !== SHOP_CHECKOUT_MODE) {
    return { kind: 'refuse', note: `shop_order_mode_mismatch:${session.mode}` };
  }

  // 6. EXACT money. No tolerance, no "at least".
  if (order.expectedTotalCents === null) {
    return { kind: 'refuse', note: `shop_order_no_expected_total:${order.id}` };
  }
  if (session.amountTotal === null) {
    return { kind: 'refuse', note: 'shop_order_amount_missing' };
  }
  if (session.amountTotal !== order.expectedTotalCents) {
    return {
      kind: 'refuse',
      note: `shop_order_amount_mismatch:${session.amountTotal}!=${order.expectedTotalCents}`,
    };
  }
  const expectedCurrency = (order.expectedCurrency ?? '').toLowerCase();
  const actualCurrency = (session.currency ?? '').toLowerCase();
  if (!expectedCurrency || !actualCurrency || expectedCurrency !== actualCurrency) {
    return { kind: 'refuse', note: `shop_order_currency_mismatch:${actualCurrency || 'none'}` };
  }

  return { kind: 'settle' };
}
