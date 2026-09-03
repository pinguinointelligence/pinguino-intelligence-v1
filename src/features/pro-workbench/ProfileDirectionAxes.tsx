import { useMemo } from 'react';
import type { RecipeResult } from '@/engine';
import { cn } from '@/lib/cn';
import { buildRecipeDirectionPlan } from '@/features/recipe-direction/recipeDirectionTargets';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useRecipeStore } from '@/stores/recipeStore';
import type { AdjustableAxisId, DirectionIntent } from './recipeProfileStore';

/* OWNER AUTHORITY 2026-09-03 — the control explains ITSELF, and PRESENTATION
   ORDER is separate from the stored value.

   The numerals are gone: nobody should have to read "+1" to know which way they
   went. Meaning is carried by the SIZE of the mark.

   The five marks are addressed by VISUAL SLOT — 0 leftmost to 4 rightmost —
   and each axis declares how a slot maps to the canonical value it writes.
   That separation is the whole point: the engine's Twardość sign is FROZEN
   (`recipeDirectionTargets.ts`: "-2 = more soft (higher NPAC), +2 = more firm
   (lower NPAC)"), while the owner wants firm on the LEFT. Reversing the slot
   map gives that picture without the solver ever seeing a different number.

   SŁODYCZ  slot 0..4 -> canonical -2..+2, smallest ball left, largest right.
   TWARDOŚĆ slot 0..4 -> canonical +2..-2, largest ball left, smallest right.

   So the leftmost mark on Twardość writes canonical +2 (firmer) and the
   rightmost writes -2 (softer). Stored meaning unchanged; only the order in
   which the five are drawn, and the arrow keys that walk them, are mirrored. */
const SLOTS = [0, 1, 2, 3, 4] as const;
type Slot = (typeof SLOTS)[number];

/** `left:` for a visual slot — the frozen 0 / 25 / 50 / 75 / 100 spacing. */
const slotLeft = (slot: Slot) => `${(slot / 4) * 100}%`;

/** Canonical value a slot writes. `reversed` mirrors the axis. */
const detentForSlot = (slot: Slot, reversed: boolean) =>
  (reversed ? 2 - slot : slot - 2) as DirectionIntent;

/** Slot a canonical value occupies — the exact inverse of `detentForSlot`. */
const slotForDetent = (detent: DirectionIntent, reversed: boolean) =>
  (reversed ? 2 - detent : detent + 2) as Slot;

/* The ball always grows from left to right ON SCREEN for Słodycz and shrinks
   left to right for Twardość, so the ramp is indexed by SLOT, never by the
   stored value. */
const DOT_PX = [5, 6.5, 8, 9.5, 11] as const;
const THUMB_PX = [13, 14.5, 16, 17.5, 19] as const;
const rampAt = (sizes: readonly number[], slot: Slot, reversed: boolean) =>
  sizes[reversed ? 4 - slot : slot];

/* Screen readers never saw the ball, so they used to get the numeral. They now
   get the sentence — and it is indexed by the CANONICAL value, not the slot,
   so it states what was actually selected however the row is drawn. */
