/**
 * LOCK CONFLICT — owner 2026-09-11 (INTERACTIVE RECALCULATION PREVIEW +
 * CONFLICT RESOLUTION, part B).
 *
 * The customer's own locks cannot all be kept at their current amounts. This
 * panel replaces the technical dead end inside the SAME recalculation modal:
 *  - it says, in customer language, that the locks cannot all be kept and
 *    (PRO) the exact remaining gap as a secondary detail;
 *  - it lists the customer's locks with the ones that genuinely have to move
 *    first, each prefilled with the smallest Solver-proven amount;
 *  - „Użyj propozycji" recalculates with exactly those amounts (the recipe is
 *    still not written — the full preview follows, then „Zastosuj zmiany");
 *  - changing any amount/padlock turns the action into „Przelicz" with the
 *    customer's own values. Nothing here is a hidden lock or a guessed number.
 */
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { DirectNumberControl } from '@/features/ingredient-builder/DirectNumberControl';
import {
  constraintStudioCopy as copy,
  formatGramsPl,
  formatPercentPl,
} from '../constraintStudioCopy';
import type { LockConflictState } from '../constraintStudioStore';
import type { LockConflictBlocker, LockConflictLock } from '../lockRelaxation';
import { mergePreviewInstructions, type PreviewLineInstruction } from '../previewInstructions';
import type { GramsMask } from './ConstraintPreviewCard';

const gapSentence = (blocker: LockConflictBlocker | undefined): string => {
  if (!blocker || blocker.limitPercent === null) return copy.lockConflict.genericGap;
  const limit = formatPercentPl(blocker.limitPercent);
  if (blocker.code === 'main_above_hard_limit') return copy.lockConflict.gapAboveLimit(limit);
  if (blocker.actualPercent === null) return copy.lockConflict.genericGap;
  return copy.lockConflict.gap[blocker.code](formatPercentPl(blocker.actualPercent), limit);
};

const measureLine = (blocker: LockConflictBlocker): string | null => {
  if (blocker.limitPercent === null) return null;
  const label = copy.lockConflict.measureLabel[blocker.code];
  const limitLabel =
    blocker.code === 'main_above_hard_limit'
      ? copy.lockConflict.maximumLabel
      : copy.lockConflict.minimumLabel;
  const limit = `${limitLabel}: ${formatPercentPl(blocker.limitPercent)}`;
  return blocker.actualPercent === null
    ? `${label} · ${limit}`
    : `${label}: ${formatPercentPl(blocker.actualPercent)} · ${limit}`;
};

interface RowState {
  grams: number;
  locked: boolean;
}

