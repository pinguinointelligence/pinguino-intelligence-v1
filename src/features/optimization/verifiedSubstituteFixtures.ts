/**
 * Deterministic verified-substitute fixtures (Spine Slice 22) — used ONLY by
 * tests, the DEV preview page and the DEV-only Studio select. Literature-value
 * compositions; no product DB, no Mapper, no writes.
 */
import type { IngredientComponentProfile } from '@/engine';
import type { VerifiedSubstituteContract } from './verifiedSubstituteContract';

/** Raspberry purée — literature values (water+solids = 100). */
export const RASPBERRY_COMPOSITION: IngredientComponentProfile = {
  water_percent: 85.7,
  solids_percent: 14.3,
  fat_percent: 0.7,
  protein_percent: 1.2,
  carbohydrate_percent: 11.9,
  sugar_percent: 4.4,
  sucrose_percent: 0.2,
  glucose_percent: 1.9,
  dextrose_percent: 0,
  fructose_percent: 2.3,
  lactose_percent: 0,
  polyol_percent: 0,
  fiber_percent: 6.5,
  salt_percent: 0.01,
  alcohol_percent: 0,
  kcal_per_100g: 52,
};

/** The SAFE case: verified same-family fruit substitute for the sorbet hero. */
export const raspberrySubstituteContract = (
  over: Partial<VerifiedSubstituteContract> = {},
): VerifiedSubstituteContract => ({
  lineId: 'strawberry',
  originalIngredientName: 'Strawberry',
  originalFamily: 'fruit',
  substituteId: 'raspberry-puree-ref',
  substituteName: 'Raspberry puree',
  substituteFamily: 'fruit',
  engineCategory: 'fruit',
  composition: { ...RASPBERRY_COMPOSITION },
  provenance: { source: 'internal_reference_catalog', verification: 'verified_reference' },
  substitutesHeroLine: true, // strawberry IS the sorbet hero — identity-change warning
  ...over,
});

/** Build the raspberry contract against an arbitrary recipe line (DEV Studio select). */
export const raspberryContractForLine = (
  lineId: string,
  originalIngredientName: string,
): VerifiedSubstituteContract =>
  raspberrySubstituteContract({
    lineId,
    originalIngredientName,
    originalFamily: null, // unknown for live Studio lines — never guessed
    substitutesHeroLine: false,
  });

/* Blocked variants — each isolates ONE gate. */

export const dairySubstituteContract = (): VerifiedSubstituteContract =>
  raspberrySubstituteContract({
    substituteId: 'cream-30-ref',
    substituteName: 'Cream 30%',
    substituteFamily: 'cream',
    engineCategory: 'dairy',
    isDairy: true,
    composition: {
      ...RASPBERRY_COMPOSITION,
      water_percent: 63.4,
      solids_percent: 36.6,
      fat_percent: 30,
      protein_percent: 2.3,
      lactose_percent: 3.3,
      fiber_percent: 0,
      kcal_per_100g: 292,
    },
  });

export const allergenSubstituteContract = (): VerifiedSubstituteContract =>
  raspberrySubstituteContract({
    substituteId: 'mango-passion-ref',
    substituteName: 'Mango-passion blend (nut traces)',
    containsAllergens: true,
  });

export const alcoholSubstituteContract = (): VerifiedSubstituteContract =>
  raspberrySubstituteContract({
    substituteId: 'macerated-berry-ref',
    substituteName: 'Macerated berries (alcohol)',
    containsAlcohol: true,
  });

export const sweetenerSubstituteContract = (): VerifiedSubstituteContract =>
  raspberrySubstituteContract({
    lineId: 'sucrose',
    originalIngredientName: 'Sucrose',
    originalFamily: 'sucrose',
    substituteId: 'polyol-blend-ref',
    substituteName: 'Polyol sweetener blend',
    substituteFamily: 'sucrose',
    engineCategory: 'sugar',
    isSweetenerPolyolOrHis: true,
    composition: {
      ...RASPBERRY_COMPOSITION,
      water_percent: 0.5,
      solids_percent: 99.5,
      fat_percent: 0,
      protein_percent: 0,
      carbohydrate_percent: 99,
      sugar_percent: 0,
      fructose_percent: 0,
      glucose_percent: 0,
      fiber_percent: 0,
      polyol_percent: 99,
      salt_percent: 0,
      kcal_per_100g: 240,
    },
  });

export const unverifiedSubstituteContract = (): VerifiedSubstituteContract =>
  raspberrySubstituteContract({
    provenance: {
      source: 'internal_reference_catalog',
      verification: 'pending_review' as VerifiedSubstituteContract['provenance']['verification'],
    },
  });

export const mapperSourcedSubstituteContract = (): VerifiedSubstituteContract =>
  raspberrySubstituteContract({
    provenance: { source: 'mapper_product_row', verification: 'verified_reference' },
  });

export const piCalculatedSubstituteContract = (): VerifiedSubstituteContract =>
  raspberrySubstituteContract({
    provenance: { source: 'pi_calculated_product', verification: 'verified_reference' },
  });

export const missingCompositionSubstituteContract = (): VerifiedSubstituteContract =>
  raspberrySubstituteContract({
    composition: { ...RASPBERRY_COMPOSITION, water_percent: Number.NaN },
  });
