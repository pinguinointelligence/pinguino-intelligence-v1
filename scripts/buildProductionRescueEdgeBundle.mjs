import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generatedDir = join(root, 'supabase/functions/_shared/generated');
const bundlePath = join(generatedDir, 'productionRescueEngine.bundle.mjs');
const manifestPath = join(generatedDir, 'productionRescueEngine.manifest.json');
const metadataPath = join(generatedDir, 'productionRescueEngine.metadata.mjs');
const checkOnly = process.argv.includes('--check');
const virtualEntry = '\0production-rescue-edge-entry';

// Security-reviewed positive closure. A newly reachable module must be added
// deliberately here; regenerating the artifact cannot silently bless it.
const EXPECTED_SOURCE_CLOSURE = [
  'src/data/ingredients/canonicalIngredientIdentity.ts',
  'src/data/ingredients/veganEligibility.ts',
  'src/data/ingredients/verifiedVeganToolbox.ts',
  'src/engine/calculateRecipe.ts',
  'src/engine/composition.ts',
  'src/engine/config/coefficients.ts',
  'src/engine/config/iceAnchors.ts',
  'src/engine/config/modes.ts',
  'src/engine/config/priorities.ts',
  'src/engine/config/scoring.ts',
  'src/engine/config/targets.ts',
  'src/engine/config/version.ts',
  'src/engine/corrections/apply.ts',
  'src/engine/corrections/candidates.ts',
  'src/engine/corrections/redact.ts',
  'src/engine/corrections/solver.ts',
  'src/engine/corrections/verify.ts',
  'src/engine/cost.ts',
  'src/engine/iceFraction.ts',
  'src/engine/nutrition.ts',
  'src/engine/pac.ts',
  'src/engine/pod.ts',
  'src/engine/scoring.ts',
  'src/engine/statuses.ts',
  'src/features/formulation-strategy/strategy.ts',
  'src/features/formulation/ingredientRoles.ts',
  'src/features/formulation/mainIngredientContract.ts',
  'src/features/formulation/stabilizerDosage.ts',
  'src/features/formulation/veganProfileConstraints.ts',
  'src/features/formulation/violationBands.ts',
  'src/features/practical-recipe/practicalRecipe.ts',
  'src/features/pro-core/recipeScaling.ts',
  'src/features/product-intelligence/mainEnvelope.ts',
  'src/features/product-intelligence/productBehaviorAccess.ts',
  'src/features/product-intelligence/productBehaviorResolver.ts',
  'src/features/product-intelligence/productDosageAuthority.ts',
  'src/features/product-intelligence/recipeBehaviorAuthority.ts',
  'src/features/production-workspace/productionRescue.ts',
  'src/features/production-workspace/productionSession.ts',
  'src/features/protein-gelato/proteinTarget.ts',
  'src/features/recipe-composition/finalProduct.ts',
  'src/features/recipe-composition/labelTopping.ts',
  'src/features/recipe-composition/recipeCompositionPersistence.ts',
  'src/features/recipe-constraints/constraintSet.ts',
  'src/features/recipe-constraints/gelatoStabilizerSystemAuthority.ts',
  'src/features/recipe-constraints/recipeConstraintAuthority.ts',
  'src/features/recipe-constraints/sorbetStabilizerSystemAuthority.ts',
  'src/features/recipe-direction/recipeDirectionAssessment.ts',
  'src/features/recipe-direction/recipeDirectionTargets.ts',
  'src/features/recipe-score/recipeMatchScore.ts',
  'src/features/recipe-score/technicalFit.ts',
  'src/spine/temperatureRegulator.ts',
].sort();

const sources = {
  rescue: join(root, 'src/features/production-workspace/productionRescue.ts'),
  session: join(root, 'src/features/production-workspace/productionSession.ts'),
  scaling: join(root, 'src/features/pro-core/recipeScaling.ts'),
  engineVersion: join(root, 'src/engine/config/version.ts'),
  practical: join(root, 'src/features/practical-recipe/practicalRecipe.ts'),
};

const virtualSource = [
  `export { assessProductionRescue, productionRescueCandidateFingerprint, PRODUCTION_RESCUE_MODEL_VERSION } from ${JSON.stringify(sources.rescue)};`,
  `export { hydrateProductionSessionFromRun } from ${JSON.stringify(sources.session)};`,
  `export { scaleRecipeVersion, scaledRecipeInput } from ${JSON.stringify(sources.scaling)};`,
  `export { ENGINE_VERSION, CONFIG_VERSION } from ${JSON.stringify(sources.engineVersion)};`,
  `export { PRACTICAL_RECIPE_MODEL_VERSION } from ${JSON.stringify(sources.practical)};`,
].join('\n');

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const normalizedPath = (absolute) => relative(root, absolute).split('\\').join('/');

async function buildOnce() {
  const build = await rolldown({
    input: virtualEntry,
    tsconfig: join(root, 'tsconfig.app.json'),
    platform: 'browser',
    treeshake: { moduleSideEffects: false },
    plugins: [
      {
        name: 'production-rescue-edge-entry',
        resolveId(id) {
          if (id === virtualEntry) return id;
          return null;
        },
        load(id) {
          return id === virtualEntry ? virtualSource : null;
        },
      },
    ],
  });
  try {
    const generated = await build.generate({ format: 'esm', sourcemap: false, minify: false });
    const chunks = generated.output.filter((item) => item.type === 'chunk');
    if (chunks.length !== 1)
      throw new Error(`expected one Rescue chunk, received ${chunks.length}`);
    const chunk = chunks[0];
    if (chunk.imports.length > 0 || chunk.dynamicImports.length > 0) {
      throw new Error('Production Rescue bundle contains an external or dynamic import.');
    }
    return { code: chunk.code, moduleIds: Object.keys(chunk.modules).sort() };
  } finally {
    await build.close();
  }
}

