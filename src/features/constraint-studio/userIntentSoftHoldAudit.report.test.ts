/**
 * USER-INTENT DRIFT REPORT (owner GLOBAL SOFT-HOLD §32).
 *
 * Emits `reports/USER_INTENT_SOFT_HOLD_AUDIT.csv` from REAL solver runs and
 * asserts the owner invariant on every row. It is a test, not a script, on
 * purpose: the report can never go stale, because the suite regenerates it and
 * fails if any row violates the policy.
 *
 * Deterministic by construction (pure engine + pure authority, fixed fixtures),
 * so a clean run produces a byte-identical file and `git diff` stays empty
 * unless behaviour actually changed.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  calculateRecipe,
  detectViolations,
  type CorrectionConstraints,
  type RecipeInput,
} from '@/engine';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import { parseCsv } from '@/lib/csv';
import type { ConstraintSet } from '@/features/recipe-constraints';
import {
  buildUserIntentBaseline,
  classifyUserLineFlexibility,
  isMaterialUserIntentDeviation,
  measureUserIntentDrift,
  userIntentDriftTotal,
} from '@/features/formulation/userLineIntent';
import { sweepDraftCandidateVector, type DraftStateMeasure } from './draftCandidateVector';

const ROOT = process.cwd();
const MAPPER_SOURCE = readFileSync(
  resolve(ROOT, 'docs/ingredients/validation/mapper_basement.csv'),
  'utf8',
);
const [HEADER = [], ...RECORDS] = parseCsv(MAPPER_SOURCE);
const INDEX = new Map(HEADER.map((name, position) => [name, position]));
const NUMERIC = new Set(
  HEADER.filter((field) =>
    /_percent$|_value$|_factor$|brix|kcal|cost_per_kg|shelf_life_days|stabilizer_activity/.test(
      field,
    ),
  ),
);
const mapperRow = (ingredientId: string): IngredientRow => {
  const record = RECORDS.find((row) => row[INDEX.get('ingredient_id')!] === ingredientId);
  if (!record) throw new Error(`Missing Mapper fixture ${ingredientId}`);
  return Object.fromEntries(
    HEADER.map((field, position) => {
      const raw = record[position]?.trim() ?? '';
      if (NUMERIC.has(field)) return [field, raw === '' ? null : Number(raw)];
      if (
        field === 'approved_for_base' ||
        field === 'approved_for_engines' ||
        field === 'is_active'
      )
        return [field, raw.toLocaleLowerCase('en') === 'true'];
      if (field === 'verification_date' || field === 'last_reviewed_at')
        return [field, raw || null];
      return [field, raw];
    }),
  ) as unknown as IngredientRow;
};
const ingredient = (ingredientId: string) => ({
  ...ingredientRowToEngineIngredient(mapperRow(ingredientId)),
  cost_per_kg: 1,
  cost_currency: 'EUR',
});

const IDS = {
  milk: 'PI-ING-000236',
  cream: 'PI-ING-000180',
  yolk: 'PI-ING-001645',
  smp: 'PI-ING-000270',
  sucrose: 'PI-ING-000514',
  dextrose: 'PI-ING-000494',
  inulin: 'PI-ING-000456',
  tara: 'PI-ING-000492',
} as const;

const CONSTRAINTS: CorrectionConstraints = {
  context: 'planning',
  mode: 'classic',
  allow_main_ingredient_reduction: false,
  machine_capacity_grams: null,
};

interface Scenario {
  scenario: string;
  profile: string;
  input: RecipeInput;
  set: ConstraintSet;
}

const gelato = (
  scenario: string,
  yolk: number,
  smp: number,
  cream: number,
  temperature: number,
  lockYolk = false,
): Scenario => {
  const byLineId: Record<string, ConstraintSet['byLineId'][string]> = {};
  if (lockYolk) byLineId['l:yolk'] = { mode: 'locked', grams: yolk };
  const lines: [string, string, number][] = [
    ['l:milk', IDS.milk, 1000 - yolk - smp - cream - 90 - 50 - 20 - 2],
    ['l:cream', IDS.cream, cream],
    ['l:yolk', IDS.yolk, yolk],
    ['l:smp', IDS.smp, smp],
    ['l:sucrose', IDS.sucrose, 90],
    ['l:dextrose', IDS.dextrose, 50],
    ['l:inulin', IDS.inulin, 20],
    ['l:tara', IDS.tara, 2],
  ];
  return {
    scenario,
    profile: 'milk_gelato',
    set: { byLineId },
    input: {
      items: lines.map(([id, ingredientId, grams]) => {
        const locked = lockYolk && id === 'l:yolk';
        return {
          id,
          ingredient: ingredient(ingredientId),
          planned_grams: grams,
          actual_grams: null,
          lock_type: locked ? ('grams' as const) : ('unlocked' as const),
          ...(locked ? { grams_constraint: { grams: yolk } } : {}),
          ...(locked ? {} : { user_intent_anchor_grams: grams }),
        };
      }),
      mode: 'classic',
      category: 'milk_gelato',
      target_temperature_c: temperature,
      target_batch_grams: 1000,
      machine_capacity_grams: null,
      goals: { flavor_intensity: 'balanced', cost_priority: 'balanced' },
    },
  };
};

const SCENARIOS: Scenario[] = [
  gelato('lost_pl_unlocked', 40, 30, 180, -11),
  gelato('lost_pl_locked_yolk', 40, 30, 180, -11, true),
  gelato('lost_pl_minus13', 40, 30, 180, -13),
];
for (const yolk of [40, 60, 80, 100])
  for (const smp of [30, 60, 90])
    for (const cream of [180, 120])
      for (const temperature of [-11, -13])
        SCENARIOS.push(
          gelato(
            `matrix_y${yolk}_s${smp}_c${cream}_t${Math.abs(temperature)}`,
            yolk,
            smp,
            cream,
            temperature,
          ),
        );

const csvCell = (value: string | number | boolean | null): string => {
  const text = value === null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

describe('§32 user-intent soft-hold audit report', () => {
  it('emits reports/USER_INTENT_SOFT_HOLD_AUDIT.csv and holds the policy on every row', () => {
    const rows: string[] = [
      [
        'scenario',
        'profile',
        'ingredient_id',
        'ingredient_name',
        'provenance',
        'baseline_g',
        'proposed_g',
        'absolute_drift_g',
        'relative_drift',
        'flexibility_class',
        'locked',
        'main',
        'hard_valid',
        'score',
        'status',
        'material_deviation',
        'consent_required',
        'reason',
      ].join(','),
    ];

    for (const scenario of SCENARIOS) {
      const { input, set } = scenario;
      if (input.items.some((item) => item.planned_grams <= 0)) continue;
      const baseline = buildUserIntentBaseline(input, set);
      const measure = (candidate: RecipeInput): DraftStateMeasure => {
        const violations = detectViolations(calculateRecipe(candidate));
        return {
          violations: violations.length,
          severityPoints: violations.reduce((sum, v) => sum + v.severity_points, 0),
          userIntentDrift: userIntentDriftTotal(baseline, candidate),
        };
      };
      const startMeasure = measure(input);
      const result = sweepDraftCandidateVector({
        start: input,
        set,
        userIntentBaseline: baseline,
        excludedIngredientIds: new Set(),
        constraints: CONSTRAINTS,
        normalize: (candidate) => candidate,
        measure,
        startMeasure,
      });
      const proposed = result?.input ?? input;
      const finalMeasure = result?.measure ?? startMeasure;
      const report = measureUserIntentDrift(baseline, proposed);
      const hardValid = finalMeasure.violations === 0;

      for (const item of input.items) {
        const intent = baseline.get(item.id);
        const line = report.lines.find((entry) => entry.lineId === item.id);
        const proposedGrams =
          proposed.items.find((entry) => entry.id === item.id)?.planned_grams ?? 0;
        const locked = item.lock_type === 'grams' || set.byLineId[item.id] !== undefined;
        const main = item.lock_type === 'main';
        const material = line?.material ?? false;
        rows.push(
          [
            scenario.scenario,
            scenario.profile,
            item.ingredient.canonical_ingredient_id ?? item.ingredient.id,
            item.ingredient.name,
            intent ? 'user_specified' : locked ? 'hard_locked' : 'pi_or_unheld',
            intent ? intent.baselineGrams.toFixed(2) : '',
            proposedGrams.toFixed(2),
            line ? line.absoluteDriftGrams.toFixed(2) : '',
            line ? line.relativeDrift.toFixed(6) : '',
            classifyUserLineFlexibility(item, set),
            locked,
            main,
            hardValid,
            `${10 - finalMeasure.violations}`,
            result === null ? 'no_change' : 'proposed',
            material,
            material, // a material deviation is exactly what requires consent
            material
              ? 'material_user_intent_deviation_reached_legal_recipe'
              : intent
                ? 'within_user_intent_policy'
                : 'no_user_intent_baseline',
          ]
            .map(csvCell)
            .join(','),
        );

        // THE OWNER INVARIANT, asserted per row: a material deviation is only
        // ever acceptable when it bought a fully legal recipe (§12).
        if (material) {
          expect(result?.materialUserIntentDeviation, scenario.scenario).toBe(true);
          expect(finalMeasure.violations, scenario.scenario).toBe(0);
        }
        // and a soft-held line is NEVER left at the bare presence floor as an
        // ordinary optimization (§25).
        if (intent && !material) {
          expect(isMaterialUserIntentDeviation(intent.baselineGrams, proposedGrams, 1000)).toBe(
            false,
          );
        }
      }
    }

    const target = resolve(ROOT, 'reports/USER_INTENT_SOFT_HOLD_AUDIT.csv');
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${rows.join('\n')}\n`, 'utf8');
    expect(rows.length).toBeGreaterThan(100);
  }, 120_000);
});
