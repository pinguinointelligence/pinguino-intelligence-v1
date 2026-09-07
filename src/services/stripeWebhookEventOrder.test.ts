/**
 * GROW-010 — the webhook must not depend on the ORDER Stripe delivers in.
 *
 * `checkout.session.completed` and `customer.subscription.created` arrive ~50 ms
 * apart and are processed concurrently. The subscription writer used to need the
 * `billing_customers` mapping that checkout writes, so whichever ran second won;
 * losing threw `customer_not_mapped_yet`, which parked the event for a retry
 * worker that does not exist. Staging stranded a paid PRO annual checkout that
 * way on 2026-09-02 (evt_1UBGETADcB1vieptTwF3i3X2).
 *
 * The contract these tests pin: BOTH orders converge on the SAME final state,
 * for all four products. Order is not allowed to be load-bearing again.
 */
import { describe, expect, it } from 'vitest';
import {
  applyEventEffects,
  type DbClient,
  type DbSelectQuery,
  type DbTable,
  type DbUpdateQuery,
  type DbUpsertQuery,
  type StripeResource,
  type WebhookEventFacts,
} from '../../supabase/functions/stripe-webhook/dispatch.ts';

type Row = Record<string, unknown>;

const USER = 'bf34874e-39bf-4071-9fc3-6d432611cec6';
const CUSTOMER = 'cus_VBdVXHbvDcASte';

/** The four offers, exactly as the live staging catalogue holds them. */
const OFFERS = [
  { key: 'home_monthly_standard', product: 'home', cadence: 'monthly', commission: 'monthly', price: 'price_home_m' },
  { key: 'home_yearly_standard', product: 'home', cadence: 'annual', commission: 'annual', price: 'price_home_a' },
  { key: 'pro_monthly_standard', product: 'pro', cadence: 'monthly', commission: 'monthly', price: 'price_pro_m' },
  { key: 'pro_yearly_standard', product: 'pro', cadence: 'annual', commission: 'annual', price: 'price_pro_a' },
] as const;

class Fake implements DbClient {
  tables = new Map<string, Row[]>();
  private seq = 0;
  constructor() {
    this.tables.set(
      'billing_price_catalog',
      OFFERS.map((o) => ({
        offer_key: o.key, product: o.product, cadence: o.cadence,
        variant: 'standard', commission_cadence: o.commission, stripe_price_id: o.price,
      })),
    );
  }
  rows(t: string): Row[] { return this.tables.get(t) ?? []; }

  from(table: string): DbTable {
    const ok = <T>(data: T) => ({ data, error: null });
    const rowsOf = () => this.tables.get(table) ?? [];
    const select = (f: Array<[string, unknown]>): DbSelectQuery => {
      const hits = () => rowsOf().filter((r) => f.every(([c, v]) => r[c] === v));
      return Object.assign(Promise.resolve(ok(hits().map((r) => ({ ...r })))), {
        eq: (c: string, v: unknown) => select([...f, [c, v]]),
        maybeSingle: () => Promise.resolve(ok(hits()[0] ? { ...hits()[0] } : null)),
      }) as unknown as DbSelectQuery;
    };
    const update = (vals: Row, f: Array<[string, unknown]>): DbUpdateQuery =>
      Object.assign(
        Promise.resolve().then(() => {
          for (const r of rowsOf()) if (f.every(([c, v]) => r[c] === v)) Object.assign(r, vals);
          return ok(null);
        }),
        { eq: (c: string, v: unknown) => update(vals, [...f, [c, v]]) },
      ) as unknown as DbUpdateQuery;

    return {
      select: () => select([]),
      insert: (values: Row) => {
        const list = rowsOf(); list.push({ id: `${table}-${++this.seq}`, ...values });
        this.tables.set(table, list); return Promise.resolve(ok(null));
      },
      upsert: (values: Row, opts: { onConflict: string; ignoreDuplicates?: boolean }): DbUpsertQuery => {
        const cols = opts.onConflict.split(',');
        const run = (): Row => {
          const list = rowsOf();
          const found = list.find((r) => cols.every((c) => r[c] === values[c]));
          if (found) { if (!opts.ignoreDuplicates) Object.assign(found, values); return found; }
          const made = { id: `${table}-${++this.seq}`, ...values };
          list.push(made); this.tables.set(table, list); return made;
        };
        return Object.assign(Promise.resolve().then(() => { run(); return ok(null); }), {
          select: () => ({ maybeSingle: () => Promise.resolve(ok({ ...run() })) }),
        }) as unknown as DbUpsertQuery;
      },
      update: (values: Row) => update(values, []),
    };
  }
  async rpc() { return { data: { ok: false, reason: 'no_referral_attribution' }, error: null }; }
}

