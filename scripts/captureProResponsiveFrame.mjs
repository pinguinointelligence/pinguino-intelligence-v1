import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

const VIEWPORTS = Object.freeze([
  { width: 1920, height: 1080 },
  { width: 1728, height: 1117 },
  { width: 1600, height: 900 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 800 },
  { width: 1200, height: 800 },
  { width: 1024, height: 768 },
  { width: 768, height: 900 },
]);

function argument(name, fallback) {
  const prefix = `--${name}=`;
  return process.argv.find((entry) => entry.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

const url = argument('url', 'http://127.0.0.1:5177/pro/recipe');
const outputDir = resolve(argument('output', 'artifacts/pro-responsive-frame'));
const chromePath = argument(
  'chrome',
  process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : 'google-chrome',
);
const port = Number(argument('port', String(9560 + Math.floor(Math.random() * 100))));

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
      // Chrome has not opened the debugging endpoint yet.
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

const fixtureExpression = String.raw`(async () => {
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
  await wait(700);
  await document.fonts.ready;
  const style = document.createElement('style');
  style.dataset.responsiveFrameQa = 'true';
  style.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}[data-testid="design-review-overlay"],label:has(>[data-testid="pro-persona-switch"]){display:none!important}';
  document.head.appendChild(style);
  window.scrollTo(0, 0);
  return {
    route: location.pathname,
    baseRows: document.querySelectorAll('[data-scope="BASE_FORMULATION"]').length,
  };
})()`;

const geometryExpression = String.raw`(() => {
  const test = (id) => document.querySelector('[data-testid="' + id + '"]');
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
  const bodyFrame = test('pro-panel-recipe');
  const leftTrack = test('workbench-editor-pane');
  const rightTrack = test('pro-monitor-panel');
  const sectionNav = test('pro-context-tabs');
  const bottomNav = test('mobile-cockpit-trigger');
  const header = document.querySelector('header');
  const rows = [...document.querySelectorAll('[data-gellatti-row="ingredient"]')]
    .filter((row) => getComputedStyle(row).display !== 'none');
  const frame = box(bodyFrame);
  const left = box(leftTrack);
  const right = box(rightTrack);
  const nav = box(sectionNav);
  const bottom = box(bottomNav);
  const rootStyle = getComputedStyle(document.documentElement);
  const ingredientOverflow = rows.some((row) => {
    const rowBox = row.getBoundingClientRect();
    return row.scrollWidth > row.clientWidth + 1 ||
      (left && (rowBox.left < left.left - 1 || rowBox.right > left.right + 1));
  });
  return {
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    density: rootStyle.getPropertyValue('--pro-density-state').trim() || 'UNDECLARED',
    structuralMode: rootStyle.getPropertyValue('--pro-structural-mode').trim() ||
      (right?.display === 'none' ? 'TABLET' : 'DESKTOP'),
    outerFrame: frame,
    header: box(header),
    leftTrack: left,
    rightTrack: right,
    sectionNavigationTrack: nav,
    bottomNavigation: bottom,
    bottomNavigationVisible: Boolean(bottom && bottom.display !== 'none' && bottom.visibility !== 'hidden'),
    leftGutter: frame ? Number(frame.left.toFixed(2)) : null,
    rightGutter: frame ? Number((innerWidth - frame.right).toFixed(2)) : null,
    gutterDelta: frame ? Number(Math.abs(frame.left - (innerWidth - frame.right)).toFixed(2)) : null,
    headerBodyRightTrackLeftDelta:
      right && nav ? Number(Math.abs(right.left - nav.left).toFixed(2)) : null,
    headerBodyRightTrackWidthDelta:
      right && nav ? Number(Math.abs(right.width - nav.width).toFixed(2)) : null,
    ingredientRowsVisible: rows.length,
    ingredientTableClipped: ingredientOverflow,
    document: {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      overflowX: document.documentElement.scrollWidth > innerWidth + 1,
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
    },
  };
})()`;

const portalExpression = String.raw`(async () => {
  if (innerWidth < 1120) return null;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const box = (element) => {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return {
      left: Number(rect.left.toFixed(2)),
      right: Number(rect.right.toFixed(2)),
      top: Number(rect.top.toFixed(2)),
      bottom: Number(rect.bottom.toFixed(2)),
      width: Number(rect.width.toFixed(2)),
      height: Number(rect.height.toFixed(2)),
    };
  };
  const visible = (element) => element && getComputedStyle(element).display !== 'none' &&
    element.getBoundingClientRect().width > 0;

  const pickerMarker = [...document.querySelectorAll('[data-testid="ingredient-add-core"]')]
    .find(visible);
  const pickerTrigger = pickerMarker?.closest('button');
  if (!pickerTrigger) throw new Error('Visible ingredient picker trigger is unavailable');
  pickerTrigger.click();
  await wait(300);
  const picker = document.querySelector('[role="dialog"][data-picker-position]');
  const pickerBackdrop = document.querySelector('.pro-product-picker-backdrop');
  if (!picker || !pickerBackdrop) throw new Error('Ingredient picker portal did not open');
  const pickerBox = box(picker);
  const pickerProof = {
    position: picker?.getAttribute('data-picker-position'),
    parentIsBody: picker?.parentElement === document.body,
    box: pickerBox,
    withinViewport: Boolean(
      pickerBox && pickerBox.left >= -1 && pickerBox.top >= -1 &&
      pickerBox.right <= innerWidth + 1 && pickerBox.bottom <= innerHeight + 1
    ),
    backdrop: getComputedStyle(pickerBackdrop).backgroundColor,
  };
  picker.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await wait(200);

  const menuTrigger = [...document.querySelectorAll('button[aria-label^="Opcje składnika "]')]
    .find(visible);
  if (!menuTrigger) throw new Error('Visible ingredient row menu trigger is unavailable');
  menuTrigger.click();
  await wait(250);
  const overlay = document.querySelector('[data-testid^="row-menu-"]');
  const panel = overlay?.querySelector('[role="dialog"]');
  const overlayBox = box(overlay);
  const panelBox = box(panel);
  const dialogProof = {
    overlayParentIsBody: overlay?.parentElement === document.body,
    overlayBox,
    panelBox,
    overlayCoversViewport: Boolean(
      overlayBox && overlayBox.left === 0 && overlayBox.top === 0 &&
      Math.abs(overlayBox.right - innerWidth) <= 1 && Math.abs(overlayBox.bottom - innerHeight) <= 1
    ),
    panelWithinViewport: Boolean(
      panelBox && panelBox.left >= -1 && panelBox.top >= -1 &&
      panelBox.right <= innerWidth + 1 && panelBox.bottom <= innerHeight + 1
    ),
  };
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await wait(150);
  return { picker: pickerProof, dialog: dialogProof };
})()`;

async function captureFullPage(cdp, outputPath, viewport) {
  const metrics = await cdp.send('Page.getLayoutMetrics');
  const content = metrics.cssContentSize ?? metrics.contentSize;
  const width = Math.max(viewport.width, Math.ceil(content.width));
  const height = Math.max(viewport.height, Math.ceil(content.height));
  const screenshot = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width, height, scale: 1 },
  });
  await writeFile(outputPath, Buffer.from(screenshot.data, 'base64'));
}

