/// <reference types="node" />
/**
 * stripe-webhook (v2, billing platform) — NON-deployed source guards.
 *
 * Mirrors the established stripe-subscription-webhook pattern: the PURE
 * handlers module is unit-tested directly, the Deno entrypoint is pinned at
 * source level (signature-first, insert-first durability, deliberate matrix,
 * 2xx after durable receipt, no secrets), and WEBHOOK_MATRIX.md is
 * lockstep-tested 1:1 against the code's event table.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildIdempotencyKey,
  canTransitionWebhookEventState,
  decideEventApplication,
  decideFailureFollowup,
  routeWebhookEvent,
  SUPPORTED_WEBHOOK_EVENTS,
  WEBHOOK_EVENT_INTENTS,
  WEBHOOK_EVENT_STATE_TRANSITIONS,
  type WebhookEventState,
} from '../../supabase/functions/stripe-webhook/handlers.ts';

const ROOT = resolve(import.meta.dirname, '..', '..');
const fnDir = join(ROOT, 'supabase', 'functions', 'stripe-webhook');
const indexSource = readFileSync(join(fnDir, 'index.ts'), 'utf8');
const handlersSource = readFileSync(join(fnDir, 'handlers.ts'), 'utf8');
const matrixDoc = readFileSync(
  join(ROOT, 'docs', 'billing-partner', 'WEBHOOK_MATRIX.md'),
  'utf8',
);

describe('routing table — the deliberate §13.3 event matrix', () => {
  it('supports exactly the deliberate event list (40 events, no wildcards)', () => {
    expect(SUPPORTED_WEBHOOK_EVENTS).toHaveLength(40);
    expect(new Set(SUPPORTED_WEBHOOK_EVENTS).size).toBe(40);
  });

  it('pins the per-domain event counts', () => {
    const domain = (prefix: string) =>
      SUPPORTED_WEBHOOK_EVENTS.filter((e) => e.startsWith(prefix)).length;
    expect(domain('checkout.session.')).toBe(3);
    expect(domain('customer.subscription.')).toBe(3);
    expect(domain('subscription_schedule.')).toBe(5);
    expect(domain('invoice.')).toBe(7);
    expect(domain('payment_intent.')).toBe(4);
    expect(domain('charge.dispute.')).toBe(5);
    expect(domain('refund.')).toBe(2);
    expect(SUPPORTED_WEBHOOK_EVENTS).toContain('charge.refunded');
    expect(SUPPORTED_WEBHOOK_EVENTS).toContain('charge.refund.updated'); // pinned-API caveat
    expect(domain('account.')).toBe(1);
    expect(domain('transfer.')).toBe(3);
    expect(domain('payout.')).toBe(5);
  });

  it('routes every supported event to a fully-typed intent', () => {
    for (const eventType of SUPPORTED_WEBHOOK_EVENTS) {
      const intent = routeWebhookEvent(eventType);
      expect(intent, eventType).not.toBeNull();
      expect(intent!.kind.length, eventType).toBeGreaterThan(0);
      expect(['event', 'object', 'object_version'], eventType).toContain(
        intent!.idempotencyScope,
      );
      expect(typeof intent!.requiresRefetch, eventType).toBe('boolean');
      expect(intent!.ledgerEffect.length, eventType).toBeGreaterThan(0);
      expect(intent!.localEffects.length, eventType).toBeGreaterThan(0);
    }
  });

  it('anything outside the matrix routes to null (acknowledge, never store)', () => {
    expect(routeWebhookEvent('customer.created')).toBeNull();
    expect(routeWebhookEvent('price.updated')).toBeNull();
    expect(routeWebhookEvent('product.created')).toBeNull();
    expect(routeWebhookEvent('invoice.payment.paid')).toBeNull();
    expect(routeWebhookEvent('')).toBeNull();
  });

  it('subscription lifecycle events re-fetch and use latest-wins versioning', () => {
    for (const eventType of [
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted',
    ]) {
      const intent = routeWebhookEvent(eventType)!;
      expect(intent.kind, eventType).toBe('subscription_state_sync');
      expect(intent.requiresRefetch, eventType).toBe(true);
      expect(intent.idempotencyScope, eventType).toBe('object_version');
    }
  });
});

describe('commissionable payments — one entry per invoice, never doubled', () => {
  it('invoice.paid and invoice.payment_succeeded share the SAME object-scoped intent', () => {
    const paid = routeWebhookEvent('invoice.paid')!;
    const succeeded = routeWebhookEvent('invoice.payment_succeeded')!;
    expect(paid.kind).toBe('commissionable_payment');
    expect(succeeded.kind).toBe('commissionable_payment');
    expect(paid.idempotencyScope).toBe('object');
    expect(succeeded.idempotencyScope).toBe('object');
    // identical invoice → identical local idempotency key for BOTH events
    const parts = { eventId: 'evt_fake_a', objectId: 'in_fake_1', eventCreated: 111 };
    const otherParts = { eventId: 'evt_fake_b', objectId: 'in_fake_1', eventCreated: 222 };
    expect(buildIdempotencyKey(paid.idempotencyScope, parts)).toBe(
      buildIdempotencyKey(succeeded.idempotencyScope, otherParts),
    );
    expect(paid.ledgerEffect).toContain('commission_entries');
  });

  it('failed payments never carry a ledger entry effect', () => {
    for (const eventType of ['invoice.payment_failed', 'invoice.payment_action_required']) {
      const intent = routeWebhookEvent(eventType)!;
      expect(intent.kind, eventType).toBe('payment_failure_notice');
      expect(intent.ledgerEffect, eventType).toContain('none');
    }
  });

  it('reversal-class events append to commission_adjustments (history never mutated)', () => {
    for (const eventType of [
      'invoice.voided',
      'invoice.marked_uncollectible',
      'charge.refunded',
      'refund.created',
      'refund.updated',
      'charge.refund.updated',
      'charge.dispute.funds_withdrawn',
      'transfer.reversed',
      'payout.failed',
      'payout.canceled',
    ]) {
      const intent = routeWebhookEvent(eventType)!;
      expect(
        intent.ledgerEffect.includes('commission_adjustments') ||
          intent.localEffects.some((e) => e.includes('commission_adjustments')),
        eventType,
      ).toBe(true);
    }
  });
});

describe('idempotency keys — deterministic per scope', () => {
  const parts = { eventId: 'evt_fake_1', objectId: 'sub_fake_1', eventCreated: 1_780_000_000 };

  it('builds the three locked shapes', () => {
    expect(buildIdempotencyKey('event', parts)).toBe('evt:evt_fake_1');
    expect(buildIdempotencyKey('object', parts)).toBe('obj:sub_fake_1');
    expect(buildIdempotencyKey('object_version', parts)).toBe('objv:sub_fake_1:1780000000');
  });

  it('is deterministic — same input, same key', () => {
    expect(buildIdempotencyKey('object_version', parts)).toBe(
      buildIdempotencyKey('object_version', { ...parts }),
    );
  });
});

describe('duplicate / out-of-order tolerance — pure apply decisions', () => {
  const base = {
    eventId: 'evt_fake_2',
    eventCreated: 2_000,
    alreadyProcessed: false,
    requiresRefetch: false,
    storedObjectVersion: null,
  };

  it('an already-processed event id is a duplicate — skip', () => {
    expect(decideEventApplication({ ...base, alreadyProcessed: true })).toBe('skip_duplicate');
  });

  it('the same event id having last written the object is a duplicate — skip', () => {
    expect(
      decideEventApplication({
        ...base,
        storedObjectVersion: { lastEventCreated: 2_000, lastEventId: 'evt_fake_2' },
      }),
    ).toBe('skip_duplicate');
  });

  it('an OLDER event than the stored object version is stale — never overwrites newer state', () => {
    expect(
      decideEventApplication({
        ...base,
        storedObjectVersion: { lastEventCreated: 3_000, lastEventId: 'evt_fake_9' },
      }),
    ).toBe('skip_stale');
  });

  it('same created second, different event → order ambiguous → refetch current', () => {
    expect(
      decideEventApplication({
        ...base,
        storedObjectVersion: { lastEventCreated: 2_000, lastEventId: 'evt_fake_other' },
      }),
    ).toBe('refetch_current');
  });

  it('newer event applies directly when the handler does not demand a refetch', () => {
    expect(
      decideEventApplication({
        ...base,
        storedObjectVersion: { lastEventCreated: 1_000, lastEventId: 'evt_fake_old' },
      }),
    ).toBe('apply');
    expect(decideEventApplication(base)).toBe('apply');
  });

  it('refetch-demanding handlers always refetch on fresh events', () => {
    expect(decideEventApplication({ ...base, requiresRefetch: true })).toBe('refetch_current');
    expect(
      decideEventApplication({
        ...base,
        requiresRefetch: true,
        storedObjectVersion: { lastEventCreated: 1_000, lastEventId: 'evt_fake_old' },
      }),
    ).toBe('refetch_current');
  });

  it('duplicate beats stale beats refetch (decision precedence)', () => {
    expect(
      decideEventApplication({
        ...base,
        alreadyProcessed: true,
        requiresRefetch: true,
        storedObjectVersion: { lastEventCreated: 3_000, lastEventId: 'evt_fake_9' },
      }),
    ).toBe('skip_duplicate');
    expect(
      decideEventApplication({
        ...base,
        requiresRefetch: true,
        storedObjectVersion: { lastEventCreated: 3_000, lastEventId: 'evt_fake_9' },
      }),
    ).toBe('skip_stale');
  });
});

describe('durable-event state machine — received→processing→processed|failed→retryable', () => {
  const ALL: WebhookEventState[] = ['received', 'processing', 'processed', 'failed', 'retryable'];

  it('pins the exact transition table', () => {
    expect(WEBHOOK_EVENT_STATE_TRANSITIONS).toEqual({
      received: ['processing'],
      processing: ['processed', 'failed'],
      failed: ['retryable'],
      retryable: ['processing'],
      processed: [],
    });
  });

  it('canTransition answers exhaustively for all 25 pairs', () => {
    const allowed = new Set([
      'received→processing',
      'processing→processed',
      'processing→failed',
      'failed→retryable',
      'retryable→processing',
    ]);
    for (const from of ALL) {
      for (const to of ALL) {
        expect(canTransitionWebhookEventState(from, to), `${from}→${to}`).toBe(
          allowed.has(`${from}→${to}`),
        );
      }
    }
  });

  it('processed is terminal — nothing can regress a processed event', () => {
    for (const to of ALL) {
      expect(canTransitionWebhookEventState('processed', to)).toBe(false);
    }
  });

  it('failure followup: retryable while attempts remain, failed once the budget is spent', () => {
    expect(decideFailureFollowup(1)).toBe('retryable');
    expect(decideFailureFollowup(4)).toBe('retryable');
    expect(decideFailureFollowup(5)).toBe('failed');
    expect(decideFailureFollowup(9)).toBe('failed');
    expect(decideFailureFollowup(2, 2)).toBe('failed');
    expect(decideFailureFollowup(1, 2)).toBe('retryable');
  });
});

describe('WEBHOOK_MATRIX.md — 1:1 lockstep with the code table', () => {
  /** Backticked dotted names in the doc = event names (paths carry slashes). */
  const docEvents = new Set(
    [...matrixDoc.matchAll(/`([a-z_]+(?:\.[a-z_]+)+)`/g)]
      .map((m) => m[1]!)
      .filter((name) => !name.includes('/')),
  );

  it('every supported event appears in the doc', () => {
    for (const eventType of SUPPORTED_WEBHOOK_EVENTS) {
      expect(docEvents.has(eventType), eventType).toBe(true);
    }
  });

  it('the doc names no event the code does not support', () => {
    for (const docEvent of docEvents) {
      expect(SUPPORTED_WEBHOOK_EVENTS.includes(docEvent), docEvent).toBe(true);
    }
  });

  it('every event row carries its handler intent kind in the doc', () => {
    for (const [eventType, intent] of Object.entries(WEBHOOK_EVENT_INTENTS)) {
      const row = matrixDoc
        .split('\n')
        .find((line) => line.startsWith(`| \`${eventType}\` `));
      expect(row, eventType).toBeDefined();
      expect(row!, eventType).toContain(intent.kind);
    }
  });
});

