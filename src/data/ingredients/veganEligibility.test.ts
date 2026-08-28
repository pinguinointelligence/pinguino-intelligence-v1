import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCsv } from '@/lib/csv';
import {
  assessEngineIngredientVeganEligibility,
  assessMapperVeganEligibility,
  veganRecipeEligibilityIssues,
} from './veganEligibility';

type Evidence = Parameters<typeof assessMapperVeganEligibility>[0];

const evidence = (over: Partial<Evidence> = {}): Evidence => ({
  approved_for_engines: true,
  vegan: 'true',
  dairy_free: 'true',
  allergens: '',
  ingredient_category: 'beverage',
  ingredient_subcategory: 'plant_drink_oat',
  ingredient_name_internal: 'oat_drink',
  ingredient_name_display: 'Oat drink',
  milk_fat_percent: 0,
  non_fat_milk_solids_percent: 0,
  lactose_percent: 0,
  is_active: true,
  ...over,
});

const grid = parseCsv(
  readFileSync(resolve(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'), 'utf8'),
);
const header = grid[0]!;
const rows = grid.slice(1).filter((row) => row.some((cell) => cell !== ''));
const at = (row: string[], name: string): string => row[header.indexOf(name)] ?? '';
const numberOrNull = (value: string): number | null => (value.trim() === '' ? null : Number(value));
const boolean = (value: string): boolean => value.trim().toLowerCase() === 'true';
const tri = (value: string): 'true' | 'false' | 'unknown' => {
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === 'false' ? normalized : 'unknown';
};
const evidenceFromCsv = (row: string[]): Evidence => ({
  approved_for_engines: boolean(at(row, 'approved_for_engines')),
  vegan: tri(at(row, 'vegan')),
  dairy_free: tri(at(row, 'dairy_free')),
  allergens: at(row, 'allergens'),
  ingredient_category: at(row, 'ingredient_category'),
  ingredient_subcategory: at(row, 'ingredient_subcategory'),
  ingredient_name_internal: at(row, 'ingredient_name_internal'),
  ingredient_name_display: at(row, 'ingredient_name_display'),
  milk_fat_percent: numberOrNull(at(row, 'milk_fat_percent')),
  non_fat_milk_solids_percent: numberOrNull(at(row, 'non_fat_milk_solids_percent')),
  lactose_percent: numberOrNull(at(row, 'lactose_percent')),
  is_active: header.includes('is_active') ? boolean(at(row, 'is_active')) : undefined,
});

describe('Vegan eligibility — fail closed', () => {
  it('fails closed instead of throwing for legacy sparse Mapper-compatible rows', () => {
    const sparse = evidence({
      ingredient_category: undefined as unknown as string,
      ingredient_subcategory: undefined as unknown as string,
      ingredient_name_internal: undefined as unknown as string,
      ingredient_name_display: undefined as unknown as string,
      vegan: 'unknown',
    });

    expect(assessMapperVeganEligibility(sparse)).toMatchObject({
      status: 'VEGAN_UNKNOWN',
    });
  });

  it('uses the explicit Vegan flag and Engine approval, not provenance status', () => {
    expect(assessMapperVeganEligibility(evidence()).status).toBe('VEGAN_VERIFIED');
    expect(assessMapperVeganEligibility(evidence({ dairy_free: 'true' })).status).toBe(
      'VEGAN_VERIFIED',
    );
    expect(assessMapperVeganEligibility(evidence({ approved_for_engines: false })).status).toBe(
      'VEGAN_UNKNOWN',
    );
  });

  it.each([
    ['milk', { vegan: 'false', ingredient_category: 'dairy', ingredient_name_display: 'Milk' }],
    ['WPC', { vegan: 'false', ingredient_subcategory: 'wpc', ingredient_name_display: 'WPC 80' }],
    ['honey', { vegan: 'false', ingredient_name_display: 'Honey' }],
  ] as const)('rejects known animal ingredient: %s', (_label, over) => {
    expect(assessMapperVeganEligibility(evidence(over)).status).toBe('VEGAN_FALSE');
  });

  it('quarantines contradictory vegan=true dairy composition', () => {
    const result = assessMapperVeganEligibility(
      evidence({
        ingredient_name_display: 'Contradictory base',
        ingredient_category: 'dairy',
        milk_fat_percent: 3.5,
        lactose_percent: 4.8,
      }),
    );
    expect(result.status).toBe('VEGAN_CONFLICT');
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        'verified_vegan_vs_animal_evidence',
        'milk_fat_present',
        'lactose_present',
      ]),
    );
  });

  it('does not misclassify a verified plant milk or cross-contact allergen note', () => {
    expect(
      assessMapperVeganEligibility(
        evidence({
          ingredient_name_internal: 'coconut_milk',
          ingredient_name_display: 'Coconut milk',
          ingredient_subcategory: 'plant_milk_coconut',
          allergens: 'May contain traces of milk',
        }),
      ).status,
    ).toBe('VEGAN_VERIFIED');
  });

  it('keeps unknown manual Engine ingredients out of auto-formulation', () => {
    const unknown = {
      id: 'manual-mystery',
      name: 'Mystery powder',
      category: 'other' as const,
      composition: {
        water_percent: 0,
        solids_percent: 100,
        fat_percent: 0,
        protein_percent: 0,
        carbohydrate_percent: 0,
        sugar_percent: 0,
        sucrose_percent: 0,
        glucose_percent: 0,
        dextrose_percent: 0,
        fructose_percent: 0,
        lactose_percent: 0,
        polyol_percent: 0,
        fiber_percent: 0,
        salt_percent: 0,
        alcohol_percent: 0,
        kcal_per_100g: 0,
      },
      pod_value: 0,
      pac_value: 0,
      npac_value: null,
      de_value: null,
      cost_per_kg: null,
      confidence_score: 0,
      source_type: 'manual' as const,
      is_verified: false,
    };
    expect(assessEngineIngredientVeganEligibility(unknown).status).toBe('VEGAN_UNKNOWN');
    expect(
      veganRecipeEligibilityIssues([
        { id: 'line-mystery', ingredient: unknown, planned_grams: 10 },
      ]),
    ).toMatchObject([{ status: 'VEGAN_UNKNOWN', lineId: 'line-mystery' }]);
  });

  it('never lets a positive Vegan flag override an explicit animal-origin flag', () => {
    const contradictory = {
      id: 'contradictory-private-product',
      name: 'Contradictory product',
      category: 'other' as const,
      composition: {
        water_percent: 100,
        solids_percent: 0,
        fat_percent: 0,
        protein_percent: 0,
        carbohydrate_percent: 0,
        sugar_percent: 0,
        sucrose_percent: 0,
        glucose_percent: 0,
        dextrose_percent: 0,
        fructose_percent: 0,
        lactose_percent: 0,
        polyol_percent: 0,
        fiber_percent: 0,
        salt_percent: 0,
        alcohol_percent: 0,
        kcal_per_100g: 0,
      },
      pod_value: 0,
      pac_value: 0,
      npac_value: null,
      de_value: null,
      cost_per_kg: null,
      confidence_score: 0,
      source_type: 'external_db' as const,
      is_verified: false,
      identity_provenance: 'private_product' as const,
      flags: {
        is_animal_origin: true,
        vegan_eligibility: 'VEGAN_VERIFIED' as const,
        vegan_eligibility_reasons: ['private_product_vegan_true_and_verified_reference'],
      },
    };
    expect(assessEngineIngredientVeganEligibility(contradictory).status).toBe('VEGAN_CONFLICT');
  });

  it('pins the complete Mapper v1.0 eligibility ledger', () => {
    const counts = {
      VEGAN_VERIFIED: 0,
      VEGAN_FALSE: 0,
      VEGAN_UNKNOWN: 0,
      VEGAN_CONFLICT: 0,
    };
    const conflicts: string[] = [];
    for (const row of rows) {
      const status = assessMapperVeganEligibility(evidenceFromCsv(row)).status;
      counts[status] += 1;
      if (status === 'VEGAN_CONFLICT')
        conflicts.push(`${at(row, 'ingredient_id')}:${at(row, 'ingredient_name_display')}`);
    }
    expect(rows).toHaveLength(2089);
    expect(counts).toEqual({
      VEGAN_VERIFIED: 1276,
      VEGAN_FALSE: 784,
      VEGAN_UNKNOWN: 11,
      VEGAN_CONFLICT: 18,
    });
    expect(conflicts.map((entry) => entry.split(':')[0])).toEqual(
      expect.arrayContaining([
        'PI-ING-000045',
        'PI-ING-000333',
        'PI-ING-000606',
        'PI-ING-000804',
        'PI-ING-000856',
        'PI-ING-001439',
        'PI-ING-001441',
        'PI-ING-001733',
        'PI-ING-001778',
        'PI-ING-002012',
        'PI-ING-002014',
      ]),
    );
    expect(conflicts).toHaveLength(18);
  });
});
