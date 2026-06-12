/**
 * GOLDEN QA RECIPES — engine stability / regression fixtures.
 *
 * QA fixtures pinned to CONFIG_VERSION 0.4.0 arithmetic — NOT verified
 * production recipes, NOT calibration data. Compositions are literature values
 * (confidence 85); expected behaviors record what the CURRENT uncalibrated
 * config computes (e.g. the chronic npac_low/ice_high of conventional milk
 * mixes). When external calibration changes the config, these expectations and
 * the snapshots are deliberately re-recorded under the new CONFIG_VERSION.
 *
 * Calibration truth lives ONLY in __fixtures__/externalReference/ (all pending).
 */
import type {
  CorrectionContext,
  CorrectionProposal,
} from '../corrections/types';
import type {
  IndicatorStatus,
  IngredientComponentProfile,
  LockType,
  RecipeInput,
  TargetMetric,
  WarningCode,
} from '../types';

/* ── compositions (literature values — QA only) ──────────────────────────── */

const ZERO: IngredientComponentProfile = {
  water_percent: 0,
  solids_percent: 0,
  fat_percent: 0,
  protein_percent: 0,
  carbohydrate_percent: 0,
  sugar_percent: 0,
  sucrose_percent: 0,
  glucose_percent: 0,
  dextrose_percent: 0,
  fructose_percent: 0,
  lactose_percent: 0,
  polyol_percent: 0,
  fiber_percent: 0,
  salt_percent: 0,
  alcohol_percent: 0,
  kcal_per_100g: 0,
};

export const QA_COMPOSITIONS = {
  milk: { water_percent: 87.5, solids_percent: 12.5, fat_percent: 3.5, protein_percent: 3.3, carbohydrate_percent: 4.8, sugar_percent: 4.8, lactose_percent: 4.8, salt_percent: 0.1, kcal_per_100g: 64 },
  cream35: { water_percent: 58.9, solids_percent: 41.1, fat_percent: 35, protein_percent: 2.2, carbohydrate_percent: 3.1, sugar_percent: 3.1, lactose_percent: 3.1, salt_percent: 0.1, kcal_per_100g: 337 },
  smp: { water_percent: 3.5, solids_percent: 96.5, fat_percent: 0.8, protein_percent: 35, carbohydrate_percent: 52, sugar_percent: 52, lactose_percent: 52, salt_percent: 1, kcal_per_100g: 360 },
  sucrose: { solids_percent: 100, carbohydrate_percent: 100, sugar_percent: 100, sucrose_percent: 100, kcal_per_100g: 400 },
  dextrose: { water_percent: 8, solids_percent: 92, carbohydrate_percent: 92, sugar_percent: 92, dextrose_percent: 92, kcal_per_100g: 368 },
  tara: { water_percent: 12, solids_percent: 88, carbohydrate_percent: 80, fiber_percent: 80, kcal_per_100g: 200 },
  jimBeam: { water_percent: 60, alcohol_percent: 40, kcal_per_100g: 280 },
  cocoa2224: { water_percent: 3, solids_percent: 97, fat_percent: 23, protein_percent: 20, carbohydrate_percent: 12, sugar_percent: 0.5, fiber_percent: 30, salt_percent: 0.1, kcal_per_100g: 400 },
  darkChocolate70: { water_percent: 1, solids_percent: 99, fat_percent: 42, protein_percent: 7.5, carbohydrate_percent: 38, sugar_percent: 28, sucrose_percent: 28, fiber_percent: 10, kcal_per_100g: 580 },
  raspberry: { water_percent: 86, solids_percent: 14, fat_percent: 0.3, protein_percent: 1.2, carbohydrate_percent: 11, sugar_percent: 4.4, fructose_percent: 2.4, glucose_percent: 2, fiber_percent: 6.5, kcal_per_100g: 43 },
  banana: { water_percent: 74.9, solids_percent: 25.1, fat_percent: 0.3, protein_percent: 1.1, carbohydrate_percent: 22.8, sugar_percent: 12.2, sucrose_percent: 2.4, glucose_percent: 5, fructose_percent: 4.8, fiber_percent: 2.6, kcal_per_100g: 89 },
  pistachioPaste: { water_percent: 1, solids_percent: 99, fat_percent: 45.3, protein_percent: 20.2, carbohydrate_percent: 27, sugar_percent: 7.7, sucrose_percent: 7, fiber_percent: 10, kcal_per_100g: 562 },
} satisfies Record<string, Partial<IngredientComponentProfile>>;

