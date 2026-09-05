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
  { width: 1100, height: 800 },
  { width: 1024, height: 768 },
  { width: 960, height: 768 },
  { width: 959, height: 768 },
  { width: 768, height: 900 },
  /* Owner captures were Retina source pixels. Their local originals disappeared
     after the reported computer freeze, so these are the exact DPR=2 CSS
     equivalents retained from the supplied source dimensions. The report and
     baseline document keep that inference explicit instead of presenting it as
     recovered browser metadata. */
  { width: 1074, height: 598 },
  { width: 1486, height: 1021 },
  { width: 1390, height: 1030 },
  { width: 1382, height: 1028 },
  { width: 1835, height: 1024 },
  { width: 1645, height: 1003 },
  { width: 1602, height: 1022 },
]);

const REFERENCE_VIEWPORT_WIDTH = 1440;
const RATIO_TOLERANCE = 0.02;

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
      position: style.position,
    };
  };
  const visibleBox = (element) => {
    if (!element) return null;
    const measured = box(element);
    return measured && measured.display !== 'none' && measured.width > 0 && measured.height > 0
      ? measured
      : null;
  };
  const union = (...boxes) => {
    const present = boxes.filter(Boolean);
    if (present.length === 0) return null;
    const left = Math.min(...present.map((entry) => entry.left));
    const right = Math.max(...present.map((entry) => entry.right));
    const top = Math.min(...present.map((entry) => entry.top));
    const bottom = Math.max(...present.map((entry) => entry.bottom));
    return {
      left,
      right,
      top,
      bottom,
      width: Number((right - left).toFixed(2)),
      height: Number((bottom - top).toFixed(2)),
    };
  };
  const bodyFrame = test('pro-panel-recipe');
  const leftTrack = test('workbench-editor-pane');
  const rightTrack = test('pro-monitor-panel');
  const sectionNav = test('pro-context-tabs');
  const bottomNav = test('mobile-cockpit-trigger');
  const header = document.querySelector('header');
  const navigationTrigger = test('app-nav-trigger');
  const homeProSwitch = test('home-pro-switch');
  const account = test('app-header-account') ?? test('app-header-login');
  const floatingActions = test('pro-bottom-right-floating-actions');
  const floatingMonitor = test('pro-floating-monitor');
  const floatingRecalculate = test('pro-floating-recalculate');
  const rows = [...document.querySelectorAll('[data-gellatti-row="ingredient"]')]
    .filter((row) => getComputedStyle(row).display !== 'none');
  const firstRow = rows[0] ?? null;
  const firstName = firstRow?.querySelector('span[class*="text-[12px]"]') ?? null;
  const firstGrams = firstRow?.querySelector('[data-testid^="row-grams-control-"]') ?? null;
  const firstPlus = firstGrams?.querySelector('button[aria-label$="zwiększ"]') ?? null;
  const logo = document.querySelector('[data-logo-asset]')?.parentElement ?? null;
  const sweetnessRail = test('profile-regulator-sweetness')?.querySelector('[role="radiogroup"]') ?? null;
  const settings = test('workbench-settings-line');
  const applicationScale = Number(
    (Number.parseFloat(document.body.style.getPropertyValue('--gellatti-ui-scale')) || 1).toFixed(6)
  );
  const textBox = (element) => {
    if (!element) return null;
    const node = [...element.childNodes].find((child) => child.nodeType === Node.TEXT_NODE);
    if (!node) return box(element);
    const range = document.createRange();
    range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();
    return {
      left: Number(rect.left.toFixed(2)),
      right: Number(rect.right.toFixed(2)),
      top: Number(rect.top.toFixed(2)),
      bottom: Number(rect.bottom.toFixed(2)),
      width: Number(rect.width.toFixed(2)),
      height: Number(rect.height.toFixed(2)),
    };
  };
  const frame = box(bodyFrame);
  const left = box(leftTrack);
  const right = box(rightTrack);
  const nav = box(sectionNav);
  const bottom = box(bottomNav);
  const leftHeaderRegion = union(visibleBox(navigationTrigger), visibleBox(logo));
  // The section-nav track intentionally spans the entire display column. Its
  // unused tail is not interactive geometry, so measure the actual navigation
  // buttons; otherwise the empty track falsely reports an overlap with auth.
  const sectionNavigationControls = sectionNav
    ? union(...[...sectionNav.querySelectorAll('button')].map(visibleBox))
    : null;
  const centerHeaderRegion = union(visibleBox(homeProSwitch), sectionNavigationControls);
  const rightHeaderRegion = visibleBox(account);
  const fixedStack = visibleBox(floatingActions);
  const fixedMonitor = visibleBox(floatingMonitor);
  const fixedRecalculate = visibleBox(floatingRecalculate);
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
    headerRegions: {
      left: leftHeaderRegion,
      center: centerHeaderRegion,
      right: rightHeaderRegion,
      leftCenterSeparation:
        leftHeaderRegion && centerHeaderRegion
          ? Number((centerHeaderRegion.left - leftHeaderRegion.right).toFixed(2))
          : null,
      centerRightSeparation:
        centerHeaderRegion && rightHeaderRegion
          ? Number((rightHeaderRegion.left - centerHeaderRegion.right).toFixed(2))
          : null,
      overlap:
        Boolean(
          leftHeaderRegion && centerHeaderRegion && leftHeaderRegion.right > centerHeaderRegion.left,
        ) ||
        Boolean(
          centerHeaderRegion && rightHeaderRegion && centerHeaderRegion.right > rightHeaderRegion.left,
        ),
      accountText: account?.textContent?.trim() ?? null,
      accountHasIdentity: Boolean(account?.textContent?.includes('@')),
    },
    leftTrack: left,
    rightTrack: right,
    sectionNavigationTrack: nav,
    applicationScale,
    representative: {
      logo: box(logo),
      recipeRow: box(firstRow),
      ingredientNameInk: textBox(firstName),
      ingredientNamePaintedFontSize: firstName
        ? Number((Number.parseFloat(getComputedStyle(firstName).fontSize) * applicationScale).toFixed(4))
        : null,
      plusButton: box(firstPlus),
      gramsControl: box(firstGrams),
      columnGap: left && right ? Number((right.left - left.right).toFixed(2)) : null,
      rightColumn: right,
      slider: box(sweetnessRail),
      settingsCard: box(settings),
      navigation: nav,
    },
    bottomNavigation: bottom,
    bottomNavigationVisible: Boolean(bottom && bottom.display !== 'none' && bottom.visibility !== 'hidden'),
    floatingActions: {
      stack: fixedStack,
      monitor: fixedMonitor,
      recalculate: fixedRecalculate,
      visible: Boolean(fixedStack),
      monitorAboveRecalculate: Boolean(
        fixedMonitor && fixedRecalculate && fixedMonitor.bottom <= fixedRecalculate.top,
      ),
      rightViewportInset: fixedStack
        ? Number((innerWidth - fixedStack.right).toFixed(2))
        : null,
      bottomViewportInset: fixedStack
        ? Number((innerHeight - fixedStack.bottom).toFixed(2))
        : null,
    },
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

