/**
 * PINGÜINO recipe-score — presentational contracts for the UI/UX master program:
 * the „Dopasowanie receptury" 1–10 adapter (SPEC §15.1–§15.2), the Złoty Zakres
 * 5-state vocabulary (§15.3) and the three-indicator separation (§20.5).
 * Presentation only: the engine is never modified and never re-derived here.
 */
export {
  MATCH_SCORE_DISPLAY_NAME,
  MATCH_SCORE_LABELS,
  MATCH_SCORE_NO_DATA_LABEL,
  MATCH_SCORE_TOOLTIPS,
  recipeMatchScore,
  type MatchScoreTooltipKey,
  type RecipeMatchScoreInput,
  type RecipeMatchScorePresentation,
  type TenPointScore,
} from './recipeMatchScore';

export {
  AMBER_OVERSHOOT_LIMIT_HALF_WIDTHS,
  GOLDEN_RANGE_SEVERITY,
  GOLDEN_RANGE_STATE_BY_INDICATOR_STATUS,
  GOLDEN_RANGE_STATE_TEXT,
  bandPosition,
  bandStateForIndicatorStatus,
  type BandDirectionSemantics,
  type BandPositionOptions,
  type BandSide,
  type GoldenBandInput,
  type GoldenRangeReading,
  type GoldenRangeState,
  type GoldenRangeStateText,
  type GoldenRangeTextKey,
} from './goldenRange';

export {
  DATA_CONFIDENCE_DISCLAIMER,
  DATA_CONFIDENCE_LEVELS,
  PRODUCTION_READINESS_ORDER,
  PRODUCTION_READINESS_TEXT,
  READINESS_THRESHOLDS,
  RECIPE_INDICATOR_CONTRACTS,
  RECIPE_INDICATOR_KINDS,
  dataConfidence,
  productionReadiness,
  type DataConfidencePresentation,
  type DataConfidenceSubject,
  type DataConfidenceTextKey,
  type IndicatorAudience,
  type ProductionReadiness,
  type ProductionReadinessInput,
  type ProductionReadinessText,
  type ProductionReadinessTextKey,
  type RecipeIndicatorContract,
  type RecipeIndicatorKind,
} from './indicatorSeparation';
