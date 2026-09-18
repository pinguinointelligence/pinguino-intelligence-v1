/**
 * DESIGN V3.0 IV „Rescue w HOME” + XIII — the two sheets of HOME production, in the one
 * HOME layer frame (a compact bottom sheet on phones and portrait tablets, a light modal
 * from 1024 px):
 *
 *  • „Korekta partii” — the four decisions PRO Production offers after a confirmed
 *    deviation (`productionDecisionOptions.ts`: the same order, words and recommendation),
 *    each with the Score and batch mass the Rescue authority verified. „Wróć” returns to
 *    the row to correct the entry.
 *  • „Co się stało?” — HOME's calm way into that flow, WITHOUT „Chcę zmienić smak tej
 *    partii” (HOME has no versions, no Monitor and no correction of a running batch).
 *
 * Presentation only; `HomePreparation` owns every value and every action.
 */
import { ScoreRing } from '@/features/pro-workbench/ScoreRing';
import type { TenPointScore } from '@/features/recipe-score';
import type { ProductionDecisionId } from '@/features/production-workspace/productionDecisionOptions';
import { cn } from '@/lib/cn';
import { homeCreatorCopy } from '../homeCreatorCopy';
import {
  HomeLayer,
  HomeLayerFoot,
  HomeLayerHeading,
  homeLayerPrimaryButton,
  homeLayerTextButton,
} from './HomeLayer';
import { formatProductionGrams } from '../homeProductionSteps';

const copy = homeCreatorCopy.production;

export interface HomeCorrectionOptionView {
  id: ProductionDecisionId;
  title: string;
  explanation: string;
  score: TenPointScore | null;
  finalMassG: number;
}

export function HomeBatchCorrectionSheet({
  what,
  options,
  impossibleReason,
  recommendedId,
  selectedId,
  applyLabel,
  onSelect,
  onApply,
  onBack,
}: {
  what: { name: string; actualG: number; planG: number } | null;
  options: readonly HomeCorrectionOptionView[];
  impossibleReason: string | null;
  recommendedId: ProductionDecisionId | null;
  selectedId: ProductionDecisionId | null;
  applyLabel: string;
  onSelect: (id: ProductionDecisionId) => void;
  onApply: () => void;
  onBack: () => void;
}) {
  return (
    <HomeLayer
      label={copy.correctionEyebrow}
      testId="home-batch-correction"
      onClose={onBack}
      // A decision is required to go on: a stray tap on the dimmed batch is not one.
      onBackdrop={() => undefined}
    >
      <em className="mb-1 block shrink-0 text-[10.5px] leading-none font-bold tracking-[0.08em] text-[#77736c] uppercase not-italic">
        {copy.correctionEyebrow}
      </em>
      <HomeLayerHeading
        title={impossibleReason ? copy.correctionImpossible : copy.correctionTitle}
        subtitle={impossibleReason ?? copy.correctionLead}
      />
      {what ? (
        <p
          className="mt-3 shrink-0 rounded-[10px] px-3 py-[9px] text-[13px] leading-[1.35] text-[#3b3833] shadow-[inset_0_0_0_1px_#ebe7e0]"
          data-testid="home-batch-correction-what"
        >
          {what.name}: {copy.correctionInVessel}{' '}
          <b className="font-semibold text-[var(--g-ink)]">{formatProductionGrams(what.actualG)}</b>{' '}
          · {copy.correctionPlan} {formatProductionGrams(what.planG)}
        </p>
      ) : null}
      {options.length > 0 ? (
        <div
          className="mt-2.5 grid min-h-0 gap-2.5 overflow-y-auto overscroll-contain"
          data-testid="home-batch-correction-options"
        >
          {options.map((option) => {
            const selected = option.id === selectedId;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onSelect(option.id)}
                aria-pressed={selected}
                data-testid={`home-decision-${option.id}`}
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
                  <ScoreRing score={option.score} testId={`home-decision-score-${option.id}`} />
                  <span className="font-mono text-[12px] leading-none font-semibold text-[var(--g-ink)]">
                    {formatProductionGrams(option.finalMassG)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
      <HomeLayerFoot>
        <button
          type="button"
          className={homeLayerTextButton}
          onClick={onBack}
          data-testid="home-batch-correction-back"
        >
          {homeCreatorCopy.nav.back}
        </button>
        {options.length > 0 ? (
          <button
            type="button"
            className={homeLayerPrimaryButton}
            onClick={onApply}
            disabled={selectedId === null}
            data-testid="home-batch-correction-apply"
          >
            {applyLabel}
          </button>
        ) : null}
      </HomeLayerFoot>
    </HomeLayer>
  );
}

export function HomeTroubleSheet({
  onWeighedDifferent,
  onBack,
  returnFocus,
}: {
  /** `null` while no row is being weighed: the amount is entered on the row itself. */
  onWeighedDifferent: (() => void) | null;
  onBack: () => void;
  /** „Zważyłem inną ilość” names its successor: the amount field of the row being weighed. */
  returnFocus?: () => HTMLElement | null;
}) {
  return (
    <HomeLayer
      label={copy.troubleTitle}
      testId="home-production-trouble"
      onClose={onBack}
      returnFocus={returnFocus}
    >
      <HomeLayerHeading title={copy.troubleTitle} subtitle={copy.troubleLead} />
      <div className="mt-3 grid shrink-0" data-testid="home-production-trouble-options">
        <button
          type="button"
          onClick={onWeighedDifferent ?? undefined}
          disabled={onWeighedDifferent === null}
          data-testid="home-trouble-weighed"
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
      <HomeLayerFoot>
        <button
          type="button"
          className={homeLayerPrimaryButton}
          onClick={onBack}
          data-testid="home-production-trouble-back"
        >
          {homeCreatorCopy.nav.back}
        </button>
      </HomeLayerFoot>
    </HomeLayer>
  );
}
