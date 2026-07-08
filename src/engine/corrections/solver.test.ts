import { describe, expect, it } from 'vitest';
import { ALLOWED_ENGINE_FUNCTIONS } from '../__fixtures__/allowedEngineFunctions';
import { calculateRecipe } from '../calculateRecipe';
import * as engine from '../index';
import type {
  IngredientComponentProfile,
  LockType,
  RecipeInput,
  RecipeItem,
} from '../types';
import { selectTargetBand } from '../statuses';
import { DEFAULT_CORRECTION_CANDIDATES } from './candidates';
import { applyTargetBandOverride, detectViolations, proposeCorrections } from './solver';
import type { CorrectionCandidate, CorrectionProposal, CorrectionResult } from './types';
import { applyCorrectionActions } from './verify';

/* ── ingredient compositions (literature values, test-local) ─────────────── */

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

const MILK = { water_percent: 87.5, solids_percent: 12.5, fat_percent: 3.5, protein_percent: 3.3, carbohydrate_percent: 4.8, sugar_percent: 4.8, lactose_percent: 4.8, salt_percent: 0.1, kcal_per_100g: 64 };
const CREAM35 = { water_percent: 58.9, solids_percent: 41.1, fat_percent: 35, protein_percent: 2.2, carbohydrate_percent: 3.1, sugar_percent: 3.1, lactose_percent: 3.1, salt_percent: 0.1, kcal_per_100g: 337 };
const SMP = { water_percent: 3.5, solids_percent: 96.5, fat_percent: 0.8, protein_percent: 35, carbohydrate_percent: 52, sugar_percent: 52, lactose_percent: 52, salt_percent: 1, kcal_per_100g: 360 };
const SUCROSE = { solids_percent: 100, carbohydrate_percent: 100, sugar_percent: 100, sucrose_percent: 100, kcal_per_100g: 400 };
const DEXTROSE = { water_percent: 8, solids_percent: 92, carbohydrate_percent: 92, sugar_percent: 92, dextrose_percent: 92, kcal_per_100g: 368 };
const TARA = { water_percent: 12, solids_percent: 88, carbohydrate_percent: 80, fiber_percent: 80, kcal_per_100g: 200 };
const JIM_BEAM = { water_percent: 60, alcohol_percent: 40, kcal_per_100g: 280 };

interface ItemOptions {
  lock?: LockType;
  actual?: number | null;
}

const item = (
  id: string,
  composition: Partial<IngredientComponentProfile>,
  grams: number,
  options: ItemOptions = {},
): RecipeItem => ({
  id,
  ingredient: {
    id: `ing-${id}`,
    name: id,
    category: 'other',
    composition: { ...ZERO, ...composition },
    pod_value: null,
    pac_value: null,
    npac_value: null,
    de_value: null,
    cost_per_kg: 1,
    confidence_score: 85,
    source_type: 'manual',
    is_verified: false,
  },
  planned_grams: grams,
  actual_grams: options.actual ?? null,
  lock_type: options.lock ?? 'unlocked',
});

const mkInput = (items: RecipeItem[], over: Partial<RecipeInput> = {}): RecipeInput => ({
  items,
  mode: 'classic',
  category: 'milk_gelato',
  target_temperature_c: -11,
  target_batch_grams: items.reduce((s, i) => s + (i.actual_grams ?? i.planned_grams), 0),
  machine_capacity_grams: null,
  ...over,
});

const pro = (result: CorrectionResult): CorrectionProposal[] => {
  if (result.redacted) throw new Error('expected unredacted result');
  return result.proposals;
};

/* ── scenario recipes ────────────────────────────────────────────────────── */

/** POD too low (≈ 8.97), everything else base-like. */
const podLowInput = () =>
  mkInput([
    item('milk', MILK, 740),
    item('cream', CREAM35, 130),
    item('smp', SMP, 35),
    item('sucrose', SUCROSE, 60),
    item('dextrose', DEXTROSE, 30),
    item('tara', TARA, 5),
  ]);

