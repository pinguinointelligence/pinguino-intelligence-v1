/**
 * OWNER CORE QUERIES — end-to-end pure proof (AGENT C search finalization).
 *
 * Replays the EXACT live pipeline over REAL staging rows (ids / display names /
 * categories / subcategories verified read-only on tunab, 2026-07-24):
 *   1. server filter — `buildSearchTermGroups` AND-of-OR ilike semantics over
 *      the raw searchable columns (the PostgREST translation itself is pinned
 *      by liveSearchContract.test.ts);
 *   2. client ranking — `rankSearchHits` (concept category → name quality →
 *      natural form → alphabetical);
 *   3. presentation — `groupHitsByForm` + `resultRowTextPl` (Polish groups,
 *      category labels, form labels).
 *
 * Every one of the 12 owner query pairs (PL + EN/trade form) must return
 * sensible, correctly-grouped, correctly-labelled results. Includes the
 * staging-verified alias-gap regressions: „SMP" and „mleko w proszku" matched
 * ZERO rows before the powder/smp alias families (0 rows contain `smp` or
 * `proszk` in any searchable column).
 *
 * Also proves per-record DISCOVERABILITY for the only non-trivial cohort: the
 * 19 active+approved rows whose display/brand carry non-ASCII letters (the
 * remaining 2,051 rows all contain a >=2-char ASCII name token, which reaches
 * them verbatim through the same substring semantics — SQL-verified: 0 rows
 * lack such a token).
 */
import { describe, expect, it } from 'vitest';
import type { IngredientSearchRow } from '@/services/ingredients';
import { buildSearchTermGroups, normalizeSearchText, rankSearchHits } from './ingredientSearch';
import { groupHitsByForm, resultRowTextPl } from './ingredientPresentation';
import { toSearchHit } from './useIngredientSearch';

/* ── server-filter replica (identical semantics to searchEngineApprovedIngredients) ── */

const searchableColumns = (r: IngredientSearchRow): string[] => [
  r.ingredient_name_display,
  r.ingredient_name_internal,
  r.ingredient_id,
  r.brand ?? '',
  r.ingredient_category,
  r.ingredient_subcategory ?? '',
];

/** AND per token-group, OR over (alias term × raw column), case-insensitive
 * substring — exactly the generated `.or(ilike)` filter. Diacritics in the RAW
 * column survive lowercasing (like Postgres ILIKE), so this replica honestly
 * reproduces the diacritic behaviour of the live backend. */
function matchesServerFilter(row: IngredientSearchRow, rawQuery: string): boolean {
  const groups = buildSearchTermGroups(rawQuery);
  if (groups.length === 0) return false;
  const cols = searchableColumns(row).map((c) => c.toLowerCase());
  return groups.every((terms) => terms.some((t) => cols.some((c) => c.includes(t))));
}

const row = (
  id: string,
  display: string,
  internal: string,
  category: string,
  sub: string,
  brand: string | null = null,
): IngredientSearchRow => ({
  ingredient_id: id,
  ingredient_name_display: display,
  ingredient_name_internal: internal,
  brand,
  ingredient_category: category,
  ingredient_subcategory: sub,
});

/* ── REAL staging rows (verified live 2026-07-24; internal names representative
 *    where not part of the live pull) ─────────────────────────────────────── */

