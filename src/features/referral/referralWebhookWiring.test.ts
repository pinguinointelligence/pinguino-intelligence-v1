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
    const make = (filters: Array<[string, unknown]>): DbSelectQuery => {
      const matches = () => rows.filter((row) => filters.every(([c, v]) => row[c] === v));
      return Object.assign(Promise.resolve({ data: matches(), error: null }), {
        eq: (c: string, v: unknown) => make([...filters, [c, v]]),
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

const invoice = (overrides: Row = {}): Row => ({
  id: 'in_ref_1',
  status: 'paid',
  amount_paid: 2900,
  customer: 'cus_1',
  subscription: 'sub_1',
  payment_intent: 'pi_1',
  status_transitions: { paid_at: PAID_AT },
  ...overrides,
});

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
    if (resource === 'charge') return { id, invoice: 'in_ref_1', amount: 2900, payment_intent: 'pi_1', refunds: { data: [] } };
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
      { db, refetch: refetch(inv) },
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
      { db, refetch: refetch(invoice()) },
      event('invoice.paid', 'evt_2', { id: 'in_ref_1' }),
    );
    expect(db.calls[0]?.args.p_cadence).toBe('monthly');
  });

  it('F7 — an unpaid invoice never reaches the reward recorder', async () => {
    const db = new RewardFakeDb(world());
    const open = invoice({ status: 'open', amount_paid: 0 });
    await applyEventEffects(
      { db, refetch: refetch(open) },
      event('invoice.paid', 'evt_3', { id: 'in_ref_1' }),
    );
    expect(db.calls.filter((c) => c.fn === 'gellatti_record_referral_reward_v1')).toHaveLength(0);
  });

  it('F7 — a zero-value paid invoice never reaches the reward recorder', async () => {
    const db = new RewardFakeDb(world());
    const free = invoice({ amount_paid: 0 });
    await applyEventEffects(
      { db, refetch: refetch(free) },
      event('invoice.paid', 'evt_4', { id: 'in_ref_1' }),
    );
    expect(db.calls.filter((c) => c.fn === 'gellatti_record_referral_reward_v1')).toHaveLength(0);
  });

  it('stays quiet when the customer simply has no user referral', async () => {
    const db = new RewardFakeDb(world());
    db.rpcResult = { ok: false, reason: 'no_referral_attribution' };
    const result = await applyEventEffects(
      { db, refetch: refetch(invoice()) },
      event('invoice.paid', 'evt_5', { id: 'in_ref_1' }),
    );
    expect(result.note).toBe('skipped_no_attribution');
  });

  it('SPEAKS UP when the partner lane won the conversion — the one place they meet', async () => {
    const db = new RewardFakeDb(world());
    db.rpcResult = { ok: false, reason: 'partner_attribution_wins' };
    const result = await applyEventEffects(
      { db, refetch: refetch(invoice()) },
      event('invoice.paid', 'evt_6', { id: 'in_ref_1' }),
    );
    expect(result.note).toContain('referral_reward_skipped:partner_attribution_wins');
  });

  it('F7 — a voided invoice reverses the reward', async () => {
    const db = new RewardFakeDb(world());
    db.rpcResult = { ok: true, reason: 'reversed' };
    const result = await applyEventEffects(
      { db, refetch: refetch(invoice({ status: 'void' })) },
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
      if (resource === 'dispute') return { id: 'dp_1', charge: 'ch_1', amount: 2900 };
      if (resource === 'charge') return { id: 'ch_1', invoice: 'in_ref_1', amount: 2900, payment_intent: 'pi_1', refunds: { data: [] } };
      throw new Error(`refetch miss: ${resource} ${id}`);
    };
    const result = await applyEventEffects(
      { db, refetch: disputeRefetch },
      event('charge.dispute.funds_withdrawn', 'evt_8', { id: 'dp_1' }),
    );
    expect(db.calls.some((c) => c.fn === 'gellatti_reverse_referral_reward_v1')).toBe(true);
    expect(result.note).toContain('referral_reward_reversed');
  });

  it('never writes a commission or payout table from the reward lane', async () => {
    const db = new RewardFakeDb(world());
    await applyEventEffects(
      { db, refetch: refetch(invoice()) },
      event('invoice.paid', 'evt_9', { id: 'in_ref_1' }),
    );
    for (const call of db.calls) {
      expect(call.fn).not.toMatch(/commission|payout|rate_profile|tier_snapshot/);
    }
  });
});
