/**
 * REFER-A-FRIEND webhook wiring — the reward lane inside dispatch.ts.
 *
 * The point these tests exist to defend: `applyCommissionablePayment` returns
 * early on `skipped_no_attribution`, and "no partner owns this customer" is
 * EXACTLY the case where a user referral can earn. If the reward were folded
 * into the commission function it would be unreachable in the only situation
 * it applies to, and every test would still pass.
 */
import { describe, expect, it } from 'vitest';
import {
  applyEventEffects,
  type DbClient,
  type DbResult,
  type DbSelectQuery,
  type DbTable,
  type DbUpdateQuery,
  type DbUpsertQuery,
  type StripeResource,
  type WebhookEventFacts,
} from '../../../supabase/functions/stripe-webhook/dispatch.ts';

type Row = Record<string, unknown>;

interface RpcCall {
  fn: string;
  args: Record<string, unknown>;
}

/**
 * A DB fake narrow enough to exercise the reward lane: the two lookups it
 * makes plus a recording RPC. The commission lane is left with no attribution,
 * which is the scenario under test.
 */
class RewardFakeDb implements DbClient {
  readonly calls: RpcCall[] = [];
  rpcResult: unknown = { ok: true, reason: 'earned', bonusDays: 7 };

  constructor(private readonly tables: Record<string, Row[]>) {}

  from(table: string): DbTable {
    const rows = this.tables[table] ?? [];
    type Filter = { column: string; value?: unknown; values?: readonly unknown[] };
    const make = (filters: Filter[]): DbSelectQuery => {
      const passes = (row: Row, filter: Filter) =>
        filter.values ? filter.values.includes(row[filter.column]) : row[filter.column] === filter.value;
      const matches = () => rows.filter((row) => filters.every((filter) => passes(row, filter)));
      return Object.assign(Promise.resolve({ data: matches(), error: null }), {
        eq: (column: string, value: unknown) => make([...filters, { column, value }]),
        in: (column: string, values: readonly unknown[]) => make([...filters, { column, values }]),
        maybeSingle: () =>
          Promise.resolve({ data: matches()[0] ?? null, error: null } as DbResult<Row | null>),
      }) as unknown as DbSelectQuery;
    };
    const noopUpdate = (): DbUpdateQuery =>
      Object.assign(Promise.resolve({ data: null, error: null }), {
        eq: () => noopUpdate(),
      }) as unknown as DbUpdateQuery;
    return {
      select: () => make([]),
      insert: () => Promise.resolve({ data: null, error: null }),
      upsert: () =>
        Object.assign(Promise.resolve({ data: null, error: null }), {
          select: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
        }) as unknown as DbUpsertQuery,
      update: () => noopUpdate(),
    };
  }

  async rpc(fn: string, args: Record<string, unknown>) {
    this.calls.push({ fn, args });
    if (fn === 'gellatti_record_referral_reward_v1' || fn === 'gellatti_reverse_referral_reward_v1') {
      return { data: this.rpcResult, error: null };
    }
    return { data: [], error: null };
  }
}

const PAID_AT = 1_781_000_000;

/** Basil invoice: the subscription is under parent, and no payment is named on it. */
const invoice = (overrides: Row = {}): Row => ({
  id: 'in_ref_1',
  object: 'invoice',
  status: 'paid',
  amount_paid: 2900,
  customer: 'cus_1',
  parent: {
    type: 'subscription_details',
    quote_details: null,
    subscription_details: { metadata: {}, subscription: 'sub_1' },
  },
  status_transitions: { paid_at: PAID_AT },
  ...overrides,
});

/** The InvoicePayment joining in_ref_1 to the PaymentIntent that paid it. */
const invoicePayment: Row = {
  id: 'inpay_ref_1',
  object: 'invoice_payment',
  amount_paid: 2900,
  amount_requested: 2900,
  currency: 'eur',
  invoice: 'in_ref_1',
  is_default: true,
  livemode: false,
  payment: { type: 'payment_intent', payment_intent: 'pi_1' },
  status: 'paid',
  status_transitions: { canceled_at: null, paid_at: PAID_AT },
};

const listAll = async (list: string, filter: string): Promise<Row[]> => {
  if (list === 'invoice_payments_by_invoice') return filter === 'in_ref_1' ? [invoicePayment] : [];
  if (list === 'invoice_payments_by_payment_intent') return filter === 'pi_1' ? [invoicePayment] : [];
  if (list === 'refunds_by_charge') return [];
  throw new Error(`unexpected Stripe list: ${list}`);
};

const world = (catalogCadence = 'annual', product = 'pro'): Record<string, Row[]> => ({
  // No referral_attributions row at all: the commission lane has nothing.
  referral_attributions: [],
  customer_subscriptions: [
    { id: 'cache-1', user_id: 'referred-user', offer_key: 'pro_yearly_standard', product, stripe_subscription_id: 'sub_1' },
  ],
  billing_price_catalog: [
    { offer_key: 'pro_yearly_standard', commission_cadence: catalogCadence },
  ],
  commission_entries: [],
});

const refetch = (object: Row) =>
  async (resource: StripeResource, id: string): Promise<Row> => {
    if (resource === 'invoice' && id === object.id) return object;
    if (resource === 'charge') return { id, object: 'charge', amount: 2900, payment_intent: 'pi_1' };
    throw new Error(`refetch miss: ${resource} ${id}`);
  };

const event = (type: string, id: string, object: Row): WebhookEventFacts => ({
  id,
  type,
  created: PAID_AT,
  livemode: false,
  object,
});