const CATALOGUE: IngredientSearchRow[] = [
  // milk family (95 live hits for milk/mleko)
  row('PI-ING-000236', 'MILK 3.5% · Milk · Chilled', 'milk_3_5_chilled', 'dairy', 'milk'),
  row('PI-ING-000296', 'WHOLE MILK · Milk', 'whole_milk', 'dairy', 'milk'),
  row('PI-ING-000270', 'SKIMMED MILK · Milk', 'skimmed_milk_powder', 'dairy', 'skimmed_milk_powder'),
  row('PI-ING-000177', 'BUTTERMILK · Milk · Chilled', 'buttermilk_chilled', 'dairy', 'buttermilk'),
  row('PI-ING-000149', 'COCONUT MILK · Coconut · Dry', 'coconut_milk_dry', 'coconut', 'coconut_milk'),
  row('PI-ING-000119', 'MILK CHOCOLATE 33.6% · Callebaut Couverture · Dry', 'milk_chocolate_callebaut', 'chocolate', 'couverture'),
  row('PI-ING-000073', 'MILK 30 · Gourmego Base Mix · 40120 / 40130', 'milk_30_gourmego', 'base_mix', 'powdered_ice_cream_base'),
  // SMP family (3 live hits)
  row('PI-ING-000285', 'LACTOSE SKIMMED MILK · Valio Eila PRO Milk', 'lactose_free_skimmed_milk_powder_valio', 'dairy', 'lactose_free_skimmed_milk_powder'),
  // cream family (581 live hits; dairy creams lead)
  row('PI-ING-000260', 'CREAM · Mlekovita Cream', 'cream_mlekovita', 'dairy', 'cream', 'Mlekovita'),
  row('PI-ING-000179', 'CREAM 18% · Piątnica Cream · Chilled · BIO', 'cream_18_percent_bio', 'dairy', 'cream_18_percent', 'Piątnica'),
  row('PI-ING-000184', 'AMARETTO · Fabbri Cream · Chilled · 0004306', 'amaretto_fabbri_cream', 'dairy', 'cream'),
  // sweeteners (sucrose 39 / dextrose 3 live hits)
  row('PI-ING-000514', 'SUCROSE SUGAR · Sweetener · Dry', 'sucrose_sugar', 'sweetener', 'sucrose'),
  row('PI-ING-000515', 'SUGAR CANE · Sweetener · Dry', 'sugar_cane', 'sweetener', 'cane_sugar'),
  row('PI-ING-001876', 'COCA-COLA ZERO SUGAR · Beverage', 'coca_cola_zero_sugar', 'beverage', 'cola_soft_drink'),
  row('PI-ING-000494', 'DEXTROSE · Sweetener · Dry', 'dextrose', 'sweetener', 'dextrose'),
  row('PI-ING-000480', 'NEUTRO S · Giuso Stabilizer · 00003204', 'neutro_s_giuso', 'stabilizer', 'stabilizer_dextrose_mix'),
  // inulin (4 live hits)
  row('PI-ING-000456', 'INULIN · Specialty', 'inulin', 'specialty', 'specialty_component'),
  row('PI-ING-001374', 'FRIMULSION FIB · Tate & Lyle Fiber', 'frimulsion_fib', 'fiber', 'inulin_oligofructose_blend'),
  // stabilizers (49 live hits; tara = 1)
  row('PI-ING-000492', 'TARA GUM · Stabilizer', 'tara_gum', 'stabilizer', 'tara_gum'),
  row('PI-ING-001344', 'AGAR · Stabilizer', 'agar', 'stabilizer', 'agar'),
  row('PI-ING-000467', 'FRI STAB LN2 · Tate & Lyle Stabilizer', 'fri_stab_ln2', 'stabilizer', 'stabilizer_blend'),
  // pineapple family (13 live hits; no „ananas" row exists — alias only)
  row('PI-ING-000390', 'PINEAPPLE · Fresh Fruit', 'pineapple', 'fruit', 'fresh_fruit_profile'),
  row('PI-ING-000389', 'PINEAPPLE · Puree · Frozen/Chilled', 'pineapple_puree', 'fruit', 'fruit_puree'),
  row('PI-ING-000726', 'FORTEFRUTTO PINEAPPLE N · PreGel Paste · ST-45272', 'fortefrutto_pineapple_n', 'fruit', 'fruit_flavor_paste'),
  row('PI-ING-001889', 'FANTA PINEAPPLE · Beverage', 'fanta_pineapple', 'beverage', 'fruit_soda'),
  // strawberry family (48 live hits)
  row('PI-ING-001553', 'STRAWBERRIES · Fresh Fruit', 'strawberries', 'fruit', 'fresh_fruit_profile'),
  row('PI-ING-001554', 'STRAWBERRIES · Frozen Fruit', 'frozen_strawberries', 'fruit', 'frozen_fruit_profile'),
  row('PI-ING-001435', 'STRAWBERRY PUR KERRY · Ravifruit Puree · Frozen · 20374231', 'puree_strawberry_pur_kerry_ravifruit_20374231', 'fruit', 'sweetened_fruit_puree'),
  row('PI-ING-000960', 'FRAGOLA TRUSKAWKA SORBETTO TOP · Aromitalia Paste · 2867C', 'pasta_fragola_truskawka_per_sorbetto_top_aromitalia_2867c', 'flavor_paste', 'flavored_ice_cream_paste'),
  row('PI-ING-000986', 'UVA FRAGOLA TRUSKAWKA · Aromitalia Base Mix · 3380', 'pronto_uva_fragola_truskawka_aromitalia_3380', 'base_mix', 'powdered_ice_cream_mix'),
  // banana family (11 live hits)
  row('PI-ING-000345', 'BANANA · Fresh Fruit', 'banana', 'fruit', 'fresh_fruit_profile'),
  row('PI-ING-001589', 'BANANA · Puree', 'banana_puree', 'fruit', 'fruit_puree'),
  row('PI-ING-001707', 'BANANA · Backaldrin Paste · 873099', 'banana_backaldrin_paste', 'flavor_paste', 'banana_paste'),
  // basil (1 live hit)
  row('PI-ING-001654', 'BASIL · Botanical · Fresh', 'basil_fresh', 'botanical', 'fresh_herb'),
  // vanilla family (44 live hits; Polish only in internal names)
  row('PI-ING-001111', 'VANIGLIA · Comprital Specialty · PC636PB / 2022', 'vaniglia_pasta_giubileo_wanilia_comprital_pc636pb_2022', 'flavor_paste', 'flavored_ice_cream_paste'),
  row('PI-ING-000748', 'GOLDEN · PreGel Paste · ST-25822', 'pasta_golden_wanilia_pregel_st_25822', 'flavor_paste', 'flavored_ice_cream_paste'),
  row('PI-ING-001874', 'COCA-COLA VANILLA · Beverage', 'coca_cola_vanilla', 'beverage', 'cola_soft_drink'),
];

