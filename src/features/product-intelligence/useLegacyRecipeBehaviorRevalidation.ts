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
  resolveLegacyRecipeBehaviorForSelection,
} from '@/services/productIntelligence';
import {
  buildRecipeBehaviorAuthority,
  recipeInputFromFrozenBehavior,
} from './recipeBehaviorAuthority';

const catalogReferenceFromPrivateId = (value: string | undefined): {
  productId: string | null;
  productVersionId: string | null;
} => {
  if (!value) return { productId: null, productVersionId: null };
  const marker = ':version:';
  const index = value.lastIndexOf(marker);
  const productVersionId = index >= 0 && value.slice(index + marker.length).trim()
    ? value.slice(index + marker.length)
    : null;
  const productToken = index >= 0 ? value.slice(0, index) : value;
  const productId = productToken.startsWith('catalog:')
    ? productToken.slice('catalog:'.length)
    : productToken;
  return { productId: productId || null, productVersionId };
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
  const draftRevision = useRecipeStore((state) => state.draftRevision);
  const inFlightKey = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !userId) return;
    const state = useRecipeStore.getState();
    const required = productBehaviorRequiredLineIds({
      items: state.items,
      toppings: state.toppings,
    })
      .filter((lineId) => state.productBehaviorSnapshots[lineId]?.resolutionState !== 'RESOLVED')
      .sort();
    if (required.length === 0) return;
    const key = `${draftContextSeq}:${draftRevision}:${required.join(',')}`;
    if (inFlightKey.current === key) return;
    inFlightKey.current = key;
    let cancelled = false;

    const initial = useRecipeStore.getState();
    const lines = required.map((lineId) => ({
      lineId,
      base: initial.items.find((item) => item.id === lineId),
      topping: initial.toppings.find((item) => item.id === lineId),
    }));

    void Promise.all(lines.map(async ({ lineId, base, topping }) => {
      const ingredient = base?.ingredient ?? topping?.ingredient;
      const lineName = ingredient?.name ?? lineId;
      if (!ingredient) return { lineId, lineName, error: 'brak składnika w zapisanej linii' };
      const storedSnapshot = initial.productBehaviorSnapshots[lineId];
      const catalogReference = catalogReferenceFromPrivateId(
        ingredient.private_product_id ?? undefined,
      );
      const mapperIngredientId = base ? canonicalIngredientId(base.ingredient) : null;
      const processScope = base ? 'BASE_FORMULATION' as const : 'POST_PROCESS_ADDON' as const;
      const canonicalRecipe = buildRecipeInput(initial);
      const resolved = await resolveLegacyRecipeBehaviorForSelection({
          reference: {
            mapperIngredientId,
            canonicalIdentity: mapperIngredientId,
            productId: storedSnapshot?.productId ?? catalogReference.productId,
            productVersionId:
              storedSnapshot?.productVersionId ?? catalogReference.productVersionId,
            behaviorBindingId: storedSnapshot?.behaviorBindingId ?? null,
          },
          context: {
            accountId: userId,
            productProfile: canonicalRecipe.category,
            temperatureC: initial.target_temperature_c,
            mode: initial.formulation_strategy,
            processScope,
            requestedRole: base?.lock_type === 'main' ? 'MAIN' : 'STANDARD',
            module: base ? 'BASE_RECIPE' : 'TOPPING',
          },
        })
        .catch((error: unknown) => ({
          error: error instanceof Error ? error.message : 'resolver produktu jest niedostępny',
        }));
      if (cancelled) return { lineId, lineName, error: 'rozwiązywanie przerwane' };
      if (!resolved) return { lineId, lineName, error: 'resolver produktu nie zwrócił wyniku' };
      if ('error' in resolved) return { lineId, lineName, error: resolved.error };
      if (resolved.state !== 'eligible') {
        return {
          lineId,
          lineName,
          error: resolved.blockReasons.join(', ') || 'brak aktualnego bindingu produktu',
        };
      }
      const row = base && resolved.mapperIngredientId
        ? await getEngineApprovedIngredientById(resolved.mapperIngredientId).catch(() => null)
        : null;
      if (base && !row) {
        return {
          lineId,
          lineName,
          error: `brak aktywnego Mapper row ${resolved.mapperIngredientId ?? mapperIngredientId ?? lineId}`,
        };
      }
      return {
        lineId,
        lineName,
        row,
        snapshot: {
          ...snapshotServerResolvedProductBehavior({ lineId, processScope, resolved }),
          resolutionState: 'RESOLVED' as const,
        },
      };
    })).then((resolvedLines) => {
      if (cancelled) return;
      const failed = resolvedLines.filter((line) => 'error' in line);
      if (failed.length > 0) {
        useRecipeStore.setState((current) => ({
          compositionMigrationAmbiguities: [
            ...current.compositionMigrationAmbiguities.filter(
              (issue) => !required.includes(issue.lineId) || !issue.reason.startsWith('LEGACY_BEHAVIOR:'),
            ),
            ...failed.map((line) => ({
              lineId: line.lineId,
              reason: `LEGACY_BEHAVIOR:${line.error}`,
            })),
          ],
        }));
        return;
      }
      const complete = resolvedLines.filter(
        (line): line is Extract<(typeof resolvedLines)[number], { snapshot: unknown }> => 'snapshot' in line,
      );
      if (complete.length !== required.length) {
        const completedIds = new Set(complete.map((line) => line.lineId));
        useRecipeStore.setState((current) => ({
          compositionMigrationAmbiguities: [
            ...current.compositionMigrationAmbiguities.filter(
              (issue) => !required.includes(issue.lineId) || !issue.reason.startsWith('LEGACY_BEHAVIOR:'),
            ),
            ...required.filter((lineId) => !completedIds.has(lineId)).map((lineId) => ({
              lineId,
              reason: 'LEGACY_BEHAVIOR:resolver nie zwrócił kompletnego wyniku',
            })),
          ],
        }));
        return;
      }

      const latest = useRecipeStore.getState();
      if (latest.draftContextSeq !== draftContextSeq || latest.draftRevision !== draftRevision) return;
      const snapshots = {
        ...latest.productBehaviorSnapshots,
        ...Object.fromEntries(complete.map((line) => [line.lineId, line.snapshot])),
      };
      let upgraded = buildRecipeInput(latest);
      upgraded = {
        ...upgraded,
        items: upgraded.items.map((item) => {
          const row = complete.find((line) => line.lineId === item.id)?.row;
          return row ? { ...item, ingredient: ingredientRowToEngineIngredient(row) } : item;
        }),
      };
      const authority = buildRecipeBehaviorAuthority({
        items: upgraded.items,
        toppings: latest.toppings,
        snapshots,
      });
      upgraded = recipeInputFromFrozenBehavior(upgraded, authority, 'technical');
      const committed = useRecipeStore.getState().applyVerifiedRecipeInput(
        upgraded,
        snapshots,
        { acknowledgeRecalculation: false },
      );
      if (!committed.ok) {
        useRecipeStore.setState((current) => ({
          compositionMigrationAmbiguities: [
            ...current.compositionMigrationAmbiguities.filter(
              (issue) => !required.includes(issue.lineId) || !issue.reason.startsWith('LEGACY_BEHAVIOR:'),
            ),
            ...required.map((lineId) => ({
              lineId,
              reason: `LEGACY_BEHAVIOR:zapis working copy odrzucony (${committed.code})`,
            })),
          ],
        }));
      } else {
        useRecipeStore.setState((current) => ({
          compositionMigrationAmbiguities: current.compositionMigrationAmbiguities.filter(
            (issue) => !required.includes(issue.lineId) || !issue.reason.startsWith('LEGACY_BEHAVIOR:'),
          ),
        }));
      }
    }).finally(() => {
      if (inFlightKey.current === key) inFlightKey.current = null;
    });

    return () => {
      cancelled = true;
    };
  }, [draftContextSeq, draftRevision, enabled, userId]);
}
