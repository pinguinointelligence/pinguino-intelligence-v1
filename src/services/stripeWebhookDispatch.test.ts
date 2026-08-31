/**
 * stripe-webhook (v2) — per-intent effect WRITER tests over a fake DB.
 *
 * dispatch.ts takes a minimal structural DB client, so an in-memory fake with
 * the 0018/0015/0003 unique-key semantics exercises every writer end-to-end:
 * happy paths, duplicate-delivery no-ops (byte-identical state), the
 * unknown-price refusal, the round-half-up proportional reversal with cap,
 * and the honest skipped_no_contract intents (zero writes).
 */
import { describe, expect, it } from 'vitest';
import {
  applyEventEffects,
  RetryableEffectError,
  type DbClient,
  type DbError,
  type DbResult,
  type DbSelectQuery,
  type DbTable,
  type DbUpdateQuery,
  type DbUpsertQuery,
  type StripeRefetcher,
  type StripeResource,
  type WebhookEventFacts,
} from '../../supabase/functions/stripe-webhook/dispatch.ts';
import { commissionMonthDate } from '../../supabase/functions/stripe-webhook/effects.ts';

type Row = Record<string, unknown>;

/** Unique keys mirroring migrations 0003/0015/0018 (partial indexes noted). */
const UNIQUE_KEYS: Record<string, Array<{ columns: string[]; onlyWhenActive?: boolean }>> = {
  billing_customers: [{ columns: ['user_id'] }],
  customer_subscriptions: [{ columns: ['stripe_subscription_id'] }],
  commission_entries: [{ columns: ['stripe_invoice_id'] }],
  commission_adjustments: [{ columns: ['source_event_key'] }],
  // 0015 partial unique: one ACTIVE grant per (user, scope, source_type, source_id)
  entitlements: [{ columns: ['user_id', 'scope', 'source_type', 'source_id'], onlyWhenActive: true }],
};

/** Lazy thenable — the fake applies effects only when the chain is awaited. */
class Thenable<T> implements PromiseLike<T> {
  constructor(private readonly compute: () => T) {}
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | undefined | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve()
      .then(() => this.compute())
      .then(onfulfilled, onrejected);
  }
}

class FakeDb implements DbClient {
  tables = new Map<string, Row[]>();
  private idCounter = 0;

  seed(table: string, row: Row): Row {
    const rows = this.tables.get(table) ?? [];
    const stored = { id: `${table}-${++this.idCounter}`, ...row };
    rows.push(stored);
    this.tables.set(table, rows);
    return stored;
  }

  rows(table: string): Row[] {
    return this.tables.get(table) ?? [];
  }

  private violatesUnique(table: string, candidate: Row): boolean {
    for (const key of UNIQUE_KEYS[table] ?? []) {
      if (key.onlyWhenActive && candidate.status !== 'active') continue;
      const clash = this.rows(table).some(
        (existing) =>
          (!key.onlyWhenActive || existing.status === 'active') &&
          key.columns.every(
            (column) => existing[column] != null && existing[column] === candidate[column],
          ),
      );
      if (clash) return true;
    }
    return false;
  }

  from(table: string): DbTable {
    const ok = <T>(data: T): DbResult<T> => ({ data, error: null });
    const fail = <T>(data: T, error: DbError): DbResult<T> => ({ data, error });
    const clone = (row: Row): Row => ({ ...row });

    const makeSelect = (filters: ReadonlyArray<[string, unknown]>): DbSelectQuery => {
      const matches = () =>
        this.rows(table).filter((row) => filters.every(([column, value]) => row[column] === value));
      const query = Object.assign(
        new Thenable<DbResult<Row[] | null>>(() => ok(matches().map(clone))),
        {
          eq: (column: string, value: unknown) => makeSelect([...filters, [column, value]]),
          maybeSingle: () => {
            const first = matches()[0];
            return Promise.resolve(ok<Row | null>(first ? clone(first) : null));
          },
        },
      );
      return query as unknown as DbSelectQuery;
    };

    const makeUpdate = (values: Row, filters: ReadonlyArray<[string, unknown]>): DbUpdateQuery => {
      const query = Object.assign(
        new Thenable<DbResult<unknown>>(() => {
          for (const row of this.rows(table)) {
            if (filters.every(([column, value]) => row[column] === value)) {
              Object.assign(row, values);
            }
          }
          return ok<unknown>(null);
        }),
        {
          eq: (column: string, value: unknown) => makeUpdate(values, [...filters, [column, value]]),
        },
      );
      return query as unknown as DbUpdateQuery;
    };

    return {
      select: () => makeSelect([]),
      insert: (values: Row) => {
        if (this.violatesUnique(table, values)) {
          return Promise.resolve(fail<unknown>(null, { code: '23505', message: 'duplicate key' }));
        }
        this.seed(table, values);
        return Promise.resolve(ok<unknown>(null));
      },
      upsert: (values: Row, options: { onConflict: string; ignoreDuplicates?: boolean }): DbUpsertQuery => {
        const conflictColumns = options.onConflict.split(',');
        const run = (): Row => {
          const existing = this
            .rows(table)
            .find((row) => conflictColumns.every((column) => row[column] === values[column]));
          if (existing) {
            if (!options.ignoreDuplicates) Object.assign(existing, values);
            return existing;
          }
          return this.seed(table, values);
        };
        const query = Object.assign(
          new Thenable<DbResult<unknown>>(() => {
            run();
            return ok<unknown>(null);
          }),
          {
            select: () => ({
              maybeSingle: () => Promise.resolve(ok<Row | null>(clone(run()))),
            }),
          },
        );
        return query as unknown as DbUpsertQuery;
      },
      update: (values: Row) => makeUpdate(values, []),
    };
  }