const PHRASES: Record<'sweetness' | 'softness', readonly string[]> = {
  sweetness: [
    'znacznie mniej słodkie',
    'mniej słodkie',
    'średnio',
    'bardziej słodkie',
    'znacznie bardziej słodkie',
  ],
  // Index 0 is canonical -2, which the engine defines as MORE SOFT.
  softness: [
    'znacznie bardziej miękkie',
    'bardziej miękkie',
    'średnio',
    'bardziej twarde',
    'znacznie bardziej twarde',
  ],
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
}: {
  id: string;
  label: string;
  position: DirectionIntent;
  axisKey: 'sweetness' | 'softness';
  /** true = slot 0 writes canonical +2 (Twardość: firm on the left). */
  reversed: boolean;
  endLabels: readonly [string, string];
  onSet: (value: DirectionIntent) => void;
  disabled?: boolean;
}) {
  const phrases = PHRASES[axisKey];
  const activeSlot = slotForDetent(position, reversed);
  const thumbSize = rampAt(THUMB_PX, activeSlot, reversed);
  /* The fill spans CENTRE → current position, so the track reads as a bipolar
     instrument: which way you went, and how far. A rail filled from the left
     end would read as a volume slider — a different claim about the axis. */
  const fillLeft = activeSlot >= 2 ? '50%' : slotLeft(activeSlot);
  const fillWidth = `${Math.abs(activeSlot - 2) * 25}%`;
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
            /* Arrows move ON SCREEN, not through the number line: on a
               mirrored axis ArrowLeft has to reach the mark to the left, which
               is canonical +2, not -2. Walking slots keeps the keyboard and
               the eye agreed on both axes. */
            const step = (next: number) => {
              event.preventDefault();
              onSet(detentForSlot(Math.max(0, Math.min(4, next)) as Slot, reversed));
            };
            if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
              step(activeSlot - 1);
            } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
              step(activeSlot + 1);
            } else if (event.key === 'Home') {
              step(0);
            } else if (event.key === 'End') {
              step(4);
            }
          }}
          className="relative h-[26px]"
        >
          {/* The RAIL connects the five dots into one instrument. Without it
              the detents read as five unrelated marks and the axis stops
              looking like a thing you slide — the reference draws the line, and
              the orange fill is then visibly a SEGMENT OF that line rather than
              a stroke floating between dots. It is a shade lighter than the
              dots so the positions still stand out on it. */}
          <span
            aria-hidden
            className="absolute inset-x-0 top-[11.5px] h-[3px] rounded-full bg-[var(--g-line)]"
          />
          {SLOTS.map((slot) => {
            const d = rampAt(DOT_PX, slot, reversed);
            return (
              <span
                key={`dot-${slot}`}
                aria-hidden
                style={{
                  left: slotLeft(slot),
                  width: d,
                  height: d,
                  marginLeft: -d / 2,
                  top: 13 - d / 2,
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
              style={{
                left: slotLeft(2),
                top: 13 - DOT_PX[2] / 2 - 2,
                marginLeft: -DOT_PX[2] / 2 - 2,
              }}
              className="absolute size-[12px] rounded-full border-[1.5px] border-[var(--g-drag)] bg-white"
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
              left: slotLeft(activeSlot),
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
          {SLOTS.map((slot) => {
            const detent = detentForSlot(slot, reversed);
            return (
            <button
              key={detent}
              type="button"
              role="radio"
              aria-checked={position === detent}
              /* The size is invisible to a screen reader, so the name carries
                 the same statement in words: "Słodycz: bardziej słodkie". */
              aria-label={`${label}: ${phrases[detent + 2]}`}
              disabled={disabled}
              onClick={() => onSet(detent)}
              style={{ left: slotLeft(slot) }}
              /* A 26 px target centred on each dot — the mark is small, the
                 thing you press is not. */
              className="pro-focus-ring absolute top-0 -ml-[13px] size-[26px] rounded-full bg-transparent"
            />
            );
          })}
        </div>
        {/* Size says WHICH WAY; these two words say which way is which. Kept
            because a bigger ball is only self-evident on Słodycz — on Twardość
            a large ball could be read as "harder" just as easily as "softer",
            and that misreading is not hypothetical: the request that asked for
            this ramp described the direction backwards. Deliberately quiet, at
            the smallest size in the panel, so they inform without competing. */}
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
          return (
            <RegulatorRow
              key={axis}
              id={axis}
              label={label}
              position={intents[axis]}
              axisKey={axis}
              reversed={axis === 'softness'}
              endLabels={
                axis === 'sweetness'
                  ? ['mniej słodkie', 'bardziej słodkie']
                  : /* Mirrored PRESENTATION: firm on the left, soft on the
                       right. The canonical sign is untouched — the leftmost
                       mark still writes +2, which the engine reads as firmer. */
                    ['bardziej twarde', 'bardziej miękkie']
              }
              onSet={(next) => set(axis, next)}
              disabled={status?.status !== 'working'}
            />
          );
        })}
      </div>
    </section>
  );
}
