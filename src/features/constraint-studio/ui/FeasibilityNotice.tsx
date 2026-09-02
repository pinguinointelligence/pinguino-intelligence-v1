/**
 * §18 feasibility rendering — honest by construction. PURE view (props only).
 *
 *  - a computed bound renders the §18.2 message with the VERIFIED number and
 *    the action row [Ustaw X g i przelicz] [Odblokuj] [Pozostaw bez zmian];
 *  - a conflict group (§18.4) names the WHOLE group, offers per-line unlock,
 *    batch change and „pozostaw” — never blames one line arbitrarily;
 *  - `no_reliable_bound` renders the §18.5 fallback VERBATIM — no numbers;
 *  - violations are shown as coded chips only (no band values — §22.2).
 */
import type { RecipeInput } from '@/engine';
import type {
  ConstraintFeasibilityAnalysis,
  ConstraintSuggestedAction,
} from '@/features/recipe-constraints';
import { constraintStudioCopy as copy, formatGramsPl } from '../constraintStudioCopy';
import type { SuggestedBoundFix } from '../applyPipeline';

export interface FeasibilityNoticeActions {
  onSuggestedFix: (fix: SuggestedBoundFix) => void;
  onUnlock: (lineId: string) => void;
  onChangeBatch: (minimumBatchGrams: number) => void;
  onKeepAsIs: () => void;
}

const actionButton =
  'inline-flex items-center justify-center rounded-md border border-ivory/20 px-3 py-2 text-xs font-medium text-ivory transition-colors hover:border-ivory/40';

function nameOf(input: RecipeInput, lineId: string): string {
  return input.items.find((item) => item.id === lineId)?.ingredient.name ?? lineId;
}

function SuggestedActionButtons({
  input,
  actions,
  handlers,
}: {
  input: RecipeInput;
  actions: readonly ConstraintSuggestedAction[];
  handlers: FeasibilityNoticeActions;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {actions.map((action, index) => {
        switch (action.type) {
          case 'set_max':
          case 'set_min':
            return (
              <button
                key={index}
                type="button"
                className={actionButton}
                onClick={() =>
                  handlers.onSuggestedFix({
                    type: action.type,
                    lineId: action.lineId,
                    grams: action.grams,
                  })
                }
              >
                {copy.feasibility.setAndRecalc(formatGramsPl(action.grams))}
              </button>
            );
          case 'unlock':
            return (
              <button
                key={index}
                type="button"
                className={actionButton}
                onClick={() => handlers.onUnlock(action.lineId)}
              >
                {copy.feasibility.unlock(nameOf(input, action.lineId))}
              </button>
            );
          case 'change_batch':
            return (
              <button
                key={index}
                type="button"
                className={actionButton}
                onClick={() => handlers.onChangeBatch(action.minimumBatchGrams ?? 0)}
              >
                {copy.feasibility.changeBatch(
                  action.minimumBatchGrams !== undefined
                    ? formatGramsPl(action.minimumBatchGrams)
                    : '—',
                )}
              </button>
            );
          case 'multiple_changes':
            return (
              <div key={index} className="w-full text-xs leading-relaxed text-ivory/60">
                <p>{copy.feasibility.evidence}</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 font-mono tabular-nums">
                  {action.changes.map((change, changeIndex) => (
                    <li key={changeIndex}>
                      {change.type === 'add'
                        ? copy.feasibility.evidenceAdd(
                            change.ingredientName,
                            formatGramsPl(change.grams),
                          )
                        : copy.feasibility.evidenceReduce(
                            change.ingredientName,
                            formatGramsPl(change.grams),
                          )}
                    </li>
                  ))}
                </ul>
              </div>
            );
        }
      })}
      <button type="button" className={actionButton} onClick={handlers.onKeepAsIs}>
        {copy.feasibility.keepAsIs}
      </button>
    </div>
  );
}

