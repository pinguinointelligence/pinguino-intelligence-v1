import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const args = new Map(
  process.argv.slice(2).map((entry) => {
    const [key, ...value] = entry.replace(/^--/, '').split('=');
    return [key, value.join('=')];
  }),
);

const origin = args.get('origin') ?? 'http://127.0.0.1:4173';
const output = args.get('output') ?? '/tmp/knowledge-tour-geometry.json';
const strict = args.get('strict') === 'true';
const debugPort = process.env.CHROME_DEBUG_PORT ?? '9224';
const qaEmail = process.env.GELLATTI_STAGING_QA_EMAIL ?? 'pro@pro.com';
const qaPassword =
  process.env.GELLATTI_STAGING_QA_PASSWORD ??
  process.env.STAGING_QA_PASSWORD ??
  process.env.QA_PASSWORD ??
  '';
const checklistItem =
  'SOL-034 — Knowledge Tour ma niestabilną geometrię w embedded PRO i pełnej wersji webowej; krok, tytuł, obraz oraz teksty zmieniają pozycję między planszami, a w PRO przesuwa się również dolna nawigacja.';
const defaultViewports = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
];
const viewports = args.get('viewports')
  ? args
      .get('viewports')
      .split(',')
      .map((viewport) => {
        const [width, height] = viewport.split('x').map(Number);
        return { width, height };
      })
  : defaultViewports;

const created = await fetch(
  `http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(`${origin}/how-it-works?step=1`)}`,
  { method: 'PUT' },
).then((response) => response.json());
const socket = new WebSocket(created.webSocketDebuggerUrl);
let nextId = 0;
const pending = new Map();
const consoleErrors = [];
const exceptions = [];
const requestUrls = new Map();
const networkFailures = [];

socket.addEventListener('message', (event) => {
  const message = JSON.parse(String(event.data));
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolve(message.result);
  }
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    consoleErrors.push(
      message.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' '),
    );
  }
  if (message.method === 'Runtime.exceptionThrown') {
    exceptions.push(message.params.exceptionDetails.text);
  }
  if (message.method === 'Network.requestWillBeSent') {
    requestUrls.set(message.params.requestId, message.params.request.url);
  }
  if (message.method === 'Network.loadingFailed' && !message.params.canceled) {
    networkFailures.push({
      url: requestUrls.get(message.params.requestId) ?? message.params.requestId,
      errorText: message.params.errorText,
    });
  }
});

await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
};
const waitFor = async (expression, label, timeoutMs = 20_000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await evaluate(expression)) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
};
const navigate = async (url) => {
  await send('Page.navigate', { url });
  await waitFor("document.readyState === 'complete'", `load ${url}`);
  await sleep(350);
};
const setViewport = async ({ width, height }) => {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 600,
    screenWidth: width,
    screenHeight: height,
  });
};
const clickAt = async ({ x, y }) => {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });
};
await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');

const installLayoutShiftObserver = async () => {
  await evaluate(`(() => {
    window.__sol034LayoutShifts = [];
    window.__sol034LayoutShiftObserver?.disconnect();
    if (!('PerformanceObserver' in window)) return false;
    const supported = PerformanceObserver.supportedEntryTypes?.includes('layout-shift');
    if (!supported) return false;
    window.__sol034LayoutShiftObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__sol034LayoutShifts.push({
          value: entry.value,
          hadRecentInput: entry.hadRecentInput,
          startTime: entry.startTime,
          sources: entry.sources?.map((source) => ({
            node: source.node?.className || source.node?.tagName || null,
            previousRect: source.previousRect?.toJSON?.() ?? null,
            currentRect: source.currentRect?.toJSON?.() ?? null,
          })) ?? [],
        });
      }
    });
    window.__sol034LayoutShiftObserver.observe({ type: 'layout-shift', buffered: false });
    return true;
  })()`);
};

