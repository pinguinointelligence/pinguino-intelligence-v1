import type { EngineIngredient } from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import { coreIdentityByMapperId } from './canonicalIngredientIdentity';
import { canonicalMapperComposition } from './canonicalToolboxCompositions';

/**
 * Materialise an exact Mapper identity from the immutable toolbox snapshot.
 *
 * This is deliberately an exact-id bridge for the public HOME runtime. It never
 * searches, ranks, translates, or guesses a product, and returns null for any id
 * outside the closed canonical toolbox registry.
 */
export function materializeCanonicalToolboxIngredient(
  mapperId: string,
): EngineIngredient | null {
  const identity = coreIdentityByMapperId(mapperId);
  const canonical = canonicalMapperComposition(mapperId);
  const basis = identity ? findDemoIngredient(identity.toolboxId) : undefined;
  if (!identity || !canonical || !basis) return null;

  return {
    ...basis,
    id: canonical.mapperId,
    canonical_ingredient_id: canonical.mapperId,
    private_product_id: null,
    identity_provenance: 'mapper',
    name: canonical.displayName,
    composition: { ...canonical.composition },
    pod_value: canonical.pod_value,
    pac_value: canonical.pac_value,
    de_value: canonical.de_value,
    cost_per_kg: canonical.cost_per_kg,
    cost_currency: canonical.cost_currency,
    confidence_score: canonical.confidence_score,
    source_type: canonical.verified ? 'verified_db' : 'ai_estimated',
    is_verified: canonical.verified,
  };
}
