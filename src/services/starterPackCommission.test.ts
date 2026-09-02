/**
 * STARTER PACK COMMISSION — owner-frozen 2026-09-02 (9 EUR standard / 19 gold).
 *
 * These run against the DEPLOYED webhook source, so a pass is a statement about
 * the code Stripe actually calls. The contract under test is that a one-off
 * pack reuses EVERY authority a subscription commission already obeys — the
 * same attribution lock, the same self-referral refusal, the same month's tier
 * snapshot, the same versioned rules table — and adds no second ledger.
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
import { commissionMonthDate } from '../../supabase/functions/stripe-webhook/effects.ts';

type Row = Record<string, unknown>;

const PAID_AT = 1_781_000_000;
const ORDER = 'order-1';
const BUYER = 'buyer-user-1';
const PARTNER = 'partner-1';
const SKU = 'GEL-STARTER-PACK';

interface World {
  tier?: string;
  attributionStatus?: 'active' | 'pending' | 'none';
  packPriceCents?: number;
  quantity?: number;
  partnerOwnedByBuyer?: boolean;
  sku?: string;
  extraItems?: boolean;
  existingEntry?: boolean;
}

class Fake implements DbClient {
  tables = new Map<string, Row[]>();
  private seq = 0;
  constructor(w: World = {}) {
    const tier = w.tier ?? 'standard';
    this.tables.set('shop_orders', [
      // `decideShopSettlement` refuses an order with no expected total — that
      // guard is the reason a session cannot settle an order it does not match.
      { id: ORDER, user_id: BUYER, status: 'pending', paid_at: null,
        expected_total_cents: 5_900, expected_currency: 'eur',
        stripe_checkout_session_id: 'cs_1' },
    ]);
    this.tables.set('shop_order_items', [
      { order_id: ORDER, sku: w.sku ?? SKU, unit_price_cents: w.packPriceCents ?? 5_900, quantity: w.quantity ?? 1 },
      ...(w.extraItems
        ? [
            { order_id: ORDER, sku: 'GEL-DEX-500', unit_price_cents: 490, quantity: 2 },
            { order_id: ORDER, sku: 'GEL-INU-500', unit_price_cents: 990, quantity: 1 },
          ]
        : []),
    ]);
    this.tables.set('partners', [
      { id: PARTNER, user_id: w.partnerOwnedByBuyer ? BUYER : 'someone-else' },
    ]);
    this.tables.set('partner_tier_snapshots', [
      { partner_id: PARTNER, month: commissionMonthDate(PAID_AT * 1000), tier },
    ]);
    this.tables.set('commission_rules', [
      { product: 'shop_starter_pack', cadence: 'one_off', tier: 'standard', version: 1, amount_cents: 900 },
      { product: 'shop_starter_pack', cadence: 'one_off', tier: 'gold', version: 1, amount_cents: 1_900 },
    ]);
    const status = w.attributionStatus ?? 'active';
    this.tables.set(
      'referral_attributions',
      status === 'none'
        ? []
        : [{ id: 'attr-1', partner_id: PARTNER, user_id: BUYER, status, method: 'referral_link',
             window_expires_at: new Date((PAID_AT + 86_400) * 1000).toISOString(),
             created_at: new Date((PAID_AT - 86_400) * 1000).toISOString() }],
    );
    this.tables.set('commission_entries', w.existingEntry
      ? [{ id: 'existing', shop_order_id: ORDER, partner_id: PARTNER, amount_cents: 900 }] : []);
  }
  rows(t: string): Row[] { return this.tables.get(t) ?? []; }

  from(table: string): DbTable {
    const ok = <T>(d: T) => ({ data: d, error: null });
    const list = () => this.tables.get(table) ?? [];
    const sel = (f: Array<[string, unknown]>): DbSelectQuery => {
      const hits = () => list().filter((r) => f.every(([c, v]) => r[c] === v));
      return Object.assign(Promise.resolve(ok(hits().map((r) => ({ ...r })))), {
        eq: (c: string, v: unknown) => sel([...f, [c, v]]),
        maybeSingle: () => Promise.resolve(ok(hits()[0] ? { ...hits()[0] } : null)),
      }) as unknown as DbSelectQuery;
    };
    const upd = (vals: Row, f: Array<[string, unknown]>): DbUpdateQuery =>
      Object.assign(
        Promise.resolve().then(() => {
          for (const r of list()) if (f.every(([c, v]) => r[c] === v)) Object.assign(r, vals);
          return ok(null);
        }),
        { eq: (c: string, v: unknown) => upd(vals, [...f, [c, v]]) },
      ) as unknown as DbUpdateQuery;
    return {
      select: () => sel([]),
      insert: (values: Row) => {
        // The unique index on shop_order_id, modelled.
        if (table === 'user_notifications' && values.dedupe_key) {
          const clash = list().some((r) => r.dedupe_key === values.dedupe_key);
          if (clash) {
            return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } });
          }
        }
        if (table === 'commission_entries' && values.shop_order_id) {
          const clash = list().some((r) => r.shop_order_id === values.shop_order_id);
          if (clash) {
            return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } });
          }
        }
        const l = list(); l.push({ id: `${table}-${++this.seq}`, ...values }); this.tables.set(table, l);
        return Promise.resolve(ok(null));
      },
      upsert: () => Object.assign(Promise.resolve(ok(null)), {
        select: () => ({ maybeSingle: () => Promise.resolve(ok(null)) }),
      }) as unknown as DbUpsertQuery,
      update: (values: Row) => upd(values, []),
    };
  }
  async rpc() { return { data: { ok: false, reason: 'no_referral_attribution' }, error: null }; }
}

const session = (): Row => ({
  id: 'cs_1', mode: 'payment', payment_status: 'paid', status: 'complete',
  amount_total: 5_900, currency: 'eur', payment_intent: 'pi_shop_1',
  metadata: { pi_shop_order_id: ORDER },
});

const ev = (id: string): WebhookEventFacts => ({
  id, type: 'checkout.session.completed', created: PAID_AT, livemode: false, object: session(),
});

const run = async (w: World = {}, eventId = 'evt_1') => {
  const db = new Fake(w);
  const note = await applyEventEffects(
    { db, refetch: async (r: StripeResource) => { throw new Error(`no refetch expected: ${r}`); } },
    ev(eventId),
  );
  return { db, note: note.note };
};
const entries = (db: Fake) => db.rows('commission_entries').filter((r) => r.id !== 'existing');
/** Row 0 must fail the TEST when it is missing, not the type-checker. */
const only = (rows: Row[], what: string): Row => {
  const first = rows[0];
  if (!first) throw new Error(`expected one ${what}, found none`);
  return first;
};

