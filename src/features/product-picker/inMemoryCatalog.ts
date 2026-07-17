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
 *
 * AUDIT #2 (P0) + SPEC §18.5/§3.2, owner decision (Slice C): the old note leaked
 * internal wording („konfiguracja bezpiecznego środowiska”) and left the picker a
 * dead end. The note is customer Polish and names the honest ways forward — the
 * sheet actions „Skanuj etykietę” / „Dodaj produkt ręcznie” really exist, and
 * closing the sheet loses nothing. No availability promise is invented.
 */
export const CATALOGUE_UNAVAILABLE: CatalogueSource = {
  kind: 'unavailable',
  note: 'Wyszukiwarka produktów nie jest jeszcze dostępna w tej wersji. Produkt dodasz przez „Skanuj etykietę” albo „Dodaj produkt ręcznie” — Twoja receptura zostanie zachowana.',
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