  /** Deep snapshot for byte-identical no-op assertions. */
  snapshot(): string {
    return JSON.stringify([...this.tables.entries()]);
  }
}

const makeRefetcher = (objects: Partial<Record<StripeResource, Record<string, Row>>>): StripeRefetcher => {
  return (resource, id) => {
    const object = objects[resource]?.[id];
    if (!object) throw new Error(`refetch miss: ${resource} ${id}`);
    return Promise.resolve(object);
  };
};

const event = (type: string, id: string, object: Row, created = 1_781_000_000): WebhookEventFacts => ({
  id,
  type,
  created,
  livemode: false,
  object,
});

// ── checkout completion ───────────────────────────────────────────────────────

describe('checkout_completion writer — billing_customers', () => {
  it('upserts the user ↔ customer mapping; redelivery is a byte-identical no-op', async () => {
    const db = new FakeDb();
    const deps = { db, refetch: makeRefetcher({}) };
    const session = { id: 'cs_fake_1', client_reference_id: 'user-1', customer: 'cus_fake_1' };

    const first = await applyEventEffects(deps, event('checkout.session.completed', 'evt_fake_1', session));
    expect(first.note).toBeNull();
    expect(db.rows('billing_customers')).toHaveLength(1);
    const after = db.snapshot();

    const second = await applyEventEffects(deps, event('checkout.session.completed', 'evt_fake_2', session));
    expect(second.note).toBeNull();
    expect(db.snapshot()).toBe(after);
  });

  it('acknowledges a session without references — nothing safe to map', async () => {
    const db = new FakeDb();
    const result = await applyEventEffects(
      { db, refetch: makeRefetcher({}) },
      event('checkout.session.completed', 'evt_fake_3', { id: 'cs_fake_2' }),
    );
    expect(result.note).toBe('skipped_no_user_or_customer_reference');
    expect(db.rows('billing_customers')).toHaveLength(0);
  });
});

// ── subscription state sync + entitlement mirror ─────────────────────────────

const CATALOG_HOME_MONTHLY: Row = {
  offer_key: 'home_monthly_standard',
  product: 'home',
  cadence: 'monthly',
  variant: 'standard',
  commission_cadence: 'monthly',
  stripe_price_id: 'price_fake_home_m',
};

const subscriptionObject = (status: string, priceId: string): Row => ({
  id: 'sub_fake_1',
  customer: 'cus_fake_1',
  status,
  cancel_at_period_end: false,
  items: { data: [{ price: { id: priceId }, current_period_end: 1_790_000_000 }] },
  latest_invoice: 'in_fake_1',
});

