#!/usr/bin/env node
// Imports the owner workbook GELLATTI_BAZA_GELATO_75_KRAJOW_v12_SYNC.xlsx into
// the GELATO base country-product registry.
//
//   node scripts/countryProducts/importGelatoBaseV12.mjs <workbook.xlsx>          # write outputs
//   node scripts/countryProducts/importGelatoBaseV12.mjs <workbook.xlsx> --check  # fail on drift
//
// Reads only the workbook and the committed read-only catalog snapshot. It
// never talks to the database.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApplyPlan } from './lib/applyPlan.mjs';
import { buildRegistry } from './lib/registryBuilder.mjs';
import { renderCoverageReport, renderDbPackageReport, renderOpenGapsReport } from './lib/reports.mjs';
import { formatJson } from './lib/stableJson.mjs';
import { V12_WORKBOOK, parseWorkbookV12 } from './lib/workbookV12.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTPUT_DIR = 'docs/country-products/gelato-base-v12';
const SNAPSHOT_PATH = `${OUTPUT_DIR}/catalog-dedupe-snapshot.json`;
const REGISTRY_PATH = `${OUTPUT_DIR}/registry.json`;
const MANIFEST_PATH = `${OUTPUT_DIR}/manifest.json`;
const REPORT_PATHS = Object.freeze({
  coverage: 'reports/COUNTRY_PRODUCTS_V12_COVERAGE.md',
  openGaps: 'reports/COUNTRY_PRODUCTS_V12_OPEN_GAPS.md',
  dbPackage: 'reports/COUNTRY_PRODUCTS_V12_DB_PACKAGE.md',
});

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = formatJson;

function usage(message) {
  if (message) process.stderr.write(`${message}\n`);
  process.stderr.write('Usage: node scripts/countryProducts/importGelatoBaseV12.mjs <workbook.xlsx> [--check]\n');
  process.exit(2);
}

const argv = process.argv.slice(2);
const check = argv.includes('--check');
const positional = argv.filter((entry) => !entry.startsWith('--'));
const unknownFlags = argv.filter((entry) => entry.startsWith('--') && entry !== '--check');
if (unknownFlags.length > 0) usage(`Unknown option(s): ${unknownFlags.join(', ')}`);
if (positional.length !== 1) usage('Exactly one workbook path is required.');

const workbookPath = resolve(positional[0]);
const workbookBytes = readFileSync(workbookPath);
const workbookSha256 = sha256(workbookBytes);
if (workbookSha256 !== V12_WORKBOOK.sha256) {
  process.stderr.write(
    `Refusing: ${workbookPath} has sha256 ${workbookSha256}; the pinned v12 workbook is ${V12_WORKBOOK.sha256}.\n`,
  );
  process.exit(1);
}

const snapshotBytes = readFileSync(resolve(repoRoot, SNAPSHOT_PATH));
const registry = buildRegistry({
  workbook: parseWorkbookV12(workbookBytes),
  workbookSha256,
  snapshot: JSON.parse(snapshotBytes.toString('utf8')),
  snapshotSha256: sha256(snapshotBytes),
  snapshotPath: SNAPSHOT_PATH,
});
const plan = buildApplyPlan(registry);

const outputs = new Map([
  [REGISTRY_PATH, json(registry)],
  [REPORT_PATHS.coverage, renderCoverageReport(registry, plan)],
  [REPORT_PATHS.openGaps, renderOpenGapsReport(registry)],
  [REPORT_PATHS.dbPackage, renderDbPackageReport(registry, plan)],
]);
const manifest = {
  schema: 'gellatti.country-products.gelato-base.manifest/v1',
  registryId: registry.registryId,
  source: {
    basename: V12_WORKBOOK.basename,
    sha256: workbookSha256,
    sheetsUsed: registry.source.sheetsUsed,
    sheetsInWorkbook: registry.source.sheetsInWorkbook,
  },
  catalogSnapshot: {
    path: SNAPSHOT_PATH,
    sha256: registry.catalogSnapshot.sha256,
    capturedAt: registry.catalogSnapshot.capturedAt,
    projectRef: registry.catalogSnapshot.projectRef,
    readOnly: true,
  },
  outputs: [...outputs.entries()].map(([path, content]) => ({
    path,
    sha256: sha256(Buffer.from(content, 'utf8')),
    bytes: Buffer.byteLength(content, 'utf8'),
  })),
  counts: registry.counts,
  dbPlan: {
    productsToCreate: plan.productsToCreate.length,
    tableCounts: plan.tableCounts,
    routeCounts: plan.routeCounts,
    approvalToken: plan.approvalToken,
    executed: false,
  },
  generator: 'scripts/countryProducts/importGelatoBaseV12.mjs',
  regenerate: 'node scripts/countryProducts/importGelatoBaseV12.mjs <path>/GELLATTI_BAZA_GELATO_75_KRAJOW_v12_SYNC.xlsx',
  verify: 'node scripts/countryProducts/importGelatoBaseV12.mjs <path>/GELLATTI_BAZA_GELATO_75_KRAJOW_v12_SYNC.xlsx --check',
};
outputs.set(MANIFEST_PATH, json(manifest));

if (check) {
  const drift = [];
  for (const [path, content] of outputs) {
    let current = null;
    try {
      current = readFileSync(resolve(repoRoot, path), 'utf8');
    } catch {
      current = null;
    }
    if (current !== content) drift.push(path);
  }
  if (drift.length > 0) {
    process.stderr.write(`Drift: regenerated output differs from the committed file(s):\n${drift.map((path) => `  ${path}`).join('\n')}\n`);
    process.exit(1);
  }
  process.stdout.write(`OK: ${outputs.size} outputs match the workbook ${V12_WORKBOOK.basename} (${workbookSha256}).\n`);
} else {
  for (const [path, content] of outputs) {
    const target = resolve(repoRoot, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  process.stdout.write(
    `${json({
      wrote: [...outputs.keys()],
      products: registry.counts.products,
      productsBySlot: registry.counts.productsBySlot,
      proposalDecisions: registry.counts.proposalDecisions,
      openGaps: registry.counts.openGaps.byWorkbookRole,
      routes: plan.routeCounts,
      productsToCreate: plan.productsToCreate.length,
    })}`,
  );
}
