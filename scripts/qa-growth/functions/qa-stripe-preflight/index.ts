/**
 * QA ONLY — Stripe preflight for the Growth QA branch (ncmsonfwbgsqedgnzofg).
 *
 * Answers, WITHOUT EVER RETURNING A CREDENTIAL:
 *   - which Stripe account the saved STRIPE_SECRET_KEY belongs to, and whether
 *     it is a test key (decided from its prefix; the key itself never leaves);
 *   - whether STRIPE_WEBHOOK_SECRET is present and has a signing-secret shape;
 *   - whether every STRIPE_PRICE_* id exists in that same account, and what it is;
 *   - the live configuration of the QA webhook endpoint (url, status, API
 *     version, enabled events). A webhook endpoint read never includes its secret.
 *
 * Refuses outside the QA project, and stops before any account call when the key
 * is not a test key. Invocation needs a one-time nonce the operator writes into
 * qa_harness.invocation_nonces, so no platform key is handed to the caller.
 * Read-only against Stripe.
 */
import Stripe from 'npm:stripe@18';
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js';

const QA_REF = 'ncmsonfwbgsqedgnzofg';
const EXPECTED_ACCOUNT = 'acct_1UGdTdAi07MMapq2';
const ENDPOINT_ID = 'we_1UGdYfAi07MMapq2rQwaGFpG';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body, null, 1), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  if (!(Deno.env.get('SUPABASE_URL') ?? '').startsWith(`https://${QA_REF}.supabase.co`)) {
    return json(403, { error: 'not_the_qa_project' });
  }
  const nonce = req.headers.get('x-qa-nonce') ?? '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(nonce)) {
    return json(401, { error: 'nonce_required' });
  }
  const sql = postgres(Deno.env.get('SUPABASE_DB_URL') ?? '', { prepare: false, max: 1 });
  try {
    const used = await sql`
      update qa_harness.invocation_nonces set used_at = now()
      where nonce = ${nonce}::uuid and purpose = 'stripe_preflight' and used_at is null and expires_at > now()
      returning nonce`;
    if (used.length !== 1) return json(401, { error: 'nonce_invalid_or_used' });
  } finally {
    await sql.end();
  }

  const key = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
  const signing = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
  // Shape only: the public prefix family, stray whitespace and length. Never any
  // character of the credential beyond Stripe's documented public prefixes.
  const prefixClass = (value: string) =>
    (/^(sk|rk|pk)_(test|live)_/.exec(value)?.slice(1, 3).join('_')) ?? (value ? 'other' : 'empty');
  const shape = (value: string) => ({
    length: value.length,
    leadingWhitespace: /^\s/.test(value),
    trailingWhitespace: /\s$/.test(value),
    containsNewline: /[\r\n]/.test(value),
    prefixClass: prefixClass(value),
    prefixClassAfterTrim: prefixClass(value.trim()),
    // A mis-copied PUBLIC identifier is named; a credential is never compared or echoed.
    equalsPublicIdentifier: value.trim() === ENDPOINT_ID ? 'webhook_endpoint_id' : value.trim() === EXPECTED_ACCOUNT ? 'account_id' : null,
    // Counts only: a masked on-screen display (bullets, middle dots, asterisks) copied instead of the key.
    maskCharCount: [...value].filter((c) => c === '\u2022' || c === '\u00b7' || c === '*').length,
    nonAsciiCount: [...value].filter((c) => c.charCodeAt(0) > 127).length,
    whitespaceInsideCount: [...value.trim()].filter((c) => /\s/.test(c)).length,
  });
  const keyMode = /^(sk|rk)_test_/.test(key) ? 'test' : /^(sk|rk)_live_/.test(key) ? 'live' : key ? 'unrecognised' : 'missing';
  const result: Record<string, unknown> = {
    keyPresent: key.length > 0,
    keyMode,
    keyKind: key.startsWith('rk_') ? 'restricted' : key.startsWith('sk_') ? 'secret' : 'unknown',
    webhookSecretPresent: signing.length > 0,
    webhookSecretShapeOk: signing.startsWith('whsec_'),
    keyShape: shape(key),
    webhookSecretShape: { length: signing.length, leadingWhitespace: /^\s/.test(signing), trailingWhitespace: /\s$/.test(signing), containsNewline: /[\r\n]/.test(signing) },
  };
  if (keyMode !== 'test') return json(200, { ...result, stopped: 'not_a_test_key' });

  const requestApiVersion = Deno.env.get('STRIPE_API_VERSION') ?? '2025-06-30.basil';
  const stripe = new Stripe(key, { apiVersion: requestApiVersion as Stripe.LatestApiVersion });
  const account = await stripe.accounts.retrieve();
  result.account = {
    id: account.id,
    matchesExpected: account.id === EXPECTED_ACCOUNT,
    displayName: account.settings?.dashboard?.display_name ?? null,
    country: account.country ?? null,
    defaultCurrency: account.default_currency ?? null,
  };
  if (account.id !== EXPECTED_ACCOUNT) return json(200, { ...result, stopped: 'wrong_account' });

  const prices: unknown[] = [];
  for (const [envName, id] of Object.entries(Deno.env.toObject()).filter(([k]) => k.startsWith('STRIPE_PRICE_')).sort()) {
    try {
      const p = await stripe.prices.retrieve(id, { expand: ['product'] });
      const product = p.product as Stripe.Product;
      prices.push({
        envName, id, found: true, livemode: p.livemode, active: p.active, currency: p.currency,
        unitAmount: p.unit_amount, type: p.type,
        recurring: p.recurring ? { interval: p.recurring.interval, intervalCount: p.recurring.interval_count } : null,
        lookupKey: p.lookup_key, metadata: p.metadata,
        product: { id: product.id, name: product.name, active: product.active, livemode: product.livemode },
      });
    } catch (error) {
      const e = error as { code?: string; type?: string; statusCode?: number };
      prices.push({ envName, id, found: false, error: e.code ?? e.type ?? 'error', status: e.statusCode ?? null });
    }
  }
  result.prices = prices;

  const endpoint = await stripe.webhookEndpoints.retrieve(ENDPOINT_ID);
  result.endpoint = {
    id: endpoint.id, url: endpoint.url, status: endpoint.status, apiVersion: endpoint.api_version,
    livemode: endpoint.livemode, description: endpoint.description,
    enabledEvents: [...endpoint.enabled_events].sort(),
  };
  result.requestApiVersion = requestApiVersion;
  return json(200, result);
});
