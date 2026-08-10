import { useEffect } from 'react';
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
  selectCanonicalDraft,
  useConstraintStudioStore,
} from '@/features/constraint-studio/constraintStudioStore';
import { NonProductionBadge } from '@/features/design-review/NonProductionMarker';
import { useRecipeStore } from '@/stores/recipeStore';
import { useCustomerPriceStore } from '@/stores/customerPriceStore';
import { useAuthStore } from '@/stores/authStore';
import {
  CUSTOMER_COST_CURRENCY,
  canPersistCustomerPrice,
  customerPriceCanonicalId,
  effectiveCostForIngredient,
} from '@/features/pro-core/effectiveRecipePricing';
import { effectiveLineCost } from '@/features/pro-core/costing';
import { IngredientPicker } from './IngredientPicker';
import {
  IngredientRow,
  PRODUCTION_ROW_GRID,
  ROW_GRID,
  type IngredientRowActions,
  type IngredientTableMode,
  type ProductionRowActions,
} from './IngredientRow';
import { ServerIngredientPicker } from './ServerIngredientPicker';
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

const b = copy.studio.builder;
const headCell = 'text-[0.6rem] font-medium tracking-label text-ivory/60 uppercase';

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
}: {
  items: EffectiveRecipeItem[];
  totalBatchG: number;
  targetBatchG: number;
  demo: boolean;
  layout?: 'card' | 'workbench';
  mode?: IngredientTableMode;
  production?: ProductionWorkspaceView;
}) {
  const queryClient = useQueryClient();
  const authUserId = useAuthStore((state) =>
    state.status === 'authed' ? (state.user?.id ?? null) : null,
  );
  const customerOwnerUserId =
    !demo && (authUserId ?? (import.meta.env.DEV ? '00000000-0000-0000-0000-000000000001' : null));
  const customerPrices = useCustomerPriceStore((state) => state.overridesByCanonicalId);
  const loadCustomerPrices = useCustomerPriceStore((state) => state.loadForOwner);
  const saveCustomerPrice = useCustomerPriceStore((state) => state.saveOverride);
  const resetCustomerPrice = useCustomerPriceStore((state) => state.resetOverride);

  useEffect(() => {
    if (!customerOwnerUserId) return;
    void loadCustomerPrices(customerOwnerUserId);
  }, [customerOwnerUserId, loadCustomerPrices]);

  const addIngredient = useRecipeStore((state) => state.addIngredient);
  const library = useIngredientLibrary({ demo });
  const { lockFor, wrapActions } = useLineLockControls();

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

  const actions: IngredientRowActions = {
    ...coreActions,
    setCustomerRole: (lineId, role) => {
      if (role === 'main') {
        setRoleMeta(lineId, 'standard');
        coreActions.setMainIngredient(lineId);
        return;
      }
      const current = useRecipeStore.getState().items.find((item) => item.id === lineId);
      if (current?.lock_type === 'main') coreActions.setLockType(lineId, 'unlocked');
      setRoleMeta(lineId, role);
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
    selectSubstitute: (lineId, candidate, mainIdentityConfirmed) => {
      if (!candidate.ingredient || !candidate.authorization) return;
      useConstraintStudioStore
        .getState()
        .createSubstitutionPreview(
          lineId,
          candidate.ingredient,
          candidate.authorization,
          mainIdentityConfirmed,
        );
    },
  };

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
          className="rounded-md border border-ivory/20 px-3 py-1.5 text-xs font-medium text-ivory transition-colors hover:border-ivory/40"
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

  const rows = items.map((item) => {
    const rawIngredient =
      storeItems.find((candidate) => candidate.id === item.id)?.ingredient ?? item.ingredient;
    const cost = effectiveCostForIngredient(rawIngredient, customerPrices);
    const canonicalId = customerPriceCanonicalId(rawIngredient);
    const priceView: IngredientPriceView = {
      cost,
      lineCost: effectiveLineCost(item.effective_grams, cost),
      canEdit:
        mode === 'recipe' && customerOwnerUserId !== null && canPersistCustomerPrice(rawIngredient),
      onSave:
        customerOwnerUserId && canonicalId
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
        customerOwnerUserId && canonicalId
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
        <p className="text-[10px] font-semibold tracking-label text-status-error uppercase">
          {b.ingredientTable.infeasible.title}
        </p>
        <p className="mt-1 text-[10px] leading-relaxed text-stone-600">
          {b.ingredientTable.infeasible.body} ({unresolved.map((entry) => entry.name).join(', ')})
        </p>
      </div>
    ) : null;

  const addIngredientAndResolveRequiredRole = (ingredient: Parameters<typeof addIngredient>[0]) => {
    addIngredient(ingredient);
    const normalizedName = ingredient.name.trim().toLocaleLowerCase('pl');
    for (const unresolvedEntry of Object.values(unresolvedByLineId)) {
      if (unresolvedEntry.name.trim().toLocaleLowerCase('pl') === normalizedName) {
        clearLineMeta(unresolvedEntry.lineId);
      }
    }
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

  const picker = library.serverSearch ? (
    <ServerIngredientPicker
      library={library}
      onAdd={addIngredientAndResolveRequiredRole}
      compact={layout === 'workbench'}
    />
  ) : (
    <IngredientPicker
      library={library}
      onAdd={addIngredientAndResolveRequiredRole}
      compact={layout === 'workbench'}
    />
  );

  if (layout === 'workbench') {
    return (
      <div className="flex h-full min-h-0 flex-col" data-testid="ingredient-editor-pane">
        <div className="shrink-0 border-b border-ink/10 px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <SectionLabel>{mode === 'production' ? 'Produkcja' : b.title}</SectionLabel>
            {demo || library.status === 'fallback' ? (
              <NonProductionBadge itemId="pro-demo-library" />
            ) : null}
          </div>
          {mode === 'recipe' ? (
            <div className="mt-2" data-testid="ingredient-add-slot">
              {picker}
            </div>
          ) : (
            <div className="mt-2 flex items-center justify-between gap-3 border border-ink/10 bg-stone-50 px-3 py-2">
              <p className="text-[10px] text-stone-600">
                Odważ · skoryguj −/+ · potwierdź ✓. Potwierdzonego materiału PI nigdy nie odejmuje.
              </p>
              <span className="shrink-0 font-mono text-[10px] tabular-nums text-ink">
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
          {mode === 'recipe' ? duplicateNotice : null}
        </div>
        {items.length === 0 ? (
          <p className="shrink-0 px-4 pt-4 text-sm leading-relaxed text-ivory/60">{b.empty}</p>
        ) : (
          <>
            <div className="hidden shrink-0 border-b border-ink/[0.075] md:block">{header}</div>
            <div className="min-h-0 flex-1 overflow-y-auto" data-testid="ingredient-rows-scroll">
              <div>
                {infeasibleNotice}
                {rows}
              </div>
            </div>
            <div className="shrink-0 px-3 pb-1">{totalLine}</div>
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
    </Card>
  );
}
