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

/* OWNER AUTHORITY 2026-09-03 — the control explains ITSELF, and PRESENTATION
   ORDER is separate from the stored value.

   Meaning is carried by the SIZE of the mark, so the marks are addressed by
   VISUAL INDEX (0 = leftmost) and each axis declares how that index maps to the
   canonical value it writes. That separation is the whole point: the engine's
   Twardość sign is FROZEN (`recipeDirectionTargets.ts`: "-2 = more soft, +2 =
   more firm") while the owner wants firm on the LEFT. Reversing the visual
   order gives that picture without the solver ever seeing a different number.

   Indexing by position rather than by value is also what lets a three-position
   axis work unchanged: the ramp is SAMPLED across however many real targets the
   authority publishes, so nothing invents a level the profile cannot deliver. */
const DOT_RAMP = [5, 6.5, 8, 9.5, 11] as const;
const THUMB_RAMP = [13, 14.5, 16, 17.5, 19] as const;

/** `count` evenly-spaced entries from a five-step ramp: 5 -> all of them,
 *  3 -> the smallest, the middle and the largest. */
const sampleRamp = (ramp: readonly number[], count: number): number[] =>
  Array.from(
    { length: count },
    (_, index) => ramp[Math.round((index * (ramp.length - 1)) / Math.max(1, count - 1))] ?? 0,
  );

/** `left:` for a VISUAL index — the same end-to-end geometry at any count. */
const visualLeft = (index: number, count: number) =>
  `${(index / Math.max(1, count - 1)) * 100}%`;

/* Screen readers never saw the ball, so they used to get the numeral. They now
   get the sentence — indexed by the CANONICAL value, never by the visual slot,
   so it states what was actually selected however the row is drawn. */
const PHRASES: Record<'sweetness' | 'softness', Readonly<Record<number, string>>> = {
  sweetness: {
    [-2]: 'znacznie mniej słodkie',
    [-1]: 'mniej słodkie',
    0: 'średnio',
    1: 'bardziej słodkie',
    2: 'znacznie bardziej słodkie',
  },
  // Canonical -2 is what the engine defines as MORE SOFT.
  softness: {
    [-2]: 'znacznie bardziej miękkie',
    [-1]: 'bardziej miękkie',
    0: 'średnio',
    1: 'bardziej twarde',
    2: 'znacznie bardziej twarde',
  },
};

