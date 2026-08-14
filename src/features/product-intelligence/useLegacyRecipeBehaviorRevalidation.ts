import { useEffect, useRef } from 'react';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useAuthStore } from '@/stores/authStore';
import { useRecipeStore } from '@/stores/recipeStore';
import {
  getEngineApprovedIngredientById,
} from '@/services/ingredients';
import { productBehaviorRequiredLineIds } from './productBehaviorAccess';
import { snapshotServerResolvedProductBehavior } from './productBehaviorResolver';
import {
  resolveProductBehaviorForSelection,
  type ProductBehaviorEntity,
} from '@/services/productIntelligence';

const catalogVersionFromPrivateId = (value: string | undefined): string | null => {
  if (!value) return null;
  const marker = ':version:';
  const index = value.lastIndexOf(marker);
  return index >= 0 && value.slice(index + marker.length).trim()
    ? value.slice(index + marker.length)
    : null;
};

/**
 * Reconstructs missing historical recipe authority in working memory only.
 * The saved historical payload remains immutable; a later Save creates the
 * first modern version carrying these explicit snapshots.
 */
export function useLegacyRecipeBehaviorRevalidation(enabled = true): void {
  const userId = useAuthStore((state) =>
    state.status === 'authed' ? (state.user?.id ?? null) : null,
  );
  const draftContextSeq = useRecipeStore((state) => state.draftContextSeq);
  const inFlightKey = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !userId) return;
    const state = useRecipeStore.getState();
    const required = productBehaviorRequiredLineIds({
      items: state.items,
      toppings: state.toppings,
    })
      .filter((lineId) => state.productBehaviorSnapshots[lineId] === undefined)
      .sort();
    if (required.length === 0) return;
    const key = `${draftContextSeq}:${required.join(',')}`;
    if (inFlightKey.current === key) return;
    inFlightKey.current = key;
    let cancelled = false;

    void Promise.all(required.map(async (lineId) => {
      const current = useRecipeStore.getState();
      const base = current.items.find((item) => item.id === lineId);
      const topping = current.toppings.find((item) => item.id === lineId);
      const ingredient = base?.ingredient ?? topping?.ingredient;
      if (!ingredient) return;
      const catalogVersionId = catalogVersionFromPrivateId(ingredient.private_product_id ?? undefined);
      const entity: ProductBehaviorEntity | null = catalogVersionId
        ? { entityKind: 'catalog_product_version', entityId: catalogVersionId }
        : base
          ? { entityKind: 'mapper', entityId: canonicalIngredientId(base.ingredient) }
          : null;
      if (!entity) return;
      const processScope = base ? 'BASE_FORMULATION' as const : 'POST_PROCESS_ADDON' as const;
      const canonicalRecipe = buildRecipeInput(current);
      const resolved = await resolveProductBehaviorForSelection({
        entity,
        context: {
          accountId: userId,
          productProfile: canonicalRecipe.category,
          temperatureC: current.target_temperature_c,
          mode: current.formulation_strategy,
          processScope,
          requestedRole: base?.lock_type === 'main' ? 'MAIN' : 'STANDARD',
          module: base ? 'BASE_RECIPE' : 'TOPPING',
        },
      }).catch(() => null);
      if (cancelled || !resolved || resolved.state !== 'eligible') return;
      const snapshot = snapshotServerResolvedProductBehavior({ lineId, processScope, resolved });
      const latest = useRecipeStore.getState();
      const historical = latest.savedRecipeId !== null;
      if (base && !historical && entity.entityKind === 'mapper') {
        const row = await getEngineApprovedIngredientById(entity.entityId).catch(() => null);
        if (cancelled || !row) return;
        const currentInput = buildRecipeInput(useRecipeStore.getState());
        const upgraded = {
          ...currentInput,
          items: currentInput.items.map((item) => item.id === lineId
            ? { ...item, ingredient: ingredientRowToEngineIngredient(row) }
            : item),
        };
        const snapshots = {
          ...useRecipeStore.getState().productBehaviorSnapshots,
          [lineId]: snapshot,
        };
        useRecipeStore.getState().applyVerifiedRecipeInput(upgraded, snapshots);
      } else {
        useRecipeStore.getState().setProductBehaviorSnapshot(lineId, {
          ...snapshot,
          resolutionState: historical ? 'LEGACY_RECONSTRUCTED' : 'RESOLVED',
        });
      }
    })).finally(() => {
      if (inFlightKey.current === key) inFlightKey.current = null;
    });

    return () => {
      cancelled = true;
    };
  }, [draftContextSeq, enabled, userId]);
}
