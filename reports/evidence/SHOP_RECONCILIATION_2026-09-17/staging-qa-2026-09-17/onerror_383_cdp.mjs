// #383 served onError check on staging /shop (read-only, anonymous, Chrome emulation — not a physical device).
// Control: the pouch photo loads in the 7 frames. Forced: the browser fails every request for the
// placeholder photo (CDP Fetch.failRequest), and each frame must fall back to the empty outline, never a broken image.
// usage: node onerror_383_cdp.mjs <outDir>
import fs from 'node:fs/promises';
import path from 'node:path';

const outDir = process.argv[2];
const SHOP_URL = 'https://staging.pinguinoai.com/shop';
const SKUS = ['GEL-DEX-500', 'GEL-FRU-500', 'GEL-INU-500', 'GEL-STB-500', 'GEL-YOL-500', 'GEL-SMP-500', 'GEL-CRP-500'];
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

const frameFacts = (sessionId) => evaluate(sessionId, `(() => ${JSON.stringify(SKUS)}.map((sku) => {
  const card = document.querySelector('[data-testid="shop-card-' + sku + '"]');
  const frame = card?.querySelector('[data-testid="shop-reserved-frame"]');
  const img = frame?.querySelector('img');
  const outline = frame ? [...frame.children].find((el) => el.tagName === 'SPAN') : null;
  return { sku, card: !!card, frame: !!frame,
    img: img ? { src: new URL(img.currentSrc || img.src).pathname, complete: img.complete, naturalWidth: img.naturalWidth, broken: img.complete && img.naturalWidth === 0 } : null,
    outline: outline ? { w: outline.getBoundingClientRect().width, h: outline.getBoundingClientRect().height, border: getComputedStyle(outline).borderTopWidth } : null };
}))()`);

const result = { url: SHOP_URL, capturedAt: new Date().toISOString(), chrome: ver.Browser, note: 'Chrome DevTools emulation; not a physical iPhone/Safari', runs: [] };

for (const profile of PROFILES) {
  for (const mode of ['control', 'forced-image-failure']) {
    const { browserContextId } = await send('Target.createBrowserContext', { disposeOnDetach: true });
    const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const failedByTest = [];
    const consoleErrors = [];
    let bundle = null;
    listeners.add((msg) => {
      if (msg.sessionId !== sessionId) return;
      const p = msg.params;
      if (msg.method === 'Fetch.requestPaused') {
        failedByTest.push(new URL(p.request.url).pathname);
        void send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'Failed' }, sessionId);
      }
      if (msg.method === 'Runtime.exceptionThrown') consoleErrors.push((p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text ?? '').slice(0, 200));
      if (msg.method === 'Network.requestWillBeSent' && /\/assets\/index-[^/]+\.js$/.test(p.request.url)) bundle = new URL(p.request.url).pathname;
    });
    for (const d of ['Page', 'Runtime', 'Network', 'Log']) await send(`${d}.enable`, {}, sessionId);
    if (mode === 'forced-image-failure') {
      await send('Fetch.enable', { patterns: [{ urlPattern: '*/shop/single-placeholder.png*', requestStage: 'Request' }] }, sessionId);
    }
    await send('Emulation.setDeviceMetricsOverride', { width: profile.width, height: profile.height, deviceScaleFactor: profile.dpr, mobile: profile.mobile }, sessionId);
    if (profile.mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, sessionId);
    await send('Network.setUserAgentOverride', { userAgent: profile.ua, acceptLanguage: 'pl-PL,pl;q=0.9' }, sessionId);
    await send('Emulation.setLocaleOverride', { locale: 'pl-PL' }, sessionId);
    await send('Network.setCacheDisabled', { cacheDisabled: true }, sessionId);
    await send('Page.navigate', { url: SHOP_URL }, sessionId);
    for (let i = 0; i < 120; i++) {
      await sleep(250);
      const n = await evaluate(sessionId, `document.querySelectorAll('[data-testid^="shop-card-"]').length`).catch(() => 0);
      if (n >= 7) break;
    }
    // Lazy images: bring each card into view, then let loads or failures settle.
    for (const sku of SKUS) {
      await evaluate(sessionId, `document.querySelector('[data-testid="shop-card-${sku}"]')?.scrollIntoView({ block: 'center' }); true`);
      await sleep(350);
    }
    let facts = null;
    for (let i = 0; i < 40; i++) {
      await sleep(250);
      facts = await frameFacts(sessionId);
      const settled = facts.every((f) => f.frame && ((f.img && f.img.complete && (mode === 'control' ? f.img.naturalWidth > 0 : false)) || f.outline));
      if (settled) break;
    }
    // One card crop for the eye.
    const first = SKUS[0];
    await evaluate(sessionId, `document.querySelector('[data-testid="shop-card-${first}"]')?.scrollIntoView({ block: 'center' }); true`);
    await sleep(400);
    const rect = await evaluate(sessionId, `(() => { const b = document.querySelector('[data-testid="shop-card-${first}"]').getBoundingClientRect(); return { x: b.left + scrollX, y: b.top + scrollY, width: b.width, height: b.height }; })()`);
    const pad = 8;
    const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: true,
      clip: { x: Math.max(0, rect.x - pad), y: Math.max(0, rect.y - pad), width: rect.width + 2 * pad, height: rect.height + 2 * pad, scale: 1 } }, sessionId);
    const file = `${profile.id}__${mode}__card-${first}.png`;
    await fs.writeFile(path.join(outDir, file), Buffer.from(shot.data, 'base64'));

    const run = {
      profile: profile.id, mode, bundle, screenshot: file, placeholderRequestsFailedByTest: failedByTest.length, consoleExceptions: consoleErrors,
      frames: facts,
      verdict: mode === 'control'
        ? (facts.every((f) => f.img && f.img.naturalWidth > 0 && f.img.src === '/shop/single-placeholder.png' && !f.outline) ? 'PASS: 7/7 frames show the pouch photo' : 'CHECK')
        : (failedByTest.length > 0 && facts.every((f) => !f.img && f.outline && f.outline.w > 0) ? 'PASS: 7/7 frames fell back to the empty outline, no broken image' : 'FAIL'),
    };
    result.runs.push(run);
    await send('Target.closeTarget', { targetId });
    await send('Target.disposeBrowserContext', { browserContextId }).catch(() => {});
  }
}
ws.close();
await fs.writeFile(path.join(outDir, 'facts.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result.runs.map((r) => ({ profile: r.profile, mode: r.mode, bundle: r.bundle, failed: r.placeholderRequestsFailedByTest, exceptions: r.consoleExceptions.length, verdict: r.verdict, sample: r.frames[0] })), null, 1));
