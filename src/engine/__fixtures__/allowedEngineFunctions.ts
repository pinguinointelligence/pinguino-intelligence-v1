/**
 * Single source of truth for the engine export allowlist, shared by every
 * scope-guard test. The engine must export exactly these functions and nothing
 * else — in particular nothing scoring/correction shaped until those stages
 * land (spec §18 build order). Future steps extend this ONE list.
 */
export const ALLOWED_ENGINE_FUNCTIONS: readonly string[] = [
  // composition (4C)
  'computeComponentGrams',
  'computeComponentTotals',
  'computeComposition',
  'computePercentages',
  'computeSugarBreakdown',
  'computeTotalBatchGrams',
  'resolveEffectiveItems',
  // POD (4D)
  'computeRecipePod',
  'ingredientPodContribution',
  // PAC/NPAC (4E)
  'computeRecipeNpac',
  'computeRecipePac',
  'ingredientNpacContribution',
  'ingredientPacContribution',
  'interpolateSyrupDeAnchors',
  // ice fraction (4F)
  'estimateIceFraction',
  'hasSeededIceAnchorAtTemperature',
  // statuses (4G)
  'classifyIndicator',
  'classifyRecipeIndicators',
  'classifyValue',
  'computeLactoseSandinessRisk',
  'selectTargetBand',
  // pipeline assembly (4H)
  'calculateRecipe',
  // nutrition / cost / scoring (4I)
  'ingredientKcalContribution',
  'computeNutritionPer100g',
  'computeRecipeCosts',
  'computeTechnicalScore',
  'computeFlavorScore',
  'computeCostScore',
  'computeScores',
  // correction solver (4J)
  'proposeCorrections',
  'detectViolations',
  'selectCandidates',
  'applyCorrectionActions',
  'verifyCorrectionProposal',
  'isReductionAllowed',
  'redactProposal',
  // Auto Fix apply/idempotence core (Slice 1A) — pure wrappers, no new math
  'proposeAutoFix',
  'applyAutoFix',
];
