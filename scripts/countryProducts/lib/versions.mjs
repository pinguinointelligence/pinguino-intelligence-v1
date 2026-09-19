// Where each owner-workbook version of the GELATO base country-product layer
// keeps its registry, manifest, snapshot, reports and entry points. The import
// runner, the reports and the apply CLI read paths from here, so a path is
// written once.

export const VERSION_PATHS = Object.freeze({
  GELATO_BASE_V12: Object.freeze({
    label: 'v12',
    importScript: 'scripts/countryProducts/importGelatoBaseV12.mjs',
    applyScript: 'scripts/countryProducts/applyGelatoBaseV12.mjs',
    registryPath: 'docs/country-products/gelato-base-v12/registry.json',
    manifestPath: 'docs/country-products/gelato-base-v12/manifest.json',
    snapshotPath: 'docs/country-products/gelato-base-v12/catalog-dedupe-snapshot.json',
    reports: Object.freeze({
      coverage: 'reports/COUNTRY_PRODUCTS_V12_COVERAGE.md',
      openGaps: 'reports/COUNTRY_PRODUCTS_V12_OPEN_GAPS.md',
      dbPackage: 'reports/COUNTRY_PRODUCTS_V12_DB_PACKAGE.md',
    }),
  }),
  GELATO_BASE_V23: Object.freeze({
    label: 'v23',
    importScript: 'scripts/countryProducts/importGelatoBaseV23.mjs',
    applyScript: 'scripts/countryProducts/applyGelatoBaseV23.mjs',
    registryPath: 'docs/country-products/gelato-base-v23/registry.json',
    manifestPath: 'docs/country-products/gelato-base-v23/manifest.json',
    snapshotPath: 'docs/country-products/gelato-base-v23/catalog-dedupe-snapshot.json',
    reports: Object.freeze({
      coverage: 'reports/COUNTRY_PRODUCTS_V23_COVERAGE.md',
      openGaps: 'reports/COUNTRY_PRODUCTS_V23_OPEN_GAPS.md',
      dbPackage: 'reports/COUNTRY_PRODUCTS_V23_DB_PACKAGE.md',
    }),
  }),
});

/** Paths of one registry version; an unknown registry id fails. */
export function versionPathsFor(registryId) {
  if (!Object.hasOwn(VERSION_PATHS, String(registryId))) {
    throw new Error(`No GELATO base version paths for registry ${String(registryId)}.`);
  }
  return VERSION_PATHS[registryId];
}
