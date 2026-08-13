import type { MainEnvelopePolicy, ProductBehaviorRegistry } from './contracts';

const dairy = (
  policyId: string,
  familyId: string,
  formId: string,
  ecoFloorPercent: number,
  optimalCeilingPercent: number,
  hardLimitPercent: number,
  warnings: readonly string[] = [],
  subfamilyId: string | null = null,
): MainEnvelopePolicy => ({
  policyId,
  policyVersion: 'owner-provisional-v2-2026-08-12',
  taxonomyVersion: 'pinguino-product-taxonomy-v1',
  familyId,
  subfamilyId,
  formId,
  productProfiles: ['milk_gelato'],
  basis: familyId === 'nut' ? 'NUT_EQUIVALENT' : 'FRUIT_EQUIVALENT',
  ecoFloorPercent,
  optimalCeilingPercent,
  hardLimitPercent,
  mainEquivalentFactor: 1,
  requiresLiquidDairyCarrier: true,
  liquidDairyCarrierFloorPercent: 30,
  approvedMixedFamilyIds: [],
  evidenceStatus: 'owner_provisional',
  source: 'owner-unified-product-intelligence-2026-08-12',
  warnings,
});

/**
 * Initial family/form policies supplied by the owner. Exact-Mapper Sorbet and
 * Vegan fixture policies live in the server registry because this legacy
 * in-memory shape cannot represent an exact ingredient identity. Protein
 * flavour envelopes remain blocked until sensory Main calibration exists.
 */
export const DEFAULT_PRODUCT_BEHAVIOR_REGISTRY: ProductBehaviorRegistry = {
  taxonomyVersion: 'pinguino-product-taxonomy-v1',
  policies: [
    dairy('main-fruit-fresh-dairy', 'fruit', 'fresh', 20, 35, 45),
    dairy('main-fruit-puree-dairy', 'fruit', 'puree', 20, 35, 45),
    dairy('main-berry-fresh-dairy', 'fruit', 'fresh', 25, 35, 45, [], 'berry'),
    dairy('main-berry-puree-dairy', 'fruit', 'puree', 25, 35, 45, [], 'berry'),
    dairy('main-kiwi-fresh-dairy', 'fruit', 'fresh', 10, 15, 20, [], 'kiwi'),
    dairy('main-banana-fresh-dairy', 'fruit', 'fresh', 10, 20, 30, [], 'banana'),
    dairy(
      'main-pure-nut-paste-dairy',
      'nut',
      'pure_nut_paste',
      8,
      15,
      15,
      ['Diluted or sweetened compounds require a separate flavour-equivalent policy.'],
    ),
  ],
};

export function validateProductBehaviorRegistry(
  registry: ProductBehaviorRegistry,
): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  for (const policy of registry.policies) {
    if (ids.has(policy.policyId)) issues.push(`duplicate_policy:${policy.policyId}`);
    ids.add(policy.policyId);
    if (!(policy.ecoFloorPercent >= 0)) issues.push(`invalid_floor:${policy.policyId}`);
    if (policy.ecoFloorPercent > policy.optimalCeilingPercent) {
      issues.push(`floor_above_ceiling:${policy.policyId}`);
    }
    if (policy.optimalCeilingPercent > policy.hardLimitPercent) {
      issues.push(`ceiling_above_hard_limit:${policy.policyId}`);
    }
    if (!(policy.mainEquivalentFactor > 0)) {
      issues.push(`invalid_equivalent_factor:${policy.policyId}`);
    }
  }
  return issues;
}

export function findMainEnvelopePolicy(input: {
  registry: ProductBehaviorRegistry;
  policyId: string | null;
  familyId: string | null;
  subfamilyId?: string | null;
  formId: string | null;
  productProfile: MainEnvelopePolicy['productProfiles'][number];
}): MainEnvelopePolicy | null {
  if (!input.policyId || !input.familyId || !input.formId) return null;
  return input.registry.policies.find((policy) =>
    policy.policyId === input.policyId &&
    policy.familyId === input.familyId &&
    (policy.subfamilyId === null || policy.subfamilyId === (input.subfamilyId ?? null)) &&
    policy.formId === input.formId &&
    policy.productProfiles.includes(input.productProfile),
  ) ?? null;
}
