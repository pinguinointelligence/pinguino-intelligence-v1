/**
 * PINGÜINO Customer Flow — public surface (Agent B).
 *
 * Pure, deterministic conversational domain layered above the locked spine
 * intent normalizer. No IO, no engine math, no React. See the individual
 * modules for the test-pinned invariants.
 */
export * from './types';
export * from './naturalLanguageBatch';
export * from './polishFlavorSynonyms';
export * from './devicePresets';
export * from './customerFlow';
export * from './recipeStructure';
export * from './readyRecipeMatching';
export * from './recipeView';
export * from './substitutionIntent';