/** Full pipeline: server filter → ranking → hits. */
const search = (rawQuery: string) =>
  rankSearchHits(CATALOGUE.filter((r) => matchesServerFilter(r, rawQuery)).map(toSearchHit), rawQuery);

const ids = (rawQuery: string) => search(rawQuery).map((h) => h.id);
const groupHeadings = (rawQuery: string) => groupHitsByForm(search(rawQuery)).map((g) => g.headingPl);

describe('stable PI-ING-* identity on every result row', () => {
  it.each(['milk', 'śmietana', 'truskawka', 'wanilia'])('every "%s" hit carries its stable Mapper id', (q) => {
    const hits = search(q);
    expect(hits.length).toBeGreaterThan(0);
    for (const hit of hits) expect(hit.id).toMatch(/^PI-ING-\d{6}$/);
  });
});

describe('1+2. milk / mleko', () => {
  it.each(['milk', 'mleko'])('"%s": canonical dairy milk first; groups render in the fixed order', (q) => {
    expect(ids(q).slice(0, 2)).toEqual(expect.arrayContaining(['PI-ING-000236', 'PI-ING-000296']));
    expect(groupHeadings(q)).toEqual(['Świeże', 'Płynne i napoje', 'Proszki i suche', 'Inne']);
    expect(resultRowTextPl(search(q)[0]!)).toBe('MILK 3.5% · Nabiał · Świeże');
  });
});

