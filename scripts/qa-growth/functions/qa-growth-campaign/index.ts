/**
 * QA ONLY — Stripe sandbox operations for the Growth campaign on the QA branch
 * (ncmsonfwbgsqedgnzofg, sandbox acct_1UGdTdAi07MMapq2).
 *
 * The Stripe secret key is read from the function environment and NEVER
 * returned. Every call:
 *   - refuses outside the QA project, with anything but a test key, or when the
 *     key does not belong to acct_1UGdTdAi07MMapq2 (checked once per cold start);
 *   - needs a one-time nonce written by the operator (qa_harness.invocation_nonces,
 *     purpose 'campaign');
 *   - writes Stripe objects only through idempotency keys derived from the
 *     campaign run and the step name;
 *   - returns the raw Stripe object with capability tokens removed
 *     (client_secret, hosted invoice / receipt URLs), and records the step in
 *     qa_harness.observations under the campaign run.
 * It performs Billing actions only (test clocks, customers, subscriptions,
 * refunds, disputes). It never creates prices, products or webhook endpoints.
 */
import Stripe from 'npm:stripe@18';
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const QA_REF = 'ncmsonfwbgsqedgnzofg';
const EXPECTED_ACCOUNT = 'acct_1UGdTdAi07MMapq2';
// The ONE existing QA endpoint. Redelivery never targets anything else.
const QA_ENDPOINT = 'we_1UGdYfAi07MMapq2rQwaGFpG';
const STRIP_KEYS = new Set(['client_secret', 'hosted_invoice_url', 'invoice_pdf', 'receipt_url', 'secret']);

const V2_VERSION = '2026-08-26.dahlia';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body, null, 1), { status, headers: { 'Content-Type': 'application/json' } });

const sanitize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = STRIP_KEYS.has(k) ? (v == null ? v : '[removed]') : sanitize(v);
    }
    return out;
  }
  return value;
};