/** POD too high (≈ 27.5) with NPAC also far too high — dextrose overload. */
const sugarOverloadInput = (dextroseOptions: ItemOptions = {}) =>
  mkInput([
    item('milk', MILK, 650),
    item('sucrose', SUCROSE, 100),
    item('dextrose', DEXTROSE, 250, dextroseOptions),
  ]);

/** Fat too low (≈ 2.5 %) with NPAC/POD healthy enough to allow a cream fix. */
const fatLowInput = () =>
  mkInput([
    item('milk', MILK, 715),
    item('smp', SMP, 35),
    item('sucrose', SUCROSE, 100),
    item('dextrose', DEXTROSE, 145),
    item('tara', TARA, 5),
  ]);

/** Solids too low (≈ 30.7 %) with NPAC high enough to tolerate dilution. */
const solidsLowInput = () =>
  mkInput([
    item('milk', MILK, 775),
    item('sucrose', SUCROSE, 40),
    item('dextrose', DEXTROSE, 180),
    item('tara', TARA, 5),
  ]);

/** Alcohol above the 2.5 % warn threshold (2.8 %). */
const alcoholHighInput = (over: Partial<RecipeInput> = {}) =>
  mkInput(
    [
      item('milk', MILK, 600),
      item('cream', CREAM35, 130),
      item('smp', SMP, 35),
      item('sucrose', SUCROSE, 130),
      item('dextrose', DEXTROSE, 30),
      item('tara', TARA, 5),
      item('jim-beam', JIM_BEAM, 70),
    ],
    over,
  );

/* ── violation-specific suggestions (spec §13 table) ─────────────────────── */

