// Read-only anonymous probe of staging: served country list + direct REST/RPC/storage access.
// The public anon key is taken from the app's own request and kept in memory only (never printed or stored).
// usage: node rest_probe_cdp.mjs <outFile.json>
import fs from 'node:fs/promises';

const out = process.argv[2];
const SHOP_URL = 'https://staging.pinguinoai.com/shop';
const ver = await (await fetch('http://127.0.0.1:9333/json/version')).json();
const ws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let nextId = 1;
const pending = new Map();
const listeners = new Set();
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
  } else if (msg.method) for (const l of listeners) l(msg);
};
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { browserContextId } = await send('Target.createBrowserContext', { disposeOnDetach: true });
const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
let apikey = null;
let supabaseOrigin = null;
const requests = [];
const consoleErrors = [];
listeners.add((msg) => {
  if (msg.sessionId !== sessionId) return;
  const p = msg.params;
  if (msg.method === 'Network.requestWillBeSent' && p.request.url.includes('.supabase.co')) {
    const headers = p.request.headers ?? {};
    if (!apikey && (headers.apikey || headers.Apikey)) apikey = headers.apikey || headers.Apikey;
    supabaseOrigin ??= new URL(p.request.url).origin;
    requests.push({ id: p.requestId, method: p.request.method, path: new URL(p.request.url).pathname });
  }
  if (msg.method === 'Network.responseReceived') {
    const r = requests.find((x) => x.id === p.requestId);
    if (r) r.status = p.response.status;
  }
  if (msg.method === 'Log.entryAdded' && p.entry.level === 'error') consoleErrors.push(p.entry.text.slice(0, 160));
});
for (const d of ['Page', 'Runtime', 'Network', 'Log']) await send(`${d}.enable`, {}, sessionId);
await send('Network.setCacheDisabled', { cacheDisabled: true }, sessionId);
await send('Emulation.setLocaleOverride', { locale: 'pl-PL' }, sessionId);
await send('Page.navigate', { url: SHOP_URL }, sessionId);
let facts = null;
for (let i = 0; i < 120; i++) {
  await sleep(250);
  facts = await send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
    const s = document.querySelector('[data-testid="shop-country-select"]');
    return { cards: document.querySelectorAll('[data-testid^="shop-card-"]').length,
      countryOptions: s ? s.options.length - 1 : null,
      firstCountries: s ? [...s.options].slice(1, 6).map((o) => o.text) : [],
      loadError: !!document.querySelector('[data-testid="shop-country-load-error"]'),
      bundle: [...document.scripts].map((x) => x.src).filter((x) => x.includes('/assets/index-')) };
  })()` }, sessionId);
  if (facts.result.value.countryOptions > 0 || facts.result.value.loadError) break;
}
const served = facts.result.value;
await send('Target.closeTarget', { targetId });
ws.close();

const probes = [];
const probe = async (name, method, path, body, expect) => {
  const res = await fetch(`${supabaseOrigin}${path}`, {
    method,
    headers: { apikey, Authorization: `Bearer ${apikey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let excerpt = text.slice(0, 160);
  try { const j = JSON.parse(text); excerpt = Array.isArray(j) ? `array(${j.length})` : JSON.stringify({ code: j.code, message: j.message, state: j.state, orderable: j.orderable }).slice(0, 200); } catch {}
  probes.push({ name, method, path: path.replace(/\?.*$/, '?…'), status: res.status, expect, excerpt });
};
if (!apikey || !supabaseOrigin) throw new Error('no app request captured');
await probe('countries (public)', 'GET', '/rest/v1/shop_country_local_readiness?select=iso2,local_starter_pack_live', null, '200, 17 rows, 0 live');
await probe('shipping price (public column)', 'GET', '/rest/v1/shop_shipping_rates?select=country_iso2,customer_price_cents&limit=3', null, '200');
await probe('carrier cost (private column)', 'GET', '/rest/v1/shop_shipping_rates?select=carrier_cost_cents&limit=1', null, '401/403 (42501)');
await probe('shipping rates select=* (includes private)', 'GET', '/rest/v1/shop_shipping_rates?select=*&limit=1', null, '401/403 (42501)');
await probe('stripe ids (private column)', 'GET', '/rest/v1/shop_products?select=stripe_price_id&limit=1', null, '401/403 (42501)');
await probe('products public columns', 'GET', '/rest/v1/shop_products?select=sku,price_cents,active', null, '200, active only');
await probe('components (public read)', 'GET', '/rest/v1/shop_country_components?select=country_iso2,purchase_url', null, '200, no reserved test rows');
await probe('components reserved-domain rows', 'GET', '/rest/v1/shop_country_components?select=country_iso2&purchase_url=ilike.*example.invalid*', null, '200, array(0)');
await probe('storage object via anon', 'GET', '/storage/v1/object/shop-documents/gelato-base-ingredients/1.1/f92262842f56e4b987ee0ba011cbe2420ddd2a6d3d7798dfa8224821912ca2e8.pdf', null, '400/404');
await probe('document registry', 'GET', '/rest/v1/shop_digital_documents?select=*', null, '401/403');
await probe('orders table', 'GET', '/rest/v1/shop_orders?select=id&limit=1', null, '200 array(0) or 401');
await probe('availability RPC', 'POST', '/rest/v1/rpc/gellatti_shop_document_availability_v1', { p_document_key: 'GELATO_BASE_INGREDIENTS' }, '200, TEST_ACCOUNTS_ONLY, orderable false');
await probe('order RPC (service only)', 'POST', '/rest/v1/rpc/gellatti_shop_document_order_v1', { p_user_id: '00000000-0000-0000-0000-000000000000', p_email: 'x@example.invalid', p_document_key: 'GELATO_BASE_INGREDIENTS' }, '401/403/404');
await probe('download RPC (service only)', 'POST', '/rest/v1/rpc/gellatti_shop_document_download_v1', { p_user_id: '00000000-0000-0000-0000-000000000000', p_order_id: '00000000-0000-0000-0000-000000000000' }, '401/403/404');
await probe('storage list shop-documents', 'POST', '/storage/v1/object/list/shop-documents', { prefix: 'gelato-base-ingredients/1.1', limit: 10 }, 'no objects / 400');
await probe('storage public URL', 'GET', '/storage/v1/object/public/shop-documents/gelato-base-ingredients/1.1/f92262842f56e4b987ee0ba011cbe2420ddd2a6d3d7798dfa8224821912ca2e8.pdf', null, '400/404 (private)');
await probe('edge function with anon key only', 'POST', '/functions/v1/shop-digital-document', { action: 'order', documentKey: 'GELATO_BASE_INGREDIENTS' }, '401 unauthorized');
apikey = null;

const result = { capturedAt: new Date().toISOString(), page: SHOP_URL, served, appSupabaseRequests: requests.map(({ id, ...r }) => r), consoleErrors, probes };
await fs.writeFile(out, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ served, consoleErrors, appRequests: result.appSupabaseRequests, probes: probes.map((p) => `${p.status} ${p.name} :: ${p.excerpt}`) }, null, 1));
