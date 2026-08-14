import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { MetricValue } from '@/components/shared/MetricValue';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { Card } from '@/components/ui/Card';
import { copy } from '@/copy/en';
import type { EffectiveRecipeItem } from '@/engine';
import {
  canonicalIngredientId,
  canonicalIngredientIdFromSourceId,
} from '@/data/ingredients/canonicalIngredientIdentity';
import { useLineLockControls } from '@/features/constraint-studio/useLineLockControls';
import {
  createSubstitutionPreviewWithServerAuthority,
  selectCanonicalDraft,
} from '@/features/constraint-studio/constraintStudioStore';
import { NonProductionBadge } from '@/features/design-review/NonProductionMarker';
import { useRecipeStore } from '@/stores/recipeStore';
import { useCustomerPriceStore } from '@/stores/customerPriceStore';
import { useAuthStore } from '@/stores/authStore';
import {
  CUSTOMER_COST_CURRENCY,
  canPersistCustomerPrice,
  catalogProductIdForIngredient,
  customerPriceCanonicalId,
  effectiveCostForIngredient,
  effectiveCostForToppingIngredient,
} from '@/features/pro-core/effectiveRecipePricing';
import {
  isCatalogLabelToppingIngredient,
  toppingIngredientIdentity,
} from '@/features/recipe-composition/labelTopping';
import { effectiveLineCost } from '@/features/pro-core/costing';
import {
  IngredientRow,
  PRODUCTION_ROW_GRID,
  ROW_GRID,
  type IngredientRowActions,
  type IngredientTableMode,
  type ProductionRowActions,
} from './IngredientRow';
import { ProductPickerPopover } from './ProductPickerPopover';
import { ToppingRow, TOPPING_ROW_GRID } from './ToppingRow';
import {
  ingredientRowMeta,
  unresolvedRequiredIngredients,
  useIngredientTableUxStore,
} from './ingredientTableUxStore';
import { useIngredientLibrary } from './useIngredientLibrary';
import type { IngredientPriceView } from './IngredientPriceControl';
import type { ProductionWorkspaceView } from '@/features/production-workspace/useProductionWorkspace';
import { repairableCanonicalDuplicateCount } from './ingredientDuplicateRepair';
import { listEngineApprovedIngredients } from '@/services/ingredients';
import { verifiedRecipeSubstituteCandidates } from './recipeSubstitution';
import { buildDirectPercentEdit } from './directPercentEdit';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import {
  resetPrivateCatalogProductPrice,
  savePrivateCatalogProductPrice,
} from '@/services/globalCatalog';
import {
  mainBehaviorBlockReason,
  productBehaviorRequiredLineIds,
  snapshotServerResolvedProductBehavior,
  type ProductBehaviorSnapshot,
} from '@/features/product-intelligence';
import {
  productBehaviorBlockedMessage,
  resolveProductBehaviorForSelection,
} from '@/services/productIntelligence';

const b = copy.studio.builder;
const headCell = 'text-xs font-medium tracking-[0.04em] text-ivory/70 uppercase';

/**
 * Items come from the Engine result; edits return to the canonical recipe store.
 * Recipe-only row metadata never enters RecipeInput or Engine mathematics.
 */
