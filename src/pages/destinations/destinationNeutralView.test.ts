/**
 * A GLOBAL DESTINATION IS NEITHER HOME NOR PRO — owner ruling, 2026-09-01.
 *
 * F-2: `/shop` served HOME with `aria-selected="true"`, telling a visitor they
 * were inside HOME while they read a commercial page. Work With Us was already
 * neutral; the Shop was not.
 *
 * The shell now derives the active segment from the route. Destination call
 * sites stay neutral by construction: none can provide or offset its own
 * switch, while HOME and PRO are named centrally from `location.pathname`.
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
];

describe('global destinations never claim a view is active', () => {
  it.each(DESTINATION_SOURCES)('%s names no active view', (path) => {
    const code = codeOf(path);
    expect(code).not.toMatch(/activeView\s*=\s*["']home["']/);
    expect(code).not.toMatch(/activeView\s*=\s*["']pro["']/);
    expect(code).not.toMatch(/activeView\s*=\s*\{\s*["']home["']\s*\}/);
  });

  it('lets no destination render or configure a route-local switch', () => {
    for (const path of DESTINATION_SOURCES) {
      const code = codeOf(path);
      expect(code).not.toContain('HomeProSwitch');
      expect(code).not.toContain('activeView=');
    }
  });

  it('derives HOME, PRO and neutral states exactly once in AppShell', () => {
    const shell = codeOf('src/features/shell/AppShell.tsx');
    expect(shell.match(/<HomeProSwitch\s/g) ?? []).toHaveLength(1);
    expect(shell).toContain("location.pathname.startsWith('/pro')");
    expect(shell).toContain("location.pathname === '/home'");
    expect(shell).toContain(': null');
    expect(codeOf('src/pages/home/HomeCreatorPage.tsx')).not.toContain('activeView=');
    expect(codeOf('src/pages/pro/ProWorkspacePage.tsx')).not.toContain('activeView=');
  });
});