describe('violation-specific suggestions', () => {
  it('POD too low suggests a sweetness correction with exact grams', () => {
    const proposals = pro(
      proposeCorrections({ input: podLowInput(), context: 'planning', redact: false, focus: ['pod'] }),
    );
    expect(proposals.length).toBeGreaterThan(0);
    const first = proposals[0]!;
    expect(first.kind).toBe('correction');
    expect(first.actions[0]!.type).toBe('add');
    expect(['sucrose', 'dextrose']).toContain(first.actions[0]!.ingredient_id);
    expect(first.actions[0]!.grams).toBeGreaterThan(0);
    // dextrose can resolve every violation here (high); sucrose leaves NPAC/ice
    // residuals (medium) — both are honest outcomes under the current config
    expect(['high', 'medium']).toContain(first.confidence);
  });

  it('POD too high avoids adding more sugar and uses dilution/rebalance', () => {
    const proposals = pro(
      proposeCorrections({
        input: sugarOverloadInput(),
        context: 'planning',
        redact: false,
        focus: ['pod'],
      }),
    );
    expect(proposals.some((p) => p.kind === 'correction')).toBe(true);
    for (const proposal of proposals) {
      for (const action of proposal.actions) {
        expect(
          action.type === 'add' && ['sucrose', 'dextrose'].includes(action.ingredient_id),
          `must not add sugar: ${action.ingredient_id}`,
        ).toBe(false);
      }
    }
  });

  it('NPAC too low suggests a dextrose/glucose-type correction', () => {
    // low-sugar milk base — under the per_water basis (CONFIG 0.5.0) its NPAC
    // lands below the 33–42 band, so focusing on npac proposes a high-PAC add.
    const base = mkInput([
      item('milk', MILK, 670),
      item('cream', CREAM35, 130),
      item('smp', SMP, 45),
      item('sucrose', SUCROSE, 120),
      item('tara', TARA, 5),
    ]);
    const proposals = pro(
      proposeCorrections({ input: base, context: 'planning', redact: false, focus: ['npac'] }),
    );
    expect(proposals[0]!.kind).toBe('correction');
    expect(proposals[0]!.actions[0]!.ingredient_id).toBe('dextrose');
  });

  it('NPAC too high avoids high-PAC ingredients', () => {
    const proposals = pro(
      proposeCorrections({
        input: sugarOverloadInput(),
        context: 'planning',
        redact: false,
        focus: ['npac'],
      }),
    );
    expect(proposals.some((p) => p.kind === 'correction')).toBe(true);
    for (const proposal of proposals) {
      for (const action of proposal.actions) {
        expect(
          action.type === 'add' && ['sucrose', 'dextrose'].includes(action.ingredient_id),
        ).toBe(false);
      }
    }
  });

  it('fat too low suggests a cream-type correction', () => {
    const proposals = pro(
      proposeCorrections({ input: fatLowInput(), context: 'planning', redact: false, focus: ['fat'] }),
    );
    const first = proposals[0]!;
    expect(first.kind).toBe('correction');
    expect(first.actions[0]!.ingredient_id).toBe('cream_30');
    // medium, not high: under the per_water basis (CONFIG 0.5.0) this recipe also
    // runs npac/pod high, which the cream fix does not resolve on its own.
    expect(first.confidence).toBe('medium');
  });

  it('solids too low suggests skimmed milk powder or inulin', () => {
    const proposals = pro(
      proposeCorrections({
        input: solidsLowInput(),
        context: 'planning',
        redact: false,
        focus: ['total_solids'],
      }),
    );
    const first = proposals[0]!;
    expect(first.kind).toBe('correction');
    expect(['smp', 'inulin']).toContain(first.actions[0]!.ingredient_id);
  });

  it('alcohol too high dilutes or trades off — never more high-PAC sugar', () => {
    const open = pro(
      proposeCorrections({
        input: alcoholHighInput(),
        context: 'planning',
        redact: false,
        focus: ['alcohol'],
      }),
    );
    for (const proposal of open) {
      for (const action of proposal.actions) {
        expect(['sucrose', 'dextrose']).not.toContain(action.ingredient_id);
      }
    }
    // production scenario: the spirit is physically in the machine (actuals,
    // actual_batch context) and the dilution cannot fit → explicit tradeoff
    const cappedInput = alcoholHighInput({ machine_capacity_grams: 1100 });
    cappedInput.items = cappedInput.items.map((line) =>
      line.id === 'jim-beam' ? { ...line, actual_grams: 70 } : line,
    );
    const capped = pro(
      proposeCorrections({
        input: cappedInput,
        context: 'actual_batch',
        redact: false,
        focus: ['alcohol'],
      }),
    );
    expect(capped[0]!.kind).not.toBe('correction');
    expect(['machine_capacity', 'already_added', 'no_candidate']).toContain(
      capped[0]!.blocking!.constraint,
    );
  });
});

/* ── locks, contexts and main-ingredient protection ──────────────────────── */

