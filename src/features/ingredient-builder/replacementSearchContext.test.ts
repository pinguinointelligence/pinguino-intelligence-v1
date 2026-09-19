import { describe, expect, it } from 'vitest';
import type { EngineIngredient } from '@/engine';
import {
  createReplacementSearchLineContext,
  isHardCompatibleReplacementCandidate,
  isCurrentReplacementIdentity,
} from './replacementSearchContext';

const banana: EngineIngredient = {
  id: 'PR-ING-000101',
  canonical_ingredient_id: 'PI-ING-000345',
  private_product_id: 'catalog:banana-es:version:v2',
  identity_provenance: 'private_product',
  source_subcategory: 'fresh_fruit',
  name: 'Banana Fresh',
  category: 'fruit',
  composition: {
    water_percent: 75,
    solids_percent: 25,
    fat_percent: 0,
    protein_percent: 1,
    carbohydrate_percent: 23,
    sugar_percent: 18,
    sucrose_percent: 9,
    glucose_percent: 4,
    dextrose_percent: 0,
    fructose_percent: 5,
    lactose_percent: 0,
    polyol_percent: 0,
    fiber_percent: 2,
    salt_percent: 0,
    alcohol_percent: 0,
    kcal_per_100g: 89,
  },
  pod_value: null,
  pac_value: null,
  de_value: null,
  cost_per_kg: null,
  confidence_score: 100,
  source_type: 'verified_db',
  is_verified: true,
};

describe('replacement search line context', () => {
  it('RSX-01 carries full current-line facts without resolving or ranking them', () => {
    const context = createReplacementSearchLineContext({
      usageMode: 'HOME_REPLACE',
      lineId: 'line-banana',
      ingredient: banana,
      recipeProfile: 'sorbet',
      currentRole: 'MAIN',
      processScope: 'BASE_FORMULATION',
      temperatureC: -12,
      formulationMode: 'optimal',
      marketCountry: 'ES',
      userFilters: { filter: 'fruit', subfilter: 'fresh', family: null },
      plannedGrams: 125,
      actualGrams: null,
      lockType: 'main',
    });

    expect(context).toMatchObject({
      usageMode: 'HOME_REPLACE',
      lineId: 'line-banana',
      searchConceptSeed: 'Banana Fresh',
      gradeOrSubtype: 'fresh_fruit',
      recipeProfile: 'sorbet',
      currentRole: 'MAIN',
      processScope: 'BASE_FORMULATION',
      temperatureC: -12,
      marketCountry: 'ES',
      userFilters: { filter: 'fruit', subfilter: 'fresh', family: null },
      recipeLine: { plannedGrams: 125, actualGrams: null, lockType: 'main' },
      currentIdentity: {
        canonicalIngredientId: 'PI-ING-000345',
        mapperIngredientId: 'PI-ING-000345',
        productId: null,
        privateProductId: 'catalog:banana-es:version:v2',
      },
    });
  });

  it('RSX-02 excludes only the exact current product, not another PR on the same PI', () => {
    const context = createReplacementSearchLineContext({
      usageMode: 'PRO_REPLACE',
      lineId: 'line-banana',
      ingredient: banana,
      recipeProfile: 'sorbet',
      currentRole: 'STANDARD',
      processScope: 'BASE_FORMULATION',
      temperatureC: -12,
      formulationMode: 'optimal',
      userFilters: { filter: 'fruit', subfilter: 'fresh', family: null },
      plannedGrams: 125,
      actualGrams: null,
      lockType: 'grams',
    });

    expect(
      isCurrentReplacementIdentity(context, {
        id: 'banana-es',
        entityKind: 'commercial_product',
        productCode: 'PR-ING-000101',
        mappedIngredientId: 'PI-ING-000345',
      }),
    ).toBe(true);
    expect(
      isCurrentReplacementIdentity(context, {
        id: 'banana-pl',
        entityKind: 'commercial_product',
        productCode: 'PR-ING-000102',
        mappedIngredientId: 'PI-ING-000345',
      }),
    ).toBe(false);
  });

  it('RSX-03 gives HOME and PRO the same replacement facts for the same line', () => {
    const common = {
      lineId: 'line-banana',
      ingredient: banana,
      recipeProfile: 'sorbet' as const,
      currentRole: 'STANDARD' as const,
      processScope: 'BASE_FORMULATION' as const,
      temperatureC: -12,
      formulationMode: 'optimal' as const,
      marketCountry: 'ES',
      userFilters: { filter: 'fruit', subfilter: 'fresh', family: null } as const,
      plannedGrams: 125,
      actualGrams: null,
      lockType: 'grams' as const,
    };
    const home = createReplacementSearchLineContext({ usageMode: 'HOME_REPLACE', ...common });
    const pro = createReplacementSearchLineContext({ usageMode: 'PRO_REPLACE', ...common });

    expect({ ...home, usageMode: undefined }).toEqual({ ...pro, usageMode: undefined });
  });

  it('RSX-04 applies cream compatibility before recency or presentation filters', () => {
    const context = createReplacementSearchLineContext({
      usageMode: 'HOME_REPLACE',
      lineId: 'line-cream',
      ingredient: { ...banana, name: 'CREAM 30%', category: 'dairy' },
      recipeProfile: 'sorbet',
      currentRole: 'STANDARD',
      processScope: 'BASE_FORMULATION',
      temperatureC: -12,
      formulationMode: 'optimal',
      userFilters: { filter: 'dairy', subfilter: 'all', family: 'cream' },
      plannedGrams: 130,
      actualGrams: null,
      lockType: 'grams',
    });
    const candidate = (overrides: Partial<Parameters<typeof isHardCompatibleReplacementCandidate>[1]>) => ({
      displayName: 'CREAM 36%',
      category: 'dairy',
      productForm: 'cream',
      usableInBase: true,
      usableAsTopping: true,
      mainAllowed: true,
      ...overrides,
    });

    expect(isHardCompatibleReplacementCandidate(context, candidate({}))).toBe(true);
    expect(
      isHardCompatibleReplacementCandidate(
        context,
        candidate({
          displayName: 'BANANA · Fabbri Cream · Chilled · 0004282',
          originalName: 'delipaste_banana_fabbri_0004282',
          canonicalFamily: null,
          category: 'dairy',
          productForm: 'liquid',
        }),
      ),
    ).toBe(false);
    expect(
      isHardCompatibleReplacementCandidate(
        context,
        candidate({
          displayName: 'AMARETTO · Fabbri Cream · Chilled · 0004306',
          originalName: 'delipasta_amaretto_fabbri_0004306',
          canonicalFamily: null,
          category: 'dairy',
          productForm: 'liquid',
        }),
      ),
    ).toBe(false);
    expect(
      isHardCompatibleReplacementCandidate(
        context,
        candidate({
          displayName: 'WHIPPING CREAM · Tesco Cream · Chilled',
          canonicalFamily: null,
          category: 'dairy',
          productForm: 'fresh',
        }),
      ),
    ).toBe(true);
  });
});
