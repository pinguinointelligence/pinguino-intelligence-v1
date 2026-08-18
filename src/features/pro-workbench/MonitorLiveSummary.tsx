import { calculateRecipe, type RecipeInput, type RecipeResult } from '@/engine';
import { bandPosition } from '@/features/recipe-score';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { profileSnapshotFromState } from './recipeProfilePersistence';
import {
  profileSettingsSignature,
  useRecipeProfileStore,
  type DirectionIntent,
} from './recipeProfileStore';
import { MonitorRangeScale } from './ProfessionalMonitorModules';

const INTENT: Record<DirectionIntent, string> = {
  [-2]: 'zdecydowanie mniej',
  [-1]: 'mniej',
  0: 'zbalansowanie',
  1: 'bardziej',
  2: 'zdecydowanie bardziej',
};

const metric = (result: RecipeResult | null, key: 'pod' | 'npac') =>
  result?.indicators.find((indicator) => indicator.key === key);

export function MonitorLiveSummary({
  result,
  onOpenProfile,
}: {
  result: RecipeResult;
  input: RecipeInput;
  onOpenProfile?: () => void;
}) {
  const recipe = useRecipeStore();
  const intents = useRecipeProfileStore((state) => state.directionIntents);
  const preview = useConstraintStudioStore((state) => state.preview);
  const previewResult = preview ? calculateRecipe(preview.proposedInput) : null;
  const confirmedSignature = useRecipeProfileStore((state) => state.confirmedSignature);
  const confirmedContextSeq = useRecipeProfileStore((state) => state.confirmedContextSeq);
  const currentSignature = profileSettingsSignature(
    profileSnapshotFromState(recipe, recipe.direction_targets),
    recipe.draftContextSeq,
  );
  const confirmed =
    confirmedSignature === currentSignature && confirmedContextSeq === recipe.draftContextSeq;

  return (
    <section data-testid="monitor-live-summary">
      {!confirmed ? (
        <button
          type="button"
          onClick={onOpenProfile}
          className="mb-3 flex min-h-11 w-full items-center gap-2 rounded-[16px] border border-[#d7b768]/35 bg-[#fff8e8] px-3 py-2 text-left text-xs font-semibold text-stone-700"
          data-testid="monitor-preflight-reminder"
        >
          <span aria-hidden>⚠</span>
          <span className="flex-1">Sprawdź ustawienia receptury</span>
          <span aria-hidden>›</span>
        </button>
      ) : null}
      <div data-testid="monitor-direction-evidence">
        <div className="mb-3 px-1">
          <h2 className="text-base font-semibold text-ink">Monitor receptury</h2>
          <p className="mt-0.5 text-xs text-stone-600">Bieżący wynik dla wybranych ustawień.</p>
        </div>
        <div className="grid gap-2">
          {(
            [
              ['Słodycz', 'pod', intents.sweetness],
              ['Twardość', 'npac', intents.softness],
            ] as const
          ).map(([label, key, intent]) => {
            const before = metric(result, key);
            const after = metric(previewResult, key);
            const beforeReading = before?.band ? bandPosition(before.value, before.band) : null;
            const afterReading = after?.band ? bandPosition(after.value, after.band) : null;
            return (
              <div
                key={key}
                className="monitor-summary-grid grid min-h-[86px] items-center gap-3 rounded-[14px] border border-ink/9 bg-white px-3 py-3"
                data-testid={`monitor-module-${key === 'pod' ? 'sweetness' : 'hardness'}`}
              >
                <span
                  aria-hidden
                  className={`grid size-8 place-items-center text-xl ${key === 'pod' ? 'text-[#ef3249]' : 'text-[#1676f3]'}`}
                >
                  {key === 'pod' ? '✣' : '◇'}
                </span>
                <span className="min-w-0">
                  <strong className="block text-sm font-semibold text-ink">{label}</strong>
                  <span className="mt-0.5 block truncate text-[10px] text-stone-600">
                    Wybrano: {INTENT[intent]}
                  </span>
                </span>
                <MonitorRangeScale
                  reading={beforeReading}
                  previewReading={afterReading}
                  testId={`monitor-scale-${key}`}
                  tolerance={28}
                  label={label}
                />
                <span className="flex items-center justify-end gap-2 text-right">
                  <span className="rounded-[8px] border border-ink/8 bg-stone-50 px-2 py-1 text-[10px] font-semibold text-ink">
                    {key.toUpperCase()}
                  </span>
                  <span className="font-mono text-sm font-semibold tabular-nums text-ink">
                    {before?.value == null ? '—' : before.value.toFixed(2)}
                  </span>
                </span>
                <span aria-hidden />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
