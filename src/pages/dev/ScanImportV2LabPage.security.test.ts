/** Boundary contract of the Scan Import 2.0 QA harness: isolated, gated, no HOME, no legacy scanner, no duplicated logic. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const PAGE = readFileSync(join(import.meta.dirname, 'ScanImportV2LabPage.tsx'), 'utf8');
const ROUTER = readFileSync(join(import.meta.dirname, '..', '..', 'app', 'router.tsx'), 'utf8');

describe('ScanImportV2LabPage boundary', () => {
  it('guards on DEV or the staging QA flag and falls back to NotFound', () => {
    expect(PAGE).toMatch(
      /import\.meta\.env\.DEV \|\| import\.meta\.env\.VITE_SCAN_IMPORT_LAB === '1'/,
    );
    expect(PAGE).toMatch(/if \(!LAB_ENABLED\) return <NotFoundPage \/>;/);
  });
  it('is registered only under the same gate, on /dev/scan-import-v2', () => {
    expect(ROUTER).toMatch(
      /\(import\.meta\.env\.DEV \|\| import\.meta\.env\.VITE_SCAN_IMPORT_LAB === '1'\) && \(\s*<Route path="\/dev\/scan-import-v2"/,
    );
    expect(ROUTER.match(/scan-import-v2/g)?.length).toBe(1);
  });
  it('consumes only the V2 boundary: shared contract + scan-import-v2 + app client; no legacy scanner, no HOME, no engine', () => {
    const imports = [...PAGE.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    for (const i of imports)
      expect(i, i).toMatch(
        /^(react|@\/pages\/NotFoundPage|@\/lib\/supabase\/client|@\/scan-contract\/confirmedScan|@\/scan-import-v2(\/__fixtures__\/scanCoreObservations\.json)?)$/,
      );
    expect(PAGE).not.toMatch(
      /features\/product-scanner|LiveMultiScanner|LiveProductScanner|ProductScanPage|home-creator|recipeStore|productScanner'|scan-core|scan-lab/,
    );
  });
  it('never renders raw HTML, never touches a privileged key, never writes on its own', () => {
    expect(PAGE).not.toMatch(
      /dangerouslySetInnerHTML|service_role|SERVICE_ROLE|\.from\(|\.rpc\(|functions\.invoke/,
    );
  });
  it('drives the lifecycle only through the V2 entry points', () => {
    expect(PAGE).toMatch(/runScanImportV2\(/);
    expect(PAGE).toMatch(/continueDiscovery\(/);
    expect(PAGE).toMatch(/fromScanCoreObservation\(/);
  });
});
