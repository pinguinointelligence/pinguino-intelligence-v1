/**
 * „Dopasowanie techniczne" — the PUBLIC headline recipe-fit integer
 * (ACCEPTANCE ADDENDUM 2, owner decision 2026-07-24; supersedes the §15.1
 * no-sub-dimensions rule for the headline).
 *
 * PUBLIC CONTRACT (adapter layer ONLY — the engine is untouched, science
 * freeze respected):
 *  - the headline integer is TECHNICAL recipe-fit, derived from the engine's
 *    band/technical dimension — NEVER from the mode-weighted `overall` blend
 *    (which mixes flavor/cost sub-scores and made T17 — all native bands in
 *    range, 0 violations — present as 9/10);
 *  - when ALL native approved technological bands are in range (0 violations,
 *    no provisional/fallback banding) the technical fit shows EXACTLY 10/10;
 *  - with violations the score degrades HONESTLY from the engine's own
 *    `scores.technical` dimension (clamped, integer-only, capped at 9 so a
 *    10/10 can only ever mean „all native bands in range");
 *  - provisional/fallback profiles (category_fallback / temperature_fallback /
 *    estimated bands) keep „Ocena częściowa / prowizoryczna" and can NEVER
 *    show a validated native 10/10 (structural cap at 9 + provisional flag);
 *  - cost and subjective flavor are SEPARATE labeled dimensions
 *    (`commercialDimensions`) — never mixed into the technical integer, still
 *    integer-only (no fake precision), honest „Brak danych" for unknown cost.
 *
 * The former `recipeMatchScore` (overall-based) remains available for QA
 * recorders/diagnostics; public headline surfaces (OverallScoreCard, Monitor
 * readouts) consume THIS adapter.
 */
import { detectViolations, type RecipeResult, type RecipeScores } from '@/engine';
import { MATCH_SCORE_LABELS, MATCH_SCORE_NO_DATA_LABEL, type TenPointScore } from './recipeMatchScore';

/** Binding public name of the headline technical dimension. */
export const TECHNICAL_FIT_DISPLAY_NAME = 'Dopasowanie techniczne';

/** The exact provisional-profile qualifier (kept from the frozen contract). */
export const TECHNICAL_FIT_PROVISIONAL_LABEL = 'Ocena częściowa / prowizoryczna';

export type TechnicalFitTooltipKey =
  | 'recipe-score.technical.tooltip'
  | 'recipe-score.technical.tooltip.no-data';

export const TECHNICAL_FIT_TOOLTIPS: Readonly<Record<TechnicalFitTooltipKey, string>> =
  Object.freeze({
    'recipe-score.technical.tooltip':
      'Dopasowanie techniczne ocenia wyłącznie zgodność receptury z zatwierdzonymi zakresami ' +
      'technologicznymi. 10/10 oznacza, że wszystkie natywne zatwierdzone zakresy są w normie. ' +
      'Koszt i profil smakowy są osobnymi wymiarami i nigdy nie wpływają na tę ocenę. ' +
      'Nie jest to gwarancja laboratoryjna.',
    'recipe-score.technical.tooltip.no-data':
      'Za mało danych, aby ocenić dopasowanie techniczne. Uzupełnij składniki i gramatury, ' +
      'aby otrzymać ocenę.',
  });

export interface TechnicalFitPresentation {
  /** Integer 1–10, or null when the engine could not score the recipe. */
  score: TenPointScore | null;
  /** §15.1 verdict for the shown integer (or the honest no-data label). */
  label: string;
  /** Ready-to-render text, e.g. „10/10" — never decimals, never a percent. */
  display: string;
  /** Screen-reader text: number + verdict (+ the provisional qualifier). */
  ariaText: string;
  tooltipKey: TechnicalFitTooltipKey;
  /** TRUE ⇔ ALL native approved technological bands in range on a NATIVE
   * profile — the ONLY state that may show 10/10. */
  validatedNative: boolean;
  /** Provisional/fallback/estimated-band profile — „Ocena częściowa /
   * prowizoryczna"; structurally capped below 10. */
  provisional: boolean;
  /** Honest count of out-of-band metrics driving the degrade. */
  violationCount: number;
}

