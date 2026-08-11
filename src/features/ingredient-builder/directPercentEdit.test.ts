import { describe, expect, it } from 'vitest';
import { ownerSameInputRecipe } from '@/features/formulation/__fixtures__/ownerSameInputFixture';
import { buildDirectPercentEdit } from './directPercentEdit';

const NONE = { byLineId: {} } as const;

describe('direct percentage editing', () => {
  it('changes the selected share and keeps the batch coherent without moving Tara', () => {
    const input = ownerSameInputRecipe();
    const result = buildDirectPercentEdit(input, NONE, 'owner:milk_3_5', 59.5);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.gramsByLineId['owner:milk_3_5']).toBe(595);
    expect(result.gramsByLineId['owner:tara_gum']).toBe(1.9);
    expect(Object.values(result.gramsByLineId).reduce((sum, grams) => sum + grams, 0)).toBeCloseTo(
      1000,
      10,
    );
  });

  it('scales every Main together and preserves a 2:1 identity ratio', () => {
    const input = ownerSameInputRecipe();
    const milk = input.items.find((item) => item.id === 'owner:milk_3_5')!;
    const cream = input.items.find((item) => item.id === 'owner:cream_30')!;
    milk.lock_type = 'main';
    cream.lock_type = 'main';
    milk.planned_grams = 300;
    cream.planned_grams = 150;
    input.items.find((item) => item.id === 'owner:inulin')!.planned_grams += 285;
    const result = buildDirectPercentEdit(input, NONE, milk.id, 33);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.gramsByLineId[milk.id]).toBe(330);
    expect(result.gramsByLineId[cream.id]).toBe(165);
    expect(result.gramsByLineId[milk.id]! / result.gramsByLineId[cream.id]!).toBe(2);
  });

  it.each([
    { mode: 'locked' as const, grams: 150 },
    { mode: 'percent' as const, percent: 15 },
    { mode: 'range' as const, minGrams: 140, maxGrams: 160 },
  ])('never moves a companion Main protected by a $mode constraint', (companionConstraint) => {
    const input = ownerSameInputRecipe();
    const milk = input.items.find((item) => item.id === 'owner:milk_3_5')!;
    const cream = input.items.find((item) => item.id === 'owner:cream_30')!;
    milk.lock_type = 'main';
    cream.lock_type = 'main';
    milk.planned_grams = 300;
    cream.planned_grams = 150;
    input.items.find((item) => item.id === 'owner:inulin')!.planned_grams += 285;

    expect(
      buildDirectPercentEdit(input, { byLineId: { [cream.id]: companionConstraint } }, milk.id, 33),
    ).toEqual({ ok: false, code: 'protected_line' });
    expect(cream.planned_grams).toBe(150);
  });

  it('fails closed for exact locks, physical lines and stabilizers', () => {
    const input = ownerSameInputRecipe();
    expect(buildDirectPercentEdit(input, NONE, 'owner:tara_gum', 0.3)).toMatchObject({
      ok: false,
      code: 'protected_line',
    });
    expect(
      buildDirectPercentEdit(
        input,
        {
          byLineId: { 'owner:milk_3_5': { mode: 'locked', grams: 600 } },
        },
        'owner:milk_3_5',
        59,
      ),
    ).toMatchObject({ ok: false, code: 'protected_line' });
    input.items.find((item) => item.id === 'owner:milk_3_5')!.actual_grams = 10;
    expect(buildDirectPercentEdit(input, NONE, 'owner:milk_3_5', 59)).toMatchObject({
      ok: false,
      code: 'protected_line',
    });
  });
});
