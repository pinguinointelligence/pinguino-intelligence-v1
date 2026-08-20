export const OWNER_INULIN_POLICY = Object.freeze({
  policyId: 'gellatti-generic-inulin',
  version: 1,
  provenance: 'owner-approved Gellatti formulation policy',
  mapperIngredientId: 'PI-ING-000456',
  minPercent: 2,
  preferredPercent: 4,
  maxPercent: 8,
  presenceSemantics: 'optional_zero_or_range' as const,
});

export interface OwnerInulinGramBand {
  minGrams: number;
  preferredGrams: number;
  maxGrams: number;
}

export function ownerInulinGramBand(baseGrams: number): OwnerInulinGramBand {
  return {
    minGrams: (baseGrams * OWNER_INULIN_POLICY.minPercent) / 100,
    preferredGrams: (baseGrams * OWNER_INULIN_POLICY.preferredPercent) / 100,
    maxGrams: (baseGrams * OWNER_INULIN_POLICY.maxPercent) / 100,
  };
}

export function ownerInulinPresentDoseIsValid(baseGrams: number, grams: number): boolean {
  const band = ownerInulinGramBand(baseGrams);
  return grams >= band.minGrams && grams <= band.maxGrams;
}
