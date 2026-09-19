// Shared command line of the GELATO base importers — one thin entry point per
// owner workbook version (importGelatoBaseV12.mjs, importGelatoBaseV23.mjs).
//
//   node <entry point> <workbook.xlsx>          # write outputs
//   node <entry point> <workbook.xlsx> --check  # fail on drift
//
// Reads only the pinned workbook and the committed read-only catalog snapshot.
// It never talks to the database.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildApplyPlan } from './applyPlan.mjs';
import { buildRegistry } from './registryBuilder.mjs';
import { renderCoverageReport, renderDbPackageReport, renderOpenGapsReport } from './reports.mjs';
import { formatJson } from './stableJson.mjs';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = formatJson;

/**
 * @param {object} input
 * @param {string} input.repoRoot
 * @param {string[]} input.argv command-line arguments after the script name
 * @param {ReturnType<import('./versions.mjs').versionPathsFor>} input.paths
 * @param {{ basename: string, sha256: string }} input.pinnedWorkbook
 * @param {(bytes: Buffer) => object} input.parseWorkbook
 * @param {object} input.profile registry profile (registryBuilder.mjs)
 * @param {string | null} [input.snapshotSeedPath] when set, the snapshot is an
 *   output: it is read from paths.snapshotPath, or — while that file does not
 *   exist — seeded as a byte copy of this path.
 * @param {object | null} [input.snapshotManifestNotes] extra snapshot fields,
 *   recorded in registry.catalogSnapshot and in the manifest
 */
export function runImport({
  repoRoot,
  argv,
  paths,
  pinnedWorkbook,
  parseWorkbook,
  profile,
  snapshotSeedPath = null,
  snapshotManifestNotes = null,
}) {
  const usage = (message) => {
    if (message) process.stderr.write(`${message}\n`);
    process.stderr.write(`Usage: node ${paths.importScript} <workbook.xlsx> [--check]\n`);
    process.exit(2);
  };
  const check = argv.includes('--check');
  const positional = argv.filter((entry) => !entry.startsWith('--'));
  const unknownFlags = argv.filter((entry) => entry.startsWith('--') && entry !== '--check');
  if (unknownFlags.length > 0) usage(`Unknown option(s): ${unknownFlags.join(', ')}`);
  if (positional.length !== 1) usage('Exactly one workbook path is required.');

  const workbookPath = resolve(positional[0]);
  const workbookBytes = readFileSync(workbookPath);
  const workbookSha256 = sha256(workbookBytes);
  if (workbookSha256 !== pinnedWorkbook.sha256) {
    process.stderr.write(
      `Refusing: ${workbookPath} has sha256 ${workbookSha256}; the pinned ${profile.label} workbook is ${pinnedWorkbook.sha256}.\n`,
    );
    process.exit(1);
  }

  const snapshotFile = resolve(repoRoot, paths.snapshotPath);
  const seeding = snapshotSeedPath !== null && !existsSync(snapshotFile);
  const snapshotBytes = readFileSync(seeding ? resolve(repoRoot, snapshotSeedPath) : snapshotFile);
  const snapshotSha256 = sha256(snapshotBytes);
  // A seeded snapshot says so in the registry and in the manifest, so the
  // reports and the apply CLI can require a read-only re-capture before apply.
  const snapshotNotes =
    snapshotSeedPath === null
      ? null
      : {
          seededFrom: snapshotSeedPath,
          seedCopy: snapshotSha256 === sha256(readFileSync(resolve(repoRoot, snapshotSeedPath))),
          ...(snapshotManifestNotes ?? {}),
        };

  const registry = buildRegistry({
    workbook: parseWorkbook(workbookBytes),
    workbookSha256,
    snapshot: JSON.parse(snapshotBytes.toString('utf8')),
    snapshotSha256,
    snapshotPath: paths.snapshotPath,
    snapshotNotes,
    profile,
  });
  const plan = buildApplyPlan(registry);

  const outputs = new Map([
    [paths.registryPath, json(registry)],
    [paths.reports.coverage, renderCoverageReport(registry, plan)],
    [paths.reports.openGaps, renderOpenGapsReport(registry)],
    [paths.reports.dbPackage, renderDbPackageReport(registry, plan)],
  ]);
  if (snapshotSeedPath !== null) outputs.set(paths.snapshotPath, snapshotBytes.toString('utf8'));
  const manifest = {
    schema: 'gellatti.country-products.gelato-base.manifest/v1',
    registryId: registry.registryId,
    source: {
      basename: pinnedWorkbook.basename,
      sha256: workbookSha256,
      sheetsUsed: registry.source.sheetsUsed,
      sheetsInWorkbook: registry.source.sheetsInWorkbook,
    },
    catalogSnapshot: {
      path: paths.snapshotPath,
      sha256: registry.catalogSnapshot.sha256,
      capturedAt: registry.catalogSnapshot.capturedAt,
      projectRef: registry.catalogSnapshot.projectRef,
      readOnly: true,
      ...(snapshotNotes ?? {}),
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
    generator: paths.importScript,
    regenerate: `node ${paths.importScript} <path>/${pinnedWorkbook.basename}`,
    verify: `node ${paths.importScript} <path>/${pinnedWorkbook.basename} --check`,
  };
  outputs.set(paths.manifestPath, json(manifest));

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
    process.stdout.write(`OK: ${outputs.size} outputs match the workbook ${pinnedWorkbook.basename} (${workbookSha256}).\n`);
    return;
  }
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