let accountChecked = false;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  if (!(Deno.env.get('SUPABASE_URL') ?? '').startsWith(`https://${QA_REF}.supabase.co`)) {
    return json(403, { error: 'not_the_qa_project' });
  }
  const nonce = req.headers.get('x-qa-nonce') ?? '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(nonce)) {
    return json(401, { error: 'nonce_required' });
  }
  let body: { run?: string; step?: string; action?: string; params?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid_json' });
  }
  const run = String(body.run ?? '');
  const step = String(body.step ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(run) || !/^[A-Za-z0-9_.:-]{1,80}$/.test(step)) {
    return json(400, { error: 'run_and_step_required' });
  }

  const sql = postgres(Deno.env.get('SUPABASE_DB_URL') ?? '', { prepare: false, max: 1 });
  try {
    const used = await sql`
      update qa_harness.invocation_nonces set used_at = now()
      where nonce = ${nonce}::uuid and purpose = 'campaign' and used_at is null and expires_at > now()
      returning nonce`;
    if (used.length !== 1) return json(401, { error: 'nonce_invalid_or_used' });

    const key = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
    if (!/^sk_test_/.test(key)) return json(403, { error: 'not_a_test_secret_key' });
    const stripe = new Stripe(key, {
      apiVersion: (Deno.env.get('STRIPE_API_VERSION') ?? '2025-06-30.basil') as Stripe.LatestApiVersion,
    });
    if (!accountChecked) {
      const account = await stripe.accounts.retrieve();
      if (account.id !== EXPECTED_ACCOUNT) return json(403, { error: 'wrong_stripe_account' });
      accountChecked = true;
    }

    const p = body.params ?? {};
    const idem = (suffix = '') => ({ idempotencyKey: `qa-growth:${run}:${step}${suffix}` });
    const price = (envName: string) => {
      const id = Deno.env.get(envName);
      if (!envName.startsWith('STRIPE_PRICE_') || !id) throw new Error(`unknown_price_env:${envName}`);
      return id;
    };

    let result: unknown;
    switch (body.action) {
      case 'clock_create':
        result = await stripe.testHelpers.testClocks.create(
          { frozen_time: Number(p.frozenTime), name: String(p.name).slice(0, 30) }, idem());
        break;
      case 'clock_advance':
        result = await stripe.testHelpers.testClocks.advance(String(p.clockId), { frozen_time: Number(p.frozenTime) }, idem());
        break;
      case 'clock_get':
        result = await stripe.testHelpers.testClocks.retrieve(String(p.clockId));
        break;
      case 'customer_create':
        result = await stripe.customers.create({
          email: String(p.email), name: String(p.name), test_clock: p.clockId ? String(p.clockId) : undefined,
          payment_method: String(p.paymentMethod ?? 'pm_card_visa'),
          invoice_settings: { default_payment_method: String(p.paymentMethod ?? 'pm_card_visa') },
          metadata: p.metadata ?? {},
        }, idem());
        break;
      case 'customer_default_payment_method': {
        const pm = await stripe.paymentMethods.attach(String(p.paymentMethod), { customer: String(p.customerId) }, idem(':attach'));
        const customer = await stripe.customers.update(String(p.customerId), {
          invoice_settings: { default_payment_method: pm.id },
        }, idem(':default'));
        result = { paymentMethod: pm, customer };
        break;
      }
      case 'subscription_create':
        result = await stripe.subscriptions.create({
          customer: String(p.customerId),
          items: [{ price: price(String(p.priceEnv)) }],
          metadata: p.metadata ?? {},
          payment_behavior: p.paymentBehavior ?? 'error_if_incomplete',
          // Positions the real monthly/annual price on the Test Clock timeline;
          // the offer itself is never changed.
          backdate_start_date: p.backdateStartDate != null ? Number(p.backdateStartDate) : undefined,
          billing_cycle_anchor: p.billingCycleAnchor != null ? Number(p.billingCycleAnchor) : undefined,
          proration_behavior: p.prorationBehavior ?? undefined,
          expand: ['latest_invoice'],
        }, idem());
        break;
      case 'invoice_pay':
        result = await stripe.invoices.pay(String(p.invoiceId), {}, idem());
        break;
      case 'subscription_change_price': {
        const sub = await stripe.subscriptions.retrieve(String(p.subscriptionId));
        result = await stripe.subscriptions.update(String(p.subscriptionId), {
          items: [{ id: sub.items.data[0].id, price: price(String(p.priceEnv)) }],
          proration_behavior: p.prorationBehavior ?? 'always_invoice',
          metadata: p.metadata ?? undefined,
          expand: ['latest_invoice'],
        }, idem());
        break;
      }
      case 'subscription_cancel_at_period_end':
        result = await stripe.subscriptions.update(String(p.subscriptionId), { cancel_at_period_end: true }, idem());
        break;
      case 'subscription_cancel_now':
        result = await stripe.subscriptions.cancel(String(p.subscriptionId), {}, idem());
        break;
      case 'subscription_get':
        result = await stripe.subscriptions.retrieve(String(p.subscriptionId), { expand: ['latest_invoice'] });
        break;
      case 'invoice_get':
        result = await stripe.invoices.retrieve(String(p.invoiceId));
        break;
      case 'invoices_for_subscription':
        result = await stripe.invoices.list({ subscription: String(p.subscriptionId), limit: 100 });
        break;
      case 'invoice_payments': {
        const items: unknown[] = [];
        for await (const payment of stripe.invoicePayments.list({ invoice: String(p.invoiceId), limit: 100 })) items.push(payment);
        result = { invoiceId: p.invoiceId, data: items };
        break;
      }
      case 'invoice_payments_by_pi': {
        // Exactly the webhook's lookup (dispatch listAll 'invoice_payments_by_payment_intent').
        const items: unknown[] = [];
        for await (const payment of stripe.invoicePayments.list({
          payment: { type: 'payment_intent', payment_intent: String(p.paymentIntentId) }, limit: 100,
        })) items.push(payment);
        result = { paymentIntentId: p.paymentIntentId, data: items };
        break;
      }
      case 'refund_create':
        result = await stripe.refunds.create({
          payment_intent: String(p.paymentIntentId),
          amount: p.amount != null ? Number(p.amount) : undefined,
          reason: 'requested_by_customer',
          metadata: { qa_run: run, qa_step: step },
        }, idem());
        break;
      case 'dispute_close': {
        const evidence = p.outcome === 'won' ? 'winning_evidence' : 'losing_evidence';
        result = await stripe.disputes.update(String(p.disputeId), {
          evidence: { uncategorized_text: evidence }, submit: true,
        }, idem());
        break;
      }
      case 'disputes_for_charge':
        result = await stripe.disputes.list({ charge: String(p.chargeId), limit: 10 });
        break;
      case 'event_resend':
        // Stripe redelivers the ORIGINAL signed event (same id, same payload) to the QA endpoint only —
        // the same call `stripe events resend --webhook-endpoint` makes.
        result = await stripe.rawRequest('POST', `/v1/events/${String(p.eventId)}/retry`, { webhook_endpoint: QA_ENDPOINT });
        break;
      case 'events_for_object': {
        // Ids and delivery counters only: which events Stripe created for one object or customer.
        const found: unknown[] = [];
        const want = new Set<string>([p.objectId, p.customerId].filter(Boolean).map(String));
        for await (const ev of stripe.events.list({ created: { gte: Number(p.since) }, limit: 100, types: p.types ?? undefined })) {
          const obj = ev.data.object as unknown as Record<string, unknown>;
          const ids = [obj.id, obj.customer, obj.charge, obj.payment_intent, obj.invoice].filter((v) => typeof v === 'string') as string[];
          if (ids.some((id) => want.has(id))) {
            found.push({ id: ev.id, type: ev.type, created: ev.created, pending_webhooks: ev.pending_webhooks, livemode: ev.livemode, object: obj.id });
          }
          if (found.length >= 200) break;
        }
        result = { data: found };
        break;
      }
      case 'payment_intent_get':
        result = await stripe.paymentIntents.retrieve(String(p.paymentIntentId), { expand: ['latest_charge'] });
        break;
      case 'dispute_get':
        result = await stripe.disputes.retrieve(String(p.disputeId));
        break;
      case 'qa_session_link': {
        /* QA ONLY — a one-time sign-in link for one of the two synthetic QA
           accounts, so the campaign can open the Partner and admin panels
           without a human password. Restricted to those two addresses, nonce
           protected like every other action, and refused outside the QA project.
           The owner authorised this route explicitly (2026-09-18). */
        const allowed = ['qa.growth.partner.a@example.invalid', 'qa.growth.admin@example.invalid'];
        const email = String(p.email ?? '');
        if (!allowed.includes(email)) return json(403, { error: 'email_not_in_qa_allowlist' });
        const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data, error } = await admin.auth.admin.generateLink({
          type: 'magiclink',
          email,
          options: { redirectTo: String(p.redirectTo ?? 'http://localhost:5188/partner') },
        });
        if (error) return json(502, { step, action: body.action, error: 'generate_link_failed', message: error.message });
        result = { email, url: data.properties?.action_link ?? null };
        break;
      }
      case 'connect_endpoint_provision': {
        /* Connected-account events are delivered to a DIFFERENT destination with
           its OWN signing secret. This creates that destination for the sandbox
           and hands the secret to the QA project's Vault; the response carries
           only public identifiers and the secret's shape, never the secret. */
        const created = await stripe.webhookEndpoints.create({
          url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/stripe-webhook`,
          enabled_events: ['account.updated', 'capability.updated', 'payout.created', 'payout.paid', 'payout.failed'],
          connect: true,
          api_version: (Deno.env.get('STRIPE_API_VERSION') ?? '2025-06-30.basil') as Stripe.LatestApiVersion,
          description: 'QA ONLY: connected-account destination for qa-growth-e2e. Never staging or production.',
        }, idem());
        const signing = created.secret ?? '';
        await sql`select vault.create_secret(${signing}, ${'qa_stripe_connect_webhook_secret'},
          ${'QA ONLY: signing secret of the Connect destination for the growth sandbox'})`;
        result = {
          id: created.id, url: created.url, connect: true, status: created.status,
          apiVersion: created.api_version, livemode: created.livemode,
          enabledEvents: created.enabled_events,
          secretStored: 'vault:qa_stripe_connect_webhook_secret',
          secretShape: { length: signing.length, prefix: signing.slice(0, 6) },
        };
        break;
      }
      case 'connect_v2_account_create': {
        /* This sandbox signed up for Connect AFTER Stripe moved new platforms to
           Accounts v2, so /v1/accounts refuses to create. The account is created
           through /v2/core/accounts with the Recipient configuration: it receives
           transfers from the platform and pays out, and it can take no payments.
           The id is still acct_..., which is what the ledger stores. */
        const body2 = {
          contact_email: String(p.email),
          display_name: String(p.displayName ?? 'QA Partner'),
          identity: { country: String(p.country ?? 'es'), entity_type: String(p.entityType ?? 'individual') },
          configuration: {
            recipient: {
              capabilities: {
                // The only Recipient capability this lane needs: it lets the
                // account RECEIVE /v1/transfers into its Stripe balance.
                stripe_balance: { stripe_transfers: { requested: true } },
              },
            },
          },
          dashboard: String(p.dashboard ?? 'express'),
          defaults: { currency: String(p.currency ?? 'eur'), responsibilities: { fees_collector: 'application', losses_collector: 'application' } },
          metadata: { gellatti_partner_id: String(p.partnerId ?? ''), environment: 'qa', qa_run: run },
          include: ['configuration.recipient', 'identity', 'requirements', 'defaults'],
        };
        result = await stripe.rawRequest('POST', '/v2/core/accounts', body2, { apiVersion: V2_VERSION, ...idem() });
        break;
      }
      case 'connect_v2_account_get':
        // v2 rejects the [] array syntax: the indexes must be explicit.
        result = await stripe.rawRequest('GET', `/v2/core/accounts/${String(p.accountId)}` +
          '?include[0]=configuration.recipient&include[1]=identity&include[2]=requirements&include[3]=defaults',
          {}, { apiVersion: V2_VERSION });
        break;
      case 'connect_v2_account_update':
        result = await stripe.rawRequest('POST', `/v2/core/accounts/${String(p.accountId)}`,
          { ...(p.params as Record<string, unknown>), include: ['configuration.recipient', 'identity', 'requirements'] },
          { apiVersion: V2_VERSION, ...idem() });
        break;
      case 'connect_v2_account_link':
        // Hosted onboarding for a v2 account.
        result = await stripe.rawRequest('POST', '/v2/core/account_links', {
          account: String(p.accountId),
          use_case: {
            type: 'account_onboarding',
            account_onboarding: {
              configurations: ['recipient'],
              return_url: String(p.returnUrl),
              refresh_url: String(p.refreshUrl),
            },
          },
        }, { apiVersion: V2_VERSION, ...idem() });
        break;
      case 'connect_probe': {
        // Read-only: is this sandbox signed up for Connect at all, and what does
        // the platform account itself say? Every call is wrapped so the answer is
        // the ERROR, not a 500.
        const probe: Record<string, unknown> = {};
        try {
          const list = await stripe.accounts.list({ limit: 1 });
          probe.accountsList = { ok: true, count: list.data.length, ids: list.data.map((a) => a.id) };
        } catch (error) {
          const e = error as { code?: string; type?: string; statusCode?: number; message?: string };
          probe.accountsList = { ok: false, type: e.type, code: e.code, status: e.statusCode, message: e.message };
        }
        const self = await stripe.accounts.retrieve();
        probe.platform = {
          id: self.id, country: self.country, defaultCurrency: self.default_currency,
          chargesEnabled: self.charges_enabled, payoutsEnabled: self.payouts_enabled,
          detailsSubmitted: self.details_submitted, type: self.type,
          capabilities: self.capabilities ?? null,
          controller: (self as unknown as { controller?: unknown }).controller ?? null,
          displayName: self.settings?.dashboard?.display_name ?? null,
        };
        result = probe;
        break;
      }
      case 'connect_account_create':
        // The SAME shape admin-control provisions, plus the explicit capability
        // the payout lane actually needs: transfers in, nothing to charge with.
        result = await stripe.accounts.create({
          type: 'express',
          email: String(p.email),
          capabilities: { transfers: { requested: true } },
          business_type: p.businessType ? String(p.businessType) : undefined,
          metadata: { gellatti_partner_id: String(p.partnerId ?? ''), environment: 'qa', qa_run: run },
        }, idem());
        break;
      case 'token_bank_account':
        // A test bank account token for Connect onboarding prefill (sandbox only).
        result = await stripe.tokens.create({
          bank_account: {
            country: String(p.country ?? 'ES'),
            currency: String(p.currency ?? 'eur'),
            account_holder_name: String(p.holderName ?? 'QA Partner A'),
            account_holder_type: 'individual',
            account_number: String(p.accountNumber ?? 'ES9121000418450200051332'),
          },
        }, idem());
        break;
      case 'webhook_endpoint_get':
        result = await stripe.webhookEndpoints.retrieve(String(p.endpointId ?? 'we_1UGdYfAi07MMapq2rQwaGFpG'));
        break;
      case 'connect_account_get':
        result = await stripe.accounts.retrieve(String(p.accountId));
        break;
      case 'connect_account_update':
        result = await stripe.accounts.update(String(p.accountId), (p.params ?? {}) as Stripe.AccountUpdateParams);
        break;
      case 'connect_account_link':
        result = await stripe.accountLinks.create({
          account: String(p.accountId),
          type: 'account_onboarding',
          return_url: String(p.returnUrl),
          refresh_url: String(p.refreshUrl),
        });
        break;
      case 'balance_get':
        // With an accountId this reads the CONNECTED account's own balance —
        // where a Transfer lands, and where a bank payout is paid FROM.
        result = p.accountId
          ? await stripe.balance.retrieve({}, { stripeAccount: String(p.accountId) })
          : await stripe.balance.retrieve();
        break;
      case 'connect_payout_create':
        /* The third object in the chain, deliberately separate from the ledger:
           the connected account pays ITSELF out to its bank. Gellatti's executor
           never does this (Stripe does it on the account's own schedule) — this
           action exists only so the campaign can show that a Transfer, a bank
           payout and the application's settlement status are three different
           things with three different states. */
        result = await stripe.payouts.create({
          amount: Number(p.amount),
          currency: String(p.currency ?? 'eur'),
          metadata: { environment: 'qa', qa_run: run },
        }, { stripeAccount: String(p.accountId), ...idem() });
        break;
      case 'platform_funding_charge':
        // Test-mode funding: this payment method lands directly in the AVAILABLE
        // balance, which is what a transfer needs. Sandbox only.
        result = await stripe.paymentIntents.create({
          amount: Number(p.amount ?? 20000),
          currency: 'eur',
          payment_method: 'pm_card_bypassPending',
          confirm: true,
          description: `QA platform funding ${run}`,
          automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        }, idem());
        break;
      case 'transfer_get':
        result = await stripe.transfers.retrieve(String(p.transferId));
        break;
      case 'transfers_for_destination':
        result = await stripe.transfers.list({ destination: String(p.accountId), limit: 100 });
        break;
      case 'payouts_for_account':
        result = await stripe.payouts.list({ limit: 20 }, { stripeAccount: String(p.accountId) });
        break;
      case 'events_since':
        result = await stripe.events.list({ created: { gte: Number(p.since) }, limit: 100, types: p.types ?? undefined });
        break;
      default:
        return json(400, { error: 'unknown_action' });
    }

    const clean = sanitize(result) as Record<string, unknown>;
    const liveFlags = JSON.stringify(clean).match(/"livemode":\s*true/g);
    if (liveFlags) return json(500, { error: 'livemode_object_returned', step });
    await sql`
      insert into qa_harness.observations (run_id, worker, payload)
      values (${run}::uuid, ${'stripe:' + step}, ${sql.json({ action: body.action, params: p, result: clean })})`;
    return json(200, { step, action: body.action, result: clean });
  } catch (error) {
    const e = error as { type?: string; code?: string; message?: string; statusCode?: number; raw?: { message?: string } };
    const failure = { step, action: body.action, error: e.type ?? 'error', code: e.code ?? null, status: e.statusCode ?? null, message: (e.raw?.message ?? e.message ?? '').slice(0, 300) };
    try {
      await sql`insert into qa_harness.observations (run_id, worker, payload) values (${run}::uuid, ${'stripe-error:' + step}, ${sql.json(failure)})`;
    } catch { /* the run row may not exist yet */ }
    return json(502, failure);
  } finally {
    await sql.end();
  }
});
