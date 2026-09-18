/**
 * THE batch process's two sheets (DESIGN V3.0 IV „Rescue w HOME”, XIII, §14):
 *
 *  • „Korekta partii” — the four decisions PRO Production offers after a confirmed
 *    deviation (`productionDecisionOptions.ts`: the same order, words and recommendation),
 *    each with the Score and batch mass the Rescue authority verified. „Wróć” returns to
 *    the row to correct the entry.
 *  • „Co się stało?” — the calm way into that flow. The flavour change of a running batch
 *    („Chcę zmienić smak tej partii”) is not offered: no host has that mechanism.
 *
 * The frame is the HOST's layer (`sheetFrame`): HOME passes its bottom-sheet layer, the
 * Produkcja area can pass its own. Presentation only — every action is the controller's.
 */
import type { ReactNode } from 'react';
import { ScoreRing } from '@/features/pro-workbench/ScoreRing';
import type { TenPointScore } from '@/features/recipe-score';
import { cn } from '@/lib/cn';
import type { ProductionDecisionId } from '../productionDecisionOptions';
import { productionProcessCopy as copy } from './productionProcessCopy';
import { formatProductionGrams, type ProductionCorrectionView } from './productionProcessSteps';

/** The host's layer around a process sheet (e.g. HOME's `HomeLayer`). */
export type ProcessSheetFrame = (props: {
  label: string;
  testId: string;
  onClose: () => void;
  onBackdrop?: () => void;
  returnFocus?: () => HTMLElement | null;
  children: ReactNode;
}) => ReactNode;

const primaryButton =
  'pro-focus-ring inline-flex h-12 min-w-0 flex-1 items-center justify-center rounded-full bg-[var(--g-ink)] px-5 text-[15.5px] font-semibold text-white disabled:opacity-40';
const textButton =
  'pro-focus-ring inline-flex h-12 shrink-0 items-center justify-center rounded-full px-3.5 text-[15px] font-semibold text-[var(--g-ink)]';

function SheetHeading({ title, subtitle }: { title: ReactNode; subtitle: ReactNode }) {
  return (
    <div className="shrink-0">
      <h2 className="text-[18px] leading-[1.25] font-semibold text-[var(--g-ink)]">{title}</h2>
      <p className="mt-0.5 text-[13px] leading-[1.35] text-[var(--g-text-muted)]">{subtitle}</p>
    </div>
  );
}

/** The actions, last, under the thumb — like every HOME layer. */
function SheetFoot({ children }: { children: ReactNode }) {
  return <div className="mt-7 flex shrink-0 items-center gap-3">{children}</div>;
}

