/**
 * PINGÜINO Ingredient Resolution — public surface (Agent A).
 *
 * Pure, deterministic domain that resolves a GENERIC recipe requirement line to a concrete
 * product/variant, gated on Engine-readiness before any exact PI recalculation. No IO, no
 * engine math, no React in the pure core. The sibling PI Monitor consumes ONLY
 * `ingredientResolutionSummary` + the `IngredientResolutionState` type.
 */
export * from './contracts';
export * from './engineReadinessGate';
export * from './catalogueSearch';
export * from './ingredientResolution';
