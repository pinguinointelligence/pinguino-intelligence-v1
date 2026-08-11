import type { RecipeInput, RecipeResult } from '@/engine';
import { monitorScoreView } from './monitorSummaryView';

export function WorkbenchIntelligenceHeader({
  result,
  input,
  onOpenLearning,
}: {
  result: RecipeResult;
  input: RecipeInput;
  onOpenLearning?: () => void;
}) {
  const match = monitorScoreView(result, input).match;
  const hasRecipe = result.total_batch_g > 0;

  return (
    <header
      className="border-b border-white/10 bg-[#17191d]/95 px-4 py-4 text-white shadow-pro-e2 backdrop-blur-xl"
      data-testid="workbench-intelligence-header"
      aria-label={`Dopasowanie techniczne receptury: ${hasRecipe ? match.display : 'brak danych'}`}
    >
      <button
        type="button"
        onClick={onOpenLearning}
        disabled={!onOpenLearning}
        className="pro-focus-ring flex min-h-14 w-full items-center gap-4 rounded-[18px] text-left disabled:cursor-default"
      >
        <span className="grid size-14 shrink-0 place-items-center rounded-[18px] border border-[#d7b768]/45 bg-white/[0.055] font-mono text-xl font-semibold tabular-nums text-[#f6efe0] shadow-pro-e0">
          {hasRecipe ? match.display : '—/10'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-medium text-[#d7b768]">
            Dopasowanie techniczne receptury
          </span>
          <strong className="mt-0.5 block text-base font-semibold text-white">
            {hasRecipe ? match.label : 'Brak danych'}
          </strong>
          <span className="mt-1 block text-xs leading-relaxed text-white/62">
            Bieżąca receptura · wynik nie zmienia miejsca między zakładkami
          </span>
        </span>
        {onOpenLearning ? (
          <span className="text-xl text-white/45" aria-hidden>
            ›
          </span>
        ) : null}
      </button>
    </header>
  );
}
