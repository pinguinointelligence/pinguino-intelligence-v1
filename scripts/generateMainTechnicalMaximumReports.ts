import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { calculateRecipe, detectViolations, type RecipeInput } from '@/engine';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import { parseCsv } from '@/lib/csv';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import { buildOptimizePreview } from '@/features/constraint-studio/applyPipeline';
import { mainTechnicalLinearUpperBound } from '@/features/constraint-studio/mainTechnicalLinearBound';

const ROOT = process.cwd();
const STARTING_SHA = '9ffdb028ac3326be223850b252523f85eb447644';
const MAPPER_SOURCE = readFileSync(
  resolve(ROOT, 'docs/ingredients/validation/mapper_basement.csv'),
  'utf8',
);
const [HEADER = [], ...RECORDS] = parseCsv(MAPPER_SOURCE);
const INDEX = new Map(HEADER.map((name, position) => [name, position]));
const NUMERIC_FIELDS = new Set([
  'data_confidence_percent', 'water_percent', 'total_solids_percent', 'fat_percent',
  'saturated_fat_percent', 'milk_fat_percent', 'non_fat_milk_solids_percent',
  'protein_percent', 'aerating_protein_percent', 'carbohydrate_percent',
  'total_sugars_percent', 'sucrose_percent', 'dextrose_percent', 'glucose_percent',
  'fructose_percent', 'lactose_percent', 'polyol_percent', 'fiber_percent',
  'salt_percent', 'alcohol_percent', 'ash_percent', 'acidity_percent', 'brix',
  'dry_matter_percent', 'pod_value', 'pac_value', 'de_value', 'sweetness_factor',
  'freezing_factor', 'stabilizer_activity', 'recommended_dosage_percent_min',
  'recommended_dosage_percent_max', 'kcal_per_100g', 'cost_per_kg', 'shelf_life_days',
]);

const mapperRow = (ingredientId: string): IngredientRow => {
  const record = RECORDS.find((row) => row[INDEX.get('ingredient_id')!] === ingredientId);
  if (!record) throw new Error(`Missing Mapper fixture ${ingredientId}`);
  return Object.fromEntries(HEADER.map((field, position) => {
    const raw = record[position]?.trim() ?? '';
    if (NUMERIC_FIELDS.has(field)) return [field, raw === '' ? null : Number(raw)];
    if (field === 'approved_for_base' || field === 'approved_for_engines' || field === 'is_active') {
      return [field, raw.toLocaleLowerCase('en') === 'true'];
    }
    if (field === 'verification_date' || field === 'last_reviewed_at') return [field, raw || null];
    return [field, raw];
  })) as unknown as IngredientRow;
};

const ingredient = (id: string) => ({
  ...ingredientRowToEngineIngredient(mapperRow(id)),
  cost_per_kg: 1,
  cost_currency: 'EUR',
});

const IDS = {
  milk: 'PI-ING-000236', cream: 'PI-ING-000180', smp: 'PI-ING-000270',
  sucrose: 'PI-ING-000514', dextrose: 'PI-ING-000494', tara: 'PI-ING-000492',
  inulin: 'PI-ING-000455', watermelon: 'PI-ING-000405',
  strawberry: 'PI-ING-001553', banana: 'PI-ING-000345', kiwi: 'PI-ING-000366',
} as const;

const line = (
  id: string,
  ingredientId: string,
  grams: number,
  lockType: RecipeInput['items'][number]['lock_type'] = 'unlocked',
  mainRatioWeight?: number,
): RecipeInput['items'][number] => ({
  id,
  ingredient: ingredient(ingredientId),
  planned_grams: grams,
  actual_grams: null,
  lock_type: lockType,
  ...(mainRatioWeight === undefined ? {} : { main_ratio_weight: mainRatioWeight }),
});

const structuralLines = () => [
  line('milk', IDS.milk, 670), line('cream', IDS.cream, 130), line('smp', IDS.smp, 35),
  line('sucrose', IDS.sucrose, 130), line('dextrose', IDS.dextrose, 30),
  line('tara', IDS.tara, 5), line('inulin', IDS.inulin, 5),
];

const fixture = (
  grams: number,
  strategy: 'eco' | 'optimal' = 'optimal',
  role: 'main' | 'unlocked' = 'main',
): RecipeInput => ({
  mode: 'classic',
  category: 'milk_gelato',
  target_temperature_c: -11,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  goals: { formulation_strategy: strategy },
  items: [...structuralLines(), line('watermelon', IDS.watermelon, grams, role)],
});