const clampToScale = (value: number): TenPointScore =>
  Math.min(10, Math.max(1, value)) as TenPointScore;

/**
 * Derive the public „Dopasowanie techniczne" from an engine result. PURE:
 * reads the engine's own violations/provenance/`scores.technical`; never
 * re-derives any band value, never mutates its input.
 */
export function recipeTechnicalFit(
  result: RecipeResult | null | undefined,
): TechnicalFitPresentation {
  const technical = result?.scores?.technical;
  if (
    result == null ||
    result.scores == null ||
    technical === undefined ||
    technical === null ||
    !Number.isFinite(technical)
  ) {
    return {
      score: null,
      label: MATCH_SCORE_NO_DATA_LABEL,
      display: '—',
      ariaText: `${TECHNICAL_FIT_DISPLAY_NAME}: ${MATCH_SCORE_NO_DATA_LABEL}`,
      tooltipKey: 'recipe-score.technical.tooltip.no-data',
      validatedNative: false,
      provisional: false,
      violationCount: 0,
    };
  }

  const violations = detectViolations(result);
  const provisional = result.indicators.some(
    (indicator) =>
      indicator.category_fallback === true ||
      indicator.temperature_fallback === true ||
      indicator.band_status === 'estimated',
  );

  // ALL native approved technological bands in range ⇒ EXACTLY 10/10.
  const validatedNative = violations.length === 0 && !provisional;
  const score: TenPointScore = validatedNative
    ? 10
    : // Honest degrade from the engine's OWN technical/band dimension,
      // structurally capped at 9: 10/10 can only mean all-native-in-range.
      (Math.min(9, clampToScale(Math.round(technical / 10))) as TenPointScore);

  const label = MATCH_SCORE_LABELS[score];
  const provisionalSuffix = provisional ? ` — ${TECHNICAL_FIT_PROVISIONAL_LABEL}` : '';
  return {
    score,
    label,
    display: `${score}/10`,
    ariaText: `${TECHNICAL_FIT_DISPLAY_NAME}: ${score} na 10 — ${label}${provisionalSuffix}`,
    tooltipKey: 'recipe-score.technical.tooltip',
    validatedNative,
    provisional,
    violationCount: violations.length,
  };
}

/* ── separate commercial/subjective dimensions (never in the headline) ────── */

export const FLAVOR_DIMENSION_NAME = 'Profil smakowy';
export const COST_DIMENSION_NAME = 'Koszt';
export const COST_DIMENSION_NO_DATA_LABEL = 'Brak danych kosztowych';

export interface ScoreDimensionPresentation {
  name: string;
  /** Integer 1–10, or null (honest no-data — e.g. unknown cost). */
  score: TenPointScore | null;
  /** „7/10" or „—". Integer-only — no fake precision. */
  display: string;
}

export interface CommercialDimensionsPresentation {
  flavor: ScoreDimensionPresentation;
  cost: ScoreDimensionPresentation;
}

/**
 * Flavor (subjective) and cost (commercial) as SEPARATE labeled dimensions
 * (ACCEPTANCE ADDENDUM 2). Presentation-only normalization of the engine's
 * already-computed sub-scores; unknown cost stays an honest null.
 */
export function commercialDimensions(
  scores: RecipeScores | null | undefined,
): CommercialDimensionsPresentation {
  const dim = (name: string, value: number | null | undefined): ScoreDimensionPresentation => {
    if (value === undefined || value === null || !Number.isFinite(value)) {
      return { name, score: null, display: '—' };
    }
    const score = clampToScale(Math.round(value / 10));
    return { name, score, display: `${score}/10` };
  };
  return {
    flavor: dim(FLAVOR_DIMENSION_NAME, scores?.flavor),
    cost: dim(COST_DIMENSION_NAME, scores?.cost),
  };
}
