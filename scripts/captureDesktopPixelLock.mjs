import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const TARGETS = Object.freeze({
  editor: { x: 138, width: 1062 },
  shell: { x: 1264, y: 134, width: 635, height: 742 },
  add: { x: 551, y: 155, width: 125, height: 46 },
  firstRow: { x: 138, y: 234, width: 1062, height: 63 },
  picker: { x: 551, y: 213, width: 499, height: 480 },
  direction: { x: 1274, y: 280, width: 331, height: 369 },
  settings: { x: 1617, y: 279, width: 273, height: 371 },
  nutrition: { x: 1273, y: 661, width: 332, height: 204 },
  cost: { x: 1617, y: 660, width: 273, height: 206 },
  workbarSave: { x: 1031, y: 915, width: 103, height: 37 },
  recipeName: { x: 1262, y: 912, width: 402, height: 39 },
  addCore: { x: 555, y: 159, width: 117, height: 38 },
  piCore: { x: 1152, y: 161, width: 39, height: 38 },
  dividerHandle: { y: 234, height: 32 },
  pickerSearch: { x: 565, y: 226, width: 471, height: 38 },
  pickerHeader: { x: 554, y: 216, width: 493, height: 79 },
  pickerScrollThumb: { x: 1037, y: 600, width: 7, height: 50 },
});

const TOLERANCE_PX = 2;
const VIEWPORT = Object.freeze({ width: 2048, height: 1040, deviceScaleFactor: 1 });

function argument(name, fallback) {
  const prefix = `--${name}=`;
  return process.argv.find((entry) => entry.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

const url = argument('url', 'http://127.0.0.1:5174/pro/recipe');
const outputDir = resolve(argument('output', 'reports/qa/pixel-lock'));
const chromePath = argument('chrome', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
const port = Number(argument('port', String(9460 + Math.floor(Math.random() * 100))));

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

async function waitForJson(versionUrl) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(versionUrl);
      if (response.ok) return response.json();
    } catch {
      // Chrome has not opened the debugging socket yet.
    }
    await delay(100);
  }
  throw new Error(`Chrome debugging endpoint did not open: ${versionUrl}`);
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? 'Browser evaluation failed');
  }
  return result.result.value;
}

function fixtureExpression() {
  return String.raw`(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const select = (testId, value) => {
      const element = document.querySelector('[data-testid="' + testId + '"]');
      if (!element) throw new Error('Missing select: ' + testId);
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(element, value);
      element.dispatchEvent(new Event('change', { bubbles: true }));
    };

    let persona = null;
    for (let attempt = 0; attempt < 40 && !persona; attempt += 1) {
      persona = [...document.querySelectorAll('select')].find((entry) =>
        [...entry.options].some((option) => option.value === 'pro') &&
        [...entry.options].some((option) => option.value === 'demo')
      );
      if (!persona) await wait(100);
    }
    if (!persona) throw new Error('DEV persona selector is unavailable');
    const personaSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    personaSetter.call(persona, 'pro');
    persona.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(500);

    const profileTab = document.querySelector('[data-testid="pro-context-profile-tab"]');
    if (profileTab?.getAttribute('aria-selected') !== 'true') profileTab?.click();

    // Pixel QA runs without an authenticated staging session. Seed only the
    // immutable authority required to render the accepted Milk-as-Main fixture;
    // this never changes application permissions or production data.
    const { useRecipeStore } = await import('/src/stores/recipeStore.ts');
    const { productBehaviorTestSnapshots } = await import(
      '/src/features/product-intelligence/productBehaviorTestFixture.ts'
    );
    const { buildRecipeInput } = await import('/src/features/studio/buildRecipeInput.ts');
    const installSnapshots = () => {
      const store = useRecipeStore.getState();
      const snapshots = productBehaviorTestSnapshots(buildRecipeInput(store), store.toppings);
      for (const [lineId, snapshot] of Object.entries(snapshots)) {
        store.setProductBehaviorSnapshot(lineId, snapshot);
      }
      const milk = snapshots['milk-base:milk_3_5'];
      if (!milk) throw new Error('Controlled milk authority fixture is unavailable');
      store.setProductBehaviorSnapshot('milk-base:milk_3_5', {
        ...milk,
        productId: 'pixel-lock-milk',
        productVersionId: 'pixel-lock-milk-v1',
        factsFingerprint: 'pixel-lock-facts-v1',
        behaviorBindingId: 'pixel-lock-binding',
        behaviorBindingVersion: '1',
        taxonomyVersion: 'pixel-lock-taxonomy-v1',
        familyId: 'dairy_flavour',
        subfamilyId: 'milk',
        formId: 'liquid',
        mainClassification: 'MAIN_PROFILE_SPECIFIC',
        mainPolicyId: 'pixel-lock-main-policy',
        mainPolicyVersion: '1',
        ecoFloorPercent: 0,
        optimalCeilingPercent: 100,
        hardLimitPercent: 100,
        mainEquivalentFactor: 1,
        mainBasis: 'PERCENT_OF_BASE',
        approvedLiquidDairyCarrier: true,
        moduleEligibility: { ...milk.moduleEligibility, MAIN: 'eligible', BASE_RECIPE: 'eligible' },
        resolverVersion: 'pixel-lock-fixture-v1',
      });
    };
    installSnapshots();
    await wait(80);

    const main = document.querySelector('[data-testid="row-main-toggle-milk-base:milk_3_5"]');
    if (!main) throw new Error('Controlled six-row milk fixture is unavailable');
    if (main.getAttribute('aria-pressed') !== 'true') main.click();
    select('workbench-serving', 'temp_minus_11');
    select('workbench-strategy', 'eco');
    await wait(180);
    const confirm = [...document.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Potwierdź ustawienia')
    );
    confirm?.click();
    // The context transition above deliberately invalidates prior authority.
    // Reinstall a resolver-equivalent fixture for the final confirmed context.
    installSnapshots();
    await wait(250);

    document.querySelector('[data-testid="design-review-toggle"]')?.click();
    await wait(80);

    await document.fonts.ready;
    const style = document.createElement('style');
    style.dataset.pixelLockQa = 'true';
    style.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important} label:has(> [data-testid="pro-persona-switch"]),[data-testid="design-review-overlay"]{display:none!important}';
    document.head.appendChild(style);
    window.scrollTo(0, 0);
    return {
      rows: document.querySelectorAll('[data-scope="BASE_FORMULATION"]').length,
      main: main.getAttribute('aria-pressed'),
      strategy: document.querySelector('[data-testid="workbench-strategy"]')?.value,
    };
  })()`;
}

