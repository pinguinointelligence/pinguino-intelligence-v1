import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), 'utf8');

describe('P0 desktop Workbench tab anchor', () => {
  it('binds the desktop tab row to the same right-hand grid column as the display panel', () => {
    const page = read('pages', 'pro', 'ProWorkspacePage.tsx');
    const shell = read('features', 'shell', 'AppShell.tsx');
    const surface = read('features', 'studio', 'StudioEngineSurface.tsx');

    const acceptedGrid = 'xl:grid-cols-[minmax(0,1.62fr)_minmax(400px,1fr)]';
    const acceptedGap = 'xl:gap-[var(--pro-workbench-gap)]';

    expect(shell).toContain(acceptedGrid);
    expect(shell).toContain(acceptedGap);
    expect(surface).toContain(acceptedGrid);
    expect(surface).toContain(acceptedGap);
    expect(page).toContain('xl:col-start-2 xl:row-start-1 xl:block xl:w-full');
    expect(page).toContain('className="w-full border-b-0"');
  });

  it('distributes four tabs only inside the anchored display column', () => {
    const tabs = read('features', 'pro-workbench', 'WorkbenchModuleTabs.tsx');

    expect(tabs).toContain("'grid grid-cols-4 bg-white'");
    expect(tabs).not.toContain('space-between');
    expect(tabs).not.toContain('space-around');
    expect(tabs).not.toMatch(/variant === ['"]header['"][\s\S]{0,240}(fixed|absolute)/);
  });

  it('keeps the accepted mobile bottom navigation contract separate and unchanged', () => {
    const tabs = read('features', 'pro-workbench', 'WorkbenchModuleTabs.tsx');
    const surface = read('features', 'studio', 'StudioEngineSurface.tsx');

    expect(tabs).toContain("variant?: 'header' | 'bottom'");
    expect(tabs).toContain('min-h-[var(--pro-bottom-nav-height)]');
    expect(surface).toContain('fixed inset-x-0 bottom-0 z-[60] xl:hidden');
    expect(surface).toContain('variant="bottom"');
  });
});
