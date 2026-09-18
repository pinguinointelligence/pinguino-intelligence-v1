import type { RecipeInput } from '@/engine';
import type { RecipeCompositionMetadata } from '@/features/recipe-composition/recipeCompositionPersistence';
import { preparationOrderedBaseLines } from './preparationPlan';
import type { ProductionSession } from './productionSession';

/** Presentation-only pointer to the next physical ingredient task, in preparation-plan order. */
export function nextProductionLineId(
  session:
    | (Pick<ProductionSession, 'status' | 'lines'> & {
        plannedInput?: Pick<RecipeInput, 'items'>;
        plannedComposition?: Pick<RecipeCompositionMetadata, 'behaviorSnapshots'>;
      })
    | null,
  deviationDecisionUnresolved: boolean,
): string | null {
  if (!session || session.status !== 'in_progress' || deviationDecisionUnresolved) return null;
  return preparationOrderedBaseLines(session).find((line) => !line.confirmed)?.lineId ?? null;
}