function boundsExpression(includePicker) {
  return `(() => {
    const box = (element) => {
      if (!element) return null;
      const r = element.getBoundingClientRect();
      return { x:r.x, y:r.y, width:r.width, height:r.height, right:r.right, bottom:r.bottom };
    };
    const test = (id) => document.querySelector('[data-testid="' + id + '"]');
    const add = [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('Dodaj składnik'));
    const firstRow = document.querySelector('[data-scope="BASE_FORMULATION"]')?.parentElement;
    return {
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      editor: box(test('workbench-editor-pane')),
      shell: box(test('pro-profile-panel')),
      add: box(add),
      firstRow: box(firstRow),
      direction: box(test('profile-direction-axes')),
      settings: box(test('workbench-settings-line')),
      nutrition: box(test('profile-nutrition-card')),
      cost: box(test('profile-cost-card')),
      workbarSave: box(test('pro-workbar-save')),
      recipeName: box(test('pro-workbar-name')),
      addCore: box(test('ingredient-add-core')),
      piCore: box(test('pi-control-core')),
      dividerHandle: box(test('workbench-divider-handle')),
      pickerSearch: ${includePicker ? 'box(document.querySelector(\'[data-picker-position="anchored"] input\'))' : 'null'},
      pickerHeader: ${includePicker ? 'box(document.querySelector(\'[data-picker-position="anchored"] > div > div:first-child\'))' : 'null'},
      pickerScrollThumb: ${includePicker ? 'box(test(\'product-picker-scroll-thumb\'))' : 'null'},
      picker: ${includePicker ? 'box(document.querySelector(\'[data-picker-position=\\"anchored\\"]\'))' : 'null'}
    };
  })()`;
}

function compareBounds(actual) {
  const assertions = [];
  for (const [element, expectedFields] of Object.entries(TARGETS)) {
    if (
      (element === 'picker' || element === 'pickerSearch' || element === 'pickerHeader' || element === 'pickerScrollThumb') &&
      !actual.picker
    )
      continue;
    const measured = actual[element];
    if (!measured) throw new Error(`Missing measured element: ${element}`);
    for (const [field, expected] of Object.entries(expectedFields)) {
      const value = measured[field];
      const delta = value - expected;
      const passed = Math.abs(delta) <= TOLERANCE_PX;
      assertions.push({ element, field, expected, actual: value, delta, passed });
    }
  }
  return assertions;
}

async function capture(cdp, path) {
  const result = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await writeFile(path, Buffer.from(result.data, 'base64'));
}

