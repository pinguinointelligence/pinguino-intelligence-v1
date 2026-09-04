import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), 'utf8');

describe('PRO responsive frame authority', () => {
  const geometry = read('features', 'shell', 'shellGeometry.ts');
  const columns = read('features', 'shell', 'desktopTabAnchorContract.ts');
  const shell = read('features', 'shell', 'AppShell.tsx');
  const page = read('pages', 'pro', 'ProWorkspacePage.tsx');
  const studio = read('features', 'studio', 'StudioEngineSurface.tsx');
  const css = read('styles', 'gellatti-v2-1.css');
  const tokens = read('styles', 'tokens.css');

  it('uses one unscaled frame class for both the header canvas and workbench body', () => {
    expect(geometry).toContain("PRO_WORKBENCH_FRAME_CLASS = 'pro-workbench-frame'");
    expect(geometry).toContain('PRO_WORKBENCH_FRAME_CLASS');
    expect(page).toContain('PRO_WORKBENCH_FRAME_CLASS');
    expect(page).not.toMatch(/zoom\s*:/);
    expect(geometry).not.toMatch(/zoom\s*:/);
    expect(geometry).not.toContain('APP_CANVAS_SCALE');
  });

  it('defines the centered frame, both tracks and gutter as one token family', () => {
    for (const token of [
      '--pro-frame-inline-gutter',
      '--pro-frame-max-width',
      '--pro-frame-gap',
      '--pro-frame-right-width',
      '--pro-frame-left-min-width',
    ]) {
      expect(tokens, token).toContain(token);
    }
    expect(tokens).toContain('--pro-frame-max-width: 1280px');
    expect(css).toMatch(/\.pro-workbench-frame\s*\{[\s\S]*margin-inline:\s*auto/);
    expect(css).toMatch(
      /\.pro-workbench-columns\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+var\(--pro-frame-right-width\)/,
    );
  });

  it('places section navigation in the same right track the body uses', () => {
    expect(columns).toContain("DESKTOP_WORKBENCH_COLUMNS = 'pro-workbench-columns'");
    expect(columns).toContain("DESKTOP_TAB_STRIP = 'pro-workbench-section-nav'");
    expect(shell).toContain('DESKTOP_WORKBENCH_COLUMNS');
    expect(studio).toContain('DESKTOP_WORKBENCH_COLUMNS');
    expect(css).toMatch(/\.pro-workbench-section-nav\s*\{[\s\S]*grid-column:\s*2/);
    expect(css).toMatch(/\.pro-workbench-section-nav\s*\{[\s\S]*width:\s*100%/);
    expect(css).toMatch(
      /\.pro-workbench-header-canvas\s*\{[\s\S]*width:\s*min\(var\(--pro-frame-max-width\),\s*100%\)/,
    );
  });

  it('keeps a compact desktop between wide desktop and the real tablet transition', () => {
    expect(tokens).toContain('--pro-desktop-min-width: 70rem');
    expect(tokens).toContain('--pro-density-state: TABLET');
    expect(tokens).toContain('--pro-density-state: TIGHT');
    expect(tokens).toContain('--pro-density-state: COMPACT');
    expect(tokens).toContain('--pro-density-state: SPACIOUS');
    expect(css).toContain('@media (min-width: 70rem)');
    expect(css).toContain('.pro-workbench-mobile-only');
    expect(css).toContain('.pro-workbench-desktop-only');
    expect(studio).not.toContain('z-[60] xl:hidden');
  });

  it('keeps the full ingredient control grid unclipped at the tight desktop breakpoint', () => {
    const row = read('features', 'ingredient-builder', 'IngredientRow.tsx');
    expect(row).toContain('data-gellatti-row="ingredient"');
    expect(css).toMatch(
      /@media \(min-width: 70rem\)[\s\S]*\[data-gellatti-row='ingredient'\][\s\S]*grid-template-columns:/,
    );
    expect(css).toContain('minmax(0, 1fr)');
  });

  it('uses the same structural breakpoint for viewport JS and portal positioning', () => {
    const breakpoint = read('features', 'shell', 'proFrameGeometry.ts');
    const cockpit = read('features', 'studio', 'mobileCockpitModal.ts');
    const picker = read('features', 'ingredient-builder', 'ProductPickerPopover.tsx');
    expect(breakpoint).toContain('PRO_DESKTOP_MIN_WIDTH_PX = 1120');
    expect(breakpoint).toContain('PRO_DESKTOP_MEDIA_QUERY');
    expect(breakpoint).toContain('PRO_TABLET_MEDIA_QUERY');
    expect(cockpit).toContain('PRO_TABLET_MEDIA_QUERY');
    expect(picker).toContain('PRO_DESKTOP_MEDIA_QUERY');
    expect(picker).toContain('pro-product-picker-backdrop');
    expect(css).toMatch(
      /@media \(min-width: 70rem\)[\s\S]*\.pro-product-picker-backdrop\s*\{[\s\S]*background:\s*transparent/,
    );
    expect(picker).not.toContain("matchMedia('(min-width: 1280px)')");
  });

  it('moves the final route-local customer header into the global AppShell', () => {
    const subscription = read('pages', 'destinations', 'SubscriptionPage.tsx');
    expect(subscription).toContain('<AppShell>');
    expect(subscription).not.toContain('<CustomerMenu');
    expect(subscription).not.toContain('<header');
  });
});