describe('subscription_state_sync writer — customer_subscriptions + entitlements', () => {
  const seedBase = (db: FakeDb) => {
    db.seed('billing_price_catalog', CATALOG_HOME_MONTHLY);
    db.seed('billing_customers', { user_id: 'user-1', stripe_customer_id: 'cus_fake_1' });
  };

  it('writes the cache row and grants the paid_subscription entitlement; redelivery is a no-op', async () => {
    const db = new FakeDb();
    seedBase(db);
    const deps = {
      db,
      refetch: makeRefetcher({ subscription: { sub_fake_1: subscriptionObject('active', 'price_fake_home_m') } }),
    };
    const evt = event('customer.subscription.created', 'evt_fake_10', { id: 'sub_fake_1' });

    expect((await applyEventEffects(deps, evt)).note).toBeNull();
    const cache = db.rows('customer_subscriptions');
    expect(cache).toHaveLength(1);
    expect(cache[0]).toMatchObject({
      user_id: 'user-1',
      offer_key: 'home_monthly_standard',
      product: 'home',
      status: 'active',
    });
    const grants = db.rows('entitlements');
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({
      user_id: 'user-1',
      scope: 'home',
      source_type: 'paid_subscription',
      status: 'active',
      ends_at: null,
      granted_by: 'system:webhook',
    });

    const after = db.snapshot();
    expect(
      (await applyEventEffects(deps, event('customer.subscription.updated', 'evt_fake_11', { id: 'sub_fake_1' })))
        .note,
    ).toBeNull();
    expect(db.snapshot()).toBe(after); // duplicate delivery = byte-identical
  });

  it('NEVER grants on a catalog-unknown price id — no cache row, no entitlement', async () => {
    const db = new FakeDb();
    seedBase(db);
    const deps = {
      db,
      refetch: makeRefetcher({
        subscription: { sub_fake_1: subscriptionObject('active', 'price_fake_not_in_catalog') },
      }),
    };
    const result = await applyEventEffects(
      deps,
      event('customer.subscription.created', 'evt_fake_12', { id: 'sub_fake_1' }),
    );
    expect(result.note).toBe('skipped_unknown_price:price_fake_not_in_catalog');
    expect(db.rows('customer_subscriptions')).toHaveLength(0);
    expect(db.rows('entitlements')).toHaveLength(0);
  });

  it('an unmapped customer is retryable (the checkout race self-heals)', async () => {
    const db = new FakeDb();
    db.seed('billing_price_catalog', CATALOG_HOME_MONTHLY);
    const deps = {
      db,
      refetch: makeRefetcher({ subscription: { sub_fake_1: subscriptionObject('active', 'price_fake_home_m') } }),
    };
    await expect(
      applyEventEffects(deps, event('customer.subscription.created', 'evt_fake_13', { id: 'sub_fake_1' })),
    ).rejects.toThrow(RetryableEffectError);
    expect(db.rows('customer_subscriptions')).toHaveLength(0);
  });

  it('deletion expires the paid entitlement (deleted → canceled)', async () => {
    const db = new FakeDb();
    seedBase(db);
    const activeDeps = {
      db,
      refetch: makeRefetcher({ subscription: { sub_fake_1: subscriptionObject('active', 'price_fake_home_m') } }),
    };
    await applyEventEffects(activeDeps, event('customer.subscription.created', 'evt_fake_14', { id: 'sub_fake_1' }));

    const deletedDeps = {
      db,
      refetch: makeRefetcher({ subscription: { sub_fake_1: subscriptionObject('canceled', 'price_fake_home_m') } }),
    };
    expect(
      (
        await applyEventEffects(
          deletedDeps,
          event('customer.subscription.deleted', 'evt_fake_15', { id: 'sub_fake_1' }),
        )
      ).note,
    ).toBeNull();
    expect(db.rows('customer_subscriptions')[0]?.status).toBe('canceled');
    expect(db.rows('entitlements')[0]?.status).toBe('expired');
  });
});

// ── commissionable payment ────────────────────────────────────────────────────

const PAID_AT_EPOCH = 1_781_000_000; // determines the tier-snapshot month

const invoiceObject = (): Row => ({
  id: 'in_fake_1',
  status: 'paid',
  amount_paid: 4900,
  customer: 'cus_fake_1',
  subscription: 'sub_fake_1',
  payment_intent: 'pi_fake_1',
  status_transitions: { paid_at: PAID_AT_EPOCH },
});

const seedCommissionWorld = (db: FakeDb) => {
  db.seed('billing_price_catalog', {
    offer_key: 'home_yearly_standard',
    product: 'home',
    cadence: 'annual',
    variant: 'standard',
    commission_cadence: 'annual',
    stripe_price_id: 'price_fake_home_y',
  });
  db.seed('customer_subscriptions', {
    id: 'cache-1',
    user_id: 'user-1',
    offer_key: 'home_yearly_standard',
    product: 'home',
    stripe_subscription_id: 'sub_fake_1',
  });
  db.seed('partners', { id: 'partner-1', user_id: 'partner-user-1' });
  db.seed('referral_attributions', {
    id: 'attr-1',
    partner_id: 'partner-1',
    user_id: 'user-1',
    method: 'referral_link',
    status: 'pending',
    window_expires_at: '2027-01-01T00:00:00.000Z',
    created_at: '2026-06-20T00:00:00.000Z',
  });
  db.seed('partner_tier_snapshots', {
    partner_id: 'partner-1',
    month: commissionMonthDate(PAID_AT_EPOCH * 1000),
    tier: 'standard',
  });
  db.seed('commission_rules', { product: 'home', cadence: 'annual', tier: 'standard', version: 1, amount_cents: 900 });
};