function assertClosure(moduleIds, code) {
  const fileModules = moduleIds.filter((id) => id !== virtualEntry);
  const forbidden = fileModules.filter((id) => {
    const rel = normalizedPath(id);
    return (
      rel.startsWith('node_modules/') ||
      rel.startsWith('src/stores/') ||
      rel.startsWith('src/services/') ||
      rel.endsWith('.tsx') ||
      /(^|\/)use[A-Z][^/]*\.ts$/.test(rel)
    );
  });
  if (forbidden.length > 0) {
    throw new Error(
      `Forbidden browser/client module entered Rescue bundle:\n${forbidden.join('\n')}`,
    );
  }
  if (!fileModules.includes(sources.rescue)) {
    throw new Error('Canonical productionRescue.ts is absent from the Rescue bundle.');
  }
  const actualClosure = fileModules.map(normalizedPath).sort();
  if (actualClosure.join('\n') !== EXPECTED_SOURCE_CLOSURE.join('\n')) {
    const expected = new Set(EXPECTED_SOURCE_CLOSURE);
    const actual = new Set(actualClosure);
    const added = actualClosure.filter((item) => !expected.has(item));
    const missing = EXPECTED_SOURCE_CLOSURE.filter((item) => !actual.has(item));
    throw new Error(
      `Production Rescue source closure changed without review.\nAdded: ${added.join(', ') || 'none'}\nMissing: ${missing.join(', ') || 'none'}`,
    );
  }
  if (/\b(?:import|export)\s+(?:[^;]*?\s+from\s+)?['"]/m.test(code)) {
    throw new Error('Generated Rescue bundle still contains an ESM dependency edge.');
  }
  return fileModules;
}

const first = await buildOnce();
const second = await buildOnce();
if (first.code !== second.code || first.moduleIds.join('\n') !== second.moduleIds.join('\n')) {
  throw new Error('Production Rescue bundle is not deterministic across two consecutive builds.');
}

const fileModules = assertClosure(first.moduleIds, first.code);
const runtime = await import(
  `data:text/javascript;base64,${Buffer.from(first.code).toString('base64')}`
);
const manifest = {
  schemaVersion: 1,
  generator: 'scripts/buildProductionRescueEdgeBundle.mjs',
  bundler: { name: 'rolldown', version: '1.0.3' },
  canonicalEntry: normalizedPath(sources.rescue),
  exportedRuntime: [
    'assessProductionRescue',
    'productionRescueCandidateFingerprint',
    'hydrateProductionSessionFromRun',
    'scaleRecipeVersion',
    'scaledRecipeInput',
  ],
  versions: {
    engine: runtime.ENGINE_VERSION,
    config: runtime.CONFIG_VERSION,
    practicalRecipe: runtime.PRACTICAL_RECIPE_MODEL_VERSION,
    productionRescue: runtime.PRODUCTION_RESCUE_MODEL_VERSION,
    productionSessionSchema: 2,
  },
  bundle: {
    bytes: Buffer.byteLength(first.code),
    sha256: sha256(first.code),
    externalImports: 0,
    dynamicImports: 0,
  },
  sourceClosure: fileModules.map((absolute) => ({
    path: normalizedPath(absolute),
    sha256: sha256(readFileSync(absolute)),
  })),
};
manifest.sourceClosureSha256 = sha256(
  manifest.sourceClosure.map((item) => `${item.path}:${item.sha256}`).join('\n'),
);
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
const metadataText = [
  '// Generated by scripts/buildProductionRescueEdgeBundle.mjs. Do not edit.',
  `export const PRODUCTION_RESCUE_BUNDLE_SHA256 = ${JSON.stringify(manifest.bundle.sha256)};`,
  `export const PRODUCTION_RESCUE_SOURCE_CLOSURE_SHA256 = ${JSON.stringify(manifest.sourceClosureSha256)};`,
  `export const PRODUCTION_RESCUE_BUNDLER_VERSION = ${JSON.stringify(manifest.bundler.version)};`,
  '',
].join('\n');

if (checkOnly) {
  if (!existsSync(bundlePath) || readFileSync(bundlePath, 'utf8') !== first.code) {
    throw new Error(
      'Committed Production Rescue Edge bundle is stale; run npm run production-rescue:bundle.',
    );
  }
  if (!existsSync(manifestPath) || readFileSync(manifestPath, 'utf8') !== manifestText) {
    throw new Error(
      'Committed Production Rescue Edge manifest is stale; run npm run production-rescue:bundle.',
    );
  }
  if (!existsSync(metadataPath) || readFileSync(metadataPath, 'utf8') !== metadataText) {
    throw new Error(
      'Committed Production Rescue Edge metadata is stale; run npm run production-rescue:bundle.',
    );
  }
  process.stdout.write(`Production Rescue Edge bundle verified ${manifest.bundle.sha256}\n`);
} else {
  writeFileSync(bundlePath, first.code);
  writeFileSync(manifestPath, manifestText);
  writeFileSync(metadataPath, metadataText);
  process.stdout.write(
    `Production Rescue Edge bundle generated ${manifest.bundle.sha256} (${manifest.bundle.bytes} bytes, ${fileModules.length} source files)\n`,
  );
}