await mkdir(outputDir, { recursive: true });
const profileDir = await mkdtemp(join(tmpdir(), 'pinguino-pixel-lock-'));
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
    '--window-size=2048,1040',
    'about:blank',
  ],
  { stdio: 'ignore', windowsHide: true },
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
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    deviceScaleFactor: VIEWPORT.deviceScaleFactor,
    mobile: false,
    screenWidth: VIEWPORT.width,
    screenHeight: VIEWPORT.height,
  });
  await cdp.send('Page.navigate', { url });
  await delay(1400);
  const fixture = await evaluate(cdp, fixtureExpression());
  if (fixture.rows !== 6 || fixture.main !== 'true' || fixture.strategy !== 'eco') {
    throw new Error(`Controlled fixture failed: ${JSON.stringify(fixture)}`);
  }

  const closedBounds = await evaluate(cdp, boundsExpression(false));
  await capture(cdp, join(outputDir, 'implementation-closed.png'));

  await evaluate(
    cdp,
    `(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('Dodaj składnik'))?.click())()`,
  );
  await delay(180);
  await evaluate(
    cdp,
    `(() => {
      const input = document.querySelector('[data-picker-position="anchored"] input');
      if (!input) throw new Error('Picker search input is unavailable');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'trus');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`,
  );
  await delay(500);
  await evaluate(
    cdp,
    `(() => {
      const picker = document.querySelector('[data-picker-position="anchored"]');
      if (!picker) throw new Error('Picker is unavailable for the deterministic result fixture');
      const status = picker.querySelector('[role="status"]');
      if (status) status.textContent = '62 wyników';
      const list = picker.querySelector('[role="listbox"]');
      if (!list) throw new Error('Picker list is unavailable');
      const visibleRows = [
        ['VITACEL CITRUS FIBER JRS · RS Fibers for life · CF312F','citrus_fiber'],
        ['BACARDÍ LIMÓN · Citrus Rum · 35% Vol','flavoured_rum'],
        ['MOUNTAIN DEW BAJA BLAST · Beverage','citrus_soda'],
        ['MOUNTAIN DEW CODE RED · Beverage','citrus_soda'],
        ['MOUNTAIN DEW LIVEWIRE ORANGE · Beverage','citrus_soda'],
        ['MOUNTAIN DEW MAJOR MELON · Beverage','citrus_soda'],
        ['MOUNTAIN DEW ORIGINALUS · Beverage','citrus_soda'],
        ['MOUNTAIN DEW VOLTAGE · Beverage','citrus_soda'],
        ['MOUNTAIN DEW ZERO SUGAR · Beverage','citrus_soda']
      ];
      const rows = [];
      while (rows.length < 53) rows.push(['CITRUS PRODUCT ' + String(rows.length + 1).padStart(2, '0') + ' · Beverage','citrus_product']);
      rows.push(...visibleRows);
      list.replaceChildren(...rows.map(([name, detail], index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('role', 'option');
        button.setAttribute('aria-selected', index === 1 ? 'true' : 'false');
        button.className = 'flex min-h-11 w-full items-center justify-between gap-4 rounded-xl px-3 py-2 text-left lg:min-h-[38px] lg:rounded-lg lg:py-1.5 2xl:pl-[11px] 2xl:pr-2 ' + (index === 1 ? 'bg-education-ivory text-ink' : 'hover:bg-stone-50');
        const label = document.createElement('span');
        label.className = 'min-w-0 truncate text-sm font-semibold';
        label.textContent = name;
        const meta = document.createElement('span');
        meta.className = 'shrink-0 text-xs text-stone-600';
        meta.textContent = detail;
        button.append(label, meta);
        return button;
      }));
      list.scrollTop = list.scrollHeight;
      list.dispatchEvent(new Event('scroll', { bubbles: true }));
    })()`,
  );
  await delay(50);
  const pickerBounds = await evaluate(cdp, boundsExpression(true));
  await capture(cdp, join(outputDir, 'implementation-picker.png'));

  const assertions = [
    ...compareBounds(closedBounds),
    ...compareBounds(pickerBounds).filter((entry) =>
      ['picker', 'pickerSearch', 'pickerHeader', 'pickerScrollThumb'].includes(entry.element),
    ),
  ];
  const report = {
    url,
    viewport: VIEWPORT,
    tolerancePx: TOLERANCE_PX,
    fixture,
    targets: TARGETS,
    closedBounds,
    pickerBounds: pickerBounds.picker,
    assertions,
    passed: assertions.every((entry) => entry.passed),
  };
  await writeFile(
    join(outputDir, 'bounding-box-results.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  if (!report.passed) {
    const failed = assertions.filter((entry) => !entry.passed);
    throw new Error(`Pixel-lock bounds failed: ${JSON.stringify(failed)}`);
  }
  console.log(`Pixel-lock bounds PASS (${assertions.length}/${assertions.length})`);
  socket.close();
} finally {
  chrome.kill();
  await Promise.race([chromeExit, delay(2000)]);
  if (resolve(profileDir).startsWith(resolve(tmpdir()))) {
    try {
      await rm(profileDir, { recursive: true, force: true });
    } catch (error) {
      if (error?.code !== 'EBUSY') throw error;
    }
  }
}
