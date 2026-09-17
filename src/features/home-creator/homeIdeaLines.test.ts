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
/** A starter line still carries its toolbox id; the chip carries the Mapper id. */
const toolboxLine = (id: string) => ({ ingredient: { id } });

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

  it('KIWI-03: a product used only as a TOPPING does not answer a request for the base', () => {
    const kiwi = chip('kiwi', 'PI-ING-000366');
    // The customer's §58 answer says „Główny”: the topping line is not that use.
    expect(
      ideaProductsMissingFromRecipe([kiwi], [], [line('PI-ING-000366')], {
        kiwi: 'ingredient',
      }).map((entry) => entry.id),
    ).toEqual(['kiwi']);
    // And once the base line exists, nothing is missing any more.
    expect(
      ideaProductsMissingFromRecipe([kiwi], [line('PI-ING-000366')], [line('PI-ING-000366')], {
        kiwi: 'ingredient',
      }),
    ).toEqual([]);
  });

  it('KIWI-04: an explicit topping is missing while the product is only in the base', () => {
    const kiwiTopping = chip('kiwi', 'PI-ING-000366', { role: 'topping' });
    expect(
      ideaProductsMissingFromRecipe([kiwiTopping], [line('PI-ING-000366')], []).map(
        (entry) => entry.id,
      ),
    ).toEqual(['kiwi']);
    expect(
      ideaProductsMissingFromRecipe(
        [kiwiTopping],
        [line('PI-ING-000366')],
        [line('PI-ING-000366')],
      ),
    ).toEqual([]);
  });

  it('KIWI-05: with no stated role either collection still counts — the resolver decides', () => {
    const plain = chip('nibs', 'PI-ING-000999');
    expect(ideaProductsMissingFromRecipe([plain], [], [line('PI-ING-000999')])).toEqual([]);
    expect(ideaProductsMissingFromRecipe([plain], [line('PI-ING-000999')], [])).toEqual([]);
  });

  it('KIWI-06: the §58 answer outranks the word in the chip', () => {
    const saidTopping = chip('kiwi', 'PI-ING-000366', { role: 'topping' });
    // Answered „Główny” afterwards: the base is now the use that must exist.
    expect(
      ideaProductsMissingFromRecipe([saidTopping], [], [line('PI-ING-000366')], {
        kiwi: 'ingredient',
      }).map((entry) => entry.id),
    ).toEqual(['kiwi']);
  });

  it('KIWI-10: a line that carries its toolbox id is the SAME product as the chip', () => {
    // „milk_3_5” is what a HOME starter line holds; the chip resolves to PI-ING-000236.
    expect(
      ideaProductsMissingFromRecipe(
        [chip('mleko', 'PI-ING-000236')],
        [toolboxLine('milk_3_5')],
        [],
      ),
    ).toEqual([]);
    // And the same through the persisted canonical id.
    expect(
      ideaProductsMissingFromRecipe(
        [chip('mleko', 'PI-ING-000236')],
        [{ ingredient: { id: 'legacy-row', canonical_ingredient_id: 'PI-ING-000236' } }],
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

describe('KIWI-09 — the draft keeps two deliberate uses of one product', () => {
  it('keeps a second chip when the role differs, and still collapses a plain repetition', async () => {
    const { useHomeDraftStore } = await import('./homeDraftStore');
    useHomeDraftStore.getState().startNew();
    const base: IntentChip = {
      id: 'c1',
      label: 'truskawki',
      concept: 'strawberry',
      role: null,
      source: 'text',
      productId: 'PI-ING-001553',
      productName: 'STRAWBERRIES',
      ambiguous: false,
    };
    useHomeDraftStore.getState().addChip(base);
    useHomeDraftStore.getState().addChip({ ...base, id: 'c2' });
    expect(useHomeDraftStore.getState().chips).toHaveLength(1);
    useHomeDraftStore.getState().addChip({ ...base, id: 'c3', role: 'topping' });
    expect(useHomeDraftStore.getState().chips.map((chip) => chip.role)).toEqual([null, 'topping']);
  });
});