const measure = async (layout) =>
  evaluate(`(() => {
    const guide = document.querySelector('[data-testid="knowledge-tour"][data-layout="${layout}"]');
    if (!guide) return null;
    const rect = (selector) => {
      const element = guide.querySelector(selector);
      if (!element) return null;
      const value = element.getBoundingClientRect();
      return Object.fromEntries(
        ['x', 'y', 'width', 'height', 'top', 'right', 'bottom', 'left'].map((key) => [
          key,
          Math.round(value[key] * 1000) / 1000,
        ]),
      );
    };
    const rootRect = guide.getBoundingClientRect();
    const externalRect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const value = element.getBoundingClientRect();
      return Object.fromEntries(
        ['x', 'y', 'width', 'height', 'top', 'right', 'bottom', 'left'].map((key) => [
          key,
          Math.round(value[key] * 1000) / 1000,
        ]),
      );
    };
    const tourRect = Object.fromEntries(
      ['x', 'y', 'width', 'height', 'top', 'right', 'bottom', 'left'].map((key) => [
        key,
        Math.round(rootRect[key] * 1000) / 1000,
      ]),
    );
    const ancestors = [];
    for (let element = guide.parentElement; element; element = element.parentElement) {
      const style = getComputedStyle(element);
      if (/(auto|scroll)/.test(style.overflowY) || element.dataset.testid) {
        ancestors.push({
          testid: element.dataset.testid ?? null,
          className: typeof element.className === 'string' ? element.className.slice(0, 160) : '',
          scrollTop: element.scrollTop,
          scrollHeight: element.scrollHeight,
          clientHeight: element.clientHeight,
          overflowY: style.overflowY,
          height: style.height,
          minHeight: style.minHeight,
          maxHeight: style.maxHeight,
          flex: style.flex,
          display: style.display,
        });
      }
    }
    const captionSelector = guide.querySelector('[data-tour-slot="captions"]')
      ? '[data-tour-slot="captions"]'
      : '.knowledge-tour__annotations';
    const subtitleSelector = guide.querySelector('[data-tour-slot="subtitle"]')
      ? '[data-tour-slot="subtitle"]'
      : '.knowledge-tour__body';
    const titleSelector = guide.querySelector('[data-tour-slot="title"]')
      ? '[data-tour-slot="title"]'
      : '.knowledge-tour__title';
    const visualSelector = guide.querySelector('[data-tour-slot="visual"]')
      ? '[data-tour-slot="visual"]'
      : '.knowledge-tour__artwork';
    const stepSelector = guide.querySelector('[data-tour-slot="step"]')
      ? '[data-tour-slot="step"]'
      : '.knowledge-tour__eyebrow';
    return {
      step: Number(guide.dataset.activeStep),
      imageComplete: guide.querySelector('img')?.complete ?? false,
      tour: tourRect,
      backEntry: externalRect('[data-tour-host-slot="back-entry"]'),
      stepIndicator: rect(stepSelector),
      title: rect(titleSelector),
      subtitle: rect(subtitleSelector),
      visual: rect(visualSelector),
      captions: rect(captionSelector),
      navigation: rect('.knowledge-tour__navigation'),
      previous: rect('.knowledge-tour__nav-button:first-child'),
      previousArrow: rect('.knowledge-tour__nav-button:first-child svg'),
      dots: rect('.knowledge-tour__progress'),
      next: rect('.knowledge-tour__nav-button:last-child'),
      nextArrow: rect('.knowledge-tour__nav-button:last-child svg'),
      scroll: {
        windowY: window.scrollY,
        documentTop: document.scrollingElement?.scrollTop ?? null,
        stageTop: guide.querySelector('.knowledge-tour__stage')?.scrollTop ?? null,
        ancestors,
      },
      layoutShifts: [...(window.__sol034LayoutShifts ?? [])],
    };
  })()`);

const center = (rect) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
const describePoint = ({ x, y }) =>
  evaluate(`(() => {
    const element = document.elementFromPoint(${x}, ${y});
    if (!element) return null;
    return {
      tag: element.tagName,
      testid: element.dataset.testid ?? null,
      className: typeof element.className === 'string' ? element.className : '',
      label: element.getAttribute('aria-label'),
      closestButton: element.closest('button')?.getAttribute('aria-label') ?? null,
    };
  })()`);
const maxDelta = (measurements, slot, coordinate) => {
  const values = measurements.map((entry) => entry?.[slot]?.[coordinate]).filter(Number.isFinite);
  return values.length ? Math.max(...values) - Math.min(...values) : null;
};
const maxAncestorScrollDelta = (measurements) => {
  const maximumLength = Math.max(...measurements.map((entry) => entry.scroll.ancestors.length));
  return Math.max(
    0,
    ...Array.from({ length: maximumLength }, (_, index) => {
      const values = measurements
        .map((entry) => entry.scroll.ancestors[index]?.scrollTop)
        .filter(Number.isFinite);
      return values.length ? Math.max(...values) - Math.min(...values) : 0;
    }),
  );
};
const summarize = (measurements) => ({
  steps: measurements.length,
  deltas: Object.fromEntries(
    [
      'tour',
      'backEntry',
      'stepIndicator',
      'title',
      'subtitle',
      'visual',
      'captions',
      'navigation',
      'previous',
      'previousArrow',
      'dots',
      'next',
      'nextArrow',
    ].map((slot) => [
      slot,
      Object.fromEntries(
        ['x', 'y', 'width', 'height'].map((key) => [key, maxDelta(measurements, slot, key)]),
      ),
    ]),
  ),
  maxWindowScrollDelta: maxDelta(
    measurements.map((entry) => ({ scroll: { x: entry.scroll.windowY } })),
    'scroll',
    'x',
  ),
  maxStageScrollDelta: maxDelta(
    measurements.map((entry) => ({ scroll: { x: entry.scroll.stageTop } })),
    'scroll',
    'x',
  ),
  maxAncestorScrollDelta: maxAncestorScrollDelta(measurements),
  unexpectedLayoutShift: measurements
    .flatMap((entry) => entry.layoutShifts)
    .filter((entry) => !entry.hadRecentInput)
    .reduce((total, entry) => total + entry.value, 0),
});

