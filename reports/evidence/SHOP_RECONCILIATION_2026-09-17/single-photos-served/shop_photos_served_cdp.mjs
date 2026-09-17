// Read-only served review of staging /shop (own single photos) through Chrome DevTools Protocol.
// No clicks, no cart, no storage writes, no auth. One fresh browser context per viewport.
// usage: node shop_review_cdp.mjs <outDir> [--cards]
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const outDir = process.argv[2];
const withCards = process.argv.includes('--cards');
const SHOP_URL = 'https://staging.pinguinoai.com/shop';
const PLACEHOLDER = '/shop/single-placeholder.png';
const OWN = { 'GEL-DEX-500': '/shop/singles/dextrose.png', 'GEL-FRU-500': '/shop/singles/fructose.png', 'GEL-INU-500': '/shop/singles/inulin.png',
  'GEL-STB-500': '/shop/singles/gellatti-stabilizer.png', 'GEL-YOL-500': '/shop/singles/dried-egg-yolk.png',
  'GEL-SMP-500': '/shop/singles/skimmed-milk-powder.png', 'GEL-CRP-500': '/shop/singles/cream-powder-42.png' };
const SKUS = ['GEL-DEX-500', 'GEL-FRU-500', 'GEL-INU-500', 'GEL-STB-500', 'GEL-YOL-500', 'GEL-SMP-500', 'GEL-CRP-500'];
const PROFILES = [
  {
    id: 'desktop-1440x900', width: 1440, height: 900, dpr: 2, mobile: false,
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
  },
  {
    id: 'mobile-390x844', width: 390, height: 844, dpr: 3, mobile: true,
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  },
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
    if (msg.error) reject(new Error(`${msg.error.message} ${msg.error.data ?? ''}`));
    else resolve(msg.result);
  } else if (msg.method) {
    for (const listener of listeners) listener(msg);
  }
};
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function evaluate(sessionId, expression, awaitPromise = false) {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise }, sessionId);
  if (res.exceptionDetails) throw new Error(`evaluate failed: ${JSON.stringify(res.exceptionDetails).slice(0, 400)}`);
  return res.result.value;
}

