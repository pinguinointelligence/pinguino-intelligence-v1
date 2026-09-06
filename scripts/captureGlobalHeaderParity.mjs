import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const VIEWPORTS = Object.freeze([
  { width: 1920, height: 1080 },
  { width: 1600, height: 900 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 800 },
  { width: 1200, height: 800 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
]);

const ROUTES = Object.freeze([
  '/home',
  '/start',
  '/pro/recipe',
  '/pro/monitor',
  '/pro/production',
  '/pro/recipe?panel=summary',
  '/recipes',
  '/products',
  '/production',
  '/labels',
  '/account',
  '/machine',
  '/products/scan',
  '/shop',
  '/work-with-us',
  '/subscription',
  '/api',
  '/how-it-works',
]);

const PAIR_ROUTES = new Set(['/home', '/pro/recipe']);

function argument(name, fallback) {
  const prefix = `--${name}=`;
  return process.argv.find((entry) => entry.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

const origin = argument('origin', 'http://127.0.0.1:5177');
const outputDir = resolve(argument('output', 'artifacts/global-header-parity'));
const chromePath = argument(
  'chrome',
  process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : 'google-chrome',
);
const port = Number(argument('port', String(9680 + Math.floor(Math.random() * 100))));
const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolveSend, rejectSend) => {
      this.pending.set(id, { resolve: resolveSend, reject: rejectSend });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
}

async function waitForJson(endpoint) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(endpoint);
      if (response.ok) return response.json();
    } catch {
      // Chrome has not exposed the debugging endpoint yet.
    }
    await delay(100);
  }
  throw new Error(`Chrome debugging endpoint did not open: ${endpoint}`);
}

async function evaluate(cdp, expression) {
  const response = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (response.exceptionDetails) {
    throw new Error(
      response.exceptionDetails.exception?.description ?? 'Browser evaluation failed',
    );
  }
  return response.result.value;
}

const prepareExpression = String.raw`(async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let persona = null;
  for (let attempt = 0; attempt < 60 && !persona; attempt += 1) {
    persona = [...document.querySelectorAll('select')].find((entry) =>
      [...entry.options].some((option) => option.value === 'pro') &&
      [...entry.options].some((option) => option.value === 'demo')
    );
    if (!persona) await wait(100);
  }
  if (!persona) throw new Error('DEV persona selector is unavailable');
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
  setter.call(persona, 'pro');
  persona.dispatchEvent(new Event('change', { bubbles: true }));
  await wait(600);
  await document.fonts.ready;
  const style = document.createElement('style');
  style.dataset.headerParityQa = 'true';
  style.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}[data-testid="design-review-overlay"],label:has(>[data-testid="pro-persona-switch"]){display:none!important}';
  document.head.appendChild(style);
  return location.pathname;
})()`;

const transitionExpression = (route) => String.raw`(async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  history.pushState({}, '', ${JSON.stringify(route)});
  dispatchEvent(new PopStateEvent('popstate'));
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (document.querySelector('header [data-testid="home-pro-switch"]')) break;
    await wait(50);
  }
  await wait(350);
  await document.fonts.ready;
  scrollTo(0, 0);
  return location.pathname + location.search;
})()`;

const measurementExpression = String.raw`(() => {
  const box = (element) => {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      left: Number(rect.left.toFixed(2)),
      right: Number(rect.right.toFixed(2)),
      top: Number(rect.top.toFixed(2)),
      bottom: Number(rect.bottom.toFixed(2)),
      width: Number(rect.width.toFixed(2)),
      height: Number(rect.height.toFixed(2)),
      display: style.display,
      visibility: style.visibility,
    };
  };
  const header = document.querySelector('header');
  const trigger = header?.querySelector('[data-testid="app-nav-trigger"]');
  const brand = header?.querySelector('a[aria-label="GELLATTI"]');
  const viewSwitch = header?.querySelector('[data-testid="home-pro-switch"]');
  const account = header?.querySelector('[data-testid="app-header-login"]');
  const tabs = [...(viewSwitch?.querySelectorAll('[role="tab"]') ?? [])];
  return {
    route: location.pathname + location.search,
    header: box(header),
    hamburger: box(trigger),
    logo: box(brand),
    viewSwitch: box(viewSwitch),
    account: box(account),
    tablistCount: header?.querySelectorAll('[data-testid="home-pro-switch"]').length ?? 0,
    tabCount: tabs.length,
    selectedTabs: tabs
      .filter((tab) => tab.getAttribute('aria-selected') === 'true')
      .map((tab) => tab.textContent?.trim()),
    documentOverflowX: document.documentElement.scrollWidth > innerWidth + 1,
  };
})()`;

