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

describe('D1 — no dead strip above the first ingredient', () => {
  it('the header band takes space only when it renders something', () => {
    // Recipe mode: the heading is sr-only, so the wrapper must contribute
    // neither padding nor a divider unless a notice is actually present.
    expect(builder).toContain('hasRecipeNotice');
    expect(builder).toContain(
      "mode === 'production'\n              ? 'border-b border-ink/10 px-3 py-2 xl:py-3'",
    );
    expect(builder).toContain("? 'px-3 pt-2 pb-1'\n                : null");
  });

  it('production mode KEEPS its real header spacing and border', () => {
    expect(builder).toContain("'border-b border-ink/10 px-3 py-2 xl:py-3'");
  });
});

describe('D2/D4/D5 — smaller housings, unchanged typography', () => {
  it('the compact shell is 28 px and the segments with it', () => {
    expect(control).toContain("compact ? 'h-7 w-7' : 'size-11'");
    expect(control).toContain("compact && 'h-7'");
  });

  it('BOTH steppers actually request the compact density', () => {
    // The earlier pass failed exactly here: the prop was never added.
    expect(row.match(/density="compact"/g)).toHaveLength(2);
  });

  it('the ••• action belongs to the same compact row', () => {
    expect(row).toContain('grid size-7 place-items-center rounded-full');
    expect(row).not.toContain('grid size-11 place-items-center rounded-full border border-ink/10');
  });

  it('D3 — the readable type sizes are NOT reduced', () => {
    // Ingredient name and the numeric value keep 13px.
    expect(row).toContain('text-[13px] font-semibold text-ink');
    expect(control).toContain("compact ? 'text-[13px]' : 'text-sm'");
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
