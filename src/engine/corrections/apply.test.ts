/**
 * Auto Fix Slice 1A — apply/idempotence core tests (NO UI).
 *
 * Exercises the pure proposeAutoFix/applyAutoFix seam over the existing solver
 * and pins the behavioural guarantees the planning history requires:
 *   - idempotence: balanced → no-op; repeated propose→apply reaches a fixed point
 *     (the external reference's repeated-auto-balance flaw must never recur);
 *   - locks / hero: a locked premium ingredient never changes; PREMIUM/SIGNATURE
 *     main is never reduced; corrections balance AROUND a locked hero;
 *   - impossible balance: an over-locked recipe returns a tradeoff, never a fake
 *     "perfect" correction;
 *   - alcohol: high alcohol is never "fixed" by adding high-PAC sugar;
 *   - purity / redaction: input never mutated; Free Preview proposals carry no
 *     grams or names; Pro proposals carry exact grams and can be applied.
 *
 * Helpers (item/mkInput/pro/deepCollectNumbers + scenario builders) are COPIED
 * from solver.test.ts — the repo's established convention for test-local
 * compositions (no shared test module in Slice 1A).
 */
import { describe, expect, it } from 'vitest';
import { calculateRecipe } from '../calculateRecipe';
import { externalReferenceMilkBase } from '../__fixtures__/externalReference';
import type { ActiveRecipeFixture } from '../__fixtures__/schema';
import type { IngredientComponentProfile, LockType, RecipeInput, RecipeItem } from '../types';
import { applyAutoFix, proposeAutoFix } from './apply';
import { detectViolations } from './solver';
import type { CorrectionProposal, CorrectionResult } from './types';

/* ── ingredient compositions (literature values, test-local — copied) ─────── */

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
/** Dessert chocolate ~72 % — the hero/premium ingredient for the lock tests. */
const CHOCOLATE = { water_percent: 14.593, solids_percent: 85.407, fat_percent: 44.5, protein_percent: 8.1, carbohydrate_percent: 32.8, sugar_percent: 26.1, sucrose_percent: 26.1, kcal_per_100g: 580 };

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

const deepCollectNumbers = (value: unknown, found: string[] = [], path = '$'): string[] => {
  if (typeof value === 'number') found.push(path);
  else if (Array.isArray(value)) value.forEach((v, i) => deepCollectNumbers(v, found, `${path}[${i}]`));
  else if (value !== null && typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) deepCollectNumbers(v, found, `${path}.${key}`);
  }
  return found;
};

/** Map an active reference fixture (verified inline DNA) into a RecipeInput. */
const fixtureToInput = (fixture: ActiveRecipeFixture, over: Partial<RecipeInput> = {}): RecipeInput => ({
  items: fixture.input.map((l, i) => ({
    id: `line-${i}`,
    ingredient: {
      id: `ing-${i}-${l.ingredient_name}`,
      name: l.ingredient_name,
      category: 'other' as const,
      composition: l.composition,
      pod_value: l.pod_value ?? null,
      pac_value: l.pac_value ?? null,
      npac_value: l.npac_value ?? null,
      de_value: l.de_value ?? null,
      cost_per_kg: null,
      confidence_score: 100,
      source_type: 'verified_db' as const,
      is_verified: true,
    },
    planned_grams: l.grams,
    actual_grams: null,
    lock_type: 'unlocked' as const,
  })),
  mode: 'classic',
  category: fixture.category ?? 'milk_gelato',
  target_temperature_c: fixture.temperature_c ?? -11,
  target_batch_grams: fixture.input.reduce((s, l) => s + l.grams, 0),
  machine_capacity_grams: null,
  ...over,
});

/* ── scenario recipes (copied from solver.test.ts) ───────────────────────── */

/** POD too low (≈ 9), everything else base-like. */
const podLowInput = () =>
  mkInput([
    item('milk', MILK, 740),
    item('cream', CREAM35, 130),
    item('smp', SMP, 35),
    item('sucrose', SUCROSE, 60),
    item('dextrose', DEXTROSE, 30),
    item('tara', TARA, 5),
  ]);

/** Alcohol above the 2.5 % warn threshold (≈ 2.8 %). */
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

/** Chocolate as the hero/main ingredient with POD low → a fixable, non-chocolate
 * correction is available (add sweetener), so the solver balances around it. */
