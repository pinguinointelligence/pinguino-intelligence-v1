import type { RecipeItem } from '@/engine';
import type { VeganRecipeEligibilityIssue } from '@/data/ingredients/veganEligibility';
import { findVerifiedVeganFormulationCandidate } from '@/data/ingredients/verifiedVeganToolbox';
import { resolveFunctionalRole, type FunctionalRole } from './ingredientRoles';

export interface VeganSubstitutionRecommendation {
  lineId: string;
  sourceIngredientName: string;
  sourceRole: FunctionalRole;
  candidateIngredientId: string;
  candidateIngredientName: string;
  candidateRole: FunctionalRole;
  requiresReformulation: true;
}

const candidateForRole = (role: FunctionalRole): string | null => {
  if (role === 'primary_liquid') return 'PI-ING-001565';
  if (role === 'dairy_fat') return 'PI-ING-000163';
  if (role === 'milk_solids') return 'PI-ING-000451';
  return null;
};

/** Bounded adapter only: no source line is mutated and no candidate is a 1:1
 * swap. A selected option must enter the normal Vegan formulation Preview. */
export function veganSubstitutionRecommendations(
  items: readonly RecipeItem[],
  issues: readonly VeganRecipeEligibilityIssue[],
): VeganSubstitutionRecommendation[] {
  return issues.flatMap((issue) => {
    const source = items.find((item) => item.id === issue.lineId);
    if (!source) return [];
    const sourceRole = resolveFunctionalRole(source.ingredient);
    const candidateId = candidateForRole(sourceRole);
    if (!candidateId) return [];
    const candidate = findVerifiedVeganFormulationCandidate(candidateId);
    if (!candidate) return [];
    return [{
      lineId: source.id,
      sourceIngredientName: source.ingredient.name,
      sourceRole,
      candidateIngredientId: candidate.id,
      candidateIngredientName: candidate.name,
      candidateRole: resolveFunctionalRole(candidate),
      requiresReformulation: true as const,
    }];
  });
}

export function veganSubstitutionMessagePl(
  recommendations: readonly VeganSubstitutionRecommendation[],
): string {
  if (recommendations.length === 0) return '';
  return (
    ' Dostępne są zweryfikowane kandydatury do pełnego przeliczenia: ' +
    recommendations
      .map((recommendation) =>
        `${recommendation.sourceIngredientName} → ${recommendation.candidateIngredientName}`,
      )
      .join(', ') +
    '. To nie są zamiany 1:1; wymagają osobnego Preview.'
  );
}
