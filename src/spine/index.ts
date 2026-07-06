/**
 * PINGUINO Spine — public surface of the pure foundation layer (Phase C
 * Slice 1). Contracts + Product Profile Registry + normalization only.
 *
 * NOT wired into UI, calculateRecipe, the correction solver or any regulator
 * yet — later slices connect it per the locked Integration Flow order.
 */
export * from './types';
export * from './access';
export * from './productProfiles';
export * from './normalizeProductProfile';
export * from './normalizeRecipeIntent';
export * from './designRecipe';
export * from './temperatureRegulator';
export * from './evaluateTemperatureRegulator';
