/**
 * FRESH / NATURAL FORM RANKING (owner P0). Fixtures modelled on the REAL staging pineapple/banana
 * rows (verified on tunab): the Fresh Fruit row must outrank branded pastes and beverages, and a
 * query must not surface an unrelated row that only matched on an id/SKU fragment.
 */
import { describe, expect, it } from 'vitest';
import type { EngineIngredient } from '@/engine';
import { formLabelPl, formRank, normalizeSearchText, rankIngredients } from './ingredientSearch';

interface Row {
  id: string;
  name: string;
  internal: string;
  form: string;
}

const ROWS: Row[] = [
  { id: 'PI-ING-001889', name: 'FANTA PINEAPPLE · Beverage', internal: 'fanta_pineapple', form: 'fruit_soda' },
  { id: 'PI-ING-000726', name: 'FORTEFRUTTO PINEAPPLE N · PreGel Paste · ST-45272', internal: 'fortefrutto_pineapple_n_pregel', form: 'fruit_flavor_paste' },
  { id: 'PI-ING-000390', name: 'PINEAPPLE · Fresh Fruit', internal: 'pineapple', form: 'fresh_fruit_profile' },
  { id: 'PI-ING-000389', name: 'PINEAPPLE · Puree · Frozen/Chilled', internal: 'pineapple_puree', form: 'fruit_puree' },
  { id: 'PI-ING-000345', name: 'BANANA · Fresh Fruit', internal: 'banana', form: 'fresh_fruit_profile' },
  // An unrelated row whose SKU fragment contains „ban" — must NOT top a „banana" query.
  { id: 'PI-ING-000900', name: 'WHITE CHOCOLATE · Callebaix · W2BANX', internal: 'white_chocolate_callebaix_w2banx', form: 'flavored_ice_cream_paste' },
];

const ingredients: EngineIngredient[] = ROWS.map((r) => ({ id: r.id, name: r.name } as unknown as EngineIngredient));
const nameIndex = new Map(ROWS.map((r) => [r.id, normalizeSearchText(`${r.name} ${r.internal}`)]));
const formIndex = new Map(ROWS.map((r) => [r.id, r.form]));
const meta = { nameIndex, formIndex };

const rankIds = (q: string) => rankIngredients(ingredients, q, meta).map((i) => i.id);

describe('form rank + label', () => {
  it('orders forms fresh → frozen → puree → concentrate → paste → powder → aroma → beverage', () => {
    expect(formRank('fresh_fruit_profile')).toBeLessThan(formRank('fruit_puree'));
    expect(formRank('fruit_puree')).toBeLessThan(formRank('fruit_flavor_paste'));
    expect(formRank('fruit_flavor_paste')).toBeLessThan(formRank('fruit_soda'));
    expect(formLabelPl('fresh_fruit_profile')).toBe('Świeży owoc');
    expect(formLabelPl('fruit_puree')).toBe('Przecier');
    expect(formLabelPl('fruit_soda')).toBe('Napój');
  });
});

describe('pineapple ranking (owner example)', () => {
  const ids = rankIds('pineapple');
  it('ranks „PINEAPPLE · Fresh Fruit" FIRST — before pastes and beverages', () => {
    expect(ids[0]).toBe('PI-ING-000390'); // Fresh Fruit
    expect(ids.indexOf('PI-ING-000390')).toBeLessThan(ids.indexOf('PI-ING-000389')); // < puree
    expect(ids.indexOf('PI-ING-000389')).toBeLessThan(ids.indexOf('PI-ING-000726')); // puree < paste
    expect(ids.indexOf('PI-ING-000726')).toBeLessThan(ids.indexOf('PI-ING-001889')); // paste < beverage
  });
});

describe('SKU / id substring matches never top a semantic query (owner: „BAN" in white chocolate)', () => {
  it('„banana" ranks BANANA · Fresh Fruit first; the white-chocolate SKU match sinks below every name match', () => {
    const ids = rankIds('banana');
    expect(ids[0]).toBe('PI-ING-000345'); // BANANA Fresh Fruit (semantic name match) is the top result
    // The white chocolate matched only on the SKU fragment „ban" (name has no „banana") → it ranks
    // strictly AFTER the semantic name match, so it can never be the top / an unrelated first result.
    expect(ids.indexOf('PI-ING-000345')).toBeLessThan(ids.indexOf('PI-ING-000900'));
    expect(ids.indexOf('PI-ING-000900')).toBeGreaterThan(0);
  });
});

describe('empty query keeps the incoming order', () => {
  it('does not reorder when there is no query', () => {
    expect(rankIds('')).toEqual(ROWS.map((r) => r.id));
  });
});
