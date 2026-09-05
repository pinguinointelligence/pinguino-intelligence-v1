import type { RecipeInput } from '@/engine';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';

/**
 * Complete test-only frozen ProductBehavior authority. Generic Engine fixtures
 * do not carry server-resolved Main policy, so Main lines receive a permissive
 * calibrated test policy; tests for real published limits overlay their exact
 * persisted policy separately.
 */
export function productionTestComposition(planned: RecipeInput) {
  const behaviorSnapshots = productionTestBehaviorSnapshots(planned);
  const hasMultipleMains = planned.items.filter((item) => item.lock_type === 'main').length > 1;
  for (const item of planned.items) {
    if (item.lock_type !== 'main') continue;
    behaviorSnapshots[item.id] = {
      ...behaviorSnapshots[item.id]!,
      mainCapability: 'MAIN_CAPABLE',
      behaviorRole: 'MAIN_PROFILE_SPECIFIC',
      mainClassification: 'MAIN_PROFILE_SPECIFIC',
      mainAuthority: 'CALIBRATED',
      mainCalibrationLevel: 'FAMILY',
      mainBasis: 'FRUIT_EQUIVALENT',
      mainEquivalentFactor: 1,
      mainPolicyId: 'test-production-main-policy',
      mainPolicyVersion: '1',
      ecoFloorPercent: 0,
      optimalCeilingPercent: 100,
      hardLimitPercent: 100,
      multiMainHardLimitPercent: hasMultipleMains ? 100 : null,
      requiresLiquidDairyCarrier: false,
      liquidDairyCarrierFloorPercent: null,
    };
  }
  return {
    schemaVersion: 1 as const,
    baseScope: 'BASE_FORMULATION' as const,
    baseOrder: planned.items.map((item) => item.id),
    toppings: [],
    behaviorSnapshots,
    migrationAmbiguities: [],
  };
}

export const productionTestBehaviorSnapshots = (planned: RecipeInput) =>
  productBehaviorTestSnapshots(planned);
