/**
 * PRO MOBILE UX v2 — source contracts for A1 (one scroll owner per layout) and
 * A9 (long-press selection suppressed on touch controls only). The behaviour is
 * CSS, which jsdom does not apply, so the contract is pinned at the source; the
 * served proof is a real one-finger swipe on a phone.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), 'utf8');
const css = read('styles', 'theme-pro-light.css');

describe('A1 — one scroll owner per PRO layout', () => {
  it('keeps the ingredient pane’s overscroll containment inside the viewport-locked workbench only', () => {
    const shared = css.match(
      /\.theme-pro-light \[data-testid='ingredient-rows-scroll'\],\s*\.theme-pro-light \[data-testid='pro-monitor-panel'\] \{([^}]*)\}/,
    );
    expect(shared?.[1]).toBeDefined();
    expect(shared?.[1]).not.toContain('overscroll-behavior');

    expect(css).toMatch(
      /@media \(min-width: 60rem\) \{\s*\.theme-pro-light \[data-testid='ingredient-rows-scroll'\],\s*\.theme-pro-light \[data-testid='pro-monitor-panel'\] \{\s*overscroll-behavior: contain;/,
    );
  });

  it('makes the DOCUMENT the scroll owner below the workbench breakpoint', () => {
    expect(css).toMatch(
      /@media not all and \(min-width: 60rem\) \{\s*\.theme-pro-light \[data-testid='ingredient-rows-scroll'\] \{\s*overflow-y: visible;/,
    );
  });

  it('routes every modal page lock through the one counted lock', () => {
    const sites = [
      read('components', 'ui', 'DialogShell.tsx'),
      read('features', 'shell', 'AppNavDrawer.tsx'),
      read('features', 'ingredient-builder', 'ProductPickerPopover.tsx'),
      read('features', 'studio', 'StudioEngineSurface.tsx'),
    ];
    for (const source of sites) {
      expect(source).toContain('lockBodyScroll()');
      expect(source).not.toMatch(/body\.style\.overflow\s*=\s*'hidden'/);
    }
  });
});

describe('A9 — long-press selection is suppressed on touch controls, never globally', () => {
  it('defines ONE opt-in class carrying both properties', () => {
    const rule = css.match(/\.gellatti-touch-control \{([^}]*)\}/);
    expect(rule?.[1]).toContain('user-select: none');
    expect(rule?.[1]).toContain('-webkit-touch-callout: none');
  });

  it('is applied to the controls a thumb presses', () => {
    const controls: Array<[string, string[]]> = [
      ['module bar', ['features', 'pro-workbench', 'WorkbenchModuleTabs.tsx']],
      ['recipe line', ['features', 'ingredient-builder', 'IngredientLineControls.tsx']],
      ['topping line', ['features', 'ingredient-builder', 'ToppingRow.tsx']],
      ['− / + steppers', ['features', 'ingredient-builder', 'DirectNumberControl.tsx']],
      ['Direction positions', ['features', 'pro-workbench', 'ProfileDirectionAxes.tsx']],
      ['score / Przelicz strip', ['features', 'studio', 'StudioEngineSurface.tsx']],
    ];
    for (const [, path] of controls) {
      expect(read(...path)).toContain('gellatti-touch-control');
    }
  });

  it('never disables selection on the document, the body or everything', () => {
    for (const file of readdirSync(join(SRC, 'styles')).filter((name) => name.endsWith('.css'))) {
      const source = read('styles', file);
      expect(source).not.toMatch(/(^|[\s,}])(html|body|:root|\*)\s*\{[^}]*user-select:\s*none/);
    }
  });
});
