/**
 * LIVE server-search ranking (owner P0). Fixtures are the REAL staging rows
 * (ids + names + categories + subcategories verified on tunab). Proves the
 * ordinary-basics contract: canonical milk before milk chocolate / coconut /
 * base mixes; Fresh Fruit before pastes/beverages; SKU never tops semantics.
 */
import { describe, expect, it } from 'vitest';
import type { IngredientSearchRow } from '@/services/ingredients';
import { buildSearchTermGroups, conceptCategoriesFor, nameMatchQuality, normalizeSearchText, rankSearchHits } from './ingredientSearch';
import { toSearchHit } from './useIngredientSearch';

const row = (
  id: string,
  display: string,
  internal: string,
  category: string,
  sub: string,
): IngredientSearchRow => ({
  ingredient_id: id,
  ingredient_name_display: display,
  ingredient_name_internal: internal,
  brand: null,
  ingredient_category: category,
  ingredient_subcategory: sub,
});

/* REAL staging rows (verified via direct DB proof). */
const MILK_ROWS = [
  row('PI-ING-000236', 'MILK 3.5% · Milk · Chilled', 'milk_3_5_chilled', 'dairy', 'milk'),
  row('PI-ING-000296', 'WHOLE MILK · Milk', 'whole_milk', 'dairy', 'milk'),
  row('PI-ING-000270', 'SKIMMED MILK · Milk', 'skimmed_milk_powder', 'dairy', 'skimmed_milk_powder'),
  row('PI-ING-000177', 'BUTTERMILK · Milk · Chilled', 'buttermilk_chilled', 'dairy', 'buttermilk'),
  row('PI-ING-000171', 'CONDENSED MILK 7.5% · Milk · Chilled', 'condensed_milk_7_5', 'dairy', 'condensed_milk'),
  row('PI-ING-000149', 'COCONUT MILK · Coconut · Dry', 'coconut_milk_dry', 'coconut', 'coconut_milk'),
  row('PI-ING-000119', 'MILK CHOCOLATE 33.6% · Callebaut Couverture · Dry', 'milk_chocolate_callebaut', 'chocolate', 'couverture'),
  row('PI-ING-000073', 'MILK 30 · Gourmego Base Mix · 40120 / 40130', 'milk_30_gourmego', 'base_mix', 'powdered_ice_cream_base'),
  row('PI-ING-000322', 'MILK STRAWBERRY KAMES · MEC3 Paste · 18047A', 'milk_strawberry_kames', 'flavor_paste', 'flavored_ice_cream_paste'),
];

const PINEAPPLE_ROWS = [
  row('PI-ING-001889', 'FANTA PINEAPPLE · Beverage', 'fanta_pineapple', 'beverage', 'fruit_soda'),
  row('PI-ING-000726', 'FORTEFRUTTO PINEAPPLE N · PreGel Paste · ST-45272', 'fortefrutto_pineapple_n', 'fruit', 'fruit_flavor_paste'),
  row('PI-ING-000390', 'PINEAPPLE · Fresh Fruit', 'pineapple', 'fruit', 'fresh_fruit_profile'),
  row('PI-ING-000389', 'PINEAPPLE · Puree · Frozen/Chilled', 'pineapple_puree', 'fruit', 'fruit_puree'),
];

const HERB_ROWS = [
  row('PI-ING-001654', 'BASIL · Botanical · Fresh', 'basil_fresh', 'botanical', 'fresh_herb'),
  row('PI-ING-000752', 'MINT GREEN · PreGel Paste · ST-51172', 'mint_green_pregel', 'flavor_paste', 'flavored_ice_cream_paste'),
  row('PI-ING-001561', 'MINT · Botanical · Fresh', 'mint_fresh', 'botanical', 'fresh_herb'),
];

const rank = (rows: IngredientSearchRow[], q: string) =>
  rankSearchHits(rows.map(toSearchHit), q).map((h) => h.id);

describe('term-group builder (the server filter contract)', () => {
  it('expands aliases per token and stays PostgREST-safe [a-z0-9]', () => {
    const groups = buildSearchTermGroups('świeże truskawki');
    expect(groups.length).toBe(1); // „świeże" is a stopword
    expect(groups[0]).toEqual(expect.arrayContaining(['truskaw', 'straw', 'fragol']));
    for (const term of groups.flat()) expect(term).toMatch(/^[a-z0-9]+$/);
  });
  it('mleko expands to the milk family; empty query yields no groups', () => {
    expect(buildSearchTermGroups('mleko')[0]).toEqual(expect.arrayContaining(['mlek', 'milk', 'latte']));
    expect(buildSearchTermGroups('   ')).toEqual([]);
  });
});