export function IngredientBuilder({
  items,
  totalBatchG,
  targetBatchG,
  demo,
  layout = 'card',
  mode = 'recipe',
  production,
  onRecalculate,
}: {
  items: EffectiveRecipeItem[];
  totalBatchG: number;
  targetBatchG: number;
  demo: boolean;
  layout?: 'card' | 'workbench';
  mode?: IngredientTableMode;
  production?: ProductionWorkspaceView;
  onRecalculate?: () => void;
}) {
  const queryClient = useQueryClient();
  const authUserId = useAuthStore((state) =>
    state.status === 'authed' ? (state.user?.id ?? null) : null,
  );
  const customerOwnerUserId =
    !demo && (authUserId ?? (import.meta.env.DEV ? '00000000-0000-0000-0000-000000000001' : null));
  const customerPrices = useCustomerPriceStore((state) => state.overridesByCanonicalId);
  const compositionMigrationAmbiguities = useRecipeStore(
    (state) => state.compositionMigrationAmbiguities,
  );
  const resolveCompositionAmbiguity = useRecipeStore((state) => state.resolveCompositionAmbiguity);
  const loadCustomerPrices = useCustomerPriceStore((state) => state.loadForOwner);
  const saveCustomerPrice = useCustomerPriceStore((state) => state.saveOverride);
  const resetCustomerPrice = useCustomerPriceStore((state) => state.resetOverride);

  useEffect(() => {
    if (!customerOwnerUserId) return;
    void loadCustomerPrices(customerOwnerUserId);
  }, [customerOwnerUserId, loadCustomerPrices]);

  const addIngredient = useRecipeStore((state) => state.addIngredient);
  const addTopping = useRecipeStore((state) => state.addTopping);
  const setProductBehaviorSnapshot = useRecipeStore((state) => state.setProductBehaviorSnapshot);
  const behaviorProfile = useRecipeStore((state) => state.category);
  const behaviorTemperatureC = useRecipeStore((state) => state.target_temperature_c);
  const behaviorMode = useRecipeStore((state) => state.formulation_strategy);
  const productBehaviorSnapshots = useRecipeStore((state) => state.productBehaviorSnapshots);
  const toppings = useRecipeStore((state) => state.toppings);
  const baseOrder = useRecipeStore((state) => state.baseOrder);
  const removeTopping = useRecipeStore((state) => state.removeTopping);
  const setToppingGrams = useRecipeStore((state) => state.setToppingGrams);
  const replaceToppingIngredient = useRecipeStore((state) => state.replaceToppingIngredient);
  const setIngredientPrivateCost = useRecipeStore((state) => state.setIngredientPrivateCost);
  const moveBaseItem = useRecipeStore((state) => state.moveBaseItem);
  const moveTopping = useRecipeStore((state) => state.moveTopping);
  const draggedBaseId = useRef<string | null>(null);
  const draggedToppingId = useRef<string | null>(null);
  const [pickerNotice, setPickerNotice] = useState<string | null>(null);
  const [reorderNotice, setReorderNotice] = useState('');
  const dirty = useRecipeStore((state) => state.dirty);
  const directionPending = useRecipeProfileStore((state) => state.awaitingRecalculation);
  const recalcPending = dirty || directionPending;
  const library = useIngredientLibrary({ demo });
  const { lockFor, wrapActions } = useLineLockControls();

  const baseReorderNotice = (lineId: string, action: string): string => {
    const state = useRecipeStore.getState();
    const orderedIds =
      state.baseOrder.length > 0 ? state.baseOrder : state.items.map((item) => item.id);
    const position = orderedIds.indexOf(lineId) + 1;
    const name = state.items.find((item) => item.id === lineId)?.ingredient.name ?? 'Składnik';
    return `${name} ${action} w Bazie. Pozycja ${Math.max(position, 1)} z ${orderedIds.length}.`;
  };

  const toppingReorderNotice = (lineId: string, action: string): string => {
    const state = useRecipeStore.getState();
    const ordered = [...state.toppings].sort(
      (left, right) => left.addon_sort_order - right.addon_sort_order,
    );
    const position = ordered.findIndex((item) => item.id === lineId) + 1;
    const name = ordered.find((item) => item.id === lineId)?.ingredient.name ?? 'Topping';
    return `${name} ${action} w toppingach. Pozycja ${Math.max(position, 1)} z ${ordered.length}.`;
  };

  const setRoleMeta = useIngredientTableUxStore((state) => state.setRole);
  const toggleRequired = useIngredientTableUxStore((state) => state.toggleRequired);
  const setUnavailable = useIngredientTableUxStore((state) => state.setUnavailable);
  const clearLineMeta = useIngredientTableUxStore((state) => state.clearLine);
  const markRequiredRemoved = useIngredientTableUxStore((state) => state.markRequiredRemoved);
  const metaByLineId = useIngredientTableUxStore((state) => state.metaByLineId);
  const unresolvedByLineId = useIngredientTableUxStore((state) => state.unresolvedRequiredByLineId);

  const removeItem = useRecipeStore((state) => state.removeItem);
  const setCanonicalUnavailable = useRecipeStore((state) => state.setIngredientUnavailable);
  const coreActions: IngredientRowActions = wrapActions({
    setPlannedGrams: useRecipeStore((state) => state.setPlannedGrams),
    setActualGrams: useRecipeStore((state) => state.setActualGrams),
    setLockType: useRecipeStore((state) => state.setLockType),
    setMainIngredient: useRecipeStore((state) => state.setMainIngredient),
    removeItem: (lineId) => {
      removeItem(lineId);
      clearLineMeta(lineId);
    },
  });

  const setPlannedGramsVector = useRecipeStore((state) => state.setPlannedGramsVector);

  const actions: IngredientRowActions = {
    ...coreActions,
    setPlannedPercent: (lineId, percent) => {
      const draft = selectCanonicalDraft();
      const next = buildDirectPercentEdit(
        draft.input,
        draft.constraints,
        lineId,
        percent,
        draft.excludedIngredientIds,
      );
      if (next.ok) setPlannedGramsVector(next.gramsByLineId);
    },
    setCustomerRole: (lineId, role) => {
      if (role === 'main') {
        setRoleMeta(lineId, 'standard');
        coreActions.setMainIngredient(lineId);
        resolveCompositionAmbiguity(lineId);
        return;
      }
      const current = useRecipeStore.getState().items.find((item) => item.id === lineId);
      const previousRole = ingredientRowMeta(metaByLineId, lineId).role;
      if (current?.lock_type === 'main') coreActions.setLockType(lineId, 'unlocked');
      setRoleMeta(lineId, role);
      if (current?.lock_type !== 'main' && previousRole !== role) {
        useRecipeStore.getState().markProfileTargetChanged();
      }
      resolveCompositionAmbiguity(lineId);
    },
    toggleRequired: (lineId) => {
      const current = useRecipeStore.getState().items.find((item) => item.id === lineId);
      const storedRequired = ingredientRowMeta(metaByLineId, lineId).required;
      const currentlyRequired = storedRequired || current?.lock_type === 'required';
      if (current?.lock_type === 'unlocked' && !currentlyRequired) {
        coreActions.setLockType(lineId, 'required');
        if (!storedRequired) toggleRequired(lineId);
        return;
      }
      if (current?.lock_type === 'required') {
        coreActions.setLockType(lineId, 'unlocked');
        if (storedRequired) toggleRequired(lineId);
        return;
      }
      // Main, exact-gram, percent and range locks already provide a stronger
      // invariant. Keep their Engine/constraint state and only add the visible
      // Required meaning instead of replacing a crown or a lock.
      toggleRequired(lineId);
      useRecipeStore.getState().markProfileTargetChanged();
    },
    setIngredientUnavailable: (lineId, unavailable) => {
      // Keep the unavailable row as an explicit replacement tombstone. Its
      // canonical identity is excluded immediately, so normal formulation
      // cannot accept it, while the beginner can still choose "Znajdź
      // zamiennik" from the same row.
      setUnavailable(lineId, unavailable);
      setCanonicalUnavailable(lineId, unavailable);
    },
    removeRequiredIngredient: (lineId, name) => {
      coreActions.removeItem(lineId);
      markRequiredRemoved(lineId, name);
    },
    requestSubstitutes: async (lineId) => {
      if (demo || mode !== 'recipe') return [];
      const catalogue = await queryClient.fetchQuery({
        queryKey: ['verified-recipe-substitute-catalogue'],
        queryFn: listEngineApprovedIngredients,
        staleTime: 5 * 60 * 1000,
      });
      return verifiedRecipeSubstituteCandidates(selectCanonicalDraft().input, lineId, catalogue);
    },
    selectSubstitute: async (lineId, candidate, mainIdentityConfirmed) => {
      if (!candidate.ingredient || !candidate.authorization) return;
      const currentLine = useRecipeStore.getState().items.find((item) => item.id === lineId);
      if (!currentLine) return;
      const resolved = await resolveProductBehaviorForSelection({
        entity: { entityKind: 'mapper', entityId: candidate.id },
        context: {
          accountId: authUserId,
          productProfile: behaviorProfile,
          temperatureC: behaviorTemperatureC,
          mode: behaviorMode,
          processScope: 'BASE_FORMULATION',
          requestedRole: currentLine.lock_type === 'main' ? 'MAIN' : 'STANDARD',
          module: 'SUBSTITUTION',
        },
      }).catch(() => null);
      if (!resolved) {
        setPickerNotice('Nie udało się potwierdzić aktualnego zachowania zamiennika. Spróbuj ponownie.');
        return;
      }
      if (resolved.state === 'blocked') {
        setPickerNotice(productBehaviorBlockedMessage(resolved));
        return;
      }
      const behavior = snapshotServerResolvedProductBehavior({
        lineId,
        processScope: 'BASE_FORMULATION',
        resolved,
      });
      await createSubstitutionPreviewWithServerAuthority({
        lineId,
        substitute: candidate.ingredient,
        authorization: candidate.authorization,
        productBehaviorSnapshot: behavior,
        confirmMainIdentity: mainIdentityConfirmed,
      });
      setPickerNotice(null);
    },
    moveUp: (lineId) => {
      moveBaseItem(lineId, -1);
      setReorderNotice(baseReorderNotice(lineId, 'przesunięto wyżej'));
    },
    moveDown: (lineId) => {
      moveBaseItem(lineId, 1);
      setReorderNotice(baseReorderNotice(lineId, 'przesunięto niżej'));
    },
  };

  const behaviorRequiredLineIds = new Set(productBehaviorRequiredLineIds({
    items: useRecipeStore.getState().items,
    toppings,
  }));

  const offTarget = Math.abs(totalBatchG - targetBatchG) > 0.1;

  // Explicit repair for old drafts only; never merge canonical lines automatically.
  const storeItems = useRecipeStore((state) => state.items);
  const excludedIngredientIds = useRecipeStore((state) => state.excludedIngredientIds);
  const mergeDuplicates = useRecipeStore((state) => state.mergeDuplicateIngredientLines);
  const duplicateCount = repairableCanonicalDuplicateCount(storeItems);

  const duplicateNotice =
    duplicateCount > 0 ? (
      <div
        className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-300/30 bg-amber-300/[0.06] px-3 py-2.5"
        data-testid="builder-duplicate-repair"
      >
        <p className="text-xs leading-relaxed text-amber-200/90">
          {b.duplicateNotice(duplicateCount)}
        </p>
        <button
          type="button"
          className="min-h-11 rounded-lg border border-ivory/20 px-3 py-2 text-xs font-medium text-ivory transition-colors hover:border-ivory/40"
          onClick={mergeDuplicates}
          data-testid="builder-merge-duplicates"
        >
          {b.mergeDuplicates}
        </button>
      </div>
    ) : null;

  const header =
    mode === 'production' ? (
      <div className={`${PRODUCTION_ROW_GRID} px-3 py-2`}>
        {['Składnik', 'Planowane', 'Faktycznie · Status / potwierdź', 'Różnica'].map(
          (label, index) => (
            <span
              key={label}
              className={`${headCell} ${index === 1 || index === 3 ? 'text-right' : ''}`}
            >
              {label}
            </span>
          ),
        )}
      </div>
    ) : (
      <div className={`${ROW_GRID} px-3 py-2`} data-testid="recipe-table-header">
        {['Składnik', '%', 'Ilość', 'Cena/kg', ''].map((label, index) => (
          <span
            key={`${label}-${index}`}
            className={`${headCell} ${[1, 3].includes(index) ? 'text-right' : ''}`}
          >
            {label || '\u00a0'}
          </span>
        ))}
      </div>
    );

  const orderIndex = new Map(baseOrder.map((id, index) => [id, index]));
  const orderedItems = [...items].sort((left, right) => {
    const leftIndex = orderIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = orderIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    return leftIndex === rightIndex ? 0 : leftIndex - rightIndex;
  });

  const rows = orderedItems.map((item, rowIndex) => {
    const rawIngredient =
      storeItems.find((candidate) => candidate.id === item.id)?.ingredient ?? item.ingredient;
    const cost = effectiveCostForIngredient(rawIngredient, customerPrices);
    const canonicalId = customerPriceCanonicalId(rawIngredient);
    const catalogProductId = catalogProductIdForIngredient(rawIngredient);
    const catalogReferencePrice = productBehaviorSnapshots[item.id]?.sharedFacts?.referencePrice ?? null;
    const priceView: IngredientPriceView = {
      cost,
      lineCost: effectiveLineCost(item.effective_grams, cost),
      resetLabel: catalogProductId ? 'Usuń moją cenę' : undefined,
      canEdit:
        mode === 'recipe' && customerOwnerUserId !== null &&
        (catalogProductId !== null || canPersistCustomerPrice(rawIngredient)),
      onSave:
        customerOwnerUserId && catalogProductId
          ? async (pricePerKg) => {
              await savePrivateCatalogProductPrice({
                catalogProductId,
                pricePerKg,
                currency: CUSTOMER_COST_CURRENCY,
              });
              setIngredientPrivateCost(
                item.id,
                pricePerKg,
                CUSTOMER_COST_CURRENCY,
                'private',
              );
              await queryClient.invalidateQueries({ queryKey: ['global-catalog-search'] });
            }
          : customerOwnerUserId && canonicalId
          ? async (pricePerKg) => {
              await saveCustomerPrice({
                ownerUserId: customerOwnerUserId,
                canonicalIngredientId: canonicalId,
                pricePerKg,
                currency: CUSTOMER_COST_CURRENCY,
              });
            }
          : undefined,
      onReset:
        customerOwnerUserId && catalogProductId
          ? async () => {
              await resetPrivateCatalogProductPrice(catalogProductId);
              setIngredientPrivateCost(
                item.id,
                catalogReferencePrice?.pricePerKg ?? null,
                catalogReferencePrice?.currency ?? null,
                catalogReferencePrice ? 'reference' : null,
              );
              await queryClient.invalidateQueries({ queryKey: ['global-catalog-search'] });
            }
          : customerOwnerUserId && canonicalId
          ? async () => resetCustomerPrice(customerOwnerUserId, canonicalId)
          : undefined,
    };
    const productionLine =
      production?.session?.lines.find((line) => line.lineId === item.id) ??
      (mode === 'production'
        ? {
            lineId: item.id,
            canonicalIngredientId:
              item.ingredient.canonical_ingredient_id ?? item.ingredient.id ?? null,
            name: item.ingredient.name,
            plannedGrams: item.planned_grams,
            targetGrams: item.planned_grams,
            draftActualGrams: item.actual_grams ?? item.planned_grams,
            physicalAddedGrams: item.actual_grams ?? 0,
            confirmed: item.actual_grams !== null,
            confirmedAt: null,
            confirmationOrder: null,
            recordCorrectionCount: 0,
          }
        : undefined);
    const productionActions: ProductionRowActions | undefined = production
      ? {
          setDraftActual: production.setDraftActual,
          confirmLine: production.confirmLine,
          reopenRecord: production.reopenRecord,
        }
      : mode === 'production'
        ? {
            setDraftActual: actions.setActualGrams,
            confirmLine: (lineId) => {
              const current = items.find((candidate) => candidate.id === lineId);
              if (current) {
                actions.setActualGrams(lineId, current.actual_grams ?? current.planned_grams);
              }
            },
            reopenRecord: (lineId) => actions.setActualGrams(lineId, null),
          }
        : undefined;

    const storedMeta = ingredientRowMeta(metaByLineId, item.id);
    const unavailableFromDraft = excludedIngredientIds.some(
      (id) => canonicalIngredientIdFromSourceId(id) === canonicalIngredientId(item.ingredient),
    );
    return (
      <IngredientRow
        key={item.id}
        item={item}
        totalBatchG={totalBatchG}
        actions={actions}
        lock={lockFor(item)}
        compact={layout === 'workbench'}
        mode={mode}
        meta={{ ...storedMeta, unavailable: storedMeta.unavailable || unavailableFromDraft }}
        priceView={mode === 'recipe' ? priceView : undefined}
        productionLine={productionLine}
        productionActions={productionActions}
        canMoveUp={rowIndex > 0}
        canMoveDown={rowIndex < orderedItems.length - 1}
        onDragStart={(lineId) => {
          draggedBaseId.current = lineId;
        }}
        onDrop={(targetLineId) => {
          const source = draggedBaseId.current;
          draggedBaseId.current = null;
          if (!source || source === targetLineId) return;
          const sourceIndex = orderedItems.findIndex((entry) => entry.id === source);
          const targetIndex = orderedItems.findIndex((entry) => entry.id === targetLineId);
          if (sourceIndex < 0 || targetIndex < 0) return;
          const direction: -1 | 1 = targetIndex < sourceIndex ? -1 : 1;
          for (let index = sourceIndex; index !== targetIndex; index += direction) {
            moveBaseItem(source, direction);
          }
          setReorderNotice(baseReorderNotice(source, 'przeniesiono'));
        }}
        mainUnavailableReason={mainBehaviorBlockReason(
          productBehaviorSnapshots[item.id],
          behaviorRequiredLineIds.has(item.id),
        )}
      />
    );
  });

  const unresolved = unresolvedRequiredIngredients({
    unresolvedRequiredByLineId: unresolvedByLineId,
  });
  const infeasibleNotice =
    mode === 'recipe' && unresolved.length > 0 ? (
      <div
        role="alert"
        className="border-b border-status-error/25 bg-status-error/[0.055] px-3 py-2"
        data-testid="recipe-infeasible-notice"
      >
        <p className="text-xs font-semibold tracking-[0.04em] text-status-error uppercase">
          {b.ingredientTable.infeasible.title}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-stone-600">
          {b.ingredientTable.infeasible.body} ({unresolved.map((entry) => entry.name).join(', ')})
        </p>
      </div>
    ) : null;

  const addIngredientAndResolveRequiredRole = (
    ingredient: Parameters<typeof addIngredient>[0],
    behavior?: ProductBehaviorSnapshot,
  ) => {
    const canonicalId = toppingIngredientIdentity(ingredient);
    const existing = useRecipeStore
      .getState()
      .items.find((item) => canonicalIngredientId(item.ingredient) === canonicalId);
    if (existing) {
      if (behavior) setProductBehaviorSnapshot(existing.id, { ...behavior, lineId: existing.id });
      setPickerNotice(
        `${ingredient.name} już znajduje się w Bazie. Przeniesiono fokus do istniejącego wiersza.`,
      );
      return { focusLineId: existing.id };
    }
    addIngredient(ingredient);
    const added = useRecipeStore
      .getState()
      .items.find((item) => canonicalIngredientId(item.ingredient) === canonicalId);
    if (added && behavior) setProductBehaviorSnapshot(added.id, { ...behavior, lineId: added.id });
    setPickerNotice(null);
    const normalizedName = ingredient.name.trim().toLocaleLowerCase('pl');
    for (const unresolvedEntry of Object.values(unresolvedByLineId)) {
      if (unresolvedEntry.name.trim().toLocaleLowerCase('pl') === normalizedName) {
        clearLineMeta(unresolvedEntry.lineId);
      }
    }
    return added ? { focusLineId: added.id } : undefined;
  };

  const addOrFocusTopping = (
    ingredient: Parameters<typeof addTopping>[0],
    behavior?: ProductBehaviorSnapshot,
  ) => {
    const canonicalId = toppingIngredientIdentity(ingredient);
    const existing = useRecipeStore
      .getState()
      .toppings.find((item) => toppingIngredientIdentity(item.ingredient) === canonicalId);
    addTopping(ingredient);
    const selected = useRecipeStore
      .getState()
      .toppings.find((item) => toppingIngredientIdentity(item.ingredient) === canonicalId);
    if (selected && behavior) setProductBehaviorSnapshot(selected.id, { ...behavior, lineId: selected.id });
    setPickerNotice(
      existing
        ? `${ingredient.name} już jest toppingiem. Zachowano jeden wiersz i przeniesiono do niego fokus.`
        : null,
    );
    return selected ? { focusLineId: selected.id } : undefined;
  };

  const totalLine = (
    <div className="mt-4 flex items-center justify-between border-t border-ivory/10 pt-4">
      <span className="text-xs tracking-label text-ivory/65 uppercase">{b.batchTotal}</span>
      <span className="flex items-baseline gap-3">
        {offTarget ? (
          <span className="font-mono text-xs text-ivory/60 tabular-nums">
            {b.target} {targetBatchG.toLocaleString('en-US')} {b.unit}
          </span>
        ) : null}
        <MetricValue value={totalBatchG} unit={b.unit} size="sm" />
      </span>
    </div>
  );

  const picker = (
    <ProductPickerPopover
      library={library}
      scope="BASE_FORMULATION"
      behaviorContext={{
        accountId: authUserId,
        productProfile: behaviorProfile,
        temperatureC: behaviorTemperatureC,
        mode: behaviorMode,
      }}
      onAdd={addIngredientAndResolveRequiredRole}
    />
  );

  const toppingTotalG = toppings.reduce((sum, item) => sum + item.planned_grams, 0);
  const finalTotalG = totalBatchG + toppingTotalG;
  const toppingRows = toppings.map((item, index) => {
    const cost = effectiveCostForToppingIngredient(item.ingredient, customerPrices);
    const labelTopping = isCatalogLabelToppingIngredient(item.ingredient)
      ? item.ingredient
      : null;
    const engineTopping = isCatalogLabelToppingIngredient(item.ingredient)
      ? null
      : item.ingredient;
    const canonicalId = engineTopping ? customerPriceCanonicalId(engineTopping) : null;
    const priceView: IngredientPriceView = {
      cost,
      lineCost: effectiveLineCost(item.planned_grams, cost),
      resetLabel: labelTopping ? 'Usuń moją cenę' : undefined,
      canEdit: customerOwnerUserId !== null && (
        labelTopping !== null || (engineTopping !== null && canPersistCustomerPrice(engineTopping))
      ),
      onSave:
        customerOwnerUserId && labelTopping
          ? async (pricePerKg) => {
              await savePrivateCatalogProductPrice({
                catalogProductId: labelTopping.catalog_product_id,
                pricePerKg,
                currency: CUSTOMER_COST_CURRENCY,
              });
              replaceToppingIngredient(item.id, {
                ...labelTopping,
                cost_per_kg: pricePerKg,
                cost_currency: CUSTOMER_COST_CURRENCY,
              });
              await queryClient.invalidateQueries({ queryKey: ['global-catalog-search'] });
            }
          : customerOwnerUserId && canonicalId
          ? async (pricePerKg) => {
              await saveCustomerPrice({
                ownerUserId: customerOwnerUserId,
                canonicalIngredientId: canonicalId,
                pricePerKg,
                currency: CUSTOMER_COST_CURRENCY,
              });
            }
          : undefined,
      onReset:
        customerOwnerUserId && labelTopping
          ? async () => {
              await resetPrivateCatalogProductPrice(labelTopping.catalog_product_id);
              replaceToppingIngredient(item.id, {
                ...labelTopping,
                cost_per_kg: null,
                cost_currency: null,
              });
              await queryClient.invalidateQueries({ queryKey: ['global-catalog-search'] });
            }
          : customerOwnerUserId && canonicalId
          ? async () => resetCustomerPrice(customerOwnerUserId, canonicalId)
          : undefined,
    };
    return (
      <ToppingRow
        key={item.id}
        item={item}
        priceView={priceView}
        library={library}
        behaviorContext={{
          accountId: authUserId,
          productProfile: behaviorProfile,
          temperatureC: behaviorTemperatureC,
          mode: behaviorMode,
        }}
        canMoveUp={index > 0}
        canMoveDown={index < toppings.length - 1}
        onChange={(grams) => setToppingGrams(item.id, grams)}
        onRemove={() => removeTopping(item.id)}
        onReplace={(ingredient, behavior) => {
          replaceToppingIngredient(item.id, ingredient);
          if (behavior) setProductBehaviorSnapshot(item.id, { ...behavior, lineId: item.id });
        }}
        onMove={(direction) => {
          moveTopping(item.id, direction);
          setReorderNotice(
            toppingReorderNotice(item.id, `przesunięto ${direction < 0 ? 'wyżej' : 'niżej'}`),
          );
        }}
        onDragStart={() => {
          draggedToppingId.current = item.id;
        }}
        onDrop={() => {
          const source = draggedToppingId.current;
          draggedToppingId.current = null;
          if (!source || source === item.id) return;
          const sourceIndex = toppings.findIndex((entry) => entry.id === source);
          if (sourceIndex < 0) return;
          const direction: -1 | 1 = index < sourceIndex ? -1 : 1;
          for (let position = sourceIndex; position !== index; position += direction) {
            moveTopping(source, direction);
          }
          setReorderNotice(toppingReorderNotice(source, 'przeniesiono'));
        }}
      />
    );
  });

  if (layout === 'workbench') {
    return (
      <div className="flex h-full min-h-0 flex-col" data-testid="ingredient-editor-pane">
        <div className="shrink-0 border-b border-ink/10 px-3 py-2 2xl:pb-[27px] 2xl:pt-[21px]">
          <div
            className={mode === 'recipe' ? 'sr-only' : 'flex items-center justify-between gap-3'}
          >
            <SectionLabel>{mode === 'production' ? 'Produkcja' : 'Baza lodowa'}</SectionLabel>
            {demo || library.status === 'fallback' ? (
              <NonProductionBadge itemId="pro-demo-library" />
            ) : null}
          </div>
          {mode === 'recipe' ? (
            <div
              className="grid grid-cols-[minmax(0,1fr)_44px] items-center gap-2 md:grid-cols-[minmax(180px,1.5fr)_minmax(174px,.85fr)_minmax(202px,1fr)_96px_44px] 2xl:grid-cols-[minmax(300px,1fr)_222px_260px_76px_44px]"
              data-testid="ingredient-add-toolbar"
            >
              <span className="hidden min-w-0 md:block" aria-hidden />
              <div
                className="justify-self-start 2xl:-ml-[11px] 2xl:self-start"
                data-testid="ingredient-add-slot"
              >
                {picker}
              </div>
              <span
                className={
                  recalcPending
                    ? 'hidden text-right text-xs text-attention md:col-span-2 md:block'
                    : 'hidden text-right text-xs text-status-ideal md:col-span-2 md:block'
                }
                data-testid="pro-recalc-state"
                data-state={recalcPending ? 'pending' : 'current'}
              >
                <span aria-hidden className="mr-1.5">
                  •
                </span>
                {recalcPending ? 'Oczekuje na przeliczenie' : 'Obliczenie aktualne'}
              </span>
              {onRecalculate ? (
                <button
                  type="button"
                  onClick={onRecalculate}
                  aria-label="Przelicz z PI"
                  className="pro-focus-ring relative grid size-11 place-items-center rounded-xl border border-gold/35 bg-ink font-mono text-sm font-semibold text-white shadow-pro-e1 hover:bg-graphite 2xl:-mt-px 2xl:size-auto 2xl:h-[52px] 2xl:w-[54px] 2xl:border-transparent 2xl:bg-transparent 2xl:shadow-none 2xl:hover:bg-transparent"
                  data-testid="pro-workbar-recalc"
                >
                  <span
                    className="text-gold-soft 2xl:absolute 2xl:left-2 2xl:top-[7px] 2xl:grid 2xl:h-[38px] 2xl:w-[39px] 2xl:place-items-center 2xl:rounded-xl 2xl:border 2xl:border-gold/35 2xl:bg-ink 2xl:shadow-pro-e1"
                    data-testid="pi-control-core"
                  >
                    PI<sup className="text-[9px]">+</sup>
                  </span>
                </button>
              ) : null}
            </div>
          ) : (
            <div className="mt-2 flex items-center justify-between gap-3 border border-ink/10 bg-stone-50 px-3 py-2">
              <p className="text-xs text-stone-600">
                Odważ · skoryguj −/+ · potwierdź ✓. Potwierdzonego materiału PI nigdy nie odejmuje.
              </p>
              <span className="shrink-0 font-mono text-xs tabular-nums text-ink">
                {production?.progress
                  ? `${production.progress.confirmedCount}/${production.progress.totalCount}`
                  : '0/0'}
              </span>
              {!production ? (
                <span className="sr-only" data-readiness="W PRZYGOTOWANIU">
                  W PRZYGOTOWANIU
                </span>
              ) : null}
            </div>
          )}
          {mode === 'recipe' && pickerNotice ? (
            <p
              className="mt-2 rounded-xl border border-gold/25 bg-education-ivory px-3 py-2 text-xs text-stone-700"
              role="status"
              data-testid="product-picker-notice"
            >
              {pickerNotice}
            </p>
          ) : null}
          <p
            className="sr-only"
            role="status"
            aria-live="polite"
            data-testid="composition-reorder-status"
          >
            {reorderNotice}
          </p>
          {mode === 'recipe' && compositionMigrationAmbiguities.length > 0 ? (
            <div
              className="mt-2 rounded-xl border border-attention/30 bg-attention/[0.07] px-3 py-2 text-xs text-stone-700"
              role="status"
              data-testid="composition-migration-ambiguity"
            >
              <p>
                {compositionMigrationAmbiguities.length === 1
                  ? '1 historyczny wpis wymaga decyzji.'
                  : `${compositionMigrationAmbiguities.length} historyczne wpisy wymagają decyzji.`}
              </p>
              <ul className="mt-1 space-y-1">
                {compositionMigrationAmbiguities.map((issue) => {
                  const line = items.find((item) => item.id === issue.lineId);
                  const reason = issue.reason.startsWith('LEGACY_BEHAVIOR:')
                    ? issue.reason.slice('LEGACY_BEHAVIOR:'.length)
                    : 'Wybierz dla tej linii rolę Główny lub Standardowy.';
                  return <li key={`${issue.lineId}:${issue.reason}`}>{line?.ingredient.name ?? issue.lineId}: {reason}</li>;
                })}
              </ul>
            </div>
          ) : null}
          {mode === 'recipe' ? duplicateNotice : null}
        </div>
        {items.length === 0 && mode === 'production' ? (
          <p className="shrink-0 px-4 pt-4 text-sm leading-relaxed text-ivory/60">{b.empty}</p>
        ) : (
          <>
            {items.length > 0 ? (
              <div
                className={
                  mode === 'recipe'
                    ? 'sr-only'
                    : 'hidden shrink-0 border-b border-ink/[0.075] md:block'
                }
              >
                {header}
              </div>
            ) : null}
            <div className="min-h-0 flex-1 overflow-y-auto" data-testid="ingredient-rows-scroll">
              <div>
                {infeasibleNotice}
                {items.length > 0 ? (
                  rows
                ) : (
                  <p className="px-4 py-5 text-sm leading-relaxed text-stone-600">{b.empty}</p>
                )}
                {mode === 'recipe' ? (
                  <>
                    <div
                      className="flex items-center justify-between border-t border-ink/10 bg-stone-50 px-4 py-3"
                      data-testid="base-mass-total"
                    >
                      <span className="text-xs font-semibold tracking-[0.04em] text-stone-600 uppercase">
                        Baza lodowa
                      </span>
                      <strong className="font-mono text-sm tabular-nums text-ink">
                        {totalBatchG.toLocaleString('pl-PL', { maximumFractionDigits: 1 })} g
                      </strong>
                    </div>
                    <section
                      className="border-t border-status-ideal/15"
                      aria-labelledby="topping-section-heading"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3 bg-pro-sage/18 px-3 py-3">
                        <div>
                          <h3
                            id="topping-section-heading"
                            className="text-xs font-semibold tracking-[0.05em] text-ink uppercase"
                          >
                            Toppingi po produkcji
                          </h3>
                          <p className="mt-0.5 text-xs text-stone-600">
                            Nie zmieniają bilansu ani wyniku technicznego bazy.
                          </p>
                        </div>
                        <ProductPickerPopover
                          library={library}
                          scope="POST_PROCESS_ADDON"
                          behaviorContext={{
                            accountId: authUserId,
                            productProfile: behaviorProfile,
                            temperatureC: behaviorTemperatureC,
                            mode: behaviorMode,
                          }}
                          onAdd={addOrFocusTopping}
                        />
                      </div>
                      {toppings.length > 0 ? (
                        <>
                          <div
                            className={`${TOPPING_ROW_GRID} hidden border-y border-status-ideal/12 bg-pro-sage/12 px-3 py-2 md:grid`}
                          >
                            {['Topping', 'Ilość', 'Cena/kg', ''].map((label) => (
                              <span key={label || 'menu'} className={headCell}>
                                {label || '\u00a0'}
                              </span>
                            ))}
                          </div>
                          {toppingRows}
                        </>
                      ) : null}
                    </section>
                    <CompositionMassSummary baseMassG={totalBatchG} toppingMassG={toppingTotalG} />
                  </>
                ) : null}
              </div>
            </div>
            {mode === 'production' ? <div className="shrink-0 px-3 pb-1">{totalLine}</div> : null}
          </>
        )}
      </div>
    );
  }

  return (
    <Card padding="lg">
      <SectionLabel>{b.title}</SectionLabel>
      {duplicateNotice}
      {items.length === 0 ? (
        <p className="mt-6 text-sm leading-relaxed text-ivory/60">{b.empty}</p>
      ) : (
        <>
          <div className="mt-5 divide-y divide-ivory/10">
            {header}
            {infeasibleNotice}
            {rows}
          </div>
          {totalLine}
        </>
      )}
      <div className="mt-5">{picker}</div>
      <section className="mt-6 border-t border-status-ideal/20 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionLabel>Toppingi po produkcji</SectionLabel>
          <ProductPickerPopover
            library={library}
            scope="POST_PROCESS_ADDON"
            behaviorContext={{
              accountId: authUserId,
              productProfile: behaviorProfile,
              temperatureC: behaviorTemperatureC,
              mode: behaviorMode,
            }}
            onAdd={addOrFocusTopping}
          />
        </div>
        <div className="mt-3">{toppingRows}</div>
        <div className="mt-4 flex justify-between text-sm text-ivory/70">
          <span>Toppingi +{toppingTotalG.toLocaleString('pl-PL')} g</span>
          <strong>Produkt finalny {finalTotalG.toLocaleString('pl-PL')} g</strong>
        </div>
      </section>
    </Card>
  );
}
export function CompositionMassSummary({
  baseMassG,
  toppingMassG,
}: {
  baseMassG: number;
  toppingMassG: number;
}) {
  return (
    <div
      className="space-y-2 border-t border-ink/10 bg-white px-4 py-3"
      data-testid="composition-mass-summary"
    >
      <div className="flex items-center justify-between text-xs text-stone-600">
        <span>Toppingi</span>
        <strong className="font-mono tabular-nums text-ink">
          +{toppingMassG.toLocaleString('pl-PL', { maximumFractionDigits: 1 })} g
        </strong>
      </div>
      <div className="flex items-center justify-between border-t border-ink/10 pt-2">
        <span className="text-xs font-semibold tracking-[0.04em] text-ink uppercase">
          Produkt finalny
        </span>
        <strong className="font-mono text-base tabular-nums text-ink">
          {(baseMassG + toppingMassG).toLocaleString('pl-PL', { maximumFractionDigits: 1 })} g
        </strong>
      </div>
    </div>
  );
}
