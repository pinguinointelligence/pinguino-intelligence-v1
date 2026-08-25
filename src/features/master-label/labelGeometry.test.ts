import { describe, expect, it } from 'vitest';
import { applyAutoLabelLayout, buildLabelPreflight } from './masterLabel';
import { minimumBaseFontPt } from './labelGeometry';
import { createCompleteLabel } from './masterLabelTestFixture';

describe('content-aware physical label preflight', () => {
  it('blocks long content without shrinking below profile typography', () => {
    const base = createCompleteLabel('EU');
    const long = {
      ...base,
      productName: {
        en: 'Exceptionally long artisan frozen dairy dessert with roasted ingredients',
      },
      ingredients: Array.from({ length: 14 }, (_, index) => ({
        ...base.ingredients[index % base.ingredients.length]!,
        lineId: `long-${index}`,
        canonicalIngredientId: `PI-LONG-${index}`,
        names: {
          en: `compound ingredient ${index} (milk powder, cocoa butter, hazelnut preparation, natural flavouring)`,
        },
      })),
      size: { widthMm: 70, heightMm: 50 },
      printer: { ...base.printer, widthMm: 70, heightMm: 50 },
    };
    const preflight = buildLabelPreflight(long);
    const geometry = preflight.items.find((item) => item.field === 'geometry');
    expect(geometry).toMatchObject({ status: 'missing' });
    expect(geometry?.message).toContain(
      'Ten format jest za mały dla tej etykiety. Wybierz większy rozmiar.',
    );
    expect(preflight.geometry.baseFontPt).toBeGreaterThanOrEqual(
      minimumBaseFontPt('EU', long.availableDisplaySurfaceCm2),
    );
  });

  it('Auto selects the smallest practical preset that fits the actual content', () => {
    const selected = applyAutoLabelLayout(
      createCompleteLabel('WORLD', {
        size: { widthMm: 50, heightMm: 30 },
        printer: {
          ...createCompleteLabel('WORLD').printer,
          widthMm: 50,
          heightMm: 30,
          formatMode: 'auto',
        },
      }),
    );
    expect(buildLabelPreflight(selected).geometry.fits).toBe(true);
    expect(selected.layoutMode).toBe('auto');
    expect(selected.size.widthMm * selected.size.heightMm).toBeLessThanOrEqual(104 * 200);
  });

  it('uses the EU small-package x-height only when package display-surface authority is supplied', () => {
    expect(minimumBaseFontPt('EU', 79)).toBeLessThan(minimumBaseFontPt('EU', 80));
    expect(minimumBaseFontPt('EU', null)).toBe(minimumBaseFontPt('EU', 80));
  });
});