const chocolateHeroLowPod = (chocolateOptions: ItemOptions = {}) =>
  mkInput(
    [
      item('milk', MILK, 700),
      item('choc', CHOCOLATE, 150, chocolateOptions),
      item('sucrose', SUCROSE, 25),
      item('tara', TARA, 5),
    ],
    { category: 'chocolate_gelato' },
  );

/** Chocolate over-concentrated → fat far above band; the only structural fix
 * would be reducing chocolate, which is forbidden when it is the locked hero. */
const chocolateOverloaded = (chocolateOptions: ItemOptions = {}) =>
  mkInput(
    [
      item('milk', MILK, 560),
      item('choc', CHOCOLATE, 400, chocolateOptions),
      item('sucrose', SUCROSE, 40),
    ],
    { category: 'chocolate_gelato' },
  );

/* ── idempotence ─────────────────────────────────────────────────────────── */

describe('Auto Fix apply — idempotence', () => {
  it('an already-balanced recipe yields zero proposals (no-op) and is stable', () => {
    const input = fixtureToInput(externalReferenceMilkBase);
    // confirmed in-band under the current engine bands → nothing to fix
    expect(detectViolations(calculateRecipe(input))).toHaveLength(0);

    const first = proposeAutoFix({ input, context: 'planning', exactCorrectionGrams: true });
    expect(first.redacted).toBe(false);
    expect(first.proposals).toHaveLength(0);

    // repeated Magic on a balanced recipe never changes anything
    const second = proposeAutoFix({ input, context: 'planning', exactCorrectionGrams: true });
    expect(second).toEqual(first);
  });

  it('applying a POD fix resolves POD — it is not re-proposed', () => {
    const input = podLowInput();
    const first = pro(
      proposeAutoFix({ input, context: 'planning', exactCorrectionGrams: true, focus: ['pod'] }),
    )[0]!;
    expect(first.kind).toBe('correction');

    const applied = applyAutoFix({ input, proposal: first, context: 'planning' });
    expect(applied.success).toBe(true);
    if (!applied.success) return;

    // POD is now in-band on the corrected recipe → never re-proposed
    expect(detectViolations(calculateRecipe(applied.newInput)).some((v) => v.metric === 'pod')).toBe(
      false,
    );
  });

  it('repeated propose→apply reaches a fixed point (never keeps changing a fixed recipe)', () => {
    let input = podLowInput();
    let lastSignature = '';
    let reachedFixedPoint = false;

    for (let i = 0; i < 6; i += 1) {
      const result = proposeAutoFix({ input, context: 'planning', exactCorrectionGrams: true });
      if (result.redacted) throw new Error('expected unredacted result');
      const correction = result.proposals.find((p) => p.kind === 'correction' && p.actions.length > 0);
      if (!correction) {
        reachedFixedPoint = true; // no actionable correction remains — stable
        break;
      }
      const applied = applyAutoFix({ input, proposal: correction, context: 'planning' });
      if (!applied.success) {
        reachedFixedPoint = true; // nothing further can be applied — stable
        break;
      }
      const signature = JSON.stringify(
        applied.newInput.items.map((it) => [it.id, Number(it.planned_grams.toFixed(3))]),
      );
      if (signature === lastSignature) {
        reachedFixedPoint = true; // grams stopped changing — converged, no oscillation
        break;
      }
      lastSignature = signature;
      input = applied.newInput;
    }

    expect(reachedFixedPoint).toBe(true);
  });
});

/* ── locks & hero protection ─────────────────────────────────────────────── */