describe('concept categories', () => {
  it('milk/mleko → dairy; pineapple/ananas → fruit; basil → botanical; unknown → none', () => {
    expect([...conceptCategoriesFor('milk')]).toEqual(['dairy']);
    expect([...conceptCategoriesFor('mleko')]).toEqual(['dairy']);
    expect([...conceptCategoriesFor('ananas')]).toEqual(['fruit']);
    expect([...conceptCategoriesFor('bazylia')]).toEqual(['botanical']);
    expect(conceptCategoriesFor('xyzzy').size).toBe(0);
  });
});

describe('milk ranking (owner-proven failure)', () => {
  it.each(['milk', 'mleko'])('"%s": canonical dairy milk first; chocolate/coconut/base mixes sink', (q) => {
    const ids = rank(MILK_ROWS, q);
    // canonical plain milk rows lead
    expect(ids.slice(0, 2)).toEqual(expect.arrayContaining(['PI-ING-000236', 'PI-ING-000296']));
    const pos = (id: string) => ids.indexOf(id);
    expect(pos('PI-ING-000236')).toBeLessThan(pos('PI-ING-000177')); // milk < buttermilk
    expect(pos('PI-ING-000177')).toBeLessThan(pos('PI-ING-000119')); // buttermilk < milk chocolate
    expect(pos('PI-ING-000171')).toBeLessThan(pos('PI-ING-000119')); // condensed < milk chocolate
    expect(pos('PI-ING-000236')).toBeLessThan(pos('PI-ING-000149')); // milk < coconut milk
    expect(pos('PI-ING-000236')).toBeLessThan(pos('PI-ING-000073')); // milk < base mix
    expect(pos('PI-ING-000236')).toBeLessThan(pos('PI-ING-000322')); // milk < strawberry paste
  });
  it('"milk 3.5%" and „mleko 3,5%" hit the exact record first', () => {
    expect(rank(MILK_ROWS, 'milk 3.5%')[0]).toBe('PI-ING-000236');
    expect(rank(MILK_ROWS, 'mleko 3,5%')[0]).toBe('PI-ING-000236');
  });
  it('"skimmed milk powder" ranks the powder record first', () => {
    expect(rank(MILK_ROWS, 'skimmed milk powder')[0]).toBe('PI-ING-000270');
  });
});

describe('pineapple ranking (owner-proven failure)', () => {
  it.each(['pineapple', 'ananas', 'piña'])('"%s": PI-ING-000390 Fresh Fruit first', (q) => {
    const ids = rank(PINEAPPLE_ROWS, q);
    expect(ids[0]).toBe('PI-ING-000390');
    expect(ids.indexOf('PI-ING-000389')).toBeLessThan(ids.indexOf('PI-ING-000726')); // puree < paste
    expect(ids.indexOf('PI-ING-000726')).toBeLessThan(ids.indexOf('PI-ING-001889')); // paste < beverage
  });
});

describe('fresh herbs', () => {
  it.each(['basil', 'bazylia'])('"%s" finds BASIL · Botanical · Fresh first', (q) => {
    expect(rank(HERB_ROWS, q)[0]).toBe('PI-ING-001654');
  });
  it.each(['mint', 'mięta'])('"%s" ranks the fresh herb before the paste', (q) => {
    const ids = rank(HERB_ROWS, q);
    expect(ids.indexOf('PI-ING-001561')).toBeLessThan(ids.indexOf('PI-ING-000752'));
  });
});

describe('SKU-only matches never outrank semantic matches', () => {
  it('a row matching only via SKU ranks below every name match', () => {
    const rows = [
      ...PINEAPPLE_ROWS,
      row('PI-ING-000999', 'WHITE CHOCOLATE · Callebaix', 'white_chocolate_pineapplex_code', 'chocolate', 'couverture'),
    ];
    const ids = rank(rows, 'pineapple');
    expect(ids[0]).toBe('PI-ING-000390');
    expect(nameMatchQuality(normalizeSearchText('WHITE CHOCOLATE Callebaix'), 'pineapple')).toBe(4);
  });
});

describe('safe payload', () => {
  it('a search hit exposes only identity/name/category/form — no PAC/POD/composition', () => {
    const hit = toSearchHit(MILK_ROWS[0]!) as unknown as Record<string, unknown>;
    expect(Object.keys(hit).sort()).toEqual(['category', 'form', 'id', 'internal', 'name', 'nameNorm']);
  });
});
