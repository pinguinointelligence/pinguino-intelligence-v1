import { useMemo, useState } from 'react';
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
import { NutritionCostScorePanel } from '@/features/pi-panel/NutritionCostScorePanel';
import { OwnerDiagnosticPanel } from '@/features/studio/OwnerDiagnosticPanel';
import { LockedNutritionPreview } from '@/features/studio/locked/LockedNutritionPreview';
import { LockedPIPreview } from '@/features/studio/locked/LockedPIPreview';
import { ReviewMarkedModule } from '@/features/design-review/ReviewMarkedModule';
import { ContextualEducationView } from '@/features/education/ContextualEducationView';
import { ProcessGuideEntry } from '@/features/education/ProcessGuideEntry';
import { useRecipeProcessRuntime } from '@/features/education/useRecipeProcessRuntime';
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
import {
  buildRecipeBehaviorAuthority,
  frozenProcessEvidence,
  recipeInputFromFrozenBehavior,
  recipeBehaviorLegacyInspection,
  recipeBehaviorModuleGate,
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
      className="overflow-hidden rounded-[20px] border border-status-ideal/20 bg-status-ideal/[0.055]"
      data-testid="monitor-topping-summary"
    >
      <summary className="cursor-pointer list-none px-4 py-3">
        <span className="flex items-center justify-between gap-3">
          <span>
            <strong className="block text-xs text-white">Toppingi po produkcji</strong>
            <span className="mt-0.5 block text-xs text-white/58">
              {toppings.length} {polishPositionNoun(toppings.length)} ·{' '}
              {toppingMassG.toLocaleString('pl-PL', { maximumFractionDigits: 1 })} g
            </span>
          </span>
          <span aria-hidden className="text-white/60">
            ⌄
          </span>
        </span>
        <span className="mt-1 block text-xs text-[#c9d4c2]">Nie wpływają na bilans bazy.</span>
      </summary>
      <div className="divide-y divide-white/8 border-t border-white/8 px-4 py-1">
        {toppings.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 py-2.5 text-xs">
            <span className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 truncate text-white/75">{item.ingredient.name}</span>
              {isCatalogLabelToppingIngredient(item.ingredient) ? (
                <CatalogVerificationBadge
                  status={item.ingredient.verification_status}
                  tone="dark"
                />
              ) : null}
            </span>
            <span className="shrink-0 font-mono tabular-nums text-white">
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
  const machineId = useRecipeStore((state) => state.machineId);
  const preview = useConstraintStudioStore((state) => state.preview);
  const substitutionAuthorization = useConstraintStudioStore(
    (state) => state.substitutionAuthorization,
  );
  const [processGuideOpen, setProcessGuideOpen] = useState(false);
  const onUpgrade = import.meta.env.DEV ? () => setPlan('pro') : undefined;
  const correctionView = useMemo(() => buildCorrectionView(corrections), [corrections]);
  const recipeIncomplete = result.total_batch_g <= 0;
  const toppings = useRecipeStore((state) => state.toppings);
  const behaviorSnapshots = useRecipeStore((state) => state.productBehaviorSnapshots);
  const savedRecipeId = useRecipeStore((state) => state.savedRecipeId);
  const behaviorAuthority = useMemo(
    () =>
      buildRecipeBehaviorAuthority({ items: input.items, toppings, snapshots: behaviorSnapshots }),
    [behaviorSnapshots, input.items, toppings],
  );
  const monitorGate = useMemo(
    () => recipeBehaviorModuleGate(behaviorAuthority, 'MONITOR'),
    [behaviorAuthority],
  );
  const legacyInspection = recipeBehaviorLegacyInspection(behaviorAuthority, savedRecipeId);
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
  const previewModules = useMemo(() => {
    if (!preview || legacyInspection) return undefined;
    const previewSnapshots =
      substitutionAuthorization?.proposalProductBehaviorSnapshots ?? behaviorSnapshots;
    const previewAuthority = buildRecipeBehaviorAuthority({
      items: preview.proposedInput.items,
      toppings,
      snapshots: previewSnapshots,
    });
    const frozenPreviewInput = recipeInputFromFrozenBehavior(
      preview.proposedInput,
      previewAuthority,
      'technical',
    );
    const previewResult = calculateRecipe(frozenPreviewInput);
    return buildProfessionalMonitorModules(
      previewResult,
      frozenPreviewInput.target_temperature_c,
      frozenPreviewInput,
    );
  }, [behaviorSnapshots, legacyInspection, preview, substitutionAuthorization, toppings]);
  const processFacts = useMemo(() => frozenProcessEvidence(behaviorAuthority), [behaviorAuthority]);
  const processRuntime = useRecipeProcessRuntime(
    monitorInput,
    behaviorAuthority.requiredLineIds.length > 0
      ? legacyInspection
        ? []
        : processFacts.evidence
      : undefined,
  );
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

  if (processGuideOpen) {
    return (
      <ContextualEducationView
        input={input}
        machineId={machineId}
        audience="pro"
        initialLesson="process"
        processEvidence={processRuntime.evidence}
        onBack={() => setProcessGuideOpen(false)}
      />
    );
  }

  return (
    <div
      className="pro-scroll-safe space-y-3 text-white"
      data-testid="monitor-panel-content"
      data-behavior-authority={monitorGate.ready ? 'ready' : 'revalidation-required'}
    >
      {(legacyInspection || !monitorGate.ready) && behaviorAuthority.requiredLineIds.length > 0 ? (
        <div
          role="status"
          data-testid="monitor-behavior-revalidation"
          className="rounded-lg border border-ivory/20 bg-ivory/[0.06] px-3 py-2 text-xs leading-relaxed text-ivory/80"
        >
          {legacyInspection
            ? 'Podgląd historyczny. Przed edycją lub produkcją utwórz nową wersję z walidacją produktów.'
            : monitorGate.reason}
        </div>
      ) : null}
      {technicalViewAllowed ? (
        <MonitorLiveSummary
          result={frozenResult}
          input={monitorInput}
          onOpenProfile={onOpenProfile}
        />
      ) : (
        <LockedPIPreview />
      )}

      {technicalViewAllowed ? (
        <ProfessionalMonitorModules modules={modules} previewModules={previewModules} />
      ) : null}

      {technicalViewAllowed && !legacyInspection && correctionView.proposals.length > 0 ? (
        <details
          className="overflow-hidden rounded-[20px] border border-white/9 bg-white/[0.035]"
          data-testid="monitor-correction-summary"
        >
          <summary className="cursor-pointer list-none px-4 py-3 text-xs font-semibold text-white">
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

      <details
        className="overflow-hidden rounded-[20px] border border-white/9 bg-white/[0.035]"
        data-testid="monitor-secondary-nutrition"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-xs font-semibold text-white/72">
          <span>Wartości odżywcze i koszty</span>
          <span className="rounded-md border border-nonprod-soft/40 bg-nonprod/[0.08] px-2 py-1 text-xs text-nonprod-soft">
            DO PRZEGLĄDU
          </span>
        </summary>
        <div className="border-t border-white/8 bg-[#f7f5f0] p-2 text-ink">
          {technicalViewAllowed ? (
            <NutritionCostScorePanel result={frozenResult} embedded />
          ) : (
            <LockedNutritionPreview />
          )}
        </div>
      </details>

      <ProcessGuideEntry
        classification={processRuntime.classification}
        loading={processRuntime.loading}
        onOpen={() => setProcessGuideOpen(true)}
      />

      <MonitorToppingSummary toppings={toppings} actualByLineId={actualToppingByLineId} />

      {ownerReviewMode ? (
        <div data-testid="monitor-owner-diagnostics" className="border-t border-white/10 pt-2">
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