const fixedActionScrollProofExpression = String.raw`(async () => {
  const waitFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
  const actions = document.querySelector('[data-testid="pro-bottom-right-floating-actions"]');
  if (!actions || getComputedStyle(actions).display === 'none') {
    return { available: false, hiddenForMobile: innerWidth < 960 };
  }
  const box = () => {
    const rect = actions.getBoundingClientRect();
    return {
      left: Number(rect.left.toFixed(2)),
      top: Number(rect.top.toFixed(2)),
      right: Number(rect.right.toFixed(2)),
      bottom: Number(rect.bottom.toFixed(2)),
    };
  };
  const candidates = [
    document.querySelector('[data-testid="ingredient-rows-scroll"]'),
    document.querySelector('.intelligence-tabpanel-scroll'),
  ].filter(Boolean);
  const scroller = candidates.find((entry) => entry.scrollHeight > entry.clientHeight + 1) ?? candidates[0];
  const before = box();
  const previousScrollTop = scroller?.scrollTop ?? 0;
  if (scroller) scroller.scrollTop = Math.min(previousScrollTop + 120, scroller.scrollHeight);
  await waitFrame();
  await waitFrame();
  const after = box();
  const appliedScrollTop = scroller?.scrollTop ?? 0;
  if (scroller) scroller.scrollTop = previousScrollTop;
  return {
    available: true,
    position: getComputedStyle(actions).position,
    scrollerTestId: scroller?.getAttribute('data-testid') ?? scroller?.className ?? null,
    scrollTopBefore: previousScrollTop,
    scrollTopAfter: appliedScrollTop,
    before,
    after,
    viewportDelta: {
      x: Number((after.left - before.left).toFixed(2)),
      y: Number((after.top - before.top).toFixed(2)),
    },
  };
})()`;