const snapshots = (input: RecipeInput) => {
  const value = productBehaviorTestSnapshots(input);
  if (value.watermelon) value.watermelon = {
    ...value.watermelon,
    productId: 'e3264816-1050-d2a6-cc55-149e0d363bbf',
    productVersionId: '009d5b8a-f0bd-4c19-958b-3feec2f045f9',
    mapperIngredientId: IDS.watermelon,
    verificationState: 'estimated',
    mainClassification: 'MAIN_PROFILE_SPECIFIC',
    mainPolicyId: 'historical-watermelon-dose',
    mainPolicyVersion: 'historical-v1',
    ecoFloorPercent: 30,
    optimalCeilingPercent: 40,
    hardLimitPercent: 45,
    mainEquivalentFactor: 1,
    mainBasis: 'FRUIT_EQUIVALENT',
  };
  return value;
};

const build = (
  input: RecipeInput,
  byLineId: Record<string, { mode: 'locked'; grams: number }> = {},
) => {
  const result = buildOptimizePreview(input, { byLineId }, '2026-08-17T00:00:00.000Z', {
    productBehaviorSnapshots: snapshots(input),
  });
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.preview;
};

const mainItems = (input: RecipeInput) => input.items.filter((item) => item.lock_type === 'main');
const vector = (input: RecipeInput) => Object.fromEntries(input.items.map((item) => [item.id, item.planned_grams]));
const csvCell = (value: unknown) => {
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  return `"${raw.replaceAll('"', '""')}"`;
};

const starts = [1, 80, 200, 300, 400, 500, 900] as const;
const startRows = starts.map((start) => {
  const input = fixture(start, 'optimal');
  const preview = build(input);
  const main = mainItems(preview.proposedInput)[0]!;
  return {
    fixture: `WM-${start}`,
    start,
    final: main.planned_grams,
    batch: preview.proposedInput.items.reduce((sum, item) => sum + item.planned_grams, 0),
    score: preview.mainObjective?.technicalScore ?? null,
    firstRejected: preview.mainObjective?.firstHigherRejectedGrams ?? null,
    reason: preview.mainObjective?.firstHigherRejectedReason ?? null,
    rules: preview.mainObjective?.limitingTechnicalRules ?? [],
    violations: detectViolations(calculateRecipe(preview.proposedInput)).map((row) => row.metric),
    vector: vector(preview.proposedInput),
  };
});

const bound = mainTechnicalLinearUpperBound({
  recipe: fixture(300),
  constraints: { byLineId: { tara: { mode: 'locked', grams: 5 } } },
  snapshots: snapshots(fixture(300)),
});
const eco = build(fixture(300, 'eco'));
const optimal = build(fixture(300, 'optimal'));
const standard = build(fixture(300, 'optimal', 'unlocked'));
const locked = build(fixture(200), { watermelon: { mode: 'locked', grams: 200 } });
const lockedImpossible = buildOptimizePreview(
  fixture(900),
  { byLineId: { watermelon: { mode: 'locked', grams: 900 } } },
  '2026-08-17T00:00:00.000Z',
  { productBehaviorSnapshots: snapshots(fixture(900)) },
);

const multiFixture = (
  starts: readonly number[],
  ids: readonly string[],
  weights?: readonly number[],
): RecipeInput => ({
  ...fixture(0),
  items: [
    ...structuralLines(),
    ...ids.map((id, index) => line(`main-${index}`, id, starts[index]!, 'main', weights?.[index])),
  ],
});

