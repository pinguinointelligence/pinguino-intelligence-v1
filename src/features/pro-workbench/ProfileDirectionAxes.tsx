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
  onSet,
  disabled,
}: {
  id: string;
  label: string;
  position: DirectionIntent;
  onSet: (value: DirectionIntent) => void;
  disabled?: boolean;
}) {
  /* The fill spans CENTRE → current position, so the track reads as a bipolar
     instrument: which way you went, and how far. A rail filled from the left
     end would read as a volume slider — a different claim about the axis. */
  const fillLeft = position >= 0 ? '50%' : at(position);
  const fillWidth = `${Math.abs(position) * 25}%`;
  return (
    <article
      /* OWNER AUTHORITY 2026-09-03 (approved desktop reference): the axis is
         ONE ROW — its name on the left, its track on the right. The stacked
         form (name above, track below, numerals under that, end labels under
         those) spent four lines on what the reference says in one, and made
         two axes taller than the whole result readout above them. */
      className="grid grid-cols-[104px_1fr] items-center gap-5 py-[5px]"
      data-testid={`profile-regulator-${id}`}
      data-regulator-state={disabled ? 'unavailable' : 'interactive'}
    >
      <b className="min-w-0 truncate text-[15px] leading-[21px] font-semibold tracking-[-0.02em] text-[var(--g-ink)]">
        {label}
      </b>
      {/* 13 px, not 10: the side room has to clear the widest thing centred on
          an end detent, and that is the 26 px HIT TARGET, not the 16 px thumb.
          At 10 px the −2 and +2 targets overflowed the display column by 3 px
          each — measured, not visible, but a real horizontal overflow. */}
      <div className="min-w-0 px-[13px]">
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
          {DETENTS.map((detent) => (
            <span
              key={`dot-${detent}`}
              aria-hidden
              style={{ left: at(detent) }}
              className="absolute top-[9.5px] -ml-[3.5px] size-[7px] rounded-full bg-[var(--g-rail-track)]"
            />
          ))}
          <span
            aria-hidden
            style={{ left: fillLeft, width: fillWidth }}
            className={cn(
              'absolute top-[11.5px] h-[3px] rounded-full transition-[left,width,background-color]',
              disabled ? 'bg-[#fcd6a8]' : 'bg-[#f58a07]',
            )}
          />
          {/* The neutral centre stays visible as a hollow detent whenever it is
              not the current position, so "back to neutral" is always a target
              you can see and aim at rather than a coordinate you infer. */}
          {position !== 0 ? (
            <span
              aria-hidden
              style={{ left: at(0) }}
              className="absolute top-[7.5px] -ml-[5.5px] size-[11px] rounded-full border-[1.5px] border-[var(--g-drag)] bg-white"
            />
          ) : null}
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
              /* The position survives here even though the reference prints no
                 numerals: the label carries the value, so assistive tech still
                 reads "Słodycz: +1" on the checked detent. */
              aria-label={`${label}: ${sign(detent)}`}
              disabled={disabled}
              onClick={() => onSet(detent)}
              style={{ left: at(detent) }}
              /* A 26 px target centred on each dot — the mark is small, the
                 thing you press is not. */
              className="pro-focus-ring absolute top-0 -ml-[13px] size-[26px] rounded-full bg-transparent"
            />
          ))}
        </div>
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
      className={cn('pro-legend-box bg-transparent px-5 pt-[22px] pb-[18px]', className)}
      data-testid="profile-direction-axes"
    >
      <h3
        data-band-legend
        className="text-[10px] leading-[14px] font-semibold tracking-[0.16em] text-[var(--g-text-muted)] uppercase"
      >
        Dostosuj recepturę
      </h3>
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
              onSet={(next) => set(axis, next)}
              disabled={status?.status !== 'working'}
            />
          );
        })}
      </div>
    </section>
  );
}