await mkdir(outputDir, { recursive: true });
const profileDir = await mkdtemp(join(tmpdir(), 'pinguino-pro-responsive-frame-'));
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
  await cdp.send('Page.navigate', { url });
  await delay(1600);
  const fixture = await evaluate(cdp, fixtureExpression);
  if (fixture.baseRows < 1) throw new Error(`Recipe fixture failed: ${JSON.stringify(fixture)}`);

  const measurements = [];
  for (const viewport of VIEWPORTS) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      ...viewport,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: viewport.width,
      screenHeight: viewport.height,
    });
    await delay(250);
    await evaluate(cdp, 'window.scrollTo(0, 0)');
    const geometry = await evaluate(cdp, geometryExpression);
    const screenshot = `${viewport.width}x${viewport.height}.png`;
    await captureFullPage(cdp, join(outputDir, screenshot), viewport);
    const portals = await evaluate(cdp, portalExpression);
    measurements.push({ ...geometry, portals, screenshot });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    url,
    fixture,
    viewports: measurements,
  };
  await writeFile(join(outputDir, 'geometry.json'), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(
    `${basename(outputDir)}: captured ${measurements.length} viewports; geometry=${join(outputDir, 'geometry.json')}\n`,
  );
  socket.close();
} finally {
  chrome.kill();
  await Promise.race([chromeExit, delay(2000)]);
  if (resolve(profileDir).startsWith(resolve(tmpdir()))) {
    await rm(profileDir, { recursive: true, force: true });
  }
}
