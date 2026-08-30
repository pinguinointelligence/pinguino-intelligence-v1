/**
 * §31/§41/§48 — HOME profile ↔ the canonical product family. PURE.
 *
 * The four HOME choices are NOT a new vocabulary: they are exactly the existing
 * `VisibleProductType` union that `newRecipeStarter`, `recipeStore` and the account
 * defaults already speak. This file is a one-to-one name map and nothing else, so
 * HOME can never introduce a fifth profile or re-point an existing one.
 */
import type { VisibleProductType } from '@/features/studio/productType';
import type { IntentProfile } from './homeIntentParsing';

const TO_VISIBLE: Readonly<Record<IntentProfile, VisibleProductType>> = Object.freeze({
  gelato: 'gelato',
  sorbet: 'sorbet',
  vegan: 'vegan',
  protein: 'protein',
});

const FROM_VISIBLE: Readonly<Record<VisibleProductType, IntentProfile>> = Object.freeze({
  gelato: 'gelato',
  sorbet: 'sorbet',
  vegan: 'vegan',
  protein: 'protein',
});

export const visibleProductTypeFor = (profile: IntentProfile): VisibleProductType =>
  TO_VISIBLE[profile];

export const intentProfileFor = (visible: VisibleProductType): IntentProfile =>
  FROM_VISIBLE[visible];

/** Display order of the four choices (§41). */
export const HOME_PROFILE_ORDER: readonly IntentProfile[] = [
  'gelato',
  'sorbet',
  'protein',
  'vegan',
];
