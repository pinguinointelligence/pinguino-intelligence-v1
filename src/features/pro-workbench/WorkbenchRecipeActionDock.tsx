import type { RecipeInput, RecipeResult } from '@/engine';
import { WorkbenchActionBar } from './WorkbenchActionBar';
import { WorkbenchIntelligenceHeader, type MobileFlowStep } from './WorkbenchIntelligenceHeader';

export function WorkbenchRecipeActionDock({
  result,
  input,
  onRecalculate,
  onOpenPreview,
  onOpenLearning,
  mobileFlow,
}: {
  result: RecipeResult;
  input: RecipeInput;
  onRecalculate: () => void;
  onOpenPreview: () => void;
  onOpenLearning?: () => void;
  /** PRO MOBILE UX v2 · B6 — passed by the phone's bottom stack only. */
  mobileFlow?: MobileFlowStep;
}) {
  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-2"
      data-testid="workbench-recipe-action-dock"
    >
      <WorkbenchIntelligenceHeader
        result={result}
        input={input}
        variant="dock"
        onRecalculate={onRecalculate}
        onOpenLearning={onOpenLearning}
        mobileFlow={mobileFlow}
      />
      <WorkbenchActionBar onOpenPreview={onOpenPreview} />
    </div>
  );
}