describe('commissionable_payment writer — one entry per invoice + attribution lock', () => {
  it('books ONE held entry at the snapshot tier and locks the pending attribution', async () => {
    const db = new FakeDb();
    seedCommissionWorld(db);
    const deps = { db, refetch: makeRefetcher({ invoice: { in_fake_1: invoiceObject() } }) };

    const result = await applyEventEffects(deps, event('invoice.paid', 'evt_fake_20', { id: 'in_fake_1' }));
    expect(result.note).toBeNull();
    const entries = db.rows('commission_entries');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      partner_id: 'partner-1',
      attribution_id: 'attr-1',
      stripe_invoice_id: 'in_fake_1',
      offer_key: 'home_yearly_standard',
      product: 'home',
      cadence: 'annual', // commission cadence, not the offer's billing cadence
      tier: 'standard',
      rule_version: 1,
      amount_cents: 900,
      currency: 'eur',
      status: 'held',
    });
    const attribution = db.rows('referral_attributions')[0];
    expect(attribution?.status).toBe('active');
    expect(attribution?.stripe_subscription_id).toBe('sub_fake_1');
    expect(attribution?.locked_at).toBe(new Date(PAID_AT_EPOCH * 1000).toISOString());
  });

  it('invoice.payment_succeeded for the same invoice can never double-book', async () => {
    const db = new FakeDb();
    seedCommissionWorld(db);
    const deps = { db, refetch: makeRefetcher({ invoice: { in_fake_1: invoiceObject() } }) };
    await applyEventEffects(deps, event('invoice.paid', 'evt_fake_21', { id: 'in_fake_1' }));
    const after = db.snapshot();

    const replay = await applyEventEffects(
      deps,
      event('invoice.payment_succeeded', 'evt_fake_22', { id: 'in_fake_1' }),
    );
    expect(replay.note).toBe('skipped_duplicate_invoice_entry');
    expect(db.rows('commission_entries')).toHaveLength(1);
    expect(db.snapshot()).toBe(after);
  });

  it('refuses self-referrals (C6) — no entry, attribution NOT locked', async () => {
    const db = new FakeDb();
    seedCommissionWorld(db);
    const partner = db.rows('partners')[0];
    if (partner) partner.user_id = 'user-1'; // the partner IS the payer
    const deps = { db, refetch: makeRefetcher({ invoice: { in_fake_1: invoiceObject() } }) };
    const result = await applyEventEffects(deps, event('invoice.paid', 'evt_fake_23', { id: 'in_fake_1' }));
    expect(result.note).toBe('skipped_self_referral');
    expect(db.rows('commission_entries')).toHaveLength(0);
    expect(db.rows('referral_attributions')[0]?.status).toBe('pending');
  });

  it('no attribution → no commission (honest note, still processed)', async () => {
    const db = new FakeDb();
    seedCommissionWorld(db);
    db.tables.set('referral_attributions', []);
    const deps = { db, refetch: makeRefetcher({ invoice: { in_fake_1: invoiceObject() } }) };
    const result = await applyEventEffects(deps, event('invoice.paid', 'evt_fake_24', { id: 'in_fake_1' }));
    expect(result.note).toBe('skipped_no_attribution');
    expect(db.rows('commission_entries')).toHaveLength(0);
  });

  it('T6: a missing month tier snapshot is retryable — never another month, never a guess', async () => {
    const db = new FakeDb();
    seedCommissionWorld(db);
    db.tables.set('partner_tier_snapshots', []);
    const deps = { db, refetch: makeRefetcher({ invoice: { in_fake_1: invoiceObject() } }) };
    await expect(
      applyEventEffects(deps, event('invoice.paid', 'evt_fake_25', { id: 'in_fake_1' })),
    ).rejects.toThrow(/tier_snapshot_missing/);
    expect(db.rows('commission_entries')).toHaveLength(0);
  });

  it('an unpaid invoice never books commission', async () => {
    const db = new FakeDb();
    seedCommissionWorld(db);
    const openInvoice = { ...invoiceObject(), status: 'open' };
    const deps = { db, refetch: makeRefetcher({ invoice: { in_fake_1: openInvoice } }) };
    const result = await applyEventEffects(deps, event('invoice.paid', 'evt_fake_26', { id: 'in_fake_1' }));
    expect(result.note).toBe('skipped_not_commissionable:invoice_not_paid');
    expect(db.rows('commission_entries')).toHaveLength(0);
  });
});

// ── refund reversal (proportional, round-half-up, capped) ────────────────────

