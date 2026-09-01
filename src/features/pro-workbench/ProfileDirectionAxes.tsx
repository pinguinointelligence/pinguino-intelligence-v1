import { useMemo } from 'react';
import type { RecipeResult } from '@/engine';
import { cn } from '@/lib/cn';
import { buildRecipeDirectionPlan } from '@/features/recipe-direction/recipeDirectionTargets';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useRecipeStore } from '@/stores/recipeStore';
import type { AdjustableAxisId, DirectionIntent } from './recipeProfileStore';

const DETENTS = [-2, -1, 0, 1, 2] as const;

function readout(position: DirectionIntent): string {
  return position === 0 ? 'bez zmian' : position > 0 ? `+${position}` : `${position}`;
}

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
      /* OWNER FROZEN PRO VISUAL: a bipolar TRACK, not five boxed detents. The
         per-axis card border is gone — the axes read as one instrument, so the
         only rule in the group is the hairline between two axes. */
      className="py-3 first:pt-0 last:pb-0"
      data-testid={`profile-regulator-${id}`}
      data-regulator-state={disabled ? 'unavailable' : 'interactive'}
    >
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <b className="text-[13px] leading-[18px] font-bold text-[var(--g-ink)]">{label}</b>
        {/* The value left the thumb. Inside a 14 px orange dot it was white on
            #f58a07 (2.46:1) and, on a blocked axis, white on #fcd6a8 (1.37:1).
            As an ink readout beside the track it clears 4.5:1 in BOTH states
            and is legible at a glance instead of squinting at a dot. */}
        <span
          data-testid={`profile-regulator-${id}-value`}
          className={cn(
            'shrink-0 text-[11px] leading-[16px] font-semibold tabular-nums',
            disabled ? 'text-[var(--g-attention-ink)]' : 'text-[var(--g-ink)]',
          )}
        >
          {readout(position)}
        </span>
      </div>
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
        className="relative grid h-9 grid-cols-5 items-center justify-items-center"
      >
        {/* One continuous rail edge to edge, with the neutral centre marked so
            the control reads as bipolar before anything is touched. */}
        <span
          aria-hidden
          className="absolute top-1/2 right-[18px] left-[18px] h-[2px] -translate-y-1/2 rounded-full bg-[var(--g-rail-track)]"
        />
        <span
          aria-hidden
          className="absolute top-1/2 left-1/2 h-[9px] w-[2px] -translate-x-1/2 -translate-y-1/2 bg-[var(--g-line)]"
        />
        {DETENTS.map((detent) => (
          <button
            key={detent}
            type="button"
            role="radio"
            aria-checked={position === detent}
            aria-label={`${label}: ${detent > 0 ? `+${detent}` : detent}`}
            disabled={disabled}
            onClick={() => onSet(detent)}
            /* The button is a full 36 px target; only the dot inside it is
               small. The old design made the 28 px circle the whole control. */
            className="pro-focus-ring group relative z-10 grid size-9 place-items-center rounded-full bg-transparent"
          >
            <span
              aria-hidden
              className={cn(
                'block rounded-full transition-[background-color,box-shadow,width,height]',
                position === detent
                  ? 'size-[13px] bg-[#f58a07] shadow-[0_0_0_3px_var(--g-ivory)] group-disabled:bg-[#fcd6a8]'
                  : 'size-[6px] bg-[var(--g-rail-track)] group-enabled:group-hover:bg-[#f58a07]/60 group-disabled:bg-[var(--g-line-quiet)]',
              )}
            />
          </button>
        ))}
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-3 text-[9px] leading-[13px] text-[var(--g-text-muted)]">
        <span className="min-w-0 truncate">{leftLabel}</span>
        <span className="min-w-0 truncate text-right">{rightLabel}</span>
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
      className={cn('bg-transparent', className)}
      data-testid="profile-direction-axes"
    >
      <h3 className="mb-2 text-[11px] leading-[16px] font-semibold tracking-[0.08em] text-[var(--g-text-secondary)] uppercase">
        Dostosuj recepturę
      </h3>
      <div className="divide-y divide-[var(--g-line)]">
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