const PAID_AT = 1_781_000_000;

const subscriptionObject = (price: string, status = 'active'): Row => ({
  id: 'sub_ord_1', customer: CUSTOMER, status, cancel_at_period_end: false,
  metadata: { pi_user_id: USER, pi_offer_key: 'irrelevant_for_plan_authority' },
  items: { data: [{ price: { id: price }, current_period_end: 1_790_000_000 }] },
  latest_invoice: 'in_ord_1',
});

/** Basil shape: no top-level `subscription`, correlation under `parent`. */
const invoiceObject = (price: string, amountPaid = 4900): Row => ({
  id: 'in_ord_1', status: amountPaid > 0 ? 'paid' : 'open', amount_paid: amountPaid,
  customer: CUSTOMER, payment_intent: 'pi_ord_1',
  status_transitions: { paid_at: PAID_AT },
  parent: {
    type: 'subscription_details',
    subscription_details: { subscription: 'sub_ord_1', metadata: { pi_user_id: USER } },
  },
  lines: { data: [{ pricing: { price_details: { price } } }] },
});

const sessionObject = (): Row => ({
  id: 'cs_ord_1', client_reference_id: USER, customer: CUSTOMER,
});

const ev = (type: string, id: string, object: Row): WebhookEventFacts => ({
  id, type, created: PAID_AT, livemode: false, object,
});

const refetcher = (price: string, status = 'active', amountPaid = 4900) =>
  async (resource: StripeResource): Promise<Row> => {
    if (resource === 'subscription') return subscriptionObject(price, status);
    if (resource === 'invoice') return invoiceObject(price, amountPaid);
    throw new Error(`unexpected refetch: ${resource}`);
  };

/** What the customer actually ends up with — the only thing that must match. */
const finalState = (db: Fake) => ({
  mappings: db.rows('billing_customers').map((r) => `${r.user_id}@${r.stripe_customer_id}`),
  subscriptions: db.rows('customer_subscriptions').map((r) => `${r.user_id}:${r.offer_key}:${r.status}`),
  entitlements: db
    .rows('entitlements')
    .filter((r) => r.status === 'active')
    .map((r) => `${r.user_id}:${r.scope}:${r.source_type}`)
    .sort(),
});

/** Reading row 0 must fail the test, not the type-checker. */
const only = (rows: Row[], what: string): Row => {
  const first = rows[0];
  if (!first) throw new Error(`expected at least one ${what} row, found none`);
  return first;
};

const ORDER_A = ['checkout', 'subscription', 'invoice'] as const;
const ORDER_B = ['subscription', 'invoice', 'checkout'] as const;

const play = async (order: readonly string[], price: string, amountPaid = 4900) => {
  const db = new Fake();
  const deps = { db, refetch: refetcher(price, 'active', amountPaid) };
  let n = 0;
  for (const step of order) {
    n += 1;
    if (step === 'checkout') {
      await applyEventEffects(deps, ev('checkout.session.completed', `e${n}`, sessionObject()));
    } else if (step === 'subscription') {
      await applyEventEffects(deps, ev('customer.subscription.created', `e${n}`, { id: 'sub_ord_1' }));
    } else {
      await applyEventEffects(deps, ev('invoice.paid', `e${n}`, { id: 'in_ord_1' }));
    }
  }
  return db;
};

