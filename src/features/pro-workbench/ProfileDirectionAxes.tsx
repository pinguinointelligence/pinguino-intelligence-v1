import { useMemo } from 'react';
import type { RecipeResult } from '@/engine';
import { cn } from '@/lib/cn';
import { buildRecipeDirectionPlan } from '@/features/recipe-direction/recipeDirectionTargets';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useRecipeStore } from '@/stores/recipeStore';
import type { AdjustableAxisId, DirectionIntent } from './recipeProfileStore';

const DETENTS = [-2, -1, 0, 1, 2] as const;

function RegulatorRow({
  id,
  label,
  position,
  leftLabel,
  rightLabel,
  onSet,
  disabled,
}: {
  id: string;
  label: string;
  position: DirectionIntent;
  leftLabel: string;
  rightLabel: string;
  onSet: (value: DirectionIntent) => void;
  disabled?: boolean;
}) {
  return (
    <article
      className="rounded-[16px] border border-ink/8 bg-white px-3 py-2 shadow-pro-e0"
      data-testid={`profile-regulator-${id}`}
      data-regulator-state={disabled ? 'unavailable' : 'interactive'}
    >
      <h4 className="text-xs font-semibold text-ink">{label}</h4>
      <div
        role="radiogroup"
        aria-label={label}
        aria-disabled={disabled || undefined}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
            event.preventDefault();
            onSet(Math.max(-2, position - 1) as DirectionIntent);
          } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
            event.preventDefault();
            onSet(Math.min(2, position + 1) as DirectionIntent);
          } else if (event.key === 'Home') {
            event.preventDefault();
            onSet(-2);
          } else if (event.key === 'End') {
            event.preventDefault();
            onSet(2);
          }
        }}
        className="mt-1 grid grid-cols-5 items-center justify-items-center gap-x-2 gap-y-1 min-[520px]:grid-cols-[minmax(68px,1fr)_repeat(5,36px)_minmax(68px,1fr)] min-[520px]:gap-2"
      >
        <span className="col-span-2 row-start-2 justify-self-start text-[10px] leading-tight text-stone-600 min-[520px]:col-span-1 min-[520px]:row-auto">
          {leftLabel}
        </span>
        {DETENTS.map((detent) => (
          <button
            key={detent}
            type="button"
            role="radio"
            aria-checked={position === detent}
            aria-label={`${label}: ${detent > 0 ? `+${detent}` : detent}`}
            disabled={disabled}
            onClick={() => onSet(detent)}
            className={cn(
              'pro-focus-ring row-start-1 grid size-9 place-items-center rounded-full border font-mono text-xs font-semibold tabular-nums transition-colors disabled:opacity-35 min-[520px]:row-auto',
              position === detent
                ? 'border-[#f58a07] bg-[#f58a07] text-white shadow-pro-e1'
                : 'border-ink/12 bg-white text-ink hover:border-[#f58a07]/60',
            )}
          >
            {detent > 0 ? `+${detent}` : detent}
          </button>
        ))}
        <span className="col-span-2 col-start-4 row-start-2 justify-self-end text-right text-[10px] leading-tight text-stone-600 min-[520px]:col-span-1 min-[520px]:col-start-auto min-[520px]:row-auto">
          {rightLabel}
        </span>
      </div>
    </article>
  );
}

export function ProfileDirectionAxes({
  result,
  className,
}: {
  result: RecipeResult;
  className?: string;
}) {
  const recipe = useRecipeStore();
  const intents = recipe.direction_targets;
  const directionPlan = buildRecipeDirectionPlan(buildRecipeInput(recipe));
  const statusByAxis = useMemo(
    () => new Map(directionPlan.axes.map((axis) => [axis.axis, axis])),
    [directionPlan.axes],
  );
  void result;

  const set = (axis: AdjustableAxisId, next: DirectionIntent) => {
    if (next === intents[axis]) return;
    recipe.setDirectionTarget(axis, next);
  };

  return (
    <section
      className={cn(
        'rounded-[18px] border border-ink/10 bg-white px-3 py-2.5 shadow-pro-e1',
        className,
      )}
      data-testid="profile-direction-axes"
    >
      <h3 className="mb-2 text-sm font-semibold text-ink">Dostosuj recepturę</h3>
      <div className="space-y-2">
        {(
          [
            ['sweetness', 'Słodycz'],
            ['softness', 'Twardość'],
          ] as const
        ).map(([axis, label]) => {
          const status = statusByAxis.get(axis);
          return (
            <RegulatorRow
              key={axis}
              id={axis}
              label={label}
              position={intents[axis]}
              leftLabel={axis === 'sweetness' ? 'Mniej słodkie' : 'Bardziej miękkie'}
              rightLabel={axis === 'sweetness' ? 'Bardziej słodkie' : 'Bardziej twarde'}
              onSet={(next) => set(axis, next)}
              disabled={status?.status !== 'working'}
            />
          );
        })}
      </div>
    </section>
  );
}
