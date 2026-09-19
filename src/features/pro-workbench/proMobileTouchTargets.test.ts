/**
 * PRO MOBILE UX v2 · A8 + A10 — source contracts (owner review, 2026-09-10).
 *
 * A8's behaviour is CSS (a coarse-pointer media query), which jsdom does not apply,
 * so the stylesheet contract is pinned here; the wiring is exercised by
 * IngredientRow.touchTarget.runtime.test.tsx and the served proof is a real touch
 * tablet.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), 'utf8');
const css = read('styles', 'theme-pro-light.css');
const ingredientRow = read('features', 'ingredient-builder', 'IngredientRow.tsx');
const mobileLine = read('features', 'ingredient-builder', 'IngredientLineControls.tsx');
const toppingRow = read('features', 'ingredient-builder', 'ToppingRow.tsx');

/** The whole `@media (pointer: coarse) { … }` block, matched brace by brace. */
const coarseBlock = () => {
  const start = css.indexOf('@media (pointer: coarse)');
  expect(start).toBeGreaterThan(-1);
  let depth = 0;
  for (let index = css.indexOf('{', start); index < css.length; index += 1) {
    if (css[index] === '{') depth += 1;
    if (css[index] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(start, index + 1);
    }
  }
  throw new Error('unterminated @media (pointer: coarse) block');
};

describe('A8 — a coarse-pointer tap surface, never a mouse one', () => {
  it('hides the surface by default and shows it only for a coarse pointer', () => {
    expect(css).toMatch(/\.gellatti-row-touch-target \{\s*display: none;\s*\}/);
    const coarse = coarseBlock();
    expect(coarse).toMatch(/\.gellatti-row-touch-target \{[^}]*display: block;/);
    expect(coarse).toMatch(/\.gellatti-row-touch-content \{[^}]*pointer-events: none;/);
  });

  it('keeps every control of the row pressable above the surface — the drag handle included', () => {
    const coarse = coarseBlock();
    // Lazy up to the `)` that opens the declaration block: the list itself holds
    // `:not([tabindex='-1'])`, whose own `)` must not end the match.
    const reenabled = coarse.match(
      /\.gellatti-row-touch-content\s*:is\(([\s\S]*?)\)\s*\{\s*pointer-events: auto;/,
    );
    expect(reenabled).not.toBeNull();
    for (const control of [
      'button',
      'input',
      'label',
      "[role='spinbutton']",
      "[role='button']",
      // The ⋮⋮ handle is a draggable <span>: without this a press on it would
      // fall through to the surface and open the panel instead of dragging.
      "[draggable='true']",
    ]) {
      expect(reenabled?.[1]).toContain(control);
    }
  });

  it('is a pointer rule, not a width rule: a mouse at any width keeps the approved row', () => {
    expect(css).not.toMatch(/@media[^{]*pointer: coarse[^{]*width/);
    expect(css).not.toMatch(/@media[^{]*width[^{]*pointer: coarse/);
  });

  it('creates no stacking context, so nothing a row opens in place is trapped under the next row', () => {
    // The surface and the row grid are both positioned with z-index auto: the grid,
    // later in the document, paints above the surface on its own.
    expect(coarseBlock()).not.toMatch(/z-index/);
    expect(css).toMatch(/\.gellatti-row-touch-target \{\s*display: none;\s*\}/);
  });

  it('gives recipe and topping rows the same surface and the SAME action as •••', () => {
    // The recipe row's own desktop wrapper is the positioning box, so the protected
    // row gains no extra wrapper element (and no re-indented table row).
    expect(coarseBlock()).toMatch(
      /\.pro-ingredient-row-desktop,\s*\.gellatti-row-touch-surface \{\s*position: relative;\s*\}/,
    );
    expect(ingredientRow).toContain('<div className="pro-ingredient-row-desktop hidden lg:block">');
    expect(ingredientRow).toContain('gellatti-row-touch-target');
    expect(ingredientRow).toContain('gellatti-row-touch-content');
    expect(ingredientRow.match(/onClick=\{openRowMenu\}/g)).toHaveLength(2);
    expect(ingredientRow).toContain('returnFocus={() => rowMenuTriggerRef.current}');

    expect(toppingRow).toContain('gellatti-row-touch-surface');
    expect(toppingRow).toContain('gellatti-row-touch-target');
    expect(toppingRow).toContain('gellatti-row-touch-content');
    expect(toppingRow.match(/onClick=\{openToppingMenu\}/g)).toHaveLength(2);
    expect(toppingRow).toContain('returnFocus={() => menuTriggerRef.current}');
  });
});

describe('A10 — no estimated-data badge on the row icon', () => {
  it('removes the dot from both row presentations', () => {
    expect(ingredientRow).not.toContain('row-estimated-');
    expect(mobileLine).not.toContain('row-estimated-');
    expect(mobileLine).not.toMatch(/\bestimated: boolean/);
  });

  it('keeps the uncertainty, in words, in the product data view', () => {
    expect(ingredientRow).toContain('estimated ? t.data.estimated : t.data.verified');
  });

  it('leaves no dead copy behind', () => {
    expect(read('copy', 'en.ts')).not.toContain('estimatedHint');
  });
});
