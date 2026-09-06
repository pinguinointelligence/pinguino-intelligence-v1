import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ENGINES, engineDisplayLabelPl } from '@/data/engines';
import { formatProductStatusLabel } from '@/data/products/productStatusDecision';
import { duplicateFactDifferences } from '@/features/global-catalog/duplicateComparison';
import { productProfileStatusLabelPl } from '@/features/ingredient-builder/productProfileStatusLabel';
import { scaleMessagePl } from '@/features/pro-core/recipeScaling';
import { MATCH_SCORE_TOOLTIPS } from '@/features/recipe-score/recipeMatchScore';
import { TECHNICAL_FIT_TOOLTIPS } from '@/features/recipe-score/technicalFit';
import { productionRescueErrorMessagePl } from '@/services/proCore/supabaseProduction';

describe('Gellatti Language V1 display-only mappings', () => {
  it('keeps engine contract labels and maps only their presentation', () => {
    expect(ENGINES.slice(0, 4).map((engine) => engine.label)).toEqual([
      '−11°C Engine',
      '−12°C Engine',
      '−13°C Engine',
      'Fresh Engine',
    ]);
    expect(ENGINES.slice(0, 4).map(engineDisplayLabelPl)).toEqual([
      '−11°C · obliczenia',
      '−12°C · obliczenia',
      '−13°C · obliczenia',
      'Bieżące obliczenia',
    ]);
  });

  it('keeps scale refusal contracts and maps exact Polish customer copy', () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      [
        'Scaling to a volume needs an explicit density (g/ml). No density was supplied, so no volume was assumed.',
        'Skalowanie do objętości wymaga podania gęstości (g/ml). Nie podano gęstości, więc objętość nie została przyjęta.',
      ],
      [
        'Scaling to portions needs an explicit portion weight (g) or yield. None was supplied, so no yield was assumed.',
        'Skalowanie do porcji wymaga masy porcji (g) lub wydajności. Nie podano żadnej z tych wartości.',
      ],
      [
        'Target batch weight must be greater than zero.',
        'Masa docelowej partii musi być większa od zera.',
      ],
      [
        'Cannot scale a recipe with zero total mass.',
        'Nie można skalować receptury o zerowej masie całkowitej.',
      ],
    ];
    for (const [contract, display] of cases) expect(scaleMessagePl(contract)).toBe(display);
    const source = readFileSync(
      new URL('../features/pro-core/recipeScaling.ts', import.meta.url),
      'utf8',
    );
    for (const [contract] of cases) expect(source).toContain(contract);
  });

  it('keeps lifecycle contracts and maps their Polish presentation', () => {
    expect(formatProductStatusLabel('pi_calculated')).toBe('PI Calculated');
    expect(formatProductStatusLabel('pi_generated')).toBe('PI Generated');
    expect(formatProductStatusLabel('pi_verified')).toBe('PI Verified');
    expect(productProfileStatusLabelPl('PI Calculated')).toBe('Obliczone');
    expect(productProfileStatusLabelPl('PI Generated')).toBe('Wygenerowane');
    expect(productProfileStatusLabelPl('PI Verified')).toBe('Zweryfikowane');
  });

  it('maps duplicate-comparison keys without changing their internal identity', () => {
    const source = readFileSync(
      new URL('../features/global-catalog/duplicateComparison.ts', import.meta.url),
      'utf8',
    );
    expect(source).toMatch(/\['name',\s*'Nazwa'\]/);
    expect(source).toMatch(/\['market',\s*'Rynek'\]/);
    expect(source).not.toMatch(/\['Name',/);
    expect(source).not.toMatch(/\['Market',/);
    expect(
      duplicateFactDifferences(
        { name: null, brand: null, package: null, market: 'PL', ean: '123' },
        { name: null, brand: null, package: null, market: 'ES', ean: '456' },
      ),
    ).toEqual(['Rynek: ES -> PL', 'EAN: 456 -> 123']);
  });

  it('maps Production Rescue protocol failures at the presentation boundary', () => {
    expect(productionRescueErrorMessagePl(new Error('engine_bundle_mismatch'))).toBe(
      'Korekta partii jest chwilowo niedostępna — wersja obliczeń na serwerze nie jest zgodna z aplikacją.',
    );
    expect(
      productionRescueErrorMessagePl(new Error('Production Rescue authorization failed.')),
    ).toBe('Nie udało się potwierdzić dostępu do korekty partii.');
    expect(
      productionRescueErrorMessagePl(new Error('Production Rescue option is unavailable.')),
    ).toBe('Korekta partii jest teraz niedostępna.');
  });

  it('uses the exact no-data tooltip presentation copy', () => {
    expect(MATCH_SCORE_TOOLTIPS['recipe-score.match.tooltip.no-data']).toBe(
      'Za mało danych, aby ocenić dopasowanie receptury. Uzupełnij składniki i gramatury, aby otrzymać ocenę',
    );
    expect(TECHNICAL_FIT_TOOLTIPS['recipe-score.technical.tooltip.no-data']).toBe(
      'Za mało danych, aby ocenić dopasowanie techniczne. Uzupełnij składniki i gramatury, aby otrzymać ocenę',
    );
  });

  it('keeps FriendlyLabMomentViewport unmounted', () => {
    const app = readFileSync(new URL('../app/App.tsx', import.meta.url), 'utf8');
    expect(app).not.toMatch(/import\s+\{?\s*FriendlyLabMomentViewport\b/);
    expect(app).not.toMatch(/<FriendlyLabMomentViewport\b/);
  });
});
