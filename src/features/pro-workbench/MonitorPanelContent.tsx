import { useMemo } from 'react';
import { useAccess } from '@/access/useAccess';
import {
  calculateRecipe,
  type CorrectionResult,
  type RecipeInput,
  type RecipeResult,
} from '@/engine';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { CorrectionPanel } from '@/features/corrections/CorrectionPanel';
import { buildCorrectionView } from '@/features/corrections/correctionView';
import { OwnerDiagnosticPanel } from '@/features/studio/OwnerDiagnosticPanel';
import { LockedPIPreview } from '@/features/studio/locked/LockedPIPreview';
import { ReviewMarkedModule } from '@/features/design-review/ReviewMarkedModule';
import { useRecipeStore } from '@/stores/recipeStore';
import { useSessionStore } from '@/stores/sessionStore';
import { ProfessionalMonitorModules } from './ProfessionalMonitorModules';
import { buildProfessionalMonitorModules } from './professionalMonitorModel';
import { MonitorLiveSummary } from './MonitorLiveSummary';
import { useReviewMode } from '@/features/design-review/useReviewMode';
import type { ProductionWorkspaceView } from '@/features/production-workspace/useProductionWorkspace';
import type { RecipeToppingItem } from '@/features/recipe-composition/recipeCompositionPersistence';
import { isCatalogLabelToppingIngredient } from '@/features/recipe-composition/labelTopping';
import { CatalogVerificationBadge } from '@/features/global-catalog/CatalogVerificationBadge';
import { polishPositionNoun } from './polishPositionNoun';
import { buildFallbackNotes } from '@/features/pi-panel/indicatorView';
import {
  buildRecipeBehaviorAuthority,
  recipeInputFromFrozenBehavior,
  recipeBehaviorLegacyInspection,
  recipeBehaviorModuleGate,
  useMonitorRecipeBehaviorRefresh,
} from '@/features/product-intelligence';

export function MonitorToppingSummary({
  toppings,
  actualByLineId = new Map(),
}: {
  toppings: readonly RecipeToppingItem[];
  actualByLineId?: ReadonlyMap<string, number>;
}) {
  if (toppings.length === 0) return null;
  const toppingMassG = toppings.reduce((sum, item) => sum + item.planned_grams, 0);
  return (
    <details
      className="overflow-hidden rounded-[14px] border border-status-ideal/20 bg-status-ideal/[0.04]"
      data-testid="monitor-topping-summary"
    >
      <summary className="cursor-pointer list-none px-4 py-3">
        <span className="flex items-center justify-between gap-3">
          <span>
            <strong className="block text-xs text-ink">Toppingi po produkcji</strong>
            <span className="mt-0.5 block text-xs text-stone-600">
              {toppings.length} {polishPositionNoun(toppings.length)} ·{' '}
              {toppingMassG.toLocaleString('pl-PL', { maximumFractionDigits: 1 })} g
            </span>
          </span>
          <span aria-hidden className="text-stone-600">
            ⌄
          </span>
        </span>
        <span className="mt-1 block text-xs text-status-ideal">Nie wpływają na bilans bazy.</span>
      </summary>
      <div className="divide-y divide-ink/8 border-t border-ink/8 px-4 py-1">
        {toppings.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 py-2.5 text-xs">
            <span className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 truncate text-stone-700">{item.ingredient.name}</span>
              {isCatalogLabelToppingIngredient(item.ingredient) ? (
                <CatalogVerificationBadge
                  status={item.ingredient.verification_status}
                  tone="light"
                />
              ) : null}
            </span>
            <span className="shrink-0 font-mono tabular-nums text-ink">
              {item.planned_grams.toLocaleString('pl-PL', { maximumFractionDigits: 1 })} g
              {actualByLineId.has(item.id)
                ? ` · faktycznie ${actualByLineId.get(item.id)!.toLocaleString('pl-PL', { maximumFractionDigits: 1 })} g`
                : item.actual_grams !== null
                  ? ` · faktycznie ${item.actual_grams.toLocaleString('pl-PL', { maximumFractionDigits: 1 })} g`
                  : ''}
            </span>
          </div>
        ))}
      </div>
    </details>
  );
}