const portalExpression = String.raw`(async () => {
  if (innerWidth < 960) return null;
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
    const fixedActionScrollProof = await evaluate(cdp, fixedActionScrollProofExpression);
    measurements.push({ ...geometry, portals, fixedActionScrollProof, screenshot });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    url,
    fixture,
    viewports: measurements,
  };

  const reference = measurements.find(
    (measurement) => measurement.viewport.width === REFERENCE_VIEWPORT_WIDTH,
  );
  if (!reference) throw new Error('Canonical 1440 px measurement is unavailable');
  const metricValue = (measurement, metric) => {
    const representative = measurement.representative;
    if (metric === 'logo') return representative.logo?.width ?? null;
    if (metric === 'row') return representative.recipeRow?.height ?? null;
    if (metric === 'font') return representative.ingredientNamePaintedFontSize;
    if (metric === 'button') return representative.plusButton?.width ?? null;
    if (metric === 'grams') return representative.gramsControl?.width ?? null;
    if (metric === 'gap') return representative.columnGap;
    if (metric === 'rightPanel') return representative.rightColumn?.width ?? null;
    if (metric === 'slider') return representative.slider?.width ?? null;
    if (metric === 'settings') return representative.settingsCard?.width ?? null;
    if (metric === 'navigation') return representative.navigation?.width ?? null;
    return null;
  };
  const metrics = [
    'logo',
    'row',
    'font',
    'button',
    'grams',
    'gap',
    'rightPanel',
    'slider',
    'settings',
    'navigation',
  ];
  const ratioRows = measurements.map((measurement) => {
    const desktop = measurement.structuralMode === 'DESKTOP';
    const ratios = Object.fromEntries(
      metrics.map((metric) => {
        const actual = metricValue(measurement, metric);
        const canonical = metricValue(reference, metric);
        return [
          metric,
          actual !== null && canonical ? Number((actual / canonical).toFixed(4)) : null,
        ];
      }),
    );
    const presentRatios = Object.values(ratios).filter((ratio) => ratio !== null);
    const spread =
      desktop && presentRatios.length > 0
        ? Number((Math.max(...presentRatios) - Math.min(...presentRatios)).toFixed(4))
        : null;
    const maxScaleDelta =
      desktop && presentRatios.length > 0
        ? Number(
            Math.max(
              ...presentRatios.map((ratio) => Math.abs(ratio - measurement.applicationScale)),
            ).toFixed(4),
          )
        : null;
    return {
      viewport: measurement.viewport,
      structuralMode: measurement.structuralMode,
      expectedScale: measurement.applicationScale,
      ratios,
      spread,
      maxScaleDelta,
      pass:
        !desktop ||
        (spread !== null &&
          maxScaleDelta !== null &&
          spread <= RATIO_TOLERANCE &&
          maxScaleDelta <= RATIO_TOLERANCE),
    };
  });
  const ratioFailures = ratioRows.filter((row) => !row.pass);
  report.uniformScaleAcceptance = {
    referenceViewportWidth: REFERENCE_VIEWPORT_WIDTH,
    tolerance: RATIO_TOLERANCE,
    metrics,
    rows: ratioRows,
    failures: ratioFailures,
  };
  const followupRows = measurements.map((measurement) => {
    const desktop = measurement.viewport.width >= 960;
    const header = measurement.headerRegions;
    const floating = measurement.floatingActions;
    const scroll = measurement.fixedActionScrollProof;
    const headerPass = desktop
      ? Boolean(
          header.left &&
          header.center &&
          header.right &&
          !header.overlap &&
          header.leftCenterSeparation >= 0 &&
          header.centerRightSeparation >= 0 &&
          !header.accountHasIdentity &&
          ['Zaloguj', 'Wyloguj'].includes(header.accountText),
        )
      : true;
    const floatingPass = desktop
      ? Boolean(
          floating.visible &&
          floating.stack?.position === 'fixed' &&
          floating.monitorAboveRecalculate &&
          Math.abs(floating.rightViewportInset - 28.8) <= 0.6 &&
          Math.abs(floating.bottomViewportInset - 28.8) <= 0.6 &&
          scroll.available &&
          scroll.position === 'fixed' &&
          scroll.viewportDelta.x === 0 &&
          scroll.viewportDelta.y === 0,
        )
      : !floating.visible && scroll.hiddenForMobile === true;
    return {
      viewport: measurement.viewport,
      mode: desktop ? 'desktop' : 'mobile',
      headerPass,
      floatingPass,
      pass: headerPass && floatingPass && !measurement.document.overflowX,
    };
  });
  const followupFailures = followupRows.filter((row) => !row.pass);
  report.ownerResponsiveFollowupAcceptance = {
    requiredViewports: ['wide', 'medium', 'narrow-above-960', '960', '959'],
    fixedPaintedInsetPx: 28.8,
    rows: followupRows,
    failures: followupFailures,
  };
  await writeFile(join(outputDir, 'geometry.json'), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(
    `${basename(outputDir)}: captured ${measurements.length} viewports; ratio-failures=${ratioFailures.length}; followup-failures=${followupFailures.length}; geometry=${join(outputDir, 'geometry.json')}\n`,
  );
  if (ratioFailures.length > 0 || followupFailures.length > 0) process.exitCode = 1;
  socket.close();
} finally {
  chrome.kill();
  await Promise.race([chromeExit, delay(2000)]);
  if (resolve(profileDir).startsWith(resolve(tmpdir()))) {
    await rm(profileDir, { recursive: true, force: true });
  }
}
