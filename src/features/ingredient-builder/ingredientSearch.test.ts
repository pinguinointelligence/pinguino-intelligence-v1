/**
 * CORE INGREDIENT SEARCH — natural Polish queries (owner P0).
 *
 * Fixtures modelled on the REAL staging Mapper rows (verified on tunab): strawberry pastes carry
 * „TRUSKAWKA" in the DISPLAY name; vanilla pastes carry „wanilia" ONLY in the INTERNAL name
 * (display is Italian „VANIGLIA"); pineapple rows carry „PINEAPPLE" (no „ananas" row is approved,
 * so „ananas" must alias to pineapple). Proves every owner query family resolves.
 */
import { describe, expect, it } from 'vitest';
import type { EngineIngredient } from '@/engine';
import { filterIngredients, type SearchIndex } from './ingredientLibrary';
import { haystackMatchesQuery, normalizeSearchText, stem } from './ingredientSearch';

/** Build a normalized haystack + a matching ingredient/index the way selectIngredientLibrary does. */
const norm = normalizeSearchText;

interface Fixture {
  id: string;
  display: string;
  internal: string;
  category: EngineIngredient['category'];
}

const FIXTURES: Fixture[] = [
  { id: 'PI-ING-000986', display: 'UVA FRAGOLA TRUSKAWKA · Aromitalia Base Mix · 3380', internal: 'base_uva_fragola_truskawka_aromitalia_3380', category: 'fruit' },
  { id: 'PI-ING-000960', display: 'FRAGOLA TRUSKAWKA SORBETTO TOP · Aromitalia Paste · 2867C', internal: 'pasta_fragola_truskawka_sorbetto_aromitalia_2867c', category: 'fruit' },
  { id: 'PI-ING-000500', display: 'STRAWBERRY PUREE · Fabbri · 7788', internal: 'puree_strawberry_fabbri_7788', category: 'fruit' },
  { id: 'PI-ING-001111', display: 'VANIGLIA · Comprital Specialty · PC636PB / 2022', internal: 'vaniglia_pasta_giubileo_wanilia_comprital_pc636pb_2022', category: 'flavor' },
  { id: 'PI-ING-000748', display: 'GOLDEN · PreGel Paste · ST-25822', internal: 'pasta_golden_wanilia_pregel_st_25822', category: 'flavor' },
  { id: 'PI-ING-000400', display: 'VANILLA BEAN PASTE · Nielsen · 4400', internal: 'paste_vanilla_bean_nielsen_4400', category: 'flavor' },
  { id: 'PI-ING-000300', display: 'PINEAPPLE CONCENTRATE · Agrimontana · 3300', internal: 'concentrate_pineapple_agrimontana_3300', category: 'fruit' },
  { id: 'PI-ING-000020', display: 'DARK CHOCOLATE 70% · Domori', internal: 'dark_chocolate_70', category: 'chocolate_cocoa' },
];

const ingredients: EngineIngredient[] = FIXTURES.map((f) => ({
  id: f.id,
  name: f.display,
  category: f.category,
  composition: {
    water_percent: 0, solids_percent: 100, fat_percent: 0, protein_percent: 0,
    carbohydrate_percent: 0, sugar_percent: 0, sucrose_percent: 0, glucose_percent: 0,
    dextrose_percent: 0, fructose_percent: 0, lactose_percent: 0, polyol_percent: 0,
    fiber_percent: 0, salt_percent: 0, alcohol_percent: 0, kcal_per_100g: 0,
  },
  pod_value: null, pac_value: null, npac_value: null, de_value: null,
  cost_per_kg: 1, confidence_score: 80, source_type: 'manual', is_verified: true,
}));

const index: SearchIndex = new Map(
  FIXTURES.map((f) => [f.id, norm([f.display, f.internal, f.id, f.category].join(' '))]),
);

const run = (q: string) => filterIngredients(ingredients, q, index).map((i) => i.id);

describe('normalization primitives', () => {
  it('strips Polish diacritics and unifies punctuation', () => {
    expect(normalizeSearchText('Świeże truskawki, 50%')).toBe('swieze truskawki 50');
    expect(normalizeSearchText('FRAGOLA·TRUSKAWKA_TOP')).toBe('fragola truskawka top');
    expect(normalizeSearchText('żółć ł')).toBe('zolc l');
  });
  it('stems Polish inflection to a shared root', () => {
    expect(stem('truskawki')).toBe('truskawk');
    expect(stem('truskawka')).toBe('truskawk');
    expect(stem('wanilii')).toBe('wanili');
    expect(stem('ananasa')).toBe('ananas');
  });
});

describe('strawberry family (truskawka)', () => {
  it.each(['truskawka', 'truskawki', 'truskawek', 'świeże truskawki', 'świeżych truskawek', 'truskawkowy'])(
    'query "%s" returns the real strawberry rows',
    (q) => {
      const ids = run(q);
      expect(ids).toContain('PI-ING-000986'); // FRAGOLA TRUSKAWKA (display)
      expect(ids).toContain('PI-ING-000960');
      expect(ids).toContain('PI-ING-000500'); // STRAWBERRY PUREE (alias EN)
    },
  );
  it('English "strawberry" and Italian "fragola" also resolve', () => {
    expect(run('strawberry')).toContain('PI-ING-000500');
    expect(run('fragola')).toContain('PI-ING-000986');
  });
});

describe('vanilla family (wanilia — Polish only in the internal name)', () => {
  it.each(['wanilia', 'wanilii', 'waniliowy', 'vanilla'])('query "%s" returns the real vanilla rows', (q) => {
    const ids = run(q);
    expect(ids).toContain('PI-ING-001111'); // VANIGLIA display / wanilia internal
    expect(ids).toContain('PI-ING-000748'); // GOLDEN display / wanilia internal
    expect(ids).toContain('PI-ING-000400'); // VANILLA BEAN (alias EN)
  });
});

describe('pineapple family (ananas → pineapple alias; no approved ananas row)', () => {
  it.each(['ananas', 'ananasa', 'ananasowy', 'pineapple'])('query "%s" returns the pineapple row', (q) => {
    expect(run(q)).toContain('PI-ING-000300');
  });
});

describe('precision + regression', () => {
  it('exact PI-ING id resolves to exactly that row', () => {
    expect(run('PI-ING-000748')).toEqual(['PI-ING-000748']);
    expect(run('pi-ing-000300')).toEqual(['PI-ING-000300']); // case + diacritic-insensitive
  });
  it('an unrelated query does not return strawberry/vanilla/pineapple', () => {
    const ids = run('czekolada');
    expect(ids).toContain('PI-ING-000020'); // chocolate via alias
    expect(ids).not.toContain('PI-ING-000986');
    expect(ids).not.toContain('PI-ING-000300');
  });
  it('never returns duplicates', () => {
    const ids = run('truskawki');
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('an all-stopword query keeps the full list (never hides everything)', () => {
    expect(run('świeże').length).toBe(FIXTURES.length);
  });
  it('a truly-absent ingredient returns nothing (honest empty)', () => {
    expect(run('szpinak')).toEqual([]);
  });
  it('haystackMatchesQuery is pure and substring-anchored', () => {
    expect(haystackMatchesQuery(norm('pasta_golden_wanilia_pregel'), 'wanilii')).toBe(true);
    expect(haystackMatchesQuery(norm('dark chocolate 70'), 'truskawka')).toBe(false);
  });
});
