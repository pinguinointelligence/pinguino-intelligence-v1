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

export function MonitorPanelContent({
  result,
  servingTemperatureC,
  corrections,
  input,
  onOpenProfile,
}: {
  result: RecipeResult;
  servingTemperatureC: number;
  corrections: CorrectionResult;
  input: RecipeInput;
  onOpenProfile?: () => void;
}) {
  const { technicalView } = useAccess();
  const ownerReviewMode = useReviewMode();
  const setPlan = useSessionStore((state) => state.setPlan);
  const machineId = useRecipeStore((state) => state.machineId);
  const preview = useConstraintStudioStore((state) => state.preview);
  const [processGuideOpen, setProcessGuideOpen] = useState(false);
  const onUpgrade = import.meta.env.DEV ? () => setPlan('pro') : undefined;
  const modules = useMemo(
    () => buildProfessionalMonitorModules(result, servingTemperatureC, input),
    [input, result, servingTemperatureC],
  );
  const previewModules = useMemo(() => {
    if (!preview) return undefined;
    const previewResult = calculateRecipe(preview.proposedInput);
    return buildProfessionalMonitorModules(
      previewResult,
      preview.proposedInput.target_temperature_c,
      preview.proposedInput,
    );
  }, [preview]);
  const correctionView = useMemo(() => buildCorrectionView(corrections), [corrections]);
  const recipeIncomplete = result.total_batch_g <= 0;
  const processRuntime = useRecipeProcessRuntime(input);

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
    <div className="pro-scroll-safe space-y-3 text-white" data-testid="monitor-panel-content">
      <MonitorLiveSummary result={result} input={input} onOpenProfile={onOpenProfile} />

      {technicalView ? (
        <ProfessionalMonitorModules modules={modules} previewModules={previewModules} />
      ) : (
        <LockedPIPreview />
      )}

      {correctionView.proposals.length > 0 ? (
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
          {technicalView ? (
            <NutritionCostScorePanel result={result} embedded />
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
