import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const scan = readFileSync(resolve('scripts/scanner-staging-acceptance.mjs'), 'utf8');
const canonicalization = readFileSync(
  resolve('scripts/scanner-staging-canonicalization-acceptance.mjs'),
  'utf8',
);

describe('Scanner staging acceptance harness', () => {
  it('proves one-photo Vision without seeding the expected EAN into the request', () => {
    expect(scan).toContain("args.has('--vision-only')");
    expect(scan).toContain("? null\n  : { kind: 'EAN_13'");
    expect(scan).toContain("path: 'VISION_DISCOVERED_EAN_SHORT_CIRCUIT'");
    expect(scan.indexOf("mode: 'analyze'")).toBe(-1);
    expect(scan.indexOf("let analysis = await invoke('product-scan-analyze'")).toBeLessThan(
      scan.indexOf('Vision did not independently recover the fixture EAN'),
    );
  });

  it('keeps QA authentication in the existing fixture source and never prints it', () => {
    for (const source of [scan, canonicalization]) {
      expect(source).toContain("readFileSync(resolve('scripts/seed-staging-admin.mjs')");
      expect(source).not.toMatch(/console\.(?:log|error|warn)\([^)]*fixturePassword/);
    }
  });

  it('uses only the canonical Admin RPC for the explicit staging promotion', () => {
    expect(canonicalization).toContain("args.has('--canonicalize')");
    expect(canonicalization).toContain("'gellatti_admin_canonicalize_customer_added_v1'");
    expect(canonicalization).not.toMatch(/\.(?:delete|update)\(/);
    expect(canonicalization).not.toMatch(/\bdelete\s+from\b|\bupdate\s+public\./i);
  });
});
