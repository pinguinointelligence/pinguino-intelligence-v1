/**
 * A GLOBAL DESTINATION IS NEITHER HOME NOR PRO — owner ruling, 2026-09-01.
 *
 * F-2: `/shop` served HOME with `aria-selected="true"`, telling a visitor they
 * were inside HOME while they read a commercial page. Work With Us was already
 * neutral; the Shop was not.
 *
 * This reads the destination sources rather than rendering, because the defect
 * is a claim made at a call site: only HOME itself and the PRO workbench may
 * name a view. Everything reached through the destination shell stays neutral.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Comments discuss `activeView="home"` legitimately; only real code counts. */
const codeOf = (path: string): string =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const DESTINATION_SOURCES = [
  'src/pages/destinations/GlobalDestinationPages.tsx',
  'src/pages/destinations/LanePage.tsx',
  'src/pages/destinations/WorkWithUsPage.tsx',
  'src/components/shared/DestinationSurface.tsx',
  'src/components/shared/DestinationHomeProSwitch.tsx',
];

describe('global destinations never claim a view is active', () => {
  it.each(DESTINATION_SOURCES)('%s names no active view', (path) => {
    const code = codeOf(path);
    expect(code).not.toMatch(/activeView\s*=\s*["']home["']/);
    expect(code).not.toMatch(/activeView\s*=\s*["']pro["']/);
    expect(code).not.toMatch(/activeView\s*=\s*\{\s*["']home["']\s*\}/);
  });

  it('the Shop hands the switch a neutral view', () => {
    // The exact call site that served HOME as active.
    expect(codeOf('src/pages/destinations/GlobalDestinationPages.tsx')).toContain(
      'activeView={null}',
    );
  });

  it('still lets HOME and the PRO workbench name their own view', () => {
    // Neutrality is for destinations. The real pages must keep saying where you are,
    // or this rule would quietly erase the switch's only job.
    expect(codeOf('src/pages/home/HomeCreatorPage.tsx')).toMatch(/activeView\s*=\s*["']home["']/);
    expect(codeOf('src/pages/pro/ProWorkspacePage.tsx')).toMatch(/activeView\s*=\s*["']pro["']/);
  });
});
