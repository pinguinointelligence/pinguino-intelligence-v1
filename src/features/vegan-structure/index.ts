/**
 * VEGAN ENGINE v2 — public surface of the derived structural model.
 *
 * ADDITIVE ONLY. Nothing exported here is a hard gate, a band, a Score input,
 * an eligibility rule or a Mapper mutation. Consumers must treat `UNKNOWN` as
 * "no information → baseline Vegan behaviour", never as a defect.
 */
export * from './veganBehaviorTaxonomy';
export {
  MATERIAL_COMPONENT_PERCENT,
  veganBehaviorFactsFromEngineIngredient,
  veganBehaviorFactsFromMapperRow,
  type VeganBehaviorFacts,
  type VeganBehaviorMapperFacts,
} from './veganBehaviorFacts';
export { deriveVeganBehavior, normalizeIdentityText } from './deriveVeganBehavior';
export {
  clearVeganBehaviorCache,
  hasDerivedStructuralEvidence,
  veganBehaviorForFacts,
  veganBehaviorForIngredient,
  veganEnhancementLevel,
} from './veganBehaviorRuntime';
export {
  assessVeganRecipeStructure,
  compareVeganStructuralCandidates,
  compareVeganStructuralPreference,
  type VeganFatSystemSummary,
  type VeganProteinSystemSummary,
  type VeganStructuralQuality,
  type VeganStructureAssessment,
  type VeganStructureReason,
  type VeganStructureReasonCode,
} from './veganStructureAssessment';
