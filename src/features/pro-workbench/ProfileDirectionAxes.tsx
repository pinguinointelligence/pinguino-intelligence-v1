import type { RecipeResult } from '@/engine';
import { buildUserMonitorSummaryCards } from '@/features/user-monitor';
import { useRecipeStore } from '@/stores/recipeStore';
import { RecipeAxisScale } from './RecipeAxisScale';
import { actualPositionFromReading, targetStepToPosition } from './recipeAxisModel';
import { type AdjustableAxisId, useRecipeProfileStore } from './recipeProfileStore';

const directionDetails = {
  limitation: 'Cele kierunkowe są zapisane, ale nie sterują jeszcze reformulacją solvera.',
  calculationImpact: 'Przesunięcie celu nie zmienia gramów ani aktualnego wyniku.',
  remaining: 'Podłączyć cztery cele do zatwierdzonego kontraktu Preview i Apply.',
};

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
  const targets = useRecipeProfileStore((state) => state.directionTargets);
  const moveTarget = useRecipeProfileStore((state) => state.moveAxisTarget);
  const markProfileTargetChanged = useRecipeStore((state) => state.markProfileTargetChanged);
  const readings = new Map(
    buildUserMonitorSummaryCards(result).map((axis) => [axis.id, axis.reading]),
  );

  const move = (axis: AdjustableAxisId, delta: -1 | 1) => {
    const before = useRecipeProfileStore.getState().directionTargets[axis];
    moveTarget(axis, delta);
    if (useRecipeProfileStore.getState().directionTargets[axis] !== before) {
      markProfileTargetChanged();
    }
  };

  return (
    <section className="border-t border-ink/10 px-3 py-2" data-testid="profile-direction-axes">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[10px] font-semibold tracking-[0.08em] text-ink uppercase">
          Kierunek i stan
        </h3>
        <span
          className="inline-flex cursor-help items-center gap-1 border border-nonprod/35 bg-nonprod/[0.055] px-1.5 py-0.5 text-[8px] font-semibold tracking-[0.06em] text-nonprod uppercase"
          title={`${directionDetails.limitation} ${directionDetails.calculationImpact} ${directionDetails.remaining}`}
          data-readiness="W PRZYGOTOWANIU"
        >
          <span aria-hidden className="size-1 rounded-full bg-nonprod" />
          STEROWANIE W PRZYGOTOWANIU
        </span>
      </div>
      <div className="space-y-1.5">
        {ADJUSTABLE_AXES.map((axis) => (
          <RecipeAxisScale
            key={axis.id}
            id={axis.id}
            label={axis.label}
            adjustable
            targetPosition={targetStepToPosition(targets[axis.id])}
            actualPosition={actualPositionFromReading(readings.get(axis.readingId))}
            onDecrease={() => move(axis.id, -1)}
            onIncrease={() => move(axis.id, 1)}
          />
        ))}
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
