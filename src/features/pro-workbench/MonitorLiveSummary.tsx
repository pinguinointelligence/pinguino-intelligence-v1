import { calculateRecipe, type RecipeInput, type RecipeResult } from '@/engine';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { profileSnapshotFromState } from './recipeProfilePersistence';
import {
  profileSettingsSignature,
  useRecipeProfileStore,
  type DirectionIntent,
} from './recipeProfileStore';

const INTENT: Record<DirectionIntent, string> = {
  [-2]: 'zdecydowanie mniej',
  [-1]: 'mniej',
  0: 'zbalansowanie',
  1: 'bardziej',
  2: 'zdecydowanie bardziej',
};

const metric = (result: RecipeResult | null, key: 'pod' | 'npac') =>
  result?.indicators.find((indicator) => indicator.key === key)?.value;

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
          className="mb-3 flex min-h-11 w-full items-center gap-2 rounded-[16px] border border-[#d7b768]/35 bg-[#d7b768]/10 px-3 py-2 text-left text-xs font-semibold text-[#f0dca7]"
          data-testid="monitor-preflight-reminder"
        >
          <span aria-hidden>⚠</span>
          <span className="flex-1">Sprawdź ustawienia receptury</span>
          <span aria-hidden>›</span>
        </button>
      ) : null}
      <div
        className="rounded-[20px] border border-white/9 bg-white/[0.045] p-4 text-white shadow-pro-e0"
        data-testid="monitor-direction-evidence"
      >
        <p className="text-xs font-semibold text-[#d7b768]">Kierunek · analiza</p>
        <p className="mt-1 text-xs leading-relaxed text-white/58">
          Kierunek ustawiasz w Profilu. Monitor pokazuje tylko bieżący i przygotowany wynik.
        </p>
        <div className="mt-3 grid gap-2">
          {(
            [
              ['Słodycz', 'pod', intents.sweetness],
              ['Miękkość', 'npac', intents.softness],
            ] as const
          ).map(([label, key, intent]) => {
            const before = metric(result, key);
            const after = metric(previewResult, key);
            return (
              <div
                key={key}
                className="rounded-[16px] border border-white/8 bg-white/[0.035] px-3 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <strong className="text-sm text-white">{label}</strong>
                  <span className="text-xs text-white/65">Wybrano: {INTENT[intent]}</span>
                </div>
                <p className="mt-1 font-mono text-xs tabular-nums text-white/72">
                  Teraz {key.toUpperCase()} {before?.toFixed(2) ?? '—'}
                  {after != null ? ` → Po zmianie ${key.toUpperCase()} ${after.toFixed(2)}` : ''}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
