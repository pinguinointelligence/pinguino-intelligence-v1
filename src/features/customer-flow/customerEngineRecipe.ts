/**
 * Customer flow → REAL Engine bridge.
 *
 * Drives the SAME locked starter-template path the studio assistant uses
 * (`buildStarterRecipeFromIntent` → real `calculateRecipe`), from the customer
 * flow state. This replaces the hardcoded preview skeleton with a real Engine
 * result for the profiles that have a safe reference template (standard_gelato,
 * chocolate_gelato). It invents nothing: sorbet / vegan / protein and any
 * incomplete state resolve to an honest not-calculated reason, never a fake recipe.
 *
 *  - profile comes from the INTENT (internal chocolate routing preserved);
 *  - temperature comes from the selected SERVING MODE (the six-mode matrix);
 *  - batch comes from resolveBatch (Ninja preset / text / explicit);
 *  - ingredient values come from the local demo/reference catalog (no backend).
 *
 * Pure: no IO, no persistence — an in-memory snapshot only.
 */
import { normalizeRecipeIntent, type NormalizedRecipeIntent } from '@/spine';
import {
  buildStarterRecipeFromIntent,
  type IntentRecipeDraft,
} from '@/features/studioFlow/intentRecipeDraft';
import type { CustomerFlowState } from './customerFlow';
import { resolveBatch, resolveProductType, resolveServingRoute } from './customerFlow';
import { CUSTOMER_TYPE_TO_SPINE_PROFILE_INPUT } from './types';

/** Why a real calculated recipe is (not) available for the current customer state. */
export type CustomerEngineReason =
  | 'ok' // a real calculateRecipe result exists
  | 'incomplete' // type / mode / batch not resolved yet
  | 'profile_unsupported' // e.g. protein — honest gap, no engine profile
  | 'no_template'; // sorbet / vegan — no safe reference base yet (never faked)

export interface CustomerEngineRecipe {
  /** The real starter draft (recipeInput + real calculateRecipe metrics), or null. */
  draft: IntentRecipeDraft | null;
  /** True only when a real Engine result exists (`draft.status === 'ready'`). */
  calculated: boolean;
  reason: CustomerEngineReason;
}

const NOT_BUILT = (reason: CustomerEngineReason): CustomerEngineRecipe => ({
  draft: null,
  calculated: false,
  reason,
});

/**
 * Build the REAL Engine recipe for the current customer flow, or an honest
 * not-calculated result. Never fabricates a recipe or a metric.
 */
export function buildCustomerEngineRecipe(state: CustomerFlowState): CustomerEngineRecipe {
  const type = resolveProductType(state);
  const route = resolveServingRoute(state);
  const batch = resolveBatch(state);

  // The internal engine profile must be resolved (protein / unknown → not built).
  if (type.internalProfile === null) {
    return NOT_BUILT(type.status === 'unsupported' ? 'profile_unsupported' : 'incomplete');
  }

  // Recompute the normalized intent from the raw text + explicit type, then override the
  // engine profile (internal chocolate routing) and the temperature (from the serving mode).
  const base = normalizeRecipeIntent({
    input: {
      ...(state.rawText !== '' ? { flavorText: state.rawText } : {}),
      ...(state.explicitType !== null
        ? { productProfile: CUSTOMER_TYPE_TO_SPINE_PROFILE_INPUT[state.explicitType] }
        : {}),
    },
  });
  const intent: NormalizedRecipeIntent = {
    ...base,
    productProfile: type.internalProfile,
    ...(route.temperatureC !== null ? { servingTemperatureC: route.temperatureC } : {}),
  };

  const complete = route.temperatureC !== null && batch.batchGrams !== null;
  const draft = buildStarterRecipeFromIntent(intent, batch.batchGrams, {
    complete,
    missingRequired: [],
  });

  if (draft.status === 'ready' && draft.recipeInput !== null) {
    return { draft, calculated: true, reason: 'ok' };
  }
  return { draft, calculated: false, reason: draft.status === 'not_supported' ? 'no_template' : 'incomplete' };
}
