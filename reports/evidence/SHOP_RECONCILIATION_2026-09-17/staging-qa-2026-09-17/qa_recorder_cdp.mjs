// Records a staging QA session in the visible Chrome window (CDP on 9334) while the owner signs in.
// - Network: every Supabase request (method, path, status, time). No headers, no bodies, no tokens.
// - Page state every 500 ms: signed-in email, sign-in dialog, remembered intent, infopak state.
// - Optional race (--race): when the app itself sends its infopak order, two identical requests go out
//   at the same moment, so three creation requests race. Their results are kept without link tokens.
// Stops when <outDir>/STOP exists or after 30 minutes. usage: node qa_recorder_cdp.mjs <outDir> [--race]
import fs from 'node:fs/promises';
import path from 'node:path';

const outDir = process.argv[2];
const race = process.argv.includes('--race');
await fs.mkdir(outDir, { recursive: true });
const logFile = path.join(outDir, 'timeline.jsonl');
const log = async (entry) => fs.appendFile(logFile, JSON.stringify({ t: new Date().toISOString(), ...entry }) + '\n');

const targets = await (await fetch('http://127.0.0.1:9334/json/list')).json();
const page = targets.find((t) => t.type === 'page' && t.url.includes('staging.pinguinoai.com')) ?? targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let nextId = 1;
const pending = new Map();
const requests = new Map();
ws.onmessage = async (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    return;
  }
  const p = msg.params;
  if (msg.method === 'Network.requestWillBeSent') {
    const u = new URL(p.request.url);
    if (u.hostname.endsWith('.supabase.co') && p.request.method !== 'OPTIONS') {
      requests.set(p.requestId, { method: p.request.method, path: u.pathname });
      await log({ kind: 'request', method: p.request.method, path: u.pathname });
    }
  }
  if (msg.method === 'Network.responseReceived' && requests.has(p.requestId)) {
    const r = requests.get(p.requestId);
    await log({ kind: 'response', method: r.method, path: r.path, status: p.response.status });
  }
  if (msg.method === 'Page.frameNavigated' && !p.frame.parentId) await log({ kind: 'navigated', url: p.frame.url.split('#')[0].split('?')[0] });
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value;

// supabase-js captures `fetch` when its client is created, so the wrapper must exist before the app
// runs: it is registered for new documents and the page is reloaded once, before the owner acts.
const RACE_SOURCE = `(() => {
  if (window.__raceInstalled) return;
  window.__raceInstalled = true; window.__raceArmed = true; window.__raceExtras = null;
  const original = window.fetch.bind(window);
  const summarize = async (promise) => { try { const res = await promise; const json = await res.clone().json().catch(() => ({}));
    return { status: res.status, orderId: json.orderId ?? null, orderNumber: json.orderNumber ?? null, created: json.created ?? null, emailQueued: json.emailQueued ?? null, emailReason: json.emailReason ?? null, error: json.error ?? null, linkIssued: !!(json.download && json.download.url) }; }
    catch (e) { return { failed: String(e).slice(0, 120) }; } };
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const body = init && typeof init.body === 'string' ? init.body : '';
    const own = original(input, init);
    if (window.__raceArmed && url.includes('/functions/v1/shop-digital-document') && body.includes('"action":"order"')) {
      window.__raceArmed = false;
      window.__raceStartedAt = new Date().toISOString();
      const extras = [original(input, init), original(input, init)];
      Promise.all([summarize(own), ...extras.map(summarize)]).then((all) => { window.__raceExtras = { app: all[0], extra1: all[1], extra2: all[2] }; });
    }
    return own;
  };
})();`;

async function installRace() {
  await send('Page.addScriptToEvaluateOnNewDocument', { source: RACE_SOURCE });
  await send('Page.reload', { ignoreCache: true });
  await sleep(4000);
  const installed = await evaluate('window.__raceInstalled === true');
  await log({ kind: 'race', installedBeforeApp: installed });
}

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
if (race) await installRace();
await log({ kind: 'start', page: page.url.split('?')[0], race });

let last = '';
const started = Date.now();
while (Date.now() - started < 30 * 60 * 1000) {
  try { await fs.access(path.join(outDir, 'STOP')); break; } catch {}
  const state = await evaluate(`(() => { const q = (id) => document.querySelector('[data-testid="' + id + '"]');
    const k = Object.keys(localStorage).find((x) => /^sb-.*-auth-token$/.test(x)); let email = null; try { email = k ? JSON.parse(localStorage.getItem(k)).user.email : null; } catch {}
    return { path: location.pathname, email, dialog: !!document.querySelector('[role="dialog"]'), intent: sessionStorage.getItem('gellatti.shop.infopakIntent') !== null,
      offer: q('shop-infopak-ready') ? 'ready ' + (q('shop-infopak-ready').innerText.match(/G-\\d{8}-[A-Z0-9]+/)?.[0] ?? '') : q('shop-infopak-order') ? 'order-button:' + q('shop-infopak-order').innerText : 'none',
      notice: q('shop-infopak-notice')?.innerText ?? null, race: window.__raceExtras ?? null, raceStartedAt: window.__raceStartedAt ?? null }; })()`).catch(() => null);
  const key = JSON.stringify(state);
  if (state && key !== last) { await log({ kind: 'state', ...state }); last = key; }
  await sleep(500);
}
await log({ kind: 'stop' });
ws.close();