const waitForStep = (layout, step) =>
  waitFor(
    `document.querySelector('[data-testid="knowledge-tour"][data-layout="${layout}"]')?.dataset.activeStep === '${step}'`,
    `${layout} step ${step}`,
    3_000,
  );

const advanceWithFixedCursor = async (layout) => {
  const measurements = [];
  const failures = [];
  await waitForStep(layout, 1);
  await waitFor(
    `document.querySelector('[data-testid="knowledge-tour"][data-layout="${layout}"] img')?.complete`,
    `${layout} image`,
  );
  await sleep(220);
  await installLayoutShiftObserver();
  await sleep(60);
  measurements.push(await measure(layout));
  const nextPoint = center(measurements[0].next);
  for (let step = 2; step <= 9; step += 1) {
    const hitTarget = await describePoint(nextPoint);
    await clickAt(nextPoint);
    try {
      await waitForStep(layout, step);
    } catch {
      failures.push({ direction: 'next', expectedStep: step, point: nextPoint, hitTarget });
      await evaluate(
        `document.querySelectorAll('[data-testid="knowledge-tour"][data-layout="${layout}"] .knowledge-tour__dot')[${step - 1}]?.click()`,
      );
      await waitForStep(layout, step);
    }
    await waitFor(
      `document.querySelector('[data-testid="knowledge-tour"][data-layout="${layout}"] img')?.complete`,
      `${layout} step ${step} image`,
    );
    await sleep(220);
    measurements.push(await measure(layout));
  }
  const previousPoint = center(measurements.at(-1).previous);
  const reverse = [];
  for (let step = 8; step >= 1; step -= 1) {
    const hitTarget = await describePoint(previousPoint);
    await clickAt(previousPoint);
    try {
      await waitForStep(layout, step);
    } catch {
      failures.push({ direction: 'previous', expectedStep: step, point: previousPoint, hitTarget });
      await evaluate(
        `document.querySelectorAll('[data-testid="knowledge-tour"][data-layout="${layout}"] .knowledge-tour__dot')[${step - 1}]?.click()`,
      );
      await waitForStep(layout, step);
    }
    await sleep(220);
    reverse.push(await measure(layout));
  }
  return { measurements, reverse, nextPoint, previousPoint, failures };
};

const runInteractionChecks = async (layout, mobile) => {
  await evaluate(
    `document.querySelectorAll('[data-testid="knowledge-tour"][data-layout="${layout}"] .knowledge-tour__dot')[3]?.click()`,
  );
  await waitForStep(layout, 4);
  await evaluate(
    `document.querySelector('[data-testid="knowledge-tour"][data-layout="${layout}"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))`,
  );
  await waitForStep(layout, 5);
  await evaluate(
    `document.querySelector('[data-testid="knowledge-tour"][data-layout="${layout}"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))`,
  );
  await waitForStep(layout, 4);
  const result = { dot: 4, keyboardRight: 5, keyboardLeft: 4, swipeLeft: null, swipeRight: null };
  if (mobile) {
    await send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: 320, y: 300, radiusX: 1, radiusY: 1, force: 1 }],
    });
    await send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await evaluate(`(() => {
      const guide = document.querySelector('[data-testid="knowledge-tour"][data-layout="${layout}"]');
      const start = new Event('touchstart', { bubbles: true });
      Object.defineProperty(start, 'changedTouches', { value: [{ clientX: 320, clientY: 300 }] });
      const end = new Event('touchend', { bubbles: true });
      Object.defineProperty(end, 'changedTouches', { value: [{ clientX: 210, clientY: 302 }] });
      guide.dispatchEvent(start);
      guide.dispatchEvent(end);
    })()`);
    await waitForStep(layout, 5);
    result.swipeLeft = 5;
    await evaluate(`(() => {
      const guide = document.querySelector('[data-testid="knowledge-tour"][data-layout="${layout}"]');
      const start = new Event('touchstart', { bubbles: true });
      Object.defineProperty(start, 'changedTouches', { value: [{ clientX: 120, clientY: 300 }] });
      const end = new Event('touchend', { bubbles: true });
      Object.defineProperty(end, 'changedTouches', { value: [{ clientX: 240, clientY: 302 }] });
      guide.dispatchEvent(start);
      guide.dispatchEvent(end);
    })()`);
    await waitForStep(layout, 4);
    result.swipeRight = 4;
  }
  return result;
};

