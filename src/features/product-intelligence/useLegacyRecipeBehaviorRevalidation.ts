import { useEffect, useRef } from 'react';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useAuthStore } from '@/stores/authStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
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
import { newRecipeStarterMaterialFingerprint } from '@/features/recipes/newRecipeStarter';

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
    const persistenceRequired = productBehaviorRequiredLineIds({
      items: state.items,
      toppings: state.toppings,
    });
    // A 0 g Base placeholder is outside the persistence-required set, yet the
    // picker resolved authority for it and every grams write that gives it
    // mass is gated on that authority. When a role or context change left that
    // authority stale, this pass is the only thing that can refresh it —
    // otherwise the line's grams control stays refused for ever.
    const staleZeroGramBase = state.items
      .filter(
        (item) =>
          !persistenceRequired.includes(item.id) &&
          state.productBehaviorSnapshots[item.id] !== undefined &&
          state.productBehaviorSnapshots[item.id]?.resolutionState !== 'RESOLVED',
      )
      .map((item) => item.id);
    // OWNER OD-1 (Package 2A): a 0 g priority line is legitimate — „Przelicz i
    // popraw" sizes it — so it needs product authority before it has mass, exactly
    // as it would with mass (the canonical required rule, asked for one gram).
    // Authority only: nothing here writes an amount.
    const zeroGramPriority = state.items
      .filter(
        (item) =>
          item.lock_type === 'main' &&
          item.planned_grams === 0 &&
          state.productBehaviorSnapshots[item.id] === undefined &&
          productBehaviorRequiredLineIds({ items: [{ ...item, planned_grams: 1 }] }).length > 0,
      )
      .map((item) => item.id);
    const required = [
      ...persistenceRequired.filter(
        (lineId) => state.productBehaviorSnapshots[lineId]?.resolutionState !== 'RESOLVED',
      ),
      ...staleZeroGramBase,
      ...zeroGramPriority,
    ].sort();
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
      if (!ingredient) return { lineId, lineName, error: 'Brak składnika w zapisanej linii' };
      const storedSnapshot = initial.productBehaviorSnapshots[lineId];
      const historicalSource =
        storedSnapshot?.sharedFacts && initial.savedRecipeId && initial.currentVersionId
          ? {
              recipeId: initial.savedRecipeId,
              recipeVersionId: initial.currentVersionId,
            }
          : null;
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
            sourceRecipeId: historicalSource?.recipeId ?? null,
            sourceRecipeVersionId: historicalSource?.recipeVersionId ?? null,
            sourceLineId: historicalSource ? lineId : null,
          },
          context: {
            accountId: userId,
            productProfile: canonicalRecipe.category,
            temperatureC: initial.target_temperature_c,
            mode: initial.formulation_strategy,
            processScope,
            // Saved Main is a technical formulation objective. The visible
            // crown is preserved in the recipe; legacy hydration asks only
            // whether the exact product is technically valid in Base.
            requestedRole: 'STANDARD',
            module: base ? 'BASE_RECIPE' : 'TOPPING',
          },
        })
        .catch((error: unknown) => ({
          error: error instanceof Error ? error.message : 'Rozpoznawanie produktu jest niedostępne',
        }));
      if (cancelled) return { lineId, lineName, error: 'Rozwiązywanie przerwane' };
      if (!resolved) return { lineId, lineName, error: 'Nie udało się rozpoznać produktu' };
      if ('error' in resolved) return { lineId, lineName, error: resolved.error };
      if (resolved.state !== 'eligible') {
        return {
          lineId,
          lineName,
          error: resolved.blockReasons.join(', ') || 'Brak aktualnego bindingu produktu',
        };
      }
      const preserveFrozen = historicalSource !== null && storedSnapshot !== undefined;
      const row = !preserveFrozen && base && resolved.mapperIngredientId
        ? await getEngineApprovedIngredientById(resolved.mapperIngredientId).catch(() => null)
        : null;
      if (!preserveFrozen && base && resolved.entityKind === 'mapper' && !row) {
        return {
          lineId,
          lineName,
          error: `Brak aktywnego wpisu Mapper: ${resolved.mapperIngredientId ?? mapperIngredientId ?? lineId}`,
        };
      }
      const currentSnapshot = snapshotServerResolvedProductBehavior({
        lineId,
        processScope,
        resolved,
      });
      const snapshot = preserveFrozen
        ? {
            ...structuredClone(storedSnapshot),
            resolutionState: 'RESOLVED' as const,
            resolutionContext: currentSnapshot.resolutionContext,
            blockReasons: storedSnapshot.blockReasons.filter(
              (reason) => reason !== 'recipe_context_changed',
            ),
            historicalIdentity: {
              schemaVersion: 1 as const,
              sourceRecipeId: historicalSource.recipeId,
              sourceRecipeVersionId: historicalSource.recipeVersionId,
              sourceProductId: storedSnapshot.productId,
              sourceProductVersionId: storedSnapshot.productVersionId,
              sourceBehaviorBindingId: storedSnapshot.behaviorBindingId,
              canonicalProductId: resolved.productId,
              canonicalProductVersionId: resolved.productVersionId,
              canonicalBehaviorBindingId: resolved.behaviorBindingId,
              canonicalProductCode: resolved.canonicalProductCode ?? null,
              resolutionKind:
                resolved.historicalResolutionKind ??
                (resolved.productId === storedSnapshot.productId
                  ? 'VERSION_SUCCESSOR' as const
                  : 'PRODUCT_MERGE' as const),
            },
          }
        : {
            ...currentSnapshot,
            resolutionState: 'RESOLVED' as const,
          };
      // The server re-answered for the SAME product version and the SAME
      // frozen facts the line already carries — a Crown role change or a
      // context change, never a product change — so there is no upgraded
      // ingredient to write for this line.
      const authorityOnly =
        !preserveFrozen &&
        storedSnapshot !== undefined &&
        storedSnapshot.processScope === currentSnapshot.processScope &&
        storedSnapshot.productId === currentSnapshot.productId &&
        storedSnapshot.productVersionId === currentSnapshot.productVersionId &&
        storedSnapshot.factsFingerprint === currentSnapshot.factsFingerprint &&
        storedSnapshot.mapperIngredientId === currentSnapshot.mapperIngredientId;
      return {
        lineId,
        lineName,
        row,
        snapshot,
        preserveFrozen,
        authorityOnly,
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
      // A saved immutable recipe already carries the exact ingredient vector.
      // When every repaired line is identity-only, update only the authority
      // map: running the general verified-write door would unnecessarily
      // re-judge or project the historical recipe before the customer asks to
      // recalculate it.
      const commitAuthorityOnly = (): void => {
        useRecipeStore.setState((current) => {
          if (
            current.draftContextSeq !== draftContextSeq ||
            current.draftRevision !== draftRevision
          ) return current;
          return {
            productBehaviorSnapshots: structuredClone(snapshots),
            compositionMigrationAmbiguities: current.compositionMigrationAmbiguities.filter(
              (issue) =>
                !required.includes(issue.lineId) ||
                !issue.reason.startsWith('LEGACY_BEHAVIOR:'),
            ),
          };
        });
        useRecipeProfileStore.getState().markRecalculationRequired();
      };
      if (complete.every((line) => line.preserveFrozen)) {
        commitAuthorityOnly();
        return;
      }
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
      // An explicit new-recipe scaffold may be intentionally incomplete (the
      // Sorbet fruit/Main is chosen by the customer), so its technological
      // lines do not yet reconcile to the target batch. Hydrate their exact
      // current Mapper facts + snapshots atomically without mislabelling this
      // server-owned enrichment as a user edit. Normal saved/existing recipes
      // continue through the strict full-batch write door below.
      if (typeof latest.newRecipeStarterTemplateId === 'string') {
        let starterWasUntouched = false;
        useRecipeStore.setState((current) => {
          if (
            current.draftContextSeq !== draftContextSeq ||
            current.draftRevision !== draftRevision ||
            current.newRecipeStarterTemplateId !== latest.newRecipeStarterTemplateId
          ) {
            return current;
          }
          const materialBeforeHydration = newRecipeStarterMaterialFingerprint({
            items: current.items,
            toppings: current.toppings,
            excludedIngredientIds: current.excludedIngredientIds,
            unavailableMainIngredientIds: current.unavailableMainIngredientIds,
          });
          const wasUntouched =
            current.newRecipeStarterMaterialFingerprint !== null &&
            materialBeforeHydration === current.newRecipeStarterMaterialFingerprint;
          starterWasUntouched = wasUntouched;
          const hydratedItems = upgraded.items.map((item) => ({
            ...item,
            ingredient: structuredClone(item.ingredient),
          }));
          return {
            items: hydratedItems,
            productBehaviorSnapshots: structuredClone(snapshots),
            compositionMigrationAmbiguities: current.compositionMigrationAmbiguities.filter(
              (issue) =>
                !required.includes(issue.lineId) ||
                !issue.reason.startsWith('LEGACY_BEHAVIOR:'),
            ),
            // Server-owned hydration never decides whether the user edited the
            // recipe. Preserve the generic dirty flag and advance the starter
            // baseline only when material state was untouched before hydration.
            ...(wasUntouched
              ? {
                  newRecipeStarterMaterialFingerprint: newRecipeStarterMaterialFingerprint({
                    items: hydratedItems,
                    toppings: current.toppings,
                    excludedIngredientIds: current.excludedIngredientIds,
                    unavailableMainIngredientIds: current.unavailableMainIngredientIds,
                  }),
                }
              : {}),
            draftRevision: current.draftRevision + 1,
          };
        });
        // Hydration is automatic authority enrichment, not a user recipe
        // change. The live Engine already evaluates the hydrated starter; do
        // not falsely require a PI click to initialize it. The full Pro page
        // installs the constraint-store recipe subscription, which correctly
        // observes the authority fingerprint change above as a technical
        // revision. Clear that subscriber signal only for this explicit fresh
        // starter branch; saved/existing recipe hydration remains stale until
        // the normal customer recalculation flow completes.
        if (starterWasUntouched) {
          useRecipeProfileStore.getState().acknowledgeRecalculation();
        }
        return;
      }
      // An authority-only refresh changes no recipe material, so it is written
      // like the historical identity-only repair above. Pushing the unchanged
      // draft through the terminal verified-write door re-judged a recipe the
      // user is still building (Crown seeds at 1 g, a 0 g placeholder, an
      // off-batch vector), refused the whole refresh, and left every crowned
      // line REVALIDATION_REQUIRED with its grams control closed.
      if (complete.every((line) => line.preserveFrozen || line.authorityOnly)) {
        commitAuthorityOnly();
        return;
      }
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
