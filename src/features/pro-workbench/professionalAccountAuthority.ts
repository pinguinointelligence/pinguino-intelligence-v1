/**
 * The canonical Professional authority, resolved in one place.
 *
 * It reads `DEFAULT_NEW_RECIPE_BATCH_G` — which is exactly what
 * `PROFESSIONAL_DEFAULT_BATCH_GRAMS` is DEFINED as in `recipeStore` — rather
 * than that re-export. `newRecipeStarter` and `recipeStore` form a pre-existing
 * module cycle, and in any graph where the starter initialises first the
 * re-exported constant is permanently `undefined`; the starter's own constant
 * never is. Same single authority, read from the side that is always sound.
 *
 * `machineAccountDefault` deliberately imports neither, so the snapshot builder
 * itself stays outside the cycle entirely.
 */
import {
  DEFAULT_NEW_RECIPE_BATCH_G,
  DEFAULT_NEW_RECIPE_SERVING_MODE,
  starterTemperatureForServingMode,
} from '@/features/recipes/newRecipeStarter';
import type { VisibleProductType } from '@/features/studio/productType';
import { professionalAccountDefault } from './machineAccountDefault';
import type { ProfileSettingsSnapshot } from './recipeProfileStore';

/**
 * The Professional snapshot resolver handed to the profile store.
 *
 * The constants are read INSIDE the call, not captured at module init. Because
 * of the pre-existing `newRecipeStarter` ↔ `recipeStore` cycle, a module
 * initialised early in that graph would capture `undefined`; reading at call
 * time — long after every module has finished loading — always sees the real
 * value. A `0` would be silently wrong, so it is refused loudly instead.
 */
export const professionalAccountDefaultSnapshot = (
  visibleProductType: VisibleProductType,
): ProfileSettingsSnapshot => {
  const batchGrams = DEFAULT_NEW_RECIPE_BATCH_G;
  if (!Number.isFinite(batchGrams) || batchGrams <= 0) {
    throw new Error('Professional batch authority is unavailable.');
  }
  return professionalAccountDefault({
    batchGrams,
    servingModeId: DEFAULT_NEW_RECIPE_SERVING_MODE,
    targetTemperatureC: starterTemperatureForServingMode(DEFAULT_NEW_RECIPE_SERVING_MODE),
  })(visibleProductType);
};