describe('3+4. cream / śmietana', () => {
  it.each(['cream', 'śmietana'])('"%s": chilled dairy creams lead and read „Świeże" — never „Inne"', (q) => {
    const hits = search(q);
    // one of the two plain creams leads (exact-prefix name matches; equal rank keys)
    expect(['PI-ING-000260', 'PI-ING-000179']).toContain(hits[0]!.id);
    expect(resultRowTextPl(hits.find((h) => h.id === 'PI-ING-000260')!)).toBe('CREAM · Nabiał · Świeże');
    // CREAM 18% (subcategory cream_18_percent — live census) is fresh dairy too
    expect(resultRowTextPl(hits.find((h) => h.id === 'PI-ING-000179')!)).toBe('CREAM 18% · Nabiał · Świeże');
    // ice-cream pastes/mixes matched via their `*_ice_cream_*` forms sink below the dairy creams
    expect(ids(q).indexOf('PI-ING-000260')).toBeLessThan(ids(q).indexOf('PI-ING-000960'));
    expect(groupHeadings(q)[0]).toBe('Świeże');
  });
});

describe('5+6. SMP / mleko w proszku (staging-proven alias gaps — both were 0 hits)', () => {
  it('"SMP" reaches the skimmed-milk-powder rows through the trade-abbreviation alias', () => {
    const found = ids('SMP');
    expect(found).toContain('PI-ING-000270'); // SKIMMED MILK
    expect(found).toContain('PI-ING-000285'); // LACTOSE SKIMMED MILK (Valio)
    expect(groupHeadings('SMP')).toEqual(['Proszki i suche']);
    expect(resultRowTextPl(search('SMP')[0]!).endsWith('Nabiał · Proszek')).toBe(true);
  });
  it('"mleko w proszku" reaches ONLY powder-form milk (AND semantics keep chilled milk out)', () => {
    const found = ids('mleko w proszku');
    expect(found).toContain('PI-ING-000270'); // SKIMMED MILK · skimmed_milk_powder
    expect(found).toContain('PI-ING-000073'); // MILK 30 base-mix powder
    expect(found).not.toContain('PI-ING-000236'); // MILK 3.5% Chilled has no powder form
    for (const heading of groupHeadings('mleko w proszku')) expect(heading).toBe('Proszki i suche');
  });
  it('regression: without the alias layer the raw Polish tokens match nothing (the proven defect)', () => {
    // raw substring reality on staging: 0 searchable columns contain „proszk" / „smp"
    for (const r of CATALOGUE) {
      const cols = searchableColumns(r).join(' ').toLowerCase();
      expect(cols).not.toContain('proszk');
      expect(cols).not.toContain('smp');
    }
    expect(ids('mleko w proszku').length).toBeGreaterThan(0); // alias layer bridges it
  });
});

describe('7+8. sucrose / sacharoza + dextrose / dekstroza', () => {
  it.each(['sucrose', 'sacharoza'])('"%s": the sweetener rows lead; zero-sugar beverages sink', (q) => {
    expect(ids(q)[0]).toBe('PI-ING-000514'); // SUCROSE SUGAR
    expect(resultRowTextPl(search(q)[0]!)).toBe('SUCROSE SUGAR · Cukry i substancje słodzące · Suche');
    expect(ids(q).indexOf('PI-ING-000514')).toBeLessThan(ids(q).indexOf('PI-ING-001876'));
    // fixed FORM_GROUP_ORDER renders liquid before powder
    expect(groupHeadings(q)).toEqual(['Płynne i napoje', 'Proszki i suche']);
  });
  it.each(['dextrose', 'dekstroza'])('"%s": DEXTROSE first, stabilizer dextrose-mix follows', (q) => {
    expect(ids(q)[0]).toBe('PI-ING-000494');
    expect(resultRowTextPl(search(q)[0]!)).toBe('DEXTROSE · Cukry i substancje słodzące · Suche');
    expect(ids(q)).toContain('PI-ING-000480'); // NEUTRO S stabilizer_dextrose_mix
  });
});