describe('Auto Fix apply — locks & hero protection', () => {
  it('a locked premium ingredient is never changed by an applied correction', () => {
    const input = chocolateHeroLowPod({ lock: 'grams' });
    const proposal = pro(
      proposeAutoFix({ input, context: 'planning', exactCorrectionGrams: true, focus: ['pod'] }),
    )[0]!;
    expect(proposal.kind).toBe('correction');
    // no action targets the locked chocolate line
    expect(proposal.actions.every((a) => a.target_line_id !== 'choc')).toBe(true);

    const applied = applyAutoFix({ input, proposal, context: 'planning' });
    expect(applied.success).toBe(true);
    if (!applied.success) return;
    const choc = applied.newInput.items.find((it) => it.id === 'choc')!;
    expect(choc.planned_grams).toBe(150); // unchanged
  });

  it('PREMIUM / SIGNATURE main ingredient is never reduced — returns a tradeoff', () => {
    for (const mode of ['premium', 'signature'] as const) {
      const input = chocolateOverloaded({ lock: 'main' });
      input.mode = mode;
      const result = pro(
        proposeAutoFix({
          input,
          context: 'planning',
          exactCorrectionGrams: true,
          focus: ['fat'],
          candidates: [], // force the reduce path so the protection is exercised
          allowMainIngredientReduction: true, // must NOT override premium/signature
        }),
      );
      expect(result[0]!.kind).toBe('tradeoff');
      expect(result[0]!.blocking!.constraint).toBe('main_ingredient_floor');
      expect(result.every((p) => p.actions.every((a) => a.type !== 'reduce'))).toBe(true);

      // applying the tradeoff is a no-op (it carries no actions)
      const applied = applyAutoFix({ input, proposal: result[0]!, context: 'planning' });
      expect(applied).toEqual({ success: false, reason: 'no_actions' });
    }
  });

  it('balances AROUND a locked hero chocolate using milk/cream/sugars/SMP', () => {
    const input = chocolateHeroLowPod({ lock: 'main' });
    input.mode = 'premium';
    const proposal = pro(
      proposeAutoFix({ input, context: 'planning', exactCorrectionGrams: true, focus: ['pod'] }),
    )[0]!;
    expect(proposal.kind).toBe('correction');

    const allowedCandidateIds = new Set(['sucrose', 'dextrose', 'milk_3_5', 'cream_30', 'smp', 'inulin']);
    for (const action of proposal.actions) {
      expect(action.type).toBe('add'); // never reduce the hero
      expect(allowedCandidateIds.has(action.ingredient_id)).toBe(true);
      expect(action.target_line_id).not.toBe('choc');
    }

    const applied = applyAutoFix({ input, proposal, context: 'planning' });
    expect(applied.success).toBe(true);
    if (!applied.success) return;
    expect(applied.newInput.items.find((it) => it.id === 'choc')!.planned_grams).toBe(150);
  });
});

/* ── impossible balance (no fake perfection) ─────────────────────────────── */

describe('Auto Fix apply — impossible balance (no fake perfection)', () => {
  it('an over-locked premium chocolate returns a tradeoff, never a fake correction', () => {
    const input = chocolateOverloaded({ lock: 'main' });
    input.mode = 'premium';
    const result = pro(
      proposeAutoFix({
        input,
        context: 'planning',
        exactCorrectionGrams: true,
        focus: ['fat'],
        candidates: [], // no add candidate can rescue it → the honest answer is a tradeoff
      }),
    );
    const first = result[0]!;
    expect(['tradeoff', 'impossible']).toContain(first.kind);
    expect(first.actions).toHaveLength(0); // no fabricated "perfect" fix
    expect(first.blocking).toBeDefined();
    // it does not claim to resolve the violation it cannot fix
    expect(first.resolves).not.toContain('fat');

    const applied = applyAutoFix({ input, proposal: first, context: 'planning' });
    expect(applied).toEqual({ success: false, reason: 'no_actions' });
  });
});

/* ── alcohol behaviour (behavioural only — no golden numbers) ─────────────── */