function ViolationChips({ analysis }: { analysis: ConstraintFeasibilityAnalysis }) {
  if (analysis.status === 'invalid_constraints') return null;
  if (analysis.violationsBefore.length === 0) return null;
  return (
    <p className="mt-2 text-[0.7rem] tracking-[0.04em] text-ivory/60 uppercase">
      {copy.feasibility.violationsIntro} {analysis.violationsBefore.length}
    </p>
  );
}

export function FeasibilityNotice({
  input,
  analysis,
  handlers,
}: {
  input: RecipeInput;
  analysis: ConstraintFeasibilityAnalysis;
  handlers: FeasibilityNoticeActions;
}) {
  return (
    <section
      aria-label={copy.feasibility.title}
      className="rounded-md border border-ivory/15 px-4 py-4"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-ivory">{copy.feasibility.title}</p>
        <span className="rounded border border-status-risky/40 px-2 py-0.5 text-[0.625rem] font-medium tracking-[0.08em] text-status-risky uppercase">
          {copy.feasibility.analysisBadge}
        </span>
      </div>

      {analysis.status === 'feasible' ? (
        <p className="mt-3 text-sm leading-relaxed text-ivory/80">
          {analysis.alreadyInBand
            ? copy.feasibility.feasibleInBand
            : copy.feasibility.feasibleViaSolver}
        </p>
      ) : null}

      {analysis.status === 'infeasible_with_bound' ? (
        <div className="mt-3 space-y-1 text-sm leading-relaxed text-ivory/80">
          <p>{copy.feasibility.boundIntro}</p>
          <p>
            {copy.feasibility.boundLockedAt(
              analysis.bound.ingredientName,
              formatGramsPl(
                input.items.find((item) => item.id === analysis.bound.lineId)?.planned_grams ??
                  Number.NaN,
              ),
            )}
          </p>
          <p>
            {analysis.bound.boundType === 'max'
              ? copy.feasibility.boundMax(formatGramsPl(analysis.bound.displayGrams))
              : copy.feasibility.boundMin(formatGramsPl(analysis.bound.displayGrams))}
          </p>
          <SuggestedActionButtons
            input={input}
            actions={analysis.conflict.suggestedActions}
            handlers={handlers}
          />
          <ViolationChips analysis={analysis} />
        </div>
      ) : null}

      {analysis.status === 'conflict_group' ? (
        <div className="mt-3 space-y-1 text-sm leading-relaxed text-ivory/80">
          <p>{copy.feasibility.groupLead}</p>
          <p className="font-medium text-ivory">
            {copy.listPl(analysis.conflict.lineIds.map((lineId) => nameOf(input, lineId)))}
          </p>
          <p>{copy.feasibility.groupPaths}</p>
          <SuggestedActionButtons
            input={input}
            actions={analysis.conflict.suggestedActions}
            handlers={handlers}
          />
          <ViolationChips analysis={analysis} />
        </div>
      ) : null}

      {analysis.status === 'no_reliable_bound' ? (
        <div className="mt-3 space-y-1 text-sm leading-relaxed text-ivory/80">
          {/* §18.5 honest fallback — verbatim, never a guessed number. */}
          <p>{copy.feasibility.noReliableBound}</p>
          {analysis.lineIds.length > 0 ? (
            <p className="text-ivory/60">
              {copy.feasibility.markedIngredients(
                analysis.lineIds.map((lineId) => nameOf(input, lineId)),
              )}
            </p>
          ) : null}
          <ViolationChips analysis={analysis} />
        </div>
      ) : null}

      {analysis.status === 'invalid_constraints' ? (
        <p className="mt-3 text-sm leading-relaxed text-status-error">{copy.feasibility.invalid}</p>
      ) : null}

      <p className="mt-3 border-t border-ivory/10 pt-2 text-xs leading-relaxed text-ivory/60">
        {copy.feasibility.keepAsIsNote}
      </p>
    </section>
  );
}
