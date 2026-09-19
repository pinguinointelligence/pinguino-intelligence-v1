#!/usr/bin/env node
// Imports the FINAL owner workbook GELLATTI_BAZA_GELATO_75_KRAJOW_v23_SYNC_FINAL.xlsx
// into the GELATO base country-product registry — the same builder, dedupe,
// DB plan and reports as v12 (scripts/countryProducts/lib), read with the v23
// layout (lib/workbookV23.mjs) and the v23 trail 83_SYNC_V23 / 84_POZOSTALE_V23.
//
//   node scripts/countryProducts/importGelatoBaseV23.mjs <workbook.xlsx>          # write outputs
//   node scripts/countryProducts/importGelatoBaseV23.mjs <workbook.xlsx> --check  # fail on drift
//
// Catalog snapshot: docs/country-products/gelato-base-v23/catalog-dedupe-snapshot.json.
// While that file does not exist it is seeded as a byte copy of the v12
// snapshot (captured read-only 2026-09-11). It must be re-captured read-only
// immediately before any apply; the manifest records that, and the v23 apply
// entry point refuses --apply while the snapshot is still the seeded copy.
// Reads only the workbook and the committed snapshot; never the database.

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runImport } from './lib/importRunner.mjs';
import { V23_REGISTRY_PROFILE } from './lib/registryBuilder.mjs';
import { VERSION_PATHS } from './lib/versions.mjs';
import { V23_WORKBOOK, parseWorkbookV23 } from './lib/workbookV23.mjs';

runImport({
  repoRoot: resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'),
  argv: process.argv.slice(2),
  paths: VERSION_PATHS.GELATO_BASE_V23,
  pinnedWorkbook: V23_WORKBOOK,
  parseWorkbook: parseWorkbookV23,
  profile: V23_REGISTRY_PROFILE,
  snapshotSeedPath: VERSION_PATHS.GELATO_BASE_V12.snapshotPath,
  snapshotManifestNotes: {
    readOnlyRecheck: {
      at: '2026-09-12T14:58Z',
      result:
        'Same 18 active catalog markets (AT BE CZ DE DK ES FI FR GB IE IT NL PH PL PT SE SK US), the same 3 country assignments (milk PI-ING-000236: ES PR-ING-007173, FR PR-ING-007174, PL PR-ING-007172) and the same 3 slot reviews as this snapshot.',
      recordedFrom:
        'Owner session brief of 2026-09-12. The re-check was not performed by this importer and did not replace the snapshot file.',
    },
    refreshBeforeApply:
      'REQUIRED — re-capture this snapshot read-only immediately before any apply, re-run the v23 importer and review the regenerated DB package; applyGelatoBaseV23.mjs refuses --apply while seedCopy is true.',
  },
});