describe('Starter Pack commission', () => {
  it('Standard paid pack books exactly 9 EUR, once', async () => {
    const { db } = await run({ tier: 'standard' });
    expect(entries(db)).toHaveLength(1);
    expect(only(entries(db), 'entry')).toMatchObject({
      partner_id: PARTNER, attribution_id: 'attr-1', shop_order_id: ORDER,
      product: 'shop_starter_pack', cadence: 'one_off', tier: 'standard',
      amount_cents: 900, status: 'held', currency: 'eur',
      stripe_subscription_id: null, stripe_invoice_id: null,
      stripe_payment_intent_id: 'pi_shop_1',
      // No catalogue offer: offer_key is an FK into the SUBSCRIPTION catalogue.
      offer_key: null,
    });
  });

  it('Gold paid pack books 19 EUR', async () => {
    const { db } = await run({ tier: 'gold' });
    expect(only(entries(db), 'entry')).toMatchObject({ tier: 'gold', amount_cents: 1_900 });
  });

  // ELITE must not be guessed AND must not vanish. It reuses the existing
  // admin operational-signal channel — the one STRIPE_WEBHOOK_FAILED uses.
  it('Elite books no commission and never guesses 9 or 19 EUR', async () => {
    const { db, note } = await run({ tier: 'elite' });
    expect(entries(db)).toHaveLength(0);
    expect(note).toContain('skipped_elite_starter_pack_manual');
    // The two automatic rates must appear nowhere in what was written.
    const written = JSON.stringify(db.rows('user_notifications'));
    expect(written).not.toMatch(/"amount_cents"\s*:\s*(900|1900)/);
  });

  it('Elite raises an ACTIONABLE settlement signal for admin/finance', async () => {
    const { db, note } = await run({ tier: 'elite' });
    expect(note).toContain('signalled');
    const signal = only(db.rows('user_notifications'), 'notification');
    expect(signal).toMatchObject({
      admin_permission: 'PARTNER',
      notification_type: 'AFFILIATE_ELITE_STARTER_PACK_MANUAL',
      entity_type: 'shop_orders',
      entity_id: ORDER,
      dedupe_key: `elite_starter_pack:${ORDER}`,
    });
    // Finance needs the facts, not just a ping.
    expect(signal.payload).toMatchObject({
      partner_id: PARTNER,
      shop_order_id: ORDER,
      qualifying_packs: 1,
    });
  });

  it('an Elite sale cannot disappear, and a replay does not spam the signal', async () => {
    const db = new Fake({ tier: 'elite' });
    const deps = { db, refetch: async (r: StripeResource) => { throw new Error(String(r)); } };
    await applyEventEffects(deps, ev('evt_a'));
    // A genuine replay arrives at an order Stripe already settled, with the
    // ORIGINAL payment time recorded — that time is what the tier month is
    // read from, so it must survive the replay.
    const order = only(db.rows('shop_orders'), 'order');
    order.status = 'paid';
    order.paid_at = new Date(PAID_AT * 1000).toISOString();
    const second = await applyEventEffects(deps, ev('evt_b'));
    expect(db.rows('user_notifications')).toHaveLength(1);
    expect(second.note).toContain('already_signalled');
    expect(entries(db)).toHaveLength(0);
  });

  // The hole this closes: settle succeeds, commission fails, and every later
  // delivery refuses early — order paid, partner never paid.
  it('a paid order whose commission never landed is still booked on redelivery', async () => {
    const db = new Fake({ tier: 'standard' });
    const deps = { db, refetch: async (r: StripeResource) => { throw new Error(String(r)); } };
    // The order settled earlier; no commission exists yet.
    const order = only(db.rows('shop_orders'), 'order');
    order.status = 'paid';
    order.paid_at = new Date(PAID_AT * 1000).toISOString();
    expect(entries(db)).toHaveLength(0);
    await applyEventEffects(deps, ev('evt_late'));
    expect(entries(db)).toHaveLength(1);
    expect(only(entries(db), 'entry').amount_cents).toBe(900);
  });

  it('Elite quantity reaches finance so the manual amount is computable', async () => {
    const { db } = await run({ tier: 'elite', quantity: 4 });
    expect(only(db.rows('user_notifications'), 'notification').payload).toMatchObject({
      qualifying_packs: 4,
    });
  });

  it('no attribution → no partner commission', async () => {
    const { db, note } = await run({ attributionStatus: 'none' });
    expect(entries(db)).toHaveLength(0);
    expect(note).toContain('skipped_no_attribution');
  });

  it('a duplicate delivery cannot book twice', async () => {
    const first = await run({ tier: 'standard' });
    expect(entries(first.db)).toHaveLength(1);
    // Same order, already carrying an entry — the unique index refuses.
    const { db, note } = await run({ tier: 'standard', existingEntry: true }, 'evt_2');
    expect(entries(db)).toHaveLength(0);
    expect(note).toContain('skipped_duplicate_shop_order_entry');
  });

  it('a 0 EUR pack earns nothing — the guard is on the money, not the SKU', async () => {
    const { db, note } = await run({ packPriceCents: 0 });
    expect(entries(db)).toHaveLength(0);
    expect(note).toContain('skipped_starter_pack_not_paid');
  });

  it('an order without a pack line earns nothing at all', async () => {
    const { db } = await run({ sku: 'GEL-INU-500' });
    expect(entries(db)).toHaveLength(0);
  });

  it('a partner cannot earn on their own pack', async () => {
    const { db, note } = await run({ partnerOwnedByBuyer: true });
    expect(entries(db)).toHaveLength(0);
    expect(note).toContain('skipped_self_referral');
  });

  it('an in-window PENDING attribution is honoured but NOT consumed', async () => {
    const { db } = await run({ attributionStatus: 'pending' });
    expect(only(entries(db), 'entry')).toMatchObject({ amount_cents: 900, attribution_id: 'attr-1' });
    // A pack must not spend the lock the subscription window was opened for.
    expect(only(db.rows('referral_attributions'), 'attribution').status).toBe('pending');
  });

  // The commission is PER SOLD PACK. One aggregated entry per order keeps the
  // order as the idempotency key, but the amount must scale with quantity.
  it('Standard x4 books exactly 36 EUR, in ONE entry', async () => {
    const { db } = await run({ tier: 'standard', quantity: 4 });
    expect(entries(db)).toHaveLength(1);
    expect(only(entries(db), 'entry').amount_cents).toBe(3_600);
  });

  it('Gold x4 books exactly 76 EUR', async () => {
    const { db } = await run({ tier: 'gold', quantity: 4 });
    expect(only(entries(db), 'entry').amount_cents).toBe(7_600);
  });

  it('a mixed cart earns on the packs only, never on the other products', async () => {
    const { db } = await run({ tier: 'standard', quantity: 4, extraItems: true });
    // 4 packs x 9 EUR — the ingredients in the same cart add nothing.
    expect(only(entries(db), 'entry').amount_cents).toBe(3_600);
  });

  it('other Shop products alone earn no Starter Pack commission', async () => {
    const { db, note } = await run({ sku: 'GEL-INU-500', extraItems: true });
    expect(entries(db)).toHaveLength(0);
    expect(note ?? '').not.toContain('skipped_starter_pack_not_paid');
  });

  it('reads quantity from the order LINES, never from the order total', async () => {
    // A large order total with a single pack must still pay for one pack.
    const { db } = await run({ tier: 'standard', quantity: 1, extraItems: true });
    expect(only(entries(db), 'entry').amount_cents).toBe(900);
  });

  it('writes into the EXISTING ledger, never a parallel one', async () => {
    const { db } = await run();
    expect([...db.tables.keys()].filter((t) => /commission|payout/.test(t))).toEqual([
      'commission_rules',
      'commission_entries',
    ]);
  });
});
