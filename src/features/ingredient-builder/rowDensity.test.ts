/**
 * Ingredient row DENSITY contract (owner annotation, 2026-08-24).
 *
 * The row was oversized in three separate ways: an empty header band above the
 * first ingredient, control shells far taller than their own text, and a price
 * block with no reserved width that collided with the ••• action. This pins the
 * geometry that fixed it — and, just as importantly, pins that the fix shrank
 * the CONTAINERS rather than the typography.
 *
 * It exists because an earlier density pass silently applied only one of its
 * three edits: the grid changed, the controls did not, and the served build
 * kept 44 px shells. A source-level contract makes that failure impossible to
 * repeat unnoticed.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), 'utf8');

const row = read('features', 'ingredient-builder', 'IngredientRow.tsx');
const control = read('features', 'ingredient-builder', 'DirectNumberControl.tsx');
const price = read('features', 'ingredient-builder', 'IngredientPriceControl.tsx');
const builder = read('features', 'ingredient-builder', 'IngredientBuilder.tsx');
const buttonStyles = read('components', 'ui', 'buttonStyles.ts');
const legacyNotice = read('features', 'ingredient-builder', 'LegacyRecipeReferenceNotice.tsx');
const picker = read('features', 'ingredient-builder', 'ProductPickerPopover.tsx');
const intelligenceHeader = read('features', 'pro-workbench', 'WorkbenchIntelligenceHeader.tsx');

describe('D1 — no dead strip above the first ingredient', () => {
  it('the header band takes space only when it renders something', () => {
    // Recipe mode: the heading is sr-only, so the wrapper must contribute
    // neither padding nor a divider unless a notice is actually present.
    expect(builder).toContain('hasRecipeNotice');
    expect(builder).toContain("mode === 'recipe' &&");
    expect(builder).toContain(
      "hasRecipeNotice ? 'px-[var(--pro-mobile-gutter)] pt-2 pb-1 lg:px-3' : null",
    );
  });

  it('production mode does not reserve a permanent reminder strip above the first row', () => {
    expect(builder).not.toContain('data-testid="production-execution-reminder"');
    expect(builder).not.toContain("'border-b border-ink/8 px-3 py-1.5'");
  });
});

describe('D2/D4/D5 — smaller housings, unchanged typography', () => {
  it('the compact shell is 28 px and the segments with it', () => {
    expect(control).toContain(
      "compact ? 'h-7 w-7' : responsive ? 'size-11 lg:h-7 lg:w-7' : 'size-11'",
    );
    expect(control).toContain("compact && 'h-7'");
    expect(control).toContain("responsive && 'lg:h-7 lg:rounded-xl lg:shadow-none'");
  });

  it('BOTH steppers actually request the compact density', () => {
    // The earlier pass failed exactly here: the prop was never added.
    expect(row.match(/density="compact"/g)).toHaveLength(2);
  });

  it('the ••• action belongs to the same compact row', () => {
    expect(row).toContain("className={iconButtonClasses('xs')}");
    expect(buttonStyles).toContain('grid shrink-0 place-items-center rounded-full');
    expect(buttonStyles).toContain("size === 'xs' ? 'size-7 text-[11px]'");
    expect(row).not.toContain('grid size-11 place-items-center rounded-full border border-ink/10');
  });

  it('D3 — the readable type sizes are NOT reduced', () => {
    // Ingredient name and the numeric value keep 13px.
    expect(row).toContain('text-[13px] font-semibold text-ink');
    expect(control).toContain(
      "compact ? 'text-[13px]' : responsive ? 'text-sm lg:text-[13px]' : 'text-sm'",
    );
  });
});

describe('D6/D9/D10 — protected price column, name gets the rest', () => {
  it('the grid reserves width for price and action, and flexes the name', () => {
    for (const track of ['minmax(300px,1fr)_142px_150px_96px_28px'])
      expect(row, track).toContain(track);
    expect(row).toContain('2xl:grid-cols-[minmax(400px,1fr)_142px_150px_96px_28px]');
  });

  it('every row uses the SAME grid, so columns cannot drift between rows', () => {
    // One shared constant per layout — never a per-row width.
    expect(row.match(/^export const ROW_GRID =/gm)).toHaveLength(1);
    expect(row.match(/^export const COMPACT_ROW_GRID =/gm)).toHaveLength(1);
  });

  it('the incomplete-cost status cannot clip the money column', () => {
    expect(price).toContain("lineCost === null ? 'text-[10px]' : 'text-[11px]'");
    expect(price).toContain('whitespace-nowrap');
  });
});

describe('D7/D8 — the „Moja" badge is gone, the mark explains itself', () => {
  it('no Moja badge remains on the row', () => {
    expect(price).not.toContain('>Moja<');
    expect(price).not.toMatch(/Moja\s*\n\s*<\/span>/);
  });

  it('a custom price is a quiet dot with a comfortable, focusable target', () => {
    expect(price).toContain('data-testid="customer-price-indicator"');
    expect(price).toContain('size-[5px] rounded-full bg-gold');
    // 5 px mark, 16 px target, keyboard reachable.
    expect(price).toContain('size-4 shrink-0 items-center justify-center');
    expect(price).toContain('focusable');
    expect(price).toContain('Moja cena');
    expect(price).toContain('Bazowa:');
  });

  it('the base price survives without the native title', () => {
    // It used to live in `title`; it must stay in the accessible name.
    expect(price).toContain('aria-label={tooltipCopy}');
    expect(price).toContain('return `Cena bazowa: ${active}`');
    expect(price).toContain('const own = `Moja cena: ${active}`');
  });

  it('anchors the short price preview inward so it cannot cover the right panel', () => {
    expect(price).toContain('align="end"');
    expect(price).toContain('maxWidthPx={224}');
    expect(price).not.toContain('wprowadzona przez Ciebie');
  });

  it('the source is exposed for QA without reading colour', () => {
    expect(price).toContain("data-price-source={own ? 'customer_override' : 'reference'}");
  });
});

describe('D11 — the complete left Recipe workspace follows the row system', () => {
  it('integrates multiple historical products in a compact responsive list', () => {
    expect(legacyNotice).toContain('`${issues.length} historycznych produktów wymaga sprawdzenia`');
    expect(legacyNotice).toContain('sm:grid-cols-2');
    expect(legacyNotice).toContain('min-h-11');
    expect(legacyNotice).toContain('lg:h-7 lg:min-h-0');
  });

  it('aligns every summary and toolbar to the ingredient-row gutter', () => {
    expect(builder.match(/px-\[var\(--pro-mobile-gutter\)\]/g)).toHaveLength(5);
    expect(builder.match(/lg:px-3/g)?.length).toBeGreaterThanOrEqual(5);
    expect(builder).toContain('data-testid="base-mass-total"');
    expect(builder).toContain('data-testid="ingredient-action-toolbar"');
    expect(builder).toContain('data-testid="topping-mass-total"');
    expect(builder).toContain('data-testid="composition-mass-summary"');
  });

  it('uses one 44 px / rounded-xl action family with an explicit hierarchy', () => {
    expect(picker).toContain(
      "scope === 'BASE_FORMULATION'\n            ? 'border border-ink/20 bg-white text-ink hover:border-ink/40'\n            : 'border border-ink/10 bg-stone-50 text-stone-700 hover:border-ink/25'",
    );
    expect(picker).toContain('inline-flex h-11 items-center justify-center rounded-xl');
    expect(intelligenceHeader).toContain('flex h-11 shrink-0 items-center gap-2 rounded-xl');
  });
});
