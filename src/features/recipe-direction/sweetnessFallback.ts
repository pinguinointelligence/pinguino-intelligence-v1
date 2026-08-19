import type { RecipeInput } from '@/engine';
import type { RecipeDirectionAssessment } from './recipeDirectionAssessment';

/** Verified Mapper identity. This is recommendation provenance only: the UI
 * never inserts or mutates an ingredient from this helper. */
export const VERIFIED_FRUCTOSE_MAPPER_ID = 'PI-ING-000496';

export interface SweetnessFallbackCandidate {
  directionAssessment?: RecipeDirectionAssessment;
  proposedInput: RecipeInput;
}

/**
 * A fructose suggestion is appropriate only after the canonical solver has
 * proven that the requested sweetness is still below its preference band and
 * the verified Fructose product is not already present. Every technical band
 * remains authoritative and a new Preview is mandatory.
 */
export function maySuggestVerifiedFructose(candidate: SweetnessFallbackCandidate): boolean {
  const sweetnessStillBelow = candidate.directionAssessment?.residuals.some(
    (residual) => residual.axis === 'sweetness' && !residual.reached && residual.side === 'below',
  );
  if (!sweetnessStillBelow) return false;

  return !candidate.proposedInput.items.some((item) => {
    const canonicalId = item.ingredient.canonical_ingredient_id ?? item.ingredient.id;
    return canonicalId === VERIFIED_FRUCTOSE_MAPPER_ID;
  });
}