const ensureAuthenticatedPro = async () => {
  const localPersona = await evaluate(`(() => {
    const persona = document.querySelector('[data-testid="pro-persona-switch"]');
    if (!persona) return false;
    if (persona.value !== 'pro') {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(persona, 'pro');
      persona.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return true;
  })()`);
  if (localPersona) {
    await sleep(200);
    return;
  }
  const authed = await evaluate(
    'Boolean(document.querySelector(\'[data-testid="app-header-account"]\'))',
  );
  if (authed) return;
  if (!qaPassword) throw new Error('QA_PASSWORD is required for embedded staging geometry proof.');
  await waitFor(
    'Boolean(document.querySelector(\'[data-testid="app-header-login"]\'))',
    'login button',
  );
  await evaluate('document.querySelector(\'[data-testid="app-header-login"]\')?.click()');
  await waitFor('Boolean(document.querySelector(\'[data-testid="auth-modal"]\'))', 'auth modal');
  await evaluate(`(() => {
    const modal = document.querySelector('[data-testid="auth-modal"]');
    const emailInput = modal.querySelector('input[type="email"]');
    const passwordInput = modal.querySelector('input[type="password"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(emailInput, ${JSON.stringify(qaEmail)});
    emailInput.dispatchEvent(new Event('input', { bubbles: true }));
    setter.call(passwordInput, ${JSON.stringify(qaPassword)});
    passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
    modal.querySelector('form').requestSubmit();
  })()`);
  await waitFor(
    'Boolean(document.querySelector(\'[data-testid="app-header-account"]\'))',
    'authenticated account',
  );
};

const openEmbedded = async (viewport) => {
  await navigate(`${origin}/pro`);
  await ensureAuthenticatedPro();
  await waitFor(
    'Boolean(document.querySelector(\'[data-testid="pro-profile-panel"]\'))',
    'PRO profile panel',
  );
  if (viewport.width < 1120) {
    await evaluate(
      'document.querySelector(\'[data-testid="mobile-preview-profile-tab"]\')?.click()',
    );
  }
  await waitFor(
    `[...document.querySelectorAll('[data-testid="profile-learning-entry"]')].some(
    (candidate) => candidate.getBoundingClientRect().width > 0
  )`,
    'visible Guide entry',
  );
  await sleep(250);
  const entry = await evaluate(`(() => {
    const entry = [...document.querySelectorAll('[data-testid="profile-learning-entry"]')].find(
      (candidate) => candidate.getBoundingClientRect().width > 0,
    );
    entry?.scrollIntoView({ block: 'center' });
    return entry?.textContent.trim() ?? null;
  })()`);
  if (entry !== 'Dlaczego to działa?') throw new Error(`Unexpected Guide entry: ${entry}`);
  await evaluate(`(() => {
    const entry = [...document.querySelectorAll('[data-testid="profile-learning-entry"]')].find(
      (candidate) => candidate.getBoundingClientRect().width > 0,
    );
    entry?.click();
  })()`);
  await waitFor(
    'Boolean(document.querySelector(\'[data-testid="knowledge-tour"][data-layout="embedded"]\'))',
    'embedded Guide',
  );
  await installLayoutShiftObserver();
};

const results = {
  contract: 'SOL-034',
  checklistItem,
  origin,
  timestamp: new Date().toISOString(),
  viewports: [],
  consoleErrors,
  exceptions,
  networkFailures,
};