export function ProcessCorrectionSheet({
  frame: Frame,
  correction,
  onSelect,
  onApply,
  onBack,
}: {
  frame: ProcessSheetFrame;
  correction: ProductionCorrectionView;
  onSelect: (id: ProductionDecisionId) => void;
  onApply: () => void;
  onBack: () => void;
}) {
  const { what, options, impossibleReason, recommendedId, selectedId, applyLabel } = correction;
  return (
    <Frame
      label={copy.correctionEyebrow}
      testId="process-correction"
      onClose={onBack}
      // A decision is required to go on: a stray tap on the dimmed batch is not one.
      onBackdrop={() => undefined}
    >
      <em className="mb-1 block shrink-0 text-[10.5px] leading-none font-bold tracking-[0.08em] text-[#77736c] uppercase not-italic">
        {copy.correctionEyebrow}
      </em>
      <SheetHeading
        title={impossibleReason ? copy.correctionImpossible : copy.correctionTitle}
        subtitle={impossibleReason ?? copy.correctionLead}
      />
      {what ? (
        <p
          className="mt-3 shrink-0 rounded-[10px] px-3 py-[9px] text-[13px] leading-[1.35] text-[#3b3833] shadow-[inset_0_0_0_1px_#ebe7e0]"
          data-testid="process-correction-what"
        >
          {what.name}: {copy.correctionInVessel}{' '}
          <b className="font-semibold text-[var(--g-ink)]">{formatProductionGrams(what.actualG)}</b>{' '}
          · {copy.correctionPlan} {formatProductionGrams(what.planG)}
        </p>
      ) : null}
      {options.length > 0 ? (
        <div
          className="mt-2.5 grid min-h-0 gap-2.5 overflow-y-auto overscroll-contain"
          data-testid="process-correction-options"
        >
          {options.map((option) => {
            const selected = option.id === selectedId;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onSelect(option.id)}
                aria-pressed={selected}
                data-testid={`process-decision-${option.id}`}
                className={cn(
                  'flex w-full justify-between gap-2.5 rounded-xl border bg-white p-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/30',
                  selected
                    ? 'border-[var(--g-ink)] shadow-[inset_0_0_0_1px_var(--g-ink)]'
                    : 'border-[rgba(16,17,19,0.12)]',
                )}
              >
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <b className="text-[14px] leading-[1.3] font-semibold text-[var(--g-ink)]">
                      {option.title}
                    </b>
                    {option.id === recommendedId ? (
                      <em className="rounded-md border border-[#d9d5ce] bg-white px-1.5 py-1 text-[10px] leading-none font-bold tracking-[0.04em] text-[#65635f] uppercase not-italic">
                        {copy.correctionRecommended}
                      </em>
                    ) : null}
                  </span>
                  <small className="mt-1 block text-[12.5px] leading-[1.4] text-[#5f5a52]">
                    {option.explanation}
                  </small>
                </span>
                <span className="grid min-w-[76px] shrink-0 justify-items-center gap-1">
                  {selected ? (
                    <em className="rounded-md border border-[rgba(62,155,87,0.3)] bg-[rgba(62,155,87,0.07)] px-1.5 py-1 text-[10px] leading-none font-bold tracking-[0.04em] whitespace-nowrap text-[#2f6f3c] not-italic">
                      {copy.correctionSelected}
                    </em>
                  ) : null}
                  <ScoreRing
                    score={option.score as TenPointScore | null}
                    testId={`process-decision-score-${option.id}`}
                  />
                  <span className="font-mono text-[12px] leading-none font-semibold text-[var(--g-ink)]">
                    {formatProductionGrams(option.finalMassG)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
      <SheetFoot>
        <button
          type="button"
          className={textButton}
          onClick={onBack}
          data-testid="process-correction-back"
        >
          {copy.back}
        </button>
        {options.length > 0 ? (
          <button
            type="button"
            className={primaryButton}
            onClick={onApply}
            disabled={selectedId === null}
            data-testid="process-correction-apply"
          >
            {applyLabel}
          </button>
        ) : null}
      </SheetFoot>
    </Frame>
  );
}

export function ProcessTroubleSheet({
  frame: Frame,
  onWeighedDifferent,
  onBack,
  returnFocus,
}: {
  frame: ProcessSheetFrame;
  /** `null` while no row is being weighed: the amount is entered on the row itself. */
  onWeighedDifferent: (() => void) | null;
  onBack: () => void;
  /** „Zważyłem inną ilość” names its successor: the amount field of the row being weighed. */
  returnFocus?: () => HTMLElement | null;
}) {
  return (
    <Frame
      label={copy.troubleTitle}
      testId="process-trouble"
      onClose={onBack}
      returnFocus={returnFocus}
    >
      <SheetHeading title={copy.troubleTitle} subtitle={copy.troubleLead} />
      <div className="mt-3 grid shrink-0" data-testid="process-trouble-options">
        <button
          type="button"
          onClick={onWeighedDifferent ?? undefined}
          disabled={onWeighedDifferent === null}
          data-testid="process-trouble-weighed"
          className="grid gap-0.5 border-b border-[#f1ede7] px-0.5 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 disabled:cursor-not-allowed"
        >
          <b
            className={cn(
              'text-[15px] leading-[1.3] font-medium',
              onWeighedDifferent ? 'text-[var(--g-ink)]' : 'text-[#8a857d]',
            )}
          >
            {copy.troubleWeighed}
          </b>
          <small className="text-[12.5px] leading-[1.35] text-[#77736c]">
            {onWeighedDifferent ? copy.troubleWeighedHint : copy.troubleWeighedUnavailable}
          </small>
        </button>
      </div>
      <SheetFoot>
        <button
          type="button"
          className={primaryButton}
          onClick={onBack}
          data-testid="process-trouble-back"
        >
          {copy.back}
        </button>
      </SheetFoot>
    </Frame>
  );
}
