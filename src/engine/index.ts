/**
 * PINGÜINO deterministic engine — public API.
 *
 * Implemented so far: foundation types + config (4B), the composition stage
 * (4C — effective grams, component totals, percentages, sugar breakdown) and
 * POD (4D — sugar-type sweetness with the stored-value-first rule).
 * Still to come per docs/PINGUINO_RECIPE_ENGINE_SPEC_V1.md §18: pac,
 * iceFraction, statuses, scoring, corrections. The export-allowlist test in
 * foundation.test.ts mechanically enforces that no metric/correction functions
 * exist before their step.
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

/** The assembled default configuration (spec §7–§11, §17) — pure data aggregation. */
export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  version: { engine_version: ENGINE_VERSION, config_version: CONFIG_VERSION },
  coefficients: COEFFICIENTS,
  targets: TARGET_BANDS,
  modes: MODES,
  priorities: GOLDEN_MIDDLE_PRIORITY,
  density: DENSITY_DEFAULTS,
};
