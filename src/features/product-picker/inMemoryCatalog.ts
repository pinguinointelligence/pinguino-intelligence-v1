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

/** The honest source descriptor for the sample catalogue. */
export const SAMPLE_SOURCE: CatalogueSource = {
  kind: 'sample',
  note: 'Przykładowy katalog referencyjny — pełny katalog produktów zostanie podłączony po konfiguracji zatwierdzonego środowiska.',
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