const seedEntryForReversal = (db: FakeDb) => {
  db.seed('partners', { id: 'partner-1', user_id: 'partner-user-1' });
  db.seed('commission_entries', {
    id: 'entry-1',
    partner_id: 'partner-1',
    amount_cents: 900,
    status: 'held',
    stripe_invoice_id: 'in_fake_1',
    stripe_payment_intent_id: 'pi_fake_1',
  });
};

const chargeObject = (refunds: Row[]): Row => ({
  id: 'ch_fake_1',
  amount: 4900,
  invoice: 'in_fake_1',
  payment_intent: 'pi_fake_1',
  refunds: { data: refunds },
});

describe('refund_reversal writer — commission_adjustments', () => {
  it('appends the round-half-up proportional reversal (900 × 1000 / 4900 → 184)', async () => {
    const db = new FakeDb();
    seedEntryForReversal(db);
    const refund = { id: 're_fake_1', amount: 1000, status: 'succeeded', charge: 'ch_fake_1' };
    const deps = { db, refetch: makeRefetcher({ charge: { ch_fake_1: chargeObject([refund]) } }) };

    const result = await applyEventEffects(deps, event('charge.refunded', 'evt_fake_30', { id: 'ch_fake_1' }));
    expect(result.note).toBeNull();
    const adjustments = db.rows('commission_adjustments');
    expect(adjustments).toHaveLength(1);
    expect(adjustments[0]).toMatchObject({
      partner_id: 'partner-1',
      commission_entry_id: 'entry-1',
      amount_cents: -184,
      kind: 'refund_reversal',
      source_event_key: 'obj:re_fake_1',
    });
    expect(db.rows('commission_entries')[0]?.status).toBe('held'); // not fully reversed
  });

  it('the same refund via refund.created is deduplicated by source event key', async () => {
    const db = new FakeDb();
    seedEntryForReversal(db);
    const refund = { id: 're_fake_1', amount: 1000, status: 'succeeded', charge: 'ch_fake_1' };
    const deps = {
      db,
      refetch: makeRefetcher({
        charge: { ch_fake_1: chargeObject([refund]) },
        refund: { re_fake_1: refund },
      }),
    };
    await applyEventEffects(deps, event('charge.refunded', 'evt_fake_31', { id: 'ch_fake_1' }));
    const after = db.snapshot();

    const replay = await applyEventEffects(deps, event('refund.created', 'evt_fake_32', { id: 're_fake_1' }));
    expect(replay.note).toBe('skipped_duplicate_reversal');
    expect(db.rows('commission_adjustments')).toHaveLength(1);
    expect(db.snapshot()).toBe(after);
  });

  it('a follow-up full refund is CAPPED at the remaining commission and flips the entry to reversed', async () => {
    const db = new FakeDb();
    seedEntryForReversal(db);
    const refund1 = { id: 're_fake_1', amount: 1000, status: 'succeeded', charge: 'ch_fake_1' };
    const refund2 = { id: 're_fake_2', amount: 3900, status: 'succeeded', charge: 'ch_fake_1' };
    const deps = {
      db,
      refetch: makeRefetcher({
        charge: { ch_fake_1: chargeObject([refund1, refund2]) },
      }),
    };
    await applyEventEffects(deps, event('charge.refunded', 'evt_fake_33', { id: 'ch_fake_1' }));
    const adjustments = db.rows('commission_adjustments');
    expect(adjustments).toHaveLength(2);
    // -184 then capped remainder -716: total never exceeds the 900 commission (R3)
    expect(adjustments[0]?.amount_cents).toBe(-184);
    expect(adjustments[1]?.amount_cents).toBe(-716);
    expect(db.rows('commission_entries')[0]?.status).toBe('reversed');
  });

  it('a refund with no commission entry is an honest no-op', async () => {
    const db = new FakeDb();
    const refund = { id: 're_fake_9', amount: 500, status: 'succeeded', charge: 'ch_fake_9' };
    const deps = {
      db,
      refetch: makeRefetcher({
        refund: { re_fake_9: refund },
        charge: { ch_fake_9: { id: 'ch_fake_9', amount: 999, invoice: 'in_fake_9', refunds: { data: [refund] } } },
      }),
    };
    const result = await applyEventEffects(deps, event('refund.created', 'evt_fake_34', { id: 're_fake_9' }));
    expect(result.note).toBe('skipped_no_commission_entry_for_refund');
    expect(db.rows('commission_adjustments')).toHaveLength(0);
  });
});

// ── voided/uncollectible invoices + dispute funds_withdrawn ──────────────────