describe('9. inulin / inulina + stabilizer / tara', () => {
  it.each(['inulin', 'inulina'])('"%s": INULIN leads; fiber blends found; honest „Inne" for specialty_component', (q) => {
    expect(ids(q)[0]).toBe('PI-ING-000456'); // INULIN · Specialty
    expect(ids(q)).toContain('PI-ING-001374'); // FRIMULSION FIB inulin blend
    expect(resultRowTextPl(search(q)[0]!)).toBe('INULIN · Specjalne · Inne'); // unmapped vocab → honest Inne
    expect(resultRowTextPl(search(q).find((h) => h.id === 'PI-ING-001374')!)).toBe('FRIMULSION FIB · Błonnik · Suche');
  });
  it('"tara" finds exactly the TARA GUM stabilizer (1 live hit) as a dry stabilizer', () => {
    expect(ids('tara')).toEqual(['PI-ING-000492']);
    expect(resultRowTextPl(search('tara')[0]!)).toBe('TARA GUM · Stabilizatory · Suche');
  });
  it('"stabilizer" reaches the stabilizer catalogue (49 live hits) — blends dry, agar a powder', () => {
    const found = ids('stabilizer');
    expect(found).toEqual(expect.arrayContaining(['PI-ING-000492', 'PI-ING-001344', 'PI-ING-000467', 'PI-ING-000480']));
    expect(resultRowTextPl(search('stabilizer').find((h) => h.id === 'PI-ING-001344')!)).toBe('AGAR · Stabilizatory · Proszek');
    expect(groupHeadings('stabilizer')).toEqual(['Proszki i suche']);
  });
});

describe('10. pineapple / ananas (no „ananas" row exists — pure alias reach)', () => {
  it.each(['pineapple', 'ananas', 'ananasa', 'świeży ananas'])('"%s": Fresh Fruit → Puree → Pasty → Napoje', (q) => {
    expect(ids(q)[0]).toBe('PI-ING-000390');
    expect(groupHeadings(q)).toEqual(['Świeże', 'Puree i przeciery', 'Pasty', 'Płynne i napoje']);
    expect(resultRowTextPl(search(q)[0]!)).toBe('PINEAPPLE · Owoce · Świeże');
  });
});

describe('11. strawberry / truskawka + banana / banan + basil / bazylia', () => {
  it.each(['truskawka', 'truskawki', 'świeże truskawki'])('"%s": fresh strawberries first; Polish display rows found', (q) => {
    expect(ids(q)[0]).toBe('PI-ING-001553'); // STRAWBERRIES · Fresh Fruit
    expect(ids(q)).toEqual(
      expect.arrayContaining(['PI-ING-001554', 'PI-ING-001435', 'PI-ING-000960', 'PI-ING-000986']),
    );
    expect(groupHeadings(q)).toEqual(['Świeże', 'Mrożone', 'Puree i przeciery', 'Pasty', 'Proszki i suche']);
    expect(resultRowTextPl(search(q)[0]!)).toBe('STRAWBERRIES · Owoce · Świeże');
  });
  it('"strawberry": exact-prefix match may lead (baseline quality rule), fresh still beats frozen, groups identical', () => {
    const found = ids('strawberry');
    // STRAWBERRY PUR KERRY starts with the FULL query → quality-0 exact-prefix leads by design
    expect(found[0]).toBe('PI-ING-001435');
    expect(found.indexOf('PI-ING-001553')).toBeLessThan(found.indexOf('PI-ING-001554')); // fresh < frozen
    expect(found).toEqual(expect.arrayContaining(['PI-ING-000960', 'PI-ING-000986']));
    expect(groupHeadings('strawberry')).toEqual(['Świeże', 'Mrożone', 'Puree i przeciery', 'Pasty', 'Proszki i suche']);
  });
  it.each(['banana', 'banan', 'banany'])('"%s": BANANA Fresh Fruit → Puree → Pasty', (q) => {
    expect(ids(q)[0]).toBe('PI-ING-000345');
    expect(groupHeadings(q)).toEqual(['Świeże', 'Puree i przeciery', 'Pasty']);
  });
  it.each(['basil', 'bazylia'])('"%s": the fresh herb renders as BASIL · Zioła · Świeże', (q) => {
    expect(ids(q)).toEqual(['PI-ING-001654']);
    expect(resultRowTextPl(search(q)[0]!)).toBe('BASIL · Zioła · Świeże');
    expect(groupHeadings(q)).toEqual(['Świeże']);
  });
});