describe('locks, contexts and main-ingredient protection', () => {
  const noCandidates: CorrectionCandidate[] = []; // forces the reduce path

  it('locked ingredients are never reduced', () => {
    const result = pro(
      proposeCorrections({
        input: sugarOverloadInput({ lock: 'grams' }),
        context: 'planning',
        redact: false,
        focus: ['pod'],
        candidates: noCandidates,
      }),
    );
    expect(result.every((p) => p.actions.every((a) => a.type !== 'reduce'))).toBe(true);
    expect(result[0]!.kind).toBe('tradeoff');
    expect(result[0]!.blocking!.constraint).toBe('locked_ingredient');
  });

  it('already-added ingredients are never reduced', () => {
    const result = pro(
      proposeCorrections({
        input: sugarOverloadInput({ lock: 'already_added', actual: 250 }),
        context: 'actual_batch',
        redact: false,
        focus: ['pod'],
        candidates: noCandidates,
      }),
    );
    expect(result.every((p) => p.actions.every((a) => a.type !== 'reduce'))).toBe(true);
    expect(result[0]!.blocking!.constraint).toBe('already_added');
  });

  it('planning context may reduce an unlocked line', () => {
    const result = pro(
      proposeCorrections({
        input: sugarOverloadInput(),
        context: 'planning',
        redact: false,
        focus: ['pod'],
        candidates: noCandidates,
      }),
    );
    const first = result[0]!;
    expect(first.kind).toBe('correction');
    expect(first.actions[0]!.type).toBe('reduce');
    expect(first.actions[0]!.target_line_id).toBe('dextrose');
  });

  it('actual batch context never reduces physically added lines (lock_type irrelevant)', () => {
    const result = pro(
      proposeCorrections({
        input: sugarOverloadInput({ actual: 250 }), // unlocked, but physically added
        context: 'actual_batch',
        redact: false,
        focus: ['pod'],
        candidates: noCandidates,
      }),
    );
    expect(result.every((p) => p.actions.every((a) => a.type !== 'reduce'))).toBe(true);
    expect(result[0]!.kind).not.toBe('correction');
  });

  it('main ingredient is protected in PREMIUM and SIGNATURE — even with the opt-in flag', () => {
    for (const mode of ['premium', 'signature'] as const) {
      const input = sugarOverloadInput({ lock: 'main' });
      input.mode = mode;
      const result = pro(
        proposeCorrections({
          input,
          context: 'planning',
          redact: false,
          focus: ['pod'],
          candidates: noCandidates,
          allow_main_ingredient_reduction: true, // flag must not override the protection
        }),
      );
      expect(result[0]!.kind).toBe('tradeoff');
      expect(result[0]!.blocking!.constraint).toBe('main_ingredient_floor');
      expect(result.every((p) => p.actions.every((a) => a.type !== 'reduce'))).toBe(true);
    }
  });

  it('ECO/CLASSIC may reduce the main ingredient only with the explicit opt-in', () => {
    const refused = pro(
      proposeCorrections({
        input: sugarOverloadInput({ lock: 'main' }), // classic mode by default
        context: 'planning',
        redact: false,
        focus: ['pod'],
        candidates: noCandidates,
        // allow_main_ingredient_reduction omitted → default false
      }),
    );
    expect(refused[0]!.kind).toBe('tradeoff');
    expect(refused[0]!.blocking!.constraint).toBe('main_ingredient_floor');

    const allowed = pro(
      proposeCorrections({
        input: sugarOverloadInput({ lock: 'main' }),
        context: 'planning',
        redact: false,
        focus: ['pod'],
        candidates: noCandidates,
        allow_main_ingredient_reduction: true,
      }),
    );
    expect(allowed[0]!.kind).toBe('correction');
    expect(allowed[0]!.actions[0]!.type).toBe('reduce');
  });

  it('machine capacity is respected', () => {
    const result = pro(
      proposeCorrections({
        input: mkInput(podLowInput().items, { machine_capacity_grams: 1050 }),
        context: 'planning',
        redact: false,
        focus: ['pod'],
      }),
    );
    expect(result[0]!.kind).toBe('tradeoff');
    expect(result[0]!.blocking!.constraint).toBe('machine_capacity');
    expect(result[0]!.reasons).toContain('machine_capacity_blocked');
  });
});

/* ── verification and rejection ──────────────────────────────────────────── */

