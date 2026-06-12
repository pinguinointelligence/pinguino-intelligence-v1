/**
 * PINGÜINO deterministic engine — public API.
 *
 * Implemented so far: foundation types + config (4B), the composition stage
 * (4C — effective grams, component totals, percentages, sugar breakdown),
 * POD (4D — sugar-type sweetness with the stored-value-first rule) and
 * PAC/NPAC (4E — freezing power with alcohol, salt and syrup DE handling;
 * per_total_mass stays the canonical normalization default), ice fraction
 * (4F — category-aware anchor estimation from NPAC + target temperature) and
 * statuses (4G — target-band classification into PI indicator statuses),
 * assembled by calculateRecipe (4H — the spec §12/§18 entry point) and
 * completed by nutrition, cost and scoring (4I — per-100 g label values,
 * honest cost states, mode-weighted stability-gated scores).
 * Still to come per docs/PINGUINO_RECIPE_ENGINE_SPEC_V1.md §18: corrections
 * (solver + redaction). The export-allowlist (shared via
 * __fixtures__/allowedEngineFunctions.ts) mechanically enforces that no
 * correction functions exist before their step.
 */
import { COEFFICIENTS } from './config/coefficients';
import { DENSITY_DEFAULTS } from './config/density';
import { MODES } from './config/modes';
import { GOLDEN_MIDDLE_PRIORITY } from './config/priorities';
import { TARGET_BANDS } from './config/targets';
import { CONFIG_VERSION, ENGINE_VERSION } from './config/version';
import type { EngineConfig } from './types';

export type * from './types';

export { ENGINE_VERSION, CONFIG_VERSION } from './config/version';
export {
  COEFFICIENTS,
  NPAC_COEFFICIENTS,
  NPAC_NORMALIZATION,
  PAC_COEFFICIENTS,
  POD_COEFFICIENTS,
  POLYOL_COEFFICIENTS,
  SYRUP_DE_ANCHORS,
} from './config/coefficients';
export { TARGET_BANDS } from './config/targets';
export { MODES } from './config/modes';
export { GOLDEN_MIDDLE_PRIORITY } from './config/priorities';
export { DENSITY_DEFAULTS } from './config/density';

export type { CompositionResult } from './composition';
export {
  computeComponentGrams,
  computeComponentTotals,
  computeComposition,
  computePercentages,
  computeSugarBreakdown,
  computeTotalBatchGrams,
  resolveEffectiveItems,
} from './composition';

export { computeRecipePod, ingredientPodContribution } from './pod';

export type { NpacOptions } from './pac';
export {
  computeRecipeNpac,
  computeRecipePac,
  ingredientNpacContribution,
  ingredientPacContribution,
  interpolateSyrupDeAnchors,
} from './pac';

export type { IceAnchorRow } from './config/iceAnchors';
export { ICE_ANCHOR_ROWS, ICE_TEMPERATURE_SLOPE_PER_C } from './config/iceAnchors';
export type { IceFractionInput, IceFractionOptions } from './iceFraction';
export { estimateIceFraction } from './iceFraction';

export { IDEAL_ZONE_FRACTION } from './config/targets';
export type {
  ClassifiedIndicator,
  ClassifyOptions,
  StatusInputs,
  StatusOptions,
  TargetBandSelection,
} from './statuses';
export {
  classifyIndicator,
  classifyRecipeIndicators,
  classifyValue,
  computeLactoseSandinessRisk,
  selectTargetBand,
} from './statuses';

export { calculateRecipe } from './calculateRecipe';

export { ATWATER_KCAL_PER_G, computeNutritionPer100g, ingredientKcalContribution } from './nutrition';
export { computeRecipeCosts } from './cost';
export type { ScoresInput } from './scoring';
export { computeCostScore, computeFlavorScore, computeScores, computeTechnicalScore } from './scoring';
export type { CostScoreAnchor } from './config/scoring';
export {
  COST_PRIORITY_PENALTY,
  COST_SCORE_ANCHORS,
  FLAVOR_BASE,
  GOAL_INTENSITY_MULTIPLIER,
  MODE_FLAVOR_SLOPE,
  NEUTRAL_FLAVOR_SCORE,
  OUT_OF_BAND_SLOPE,
  STABILITY_HEADROOM,
  STATUS_SCORES,
  TECHNICAL_INDICATOR_WEIGHTS,
} from './config/scoring';

/** The assembled default configuration (spec §7–§11, §17) — pure data aggregation. */
export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  version: { engine_version: ENGINE_VERSION, config_version: CONFIG_VERSION },
  coefficients: COEFFICIENTS,
  targets: TARGET_BANDS,
  modes: MODES,
  priorities: GOLDEN_MIDDLE_PRIORITY,
  density: DENSITY_DEFAULTS,
};
