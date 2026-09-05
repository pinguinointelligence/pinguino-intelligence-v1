/**
 * Boundary of the shared scan flow (owner rules, 2026-09-05): ONE flow — camera → Scan Core →
 * EAN/GTIN → Scan Import 2.0 — mounted from HOME/PRO „Dodaj składnik → Skanuj” and from
 * Produkty → „Skanuj produkt”; no second scanner, no second decoder, no technical field shown.
 */
import { readFileSync } from 'node:fs';
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

  it('is the flow behind HOME/PRO „Dodaj składnik → Skanuj” and Produkty → „Skanuj produkt”', () => {
    expect(POPOVER).toMatch(/<ScanFlow\s+mode="recipe"/);
    expect(POPOVER).not.toMatch(/<LiveProductScanner/);
    expect(CATALOG_PAGE).toMatch(/<ScanFlow mode="catalog"/);
    expect(CATALOG_PAGE).not.toMatch(/<LiveProductScanner/);
    // HOME's own scan button is the same flow too — no separate HOME scanner
    expect(HOME_CREATOR).toMatch(/<ScanFlow\s+mode="recipe"/);
    expect(HOME_CREATOR).not.toMatch(/LiveMultiScanner/);
  });

  it('never shows an internal readiness code and never drops to a generic error after a decode', () => {
    expect(FLOW).not.toMatch(
      /MISSING_TOTAL_SOLIDS|MISSING_WATER|PRODUCT_SEMANTICS|SWEETENING_FREEZING|roleReadiness|BASE_ONLY/,
    );
    expect(FLOW).not.toMatch(/\{[^{}]*\.note\}/); // a server note is a signal, never rendered as customer copy
    expect(FLOW).not.toMatch(/Coś poszło nie tak/);
    expect(FLOW).toMatch(/savePrivateNotReady: true/);
    expect(FLOW).toMatch(/Produkt zapisany prywatnie/);
    expect(FLOW).toMatch(/Ponów to zdjęcie/);
    expect(FLOW).toMatch(/decodeStill\(/);
  });
});