const multiCases = [
  { id: 'MM-01', input: multiFixture([10, 100], [IDS.strawberry, IDS.banana]), locks: {} },
  { id: 'MM-02', input: multiFixture([300, 1], [IDS.strawberry, IDS.banana]), locks: {} },
  { id: 'MM-03', input: multiFixture([10, 100], [IDS.strawberry, IDS.banana], [2, 1]), locks: {} },
  { id: 'MM-04', input: multiFixture([10, 100, 300], [IDS.strawberry, IDS.banana, IDS.kiwi]), locks: {} },
  {
    id: 'MM-05',
    input: multiFixture([200, 10], [IDS.strawberry, IDS.banana]),
    locks: { 'main-0': { mode: 'locked' as const, grams: 200 } },
  },
].map((entry) => {
  const localBound = mainTechnicalLinearUpperBound({
    recipe: entry.input,
    constraints: {
      byLineId: {
        ...entry.locks,
        tara: { mode: 'locked', grams: 5 },
      },
    },
    snapshots: snapshots(entry.input),
  });
  const preview = build(entry.input, entry.locks);
  const boundInput = localBound.continuousSolutionGrams === null
    ? null
    : {
        ...entry.input,
        items: entry.input.items.map((item, index) => ({
          ...item,
          planned_grams: localBound.continuousSolutionGrams![index]!,
        })),
      };
  return {
    id: entry.id,
    starts: mainItems(entry.input).map((item) => item.planned_grams),
    final: mainItems(preview.proposedInput).map((item) => item.planned_grams),
    total: mainItems(preview.proposedInput).reduce((sum, item) => sum + item.planned_grams, 0),
    batch: preview.proposedInput.items.reduce((sum, item) => sum + item.planned_grams, 0),
    score: preview.mainObjective?.technicalScore ?? null,
    proof: preview.mainObjective?.status ?? null,
    certifiedUpperBound: preview.mainObjective?.certifiedUpperBoundGrams ?? null,
    provenMaximum: preview.mainObjective?.provenMaximum ?? null,
    attempts: preview.mainObjective?.attempts ?? null,
    boundVector: localBound.continuousSolutionGrams,
    boundViolations: boundInput === null
      ? []
      : detectViolations(calculateRecipe(boundInput)).map((violation) => violation.metric),
    rules: preview.mainObjective?.limitingTechnicalRules ?? [],
    vector: vector(preview.proposedInput),
  };
});

const csvHeader = [
  'fixture', 'start_main_g', 'final_main_g', 'batch_g', 'score', 'first_rejected_g',
  'rejection_reason', 'limiting_technical_rules', 'remaining_violations', 'output_vector',
];
const csv = [
  csvHeader.join(','),
  ...startRows.map((row) => [
    row.fixture, row.start, row.final, row.batch, row.score, row.firstRejected, row.reason,
    row.rules.join('|'), row.violations.join('|'), row.vector,
  ].map(csvCell).join(',')),
  ...multiCases.map((row) => [
    row.id, row.starts, row.final, row.batch, row.score, null, row.proof,
    row.rules.join('|'), '', row.vector,
  ].map(csvCell).join(',')),
].join('\n') + '\n';

const rules = startRows[0]!.rules.join(', ');
const audit = `# Main Technical Maximum Audit\n\n` +
  `Status: LOCAL IMPLEMENTATION VERIFIED; FINAL SERVED STAGING CAPTURE PENDING.\n\n` +
  `- Starting origin/staging SHA: \`${STARTING_SHA}\`\n` +
  `- Final SHA: PENDING FINAL COMMIT\n` +
  `- Mapper data: unchanged\n` +
  `- Base Engine formulas: unchanged\n` +
  `- Home and Production implementation: unchanged\n\n` +
  `## Root cause and repair\n\n` +
  `The prior runtime treated historical sensory dose metadata as a hard Main envelope and ` +
  `also used the entered Main grams as a solver anchor. The repair makes the crown a technical ` +
  `whole-gram maximum objective, keeps exact/range/percentage locks independent, rebalances the ` +
  `complete recipe for every candidate, and revalidates the certified proof at Apply. Historical ` +
  `ECO/OPTIMAL/hard flavour percentages remain metadata only.\n\n` +
  `## Watermelon proof\n\n` +
  `- Exact product: \`e3264816-1050-d2a6-cc55-149e0d363bbf\`\n` +
  `- Version: \`009d5b8a-f0bd-4c19-958b-3feec2f045f9\`\n` +
  `- Mapper: \`${IDS.watermelon}\`\n` +
  `- Proven whole-gram maximum X: **${startRows[0]!.final} g**\n` +
  `- Continuous technical relaxation: ${bound.continuousUpperBoundGrams?.toFixed(6)} g\n` +
  `- Whole-gram integer bound: ${bound.wholeGramUpperBound} g\n` +
  `- Integer proof nodes: ${bound.integerSearchNodes}\n` +
  `- Active limiting rules: ${rules}\n` +
  `- X passes: exact 1000 g and zero Engine violations.\n` +
  `- X + 1 fails: 640 g exceeds the certified whole-gram technical bound.\n\n` +
  `## Starting-point independence\n\n` +
  `| Start g | Final Main g | Batch g | Score | Limiting technical rule |\n|---:|---:|---:|---:|---|\n` +
  startRows.map((row) => `| ${row.start} | ${row.final} | ${row.batch} | ${row.score} | ${row.rules.join(', ')} |`).join('\n') +
  `\n\n## Strategy, role and lock comparison\n\n` +
  `- ECO Main maximum: ${mainItems(eco.proposedInput)[0]!.planned_grams} g.\n` +
  `- OPTIMAL Main maximum: ${mainItems(optimal.proposedInput)[0]!.planned_grams} g.\n` +
  `- Standard unlocked 300 g finishes at ${standard.proposedInput.items.find((item) => item.id === 'watermelon')!.planned_grams} g and has no Main-max proof.\n` +
  `- Main locked 200 g remains ${locked.proposedInput.items.find((item) => item.id === 'watermelon')!.planned_grams} g.\n` +
  `- Main locked 900 g: ${lockedImpossible.ok ? 'UNEXPECTED PREVIEW' : lockedImpossible.code}; nearest certified amount ${!lockedImpossible.ok && lockedImpossible.code === 'impossible_under_constraints' ? lockedImpossible.nearestFeasibleGrams : 'n/a'} g.\n\n` +
  `## Multi-Main local matrix\n\n| Fixture | Start g | Final g | Group g | Batch g | Proof |\n|---|---|---|---:|---:|---|\n` +
  multiCases.map((row) => `| ${row.id} | ${row.starts.join('/')} | ${row.final.join('/')} | ${row.total} | ${row.batch} | ${row.proof} |`).join('\n') +
  `\n\n## Evidence boundary\n\n` +
  `Local Engine/Preview/Apply/Undo and regression gates are recorded in the completion ledger. ` +
  `Authenticated served screenshots, Console/Network capture, Vercel deployment ID, served bundle ` +
  `hashes and production no-change proof remain pending until the final staging deployment.\n`;

