import type { RecipeResult } from '@/engine';
import type { NutritionPer100g } from '@/engine';
import type { AccountLabelProfile } from '@/services/labels/labelRepository';
import type { MarketProfileCode } from './marketProfiles';

/**
 * The DRAFT label — what can be shown truthfully BEFORE Production completes.
 *
 * OWNER DECISION (2026-08-30), an explicit approved divergence from the older
 * V2.1 `pro-label-draft` gate: the workbench shows a live label preview from the
 * moment there is enough recipe data, instead of an empty "finish Production
 * first" panel.
 *
 * WHAT THIS IS NOT:
 *
 *   * It is NOT a second final-label authority. `buildMasterLabelData` remains
 *     the one authority for a real label and is not touched. Nothing here is
 *     used once Production completes — the workbench switches to that authority.
 *   * It does NOT fabricate a completion snapshot. Every field below is read
 *     from something that genuinely exists right now: the account's saved label
 *     profile, and the engine's own current result.
 *   * It performs NO regulatory or nutrition maths. `nutritionPer100g` is the
 *     engine's `nutrition_per_100g` passed through verbatim; ingredients are
 *     ordered by mass, which is an ordering of known numbers, not a legal
 *     determination.
 *
 * Anything that only a completed Production can supply — LOT, production date,
 * the confirmed ingredient declaration, the final nutrition authority — is
 * reported in `pending` so the UI can show it as MISSING. It is never invented.
 */

/** One line of the draft ingredient list, ordered by mass. */
export interface DraftLabelIngredient {
  readonly id: string;
  readonly name: string;
  readonly grams: number;
  /** Share of the batch, for display only. Null when the batch has no mass. */
  readonly percent: number | null;
}

/**
 * Something a real label needs that only a completed Production can supply.
 * These are shown to the reader as outstanding, never filled with a guess.
 */
export type DraftLabelPendingId =
  | 'lot'
  | 'production_date'
  | 'confirmed_ingredients'
  | 'final_nutrition';

export interface DraftLabelPreview {
  readonly kind: 'draft';
  readonly market: MarketProfileCode;
  readonly labelLanguages: readonly string[];
  readonly businessName: string;
  readonly logoPath: string | null;
  readonly operatorName: string;
  readonly operatorAddress: string;
  readonly productName: string | null;
  readonly ingredients: readonly DraftLabelIngredient[];
  /** The engine's own per-100 g figures, unchanged. Null when it has none. */
  readonly nutritionPer100g: NutritionPer100g | null;
  /** Planned batch mass. Not a net quantity — production has not run. */
  readonly plannedBatchG: number | null;
  /** What a final label still needs, and Production has not yet produced. */
  readonly pending: readonly DraftLabelPendingId[];
}

/** A draft is never printable as a final label. Kept next to the model so no
 *  caller has to re-derive the rule. */
export const DRAFT_LABEL_IS_PRINTABLE = false;

export function buildDraftLabelPreview({
  profile,
  result,
  productName,
}: {
  profile: AccountLabelProfile;
  result: RecipeResult;
  productName?: string | null;
}): DraftLabelPreview {
  const totalG = result.total_batch_g > 0 ? result.total_batch_g : null;

  const ingredients: DraftLabelIngredient[] = result.items
    .map((item) => {
      const grams = item.effective_grams;
      return {
        id: item.id,
        name: item.ingredient.name,
        grams,
        percent: totalG === null ? null : (grams / totalG) * 100,
      };
    })
    .filter((line) => line.grams > 0)
    .sort((a, b) => b.grams - a.grams);

  /* LOT, the production date and the CONFIRMED declaration exist only after a
     run. The engine's nutrition is real and current, so it is only pending when
     the engine itself has none. */
  const pending: DraftLabelPendingId[] = ['lot', 'production_date', 'confirmed_ingredients'];
  if (result.nutrition_per_100g === null) pending.push('final_nutrition');

  return {
    kind: 'draft',
    market: profile.market,
    labelLanguages: profile.labelLanguages,
    businessName: profile.businessName,
    logoPath: profile.logoPath,
    operatorName: profile.facilityDefaults.operatorName,
    operatorAddress: profile.facilityDefaults.address,
    productName: productName?.trim() ? productName.trim() : null,
    ingredients,
    nutritionPer100g: result.nutrition_per_100g,
    plannedBatchG: totalG,
    pending,
  };
}

/** The reader-facing name of each outstanding item. */
export const DRAFT_LABEL_PENDING_LABEL: Record<DraftLabelPendingId, string> = {
  lot: 'Numer partii (LOT)',
  production_date: 'Data produkcji',
  confirmed_ingredients: 'Potwierdzone składniki z produkcji',
  final_nutrition: 'Wartości odżywcze',
};
