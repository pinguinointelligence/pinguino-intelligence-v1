import { homeCreatorCopy } from '../homeCreatorCopy';
import type { HomeSweetness } from '../homeSweetness';

/**
 * DESIGN V3.0 HOME (XI): the words under each position of the sweetness rail, also shown
 * as the small mark on the sweetness icon when the choice is not „Optymalne”.
 */
export const HOME_SWEETNESS_STEP: Readonly<Record<HomeSweetness, string>> = {
  less: homeCreatorCopy.recipeScreen.sweetnessStepLess,
  balanced: homeCreatorCopy.recipeScreen.sweetnessStepBalanced,
  sweeter: homeCreatorCopy.recipeScreen.sweetnessStepSweeter,
};
