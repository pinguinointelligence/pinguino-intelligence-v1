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
      /* GELLATTI V2.1: one 66 px bordered band per axis — identity on the left,
         the five detents ON the rail in the middle, the far label on the right. */
      className="rounded-[9px] border border-[var(--g-line)] bg-transparent px-2.5 py-2.5 xl:min-h-[66px]"
      data-testid={`profile-regulator-${id}`}
      data-regulator-state={disabled ? 'unavailable' : 'interactive'}
    >
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
        className="grid grid-cols-2 items-center gap-x-3 gap-y-1 min-[520px]:grid-cols-[minmax(86px,1fr)_minmax(0,272px)_minmax(86px,1fr)] min-[520px]:gap-2.5"
      >
        <span className="row-start-2 min-w-0 justify-self-start min-[520px]:row-auto">
          <b className="block text-[11px] leading-[17px] font-bold text-[var(--g-ink)]">{label}</b>
          <small className="block text-[9px] leading-[13px] text-[var(--g-text-muted)]">
            {leftLabel}
          </small>
        </span>
        <span className="relative col-span-2 col-start-1 row-start-1 grid h-7 grid-cols-5 items-center justify-items-center min-[520px]:col-span-1 min-[520px]:col-start-2">
          {/* The rail is a real rail: the five detents sit ON it, they are not
              five detached circles (owner §12). */}
          <span
            aria-hidden
            className="absolute top-1/2 right-[14px] left-[14px] h-[2px] -translate-y-1/2 bg-[var(--g-rail-track)]"
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
              className={cn(
                'pro-focus-ring relative z-10 grid size-7 place-items-center rounded-full border text-[9px] font-bold tabular-nums transition-colors',
                position === detent
                  ? 'border-[#f58a07] bg-[#f58a07] text-white'
                  : 'border-[var(--g-line)] bg-white text-[var(--g-ink)] enabled:hover:border-[#f58a07]/60',
                /* An unavailable axis still reports the chosen detent, so the row
                   carries explicit muted colours instead of a group opacity.
                   Dimming the group flattened the selected point to white on
                   #fcd6a8 (1.37:1) and hid the very value it reports. */
                position === detent
                  ? 'disabled:border-[#fcd6a8] disabled:bg-[#fcd6a8] disabled:text-[var(--g-attention-ink)]'
                  : 'disabled:border-[var(--g-line-quiet)] disabled:bg-white disabled:text-[var(--g-text-muted)]',
              )}
            >
              {detent > 0 ? `+${detent}` : detent}
            </button>
          ))}
        </span>
        <span className="col-start-2 row-start-2 justify-self-end text-right text-[9px] leading-[13px] text-[var(--g-text-muted)] min-[520px]:col-start-3 min-[520px]:row-auto">
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
        'rounded-[10px] border border-[var(--g-line)] bg-white px-4 py-4 shadow-none',
        className,
      )}
      data-testid="profile-direction-axes"
    >
      <h3 className="mb-3 text-[18px] leading-[20px] font-bold text-[var(--g-ink)]">
        Dostosuj recepturę
      </h3>
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
