/**
 * PINGÜINO Product Picker — public surface.
 *
 * A READ-only picker that resolves a generic requirement line to a concrete product
 * from the CANONICAL products layer (backend catalogue adapter, or the honest in-memory
 * sample). Pure contracts + search + a `ProductRow` mapper; no engine imports, no
 * invented pac/pod, no product writes. Readiness is delegated to the reused
 * Ingredient-Resolution gate.
 */
export * from './productPickerContracts';
export * from './productSearch';
export * from './productRowMapper';
export * from './ingredientCatalogue';
export * from './inMemoryCatalog';
export * from './mapperLiveSearch';
export { SAMPLE_CATALOGUE, sampleCategoryForIngredient } from './sampleCatalogue';
export {
  BUNDLED_CATALOGUE_ENTRIES,
  BUNDLED_CATALOGUE_READY_COUNT,
  BUNDLED_CATALOGUE_SOURCE,
  bundledCategoryForIngredient,
} from './bundledCatalogue';