describe('invoice_voided / dispute writers — full reversals', () => {
  it('invoice.voided appends a FULL reversal once (object-scoped key)', async () => {
    const db = new FakeDb();
    seedEntryForReversal(db);
    const voided = { id: 'in_fake_1', status: 'void', amount_paid: 4900, payment_intent: 'pi_fake_1' };
    const deps = { db, refetch: makeRefetcher({ invoice: { in_fake_1: voided } }) };

    expect((await applyEventEffects(deps, event('invoice.voided', 'evt_fake_40', { id: 'in_fake_1' }))).note).toBeNull();
    const adjustments = db.rows('commission_adjustments');
    expect(adjustments).toHaveLength(1);
    expect(adjustments[0]).toMatchObject({
      amount_cents: -900,
      kind: 'refund_reversal',
      reason: 'invoice.voided',
      source_event_key: 'obj:in_fake_1',
    });
    expect(db.rows('commission_entries')[0]?.status).toBe('reversed');

    // marked_uncollectible on the SAME invoice shares the obj: key → no double clawback
    const replay = await applyEventEffects(
      deps,
      event('invoice.marked_uncollectible', 'evt_fake_41', { id: 'in_fake_1' }),
    );
    expect(replay.note).toBe('skipped_duplicate_reversal');
    expect(db.rows('commission_adjustments')).toHaveLength(1);
  });

  it('charge.dispute.funds_withdrawn appends a dispute_reversal of the remaining commission', async () => {
    const db = new FakeDb();
    seedEntryForReversal(db);
    const dispute = { id: 'dp_fake_1', charge: 'ch_fake_1', payment_intent: 'pi_fake_1' };
    const deps = {
      db,
      refetch: makeRefetcher({
        dispute: { dp_fake_1: dispute },
        charge: { ch_fake_1: chargeObject([]) },
      }),
    };
    const result = await applyEventEffects(
      deps,
      event('charge.dispute.funds_withdrawn', 'evt_fake_42', { id: 'dp_fake_1' }),
    );
    expect(result.note).toBeNull();
    expect(db.rows('commission_adjustments')[0]).toMatchObject({
      amount_cents: -900,
      kind: 'dispute_reversal',
      source_event_key: 'obj:dp_fake_1',
    });
    expect(db.rows('commission_entries')[0]?.status).toBe('reversed');
  });

  it('funds_reinstated is an HONEST no-op — 0018 cannot store a reinstatement kind', async () => {
    const db = new FakeDb();
    seedEntryForReversal(db);
    const result = await applyEventEffects(
      { db, refetch: makeRefetcher({}) },
      event('charge.dispute.funds_reinstated', 'evt_fake_43', { id: 'dp_fake_1' }),
    );
    expect(result.note).toBe('skipped_no_contract:adjustment_kind_vocabulary_lacks_reinstatement');
    expect(db.rows('commission_adjustments')).toHaveLength(0);
  });
});

// ── connect account mirror + honest no-contract intents ─────────────────────

describe('connect_account_status writer + skipped_no_contract intents', () => {
  it('mirrors details_submitted/payouts_enabled onto the partner row', async () => {
    const db = new FakeDb();
    db.seed('partners', {
      id: 'partner-1',
      user_id: 'partner-user-1',
      stripe_connect_account_id: 'acct_fake_1',
      onboarding_complete: false,
      payouts_enabled: false,
    });
    const deps = {
      db,
      refetch: makeRefetcher({
        account: { acct_fake_1: { id: 'acct_fake_1', details_submitted: true, payouts_enabled: true } },
      }),
    };
    expect((await applyEventEffects(deps, event('account.updated', 'evt_fake_50', { id: 'acct_fake_1' }))).note).toBeNull();
    expect(db.rows('partners')[0]).toMatchObject({ onboarding_complete: true, payouts_enabled: true });
  });

  it('every no-contract intent records its note and performs ZERO writes', async () => {
    for (const [eventType, objectId] of [
      ['payout.paid', 'po_fake_1'],
      ['payout.failed', 'po_fake_1'],
      ['transfer.reversed', 'tr_fake_1'],
      ['transfer.created', 'tr_fake_1'],
      ['payment_intent.succeeded', 'pi_fake_1'],
      ['subscription_schedule.released', 'sched_fake_1'],
      ['invoice.finalized', 'in_fake_1'],
      ['invoice.payment_failed', 'in_fake_1'],
      ['charge.dispute.created', 'dp_fake_1'],
    ] as const) {
      const db = new FakeDb();
      const result = await applyEventEffects(
        { db, refetch: makeRefetcher({}) },
        event(eventType, 'evt_fake_60', { id: objectId }),
      );
      expect(result.note, eventType).toMatch(/^skipped_no_contract:/);
      expect(db.snapshot(), eventType).toBe(JSON.stringify([]));
    }
  });

  it('no longer treats the delayed checkout events as contract-less', async () => {
    // S-45: `checkout.session.async_payment_succeeded/_failed` used to be
    // honest no-ops ("no_checkout_correlation_table"). They now settle a shop
    // order, so they must NOT report skipped_no_contract — while a session
    // that is not a shop session still writes nothing.
    for (const eventType of [
      'checkout.session.async_payment_succeeded',
      'checkout.session.async_payment_failed',
    ] as const) {
      const db = new FakeDb();
      const result = await applyEventEffects(
        { db, refetch: makeRefetcher({}) },
        event(eventType, 'evt_fake_61', { id: 'cs_fake_1' }),
      );
      expect(result.note, eventType).toBeNull();
      expect(db.snapshot(), eventType).toBe(JSON.stringify([]));
    }
  });
});