describe('verification', () => {
  it('proposals are verified by re-running calculateRecipe (bit-for-bit)', () => {
    const input = podLowInput();
    const first = pro(
      proposeCorrections({ input, context: 'planning', redact: false, focus: ['pod'] }),
    )[0]!;
    const hypothetical = applyCorrectionActions(
      input,
      first.actions,
      {
        context: 'planning',
        mode: input.mode,
        allow_main_ingredient_reduction: false,
        machine_capacity_grams: null,
      },
      DEFAULT_CORRECTION_CANDIDATES,
    )!;
    const rerun = calculateRecipe(hypothetical);
    expect(first.predicted[0]!.metric).toBe('pod');
    expect(first.predicted[0]!.after).toBe(rerun.pod_points);
  });

  it('an invalid proposal (breaks a higher-priority metric) is rejected', () => {
    // perverse candidate: fixes water/solids but injects 50 % alcohol (priority 0)
    const perverse: CorrectionCandidate[] = [
      {
        id: 'smp',
        name: 'Perverse SMP',
        roles: ['solids_up'],
        ingredient: {
          id: 'smp',
          name: 'Perverse SMP',
          category: 'dairy',
          composition: { ...ZERO, water_percent: 3.5, solids_percent: 96.5, alcohol_percent: 50 },
          pod_value: null,
          pac_value: null,
          npac_value: null,
          de_value: null,
          cost_per_kg: 7,
          confidence_score: 85,
          source_type: 'manual',
          is_verified: false,
        },
      },
    ];
    const input = mkInput([
      item('milk', MILK, 950),
      item('sucrose', SUCROSE, 45),
      item('tara', TARA, 5),
    ]);
    const result = pro(
      proposeCorrections({
        input,
        context: 'planning',
        redact: false,
        focus: ['water'],
        candidates: perverse,
      }),
    );
    for (const proposal of result) {
      expect(proposal.actions.some((a) => a.type === 'add' && a.ingredient_id === 'smp')).toBe(
        false,
      );
    }
  });

  it('Pro exact grams are present and finite', () => {
    const proposals = pro(
      proposeCorrections({ input: podLowInput(), context: 'planning', redact: false, focus: ['pod'] }),
    );
    for (const proposal of proposals) {
      for (const action of proposal.actions) {
        expect(Number.isFinite(action.grams)).toBe(true);
        expect(action.grams).toBeGreaterThan(0);
      }
      for (const prediction of proposal.predicted) {
        expect(prediction.after === null || Number.isFinite(prediction.after)).toBe(true);
      }
    }
  });
});

/* ── strict demo redaction (spec §14) ────────────────────────────────────── */

describe('strict demo redaction', () => {
  const deepCollectNumbers = (value: unknown, found: string[] = [], path = '$'): string[] => {
    if (typeof value === 'number') found.push(path);
    else if (Array.isArray(value)) value.forEach((v, i) => deepCollectNumbers(v, found, `${path}[${i}]`));
    else if (value !== null && typeof value === 'object') {
      for (const [key, v] of Object.entries(value)) deepCollectNumbers(v, found, `${path}.${key}`);
    }
    return found;
  };

  it('redacted demo proposals contain no grams, no names, no hidden numeric fields', () => {
    const input = podLowInput();
    const proResult = proposeCorrections({ input, context: 'planning', redact: false, focus: ['pod'] });
    const demoResult = proposeCorrections({ input, context: 'planning', redact: true, focus: ['pod'] });

    if (!demoResult.redacted) throw new Error('expected a redacted result');
    expect(demoResult.proposals.length).toBeGreaterThan(0);

    // zero number-typed values anywhere in the returned tree
    expect(deepCollectNumbers(demoResult.proposals)).toEqual([]);

    const json = JSON.stringify(demoResult).toLowerCase();
    expect(json).not.toContain('grams');
    expect(json).not.toContain('sucrose');
    expect(json).not.toContain('dextrose');
    expect(json).not.toContain('milk');
    expect(json).not.toContain('predicted');
    // and no exact gram value from the Pro result leaks anywhere
    if (!proResult.redacted) {
      for (const proposal of proResult.proposals) {
        for (const action of proposal.actions) {
          expect(json).not.toContain(action.grams.toFixed(1));
        }
      }
    }

    const first = demoResult.proposals[0]!;
    expect(first.teaser_code).toBe('pro_can_calculate');
    expect(['add', 'reduce', 'rebalance']).toContain(first.direction);
    expect(first.affected_metrics).toEqual(['pod']);
    expect(['high', 'medium', 'low', 'tradeoff']).toContain(first.confidence);
  });
});

/* ── determinism, purity, scope ──────────────────────────────────────────── */