describe('12. vanilla / wanilia (Polish only inside internal names)', () => {
  it.each(['vanilla', 'wanilia', 'wanilii'])('"%s": VANIGLIA + GOLDEN (internal-name Polish) found; pastes before beverages', (q) => {
    const found = ids(q);
    expect(found).toEqual(expect.arrayContaining(['PI-ING-001111', 'PI-ING-000748', 'PI-ING-001874']));
    expect(found[0]).toBe('PI-ING-001111'); // VANIGLIA — name-leading match
    expect(found.indexOf('PI-ING-000748')).toBeLessThan(found.indexOf('PI-ING-001874')); // paste < beverage
    expect(groupHeadings(q)).toEqual(['Pasty', 'Płynne i napoje']);
  });
});

/* ── discoverability: the 19 real non-ASCII rows (full live cohort) ───────── */

const DIACRITIC_ROWS: IngredientSearchRow[] = [
  row('PI-ING-000179', 'CREAM 18% · Piątnica Cream · Chilled · BIO', 'cream_18_percent_bio', 'dairy', 'cream', 'Piątnica'),
  row('PI-ING-001395', 'SKYR ICELANDIC YOGHURT · Piątnica Yogurt · Chilled', 'skyr_icelandic_yoghurt', 'dairy', 'skyr_yoghurt', 'Piątnica'),
  row('PI-ING-001396', 'FATTY COTTAGE CHEESE FAT 8% · Piątnica Dairy · Chilled', 'fatty_cottage_cheese_8_percent_fat', 'dairy', 'fatty_cottage_cheese_8_percent', 'Piątnica'),
  row('PI-ING-001462', 'ROSE PETALS RÓŻA · Polska Róża Botanical', 'rose_petals_in_sugar_polska_r_a', 'botanical', 'rose_petals_in_sugar', 'Polska Róża'),
  row('PI-ING-001614', 'JÄGERMEISTER · Herbal Liqueur · 35% Vol', 'jagermeister', 'alcohol', 'herbal_liqueur', 'Jägermeister'),
  row('PI-ING-001748', 'BACARDÍ SUPERIOR · White Rum · 40% Vol', 'bacardi_rum_superior_40_percent', 'alcohol', 'rum', 'Bacardí'),
  row('PI-ING-001749', 'BACARDÍ GOLD · Rum · 40% Vol', 'bacardi_rum_gold_40_percent', 'alcohol', 'rum', 'Bacardí'),
  row('PI-ING-001750', 'BACARDÍ BLACK · Dark Rum · 40% Vol', 'bacardi_rum_premium_black_40_percent', 'alcohol', 'rum', 'Bacardí'),
  row('PI-ING-001751', 'BACARDÍ COCO · Coconut Rum · 35% Vol', 'bacardi_coco_35_percent', 'alcohol', 'flavoured_rum', 'Bacardí'),
  row('PI-ING-001752', 'BACARDÍ SPICED · Spiced Rum · 35% Vol', 'bacardi_spiced_35_percent', 'alcohol', 'spiced_rum', 'Bacardí'),
  row('PI-ING-001753', 'BACARDÍ LIMÓN · Citrus Rum · 35% Vol', 'bacardi_limon_35_percent', 'alcohol', 'flavoured_rum', 'Bacardí'),
  row('PI-ING-001754', 'BACARDÍ RASPBERRY · Raspberry Rum · 35% Vol', 'bacardi_raspberry_35_percent', 'alcohol', 'flavoured_rum', 'Bacardí'),
  row('PI-ING-001755', 'BACARDÍ LIME · Lime Rum · 35% Vol', 'bacardi_lime_35_percent', 'alcohol', 'flavoured_rum', 'Bacardí'),
  row('PI-ING-001756', 'BACARDÍ TROPICAL · Tropical Rum · 35% Vol', 'bacardi_tropical_35_percent', 'alcohol', 'flavoured_rum', 'Bacardí'),
  row('PI-ING-001757', 'BACARDÍ MANGO CHILE · Mango Chile Rum · 35% Vol', 'bacardi_mango_chile_35_percent', 'alcohol', 'flavoured_rum', 'Bacardí'),
  row('PI-ING-001761', 'PATRÓN SILVER · 100% Agave Tequila · 40% Vol', 'patron_silver_tequila_40_percent', 'alcohol', 'tequila', 'Patrón'),
  row('PI-ING-001762', 'KAHLÚA ORIGINAL · Coffee Liqueur · 16% Vol', 'kahlua_original_coffee_liqueur_16_percent', 'alcohol', 'coffee_liqueur', 'Kahlúa'),
  row('PI-ING-001779', 'BÉNÉDICTINE D.O.M. · Herbal Liqueur · 40% Vol', 'benedictine_dom_liqueur_40_percent', 'alcohol', 'herbal_liqueur', 'Bénédictine'),
  row('PI-ING-001780', 'B&B BÉNÉDICTINE · Brandy Herbal Liqueur · 40% Vol', 'benedictine_b_and_b_40_percent', 'alcohol', 'herbal_liqueur', 'Bénédictine'),
];

