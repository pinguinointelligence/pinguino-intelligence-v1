import type { RecipeResult } from '@/engine';
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
}[] = [
  { id: 'sweetness', label: 'Słodycz', readingId: 'slodycz' },
  { id: 'softness', label: 'Miękkość', readingId: 'miekkosc' },
  { id: 'creaminess', label: 'Kremowość', readingId: 'kremowosc' },
  { id: 'flavor', label: 'Intensywność smaku', readingId: 'pelnia' },
];

const INFORMATION_AXES = [
  { id: 'structure', label: 'Struktura', readingId: 'struktura' as const },
  { id: 'stability', label: 'Stabilność', readingId: 'stabilnosc' as const },
] as const;

export function ProfileDirectionAxes({ result }: { result: RecipeResult }) {
  const recipe = useRecipeStore();
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
    <section className="border-t border-ink/10 px-3 py-2" data-testid="profile-direction-axes">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[10px] font-semibold tracking-[0.08em] text-ink uppercase">
          Kierunek i stan
        </h3>
        <span
          className={
            operationalAxisLabels.length > 0
              ? 'text-[8px] font-semibold tracking-[0.06em] text-status-ideal uppercase'
              : 'text-[8px] font-semibold tracking-[0.06em] text-nonprod uppercase'
          }
        >
          {operationalAxisLabels.length > 0
            ? `${operationalAxisLabels.join(' i ')} · Preview`
            : 'Brak zweryfikowanego Preview'}
        </span>
      </div>
      <div className="space-y-1.5">
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
              relation={relation}
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
