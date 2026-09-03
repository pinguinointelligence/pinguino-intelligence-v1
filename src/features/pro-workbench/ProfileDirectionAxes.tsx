import { useMemo } from 'react';
import type { RecipeResult } from '@/engine';
import { cn } from '@/lib/cn';
import { buildRecipeDirectionPlan } from '@/features/recipe-direction/recipeDirectionTargets';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useRecipeStore } from '@/stores/recipeStore';
import {
  PROTEIN_HARDNESS_TARGET_VALUE,
  projectProteinHardnessForDisplay,
  proteinHardnessSelectionChangesStored,
} from '@/features/protein-gelato/proteinHardnessAuthority';
import type { AdjustableAxisId, DirectionIntent } from './recipeProfileStore';

const DETENTS = [-2, -1, 0, 1, 2] as const;
/** Three real positions, for a profile whose proven authority publishes three
 *  targets (Protein hardness). Rendering five where −2 ≡ −1 would be fake
 *  precision, so the control shows what the authority can actually deliver. */
const DETENTS_THREE = [-1, 0, 1] as const;

/** `left:` for a detent. The frozen 0 / 25 / 50 / 75 / 100 spacing for the
 *  five-position rail; the same end-to-end geometry at 0 / 50 / 100 for three. */
const atSpan = (detent: DirectionIntent, span: number) =>
  `${((detent + span) / (span * 2)) * 100}%`;

const sign = (detent: DirectionIntent) => (detent > 0 ? `+${detent}` : `${detent}`);