/** Natural name tokens: what a user would type after seeing/knowing the name —
 * the normalization layer's own token split over display + internal. */
const naturalNameTokens = (r: IngredientSearchRow): string[] =>
  normalizeSearchText(`${r.ingredient_name_display} ${r.ingredient_name_internal}`)
    .split(' ')
    .filter((t) => t.length >= 2);

const isReachable = (r: IngredientSearchRow): boolean =>
  naturalNameTokens(r).some((t) => matchesServerFilter(r, t));

describe('discoverability — every diacritic-name record stays reachable', () => {
  it('all 19 non-ASCII rows are reached by at least one natural name token', () => {
    const unreachable = DIACRITIC_ROWS.filter((r) => !isReachable(r)).map((r) => r.ingredient_id);
    expect(unreachable).toEqual([]);
  });
  it('the flagship diacritic queries resolve through the alias/normalization layer', () => {
    // róża: display+internal carry no ASCII „roza" — the alias family bridges to „rose"
    const rose = DIACRITIC_ROWS.find((r) => r.ingredient_id === 'PI-ING-001462')!;
    expect(matchesServerFilter(rose, 'róża')).toBe(true);
    expect(matchesServerFilter(rose, 'roza')).toBe(true);
    // Jägermeister typed WITHOUT the umlaut reaches the ASCII internal name
    const jager = DIACRITIC_ROWS.find((r) => r.ingredient_id === 'PI-ING-001614')!;
    expect(matchesServerFilter(jager, 'jagermeister')).toBe(true);
  });
  it('every ASCII-name catalogue row is trivially reachable (its own tokens match verbatim)', () => {
    const unreachable = CATALOGUE.filter((r) => !isReachable(r)).map((r) => r.ingredient_id);
    expect(unreachable).toEqual([]);
  });
});
