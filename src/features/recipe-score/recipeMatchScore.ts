/**
 * PINGÜINO UI/UX master — „Dopasowanie receptury" 1–10 adapter (SPEC §15.1–§15.2).
 *
 * PRESENTATION-ONLY normalization of the engine's already-computed scores onto the
 * public 1–10 integer scale with the exact §15.1 Polish labels. AUDITED input
 * semantics (do NOT assume 0–100 blindly — this was verified against the engine):
 *
 *   - The engine scoring stage (src/engine/scoring.ts, exposed through the public
 *     `@/engine` barrel) produces `RecipeScores { technical, flavor, cost, overall }`
 *     where every component is a FLOAT on a 0–100 scale (status bases live in
 *     config STATUS_SCORES: 100 ideal … 30 needs_correction; flavor and cost are
 *     clamped to [0, 100]).
 *   - `overall` is ALREADY mode-weighted (config/modes score_weights), already
 *     renormalized when cost is unknown, and already capped by the stability gate
 *     (overall ≤ technical + STABILITY_HEADROOM). This adapter therefore reads
 *     `overall` ONLY and never re-derives any engine math — the engine's own
 *     weighting/gating semantics pass through untouched.
 *   - `RecipeResult.scores` is `RecipeScores | null`; null means the recipe could
 *     not be scored (e.g. zero-mass batch) → the honest „Brak danych" row, never 0.
 *   - `cost: null` (unknown cost) does NOT null the presentation: the engine has
 *     already renormalized `overall` over technical+flavor in that case.
 *
 * Mapping (§15.2): score = clamp(round(overall / 10), 1, 10).
 *   - MONOTONIC: `round` and `clamp` are both non-decreasing, so a higher
 *     underlying overall can never present as a lower 1–10.
 *   - STABLE: a pure function of `overall` alone — same input, same output; no
 *     state, no randomness, no clock.
 *   - INTEGER-ONLY presentation: the engine keeps full float precision internally;
 *     rounding happens exclusively in this presentational layer (§15.1 — never
 *     „8,7/10", never decimals, never a percentage).
 *
 * Never mutates its input. No engine import beyond the public barrel types.
 */
import type { RecipeScores } from '@/engine';

/** Public display name of the score (§15.1) — never „poprawność", never a percent. */
export const MATCH_SCORE_DISPLAY_NAME = 'Dopasowanie receptury';

/** The public integer score scale (§15.1). */
export type TenPointScore = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/**
 * The minimal input this adapter actually reads — a STRUCTURAL subset of the
 * engine's `RecipeScores` (a full `RecipeResult.scores` object satisfies it).
 */
export type RecipeMatchScoreInput = Pick<RecipeScores, 'overall'>;

export type MatchScoreTooltipKey = 'recipe-score.match.tooltip' | 'recipe-score.match.tooltip.no-data';

export interface RecipeMatchScorePresentation {
  /** Integer 1–10, or null when the engine could not score the recipe. */
  score: TenPointScore | null;
  /** The exact §15.1 Polish label for the score (or the honest no-data label). */
  label: string;
  /** Tooltip contract key — the scored tooltip states 10/10 ≠ laboratory guarantee. */
  tooltipKey: MatchScoreTooltipKey;
  /** Ready-to-render text, e.g. „7/10" — never decimals, never a percent; „—" when null. */
  display: string;
  /** Screen-reader text (§21.5): both the number („7 na 10") and the verbal label. */
  ariaText: string;
}

/** The exact §15.1 label table (3–4 share one row, 1–2 share one row). */
export const MATCH_SCORE_LABELS: Readonly<Record<TenPointScore, string>> = Object.freeze({
  10: 'Wyjątkowo dobrze dopasowana',
  9: 'Świetnie dopasowana',
  8: 'Bardzo dobrze dopasowana',
  7: 'Dobrze dopasowana',
  6: 'Blisko optimum',
  5: 'Wymaga korekty',
  4: 'Wyraźnie niezbalansowana',
  3: 'Wyraźnie niezbalansowana',
  2: 'Wymaga przebudowy',
  1: 'Wymaga przebudowy',
});

/** The exact §15.1 „Brak danych" label. */
export const MATCH_SCORE_NO_DATA_LABEL = 'Brak wystarczających danych do oceny';

/** Tooltip contract (§15.2): 10/10 is honest fit-to-goal, NOT a laboratory guarantee. */
export const MATCH_SCORE_TOOLTIPS: Readonly<Record<MatchScoreTooltipKey, string>> = Object.freeze({
  'recipe-score.match.tooltip':
    'Dopasowanie receptury ocenia, jak dobrze wynik odpowiada produktowi, trybowi i założeniom. ' +
    '10/10 oznacza bardzo dobre dopasowanie do celu — nie jest gwarancją laboratoryjną.',
  'recipe-score.match.tooltip.no-data':
    'Za mało danych, aby ocenić dopasowanie receptury. Uzupełnij składniki i gramatury, aby otrzymać ocenę.',
});

const clampToScale = (value: number): TenPointScore =>
  Math.min(10, Math.max(1, value)) as TenPointScore;

/**
 * Normalize the engine's already-computed scores to the public 1–10 presentation.
 * Accepts exactly what the current engine result provides (`RecipeResult.scores`,
 * i.e. `RecipeScores | null`); reads `overall` only. Pure and non-mutating.
 */
export function recipeMatchScore(
  input: RecipeMatchScoreInput | null | undefined,
): RecipeMatchScorePresentation {
  const overall = input?.overall;
  if (overall === undefined || overall === null || !Number.isFinite(overall)) {
    return {
      score: null,
      label: MATCH_SCORE_NO_DATA_LABEL,
      tooltipKey: 'recipe-score.match.tooltip.no-data',
      display: '—',
      ariaText: `${MATCH_SCORE_DISPLAY_NAME}: ${MATCH_SCORE_NO_DATA_LABEL}`,
    };
  }

  // §15.2 mapping: monotone, stable, integer-only. Engine precision is untouched —
  // rounding exists solely here, in the presentational layer.
  const score = clampToScale(Math.round(overall / 10));
  const label = MATCH_SCORE_LABELS[score];
  return {
    score,
    label,
    tooltipKey: 'recipe-score.match.tooltip',
    display: `${score}/10`,
    ariaText: `${MATCH_SCORE_DISPLAY_NAME}: ${score} na 10 — ${label}`,
  };
}