export function MonitorPanelContent({
  result,
  servingTemperatureC,
  corrections,
  input,
  onOpenProfile,
  production,
}: {
  result: RecipeResult;
  servingTemperatureC: number;
  corrections: CorrectionResult;
  input: RecipeInput;
  onOpenProfile?: () => void;
  production?: ProductionWorkspaceView;
}) {
  const { technicalView } = useAccess();
  const ownerReviewMode = useReviewMode();
  const setPlan = useSessionStore((state) => state.setPlan);
  const preview = useConstraintStudioStore((state) => state.preview);
  const substitutionAuthorization = useConstraintStudioStore(
    (state) => state.substitutionAuthorization,
  );
  const onUpgrade = import.meta.env.DEV ? () => setPlan('pro') : undefined;
  const correctionView = useMemo(() => buildCorrectionView(corrections), [corrections]);
  const recipeIncomplete = result.total_batch_g <= 0;
  const toppings = useRecipeStore((state) => state.toppings);
  const behaviorSnapshots = useRecipeStore((state) => state.productBehaviorSnapshots);
  const savedRecipeId = useRecipeStore((state) => state.savedRecipeId);
  const behaviorAuthority = useMemo(
    () =>
      // The professional Monitor is the technical view of the Base. A
      // post-production topping has its own label/cost authority below, but
      // must never invalidate or recalculate the frozen Base result.
      buildRecipeBehaviorAuthority({ items: input.items, snapshots: behaviorSnapshots }),
    [behaviorSnapshots, input.items],
  );
  const monitorGate = useMemo(
    () => recipeBehaviorModuleGate(behaviorAuthority, 'MONITOR'),
    [behaviorAuthority],
  );
  const legacyInspection = recipeBehaviorLegacyInspection(behaviorAuthority, savedRecipeId);
  useMonitorRecipeBehaviorRefresh({
    enabled:
      technicalView &&
      !legacyInspection &&
      !monitorGate.ready &&
      behaviorAuthority.requiredLineIds.length > 0,
    blockedLineIds: monitorGate.blockedLineIds,
  });
  const frozenInput = useMemo(
    () => recipeInputFromFrozenBehavior(input, behaviorAuthority, 'technical'),
    [behaviorAuthority, input],
  );
  const monitorInput = legacyInspection ? input : frozenInput;
  const frozenResult = useMemo(
    () =>
      legacyInspection
        ? result
        : behaviorAuthority.requiredLineIds.length > 0
          ? calculateRecipe(frozenInput)
          : result,
    [behaviorAuthority.requiredLineIds.length, frozenInput, legacyInspection, result],
  );
  const modules = useMemo(
    () => buildProfessionalMonitorModules(frozenResult, servingTemperatureC, monitorInput),
    [frozenResult, monitorInput, servingTemperatureC],
  );
  const fallbackNotes = useMemo(() => buildFallbackNotes(frozenResult), [frozenResult]);
  const previewProjection = useMemo(() => {
    if (!preview || legacyInspection) return undefined;
    const previewSnapshots =
      substitutionAuthorization?.proposalProductBehaviorSnapshots ?? behaviorSnapshots;
    const previewAuthority = buildRecipeBehaviorAuthority({
      items: preview.proposedInput.items,
      snapshots: previewSnapshots,
    });
    const frozenPreviewInput = recipeInputFromFrozenBehavior(
      preview.proposedInput,
      previewAuthority,
      'technical',
    );
    const previewResult = calculateRecipe(frozenPreviewInput);
    return {
      result: previewResult,
      modules: buildProfessionalMonitorModules(
        previewResult,
        frozenPreviewInput.target_temperature_c,
        frozenPreviewInput,
      ),
    };
  }, [behaviorSnapshots, legacyInspection, preview, substitutionAuthorization]);
  // A genuinely legacy version remains inspectable, with an explicit warning,
  // until it is reconstructed into a new version. A partial/stale modern
  // authority must never silently fall back to independently interpreted facts.
  const technicalViewAllowed =
    technicalView &&
    (monitorGate.ready || legacyInspection || behaviorAuthority.requiredLineIds.length === 0);
  const actualToppingByLineId = new Map(
    (production?.session?.addonLines ?? [])
      .filter((line) => line.confirmed || line.physicalAddedGrams > 0)
      .map((line) => [line.lineId, line.physicalAddedGrams] as const),
  );

  return (
    <div
      className="pro-scroll-safe space-y-1.5 text-ink"
      data-testid="monitor-panel-content"
      data-behavior-authority={monitorGate.ready ? 'ready' : 'revalidation-required'}
    >
      {(legacyInspection || !monitorGate.ready) && behaviorAuthority.requiredLineIds.length > 0 ? (
        <div
          role="status"
          data-testid="monitor-behavior-revalidation"
          className="rounded-lg border border-attention/20 bg-attention/[0.05] px-3 py-2 text-xs leading-relaxed text-stone-700"
        >
          <p>
            {legacyInspection
              ? 'Podgląd historyczny. Przed edycją lub produkcją utwórz nową wersję z walidacją produktów.'
              : 'Monitor wymaga ponownej walidacji danych produktów użytych w tej recepturze.'}
          </p>
          {!legacyInspection && onOpenProfile ? (
            <button
              type="button"
              onClick={onOpenProfile}
              className="pro-focus-ring mt-2 min-h-10 rounded-lg border border-ink/12 bg-white px-3 py-2 font-semibold text-ink"
            >
              Wróć do receptury
            </button>
          ) : null}
        </div>
      ) : null}
      {technicalViewAllowed ? (
        <MonitorLiveSummary
          result={frozenResult}
          previewResult={previewProjection?.result}
          onOpenProfile={onOpenProfile}
        >
          <ProfessionalMonitorModules
            modules={modules}
            previewModules={previewProjection?.modules}
            embedded
          />
        </MonitorLiveSummary>
      ) : (
        <LockedPIPreview />
      )}

      {technicalViewAllowed && fallbackNotes.length > 0 ? (
        <div
          className="rounded-[12px] border border-attention/20 bg-[#fff8e8] px-3 py-2 text-xs leading-relaxed text-stone-700"
          role="status"
          data-testid="monitor-calibration-fallback"
        >
          {fallbackNotes.join(' ')}
        </div>
      ) : null}

      {technicalViewAllowed && !legacyInspection && correctionView.proposals.length > 0 ? (
        <details
          className="overflow-hidden rounded-[14px] border border-ink/9 bg-white"
          data-testid="monitor-correction-summary"
        >
          <summary className="cursor-pointer list-none px-4 py-3 text-xs font-semibold text-ink">
            PI ma propozycję poprawy →
          </summary>
          <div className="border-t border-ink/8 p-2">
            <CorrectionPanel
              corrections={corrections}
              onUpgrade={onUpgrade}
              recipeIncomplete={recipeIncomplete}
            />
          </div>
        </details>
      ) : null}

      <MonitorToppingSummary toppings={toppings} actualByLineId={actualToppingByLineId} />

      {ownerReviewMode ? (
        <div data-testid="monitor-owner-diagnostics" className="border-t border-ink/10 pt-2">
          <div
            className="[&_dd]:overflow-visible [&_dd]:text-left [&_dd]:break-words [&_dd]:whitespace-normal [&_dd]:text-clip"
            data-testid="monitor-advanced-unclipped"
          >
            <ReviewMarkedModule
              id="monitor-owner-diagnostic"
              title="Diagnostyka właściciela"
              badge="ADVANCED"
              note="Rzeczywisty stan Engine i solvera — poza codziennym Monitor Pro."
            >
              <OwnerDiagnosticPanel result={result} input={input} corrections={corrections} />
            </ReviewMarkedModule>
          </div>
        </div>
      ) : null}
    </div>
  );
}