export function LockConflictPanel({
  conflict,
  surface,
  gramsMask,
  onRecalculate,
  onBack,
}: {
  conflict: LockConflictState;
  surface: 'pro' | 'home';
  gramsMask?: GramsMask | undefined;
  onRecalculate: (instructions: PreviewLineInstruction[]) => void;
  onBack: () => void;
}) {
  const { diagnosis } = conflict;
  const changeById = new Map(
    diagnosis.status === 'relaxation_found'
      ? diagnosis.changes.map((change) => [change.lineId, change])
      : [],
  );
  const [edits, setEdits] = useState<Record<string, RowState>>({});
  const [editsFor, setEditsFor] = useState(conflict);
  if (editsFor !== conflict) {
    setEditsFor(conflict);
    setEdits({});
  }

  // Where it hurts first: the locks that genuinely have to move, then the
  // ones that may stay exactly as the customer set them (recipe order inside).
  const rows = [
    ...diagnosis.locks.filter((lock) => changeById.has(lock.lineId)),
    ...diagnosis.locks.filter((lock) => !changeById.has(lock.lineId)),
  ];
  const initialOf = (lock: LockConflictLock): RowState => ({
    grams: changeById.get(lock.lineId)?.toGrams ?? lock.grams,
    locked: true,
  });
  const shownOf = (lock: LockConflictLock): RowState => edits[lock.lineId] ?? initialOf(lock);
  const edited = Object.keys(edits).length > 0;
  const update = (lock: LockConflictLock, next: RowState) => {
    setEdits((current) => {
      const initial = initialOf(lock);
      const following = { ...current };
      const grams = Math.max(1, Math.round(next.grams));
      if (grams === initial.grams && next.locked === initial.locked) {
        delete following[lock.lineId];
      } else {
        following[lock.lineId] = { grams, locked: next.locked };
      }
      return following;
    });
  };
  // Exactly what is on screen: every row that differs from the customer's
  // current lock becomes an instruction; an untouched lock stays as it is.
  const run = () => {
    const instructions: PreviewLineInstruction[] = rows.flatMap((lock) => {
      const shown = shownOf(lock);
      if (shown.locked && shown.grams === lock.grams) return [];
      return [{ lineId: lock.lineId, grams: shown.grams, locked: shown.locked }];
    });
    onRecalculate(mergePreviewInstructions(conflict.sessionInstructions, instructions));
  };

  const found = diagnosis.status === 'relaxation_found';
  const pro = surface === 'pro';
  const title = pro ? copy.lockConflict.proTitle : copy.lockConflict.homeTitle;
  const primaryBlocker = diagnosis.blockers[0];
  const formatGrams = (grams: number) => (gramsMask ? gramsMask.text : formatGramsPl(grams));

  return (
    <section
      aria-label={title}
      className="rounded-[14px] border border-black/10 bg-white px-3 py-3 text-black [--color-charcoal:#191a1d] [--color-ivory:#202124] [--color-shell:#f5f3ee] [color-scheme:light] sm:px-4 sm:py-4"
      data-testid="lock-conflict-panel"
      data-surface={surface}
      data-status={diagnosis.status}
    >
      <h2 className="text-base font-semibold leading-tight text-black sm:text-lg">{title}</h2>
      <div
        className={cn(
          'mt-3 rounded-[12px] border px-3 py-3',
          found
            ? 'border-gold-soft/45 bg-[#f8f4ec]'
            : 'border-status-risky/25 bg-status-risky/[0.055]',
        )}
        data-testid="lock-conflict-summary"
      >
        {pro ? (
          <p className="text-sm leading-snug text-black" data-testid="lock-conflict-gap">
            {gapSentence(primaryBlocker)}
          </p>
        ) : null}
        <p
          className={cn('text-sm font-medium leading-snug text-black', pro ? 'mt-1.5' : '')}
          data-testid="lock-conflict-outcome"
        >
          {found
            ? pro
              ? copy.lockConflict.proProposal
              : copy.lockConflict.homeProposal
            : copy.lockConflict.noSafeCorrection}
        </p>
        {pro && diagnosis.blockers.length > 0 ? (
          <div className="mt-2 space-y-0.5" data-testid="lock-conflict-measures">
            {diagnosis.blockers.map((blocker) => (
              <p key={blocker.code} className="font-mono text-xs tabular-nums text-black/65">
                {measureLine(blocker)}
              </p>
            ))}
          </div>
        ) : null}
      </div>

      <section className="mt-4" aria-labelledby="lock-conflict-locks-title">
        <h3
          id="lock-conflict-locks-title"
          className="text-[0.6875rem] font-semibold tracking-[0.1em] text-black/65 uppercase"
        >
          {copy.lockConflict.locksHeading}
        </h3>
        <div className="mt-2 divide-y divide-black/10 overflow-hidden rounded-[12px] border border-black/10 bg-white px-3">
          {rows.map((lock) => {
            const shown = shownOf(lock);
            const rowEdited = edits[lock.lineId] !== undefined;
            const mustChange = changeById.has(lock.lineId);
            const note = rowEdited
              ? copy.lockConflict.editedNote
              : mustChange
                ? copy.lockConflict.changeNote
                : copy.lockConflict.unchangedNote;
            return (
              <div
                key={lock.lineId}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2.5"
                data-testid={`lock-conflict-row-${lock.lineId}`}
                data-change={mustChange ? 'required' : 'none'}
                data-edited={rowEdited ? 'true' : 'false'}
              >
                <span
                  className={cn(
                    'min-w-0 flex-1 basis-40 truncate text-sm font-medium',
                    mustChange || rowEdited ? 'text-black' : 'text-black/65',
                  )}
                >
                  {lock.ingredientName}
                </span>
                <span className="flex shrink-0 flex-wrap items-center justify-end gap-x-2 gap-y-1">
                  <span
                    className="font-mono text-sm tabular-nums text-black/65"
                    data-testid="lock-conflict-from-grams"
                  >
                    {formatGrams(lock.grams)}
                  </span>
                  <span aria-hidden className="text-black/65">
                    →
                  </span>
                  <DirectNumberControl
                    value={shown.grams}
                    step={1}
                    min={1}
                    decimals={0}
                    suffix="g"
                    ariaLabel={copy.interactive.amountAria(lock.ingredientName)}
                    testId={`lock-conflict-control-${lock.lineId}`}
                    widthPreset="grams"
                    density="responsive"
                    onChange={(grams) => update(lock, { grams, locked: shown.locked })}
                    lockSegment={{
                      pressed: shown.locked,
                      ariaLabel: copy.interactive.lockAria(lock.ingredientName, shown.locked),
                      title: copy.interactive.lockTitle(shown.locked),
                      suffix: 'g',
                      onToggle: () => update(lock, { grams: shown.grams, locked: !shown.locked }),
                      testId: `lock-conflict-lock-${lock.lineId}`,
                    }}
                    {...(gramsMask
                      ? {
                          maskedValue: gramsMask.controlValue,
                          maskedLabel: gramsMask.label,
                          onMaskedInteract: gramsMask.onInteract,
                        }
                      : {})}
                  />
                  <span
                    className={cn(
                      'basis-full text-right font-sans text-[0.625rem] tracking-[0.04em] uppercase',
                      mustChange || rowEdited ? 'text-status-risky' : 'text-black/65',
                    )}
                  >
                    {note}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <div className="sticky bottom-0 -mx-3 mt-4 flex flex-col-reverse gap-2 border-t border-black/10 bg-white/95 px-3 pt-3 pb-1 backdrop-blur sm:-mx-4 sm:flex-row sm:px-4">
        {edited || found ? (
          <button
            type="button"
            onClick={run}
            data-testid={edited ? 'lock-conflict-recalculate' : 'lock-conflict-use-proposal'}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-[10px] bg-black px-4 py-2.5 text-sm font-semibold text-white shadow-pro-sm transition-transform hover:-translate-y-px hover:bg-charcoal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-soft"
          >
            {edited ? copy.lockConflict.recalculate : copy.lockConflict.useProposal}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onBack}
          data-testid="lock-conflict-back"
          className="inline-flex min-h-11 items-center justify-center rounded-[10px] border border-black/15 px-4 py-2.5 text-sm font-medium text-black transition-colors hover:border-black/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-soft sm:min-w-28"
        >
          {copy.lockConflict.back}
        </button>
      </div>
    </section>
  );
}