describe('pure handlers module — no IO, no Deno, no SDK', () => {
  it('imports nothing and touches no runtime API', () => {
    expect(/^\s*import\s/m.test(handlersSource)).toBe(false);
    expect(handlersSource.includes('Deno.')).toBe(false);
    expect(handlersSource.includes('fetch(')).toBe(false);
    expect(handlersSource.includes('createClient')).toBe(false);
    expect(handlersSource.includes(".from('")).toBe(false);
  });

  it('contains no secret values or live-looking Stripe ids', () => {
    for (const source of [handlersSource, indexSource]) {
      expect(/whsec_[A-Za-z0-9]/.test(source)).toBe(false);
      expect(/sk_(live|test)_[A-Za-z0-9]/.test(source)).toBe(false);
      expect(/price_(?!fake)[A-Za-z0-9]{8,}/.test(source)).toBe(false);
    }
  });
});

describe('Deno entrypoint — signature-first, insert-first, 2xx after durable receipt', () => {
  it('verifies the Stripe signature over the RAW body BEFORE any DB access', () => {
    expect(/constructEventAsync/.test(indexSource)).toBe(true);
    expect(/req\.text\(\)/.test(indexSource)).toBe(true);
    expect(/missing_signature/.test(indexSource)).toBe(true);
    expect(/invalid_signature/.test(indexSource)).toBe(true);
    expect(indexSource.indexOf('constructEventAsync')).toBeLessThan(indexSource.indexOf(".from('"));
  });

  it('acknowledges out-of-matrix events BEFORE creating the DB client', () => {
    const ackIndex = indexSource.indexOf('acknowledge_unsupported');
    const adminIndex = indexSource.indexOf("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')");
    expect(ackIndex).toBeGreaterThan(-1);
    expect(adminIndex).toBeGreaterThan(-1);
    expect(ackIndex).toBeLessThan(adminIndex);
  });

  it('inserts into stripe_webhook_events FIRST, keyed on the 0021 composite unique key', () => {
    expect(/\.from\('stripe_webhook_events'\)/.test(indexSource)).toBe(true);
    // orchestrator sync: 0021's unique key is (account_scope, livemode, event_id)
    expect(/onConflict: 'account_scope,livemode,event_id'/.test(indexSource)).toBe(true);
    expect(/livemode: event\.livemode/.test(indexSource)).toBe(true);
    expect(/event_id: event\.id/.test(indexSource)).toBe(true);
    expect(/ignoreDuplicates: true/.test(indexSource)).toBe(true);
    // durability failure → non-2xx so Stripe redelivers
    expect(/durable_receipt_failed/.test(indexSource)).toBe(true);
  });

  it('writes touch ONLY stripe_webhook_events — dispatch effects are the workers job', () => {
    const tables = [...indexSource.matchAll(/\.from\('([a-z_]+)'\)/g)].map((m) => m[1]);
    expect([...new Set(tables)]).toEqual(['stripe_webhook_events']);
    const code = indexSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(
      /accepted_corrections|mapper_basement|products|saved_recipes|inventory/.test(code),
    ).toBe(false);
    expect(indexSource.includes('.delete(')).toBe(false);
  });

  it('state updates are guarded (state-conditional) so a worker can never regress a row', () => {
    expect(/\.eq\('state', 'received'\)/.test(indexSource)).toBe(true);
    expect(/\.eq\('state', 'processing'\)/.test(indexSource)).toBe(true);
  });

  it('references env NAMES only (no values) and is labelled NOT DEPLOYED', () => {
    expect(/Deno\.env\.get\('STRIPE_WEBHOOK_SECRET'\)/.test(indexSource)).toBe(true);
    expect(/Deno\.env\.get\('STRIPE_SECRET_KEY'\)/.test(indexSource)).toBe(true);
    expect(/Deno\.env\.get\('STRIPE_API_VERSION'\)/.test(indexSource)).toBe(true);
    expect(/NOT DEPLOYED/.test(indexSource)).toBe(true);
  });
});