const trackedBoxes = ['header', 'hamburger', 'logo', 'viewSwitch', 'account'];
const dimensions = ['left', 'right', 'top', 'bottom', 'width', 'height'];
const compareToReference = (measurement, reference) => {
  const deltas = {};
  let maximumDelta = 0;
  for (const boxName of trackedBoxes) {
    const actual = measurement[boxName];
    const expected = reference[boxName];
    if (!actual || !expected || actual.display === 'none' || expected.display === 'none') continue;
    deltas[boxName] = {};
    for (const dimension of dimensions) {
      const delta = Number(Math.abs(actual[dimension] - expected[dimension]).toFixed(2));
      deltas[boxName][dimension] = delta;
      maximumDelta = Math.max(maximumDelta, delta);
    }
  }
  const presenceMismatch = trackedBoxes.some(
    (boxName) => Boolean(measurement[boxName]) !== Boolean(reference[boxName]),
  );
  return { deltas, maximumDelta: Number(maximumDelta.toFixed(2)), presenceMismatch };
};

const expectedSelectionFor = (route) =>
  route.startsWith('/pro') ? ['PRO'] : route === '/home' || route === '/start' ? ['HOME'] : [];

await mkdir(outputDir, { recursive: true });
const profileDir = await mkdtemp(join(tmpdir(), 'pinguino-header-parity-'));
const chrome = spawn(
  chromePath,
  [
    '--headless=new',
    '--disable-gpu',
    '--disable-extensions',
    '--no-first-run',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--force-device-scale-factor=1',
    '--window-size=1920,1080',
    'about:blank',
  ],
  { stdio: 'ignore' },
);
const chromeExit = new Promise((resolveExit) => chrome.once('exit', resolveExit));

try {
  await waitForJson(`http://127.0.0.1:${port}/json/version`);
  const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) =>
    response.json(),
  );
  const page = pages.find((entry) => entry.type === 'page');
  if (!page) throw new Error('Chrome did not expose a page target');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolveSocket, rejectSocket) => {
    socket.addEventListener('open', resolveSocket, { once: true });
    socket.addEventListener('error', rejectSocket, { once: true });
  });
  const cdp = new CdpClient(socket);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    ...VIEWPORTS[0],
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: VIEWPORTS[0].width,
    screenHeight: VIEWPORTS[0].height,
  });
  await cdp.send('Page.navigate', { url: `${origin}/pro/recipe` });
  await delay(1500);
  await evaluate(cdp, prepareExpression);

  const results = [];
  for (const viewport of VIEWPORTS) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      ...viewport,
      deviceScaleFactor: 1,
      mobile: viewport.width < 600,
      screenWidth: viewport.width,
      screenHeight: viewport.height,
    });
    await delay(200);

    await evaluate(cdp, transitionExpression('/pro/recipe'));
    const reference = await evaluate(cdp, measurementExpression);
    const routes = [];
    for (const route of ROUTES) {
      await evaluate(cdp, transitionExpression(route));
      const measurement = await evaluate(cdp, measurementExpression);
      const comparison = compareToReference(measurement, reference);
      let screenshot = null;
      if (PAIR_ROUTES.has(route)) {
        screenshot = `${route === '/home' ? 'home' : 'pro'}-${viewport.width}x${viewport.height}.png`;
        const capture = await cdp.send('Page.captureScreenshot', {
          format: 'png',
          fromSurface: true,
          captureBeyondViewport: false,
        });
        await writeFile(join(outputDir, screenshot), Buffer.from(capture.data, 'base64'));
      }
      routes.push({ requestedRoute: route, ...measurement, ...comparison, screenshot });
    }
    results.push({ viewport, reference, routes });
  }

  const failures = results.flatMap(({ viewport, routes }) =>
    routes
      .filter(
        (entry) =>
          entry.maximumDelta > 0.5 ||
          entry.presenceMismatch ||
          entry.tablistCount !== 1 ||
          entry.tabCount !== 2 ||
          entry.documentOverflowX ||
          JSON.stringify(entry.selectedTabs) !==
            JSON.stringify(expectedSelectionFor(entry.requestedRoute)),
      )
      .map((entry) => ({
        viewport,
        route: entry.requestedRoute,
        maximumDelta: entry.maximumDelta,
      })),
  );
  await writeFile(
    join(outputDir, 'geometry.json'),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), origin, results, failures }, null, 2)}\n`,
  );
  process.stdout.write(
    `global-header-parity: ${results.length} viewports × ${ROUTES.length} routes; failures=${failures.length}; geometry=${join(outputDir, 'geometry.json')}\n`,
  );
  socket.close();
} finally {
  chrome.kill();
  await Promise.race([chromeExit, delay(2000)]);
  if (resolve(profileDir).startsWith(resolve(tmpdir()))) {
    await rm(profileDir, { recursive: true, force: true });
  }
}