describe('refer-a-friend — the reward lane runs where the commission lane cannot', () => {
  it('records a reward on a paid invoice with NO partner attribution', async () => {
    const db = new RewardFakeDb(world());
    const inv = invoice();
    const result = await applyEventEffects(
      { db, refetch: refetch(inv), listAll },
      event('invoice.paid', 'evt_1', { id: 'in_ref_1' }),
    );

    const call = db.calls.find((c) => c.fn === 'gellatti_record_referral_reward_v1');
    expect(call).toBeDefined();
    expect(call?.args).toMatchObject({
      p_referred_user_id: 'referred-user',
      p_stripe_subscription_id: 'sub_1',
      p_stripe_invoice_id: 'in_ref_1',
      p_product: 'pro',
      p_cadence: 'annual',
      p_livemode: false,
    });
    // The commission lane skipped; the note still reports the reward.
    expect(result.note).toContain('referral_reward_earned:7d');
    expect(result.note).toContain('skipped_no_attribution');
  });

  it('reads cadence from the SAME catalogue column the commission lane uses', async () => {
    const db = new RewardFakeDb(world('monthly'));
    await applyEventEffects(
      { db, refetch: refetch(invoice()), listAll },
      event('invoice.paid', 'evt_2', { id: 'in_ref_1' }),
    );
    expect(db.calls[0]?.args.p_cadence).toBe('monthly');
  });

  it('F7 — an unpaid invoice never reaches the reward recorder', async () => {
    const db = new RewardFakeDb(world());
    const open = invoice({ status: 'open', amount_paid: 0 });
    await applyEventEffects(
      { db, refetch: refetch(open), listAll },
      event('invoice.paid', 'evt_3', { id: 'in_ref_1' }),
    );
    expect(db.calls.filter((c) => c.fn === 'gellatti_record_referral_reward_v1')).toHaveLength(0);
  });

  it('F7 — a zero-value paid invoice never reaches the reward recorder', async () => {
    const db = new RewardFakeDb(world());
    const free = invoice({ amount_paid: 0 });
    await applyEventEffects(
      { db, refetch: refetch(free), listAll },
      event('invoice.paid', 'evt_4', { id: 'in_ref_1' }),
    );
    expect(db.calls.filter((c) => c.fn === 'gellatti_record_referral_reward_v1')).toHaveLength(0);
  });

  it('stays quiet when the customer simply has no user referral', async () => {
    const db = new RewardFakeDb(world());
    db.rpcResult = { ok: false, reason: 'no_referral_attribution' };
    const result = await applyEventEffects(
      { db, refetch: refetch(invoice()), listAll },
      event('invoice.paid', 'evt_5', { id: 'in_ref_1' }),
    );
    expect(result.note).toBe('skipped_no_attribution');
  });

  it('SPEAKS UP when the partner lane won the conversion — the one place they meet', async () => {
    const db = new RewardFakeDb(world());
    db.rpcResult = { ok: false, reason: 'partner_attribution_wins' };
    const result = await applyEventEffects(
      { db, refetch: refetch(invoice()), listAll },
      event('invoice.paid', 'evt_6', { id: 'in_ref_1' }),
    );
    expect(result.note).toContain('referral_reward_skipped:partner_attribution_wins');
  });

  it('F7 — a voided invoice reverses the reward', async () => {
    const db = new RewardFakeDb(world());
    db.rpcResult = { ok: true, reason: 'reversed' };
    const result = await applyEventEffects(
      { db, refetch: refetch(invoice({ status: 'void' })), listAll },
      event('invoice.voided', 'evt_7', { id: 'in_ref_1' }),
    );
    const call = db.calls.find((c) => c.fn === 'gellatti_reverse_referral_reward_v1');
    expect(call?.args).toMatchObject({ p_stripe_invoice_id: 'in_ref_1', p_reason: 'invoice.voided' });
    expect(result.note).toContain('referral_reward_reversed');
  });

  it('F7 — a lost dispute reverses the reward', async () => {
    const db = new RewardFakeDb(world());
    db.rpcResult = { ok: true, reason: 'reversed' };
    const disputeRefetch = async (resource: StripeResource, id: string): Promise<Row> => {
      if (resource === 'dispute') return { id: 'dp_1', object: 'dispute', charge: 'ch_1', amount: 2900, payment_intent: 'pi_1', status: 'lost' };
      if (resource === 'charge') return { id: 'ch_1', object: 'charge', amount: 2900, payment_intent: 'pi_1' };
      /* The commission lane now asks the invoice whether an entry was ever due
         before it calls "no entry" an honest no-op. This world has no partner
         attribution at all — the reward lane is the one that owns this payment. */
      if (resource === 'invoice') {
        return {
          id: 'in_ref_1',
          object: 'invoice',
          status: 'paid',
          amount_paid: 2900,
          customer: 'cus_ref_1',
          parent: { type: 'subscription_details', quote_details: null, subscription_details: { metadata: {}, subscription: 'sub_1' } },
          status_transitions: { finalized_at: 1_781_000_000, paid_at: 1_781_000_000 },
        };
      }
      throw new Error(`refetch miss: ${resource} ${id}`);
    };
    const result = await applyEventEffects(
      { db, refetch: disputeRefetch, listAll },
      event('charge.dispute.funds_withdrawn', 'evt_8', { id: 'dp_1' }),
    );
    expect(db.calls.some((c) => c.fn === 'gellatti_reverse_referral_reward_v1')).toBe(true);
    expect(result.note).toContain('referral_reward_reversed');
  });

  it('never writes a commission or payout table from the reward lane', async () => {
    const db = new RewardFakeDb(world());
    await applyEventEffects(
      { db, refetch: refetch(invoice()), listAll },
      event('invoice.paid', 'evt_9', { id: 'in_ref_1' }),
    );
    for (const call of db.calls) {
      expect(call.fn).not.toMatch(/commission|payout|rate_profile|tier_snapshot/);
    }
  });
});
