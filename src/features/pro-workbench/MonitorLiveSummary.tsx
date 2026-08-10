import type { RecipeInput, RecipeResult } from '@/engine';
import { useRecipeStore } from '@/stores/recipeStore';
import { ProfileDirectionAxes } from './ProfileDirectionAxes';
import { profileSnapshotFromState } from './recipeProfilePersistence';
import { profileSettingsSignature, useRecipeProfileStore } from './recipeProfileStore';
import { monitorScoreView } from './monitorSummaryView';

export function MonitorLiveSummary({
  result,
  input,
  onOpenProfile,
}: {
  result: RecipeResult;
  input: RecipeInput;
  onOpenProfile?: () => void;
}) {
  const recipe = useRecipeStore();
  const targets = recipe.direction_targets;
  const confirmedSignature = useRecipeProfileStore((state) => state.confirmedSignature);
  const confirmedContextSeq = useRecipeProfileStore((state) => state.confirmedContextSeq);
  const currentSignature = profileSettingsSignature(
    profileSnapshotFromState(recipe, targets),
    recipe.draftContextSeq,
  );
  const confirmed =
    confirmedSignature === currentSignature && confirmedContextSeq === recipe.draftContextSeq;
  const score = monitorScoreView(result, input).match;

  return (
    <section data-testid="monitor-live-summary">
      {!confirmed ? (
        <button
          type="button"
          onClick={onOpenProfile}
          className="mb-2 flex w-full items-center gap-2 border border-gold/40 bg-gold/[0.055] px-3 py-2 text-left text-[10px] font-semibold text-attention"
          data-testid="monitor-preflight-reminder"
        >
          <span aria-hidden>⚠</span>
          <span className="flex-1">Sprawdź ustawienia receptury</span>
          <span aria-hidden>›</span>
        </button>
      ) : null}
      <div
        className="flex items-baseline gap-3 border-b border-ink/10 px-3 py-2"
        aria-label={score.ariaText}
        data-testid="monitor-summary-score"
      >
        <span className="font-mono text-2xl font-semibold tabular-nums text-ink">
          {result.total_batch_g > 0 ? score.display : '—/10'}
        </span>
        <strong className="text-sm text-ink">
          {result.total_batch_g > 0 ? score.label : 'Brak danych'}
        </strong>
      </div>
      <div data-testid="monitor-summary-axes">
        <ProfileDirectionAxes result={result} />
      </div>
    </section>
  );
}