function RegulatorRow({
  id,
  label,
  position,
  onSet,
  disabled,
  detents = DETENTS,
}: {
  id: string;
  label: string;
  position: DirectionIntent;
  onSet: (value: DirectionIntent) => void;
  disabled?: boolean;
  /** The positions this axis can actually deliver. Defaults to the five-step
   *  rail; a profile whose authority publishes three targets passes three. */
  detents?: readonly DirectionIntent[];
}) {
  /* The fill spans CENTRE → current position, so the track reads as a bipolar
     instrument: which way you went, and how far. A rail filled from the left
     end would read as a volume slider — a different claim about the axis. */
  const span = Math.max(...detents.map((detent) => Math.abs(detent)));
  const detentAt = (detent: DirectionIntent) => atSpan(detent, span);
  const fillLeft = position >= 0 ? '50%' : detentAt(position);
  const fillWidth = `${(Math.abs(position) / (span * 2)) * 100}%`;
  return (
    <article
      /* OWNER AUTHORITY 2026-09-03 (approved desktop reference): the axis is
         ONE ROW — its name on the left, its track on the right. The stacked
         form (name above, track below, numerals under that, end labels under
         those) spent four lines on what the reference says in one, and made
         two axes taller than the whole result readout above them.

         `contents`, not a grid of its own: both rows are cells of the SAME
         grid on the parent, so the two tracks start on one x whatever the
         label column resolves to. Two independent grids would align only in
         Polish and drift the moment "Słodycz" and "Twardość" translate to
         different widths. */
      className="contents"
      data-testid={`profile-regulator-${id}`}
      data-regulator-state={disabled ? 'unavailable' : 'interactive'}
    >
      <b className="min-w-0 truncate text-[15px] leading-[21px] font-semibold tracking-[-0.02em] text-[var(--g-ink)]">
        {label}
      </b>
      {/* No side inset here. The 13 px the track used to carry existed because
          it ran to the DISPLAY COLUMN's own edge, where a 26 px hit target
          centred on ±2 overflowed by 3 px. Inside this box the 20 px padding
          already absorbs that half-target, so insetting again would pull both
          end detents 13 px off the reference and shorten the instrument. */}
      <div className="min-w-0">
        <div
          role="radiogroup"
          aria-label={label}
          aria-disabled={disabled || undefined}
          onKeyDown={(event) => {
            if (disabled) return;
            if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
              event.preventDefault();
              onSet(Math.max(-span, position - 1) as DirectionIntent);
            } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
              event.preventDefault();
              onSet(Math.min(span, position + 1) as DirectionIntent);
            } else if (event.key === 'Home') {
              event.preventDefault();
              onSet(-span as DirectionIntent);
            } else if (event.key === 'End') {
              event.preventDefault();
              onSet(span as DirectionIntent);
            }
          }}
          className="relative h-[26px]"
        >
          {detents.map((detent) => (
            <span
              key={`dot-${detent}`}
              aria-hidden
              style={{ left: detentAt(detent) }}
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
              style={{ left: detentAt(0) }}
              className="absolute top-[7.5px] -ml-[5.5px] size-[11px] rounded-full border-[1.5px] border-[var(--g-drag)] bg-white"
            />
          ) : null}
          {/* The blocked thumb carries an OUTLINE, not just a muted fill. With
              the numerals gone, the mark is the only thing reporting the
              position, and #fcd6a8 sits at 1.07:1 against the dot colour —
              invisible. The attention ink reaches 4.33:1 against those dots
              and 6.33:1 against the ground, so a blocked axis still SHOWS
              where it stands while the pale fill keeps saying "not available".
              The interactive thumb is untouched: its 2.46:1 accent is the
              owner-approved V2.1 exception and is not reopened here. */}
          <span
            aria-hidden
            style={{ left: detentAt(position) }}
            className={cn(
              'absolute top-[5px] -ml-2 size-4 rounded-full shadow-[0_0_0_3px_#fff] transition-[left,background-color]',
              disabled
                ? 'border-[1.5px] border-[var(--g-attention-ink)] bg-[#fcd6a8]'
                : 'bg-[#f58a07]',
            )}
          />
          {detents.map((detent) => (
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
              style={{ left: detentAt(detent) }}
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
      className={cn('pro-legend-box bg-transparent px-5 pt-8 pb-6', className)}
      data-testid="profile-direction-axes"
    >
      <h3
        data-band-legend
        className="text-[10px] leading-[14px] font-semibold tracking-[0.16em] text-[var(--g-text-muted)] uppercase"
      >
        Dostosuj recepturę
      </h3>
      {/* The label column is `max-content` with a 76 px floor, not a fixed
          width: German and Hungarian run 45-80% longer than Polish, and a
          fixed column would clip them. The track keeps `min-w-0` so it yields
          instead of overflowing the column. */}
      <div className="grid grid-cols-[minmax(104px,max-content)_1fr] items-center gap-x-5 gap-y-3">
        {(
          [
            ['sweetness', 'Słodycz'],
            ['softness', 'Twardość'],
          ] as const
        ).map(([axis, label]) => {
          const status = statusByAxis.get(axis);
          // A profile whose proven hardness authority publishes THREE targets
          // (Protein, through its approved ice band) gets three real positions.
          // Five where −2 ≡ −1 would be fake precision. The plan's own metric is
          // the discriminator, so no product-category branch appears here.
          const threePosition = axis === 'softness' && status?.metric === 'ice_fraction';
          const stored = intents[axis];
          return (
            <RegulatorRow
              key={axis}
              id={axis}
              label={label}
              // DISPLAY projection: a draft already carrying ±2 renders on the
              // nearest real position rather than being silently rewritten.
              position={
                threePosition
                  ? (PROTEIN_HARDNESS_TARGET_VALUE[
                      projectProteinHardnessForDisplay(stored)
                    ] as DirectionIntent)
                  : stored
              }
              detents={threePosition ? DETENTS_THREE : DETENTS}
              onSet={(next) => {
                if (!threePosition) {
                  set(axis, next);
                  return;
                }
                const step = projectProteinHardnessForDisplay(next);
                // Selecting the already-shown position must not rewrite a ±2.
                if (!proteinHardnessSelectionChangesStored(stored, step)) return;
                set(axis, PROTEIN_HARDNESS_TARGET_VALUE[step]);
              }}
              disabled={status?.status !== 'working'}
            />
          );
        })}
      </div>
    </section>
  );
}