describe('GROW-010 — delivery order must not change the outcome', () => {
  for (const offer of OFFERS) {
    it(`${offer.key}: ORDER A and ORDER B converge on the same state`, async () => {
      const a = finalState(await play(ORDER_A, offer.price));
      const b = finalState(await play(ORDER_B, offer.price));
      expect(b).toEqual(a);
      // …and that shared state is the one the customer paid for.
      expect(a.subscriptions).toEqual([`${USER}:${offer.key}:active`]);
      expect(a.entitlements).toEqual([`${USER}:${offer.product}:paid_subscription`]);
      expect(a.mappings).toEqual([`${USER}@${CUSTOMER}`]);
    });
  }

  it('ORDER B alone grants PRO annual — the exact staging failure', async () => {
    const db = await play(ORDER_B, 'price_pro_a');
    expect(finalState(db).entitlements).toEqual([`${USER}:pro:paid_subscription`]);
  });

  it('plan authority stays the price→catalog lookup, never pi_offer_key', async () => {
    // The subscription metadata claims a nonsense offer; the PRICE says home
    // monthly, and the price must win.
    const db = await play(ORDER_B, 'price_home_m');
    const cached = only(db.rows('customer_subscriptions'), 'customer_subscriptions');
    expect(cached.offer_key).toBe('home_monthly_standard');
    expect(cached.product).toBe('home');
  });

  it('an unpaid invoice books no commission, in either order', async () => {
    // Entitlement mirrors SUBSCRIPTION status, not one invoice — an active
    // subscription is entitled even if a single invoice is unpaid. What an
    // unpaid invoice must never do is pay anybody.
    for (const order of [ORDER_A, ORDER_B]) {
      const db = await play(order, 'price_pro_a', 0);
      expect(db.rows('commission_entries')).toHaveLength(0);
    }
  });

  it('a subscription that never activated grants nothing', async () => {
    const db = new Fake();
    await applyEventEffects(
      { db, refetch: refetcher('price_pro_a', 'incomplete') },
      ev('customer.subscription.created', 'e1', { id: 'sub_ord_1' }),
    );
    expect(db.rows('entitlements').filter((r) => r.status === 'active')).toHaveLength(0);
    // …but the subscription is still cached, so the state is knowable.
    expect(only(db.rows('customer_subscriptions'), 'customer_subscriptions').status).toBe('incomplete');
  });

  it('replaying every event twice changes nothing', async () => {
    const db = new Fake();
    const deps = { db, refetch: refetcher('price_pro_a') };
    const events: Array<[string, Row]> = [
      ['checkout.session.completed', sessionObject()],
      ['customer.subscription.created', { id: 'sub_ord_1' }],
      ['invoice.paid', { id: 'in_ord_1' }],
    ];
    for (const [type, obj] of events) await applyEventEffects(deps, ev(type, `first-${type}`, obj));
    const once = JSON.stringify(finalState(db));
    for (const [type, obj] of events) await applyEventEffects(deps, ev(type, `again-${type}`, obj));
    expect(JSON.stringify(finalState(db))).toBe(once);
    expect(db.rows('customer_subscriptions')).toHaveLength(1);
    expect(db.rows('billing_customers')).toHaveLength(1);
  });

  it('FAILS CLOSED when the mapping names a different user than the metadata', async () => {
    const db = new Fake();
    db.tables.set('billing_customers', [
      { user_id: '11111111-2222-3333-4444-555555555555', stripe_customer_id: CUSTOMER },
    ]);
    await expect(
      applyEventEffects(
        { db, refetch: refetcher('price_pro_a') },
        ev('customer.subscription.created', 'e1', { id: 'sub_ord_1' }),
      ),
    ).rejects.toThrow(/customer_user_conflict/);
    // Nothing was granted, and the existing mapping was not overwritten.
    expect(db.rows('entitlements')).toHaveLength(0);
    expect(only(db.rows('billing_customers'), 'billing_customers').user_id).toBe(
      '11111111-2222-3333-4444-555555555555',
    );
  });

  it('a malformed pi_user_id is refused, never guessed', async () => {
    const db = new Fake();
    const bad = async (resource: StripeResource): Promise<Row> => {
      if (resource === 'subscription') {
        return { ...subscriptionObject('price_pro_a'), metadata: { pi_user_id: 'not-a-uuid' } };
      }
      return invoiceObject('price_pro_a');
    };
    await expect(
      applyEventEffects({ db, refetch: bad }, ev('customer.subscription.created', 'e1', { id: 'sub_ord_1' })),
    ).rejects.toThrow(/customer_not_mapped_yet/);
    expect(db.rows('billing_customers')).toHaveLength(0);
    expect(db.rows('entitlements')).toHaveLength(0);
  });
});