async function clipShot(sessionId, selector, file, scale = 1, pad = 8, profile = currentProfile) {
  // captureBeyondViewport resizes the view; restore the exact device metrics before measuring the next crop.
  await send('Emulation.setDeviceMetricsOverride', { width: profile.width, height: profile.height, deviceScaleFactor: profile.dpr, mobile: profile.mobile }, sessionId);
  await evaluate(sessionId, 'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))', true);
  const measure = () => evaluate(sessionId, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null;
    const b = el.getBoundingClientRect(); return { x: b.left + scrollX, y: b.top + scrollY, width: b.width, height: b.height, vw: innerWidth }; })()`);
  // Only capture once two measurements 250 ms apart agree (a capture can leave the layout settling).
  let rect = await measure();
  for (let i = 0; i < 20; i++) {
    await sleep(250);
    const again = await measure();
    const stable = rect && again && ['x', 'y', 'width', 'height'].every((k) => Math.abs(rect[k] - again[k]) < 0.01);
    rect = again;
    if (stable) break;
  }
  if (!rect || rect.width === 0 || rect.height === 0) return null;
  const clip = { x: Math.max(0, rect.x - pad), y: Math.max(0, rect.y - pad), width: rect.width + 2 * pad, height: rect.height + 2 * pad, scale };
  const { data } = await send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: true, fromSurface: true }, sessionId);
  const buf = Buffer.from(data, 'base64');
  await fs.writeFile(file, buf);
  return { file: path.basename(file), clip, bytes: buf.length };
}

const summary = { url: SHOP_URL, capturedAt: new Date().toISOString(), chrome: ver.Browser, profiles: [] };

let currentProfile = null;
for (const profile of PROFILES) {
  currentProfile = profile;
  const { browserContextId } = await send('Target.createBrowserContext', { disposeOnDetach: true });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const requests = new Map();
  const consoleErrors = [];
  let loadFired = false;
  const listener = (msg) => {
    if (msg.sessionId !== sessionId) return;
    const p = msg.params;
    if (msg.method === 'Network.requestWillBeSent') requests.set(p.requestId, { url: p.request.url, method: p.request.method, type: p.type });
    if (msg.method === 'Network.responseReceived') Object.assign(requests.get(p.requestId) ?? {}, { status: p.response.status, mimeType: p.response.mimeType });
    if (msg.method === 'Network.loadingFinished') Object.assign(requests.get(p.requestId) ?? {}, { finished: true });
    if (msg.method === 'Network.loadingFailed') Object.assign(requests.get(p.requestId) ?? {}, { failed: p.errorText });
    if (msg.method === 'Runtime.exceptionThrown') consoleErrors.push({ kind: 'exception', text: (p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text ?? '').slice(0, 300) });
    if (msg.method === 'Runtime.consoleAPICalled' && p.type === 'error') consoleErrors.push({ kind: 'console.error', text: (p.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300) });
    if (msg.method === 'Log.entryAdded' && p.entry.level === 'error') consoleErrors.push({ kind: 'log', text: `${p.entry.text} ${p.entry.url ?? ''}`.slice(0, 300) });
    if (msg.method === 'Page.loadEventFired') loadFired = true;
  };
  listeners.add(listener);
  for (const domain of ['Page', 'Runtime', 'Network', 'Log']) await send(`${domain}.enable`, {}, sessionId);
  await send('Emulation.setDeviceMetricsOverride', { width: profile.width, height: profile.height, deviceScaleFactor: profile.dpr, mobile: profile.mobile }, sessionId);
  if (profile.mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, sessionId);
  await send('Network.setUserAgentOverride', { userAgent: profile.ua, acceptLanguage: 'pl-PL,pl;q=0.9' }, sessionId);
  await send('Emulation.setLocaleOverride', { locale: 'pl-PL' }, sessionId);
  await send('Network.setCacheDisabled', { cacheDisabled: true }, sessionId);

  await send('Page.navigate', { url: SHOP_URL }, sessionId);
  for (let i = 0; i < 120 && !loadFired; i++) await sleep(250);
  let state = null;
  for (let i = 0; i < 160; i++) {
    state = await evaluate(sessionId, `(() => ({ cards: document.querySelectorAll('[data-testid^="shop-card-"]').length,
      loadError: /Nie udało się wczytać sklepu/i.test(document.body?.innerText ?? ''), visibility: document.visibilityState }))()`);
    if (state.cards >= 7 || state.loadError) break;
    await sleep(250);
  }
  // Walk the page once so any lazy image is requested, then return to the top.
  await evaluate(sessionId, `(async () => { const h = document.documentElement.scrollHeight; for (let y = 0; y < h; y += Math.round(innerHeight * 0.8)) { scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); } scrollTo(0, 0); return true; })()`, true);
  let imagesReady = false;
  for (let i = 0; i < 60; i++) {
    imagesReady = await evaluate(sessionId, `[...document.querySelectorAll('#shop-singles img, [data-testid="shop-starter-offer"] img')].every((img) => img.complete && img.naturalWidth > 0)`);
    if (imagesReady) break;
    await sleep(250);
  }
  await evaluate(sessionId, 'document.fonts.ready.then(() => true)', true);
  await sleep(600);

  const facts = await evaluate(sessionId, `(() => {
    const SKUS = ${JSON.stringify(SKUS)};
    const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: +(b.left + scrollX).toFixed(2), y: +(b.top + scrollY).toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2) }; };
    const within = (a, b, eps = 0.51) => !!a && !!b && a.x >= b.x - eps && a.y >= b.y - eps && a.x + a.w <= b.x + b.w + eps && a.y + a.h <= b.y + b.h + eps;
    const cards = [...document.querySelectorAll('[data-testid^="shop-card-"]')].map((card) => {
      const sku = card.getAttribute('data-testid').replace('shop-card-', '');
      const frame = card.querySelector('[data-testid="shop-reserved-frame"]');
      const img = frame ? frame.querySelector('img') : null;
      const frameBox = box(frame);
      const imgBox = box(img);
      let contentBox = null;
      if (img && img.naturalWidth > 0 && imgBox) {
        const s = Math.min(imgBox.w / img.naturalWidth, imgBox.h / img.naturalHeight);
        const cw = img.naturalWidth * s; const ch = img.naturalHeight * s;
        contentBox = { x: +(imgBox.x + (imgBox.w - cw) / 2).toFixed(2), y: +(imgBox.y + (imgBox.h - ch) / 2).toFixed(2), w: +cw.toFixed(2), h: +ch.toFixed(2) };
      }
      const fs = frame ? getComputedStyle(frame) : null;
      const is = img ? getComputedStyle(img) : null;
      return {
        sku,
        expectedSrc: (${JSON.stringify(OWN)})[sku] ?? null,
        text: (card.innerText || '').split('\\n').map((t) => t.trim()).filter(Boolean).slice(0, 3),
        frame: frameBox,
        frameStyle: fs ? { background: fs.backgroundColor, radius: fs.borderRadius, overflow: fs.overflow } : null,
        img: img ? { src: img.getAttribute('src'), currentSrc: img.currentSrc, complete: img.complete, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight,
          objectFit: is.objectFit, objectPosition: is.objectPosition, mixBlendMode: is.mixBlendMode, alt: img.getAttribute('alt'), ariaHidden: img.getAttribute('aria-hidden'), box: imgBox } : null,
        contentBox,
        imgBoxInsideFrame: img ? within(imgBox, frameBox) : null,
        wholeImageInsideFrame: contentBox ? within(contentBox, frameBox) && is.objectFit === 'contain' : null,
      };
    });
    const cardBoxes = cards.map((c) => ({ sku: c.sku, b: box(document.querySelector('[data-testid="shop-card-' + c.sku + '"]')) }));
    const overlaps = [];
    for (let i = 0; i < cardBoxes.length; i++) for (let j = i + 1; j < cardBoxes.length; j++) {
      const a = cardBoxes[i].b, b = cardBoxes[j].b;
      if (a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5) overlaps.push([cardBoxes[i].sku, cardBoxes[j].sku]);
    }
    const offer = document.querySelector('[data-testid="shop-starter-offer"]');
    const shot = document.querySelector('[data-testid="shop-starter-shot"]');
    const shotImg = shot ? (shot.tagName === 'IMG' ? shot : shot.querySelector('img')) : null;
    const placeholderImgs = [...document.querySelectorAll('img')].filter((img) => (img.getAttribute('src') || '') === '${PLACEHOLDER}');
    return {
      title: document.title, lang: document.documentElement.lang,
      bundle: [...document.scripts].map((s) => s.src).filter((s) => s.includes('/assets/index-')),
      viewport: { innerWidth, innerHeight, dpr: devicePixelRatio, pointerCoarse: matchMedia('(pointer: coarse)').matches },
      horizontalOverflow: { scrollWidth: document.documentElement.scrollWidth, innerWidth, overflow: document.documentElement.scrollWidth > innerWidth },
      storedCountry: localStorage.getItem('gellatti-shop-country'),
      singlesSection: { present: !!document.getElementById('shop-singles'), heading: document.getElementById('shop-singles-title')?.innerText ?? null, box: box(document.getElementById('shop-singles')) },
      cards, cardOverlaps: overlaps,
      placeholderImgCount: placeholderImgs.length,
      placeholderImgOwners: placeholderImgs.map((img) => img.closest('[data-testid^="shop-card-"]')?.getAttribute('data-testid') ?? 'OUTSIDE_CARD'),
      starterOffer: offer ? {
        box: box(offer),
        text: (offer.innerText || '').split('\\n').map((t) => t.trim()).filter(Boolean).slice(0, 8),
        mainShot: shotImg ? { src: shotImg.getAttribute('src'), currentSrc: shotImg.currentSrc, complete: shotImg.complete, naturalWidth: shotImg.naturalWidth, naturalHeight: shotImg.naturalHeight, objectFit: getComputedStyle(shotImg).objectFit } : null,
        thumbs: [...offer.querySelectorAll('[data-testid^="shop-shot-"]')].map((t) => ({ id: t.getAttribute('data-testid'), src: t.querySelector('img')?.getAttribute('src') ?? null, pressed: t.getAttribute('aria-pressed') })),
        allImgSrcs: [...offer.querySelectorAll('img')].map((img) => img.getAttribute('src')),
        countrySelect: (() => { const s = offer.querySelector('select'); return s ? { options: s.options.length, firstOptions: [...s.options].slice(0, 4).map((o) => o.text) } : null; })(),
      } : null,
    };
  })()`);

  // Network evidence (no headers are stored: they carry the public anon key).
  const reqs = [...requests.values()];
  const placeholderReqs = [];
  for (const [requestId, r] of requests) {
    if (r.url.endsWith(PLACEHOLDER) || r.url.includes('/shop/singles/')) {
      let sha256 = null, bytes = null;
      try {
        const body = await send('Network.getResponseBody', { requestId }, sessionId);
        const buf = Buffer.from(body.body, body.base64Encoded ? 'base64' : 'utf8');
        sha256 = crypto.createHash('sha256').update(buf).digest('hex');
        bytes = buf.length;
      } catch (e) { sha256 = `unavailable: ${e.message.slice(0, 80)}`; }
      placeholderReqs.push({ url: r.url, status: r.status, mimeType: r.mimeType, bytes, sha256 });
    }
  }
  const supabase = reqs.filter((r) => r.url.includes('.supabase.co')).map((r) => ({ method: r.method, path: new URL(r.url).pathname, status: r.status ?? null }));
  let catalog = null;
  for (const [requestId, r] of requests) {
    if (r.url.includes('gellatti_shop_catalog')) {
      try {
        const body = await send('Network.getResponseBody', { requestId }, sessionId);
        const json = JSON.parse(body.base64Encoded ? Buffer.from(body.body, 'base64').toString('utf8') : body.body);
        const rows = [];
        const walk = (v) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') { if (typeof v.sku === 'string') rows.push({ sku: v.sku, kind: v.kind ?? null, name: v.name ?? v.title ?? null, image_url: v.image_url ?? v.imageUrl ?? null, active: v.active ?? null }); else Object.values(v).forEach(walk); } };
        walk(json);
        catalog = rows;
      } catch (e) { catalog = `unavailable: ${e.message.slice(0, 80)}`; }
    }
  }

  const dir = path.join(outDir, profile.id);
  await fs.mkdir(dir, { recursive: true });
  const shots = {};
  shots.starterOffer = await clipShot(sessionId, '[data-testid="shop-starter-offer"]', path.join(dir, '01-starter-pack.png'));
  shots.singles = await clipShot(sessionId, '#shop-singles', path.join(dir, '02-kup-osobno-7-cards.png'));
  if (withCards) {
    shots.cards = [];
    for (const [i, sku] of SKUS.entries()) {
      shots.cards.push(await clipShot(sessionId, `[data-testid="shop-card-${sku}"]`, path.join(dir, `03-card-${i + 1}-${sku}.png`)));
    }
  }
  const metrics = await send('Page.getLayoutMetrics', {}, sessionId);
  const size = metrics.cssContentSize ?? metrics.contentSize;
  const full = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, fromSurface: true,
    clip: { x: 0, y: 0, width: size.width, height: size.height, scale: 1 / profile.dpr } }, sessionId);
  await fs.writeFile(path.join(dir, '00-full-page-css1x.png'), Buffer.from(full.data, 'base64'));
  shots.fullPage = '00-full-page-css1x.png';

  summary.profiles.push({ profile, state, imagesReady, facts, network: { placeholder: placeholderReqs, supabase, total: reqs.length }, catalog, consoleErrors, shots });
  listeners.delete(listener);
  await send('Target.closeTarget', { targetId });
  await send('Target.disposeBrowserContext', { browserContextId }).catch(() => {});
}

await fs.writeFile(path.join(outDir, 'facts.json'), JSON.stringify(summary, null, 2));
ws.close();
const brief = summary.profiles.map((p) => ({
  profile: p.profile.id, state: p.state, imagesReady: p.imagesReady, bundle: p.facts.bundle, overflow: p.facts.horizontalOverflow.overflow,
  cards: p.facts.cards.map((c) => `${c.sku}:${c.img ? c.img.src : 'no-img'}:complete=${c.img?.complete}:nw=${c.img?.naturalWidth}:fit=${c.img?.objectFit}:whole=${c.wholeImageInsideFrame}`),
  placeholderImgCount: p.facts.placeholderImgCount, owners: p.facts.placeholderImgOwners, overlaps: p.facts.cardOverlaps,
  starter: p.facts.starterOffer ? { main: p.facts.starterOffer.mainShot, imgs: p.facts.starterOffer.allImgSrcs } : null,
  placeholderNet: p.network.placeholder, supabase: p.network.supabase, consoleErrors: p.consoleErrors.length,
}));
console.log(JSON.stringify(brief, null, 1));
