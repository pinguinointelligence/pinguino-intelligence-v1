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
        /^(react|@\/scan-contract\/confirmedScan|@\/scan-import-v2|@\/services\/scanImportV2|\.\/scanCoreCapture|\.\/scanFlowLogic)$/,
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
    expect(CATALOG_PAGE).toMatch(/<ScanFlow mode="catalog" entryContext="add_product"/);
    expect(HOME_CREATOR).toMatch(/<ScanFlow\s/);
    expect(HOME_CREATOR).toMatch(
      /entryContext=\{userId === null \? 'guest_demo' : 'recipe_ingredient'\}/,
    );
    for (const src of [POPOVER, CATALOG_PAGE, HOME_CREATOR])
      expect(src).not.toMatch(/LiveProductScanner|LiveMultiScanner/);
  });

  it('the hamburger opens it too, and never asks whether to add a product', () => {
    expect(NAV).toMatch(/id: 'scanProduct'/);
    expect(NAV).toMatch(/to: '\/products\/scan'/);
    expect(NAV).toMatch(/audiences: \['home', 'pro'\]/);
    // "Dodaj produkt" already IS the answer to the question, so the flow must not ask it again.
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

  it('is the ONLY component in the app that opens a camera', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) return name === 'node_modules' ? [] : walk(full);
        return /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [full] : [];
      });
    const openers = walk(SRC).filter((f) =>
      /navigator\.mediaDevices\.getUserMedia/.test(readFileSync(f, 'utf8')),
    );
    // exactly one: the Scan Core camera session the canonical flow drives
    expect(openers.map((f) => f.slice(SRC.length + 1)).sort()).toEqual([
      'scan-lab/baseline/camera/cameraSession.ts',
    ]);
  });
});
