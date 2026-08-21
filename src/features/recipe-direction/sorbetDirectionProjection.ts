import { projectSorbetDirectionCandidate, type RecipeInput } from '@/engine';
import { buildRecipeDirectionPlan } from './recipeDirectionTargets';

/**
 * Exact, closed-form Sorbet Direction projection for the canonical
 * water+sucrose+freezing-control scaffold. Main, Inulin and stabilizer grams
 * remain byte-exact. It is only a fast candidate generator: the normal Engine,
 * hard bands, constraints and Preview/Apply gates still decide acceptance.
 */
export function projectSorbetExactDirectionCandidate(input: RecipeInput): RecipeInput | null {
  const plan = buildRecipeDirectionPlan(input);
  const podCenter = plan.axes.find((axis) => axis.axis === 'sweetness')?.targetCenter ?? null;
  const npacCenter = plan.axes.find((axis) => axis.axis === 'softness')?.targetCenter ?? null;
  if (podCenter === null || npacCenter === null) return null;
  return projectSorbetDirectionCandidate(input, { podCenter, npacCenter });
}