// ── shop order settlement (S-45) ─────────────────────────────────────────────

/**
 * S-45. FORENSIC FINDING (2026-08-31): the Shop became `paid` ONLY when the
 * customer's browser returned to the success URL and triggered
 * `shop-order-sync`. Stripe delivered `checkout.session.completed` for order
 * G-20260831-2DA655 at 13:16:13.98 carrying `pi_shop_order_id`, and `paid_at`
 * was written 6.6 s later by that browser return — the canonical webhook was
 * live but shop-blind. Pay-and-close-the-tab meant money captured and the
 * order `pending` for ever.
 *
 * These cover the orderings the payment authority must survive.
 */
const shopSession = (over: Row = {}): Row => ({
  id: 'cs_test_shop_1',
  payment_status: 'paid',
  status: 'complete',
  payment_intent: 'pi_test_shop_1',
  amount_total: 7380,
  currency: 'eur',
  total_details: { amount_shipping: 990, amount_tax: 0 },
  customer_details: { phone: '+48600100200' },
  collected_information: {
    shipping_details: {
      name: 'Gellatti QA Test',
      address: {
        line1: 'ul. Testowa 12', line2: null, postal_code: '00-001',
        city: 'Warszawa', state: null, country: 'PL',
      },
    },
  },
  metadata: { pi_shop_order_id: 'order-1' },
  ...over,
});

const seedOrder = (db: FakeDb, over: Row = {}) =>
  db.seed('shop_orders', {
    id: 'order-1', status: 'pending', paid_at: null,
    subtotal_cents: 6390, currency: 'eur',
    stripe_checkout_session_id: 'cs_test_shop_1',
    ...over,
  });

const settle = (db: FakeDb, session: Row, evt = 'evt_shop_1', type = 'checkout.session.completed') =>
  applyEventEffects({ db, refetch: makeRefetcher({}) }, event(type, evt, session));

