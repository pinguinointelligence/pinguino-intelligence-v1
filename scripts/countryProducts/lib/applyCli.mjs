// Shared command line of the GELATO base DB-package entry points
// (applyGelatoBaseV12.mjs, applyGelatoBaseV23.mjs).
//
// Default: DRY RUN — reads the registry, prints the plan, touches nothing.
// Mutation needs --project-ref=<the one shared project> --apply
// --owner-db-approval=<the token of THIS registry version>; only then is the
// executor (lib/applyExecutor.mjs) loaded. --apply is also refused while the
// manifest marks the catalog snapshot as a seeded copy that has not been
// re-captured (v23: the v12 snapshot copied on import).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { APPLY_PROJECT_REF, buildApplyPlan, evaluateApplyGuard } from './applyPlan.mjs';

function readManifest(repoRoot, manifestPath) {
  try {
    return JSON.parse(readFileSync(resolve(repoRoot, manifestPath), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * @param {object} input
 * @param {string} input.repoRoot
 * @param {string[]} input.argv command-line arguments after the script name
 * @param {{ registryPath: string, manifestPath: string, snapshotPath: string, importScript: string }} input.paths
 * @param {string} input.approvalToken owner approval token of this registry version
 */
export async function runApplyCli({ repoRoot, argv, paths, approvalToken }) {
  const guard = evaluateApplyGuard(argv, { approvalToken });
  if (guard.mode === 'REFUSED') {
    process.stderr.write(`${guard.refusal}\n`);
    process.exit(2);
  }
  if (guard.mode === 'APPLY' && guard.args.has('--registry')) {
    process.stderr.write('Refusing: --apply only runs against the committed, reviewed registry.json.\n');
    process.exit(2);
  }

  const registryPath = resolve(repoRoot, String(guard.args.get('--registry') ?? paths.registryPath));
  const registryBytes = readFileSync(registryPath);
  const registry = JSON.parse(registryBytes.toString('utf8'));
  const plan = buildApplyPlan(registry);
  const manifest = guard.args.has('--registry') ? null : readManifest(repoRoot, paths.manifestPath);
  const snapshotRefresh = manifest?.catalogSnapshot?.refreshBeforeApply ?? null;

  if (guard.mode === 'DRY_RUN') {
    if (guard.args.has('--json')) {
      process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    } else {
      const statusGated = registry.selections.filter((selection) =>
        (selection.route?.blockers ?? []).some((blocker) => blocker.startsWith('WORKBOOK_STATUS:')),
      );
      const lines = [
        'DRY RUN — nothing was written. (Shared staging + production project: mutation needs',
        `  --project-ref=${APPLY_PROJECT_REF} --apply --owner-db-approval=${plan.approvalToken})`,
        `Registry: ${registryPath}`,
        `Workbook: ${plan.workbook} (${plan.workbookSha256})`,
        `Catalog snapshot: ${plan.catalogSnapshotCapturedAt}`,
        ...(snapshotRefresh ? [`Catalog snapshot refresh: ${snapshotRefresh}`] : []),
        `New PR-ING products to create: ${plan.productsToCreate.length}`,
        `Reused PR-ING (no write): ${plan.reuse.map((entry) => entry.prIng).join(', ') || 'none'}`,
        `Deferred products (not written): ${plan.deferredProducts.length}`,
        `Routes: create ${plan.routeCounts.creatableNow}, already present ${plan.routeCounts.alreadyPresent}, blocked by market FK ${plan.routeCounts.blockedByMarketForeignKey}, blocked otherwise ${plan.routeCounts.blockedOtherwise}`,
        ...(statusGated.length > 0
          ? [`Routes held by the workbook status (never created here): ${statusGated.map((selection) => `${selection.selectionKey} ${selection.workbook.coverageMatrixStatus}`).join(', ')}`]
          : []),
        `Existing primaries in conflict (never replaced): ${plan.routeConflicts.map((entry) => `${entry.selectionKey} → ${entry.existingPrimary?.productCode}`).join(', ') || 'none'}`,
        `Markets needing a catalog_market_countries row: ${plan.marketRowsNeeded.length}`,
        'Rows per table:',
        ...Object.entries(plan.tableCounts).map(([table, rows]) => `  ${table}: ${rows}`),
      ];
      process.stdout.write(`${lines.join('\n')}\n`);
    }
    process.exit(0);
  }

  // ----------------------------------------------------------------- APPLY
  // Reached only with the exact project ref, --apply and this version's token.
  if (plan.approvalToken !== approvalToken) {
    process.stderr.write(`Refusing: ${paths.registryPath} is not the registry version this entry point applies.\n`);
    process.exit(2);
  }
  if (!manifest) {
    process.stderr.write(`Refusing: ${paths.manifestPath} is missing or unreadable.\n`);
    process.exit(2);
  }
  if (manifest.catalogSnapshot?.seedCopy === true) {
    process.stderr.write(
      `Refusing: ${paths.snapshotPath} is still the seeded copy of ${manifest.catalogSnapshot.seededFrom}. Re-capture it read-only, re-run ${paths.importScript}, review the regenerated DB package, then apply.\n`,
    );
    process.exit(2);
  }
  const { executeApplyPlan } = await import('./applyExecutor.mjs');
  await executeApplyPlan({
    repoRoot,
    registry,
    registryBytes,
    registryPath: paths.registryPath,
    manifestPath: paths.manifestPath,
    plan,
  });
}
