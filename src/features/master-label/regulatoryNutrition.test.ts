import { describe, expect, it } from 'vitest';
import type { LabelNutritionPer100g } from '@/data/label/nutritionLabel';
import {
  assessCanadaFop,
  canadaNftFormatIssues,
  canadaReferenceAmountG,
  resolveUsServingPlan,
  resolveUsFormatFamily,
  roundCanadaCalories,
  roundCanadaCholesterolMg,
  roundCanadaFatGrams,
  roundCanadaIronMg,
  roundCanadaMg,
  roundCanadaPotassiumCalciumMg,
  roundCanadaProteinGrams,
  roundUsCalciumMg,
  roundUsCalories,
  roundUsCholesterolMg,
  roundUsFatGrams,
  roundUsIronMg,
  roundUsPotassiumMg,
  roundUsSodiumMg,
  roundUsVitaminDMcg,
  roundUsVitaminMineralPercentDv,
  roundUsWholeGram,
  regulatoryNutritionReadiness,
  usServingAndFormatIssues,
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
  energyKjPer100g: 920,
  energyAuthority: 'market_factors',
  servingDescription: { en: '1 cup', fr: '1 tasse' },
  servingQuantityG: 100,
  servingVolumeMl: 188,
  servingsPerContainer: 4,
  productDensityGPerMl: 100 / 188,
  transFatGPer100g: 0,
  cholesterolMgPer100g: 30,
  sodiumMgPer100g: 200,
  addedSugarsGPer100g: 10,
  vitaminDMcgPer100g: 1,
  calciumMgPer100g: 100,
  ironMgPer100g: 1,
  potassiumMgPer100g: 200,
  usRaccVolumeMl: 160,
  usFormatFamily: 'auto',
  canadaProductForm: 'tub',
  canadaReferenceAmountMl: 188,
  canadaReferenceAmountG: 100,
  canadaFormatFamily: 'bilingual_standard',
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
        facts({
          servingQuantityG: 30,
          canadaReferenceAmountG: 30,
          canadaReferenceAmountMl: 30,
        }),
      ).thresholdPercentDv,
    ).toBe(10);
    expect(
      assessCanadaFop(
        nutrition,
        facts({
          servingQuantityG: 200,
          canadaReferenceAmountG: 200,
          canadaReferenceAmountMl: 200,
          canadaFopProductClass: 'main_dish',
        }),
      ).thresholdPercentDv,
    ).toBe(30);
  });

  it('derives the Canadian tub reference mass from the official 188 mL amount and density', () => {
    expect(
      canadaReferenceAmountG(facts({ canadaReferenceAmountG: null, productDensityGPerMl: 0.625 })),
    ).toBeCloseTo(117.5, 6);
  });

  it('requires the Canadian serving to use 188 mL while retaining mass only for nutrient math', () => {
    const valid = facts({
      servingQuantityG: 117.5,
      servingVolumeMl: 188,
      productDensityGPerMl: 0.625,
      canadaReferenceAmountG: null,
    });
    expect(regulatoryNutritionReadiness('CA', nutrition, valid, ['en', 'fr']).ready).toBe(true);
    const wrongMetric = regulatoryNutritionReadiness(
      'CA',
      nutrition,
      { ...valid, servingVolumeMl: 160 },
      ['en', 'fr'],
    );
    expect(wrongMetric.missing).toContain(
      'Canadian serving size musi używać reference amount 188 mL.',
    );
  });

  it('implements the current FDA rounding buckets and RACC package format decision', () => {
    expect(roundUsCalories(4.9)).toBe(0);
    expect(roundUsCalories(47)).toBe(45);
    expect(roundUsCalories(227)).toBe(230);
    expect(roundUsFatGrams(0.49)).toBe(0);
    expect(roundUsFatGrams(2.26)).toBe(2.5);
    expect(roundUsCholesterolMg(3)).toBe('<5');
    expect(roundUsSodiumMg(137)).toBe(135);
    expect(roundUsWholeGram(0.8)).toBe('<1');
    expect(roundUsVitaminDMcg(1.26)).toBe(1.3);
    expect(roundUsCalciumMg(264)).toBe(260);
    expect(roundUsIronMg(1.56)).toBe(1.6);
    expect(roundUsPotassiumMg(235)).toBe(240);
    expect(roundUsVitaminMineralPercentDv(235, 4700)).toBe(6);
    expect(roundUsVitaminMineralPercentDv(8, 18)).toBe(45);
    expect(
      resolveUsFormatFamily(facts({ productDensityGPerMl: 0.625, usRaccVolumeMl: 160 }), 250),
    ).toBe('dual_column');
  });

  it('enforces the FDA package-to-RACC serving and dual-column transitions', () => {
    const input = facts({
      productDensityGPerMl: 0.625,
      servingQuantityG: 100,
      servingVolumeMl: 160,
      servingsPerContainer: 2.5,
      usRaccVolumeMl: 160,
    });
    expect(resolveUsServingPlan(input, 150)).toMatchObject({
      state: 'single_serving',
      requiredServingG: 150,
      expectedServingsPerContainer: 1,
      requiredFormat: 'standard',
    });
    expect(resolveUsServingPlan(input, 250)).toMatchObject({
      state: 'dual_column',
      requiredServingG: 100,
      expectedServingsPerContainer: 2.5,
      requiredFormat: 'dual_column',
    });
    expect(usServingAndFormatIssues(input, 250, 200)).toEqual([]);
    expect(usServingAndFormatIssues({ ...input, usFormatFamily: 'standard' }, 250, 200)).toContain(
      'Opakowanie 200–300% RACC wymaga FDA dual-column per serving / per container.',
    );
    expect(
      usServingAndFormatIssues(
        {
          ...input,
          servingQuantityG: 100,
          servingsPerContainer: 4,
          usFormatFamily: 'dual_column',
        },
        400,
        200,
      ),
    ).toContain('Dual-column jest właściwy wyłącznie dla opakowania 200–300% RACC.');
  });

  it('fails closed when the implemented Canadian Figure 3.4(B) exceeds 15% ADS', () => {
    expect(canadaNftFormatIssues(facts(), 200)).toEqual([]);
    expect(canadaNftFormatIssues(facts(), 100)).toContain(
      'Bilingual NFT Figure 3.4(B) zajmuje więcej niż 15% ADS; wybierz większe opakowanie albo zatwierdzoną ścieżkę małego opakowania.',
    );
    expect(canadaNftFormatIssues(facts(), null)).toContain(
      'Brak potwierdzonej kanadyjskiej available display surface (ADS).',
    );
  });

  it('implements Canadian nutrient-specific rounding buckets without inferring free claims', () => {
    expect(roundCanadaCalories(4.4)).toBe(4);
    expect(roundCanadaCalories(47)).toBe(45);
    expect(roundCanadaCalories(227)).toBe(230);
    expect(roundCanadaFatGrams(0.34)).toBe(0.3);
    expect(roundCanadaFatGrams(2.26)).toBe(2.5);
    expect(roundCanadaFatGrams(8.6)).toBe(9);
    expect(roundCanadaMg(3.4)).toBe(3);
    expect(roundCanadaCholesterolMg(3)).toBe(5);
    expect(roundCanadaPotassiumCalciumMg(44)).toBe(40);
    expect(roundCanadaPotassiumCalciumMg(163)).toBe(175);
    expect(roundCanadaPotassiumCalciumMg(277)).toBe(300);
    expect(roundCanadaIronMg(0.34)).toBe(0.3);
    expect(roundCanadaIronMg(1.13)).toBe(1.25);
    expect(roundCanadaProteinGrams(0.34)).toBe(0.3);
  });

  it('honours documented exemptions but never treats unresolved facts as safe', () => {
    expect(assessCanadaFop(nutrition, facts({ canadaFopExemption: 'exempt' })).state).toBe(
      'exempt',
    );
    expect(assessCanadaFop(nutrition, facts({ servingQuantityG: null })).state).toBe('unresolved');
  });

  it('requires the complete bilingual Canada data set and exemption rationale without inventing a servings-count duty', () => {
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
        'Brak opisu porcji we wszystkich wymaganych językach.',
        'Brak udokumentowanej podstawy wyjątku FOP.',
      ]),
    );
    expect(incomplete.missing).not.toContain('Brak liczby porcji w opakowaniu.');
  });
});