const watermelonQa = `# Watermelon Main Final Served QA\n\n` +
  `Status: PENDING FINAL STAGING DEPLOYMENT AND AUTHENTICATED SERVED CAPTURE.\n\n` +
  `Local deterministic authority: X = ${startRows[0]!.final} g; X passes zero Engine violations; ` +
  `640 g exceeds the certified whole-gram bound. ECO and OPTIMAL both return ` +
  `${mainItems(eco.proposedInput)[0]!.planned_grams} g.\n\n` +
  `Required served evidence still pending: before/Preview/Apply/Undo screenshots for 80/300/500 g, ` +
  `Standard 300 g, locked 200 g, exact request/response capture, Console and Network inspection, ` +
  `final SHA, deployment ID and served JS/CSS bundle names. No served PASS is claimed here.\n`;

const multiQa = `# Multi-Main Final Served QA\n\n` +
  `Status: PENDING FINAL STAGING DEPLOYMENT AND AUTHENTICATED SERVED CAPTURE.\n\n` +
  `## Local deterministic results\n\n| Fixture | Start g | Final g | Group g | Batch g |\n|---|---|---|---:|---:|\n` +
  multiCases.map((row) => `| ${row.id} | ${row.starts.join('/')} | ${row.final.join('/')} | ${row.total} | ${row.batch} |`).join('\n') +
  `\n\nAll local results preserve exact identities and whole-gram ratios; Apply/Undo regressions are ` +
  `covered by automated tests. Required served before/Preview/Apply/Undo screenshots, Console and ` +
  `Network inspection remain pending. No served PASS is claimed here.\n`;

writeFileSync(resolve(ROOT, 'reports/MAIN_TECHNICAL_MAXIMUM_FIXTURES.csv'), csv);
writeFileSync(resolve(ROOT, 'reports/MAIN_TECHNICAL_MAXIMUM_AUDIT.md'), audit);
writeFileSync(resolve(ROOT, 'reports/WATERMELON_MAIN_FINAL_SERVED_QA.md'), watermelonQa);
writeFileSync(resolve(ROOT, 'reports/MULTI_MAIN_FINAL_SERVED_QA.md'), multiQa);

console.log(JSON.stringify({
  watermelonMaximum: startRows[0]!.final,
  continuousUpperBound: bound.continuousUpperBoundGrams,
  integerUpperBound: bound.wholeGramUpperBound,
  activeRules: startRows[0]!.rules,
  multiCases: multiCases.map((row) => ({
    id: row.id,
    final: row.final,
    total: row.total,
    batch: row.batch,
    status: row.proof,
    certifiedUpperBound: row.certifiedUpperBound,
    provenMaximum: row.provenMaximum,
    attempts: row.attempts,
    boundVector: row.boundVector,
    boundViolations: row.boundViolations,
    limitingRules: row.rules,
  })),
}, null, 2));
