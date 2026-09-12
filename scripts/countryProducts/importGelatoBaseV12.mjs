#!/usr/bin/env node
// Imports the owner workbook GELLATTI_BAZA_GELATO_75_KRAJOW_v12_SYNC.xlsx into
// the GELATO base country-product registry.
//
//   node scripts/countryProducts/importGelatoBaseV12.mjs <workbook.xlsx>          # write outputs
//   node scripts/countryProducts/importGelatoBaseV12.mjs <workbook.xlsx> --check  # fail on drift
//
// Reads only the workbook and the committed read-only catalog snapshot. It
// never talks to the database. The command line, builder, DB plan and reports
// are shared with the v23 importer (lib/importRunner.mjs).

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runImport } from './lib/importRunner.mjs';
import { V12_REGISTRY_PROFILE } from './lib/registryBuilder.mjs';
import { VERSION_PATHS } from './lib/versions.mjs';
import { V12_WORKBOOK, parseWorkbookV12 } from './lib/workbookV12.mjs';

runImport({
  repoRoot: resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'),
  argv: process.argv.slice(2),
  paths: VERSION_PATHS.GELATO_BASE_V12,
  pinnedWorkbook: V12_WORKBOOK,
  parseWorkbook: parseWorkbookV12,
  profile: V12_REGISTRY_PROFILE,
});