function RegulatorRow({
  id,
  label,
  position,
  axisKey,
  reversed,
  endLabels,
  onSet,
  disabled,
  detents = DETENTS,
}: {
  id: string;
  label: string;
  position: DirectionIntent;
  axisKey: 'sweetness' | 'softness';
  /** true = the leftmost mark writes the axis's POSITIVE end (Twardość). */
  reversed: boolean;
  endLabels: readonly [string, string];
  onSet: (value: DirectionIntent) => void;
  disabled?: boolean;
  /** The positions this axis can actually deliver. Defaults to the five-step
   *  rail; a profile whose authority publishes three targets passes three. */
  detents?: readonly DirectionIntent[];
}) {
  /* The fill spans CENTRE → current position, so the track reads as a bipolar
     instrument: which way you went, and how far. A rail filled from the left
     end would read as a volume slider — a different claim about the axis. */
  /* `atSpan` and the axis span are the value-space geometry staging added for
     variable-count axes. The visual index below supersedes them for POSITIONING
     — a mirrored axis cannot be placed from its value — but they stay exported
     and referenced so the value-space helper keeps one home. */
  void Math.max(...detents.map((detent) => Math.abs(detent)));
  void atSpan;
  /* The marks in the order they are DRAWN. Everything below indexes this, so
     mirroring an axis is one array reversal rather than a sign flip anywhere
     near the stored value. */
  const visual = reversed ? [...detents].reverse() : [...detents];
  const count = visual.length;
  const centreIndex = (count - 1) / 2;
  const indexOfDetent = (detent: DirectionIntent) => {
    const found = visual.indexOf(detent);
    return found === -1 ? centreIndex : found;
  };
  const activeIndex = indexOfDetent(position);
  const dotSizes = sampleRamp(DOT_RAMP, count);
  const thumbSizes = sampleRamp(THUMB_RAMP, count);
  /* Ascending left-to-right normally; mirrored axes read the ramp backwards so
     the big, aerated ball sits on the firm end the owner put on the left. */
  const sizeAt = (sizes: number[], index: number) =>
    (reversed ? sizes[count - 1 - index] : sizes[index]) ?? 0;
  const thumbSize = sizeAt(thumbSizes, activeIndex);
  const detentAt = (detent: DirectionIntent) => visualLeft(indexOfDetent(detent), count);
  const fillLeft = visualLeft(Math.min(activeIndex, centreIndex), count);
  const fillWidth = `${(Math.abs(activeIndex - centreIndex) / Math.max(1, count - 1)) * 100}%`;
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
            /* Arrows move ON SCREEN, not along the number line: on a mirrored
               axis ArrowLeft must reach the mark to the left, which is the
               POSITIVE canonical end. Walking visual indices keeps the keyboard
               and the eye agreed on both axes and at any position count. */
            const step = (next: number) => {
              event.preventDefault();
              const clamped = Math.max(0, Math.min(count - 1, next));
              const target = visual[clamped];
              if (target !== undefined) onSet(target);
            };
            if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
              step(activeIndex - 1);
            } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
              step(activeIndex + 1);
            } else if (event.key === 'Home') {
              step(0);
            } else if (event.key === 'End') {
              step(count - 1);
            }
          }}
          className="relative h-[26px]"
        >
          {/* The RAIL connects the marks into one instrument. Without it the
              detents read as unrelated dots and the orange stroke stops
              reading as a SEGMENT of anything. A shade lighter than the marks
              so the positions still stand out, and rendered FIRST so the fill,
              the neutral ring and the thumb all paint over it. */}
          <span
            aria-hidden
            className="absolute inset-x-0 top-[11.5px] h-[3px] rounded-full bg-[var(--g-line)]"
          />
          {visual.map((detent, index) => {
            const size = sizeAt(dotSizes, index);
            return (
              <span
                key={`dot-${detent}`}
                aria-hidden
                style={{
                  left: visualLeft(index, count),
                  width: size,
                  height: size,
                  marginLeft: -size / 2,
                  top: 13 - size / 2,
                }}
                className="absolute rounded-full bg-[var(--g-rail-track)]"
              />
            );
          })}
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
            style={{
              left: visualLeft(activeIndex, count),
              width: thumbSize,
              height: thumbSize,
              marginLeft: -thumbSize / 2,
              top: 13 - thumbSize / 2,
            }}
            className={cn(
              'absolute rounded-full shadow-[0_0_0_3px_#fff] transition-[left,width,height,margin,top,background-color]',
              disabled
                ? 'border-[1.5px] border-[var(--g-attention-ink)] bg-[#fcd6a8]'
                : 'bg-[#f58a07]',
            )}
          />
          {visual.map((detent, index) => (
            <button
              key={detent}
              type="button"
              role="radio"
              aria-checked={position === detent}
              /* The size is invisible to a screen reader, so the NAME carries
                 the same statement in words — and it is keyed by the canonical
                 value, so a mirrored axis never announces its own mirror. */
              aria-label={`${label}: ${PHRASES[axisKey][detent] ?? ''}`}
              disabled={disabled}
              onClick={() => onSet(detent)}
              style={{ left: visualLeft(index, count) }}
              /* A 26 px target centred on each dot — the mark is small, the
                 thing you press is not. */
              className="pro-focus-ring absolute top-0 -ml-[13px] size-[26px] rounded-full bg-transparent"
            />
          ))}
        </div>
        {/* Size says WHICH WAY; these two words say which way is which. Kept
            because a bigger ball is only self-evident on Słodycz — on Twardość
            a large ball reads as "softer" or "harder" equally easily, and that
            misreading is not hypothetical. */}
        <div
          className="mt-[7px] flex justify-between gap-3 text-[10.5px] leading-[14px] text-[var(--g-text-muted)]"
          data-testid={`profile-regulator-${id}-ends`}
        >
          <span className="min-w-0 truncate">{endLabels[0]}</span>
          <span className="min-w-0 truncate text-right">{endLabels[1]}</span>
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
              axisKey={axis}
              reversed={axis === 'softness'}
              endLabels={
                axis === 'sweetness'
                  ? ['mniej słodkie', 'bardziej słodkie']
                  : /* Mirrored PRESENTATION: firm on the left, soft on the
                       right. The canonical sign is untouched — the leftmost
                       mark still writes the positive value, which the engine
                       reads as firmer. */
                    ['bardziej twarde', 'bardziej miękkie']
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
