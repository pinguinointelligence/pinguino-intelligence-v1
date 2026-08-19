import type { RecipeInput, RecipeResult } from '@/engine';
import { WorkbenchActionBar } from './WorkbenchActionBar';
import { WorkbenchIntelligenceHeader } from './WorkbenchIntelligenceHeader';

export function WorkbenchRecipeActionDock({
  result,
  input,
  onRecalculate,
  onOpenPreview,
  onOpenLearning,
}: {
  result: RecipeResult;
  input: RecipeInput;
  onRecalculate: () => void;
  onOpenPreview: () => void;
  onOpenLearning?: () => void;
}) {
  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-2"
      data-testid="workbench-recipe-action-dock"
    >
      <div className="xl:hidden">
        <WorkbenchIntelligenceHeader
          result={result}
          input={input}
          variant="dock"
          onRecalculate={onRecalculate}
          onOpenLearning={onOpenLearning}
        />
      </div>
      <WorkbenchActionBar onOpenPreview={onOpenPreview} />
    </div>
  );
}