describe('shop order settlement — the provider is the payment authority', () => {
  it('settles a paid order the customer never came back for', async () => {
    const db = new FakeDb();
    seedOrder(db);
    const result = await settle(db, shopSession());
    expect(result.note).toBe('shop_order_settled');
    const row = db.rows('shop_orders')[0]!;
    expect(row.status).toBe('paid');
    expect(row.paid_at).toBeTruthy();
    expect(row.total_cents).toBe(7380);
    expect(row.shipping_cents).toBe(990);
    expect(row.tax_cents).toBe(0);
    expect(row.shipping_city).toBe('Warszawa');
    expect(row.shipping_country).toBe('PL');
    expect(row.stripe_payment_intent_id).toBe('pi_test_shop_1');
  });

  it('is a byte-identical no-op on redelivery', async () => {
    const db = new FakeDb();
    seedOrder(db);
    await settle(db, shopSession());
    const after = db.snapshot();
    const second = await settle(db, shopSession(), 'evt_shop_2');
    expect(second.note).toBe('shop_order_already_paid');
    expect(db.snapshot()).toBe(after);
  });

  it('does not re-stamp paid_at when the return path already settled it', async () => {
    const db = new FakeDb();
    seedOrder(db, { status: 'paid', paid_at: '2026-08-31T13:16:20.584Z' });
    const result = await settle(db, shopSession());
    expect(result.note).toBe('shop_order_already_paid');
    expect(db.rows('shop_orders')[0]!.paid_at).toBe('2026-08-31T13:16:20.584Z');
  });

  it('never lets a stale expiry event unpay a paid order', async () => {
    // Monotonic: a late expiry delivery must not regress a settled order.
    const db = new FakeDb();
    seedOrder(db, { status: 'paid', paid_at: '2026-08-31T13:16:20.584Z' });
    const result = await settle(
      db, shopSession({ status: 'expired', payment_status: 'unpaid' }),
      'evt_stale', 'checkout.session.expired',
    );
    expect(result.note).toBe('shop_order_not_paid:paid');
    expect(db.rows('shop_orders')[0]!.status).toBe('paid');
    expect(db.rows('shop_orders')[0]!.paid_at).toBe('2026-08-31T13:16:20.584Z');
  });

  it('never walks a refunded or cancelled order back to paid', async () => {
    for (const terminal of ['refunded', 'cancelled']) {
      const db = new FakeDb();
      seedOrder(db, { status: terminal, paid_at: '2026-08-31T13:00:00.000Z' });
      const result = await settle(db, shopSession());
      expect(result.note).toBe(`shop_order_terminal:${terminal}`);
      expect(db.rows('shop_orders')[0]!.status).toBe(terminal);
    }
  });

  it('leaves an unpaid session alone', async () => {
    const db = new FakeDb();
    seedOrder(db);
    const result = await settle(db, shopSession({ payment_status: 'unpaid' }));
    expect(result.note).toBe('shop_order_not_paid:pending');
    expect(db.rows('shop_orders')[0]!.status).toBe('pending');
  });

  it('cancels an expired session, once, on the real expiry event', async () => {
    const db = new FakeDb();
    seedOrder(db);
    const first = await settle(
      db, shopSession({ status: 'expired', payment_status: 'unpaid' }),
      'evt_shop_exp', 'checkout.session.expired',
    );
    expect(first.note).toBe('shop_order_expired');
    expect(db.rows('shop_orders')[0]!.status).toBe('cancelled');
    const after = db.snapshot();
    const second = await settle(
      db, shopSession({ status: 'expired', payment_status: 'unpaid' }),
      'evt_shop_3', 'checkout.session.expired',
    );
    expect(second.note).toBe('shop_order_terminal:cancelled');
    expect(db.snapshot()).toBe(after);
  });

  it('writes the destination only when the session carries one', async () => {
    const db = new FakeDb();
    seedOrder(db);
    await settle(db, shopSession({ collected_information: null }));
    const row = db.rows('shop_orders')[0]!;
    expect(row.status).toBe('paid');
    expect(row.shipping_city).toBeUndefined();
  });

  it('settles the delayed-payment events too', async () => {
    const db = new FakeDb();
    seedOrder(db);
    const result = await settle(db, shopSession(), 'evt_shop_4', 'checkout.session.async_payment_succeeded');
    expect(result.note).toBeNull();
    expect(db.rows('shop_orders')[0]!.status).toBe('paid');
  });

  it('reports an unknown order rather than inventing one', async () => {
    const db = new FakeDb();
    const result = await settle(db, shopSession());
    expect(result.note).toBe('shop_order_not_found:order-1');
    expect(db.rows('shop_orders')).toHaveLength(0);
  });

  it('refuses an event naming an order it does not belong to', async () => {
    // metadata is attacker-shaped input: naming an order must never settle it.
    const db = new FakeDb();
    seedOrder(db, { stripe_checkout_session_id: 'cs_test_the_real_one' });
    const result = await settle(db, shopSession());
    expect(result.note).toBe('shop_order_session_mismatch:order-1');
    expect(db.rows('shop_orders')[0]!.status).toBe('pending');
  });

  it('refuses a mismatched currency', async () => {
    const db = new FakeDb();
    seedOrder(db);
    const result = await settle(db, shopSession({ currency: 'usd' }));
    expect(result.note).toBe('shop_order_currency_mismatch:usd');
    expect(db.rows('shop_orders')[0]!.status).toBe('pending');
  });

  it('refuses an amount below what the items cost', async () => {
    const db = new FakeDb();
    seedOrder(db);
    const result = await settle(db, shopSession({ amount_total: 100 }));
    expect(result.note).toBe('shop_order_amount_mismatch:100');
    expect(db.rows('shop_orders')[0]!.status).toBe('pending');
  });

  it('accepts an amount above the subtotal — shipping and tax ride on top', async () => {
    const db = new FakeDb();
    seedOrder(db);
    const result = await settle(db, shopSession());
    expect(result.note).toBe('shop_order_settled');
    expect(db.rows('shop_orders')[0]!.status).toBe('paid');
  });

  it('leaves a billing session entirely to the billing writer', async () => {
    const db = new FakeDb();
    const result = await settle(db, { id: 'cs_fake_9', client_reference_id: 'user-9', customer: 'cus_9' });
    expect(result.note).toBeNull();
    expect(db.rows('billing_customers')).toHaveLength(1);
    expect(db.rows('shop_orders')).toHaveLength(0);
  });
});
