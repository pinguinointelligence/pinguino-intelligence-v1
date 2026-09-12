import { describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import type { ConstraintSet } from '@/features/recipe-constraints';
import { ownerFruitRecipe, withCustomerGramLocks } from './__fixtures__/ownerFruitMainFixture';
import {
  applyPreviewInstructions,
  hasCustomerQuantityLock,
  isPreviewEditableLine,
  mergePreviewInstructions,
  samePreviewInstructions,
} from './previewInstructions';

const line = (input: RecipeInput, lineId: string) =>
  input.items.find((item) => item.id === lineId)!;

const applied = (
  input: RecipeInput,
  constraints: ConstraintSet,
  instructions: Parameters<typeof applyPreviewInstructions>[2],
) => {
  const result = applyPreviewInstructions(input, constraints, instructions);
  if (!result.ok) throw new Error(`rejected: ${result.reason}`);
  return result;
};

describe('interactive preview instructions — the recipe row semantics, nothing new', () => {
  it('MGAL-PREVIEW-01 an edited amount is exact intent even when the earlier padlock snapshot was off', () => {
    const input = ownerFruitRecipe();
    const result = applied(input, { byLineId: {} }, [
      { lineId: 'cranberry', grams: 20, locked: false },
    ]);
    const cranberry = line(result.input, 'cranberry');
    expect(cranberry).toMatchObject({
      planned_grams: 20,
      user_target_grams: 20,
      user_intent_anchor_grams: 20,
      lock_type: 'grams',
      grams_constraint: { grams: 20 },
    });
    expect(result.constraints.byLineId).toEqual({ cranberry: { mode: 'locked', grams: 20 } });
  });

  it('only the latest typed amount keeps the soft target, exactly like the row', () => {
    const input = ownerFruitRecipe();
    const result = applied(input, { byLineId: {} }, [
      { lineId: 'strawberry', grams: 90, locked: false },
      { lineId: 'cranberry', grams: 20, locked: false },
    ]);
    expect(line(result.input, 'strawberry').user_target_grams).toBeUndefined();
    expect(line(result.input, 'strawberry').user_intent_anchor_grams).toBe(90);
    expect(line(result.input, 'cranberry').user_target_grams).toBe(20);
  });

  it('a locked instruction is the exact padlock: both halves, like toggleLock + setGramLock', () => {
    const input = ownerFruitRecipe();
    const result = applied(input, { byLineId: {} }, [
      { lineId: 'cranberry', grams: 20, locked: true },
    ]);
    expect(line(result.input, 'cranberry')).toMatchObject({
      planned_grams: 20,
      lock_type: 'grams',
      grams_constraint: { grams: 20 },
    });
    expect(result.constraints.byLineId.cranberry).toEqual({ mode: 'locked', grams: 20 });
  });

  it('a Main line keeps its Main role under a gram lock (engine-kept lock)', () => {
    const input = ownerFruitRecipe();
    const result = applied(input, { byLineId: {} }, [
      { lineId: 'watermelon', grams: 150, locked: true },
    ]);
    expect(line(result.input, 'watermelon').lock_type).toBe('main');
    expect(result.constraints.byLineId.watermelon).toEqual({ mode: 'locked', grams: 150 });
  });

  it('releasing a padlock at an unchanged amount is a plain unlock (no typed target)', () => {
    const locked = withCustomerGramLocks(ownerFruitRecipe(), { strawberry: 100 });
    const result = applied(locked.input, locked.constraints, [
      { lineId: 'strawberry', grams: 100, locked: false },
    ]);
    const strawberry = line(result.input, 'strawberry');
    expect(strawberry.lock_type).toBe('unlocked');
    expect(strawberry.grams_constraint).toBeUndefined();
    expect(strawberry.user_target_grams).toBeUndefined();
    expect(result.constraints.byLineId.strawberry).toBeUndefined();
  });

  it('moving an existing padlock keeps it locked at the new amount', () => {
    const locked = withCustomerGramLocks(ownerFruitRecipe(), { strawberry: 100, cranberry: 130 });
    const result = applied(locked.input, locked.constraints, [
      { lineId: 'cranberry', grams: 76, locked: true },
    ]);
    expect(result.constraints.byLineId).toEqual({
      strawberry: { mode: 'locked', grams: 100 },
      cranberry: { mode: 'locked', grams: 76 },
    });
    expect(line(result.input, 'strawberry').planned_grams).toBe(100);
  });

  it('never mutates the draft it was given', () => {
    const locked = withCustomerGramLocks(ownerFruitRecipe(), { strawberry: 100 });
    const before = JSON.stringify(locked);
    applied(locked.input, locked.constraints, [
      { lineId: 'strawberry', grams: 60, locked: false },
      { lineId: 'cranberry', grams: 20, locked: true },
    ]);
    expect(JSON.stringify(locked)).toBe(before);
  });

  it.each([
    [
      'a duplicate line',
      [
        { lineId: 'milk', grams: 1, locked: false },
        { lineId: 'milk', grams: 2, locked: false },
      ],
      'duplicate_line',
    ],
    ['an unknown line', [{ lineId: 'ghost', grams: 1, locked: false }], 'line_missing'],
    ['0 g', [{ lineId: 'milk', grams: 0, locked: false }], 'invalid_grams'],
    ['a fractional amount', [{ lineId: 'milk', grams: 1.5, locked: true }], 'invalid_grams'],
  ] as const)('refuses %s instead of guessing', (_name, instructions, reason) => {
    const result = applyPreviewInstructions(ownerFruitRecipe(), { byLineId: {} }, instructions);
    expect(result).toMatchObject({ ok: false, reason });
  });

  it('poured material and engine-held lines are not the customer’s to change here', () => {
    const input = ownerFruitRecipe();
    const poured: RecipeInput = {
      ...input,
      items: input.items.map((item) =>
        item.id === 'milk' ? { ...item, actual_grams: item.planned_grams } : item,
      ),
    };
    expect(isPreviewEditableLine(line(poured, 'milk'))).toBe(false);
    expect(
      applyPreviewInstructions(poured, { byLineId: {} }, [
        { lineId: 'milk', grams: 10, locked: false },
      ]),
    ).toMatchObject({ ok: false, reason: 'physical_actual' });
    const required: RecipeInput = {
      ...input,
      items: input.items.map((item) =>
        item.id === 'tara' ? { ...item, lock_type: 'required' as const } : item,
      ),
    };
    expect(isPreviewEditableLine(line(required, 'tara'))).toBe(false);
    expect(
      applyPreviewInstructions(required, { byLineId: {} }, [
        { lineId: 'tara', grams: 3, locked: true },
      ]),
    ).toMatchObject({ ok: false, reason: 'engine_held_line' });
  });

  it('recognises the customer’s own quantity locks (padlock or inherited grams lock)', () => {
    const locked = withCustomerGramLocks(ownerFruitRecipe(), { strawberry: 100 });
    expect(hasCustomerQuantityLock(line(locked.input, 'strawberry'), locked.constraints)).toBe(
      true,
    );
    expect(hasCustomerQuantityLock(line(locked.input, 'cranberry'), locked.constraints)).toBe(
      false,
    );
    // The Crown is a role, not a quantity lock.
    expect(hasCustomerQuantityLock(line(locked.input, 'watermelon'), locked.constraints)).toBe(
      false,
    );
  });

  it('merges a new round of edits: the latest per line wins and moves to the end', () => {
    const merged = mergePreviewInstructions(
      [
        { lineId: 'strawberry', grams: 90, locked: false },
        { lineId: 'cranberry', grams: 20, locked: true },
      ],
      [{ lineId: 'strawberry', grams: 80, locked: true }],
    );
    expect(merged).toEqual([
      { lineId: 'cranberry', grams: 20, locked: true },
      { lineId: 'strawberry', grams: 80, locked: true },
    ]);
    expect(samePreviewInstructions(merged, [...merged])).toBe(true);
  });
});

describe('PACKAGE 2A (owner OD-1) — HOME’s solver bootstrap, never a customer edit', () => {
  const zeroGramMain = () => {
    const base = ownerFruitRecipe();
    const main = base.items.find((item) => item.lock_type === 'main')!;
    const input: RecipeInput = {
      ...base,
      items: base.items.map((item) => (item.id === main.id ? { ...item, planned_grams: 0 } : item)),
    };
    return { input, mainId: main.id };
  };
  const none: ConstraintSet = { byLineId: {} };

  it('puts a 0 g priority line on the copy at 1 g, marked as the Crown bootstrap, with no intent', () => {
    const { input, mainId } = zeroGramMain();
    const result = applyPreviewInstructions(input, none, [
      { lineId: mainId, grams: 1, locked: false, bootstrap: true },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const copy = result.input.items.find((item) => item.id === mainId)!;
    expect(copy).toMatchObject({
      planned_grams: 1,
      lock_type: 'main',
      amount_provenance: 'AUTO_CROWN_SEED',
    });
    expect(copy.user_intent_anchor_grams).toBeUndefined();
    expect(copy.user_target_grams).toBeUndefined();
    // Pure: the recipe it was given still holds 0 g.
    expect(input.items.find((item) => item.id === mainId)!.planned_grams).toBe(0);
  });

  it('refuses anything but a 0 g priority line at the 1 g bootstrap', () => {
    const { input, mainId } = zeroGramMain();
    const ordinary = input.items.find(
      (item) => item.lock_type !== 'main' && item.actual_grams === null,
    )!;
    const refused = (instruction: Parameters<typeof applyPreviewInstructions>[2][number]) =>
      applyPreviewInstructions(input, none, [instruction]);
    expect(
      refused({ lineId: ordinary.id, grams: 1, locked: false, bootstrap: true }),
    ).toMatchObject({
      ok: false,
      reason: 'invalid_bootstrap',
    });
    expect(refused({ lineId: mainId, grams: 5, locked: false, bootstrap: true })).toMatchObject({
      ok: false,
      reason: 'invalid_bootstrap',
    });
    expect(refused({ lineId: mainId, grams: 1, locked: true, bootstrap: true })).toMatchObject({
      ok: false,
      reason: 'invalid_bootstrap',
    });
    const sized = ownerFruitRecipe();
    const positiveMain = sized.items.find((item) => item.lock_type === 'main')!;
    expect(
      applyPreviewInstructions(sized, none, [
        { lineId: positiveMain.id, grams: 1, locked: false, bootstrap: true },
      ]),
    ).toMatchObject({ ok: false, reason: 'invalid_bootstrap' });
  });
});
