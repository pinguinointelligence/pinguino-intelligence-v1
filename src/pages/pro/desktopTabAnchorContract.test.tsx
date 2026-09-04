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

    expect(contract).toContain("DESKTOP_WORKBENCH_COLUMNS = 'pro-workbench-columns'");
    // SUPERSEDED, owner geometry decision 2026-09-02: the strip is EXACTLY the
    // display column, not the column plus 10 px. The overhang was right-aligned,
    // so it all fell on the LEFT — right edges matched to the pixel while the
    // left edges sat 10 px apart. Measured live at 1440 after the fix: strip
    // 896.2→1396.2, column 896.2→1396.2, both deltas 0.
    expect(contract).toContain("DESKTOP_TAB_STRIP = 'pro-workbench-section-nav'");
    expect(contract).not.toContain('+10px');
    const css = read('styles', 'gellatti-v2-1.css');
    expect(css).toMatch(/\.pro-workbench-section-nav\s*\{[\s\S]*grid-column:\s*2/);
    expect(css).toMatch(/\.pro-workbench-section-nav\s*\{[\s\S]*width:\s*100%/);

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

    expect(tabs).toContain("'grid grid-cols-4'");
    expect(tabs).not.toContain('space-between');
    expect(tabs).not.toContain('space-around');
    expect(tabs).not.toMatch(/variant === ['"]header['"][\s\S]{0,240}(fixed|absolute)/);

    /* The HEADER strip paints no surface of its own. It sits ON the header, and
       the header's hairline is the ONE line that runs the full width of the
       app; a white background here covered that hairline for the strip's
       530 px, so the line stopped dead under the modules. Transparent lets the
       single line run through and the active tab's orange border paints over
       its own segment. The docked mobile nav is a real floating bar and keeps
       `bg-white` — the next test guards that variant separately. */
    expect(tabs).toContain("'bg-transparent border-b border-ink/8'");
    expect(tabs).toContain('bg-white border-t border-ink/10');

    // Underline only: a filled or boxed active tab changes its own metrics and
    // is exactly what made the strip read as shifted (owner §7/§8).
    /* The orange is now scoped to the ONE edge that carries width. The old
       `border-[#f58a07]` set all four border COLOURS while only one edge had a
       width — three orange lines waiting for any engine or zoom level that
       rounds a hairline into existence, which is the orange FRAME the owner
       saw around the active module. Naming the edge makes that frame
       impossible. The quiet fill still belongs to the bottom variant alone. */
    expect(tabs).toContain(
      "bottom ? 'border-t-[#f58a07] bg-[var(--g-ivory)]/70' : 'border-b-[#f58a07]'",
    );
    expect(tabs).not.toMatch(/'border-\[#f58a07\][^-]/);
  });

  it('keeps the accepted mobile bottom navigation contract separate and unchanged', () => {
    const tabs = read('features', 'pro-workbench', 'WorkbenchModuleTabs.tsx');
    const surface = read('features', 'studio', 'StudioEngineSurface.tsx');

    expect(tabs).toContain("variant?: 'header' | 'bottom'");
    expect(tabs).toContain('min-h-[var(--pro-bottom-nav-height)]');
    expect(surface).toContain('pro-workbench-mobile-only fixed inset-x-0 bottom-0 z-[60]');
    expect(surface).toContain('variant="bottom"');
  });
});
