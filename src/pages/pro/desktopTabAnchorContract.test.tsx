import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), 'utf8');

describe('P0 desktop Workbench tab anchor', () => {
  /**
   * OWNER HARD OVERRIDE (Gellatti V2.1 §8). The anchor previously rode a
   * FRACTIONAL split (`minmax(0,1.62fr) minmax(400px,1fr)`) declared twice —
   * once in the shell header, once in the workbench body. Two fractional
   * declarations resolve independently, so the header column and the display
   * column landed on different widths and the strip drifted as the active
   * module changed the content underneath it.
   *
   * The contract is now ONE shared recipe whose display track is an explicit
   * length (`--g-side-width`). A length cannot follow its content, so the
   * strip's box is identical in all four modules and switching tabs moves it
   * 0 px. This is not a viewport formula: the strip is measured from the
   * display column itself.
   */
  it('binds the desktop tab row to the same right-hand grid column as the display panel', () => {
    const page = read('pages', 'pro', 'ProWorkspacePage.tsx');
    const shell = read('features', 'shell', 'AppShell.tsx');
    const surface = read('features', 'studio', 'StudioEngineSurface.tsx');
    const contract = read('features', 'shell', 'desktopTabAnchorContract.ts');

    const sharedGrid = 'xl:grid-cols-[minmax(0,1fr)_var(--g-side-width)]';
    const sharedGap = 'xl:gap-[var(--g-split-gap)]';

    expect(contract).toContain(sharedGrid);
    expect(contract).toContain(sharedGap);
    expect(contract).toContain('xl:w-[calc(var(--g-side-width)+10px)]');
    expect(contract).toContain('xl:col-start-2');
    expect(contract).toContain('xl:justify-self-end');

    // Both surfaces REUSE the one recipe; neither re-types its own columns.
    expect(shell).toContain('DESKTOP_WORKBENCH_COLUMNS');
    expect(surface).toContain('DESKTOP_WORKBENCH_COLUMNS');
    expect(page).toContain('DESKTOP_TAB_STRIP');
    expect(shell.includes('xl:grid-cols-[minmax(0,1.62fr)_minmax(400px,1fr)]')).toBe(false);
    expect(surface.includes('xl:grid-cols-[minmax(0,1.62fr)_minmax(400px,1fr)]')).toBe(false);
    expect(page).toContain('className="w-full border-b-0"');
  });

  it('distributes four tabs only inside the anchored display column', () => {
    const tabs = read('features', 'pro-workbench', 'WorkbenchModuleTabs.tsx');

    expect(tabs).toContain("'grid grid-cols-4 bg-white'");
    expect(tabs).not.toContain('space-between');
    expect(tabs).not.toContain('space-around');
    expect(tabs).not.toMatch(/variant === ['"]header['"][\s\S]{0,240}(fixed|absolute)/);
    // Underline only: a filled or boxed active tab changes its own metrics and
    // is exactly what made the strip read as shifted (owner §7/§8).
    expect(tabs).toContain("cn('border-[#f58a07] text-ink', bottom && 'bg-stone-50/70')");
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
