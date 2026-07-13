/**
 * PINGÜINO Product Picker — in-memory catalogue adapter (honest sample).
 *
 * A `ProductCatalogPort` backed by the labelled `SAMPLE_CATALOGUE`. It returns the
 * candidate entries; the pure `searchPickerCatalogue` ranks + filters them. Its
 * source descriptor is ALWAYS `sample`, so the picker shows the honest note and the
 * sample is never presented as the production catalogue.
 */
import type { CatalogueSource, ProductCatalogPort, PickerCatalogueEntry } from './productPickerContracts';
import { SAMPLE_CATALOGUE } from './sampleCatalogue';

/** The honest source descriptor for the sample catalogue (DEV / tests only). */
export const SAMPLE_SOURCE: CatalogueSource = {
  kind: 'sample',
  note: 'Przykładowy katalog referencyjny (tylko DEV) — nie jest to katalog produkcyjny.',
};

/**
 * The honest source when NO approved products/ingredients backend is connected.
 * The public build uses this (never the sample) until an approved environment
 * (the real Mapper Basement + Products) is verified and connected.
 */
export const CATALOGUE_UNAVAILABLE: CatalogueSource = {
  kind: 'unavailable',
  note: 'Katalog jest chwilowo niedostępny. Pełny katalog — Składniki PI (Mapper Basement) i Produkty — zostanie podłączony po konfiguracji zatwierdzonego środowiska.',
};

/** Build an in-memory catalogue port over the sample (or a supplied) entry set. */
export function createInMemoryProductCatalog(
  entries: readonly PickerCatalogueEntry[] = SAMPLE_CATALOGUE,
): ProductCatalogPort {
  const snapshot = [...entries];
  return {
    fetch: async () => snapshot,
  };
}
