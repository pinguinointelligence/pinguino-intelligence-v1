/**
 * Owner 2026-09-17 (kiwi): a recognised idea element that reached no line is a defect,
 * not a silent omission.
 */
import { describe, expect, it } from 'vitest';
import type { IntentChip } from './homeDraftStore';
import { ideaProductsMissingFromRecipe } from './homeIdeaLines';

const chip = (
  id: string,
  productId: string | null,
  extra: Partial<IntentChip> = {},
): IntentChip => ({
  id,
  label: id,
  concept: null,
  role: null,
  source: 'text',
  productId,
  productName: productId,
  ambiguous: false,
  ...extra,
});
const line = (id: string) => ({ ingredient: { id } });

describe('KIWI-01 — the idea must be in the recipe', () => {
  it('reports a recognised product the recipe does not contain', () => {
    const missing = ideaProductsMissingFromRecipe(
      [chip('kiwi', 'PI-ING-000366')],
      [line('PI-ING-000236'), line('PI-ING-000180')],
      [],
    );
    expect(missing.map((entry) => entry.productId)).toEqual(['PI-ING-000366']);
  });

  it('reports nothing once the product has a base line', () => {
    expect(
      ideaProductsMissingFromRecipe([chip('kiwi', 'PI-ING-000366')], [line('PI-ING-000366')], []),
    ).toEqual([]);
  });

  it('counts a topping line as the product being present', () => {
    expect(
      ideaProductsMissingFromRecipe([chip('nibs', 'PI-ING-000999')], [], [line('PI-ING-000999')]),
    ).toEqual([]);
  });

  it('never reports a chip that is still a question or has no product yet', () => {
    expect(
      ideaProductsMissingFromRecipe(
        [chip('a', null), chip('b', 'PI-ING-000366', { ambiguous: true })],
        [],
        [],
      ),
    ).toEqual([]);
  });

  it('reports every missing element of a two-ingredient idea', () => {
    const missing = ideaProductsMissingFromRecipe(
      [chip('kiwi', 'PI-ING-000366'), chip('banan', 'PI-ING-000345')],
      [line('PI-ING-000366')],
      [],
    );
    expect(missing.map((entry) => entry.productId)).toEqual(['PI-ING-000345']);
  });
});
