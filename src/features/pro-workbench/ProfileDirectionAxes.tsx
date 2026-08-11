import { useMemo } from 'react';
import { calculateRecipe, type RecipeResult } from '@/engine';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { buildRecipeDirectionPlan } from '@/features/recipe-direction/recipeDirectionTargets';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { buildUserMonitorSummaryCards } from '@/features/user-monitor';
import { useRecipeStore } from '@/stores/recipeStore';
import { RecipeAxisScale } from './RecipeAxisScale';
import {
  actualPositionFromReading,
  directionAxisRelation,
  metricPositionInNativeBand,
  targetBandPosition,
  targetStepToPosition,
} from './recipeAxisModel';
import { type AdjustableAxisId } from './recipeProfileStore';

const ADJUSTABLE_AXES: readonly {
  id: AdjustableAxisId;
  label: string;
  readingId: 'slodycz' | 'miekkosc' | 'kremowosc' | 'pelnia';
  decreaseActionLabel: string;
  increaseActionLabel: string;
}[] = [
  { id: 'sweetness', label: 'Słodycz', readingId: 'slodycz', decreaseActionLabel: 'mniej słodko', increaseActionLabel: 'bardziej słodko' },
  { id: 'softness', label: 'Miękkość', readingId: 'miekkosc', decreaseActionLabel: 'bardziej twardo', increaseActionLabel: 'bardziej miękko' },
  { id: 'creaminess', label: 'Kremowość', readingId: 'kremowosc', decreaseActionLabel: 'mniej kremowo', increaseActionLabel: 'bardziej kremowo' },
  { id: 'flavor', label: 'Intensywność smaku', readingId: 'pelnia', decreaseActionLabel: 'łagodniejszy smak', increaseActionLabel: 'intensywniejszy smak' },
];

const INFORMATION_AXES = [
  { id: 'structure', label: 'Struktura', readingId: 'struktura' as const },
  { id: 'stability', label: 'Stabilność', readingId: 'stabilnosc' as const },
] as const;

export function ProfileDirectionAxes({ result }: { result: RecipeResult }) {
  const recipe = useRecipeStore();
  const preview = useConstraintStudioStore((state) => state.preview);
  const previewResult = useMemo(
    () => (preview ? calculateRecipe(preview.proposedInput) : null),
    [preview],
  );
  const targets = recipe.direction_targets;
  const directionPlan = buildRecipeDirectionPlan(buildRecipeInput(recipe));
  const statusByAxis = new Map(directionPlan.axes.map((axis) => [axis.axis, axis]));
  const operationalAxisLabels = ADJUSTABLE_AXES.filter(
    (axis) => statusByAxis.get(axis.id)?.status === 'working',
  ).map((axis) => axis.label);
  const readings = new Map(
    buildUserMonitorSummaryCards(result).map((axis) => [axis.id, axis.reading]),
  );

  const move = (axis: AdjustableAxisId, delta: -1 | 1) => {
    recipe.moveDirectionTarget(axis, delta);
  };

  return (
    <section className="mx-3 my-3 rounded-xl border border-pro-line bg-white/80 px-3 py-3 shadow-pro-sm" data-testid="profile-direction-axes">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[10px] font-semibold tracking-[0.08em] text-ink uppercase">
          Kierunek i stan
        </h3>
        <span
          className={
            operationalAxisLabels.length > 0
              ? 'text-[10px] font-semibold tracking-[0.06em] text-status-ideal uppercase'
              : 'text-[10px] font-semibold tracking-[0.06em] text-nonprod uppercase'
          }
        >
          {operationalAxisLabels.length > 0
            ? `${operationalAxisLabels.join(' i ')} · Preview`
            : 'Brak zweryfikowanego Preview'}
        </span>
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-medium tracking-[0.04em] text-stone-500" aria-label="Legenda kierunku">
        <span className="flex items-center gap-1"><i className="size-2 rounded-full bg-pro-graphite" />Teraz</span>
        <span className="flex items-center gap-1"><i className="h-3 w-px bg-gold" />Cel</span>
        <span className="flex items-center gap-1"><i className="size-2.5 rounded-full border-2 border-gold" />Preview</span>
      </div>
      <div className="space-y-0.5">
        {ADJUSTABLE_AXES.map((axis) => {
          const state = statusByAxis.get(axis.id);
          const working = state?.status === 'working';
          const readiness =
            state?.status === 'blocked_runtime'
              ? 'NIEOBSŁUGIWANE'
              : state?.status === 'blocked_data'
                ? 'BRAK DANYCH'
                : state?.status === 'blocked_science'
                  ? 'WYMAGA KALIBRACJI'
                  : 'DZIAŁA';
          const indicator = state?.metric
            ? result.indicators.find((candidate) => candidate.key === state.metric)
            : undefined;
          const hasMetricScale =
            working &&
            state?.targetBand != null &&
            indicator?.band != null &&
            indicator.value != null &&
            Number.isFinite(indicator.value);
          const targetPosition = hasMetricScale
            ? targetBandPosition(state.targetBand!, indicator!.band!)
            : targetStepToPosition(targets[axis.id]);
          const actualPosition = hasMetricScale
            ? metricPositionInNativeBand(indicator!.value!, indicator!.band!)
            : actualPositionFromReading(readings.get(axis.readingId));
          const relation = hasMetricScale
            ? directionAxisRelation(indicator!.value!, indicator!.band!, state.targetBand!)
            : undefined;
          const previewIndicator = state?.metric
            ? previewResult?.indicators.find((candidate) => candidate.key === state.metric)
            : undefined;
          const previewPosition =
            previewIndicator?.value != null && previewIndicator.band != null
              ? metricPositionInNativeBand(previewIndicator.value, previewIndicator.band)
              : undefined;
          return (
            <RecipeAxisScale
              key={axis.id}
              id={axis.id}
              label={axis.label}
              adjustable={working}
              readiness={readiness}
              readinessReason={state?.reason ?? undefined}
              targetPosition={targetPosition}
              actualPosition={actualPosition}
              previewPosition={previewPosition}
              relation={relation}
              decreaseActionLabel={axis.decreaseActionLabel}
              increaseActionLabel={axis.increaseActionLabel}
              onDecrease={() => move(axis.id, -1)}
              onIncrease={() => move(axis.id, 1)}
            />
          );
        })}
        <div className="my-1.5 border-t border-ink/8" />
        {INFORMATION_AXES.map((axis) => (
          <RecipeAxisScale
            key={axis.id}
            id={axis.id}
            label={axis.label}
            targetPosition={50}
            actualPosition={actualPositionFromReading(readings.get(axis.readingId))}
          />
        ))}
      </div>
    </section>
  );
}
