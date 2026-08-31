/**
 * The SAME ProductBehavior context the Pro builder passes to the canonical picker.
 *
 * Shared by every HOME surface that opens a picker, so the two can never drift. Without
 * it the picker skips `resolveProductBehaviorForSelection` entirely — no snapshot reaches
 * the line and the canonical refusal for an unconfirmable product never runs.
 */
import { useAuthStore } from '@/stores/authStore';
import { useRecipeStore } from '@/stores/recipeStore';

export function useHomeBehaviorContext() {
  const accountId = useAuthStore((state) => state.user?.id ?? null);
  const productProfile = useRecipeStore((state) => state.category);
  const temperatureC = useRecipeStore((state) => state.target_temperature_c);
  const mode = useRecipeStore((state) => state.formulation_strategy);
  return { accountId, productProfile, temperatureC, mode };
}
