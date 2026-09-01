import { useMemo } from 'react';
import type { RecipeResult } from '@/engine';
import { cn } from '@/lib/cn';
import { buildRecipeDirectionPlan } from '@/features/recipe-direction/recipeDirectionTargets';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useRecipeStore } from '@/stores/recipeStore';
import type { AdjustableAxisId, DirectionIntent } from './recipeProfileStore';

const DETENTS = [-2, -1, 0, 1, 2] as const;

/** `left:` for a detent, matching the frozen 0 / 25 / 50 / 75 / 100 spacing. */
const at = (detent: DirectionIntent) => `${((detent + 2) / 4) * 100}%`;

const sign = (detent: DirectionIntent) => (detent > 0 ? `+${detent}` : `${detent}`);

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
      /* OWNER FROZEN PRO VISUAL: a bipolar TRACK. The axes are one instrument —
         no per-axis card, just a rule between them. */
      className="[&+&]:mt-[22px] [&+&]:border-t [&+&]:border-[var(--g-line)] [&+&]:pt-5"
      data-testid={`profile-regulator-${id}`}
      data-regulator-state={disabled ? 'unavailable' : 'interactive'}
    >
      <div className="mb-3 flex items-baseline">
        <b className="text-[11px] leading-[16px] font-semibold tracking-[0.15em] text-[var(--g-text-secondary)] uppercase">
          {label}
        </b>
        {/* The value reads as text on the page ground. It used to be a numeral
            printed inside the thumb: white on #f58a07 is 2.46:1, and on a
            blocked axis white on #fcd6a8 is 1.37:1 — the control hid the very
            value it exists to report. Here, and in the numeral row below, it
            clears 4.5:1 in both states. */}
        <span
          data-testid={`profile-regulator-${id}-value`}
          className={cn(
            'ml-auto text-[11px] leading-[16px] tabular-nums',
            disabled ? 'text-[var(--g-attention-ink)]' : 'text-[var(--g-text-secondary)]',
          )}
        >
          {sign(position)}
        </span>
      </div>
      {/* 10 px of side room so the −2 and +2 thumbs stay inside the column. */}
      <div className="px-2.5">
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
          className="relative h-[26px]"
        >
          <span
            aria-hidden
            className="absolute inset-x-0 top-[11px] h-1 rounded-full bg-[var(--g-rail-track)]"
          />
          {DETENTS.map((detent) => (
            <span
              key={`tick-${detent}`}
              aria-hidden
              style={{ left: at(detent) }}
              className="absolute top-[9px] -ml-px h-2 w-0.5 rounded-[1px] bg-white shadow-[0_0_0_1px_var(--g-line)]"
            />
          ))}
          <span
            aria-hidden
            style={{ left: at(position) }}
            className={cn(
              'absolute top-[5px] -ml-2 size-4 rounded-full shadow-[0_0_0_3px_#fff] transition-[left,background-color]',
              disabled ? 'bg-[#fcd6a8]' : 'bg-[#f58a07]',
            )}
          />
          {DETENTS.map((detent) => (
            <button
              key={detent}
              type="button"
              role="radio"
              aria-checked={position === detent}
              aria-label={`${label}: ${sign(detent)}`}
              disabled={disabled}
              onClick={() => onSet(detent)}
              style={{ left: at(detent) }}
              /* A 26 px target centred on each tick — the mark is small, the
                 thing you press is not. */
              className="pro-focus-ring absolute top-0 -ml-[13px] size-[26px] rounded-full bg-transparent"
            />
          ))}
        </div>
        <div className="relative mt-1 h-4">
          {DETENTS.map((detent) => (
            <span
              key={`num-${detent}`}
              aria-hidden
              style={{ left: at(detent) }}
              className={cn(
                'absolute -translate-x-1/2 text-[10.5px] leading-4 tabular-nums',
                position === detent
                  ? 'font-bold text-[var(--g-ink)]'
                  : 'font-medium text-[var(--g-text-muted)]',
              )}
            >
              {sign(detent)}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-[9px] flex justify-between gap-3 text-[10.5px] leading-[14px] text-[var(--g-text-muted)]">
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
      className={cn('border-b border-[var(--g-line)] bg-transparent pb-5', className)}
      data-testid="profile-direction-axes"
    >
      <div className="mb-[13px] flex items-center gap-2.5">
        <h3 className="shrink-0 text-[10px] leading-[14px] font-semibold tracking-[0.16em] text-[var(--g-text-muted)] uppercase">
          Dostosuj recepturę
        </h3>
        <span aria-hidden className="h-px flex-1 bg-[var(--g-line)]" />
      </div>
      <div>
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
