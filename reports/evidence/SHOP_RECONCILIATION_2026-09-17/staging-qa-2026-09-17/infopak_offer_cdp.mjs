// Served look of the infopak offer on staging /shop for an anonymous visitor (read-only; no clicks that order).
// Desktop 1440x900 and a 390x844 phone profile in Chrome DevTools emulation (not a physical iPhone/Safari).
// Also clicks "Zamów za 0 €" once while signed out: that only opens the sign-in dialog and remembers the intent.
// usage: node infopak_offer_cdp.mjs <outDir>
import fs from 'node:fs/promises';
import path from 'node:path';

const outDir = process.argv[2];
const SHOP_URL = 'https://staging.pinguinoai.com/shop';
const PROFILES = [
  { id: 'desktop-1440x900', width: 1440, height: 900, dpr: 2, mobile: false,
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36' },
  { id: 'mobile-390x844-emulated', width: 390, height: 844, dpr: 3, mobile: true,
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1' },
];

await fs.mkdir(outDir, { recursive: true });
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
    msg.error ? reject(new Error(`${msg.error.message} ${msg.error.data ?? ''}`)) : resolve(msg.result);
  } else if (msg.method) for (const l of listeners) l(msg);
};
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evaluate = async (sessionId, expression, awaitPromise = false) => {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise }, sessionId);
  if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails).slice(0, 300));
  return res.result.value;
};

