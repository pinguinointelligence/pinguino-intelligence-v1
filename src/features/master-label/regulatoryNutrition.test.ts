import { describe, expect, it } from 'vitest';
import type { LabelNutritionPer100g } from '@/data/label/nutritionLabel';
import {
  assessCanadaFop,
  regulatoryNutritionReadiness,
  type RegulatoryNutritionInputs,
} from './regulatoryNutrition';

const nutrition: LabelNutritionPer100g = {
  kcal: 220,
  fat_g: 12,
  saturated_fat_g: 10,
  carbohydrate_g: 25,
  sugars_g: 20,
  protein_g: 4,
  salt_g: 0.5,
  fiber_g: 1,
  alcohol_g: 0,
};

const facts = (overrides: Partial<RegulatoryNutritionInputs> = {}): RegulatoryNutritionInputs => ({
  servingDescription: { en: '1 cup', fr: '1 tasse' },
  servingQuantityG: 100,
  servingsPerContainer: 4,
  transFatGPer100g: 0,
  cholesterolMgPer100g: 30,
  sodiumMgPer100g: 200,
  addedSugarsGPer100g: 10,
  vitaminDMcgPer100g: 1,
  calciumMgPer100g: 100,
  ironMgPer100g: 1,
  potassiumMgPer100g: 200,
  canadaReferenceAmountG: 100,
  canadaFopProductClass: 'general_food',
  canadaFopExemption: 'none',
  canadaFopExemptionReason: '',
  canadaFopAssetId: null,
  ...overrides,
});

describe('market nutrition and Canada FOP authority', () => {
  it('uses the general-food 15% DV threshold and the larger of serving/reference amount', () => {
    const assessment = assessCanadaFop(
      nutrition,
      facts({ servingQuantityG: 80, canadaReferenceAmountG: 100 }),
    );
    expect(assessment).toMatchObject({
      state: 'required',
      thresholdPercentDv: 15,
      basisQuantityG: 100,
      highIn: ['saturated_fat', 'sugars'],
    });
  });

  it('uses 10% for a reference amount at or below 30 g and 30% for a main dish', () => {
    expect(
      assessCanadaFop(
        { ...nutrition, saturated_fat_g: 2, sugars_g: 20 },
        facts({ servingQuantityG: 30, canadaReferenceAmountG: 30 }),
      ).thresholdPercentDv,
    ).toBe(10);
    expect(
      assessCanadaFop(
        nutrition,
        facts({
          servingQuantityG: 200,
          canadaReferenceAmountG: 200,
          canadaFopProductClass: 'main_dish',
        }),
      ).thresholdPercentDv,
    ).toBe(30);
  });

  it('honours documented exemptions but never treats unresolved facts as safe', () => {
    expect(assessCanadaFop(nutrition, facts({ canadaFopExemption: 'exempt' })).state).toBe(
      'exempt',
    );
    expect(assessCanadaFop(nutrition, facts({ servingQuantityG: null })).state).toBe('unresolved');
  });

  it('requires the complete bilingual Canada data set and an exemption rationale when used', () => {
    expect(regulatoryNutritionReadiness('CA', nutrition, facts(), ['en', 'fr']).ready).toBe(true);
    const incomplete = regulatoryNutritionReadiness(
      'CA',
      nutrition,
      facts({
        servingDescription: { en: '1 cup' },
        servingsPerContainer: null,
        canadaFopExemption: 'exempt',
      }),
      ['en', 'fr'],
    );
    expect(incomplete.ready).toBe(false);
    expect(incomplete.missing).toEqual(
      expect.arrayContaining([
        'Brak liczby porcji w opakowaniu.',
        'Brak opisu porcji we wszystkich wymaganych językach.',
        'Brak udokumentowanej podstawy wyjątku FOP.',
      ]),
    );
  });
});
