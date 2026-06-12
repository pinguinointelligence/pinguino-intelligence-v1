/**
 * PINGÜINO deterministic engine — public API.
 *
 * Step 4B foundation: types and config data ONLY. The engine exports NO functions
 * yet (mechanically enforced by the export-purity test). Calculation modules
 * (composition, pod, pac, iceFraction, statuses, scoring, corrections) arrive
 * with 4C+ per docs/PINGUINO_RECIPE_ENGINE_SPEC_V1.md.
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

/** The assembled default configuration (spec §7–§11, §17) — pure data aggregation. */
export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  version: { engine_version: ENGINE_VERSION, config_version: CONFIG_VERSION },
  coefficients: COEFFICIENTS,
  targets: TARGET_BANDS,
  modes: MODES,
  priorities: GOLDEN_MIDDLE_PRIORITY,
  density: DENSITY_DEFAULTS,
};
