/**
 * Boundary of the ONE Canonical Scanner (owner decision 2026-09-06).
 *
 * There is exactly one scan flow in the whole system — camera → Scan Core → EAN/GTIN →
 * Scan Import 2.0 — and every entry mounts THIS component with the same pipeline. Only two things
 * differ between entries: the `entryContext` passed in and the return action. The seven entries are
 * the hamburger's „Dodaj produkt" (HOME and PRO), the recipe's „Dodaj składnik → Skanuj" and
 * „Dodaj topping → Skanuj" (HOME and PRO), and the signed-out demo.
 *
 * No second scanner, no second decoder, no second state machine, no technical field shown.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = import.meta.dirname;
const read = (rel: string) => readFileSync(join(here, rel), 'utf8');
const FLOW = read('ScanFlow.tsx');
const CAPTURE = read('scanCoreCapture.ts');
const LOGIC = read('scanFlowLogic.ts');
const POPOVER = read('../ingredient-builder/ProductPickerPopover.tsx');
const CATALOG_PAGE = read('../../pages/products/ProductScannerV1Page.tsx');
const HOME_CREATOR = read('../../pages/home/HomeCreatorPage.tsx');
const NAV = read('../shell/appNav.ts');
const SRC = join(here, '../..');

const imports = (src: string) => [...src.matchAll(/from '([^']+)'/g)].map((m) => m[1]);

describe('scan flow boundary', () => {
  it('reaches the backend only through the services layer and the Scan Import 2.0 entry points', () => {
    for (const src of [FLOW, CAPTURE, LOGIC]) {
      expect(/\bsupabase\b/i.test(src), 'backend client named').toBe(false);
      expect(src).not.toMatch(/\.from\(|\.rpc\(|functions\.invoke|service_role/);
    }
    for (const i of imports(FLOW))
      expect(i, i).toMatch(
        // `@/copy/customerSafeNotice` is a pure denylist over strings — no backend, no state. It is
        // listed deliberately: after SOL-043 the sanitiser must be applied BY DEFAULT at every
        // customer-facing render, and this flow is one of them.
        /^(react|@\/scan-contract\/confirmedScan|@\/scan-import-v2|@\/services\/scanImportV2|@\/copy\/customerSafeNotice|\.\/scanCoreCapture|\.\/scanFlowLogic)$/,
      );
    expect(FLOW).toMatch(/runScanImportV2\(/);
    expect(FLOW).toMatch(/continueDiscovery\(/);
    expect(FLOW).toMatch(/VITE_SCAN_IMPORT_GTIN_RPC === '1' \? 'gtin_rpc' : 'search_rpc'/);
  });

  it('the camera path is the existing Scan Core stack — no second decoder, no legacy scanner', () => {
    for (const i of imports(CAPTURE))
      expect(i, i).toMatch(
        /^(@\/scan-lab\/baseline\/(camera|loop|worker)\/[a-zA-Z]+|@\/scan-contract\/confirmedScan)$/,
      );
    expect(CAPTURE).toMatch(/mode: 'scancore'/);
    expect(CAPTURE).toMatch(/fromScanCoreObservation\(/);
    for (const src of [FLOW, CAPTURE, LOGIC]) {
      expect(src).not.toMatch(
        /BarcodeDetector|getSharedBarcodeDecoder|barcodeDecoder|autonomousScanLoop/,
      );
      expect(src).not.toMatch(
        /LiveProductScanner|LiveMultiScanner|ProductScanPage|product-scan-analyze/,
      );
    }
  });

  it('never shows a technical field to the customer', () => {
    expect(FLOW).not.toMatch(/\b(PAC|POD|NPAC|Mapper|ProductBehavior|ProductBehaviour)\b/);
    expect(LOGIC).not.toMatch(/label: '[^']*(PAC|POD|NPAC|Mapper)[^']*'/);
  });

  it('keeps the owner rules: exact product to the recipe, no duplicate in the catalogue, private local product', () => {
    expect(FLOW).toMatch(/nie tworzymy duplikatu/);
    expect(FLOW).toMatch(/prywatn/);
    expect(FLOW).toMatch(/disabled=\{!engineReady \|\| busy\}/);
    expect(FLOW).toMatch(/Zgłoś do weryfikacji/);
  });

  it('is the flow behind every entry — recipe, topping, the products page and HOME', () => {
    expect(POPOVER).toMatch(/<ScanFlow\s+mode="recipe"/);
    expect(POPOVER).toMatch(/'recipe_ingredient'/);
    expect(POPOVER).toMatch(/'recipe_topping'/);
    expect(POPOVER).toMatch(/!signedIn\s*\n?\s*\? 'guest_demo'/);
    // the conversion screen is never inert: the flow navigates itself when no handler is given
    expect(FLOW).toMatch(/if \(onChoosePlan\) return onChoosePlan\(plan\);/);
    expect(FLOW).toMatch(/window\.location\.assign\([\s\S]{0,120}\/subscription\?plan=/);
    expect(CATALOG_PAGE).toMatch(/<ScanFlow mode="catalog" entryContext="add_product"/);
    expect(HOME_CREATOR).toMatch(/<ScanFlow\s/);
    expect(HOME_CREATOR).toMatch(
      /entryContext=\{userId === null \? 'guest_demo' : 'recipe_ingredient'\}/,
    );
    for (const src of [POPOVER, CATALOG_PAGE, HOME_CREATOR])
      expect(src).not.toMatch(/LiveProductScanner|LiveMultiScanner/);
  });

  it('the products page opens it, and it never asks whether to add a product', () => {
    /*
      OWNER CORRECTION 2026-09-07. „Skanuj produkt" was promoted to the hamburger as a destination
      of its own alongside „Produkty" and „Niezweryfikowane" — three entries for one area. It is an
      ACTION on the products page, so that is where it lives; `/products/scan` is unchanged and the
      drawer contract is `productsNavigationContract.test.tsx`.
    */
    expect(NAV).not.toMatch(/id: 'scanProduct'/);
    expect(NAV).not.toMatch(/id: 'unverifiedProducts'/);
    expect(read('../../pages/destinations/GlobalDestinationPages.tsx')).toContain('Skanuj produkt');
    // „Dodaj produkt" already IS the answer to the question, so the flow must not ask it again.
    expect(FLOW).toMatch(/isRecipeEntry\(entry\) && !addConfirmedRef\.current/);
  });

  it("asks the recipe question in exactly the owner's words, with a real way out", () => {
    expect(FLOW).toContain('Nie mamy jeszcze tego produktu. Czy chcesz go dodać?');
    expect(FLOW).toMatch(/data-testid="scan-flow-ask-add-yes"/);
    expect(FLOW).toMatch(/data-testid="scan-flow-ask-add-no"/);
    // "Tak" continues THIS scan: the same session, the same photos, no second camera run.
    expect(FLOW).toMatch(/continueUnknownRef\.current\(/);
  });

  it('spends nothing on a signed-out visitor and offers them the plans instead', () => {
    expect(FLOW).toContain('Tego produktu jeszcze nie mamy.');
    expect(FLOW).toContain('W HOME lub PRO możesz dodać własny produkt jednym skanem.');
    expect(FLOW).toMatch(/data-testid="scan-flow-choose-home"/);
    expect(FLOW).toMatch(/data-testid="scan-flow-choose-pro"/);
    expect(FLOW).toMatch(/data-testid="scan-flow-back-to-demo"/);
    // no research, no label analysis, no private save, no verification for a guest
    expect(FLOW).toMatch(/entry !== 'guest_demo'/);
    expect(FLOW).toMatch(/\{ \.\.\.ports, external: null \}/);
  });

  it('exactly one file in the whole app opens a camera stream', () => {
    /*
      The first version of this contract matched the single literal
      `navigator.mediaDevices.getUserMedia` and concluded "one camera". That conclusion was right and
      the method was not: an alias, an optional-chained call or a probe would all have slipped past
      it. So this version sweeps a BROAD pattern and then classifies every hit, which means a new
      camera cannot appear without either failing the assertion or being listed here on purpose.
    */
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) return name === 'node_modules' ? [] : walk(full);
        return /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [full] : [];
      });

    const CAMERA = /getUserMedia|ImageCapture|MediaStreamTrackProcessor|getDisplayMedia/;
    /** a call that actually acquires a stream, as opposed to asking whether one could be */
    const OPENS =
      /(?:await\s+|=\s*)[A-Za-z_$][\w$.?]*\.getUserMedia\s*\(|new\s+ImageCapture\s*\(|getDisplayMedia\s*\(/;
    const PROBE = /typeof\s+[\w$.?]*getUserMedia\s*===/;

    const openers: string[] = [];
    const probes: string[] = [];
    for (const file of walk(SRC)) {
      const src = readFileSync(file, 'utf8');
      if (!CAMERA.test(src)) continue;
      // a mention inside a comment is not a camera
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
      if (!CAMERA.test(code)) continue;
      const rel = file.slice(SRC.length + 1);
      if (OPENS.test(code)) openers.push(rel);
      else if (PROBE.test(code)) probes.push(rel);
      else openers.push(rel); // unclassified: treat as an opener so it cannot pass silently
    }

    // ONE camera. The Scan Core session the canonical flow drives.
    expect(openers.sort()).toEqual(['scan-lab/baseline/camera/cameraSession.ts']);
    // and these only ASK whether a camera exists — they never acquire one
    expect(probes.sort()).toEqual([
      'features/scan-flow/scanCoreCapture.ts',
      'scan-lab/baseline/ui/BaselinePage.tsx',
    ]);
  });

  it('the measurement harness is a build-flag surface, never a customer one', () => {
    /*
      `scan-lab/baseline` is the Scan Core measurement harness, and it drives the same one camera
      session. It is NOT a second product scanner: it is excluded from the bundle unless
      VITE_SCAN_LAB_BASELINE=1, and no customer navigation reaches it. Recorded here so that the
      "one scanner" claim above stays true as stated rather than by omission.
    */
    const ROUTER = read('../../app/router.tsx');
    expect(ROUTER).toMatch(/VITE_SCAN_LAB_BASELINE === '1'/);
    expect(ROUTER).toMatch(/SCAN_LAB_BASELINE_ENABLED\s*\?/);
    expect(NAV).not.toMatch(/scan-lab/);
  });
});
