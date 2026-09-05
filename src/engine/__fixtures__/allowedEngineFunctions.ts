/**
 * Single source of truth for the engine export allowlist, shared by every
 * scope-guard test. The engine must export exactly these functions and nothing
 * else. Future Engine/Rescue stages extend this ONE list so every scope guard
 * observes the same intentional public surface.
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
  'projectSorbetDirectionCandidate',
  'hasSeededIceAnchorAtTemperature',
  // Vegan freezing-authority provenance boundary (Vegan Engine v2 §14/§15).
  // Documentation + replacement seam only — no numeric behaviour of its own.
  'resolveIceAuthorityProvenance',
  'hasOwnPlantValidatedVeganIceAuthority',
  'veganTemperatureBandProvenance',
  // Sorbet composition-freezing authority (direct ice authority, no milk fallback)
  'hasDirectIceAuthorityAtTemperature',
  'isSorbetFreezingTemperatureSupported',
  'sorbetFreezingUnavailableReasonFromWarnings',
  // statuses (4G)
  'classifyIndicator',
  'classifyRecipeIndicators',
  'classifyValue',
  'computeLactoseSandinessRisk',
  'selectTargetBand',
  // pipeline assembly (4H)
  'calculateRecipe',
  'effectiveMachineCapacityGrams',
  // exact read-only factors for certified mathematical relaxations
  'technicalLinearIngredientFactors',
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
  // USER-INTENT MEASURE (owner SOFT-HOLD). Pure arithmetic over two existing
  // product-layer sidecars — no band, no dose, no ingredient knowledge. It
  // lives in the engine because the correction solver can REDUCE a line, so
  // the floor has to bind here; the product layer re-exports these rather than
  // restating them, keeping one semantic authority.
  'normalizedLineDrift',
  'isMaterialUserIntentDeviation',
  'materialDeviationFloorGrams',
  'userLineBaselineGrams',
  'redactProposal',
  // Auto Fix apply/idempotence core (Slice 1A) — pure wrappers, no new math
  'proposeAutoFix',
  'applyAutoFix',
  // Production recovery authority — pure completed-batch candidate evaluation.
  'evaluateAdditiveRecoveryNeighborhood',
  'proposeBatchRecovery',
];
