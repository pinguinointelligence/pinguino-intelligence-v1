import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';

const root = process.cwd();
const vite = await createServer({
  root,
  appType: 'custom',
  logLevel: 'silent',
  server: { middlewareMode: true },
});

try {
  const starterModule = await vite.ssrLoadModule('/src/features/recipes/newRecipeStarter.ts');
  const profiles = ['gelato', 'sorbet', 'vegan', 'protein'];
  const modes = starterModule.NEW_RECIPE_SERVING_MODES;
  const strategies = ['eco', 'optimal'];
  const profileLabels = {
    gelato: 'Gelato',
    sorbet: 'Sorbet',
    vegan: 'Vegan Gelato',
    protein: 'Protein Gelato',
  };
  const modeLabels = {
    temp_minus_11: '−11°C',
    temp_minus_12: '−12°C',
    temp_minus_13: '−13°C',
    fresh: 'Świeże',
  };
  const strategyLabels = { eco: 'ECO', optimal: 'OPTIMAL' };
  const starters = profiles.flatMap((visibleProductType) =>
    modes.flatMap((servingModeId) =>
      strategies.map((formulationStrategy) =>
        starterModule.buildCanonicalNewRecipeStarter({
          visibleProductType,
          servingModeId,
          formulationStrategy,
          targetBatchGrams: 1_000,
        }),
      ),
    ),
  );

  const n = (value, digits = 3) =>
    value === null || value === undefined
      ? 'UNKNOWN'
      : Number(value.toFixed(digits)).toString();
  const money = (value) => n(value, 4);
  const csv = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const vector = (starter) =>
    starter.lines
      .map((line, index) => `${starter.items[index].ingredient.name} ${line.grams} g`)
      .join('; ');
  const keyLabel = (starter) =>
    `${profileLabels[starter.visibleProductType]} ${modeLabels[starter.servingModeId]} ${strategyLabels[starter.formulationStrategy]}`;
  const violationSummary = (starter) =>
    starter.metrics.nativeViolations.length === 0
      ? 'none'
      : starter.metrics.nativeViolations
        .map((violation) => `${violation.metric}:${violation.direction}:${n(violation.value)} [${n(violation.min)},${n(violation.max)}]`)
        .join('; ');

  const compactHeader = [
    'Key',
    'Template',
    'Vector per 1000 g',
    'POD',
    'PAC',
    'NPAC',
    'Ice %',
    'Water %',
    'Solids %',
    'Fat %',
    'Protein %',
    'Liquid dairy g',
    'Cost/kg',
    'Validation',
    'Native Engine misses',
  ];
  const compactRows = starters.map((starter) => [
    keyLabel(starter),
    starter.templateId,
    vector(starter),
    n(starter.metrics.pod),
    n(starter.metrics.pac),
    n(starter.metrics.npac),
    n(starter.metrics.iceFractionPercent),
    n(starter.metrics.waterPercent),
    n(starter.metrics.totalSolidsPercent),
    n(starter.metrics.fatPercent),
    n(starter.metrics.proteinPercent),
    n(starter.metrics.liquidDairyCarrierGrams),
    money(starter.metrics.costPerKg),
    starter.validationStatus,
    violationSummary(starter),
  ]);
  const markdownTable = (header, rows) => [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map((cell) => String(cell).replaceAll('|', '\\|')).join(' | ')} |`),
  ].join('\n');

  const detailSections = starters.map((starter) => {
    const rows = starter.lines.map((line, index) => [
      starter.items[index].ingredient.name,
      line.canonicalId,
      line.grams,
      n(line.percent),
      line.role,
      money(line.effectivePricePerKg),
      line.priceSource,
      money(line.lineCost),
      line.wholeGram ? 'exact' : 'not_whole',
    ]);
    return [
      `### ${keyLabel(starter)}`,
      '',
      `Template: \`${starter.templateId}\`; version: \`${starter.templateVersion}\`; target Engine temperature: ${starter.targetTemperatureC}°C; policy source: ${starter.templateApprovalSource}; strategy: \`${starter.strategyResolution}\`; validation: \`${starter.validationStatus}\`.`,
      '',
      markdownTable(
        ['Ingredient', 'Canonical ID', 'g/1000 g', '%', 'Role', 'Effective price/kg', 'Price source', 'Line cost', 'Whole gram'],
        rows,
      ),
      '',
      `Metrics: POD ${n(starter.metrics.pod)}; PAC ${n(starter.metrics.pac)}; NPAC ${n(starter.metrics.npac)}; ice ${n(starter.metrics.iceFractionPercent)}%; water ${n(starter.metrics.waterPercent)}%; total solids ${n(starter.metrics.totalSolidsPercent)}%; fat ${n(starter.metrics.fatPercent)}%; protein ${n(starter.metrics.proteinPercent)}%; liquid dairy carrier ${n(starter.metrics.liquidDairyCarrierGrams)} g; actual Protein ${starter.visibleProductType === 'protein' ? `${n(starter.metrics.actualProteinPercent)}%` : 'n/a'}; technical score ${n(starter.metrics.technicalScore)}; native validation ${starter.metrics.validatedNative ? 'validated' : 'not validated'}; native Engine misses ${violationSummary(starter)}; cost/kg ${money(starter.metrics.costPerKg)}; cost coverage ${starter.metrics.costComplete ? 'complete' : 'incomplete/unknown'}.`,
    ].join('\n');
  });

  const matrixMarkdown = [
    '# MODE + TEMPERATURE STARTER MATRIX',
    '',
    'Generated deterministically from `buildCanonicalNewRecipeStarter` at 1000 g. Prices are effective EUR/kg values under the current local reference data; `UNKNOWN` remains unknown and is never treated as zero. ECO and OPTIMAL intentionally share the approved vector because no validated cheaper alternative is currently registered.',
    '',
    '## Complete 32-key summary',
    '',
    markdownTable(compactHeader, compactRows),
    '',
    '## Per-line evidence',
    '',
    detailSections.join('\n\n'),
    '',
    '## Scaling evidence',
    '',
    'Automated tests materialize 1000 g, 5000 g and 1275 g representatives for every profile. Complete profiles reconcile to the exact requested Base mass with whole grams. Sorbet remains an intentionally incomplete technological scaffold: 400 g per 1000 g target, with the remaining 600 g reserved for a user-selected fruit/Main; it is reported as `blocked_missing_user_main` rather than inventing a fruit.',
    '',
  ].join('\n');

  const csvHeader = [
    'product_profile', 'serving_mode', 'strategy', 'ingredient', 'canonical_id',
    'grams_per_1000g', 'percentage', 'technical_role', 'effective_price_per_kg',
    'price_source', 'line_cost', 'template_source', 'template_version', 'whole_gram_status',
    'validation_status', 'target_temperature_c', 'pod', 'pac', 'npac', 'ice_fraction_percent',
    'water_percent', 'total_solids_percent', 'fat_percent', 'protein_percent',
    'liquid_dairy_carrier_grams', 'actual_protein_percent', 'technical_score', 'cost_per_kg',
    'cost_complete', 'policy_template_provenance', 'strategy_resolution',
    'validated_native', 'provisional_bands', 'native_engine_misses',
  ];
  const csvRows = starters.flatMap((starter) => starter.lines.map((line, index) => [
    profileLabels[starter.visibleProductType],
    modeLabels[starter.servingModeId],
    strategyLabels[starter.formulationStrategy],
    starter.items[index].ingredient.name,
    line.canonicalId,
    line.grams,
    n(line.percent),
    line.role,
    line.effectivePricePerKg ?? '',
    line.priceSource,
    line.lineCost ?? '',
    starter.templateId,
    starter.templateVersion,
    line.wholeGram ? 'exact' : 'not_whole',
    starter.validationStatus,
    starter.targetTemperatureC,
    starter.metrics.pod ?? '',
    starter.metrics.pac ?? '',
    starter.metrics.npac ?? '',
    starter.metrics.iceFractionPercent ?? '',
    starter.metrics.waterPercent ?? '',
    starter.metrics.totalSolidsPercent ?? '',
    starter.metrics.fatPercent ?? '',
    starter.metrics.proteinPercent ?? '',
    starter.metrics.liquidDairyCarrierGrams,
    starter.metrics.actualProteinPercent ?? '',
    starter.metrics.technicalScore ?? '',
    starter.metrics.costPerKg ?? '',
    starter.metrics.costComplete,
    starter.templateApprovalSource,
    starter.strategyResolution,
    starter.metrics.validatedNative,
    starter.metrics.provisional,
    violationSummary(starter),
  ]));
  const matrixCsv = [csvHeader, ...csvRows]
    .map((row) => row.map(csv).join(','))
    .join('\n') + '\n';

  const auditRows = profiles.flatMap((profile) => modes.map((mode) => {
    const starter = starters.find((candidate) =>
      candidate.visibleProductType === profile &&
      candidate.servingModeId === mode &&
      candidate.formulationStrategy === 'optimal'
    );
    const coverage = `${starter.lines.filter((line) => line.priceSource !== 'missing').length}/${starter.lines.length}`;
    return [
      profileLabels[profile],
      modeLabels[mode],
      starter.targetTemperatureC,
      starter.templateId,
      starter.lines.map((line) => `${line.role}:${line.canonicalId}:${line.grams}g`).join('; '),
      'ECO = OPTIMAL — no validated cheaper alternative',
      coverage,
      starter.validationStatus,
      `POD ${n(starter.metrics.pod)}; PAC ${n(starter.metrics.pac)}; NPAC ${n(starter.metrics.npac)}; ice ${n(starter.metrics.iceFractionPercent)}%; water ${n(starter.metrics.waterPercent)}%; solids ${n(starter.metrics.totalSolidsPercent)}%; fat ${n(starter.metrics.fatPercent)}%; protein ${n(starter.metrics.proteinPercent)}%; native misses ${violationSummary(starter)}`,
    ];
  }));
  const auditMarkdown = [
    '# STARTER SOURCE AUDIT',
    '',
    '## Authority inspected',
    '',
    '- Approved profile and temperature templates: `src/features/formulation/templateRegistry.ts`.',
    '- Canonical toolbox identity materialization: `src/features/formulation/formulate.ts` plus canonical Mapper identities on each Engine ingredient.',
    '- Frozen Engine calculation: `src/engine`; this task does not duplicate or change Engine formulas.',
    '- Whole-gram execution: `src/features/practical-recipe/practicalRecipe.ts`; registered stabilizer bounds come from `src/features/formulation/stabilizerDosage.ts`.',
    '- Price precedence: `src/features/pro-core/costing.ts` and `src/features/pro-core/effectiveRecipePricing.ts`.',
    '- Draft/account defaults and reset seams: `src/stores/recipeStore.ts`, `src/features/pro-workbench/recipeProfileStore.ts`, `src/pages/destinations/startNewProRecipe.ts`.',
    '- ProductBehavior hydration seam: `src/features/product-intelligence/useLegacyRecipeBehaviorRevalidation.ts`.',
    '',
    '## Baseline defects and corrections',
    '',
    '- The previous starter accepted only profile/temperature/mass, silently fell back to −12°C for unsupported temperatures, did not preserve Świeże as a distinct visible key, did not practicalize to whole grams, and did not carry strategy/cost/metrics/validation evidence. The complete key is now explicit and deterministic.',
    '- Explicit New Recipe without a profile inherited the previous recipe profile. It now uses Account defaults when present and the canonical Gelato default otherwise.',
    '- Setting changes mutated labels/state without rebuilding the starter. Untouched explicit starters now rebuild immediately; edited starters require the exact rebuild/cancel confirmation.',
    '- Asynchronous ProductBehavior hydration previously forced `dirty: false`, which could relabel an edited starter as untouched. It now preserves dirty/material ownership and advances the baseline only for an actually untouched starter.',
    '- An invalid private override previously masked a valid Mapper reference price. Effective precedence is now valid private price → valid Mapper/reference price → missing.',
    '- No validated ECO substitution/quantity policy exists in the accepted template architecture. ECO therefore truthfully equals OPTIMAL for every current key; price never mutates OPTIMAL.',
    '',
    '## Profile × serving-mode source table (1000 g)',
    '',
    markdownTable(
      ['Profile', 'Visible mode', 'Engine °C', 'Template', 'Role:canonical ID:seed grams', 'Strategy behavior', 'Price coverage', 'Validation', 'Engine metrics'],
      auditRows,
    ),
    '',
    '## Conflicts and truthful blockers',
    '',
    '- Świeże is a separate visible mode but intentionally routes to the exact −11°C vector and Engine temperature.',
    '- Sorbet templates reserve 600 g/1000 g for a user-selected fruit/Main without an approved neutral toolbox identity. The application materializes only the 400 g technological scaffold and reports `blocked_missing_user_main`; it does not invent a fruit or fake an exact 1000 g Base.',
    '- Gelato −13°C is `blocked_engine_native_band_miss`: lactose sandiness risk 9.126 exceeds the native maximum 9.',
    '- Vegan −11°C and Świeże are `blocked_engine_native_band_miss`: ice fraction 39.162% is below the native minimum 45%.',
    '- Protein −12°C is `blocked_engine_native_band_miss`: NPAC 39.037 is below 42 and POD 9.382 is below 12.',
    '- Protein −13°C is `blocked_engine_native_band_miss`: NPAC 42.770 is below 48 and POD 8.425 is below 12.',
    '- `engine_validated_native` is emitted only when `detectViolations` returns zero and no provisional/fallback band is active. Whole-gram/exact-mass execution alone is never called a technical pass.',
    '- Missing effective prices remain `UNKNOWN`; recipe cost remains incomplete whenever any positive line lacks a valid price.',
    '- ECO alternatives remain scientifically/product-policy unresolved. No fake cheaper vector was introduced.',
    '',
  ].join('\n');

  await mkdir(resolve(root, 'reports'), { recursive: true });
  await Promise.all([
    writeFile(resolve(root, 'reports', 'MODE_TEMPERATURE_STARTER_MATRIX.md'), matrixMarkdown, 'utf8'),
    writeFile(resolve(root, 'reports', 'MODE_TEMPERATURE_STARTER_MATRIX.csv'), matrixCsv, 'utf8'),
    writeFile(resolve(root, 'reports', 'STARTER_SOURCE_AUDIT.md'), auditMarkdown, 'utf8'),
  ]);
} finally {
  await vite.close();
}