for (const viewport of viewports) {
  console.error(`SOL-034 geometry: ${viewport.width}x${viewport.height}`);
  await setViewport(viewport);

  await navigate(`${origin}/how-it-works?step=1`);
  await waitForStep('page', 1);
  await installLayoutShiftObserver();
  const pageSequence = await advanceWithFixedCursor('page');
  const pageInteractions = await runInteractionChecks('page', viewport.width === 390);
  await navigate(`${origin}/how-it-works?step=5`);
  await waitForStep('page', 5);
  const pageDirectReload = await measure('page');

  await openEmbedded(viewport);
  if (args.get('debug') === 'true') {
    console.error(JSON.stringify(await measure('embedded'), null, 2));
  }
  const embeddedSequence = await advanceWithFixedCursor('embedded');
  const embeddedInteractions = await runInteractionChecks('embedded', viewport.width === 390);
  const embeddedBack = await evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find((candidate) =>
      candidate.textContent.includes('Wróć do receptury') && candidate.getBoundingClientRect().width > 0,
    );
    button?.click();
    return Boolean(button);
  })()`);
  await sleep(100);
  const returnedToRecipe = await evaluate(
    '!document.querySelector(\'[data-testid="knowledge-tour"][data-layout="embedded"]\')',
  );

  results.viewports.push({
    viewport,
    page: {
      ...pageSequence,
      summary: summarize(pageSequence.measurements),
      interactions: pageInteractions,
      directReload: pageDirectReload,
    },
    embedded: {
      ...embeddedSequence,
      summary: summarize(embeddedSequence.measurements),
      interactions: embeddedInteractions,
      backButtonFound: embeddedBack,
      returnedToRecipe,
    },
  });
}

const violations = [];
for (const result of results.viewports) {
  for (const layout of ['page', 'embedded']) {
    const proof = result[layout];
    if (
      proof.measurements.length !== 9 ||
      proof.measurements.some((entry) => !entry.imageComplete)
    ) {
      violations.push({ viewport: result.viewport, layout, completeStepMeasurements: false });
    }
    for (const slot of [
      'tour',
      'backEntry',
      'stepIndicator',
      'title',
      'subtitle',
      'visual',
      'captions',
      'navigation',
      'previousArrow',
      'dots',
      'nextArrow',
    ]) {
      if (layout === 'page' && slot === 'backEntry') continue;
      for (const coordinate of slot === 'tour' ? ['height'] : ['x', 'y']) {
        if ((proof.summary.deltas[slot][coordinate] ?? 0) > 1) {
          violations.push({
            viewport: result.viewport,
            layout,
            slot,
            coordinate,
            delta: proof.summary.deltas[slot][coordinate],
          });
        }
      }
    }
    if (proof.failures.length)
      violations.push({ viewport: result.viewport, layout, fixedCursorFailures: proof.failures });
    if (proof.summary.maxWindowScrollDelta !== 0) {
      violations.push({
        viewport: result.viewport,
        layout,
        windowScrollDelta: proof.summary.maxWindowScrollDelta,
      });
    }
    if (proof.summary.maxStageScrollDelta !== 0) {
      violations.push({
        viewport: result.viewport,
        layout,
        stageScrollDelta: proof.summary.maxStageScrollDelta,
      });
    }
    if (proof.summary.maxAncestorScrollDelta !== 0) {
      violations.push({
        viewport: result.viewport,
        layout,
        ancestorScrollDelta: proof.summary.maxAncestorScrollDelta,
      });
    }
    if (proof.summary.unexpectedLayoutShift !== 0) {
      violations.push({
        viewport: result.viewport,
        layout,
        unexpectedLayoutShift: proof.summary.unexpectedLayoutShift,
      });
    }
    const expectedInteractions = {
      dot: 4,
      keyboardRight: 5,
      keyboardLeft: 4,
      swipeLeft: result.viewport.width === 390 ? 5 : null,
      swipeRight: result.viewport.width === 390 ? 4 : null,
    };
    if (JSON.stringify(proof.interactions) !== JSON.stringify(expectedInteractions)) {
      violations.push({ viewport: result.viewport, layout, interactions: proof.interactions });
    }
  }
  if (result.page.directReload?.step !== 5 || !result.page.directReload?.imageComplete) {
    violations.push({ viewport: result.viewport, pageDirectReload: false });
  }
  if (!result.embedded.returnedToRecipe)
    violations.push({ viewport: result.viewport, embeddedReturn: false });
}
if (consoleErrors.length) violations.push({ consoleErrors });
if (exceptions.length) violations.push({ exceptions });
if (networkFailures.length) violations.push({ networkFailures });
results.violations = violations;
results.pass = violations.length === 0;
results.checklistStatus = results.pass ? 'RESOLVED' : 'NOT RESOLVED';

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(results, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      contract: results.contract,
      origin,
      pass: results.pass,
      violations,
      summaries: results.viewports.map(({ viewport, page, embedded }) => ({
        viewport,
        page: page.summary,
        embedded: embedded.summary,
      })),
      output,
    },
    null,
    2,
  ),
);
socket.close();
if (strict && !results.pass) process.exitCode = 1;