async function crop(sessionId, profile, selector, file, pad = 12) {
  await send('Emulation.setDeviceMetricsOverride', { width: profile.width, height: profile.height, deviceScaleFactor: profile.dpr, mobile: profile.mobile }, sessionId);
  await evaluate(sessionId, `document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({ block: 'start' }); new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))`, true);
  await sleep(500);
  const rect = await evaluate(sessionId, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left + scrollX, y: b.top + scrollY, width: b.width, height: b.height }; })()`);
  if (!rect) return null;
  const { data } = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: true,
    clip: { x: Math.max(0, rect.x - pad), y: Math.max(0, rect.y - pad), width: rect.width + 2 * pad, height: rect.height + 2 * pad, scale: 1 } }, sessionId);
  await fs.writeFile(path.join(outDir, file), Buffer.from(data, 'base64'));
  return file;
}

const result = { url: SHOP_URL, capturedAt: new Date().toISOString(), chrome: ver.Browser, note: 'Chrome DevTools emulation; not a physical iPhone/Safari', runs: [] };
for (const profile of PROFILES) {
  const { browserContextId } = await send('Target.createBrowserContext', { disposeOnDetach: true });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const consoleErrors = [];
  const supabase = [];
  let bundle = null;
  listeners.add((msg) => {
    if (msg.sessionId !== sessionId) return;
    const p = msg.params;
    if (msg.method === 'Network.requestWillBeSent') {
      const u = new URL(p.request.url);
      if (/\/assets\/index-[^/]+\.js$/.test(u.pathname)) bundle = u.pathname;
      if (u.hostname.endsWith('.supabase.co') && p.request.method !== 'OPTIONS') supabase.push({ id: p.requestId, method: p.request.method, path: u.pathname });
    }
    if (msg.method === 'Network.responseReceived') {
      const r = supabase.find((x) => x.id === p.requestId);
      if (r) r.status = p.response.status;
    }
    if (msg.method === 'Runtime.exceptionThrown') consoleErrors.push((p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text ?? '').slice(0, 200));
    if (msg.method === 'Log.entryAdded' && p.entry.level === 'error') consoleErrors.push(`${p.entry.text} ${p.entry.url ?? ''}`.slice(0, 200));
  });
  for (const d of ['Page', 'Runtime', 'Network', 'Log']) await send(`${d}.enable`, {}, sessionId);
  await send('Emulation.setDeviceMetricsOverride', { width: profile.width, height: profile.height, deviceScaleFactor: profile.dpr, mobile: profile.mobile }, sessionId);
  if (profile.mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, sessionId);
  await send('Network.setUserAgentOverride', { userAgent: profile.ua, acceptLanguage: 'pl-PL,pl;q=0.9' }, sessionId);
  await send('Emulation.setLocaleOverride', { locale: 'pl-PL' }, sessionId);
  await send('Network.setCacheDisabled', { cacheDisabled: true }, sessionId);
  await send('Page.navigate', { url: SHOP_URL }, sessionId);
  let present = false;
  for (let i = 0; i < 120 && !present; i++) {
    await sleep(250);
    present = await evaluate(sessionId, `!!document.querySelector('[data-testid="shop-infopak-offer"]')`).catch(() => false);
  }
  await evaluate(sessionId, `document.querySelector('[data-testid="shop-infopak-offer"]')?.scrollIntoView({ block: 'start' }); true`).catch(() => {});
  await sleep(1200);
  const facts = present ? await evaluate(sessionId, `(() => {
    const q = (id) => document.querySelector('[data-testid="' + id + '"]');
    const offer = q('shop-infopak-offer');
    const img = q('shop-infopak-image');
    const title = document.getElementById('shop-infopak-title');
    const order = q('shop-infopak-order');
    const style = (el) => el ? { size: getComputedStyle(el).fontSize, weight: getComputedStyle(el).fontWeight } : null;
    const sectionOrder = ['shop-singles', 'shop-infopak'].map((id) => document.getElementById(id)?.getBoundingClientRect().top ?? null);
    const cart = document.querySelector('[data-testid="shop-cart"]');
    return {
      kicker: offer.querySelector('p')?.textContent,
      title: title?.textContent, titleStyle: style(title),
      subtitle: q('shop-infopak-subtitle')?.textContent,
      price: q('shop-infopak-price')?.textContent,
      details: [...(q('shop-infopak-details')?.querySelectorAll('li') ?? [])].map((li) => li.textContent),
      cta: order?.textContent, ctaDisabled: order?.disabled, ctaBox: order ? { w: order.getBoundingClientRect().width, h: order.getBoundingClientRect().height } : null,
      signInHint: order?.previousElementSibling?.textContent ?? null,
      readyShown: !!q('shop-infopak-ready'),
      image: img ? { src: new URL(img.currentSrc || img.src).pathname, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, renderedWidth: img.getBoundingClientRect().width } : null,
      offerWidth: offer.getBoundingClientRect().width,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 0.5,
      singlesAboveOffer: sectionOrder[0] !== null && sectionOrder[1] !== null && sectionOrder[0] < sectionOrder[1],
      cartBelowOffer: cart ? cart.getBoundingClientRect().top > offer.getBoundingClientRect().top : null,
    };
  })()`) : null;
  const shot = present ? await crop(sessionId, profile, '[data-testid="shop-infopak-offer"]', `${profile.id}__infopak-offer-anon.png`) : null;

  // Signed out: the button only opens sign-in and remembers the intent (no order request).
  let signedOutClick = null;
  if (present) {
    const before = supabase.length;
    await evaluate(sessionId, `document.querySelector('[data-testid="shop-infopak-order"]').click(); true`);
    await sleep(1200);
    signedOutClick = await evaluate(sessionId, `(() => ({
      dialogOpen: !!document.querySelector('[role="dialog"]'),
      dialogText: document.querySelector('[role="dialog"]')?.textContent?.replace(/\\s+/g, ' ').slice(0, 160) ?? null,
      intentRemembered: sessionStorage.getItem('gellatti.shop.infopakIntent') !== null,
    }))()`);
    signedOutClick.functionCallsAfterClick = supabase.slice(before).filter((r) => r.path.includes('/functions/')).length;
    signedOutClick.dialogShot = await crop(sessionId, profile, '[role="dialog"]', `${profile.id}__signed-out-click-dialog.png`, 4);
  }
  result.runs.push({ profile: profile.id, bundle, offerPresent: present, facts, screenshot: shot, signedOutClick, consoleErrors,
    supabaseRequests: supabase.map(({ id, ...r }) => r) });
  await send('Target.closeTarget', { targetId });
  await send('Target.disposeBrowserContext', { browserContextId }).catch(() => {});
}
ws.close();
await fs.writeFile(path.join(outDir, 'facts.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result.runs, null, 1));
