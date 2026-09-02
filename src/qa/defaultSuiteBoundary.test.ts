import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const viteConfig = fs.readFileSync(path.join(process.cwd(), 'vite.config.ts'), 'utf8');
const acceptanceConfig = fs.readFileSync(
  path.join(process.cwd(), 'vitest.acceptance.config.ts'),
  'utf8',
);
const packageJson = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'),
) as { scripts: Record<string, string> };

/**
 * Regression: the acceptance harness must never run inside `npm test`.
 *
 * It signs into the staging QA account and resolves real ProductBehavior
 * authority over the network for roughly 1300 cells. Left in the default
 * include pattern it made `npm test` — and therefore CI — depend on a
 * reachable staging environment and take ~45 minutes, which is exactly the
 * reason the existing campaigns are excluded the same way.
 */
describe('the default suite excludes the network-bound acceptance harness', () => {
  it('excludes every acceptance test file', () => {
    expect(viteConfig).toContain("'src/**/*.acceptance.test.{ts,tsx}'");
  });

  it('keeps the existing campaign exclusions alongside it', () => {
    expect(viteConfig).toContain("'src/**/*.campaign.test.{ts,tsx}'");
    expect(viteConfig).toContain("'src/**/*.crown-campaign.test.{ts,tsx}'");
  });

  it('gives the harness its own runner and its own script', () => {
    expect(acceptanceConfig).toContain("include: ['src/**/*.acceptance.test.{ts,tsx}']");
    expect(packageJson.scripts['acceptance:matrix']).toContain('vitest.acceptance.config.ts');
  });
});
