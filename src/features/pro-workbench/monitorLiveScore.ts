/**
 * Monitor live score seam — the CURRENT recipe as written, and the Gellatti
 * proposal when a real Preview candidate exists.
 *
 * ONE CANONICAL AUTHORITY. This module derives nothing: it reads the same
 * `monitorScoreView` → `recipeFitForInput` adapter every other public surface
 * reads, over an engine result the caller already computed. There is no second
 * Score formula, no UI approximation, and no engine import beyond the types.
 *
 * The live score is EVALUATIVE, not a freshness, Save, or Production signal:
 *   • it never means "this recipe has been recalculated";
 *   • it never means "this recipe is executable";
 *   • calculation freshness stays with `awaitingRecalculation` and the
 *     freezing-stability status, which are reported separately and may honestly
 *     disagree with it (a live score of 7 alongside "Oczekuje na przeliczenie"
 *     is a correct, expected state).
 */
import type { RecipeInput, RecipeResult } from '@/engine';
import type { TenPointScore } from '@/features/recipe-score';
import { monitorScoreView } from './monitorSummaryView';

export type MonitorLiveScoreState =
  | 'scored'
  /** A manually added line still sits at 0 g — an editor placeholder, not a recipe. */
  | 'awaiting_grams'
  /** No recipe, or the engine could not score it. */
  | 'no_data';

export interface MonitorLiveScoreView {
  state: MonitorLiveScoreState;
  /** Integer 1–10, or null when there is nothing honest to show. */
  score: TenPointScore | null;
  /** The canonical §15.1 verdict, or the honest reason there is no score. */
  label: string;
  ariaText: string;
}

export interface MonitorScoreComparisonView {
  current: MonitorLiveScoreView;
  /** Present ONLY for a real, valid Preview candidate. */
  proposed: MonitorLiveScoreView | null;
  /** True when both sides are scored and the proposal actually differs. */
  showComparison: boolean;
}

/** A manually added ingredient may sit at 0 g while the owner is still typing. */
export const AWAITING_GRAMS_LABEL = 'Uzupełnij gramaturę składnika, aby ocenić recepturę';

const CURRENT_SUBJECT = 'Wynik aktualny receptury';
const PROPOSED_SUBJECT = 'Wynik propozycji Gellatti';

const hasPlaceholderLine = (input: RecipeInput | null | undefined): boolean =>
  (input?.items ?? []).some(
    (item) => !Number.isFinite(item.planned_grams) || item.planned_grams <= 0,
  );

const view = (
  subject: string,
  state: MonitorLiveScoreState,
  score: TenPointScore | null,
  label: string,
): MonitorLiveScoreView => ({
  state,
  score,
  label,
  ariaText: score === null ? `${subject}: ${label}` : `${subject}: ${score} na 10 — ${label}`,
});

function evaluate(
  subject: string,
  input: RecipeInput | null | undefined,
  result: RecipeResult | null | undefined,
): MonitorLiveScoreView {
  if (!input || !result || result.total_batch_g <= 0) {
    return view(subject, 'no_data', null, 'Brak wystarczających danych do oceny');
  }
  // An unfinished draft must not be dressed up as a polished executable score.
  if (hasPlaceholderLine(input)) {
    return view(subject, 'awaiting_grams', null, AWAITING_GRAMS_LABEL);
  }
  const match = monitorScoreView(result, input).match;
  if (match.score === null) return view(subject, 'no_data', null, match.label);
  return view(subject, 'scored', match.score, match.label);
}

/**
 * Score the recipe AS CURRENTLY WRITTEN, against the currently selected profile,
 * serving temperature and Direction targets. Never mutates its inputs and never
 * triggers optimization — the caller passes an already-computed engine result.
 */
export function monitorLiveScore(
  input: RecipeInput | null | undefined,
  result: RecipeResult | null | undefined,
): MonitorLiveScoreView {
  return evaluate(CURRENT_SUBJECT, input, result);
}

/**
 * Score the EXACT Preview candidate. Never the requested Direction target, never
 * an optimistic assumption: if the candidate evaluates to 8, this returns 8.
 */
export function monitorProposedScore(
  previewInput: RecipeInput | null | undefined,
  previewResult: RecipeResult | null | undefined,
): MonitorLiveScoreView | null {
  if (!previewInput || !previewResult) return null;
  const proposed = evaluate(PROPOSED_SUBJECT, previewInput, previewResult);
  // A diagnostic/unscorable candidate is never presented as an executable
  // "after" — the before/after comparison simply does not appear.
  return proposed.state === 'scored' ? proposed : null;
}

/**
 * Build the Monitor header view. The comparison appears only when a real valid
 * Preview candidate scores differently from the current recipe — so an applied
 * proposal (now identical to current) stops advertising a stale "6 → 10".
 */
export function monitorScoreComparison(args: {
  input: RecipeInput | null | undefined;
  result: RecipeResult | null | undefined;
  previewInput?: RecipeInput | null;
  previewResult?: RecipeResult | null;
}): MonitorScoreComparisonView {
  const current = monitorLiveScore(args.input, args.result);
  const proposed = monitorProposedScore(args.previewInput, args.previewResult);
  return {
    current,
    proposed,
    showComparison:
      proposed !== null && current.state === 'scored' && proposed.score !== current.score,
  };
}