describe('Auto Fix apply — alcohol behaviour', () => {
  it('high alcohol is never fixed by adding dextrose / high-PAC sugar', () => {
    const proposals = pro(
      proposeAutoFix({
        input: alcoholHighInput(),
        context: 'planning',
        exactCorrectionGrams: true,
        focus: ['alcohol'],
      }),
    );
    for (const proposal of proposals) {
      for (const action of proposal.actions) {
        expect(['sucrose', 'dextrose']).not.toContain(action.ingredient_id);
      }
    }
  });

  it('in actual-batch rescue, physically-added spirit is never reduced — add-only or an honest tradeoff', () => {
    // production rescue: the spirit is already in the machine (actual_grams set).
    const input = alcoholHighInput({ machine_capacity_grams: 1100 });
    input.items = input.items.map((line) =>
      line.id === 'jim-beam'
        ? { ...line, actual_grams: 70, lock_type: 'already_added' as const }
        : line,
    );
    const proposals = pro(
      proposeAutoFix({ input, context: 'actual_batch', exactCorrectionGrams: true, focus: ['alcohol'] }),
    );
    for (const proposal of proposals) {
      // never reduce physically-added material; never add high-PAC sugar
      expect(proposal.actions.every((a) => a.type !== 'reduce')).toBe(true);
      for (const action of proposal.actions) {
        expect(['sucrose', 'dextrose']).not.toContain(action.ingredient_id);
      }
      // a correction here is add-only dilution; otherwise it is an honest tradeoff
      if (proposal.kind !== 'correction') {
        expect(['tradeoff', 'impossible']).toContain(proposal.kind);
      }
    }
  });

  it('in planning, an alcohol fix may reduce the unlocked spirit line (not forbidden) but never adds sugar', () => {
    const proposals = pro(
      proposeAutoFix({
        input: alcoholHighInput(),
        context: 'planning',
        exactCorrectionGrams: true,
        focus: ['alcohol'],
      }),
    );
    for (const proposal of proposals) {
      for (const action of proposal.actions) {
        expect(['sucrose', 'dextrose']).not.toContain(action.ingredient_id);
        // any reduction targets the spirit itself, not unrelated lines
        if (action.type === 'reduce') expect(action.target_line_id).toBe('jim-beam');
      }
    }
  });
});

/* ── purity & redaction ──────────────────────────────────────────────────── */

describe('Auto Fix apply — mutation & redaction', () => {
  it('neither propose nor apply mutates the input', () => {
    const input = podLowInput();
    const snapshot = JSON.parse(JSON.stringify(input)) as unknown;

    const proposal = pro(
      proposeAutoFix({ input, context: 'planning', exactCorrectionGrams: true, focus: ['pod'] }),
    )[0]!;
    const applied = applyAutoFix({ input, proposal, context: 'planning' });

    expect(input).toEqual(snapshot); // unchanged
    expect(applied.success).toBe(true);
    if (!applied.success) return;
    expect(applied.newInput).not.toBe(input);
    expect(applied.newInput.items).not.toBe(input.items);
  });

  it('Free Preview (redacted) proposals carry no grams and no ingredient names', () => {
    const input = podLowInput();
    const proResult = proposeAutoFix({ input, context: 'planning', exactCorrectionGrams: true, focus: ['pod'] });
    const demoResult = proposeAutoFix({ input, context: 'planning', exactCorrectionGrams: false, focus: ['pod'] });

    expect(demoResult.redacted).toBe(true);
    if (!demoResult.redacted) return;
    expect(demoResult.proposals.length).toBeGreaterThan(0);

    // zero number-typed values anywhere in the returned tree
    expect(deepCollectNumbers(demoResult.proposals)).toEqual([]);

    const json = JSON.stringify(demoResult).toLowerCase();
    for (const banned of ['grams', 'sucrose', 'dextrose', 'milk', 'predicted']) {
      expect(json).not.toContain(banned);
    }
    // no exact Pro gram value leaks into the redacted JSON
    if (!proResult.redacted) {
      for (const proposal of proResult.proposals) {
        for (const action of proposal.actions) {
          expect(json).not.toContain(action.grams.toFixed(1));
        }
      }
    }
  });

  it('Pro proposals carry exact grams and can be applied; redacted cannot', () => {
    const input = podLowInput();
    const proResult = proposeAutoFix({ input, context: 'planning', exactCorrectionGrams: true, focus: ['pod'] });
    expect(proResult.redacted).toBe(false);
    const proposal = pro(proResult)[0]!;
    expect(proposal.actions[0]!.grams).toBeGreaterThan(0);
    expect(Number.isFinite(proposal.actions[0]!.grams)).toBe(true);
    expect(proposal.actions[0]!.ingredient_name.length).toBeGreaterThan(0);

    expect(applyAutoFix({ input, proposal, context: 'planning' }).success).toBe(true);

    const demoResult = proposeAutoFix({ input, context: 'planning', exactCorrectionGrams: false, focus: ['pod'] });
    if (demoResult.redacted) {
      const redacted = demoResult.proposals[0]!;
      expect(applyAutoFix({ input, proposal: redacted, context: 'planning' })).toEqual({
        success: false,
        reason: 'redacted_proposal',
      });
    }
  });
});
