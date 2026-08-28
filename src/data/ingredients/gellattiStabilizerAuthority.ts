/**
 * Exact owner authority for PI-ING-002114. This is the canonical Mapper
 * product itself, never an overlay or a substitute identity.
 *
 * The technical composition is the direct weighted result of the three
 * canonical constituent rows. Dosage is product-owned, profile-specific
 * information and must never fall back to standalone Tara/LBG/Guar windows.
 */

export const GELLATTI_STABILIZER_MAPPER_ID = 'PI-ING-002114' as const;

export type GellattiStabilizerDosageProfile = 'STANDARD' | 'SORBET' | 'CHOCOLATE' | 'EGG';

export const GELLATTI_STABILIZER_AUTHORITY = Object.freeze({
  mapperId: GELLATTI_STABILIZER_MAPPER_ID,
  internalName: 'gellatti_stabilizer',
  displayName: 'GELLATTI STABILIZER · Gellatti Stabilizer Blend · Dry',
  brand: 'Gellatti',
  supplier: 'Gellatti',
  country: 'Spain',
  physicalForm: 'dry',
  productRole: 'BASE_ONLY',
  toppingCapable: false,
  constituents: [
    { mapperId: 'PI-ING-000492', name: 'Tara gum (E417)', fraction: 0.6, gramsPerKg: 600 },
    {
      mapperId: 'PI-ING-000475',
      name: 'Locust bean gum (E410)',
      fraction: 0.25,
      gramsPerKg: 250,
    },
    { mapperId: 'PI-ING-000472', name: 'Guar gum (E412)', fraction: 0.15, gramsPerKg: 150 },
  ],
  compositionPer100g: {
    waterPercent: 7.1625,
    totalSolidsPercent: 92.8375,
    dryMatterPercent: 92.8375,
    fatPercent: 0.5375,
    proteinPercent: 2.9985,
    carbohydratePercent: 13.17,
    totalSugarsPercent: 0,
    sucrosePercent: 0,
    dextrosePercent: 0,
    glucosePercent: 0,
    fructosePercent: 0,
    lactosePercent: 0,
    polyolPercent: 0,
    fiberPercent: 74.315,
    saltPercent: 0,
    alcoholPercent: 0,
    pod: 0,
    pac: 0,
    kcal: 192,
  },
  allergens: [] as readonly string[],
  process: {
    classification: 'HEAT',
    premix: 'dry_ingredients',
    hydrationTempMinC: 80,
    hydrationTempMaxC: 85,
    coldProcessEligible: false,
  },
  dosageGPerKg: {
    STANDARD: 2.3,
    SORBET: 2.8,
    CHOCOLATE: 2.5,
    EGG: 1.8,
  } satisfies Readonly<Record<GellattiStabilizerDosageProfile, number>>,
  productBehavior: {
    processScope: 'BASE_FORMULATION',
    mainClassification: 'STANDARD_ONLY',
    behaviorRole: 'STRUCTURAL_ONLY',
    toppingEligibility: 'blocked',
    productionEligibility: 'eligible_with_heat_process_evidence',
    labelIdentity: GELLATTI_STABILIZER_MAPPER_ID,
  },
  referenceProcurementCost: {
    amountPerKg: 65.45,
    currency: 'PLN',
    provenance: 'owner procurement / weighted raw-material cost',
    customerPrice: false,
  },
  provenance: {
    sourceType: 'OWNER_FORMULATION',
    compositionAuthority: 'Gellatti owner formula',
  },
} as const);

/** Exact proportional owner dosage. No rounding is performed here. */
export function gellattiStabilizerDosageGrams(
  profile: GellattiStabilizerDosageProfile,
  batchGrams: number,
): number {
  if (!Number.isFinite(batchGrams) || batchGrams < 0) {
    throw new RangeError('Gellatti Stabilizer batch grams must be finite and non-negative.');
  }
  return (GELLATTI_STABILIZER_AUTHORITY.dosageGPerKg[profile] * batchGrams) / 1_000;
}