interface LineOptions {
  lock?: LockType;
  actual?: number | null;
}

const line = (
  id: string,
  composition: Partial<IngredientComponentProfile>,
  grams: number,
  options: LineOptions = {},
) => ({
  id,
  ingredient: {
    id: `ing-${id}`,
    name: id,
    category: 'other' as const,
    composition: { ...ZERO, ...composition },
    pod_value: null,
    pac_value: null,
    npac_value: null,
    de_value: null,
    cost_per_kg: 1,
    confidence_score: 85,
    source_type: 'manual' as const,
    is_verified: false,
  },
  planned_grams: grams,
  actual_grams: options.actual ?? null,
  lock_type: options.lock ?? ('unlocked' as LockType),
});

const input = (
  items: ReturnType<typeof line>[],
  over: Partial<RecipeInput> = {},
): RecipeInput => ({
  items,
  mode: 'classic',
  category: 'milk_gelato',
  target_temperature_c: -11,
  target_batch_grams: items.reduce((s, i) => s + i.planned_grams, 0),
  machine_capacity_grams: null,
  ...over,
});

/* ── golden recipe types ─────────────────────────────────────────────────── */

export interface GoldenCorrectionCase {
  description: string;
  input: RecipeInput;
  context: CorrectionContext;
  focus?: TargetMetric[];
  /** Forces the reduce path (proves lock/main protection without a pantry). */
  use_empty_candidates?: boolean;
  expect: {
    /** First proposal kind must be one of these (omit = any). */
    first_kinds?: Array<CorrectionProposal['kind']>;
    /** Candidate ids that must never appear as ADD actions in any proposal. */
    forbidden_add_ids?: string[];
    /** First action ingredient id must be one of these. */
    first_add_ids?: string[];
    /** No reduce actions anywhere (actual-batch rescue guarantee). */
    add_only?: boolean;
    /** Required blocking constraint on the first proposal (tradeoff cases). */
    blocking_constraint?:
      | 'locked_ingredient'
      | 'already_added'
      | 'main_ingredient_floor'
      | 'machine_capacity'
      | 'no_candidate';
    /** Line id that must never be reduced by any proposal. */
    never_reduce_line_id?: string;
  };
}

export interface GoldenRecipe {
  id: string;
  description: string;
  input: RecipeInput;
  expected: {
    /** Violation reason codes in priority order; null = snapshot-only. */
    violation_reasons: string[] | null;
    statuses?: Partial<Record<TargetMetric, IndicatorStatus>>;
    warning_codes: WarningCode[];
    category_fallback: boolean;
    flavor_above_neutral?: boolean;
  };
  broken?: GoldenCorrectionCase[];
}

/* ── the eight golden recipes ────────────────────────────────────────────── */

const milkBaseItems = () => [
  line('milk', QA_COMPOSITIONS.milk, 670),
  line('cream', QA_COMPOSITIONS.cream35, 130),
  line('smp', QA_COMPOSITIONS.smp, 35),
  line('sucrose', QA_COMPOSITIONS.sucrose, 130),
  line('dextrose', QA_COMPOSITIONS.dextrose, 30),
  line('tara', QA_COMPOSITIONS.tara, 5),
];

