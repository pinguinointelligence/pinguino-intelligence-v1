import type { RecipeInput } from '../../../../src/engine/index.ts';
import type { RecipeVersion } from '../../../../src/features/pro-core/recipeContracts.ts';
import type { ExactScaleResult } from '../../../../src/features/pro-core/recipeScaling.ts';
import type { ProductionRun } from '../../../../src/features/pro-core/productionContracts.ts';
import type { RecipeCompositionMetadata } from '../../../../src/features/recipe-composition/recipeCompositionPersistence.ts';
import type {
  ProductionSession,
  ProductionSource,
} from '../../../../src/features/production-workspace/productionSession.ts';
import type { ProductionRescueAssessment } from '../../../../src/features/production-workspace/productionRescue.ts';

export const ENGINE_VERSION: '0.4.0';
export const CONFIG_VERSION: '0.7.0';
export const PRACTICAL_RECIPE_MODEL_VERSION: 'pro-whole-gram-v1';
export const PRODUCTION_RESCUE_MODEL_VERSION: 'production-rescue-v3';

export function assessProductionRescue(session: ProductionSession): ProductionRescueAssessment;
export function productionRescueCandidateFingerprint(input: RecipeInput): string;
export function hydrateProductionSessionFromRun(
  run: ProductionRun,
  source: ProductionSource,
  plannedInput: RecipeInput,
  plannedComposition: RecipeCompositionMetadata,
): ProductionSession;
export function scaleRecipeVersion(
  version: RecipeVersion,
  target: { kind: 'weight_g'; grams: number },
): ExactScaleResult | { ok: false; reason: string; message: string };
export function scaledRecipeInput(version: RecipeVersion, scaled: ExactScaleResult): RecipeInput;