describe('determinism and purity', () => {
  it('is deterministic — same request gives the same result', () => {
    const request = () => ({
      input: podLowInput(),
      context: 'planning' as const,
      redact: false,
      focus: ['pod' as const],
    });
    expect(proposeCorrections(request())).toEqual(proposeCorrections(request()));
  });

  it('does not mutate the input', () => {
    const input = sugarOverloadInput();
    const snapshot = JSON.parse(JSON.stringify(input)) as unknown;
    proposeCorrections({ input, context: 'planning', redact: false });
    expect(input).toEqual(snapshot);
  });
});

describe('targetBandOverride — preview-only solver target injection', () => {
  const req = (over: Partial<Parameters<typeof proposeCorrections>[0]> = {}) => ({
    input: podLowInput(),
    context: 'planning' as const,
    redact: false,
    ...over,
  });

  it('default behavior is unchanged: the engine\'s own band as an override equals the default result', () => {
    const engineNpac = selectTargetBand('milk_gelato', -11)!.band.metrics.npac;
    const base = pro(proposeCorrections(req()));
    const identity = pro(proposeCorrections(req({ targetBandOverride: { npac: engineNpac } })));
    expect(JSON.stringify(identity)).toBe(JSON.stringify(base));
  });

  it('an override band re-targets detection (forces an npac violation at the injected band)', () => {
    const result = calculateRecipe(podLowInput());
    const npacValue = result.indicators.find((i) => i.key === 'npac')!.value!;
    const band = { min: npacValue + 6, max: npacValue + 10 };
    const v = detectViolations(applyTargetBandOverride(result, { npac: band })).find((x) => x.metric === 'npac');
    expect(v).toBeDefined();
    expect(v!.direction).toBe('low'); // recipe npac sits below the injected band
    expect(v!.band).toEqual(band);
  });

  it('the override changes the real gram-solve output and targets npac', () => {
    const base = pro(proposeCorrections(req()));
    const result = calculateRecipe(podLowInput());
    const npacValue = result.indicators.find((i) => i.key === 'npac')!.value!;
    const overridden = pro(
      proposeCorrections(req({ targetBandOverride: { npac: { min: npacValue + 6, max: npacValue + 10 } } })),
    );
    expect(JSON.stringify(overridden)).not.toBe(JSON.stringify(base));
    expect(overridden.some((p) => p.affected_metrics.includes('npac'))).toBe(true);
  });

  it('applyTargetBandOverride is immutable and touches only mapped metrics', () => {
    const result = calculateRecipe(podLowInput());
    const npacBefore = JSON.stringify(result.indicators.find((i) => i.key === 'npac')!.band);
    const podBefore = result.indicators.find((i) => i.key === 'pod')!;
    const injected = applyTargetBandOverride(result, { npac: { min: 90, max: 95 } });
    expect(injected).not.toBe(result);
    expect(injected.indicators).not.toBe(result.indicators);
    expect(injected.indicators.find((i) => i.key === 'npac')!.band).toEqual({ min: 90, max: 95 });
    // original result untouched; a non-overridden indicator is kept by reference
    expect(JSON.stringify(result.indicators.find((i) => i.key === 'npac')!.band)).toBe(npacBefore);
    expect(injected.indicators.find((i) => i.key === 'pod')).toBe(podBefore);
  });

  it('never mutates the global TARGET_BANDS', () => {
    const before = JSON.stringify(engine.TARGET_BANDS);
    proposeCorrections(req({ targetBandOverride: { npac: { min: 90, max: 95 } } }));
    expect(JSON.stringify(engine.TARGET_BANDS)).toBe(before);
  });
});

describe('scope guard', () => {
  it('the engine exports exactly the allowed functions — pure TS, no IO', () => {
    const functionNames = Object.entries(engine)
      .filter(([, value]) => typeof value === 'function')
      .map(([name]) => name);
    expect(functionNames.sort()).toEqual([...ALLOWED_ENGINE_FUNCTIONS].sort());
  });
});