export const GOLDEN_RECIPES: readonly GoldenRecipe[] = [
  {
    id: 'milk-base-classic',
    description: 'Appendix-A milk base — the canonical arithmetic reference.',
    input: input(milkBaseItems()),
    expected: {
      violation_reasons: ['ice_fraction_high', 'npac_low'], // known uncalibrated outcome
      statuses: { pod: 'ideal', npac: 'too_hard', ice_fraction: 'too_hard', water: 'ideal' },
      warning_codes: [],
      category_fallback: false,
    },
    broken: [
      {
        description: 'sucrose halved → POD too weak → sweetness add',
        input: input([
          line('milk', QA_COMPOSITIONS.milk, 735),
          line('cream', QA_COMPOSITIONS.cream35, 130),
          line('smp', QA_COMPOSITIONS.smp, 35),
          line('sucrose', QA_COMPOSITIONS.sucrose, 65),
          line('dextrose', QA_COMPOSITIONS.dextrose, 30),
          line('tara', QA_COMPOSITIONS.tara, 5),
        ]),
        context: 'planning',
        focus: ['pod'],
        expect: {
          first_kinds: ['correction'],
          first_add_ids: ['sucrose', 'dextrose'],
        },
      },
    ],
  },
  {
    id: 'chocolate-classic',
    description: 'Cocoa + dark chocolate solids/fat profile; milk-band fallback flagged.',
    input: input(
      [
        line('milk', QA_COMPOSITIONS.milk, 600),
        line('cream', QA_COMPOSITIONS.cream35, 90),
        line('smp', QA_COMPOSITIONS.smp, 30),
        line('sucrose', QA_COMPOSITIONS.sucrose, 150),
        line('dextrose', QA_COMPOSITIONS.dextrose, 40),
        line('cocoa', QA_COMPOSITIONS.cocoa2224, 60),
        line('chocolate', QA_COMPOSITIONS.darkChocolate70, 25),
        line('tara', QA_COMPOSITIONS.tara, 5),
      ],
      { category: 'chocolate_gelato' },
    ),
    expected: {
      violation_reasons: null, // snapshot-only
      warning_codes: [],
      category_fallback: true, // no chocolate band exists — honest fallback
    },
    broken: [
      {
        description: 'fat overload → never fixed with sugar',
        input: input(
          [
            line('milk', QA_COMPOSITIONS.milk, 390),
            line('cream', QA_COMPOSITIONS.cream35, 300),
            line('smp', QA_COMPOSITIONS.smp, 30),
            line('sucrose', QA_COMPOSITIONS.sucrose, 150),
            line('dextrose', QA_COMPOSITIONS.dextrose, 40),
            line('cocoa', QA_COMPOSITIONS.cocoa2224, 60),
            line('chocolate', QA_COMPOSITIONS.darkChocolate70, 25),
            line('tara', QA_COMPOSITIONS.tara, 5),
          ],
          { category: 'chocolate_gelato' },
        ),
        context: 'planning',
        focus: ['fat'],
        expect: {
          forbidden_add_ids: ['sucrose', 'dextrose'],
        },
      },
    ],
  },
  {
    id: 'raspberry-premium',
    description: 'Premium fruit recipe with a main-locked raspberry line.',
    input: input(
      [
        line('raspberry', QA_COMPOSITIONS.raspberry, 350, { lock: 'main' }),
        line('milk', QA_COMPOSITIONS.milk, 380),
        line('cream', QA_COMPOSITIONS.cream35, 80),
        line('smp', QA_COMPOSITIONS.smp, 40),
        line('sucrose', QA_COMPOSITIONS.sucrose, 110),
        line('dextrose', QA_COMPOSITIONS.dextrose, 35),
        line('tara', QA_COMPOSITIONS.tara, 5),
      ],
      { category: 'fruit_gelato', mode: 'premium' },
    ),
    expected: {
      violation_reasons: null,
      warning_codes: [],
      category_fallback: true,
      flavor_above_neutral: true, // 35 % main in premium mode
    },
    broken: [
      {
        description:
          'water-heavy fruit overload, no pantry → only fix is reducing the main → premium tradeoff',
        input: input(
          [
            line('raspberry', QA_COMPOSITIONS.raspberry, 850, { lock: 'main' }),
            line('sucrose', QA_COMPOSITIONS.sucrose, 105),
            line('dextrose', QA_COMPOSITIONS.dextrose, 40),
            line('tara', QA_COMPOSITIONS.tara, 5),
          ],
          { category: 'fruit_gelato', mode: 'premium' },
        ),
        context: 'planning',
        focus: ['water'],
        use_empty_candidates: true,
        expect: {
          first_kinds: ['tradeoff'],
          blocking_constraint: 'main_ingredient_floor',
          never_reduce_line_id: 'raspberry',
        },
      },
    ],
  },
  {
    id: 'banana-classic',
    description: 'Banana sugar-split (sucrose + glucose + fructose) through the typed math.',
    input: input(
      [
        line('banana', QA_COMPOSITIONS.banana, 250),
        line('milk', QA_COMPOSITIONS.milk, 480),
        line('cream', QA_COMPOSITIONS.cream35, 100),
        line('smp', QA_COMPOSITIONS.smp, 30),
        line('sucrose', QA_COMPOSITIONS.sucrose, 105),
        line('dextrose', QA_COMPOSITIONS.dextrose, 30),
        line('tara', QA_COMPOSITIONS.tara, 5),
      ],
      { category: 'fruit_gelato' },
    ),
    expected: {
      violation_reasons: null,
      warning_codes: [],
      category_fallback: true,
    },
  },
  {
    id: 'jim-beam-alcohol',
    description: 'Signature alcohol gelato at 2.8 % alcohol — above the 2.5 % warn threshold.',
    input: input(
      [
        line('milk', QA_COMPOSITIONS.milk, 600),
        line('cream', QA_COMPOSITIONS.cream35, 130),
        line('smp', QA_COMPOSITIONS.smp, 35),
        line('sucrose', QA_COMPOSITIONS.sucrose, 130),
        line('dextrose', QA_COMPOSITIONS.dextrose, 30),
        line('tara', QA_COMPOSITIONS.tara, 5),
        line('jim-beam', QA_COMPOSITIONS.jimBeam, 70),
      ],
      { category: 'alcohol_gelato', mode: 'signature' },
    ),
    expected: {
      violation_reasons: null,
      statuses: { alcohol: 'risky' },
      warning_codes: ['alcohol_above_safe_range'],
      category_fallback: true,
    },
    broken: [
      {
        description: 'alcohol fix must never add high-PAC sugar',
        input: input(
          [
            line('milk', QA_COMPOSITIONS.milk, 600),
            line('cream', QA_COMPOSITIONS.cream35, 130),
            line('smp', QA_COMPOSITIONS.smp, 35),
            line('sucrose', QA_COMPOSITIONS.sucrose, 130),
            line('dextrose', QA_COMPOSITIONS.dextrose, 30),
            line('tara', QA_COMPOSITIONS.tara, 5),
            line('jim-beam', QA_COMPOSITIONS.jimBeam, 70),
          ],
          { category: 'alcohol_gelato', mode: 'signature' },
        ),
        context: 'planning',
        focus: ['alcohol'],
        expect: {
          forbidden_add_ids: ['sucrose', 'dextrose'],
        },
      },
    ],
  },
  {
    id: 'over-sugared-rescue',
    description:
      'Actual Batch rescue: planned sucrose 100 g, actually poured 220 g — everything already in the machine.',
    input: input(
      [
        line('milk', QA_COMPOSITIONS.milk, 650, { lock: 'already_added', actual: 650 }),
        line('cream', QA_COMPOSITIONS.cream35, 130, { lock: 'already_added', actual: 130 }),
        line('smp', QA_COMPOSITIONS.smp, 35, { lock: 'already_added', actual: 35 }),
        line('sucrose', QA_COMPOSITIONS.sucrose, 100, { lock: 'already_added', actual: 220 }),
        line('dextrose', QA_COMPOSITIONS.dextrose, 200, { lock: 'already_added', actual: 200 }),
        line('tara', QA_COMPOSITIONS.tara, 5, { lock: 'already_added', actual: 5 }),
      ],
      { target_batch_grams: 1120 }, // the plan — actuals total 1240
    ),
    expected: {
      violation_reasons: null, // snapshot records the actual-state violations
      warning_codes: ['batch_mass_mismatch'], // the overpour is visible
      category_fallback: false,
    },
    broken: [
      {
        description: 'rescue must be add-only — nothing physically added is reduced',
        input: input(
          [
            line('milk', QA_COMPOSITIONS.milk, 650, { lock: 'already_added', actual: 650 }),
            line('cream', QA_COMPOSITIONS.cream35, 130, { lock: 'already_added', actual: 130 }),
            line('smp', QA_COMPOSITIONS.smp, 35, { lock: 'already_added', actual: 35 }),
            line('sucrose', QA_COMPOSITIONS.sucrose, 100, { lock: 'already_added', actual: 220 }),
            line('dextrose', QA_COMPOSITIONS.dextrose, 200, { lock: 'already_added', actual: 200 }),
            line('tara', QA_COMPOSITIONS.tara, 5, { lock: 'already_added', actual: 5 }),
          ],
          { target_batch_grams: 1120 },
        ),
        context: 'actual_batch',
        expect: {
          first_kinds: ['correction'],
          add_only: true,
        },
      },
    ],
  },
  {
    id: 'high-fruit-water',
    description: 'Raspberry-heavy, water-high/solids-low mix (fruit category, water candidate legal).',
    input: input(
      [
        line('raspberry', QA_COMPOSITIONS.raspberry, 850),
        line('sucrose', QA_COMPOSITIONS.sucrose, 105),
        line('dextrose', QA_COMPOSITIONS.dextrose, 40),
        line('tara', QA_COMPOSITIONS.tara, 5),
      ],
      { category: 'fruit_gelato' },
    ),
    expected: {
      violation_reasons: null, // snapshot records the full set (npac/pod/water/solids/fat)
      statuses: { water: 'risky', total_solids: 'risky' },
      warning_codes: [],
      category_fallback: true,
    },
    broken: [
      {
        description: 'water-high fix → dry-solids add (SMP/inulin)',
        input: input(
          [
            line('raspberry', QA_COMPOSITIONS.raspberry, 850),
            line('sucrose', QA_COMPOSITIONS.sucrose, 105),
            line('dextrose', QA_COMPOSITIONS.dextrose, 40),
            line('tara', QA_COMPOSITIONS.tara, 5),
          ],
          { category: 'fruit_gelato' },
        ),
        context: 'planning',
        focus: ['water'],
        expect: {
          first_kinds: ['correction'],
          first_add_ids: ['smp', 'inulin'],
        },
      },
      {
        description: 'same fix blocked by a tight machine → capacity tradeoff',
        input: input(
          [
            line('raspberry', QA_COMPOSITIONS.raspberry, 850),
            line('sucrose', QA_COMPOSITIONS.sucrose, 105),
            line('dextrose', QA_COMPOSITIONS.dextrose, 40),
            line('tara', QA_COMPOSITIONS.tara, 5),
          ],
          { category: 'fruit_gelato', machine_capacity_grams: 1050 },
        ),
        context: 'planning',
        focus: ['water'],
        expect: {
          first_kinds: ['tradeoff', 'impossible'],
          blocking_constraint: 'machine_capacity',
        },
      },
    ],
  },
  {
    id: 'pistachio-high-fat',
    description: 'Premium nut recipe, paste main-locked, fat above band.',
    input: input(
      [
        line('pistachio-paste', QA_COMPOSITIONS.pistachioPaste, 150, { lock: 'main' }),
        line('milk', QA_COMPOSITIONS.milk, 520),
        line('cream', QA_COMPOSITIONS.cream35, 120),
        line('smp', QA_COMPOSITIONS.smp, 40),
        line('sucrose', QA_COMPOSITIONS.sucrose, 130),
        line('dextrose', QA_COMPOSITIONS.dextrose, 35),
        line('tara', QA_COMPOSITIONS.tara, 5),
      ],
      { category: 'nut_gelato', mode: 'premium' },
    ),
    expected: {
      violation_reasons: null, // snapshot records fat_high among others
      warning_codes: [],
      category_fallback: true,
      flavor_above_neutral: true,
    },
    broken: [
      {
        description: 'fat fix must never reduce the main paste (dilution adds or tradeoff)',
        input: input(
          [
            line('pistachio-paste', QA_COMPOSITIONS.pistachioPaste, 150, { lock: 'main' }),
            line('milk', QA_COMPOSITIONS.milk, 520),
            line('cream', QA_COMPOSITIONS.cream35, 120),
            line('smp', QA_COMPOSITIONS.smp, 40),
            line('sucrose', QA_COMPOSITIONS.sucrose, 130),
            line('dextrose', QA_COMPOSITIONS.dextrose, 35),
            line('tara', QA_COMPOSITIONS.tara, 5),
          ],
          { category: 'nut_gelato', mode: 'premium' },
        ),
        context: 'planning',
        focus: ['fat'],
        expect: {
          forbidden_add_ids: ['sucrose', 'dextrose'],
          never_reduce_line_id: 'pistachio-paste',
        },
      },
    ],
  },
];
