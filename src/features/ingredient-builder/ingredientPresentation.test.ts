/**
 * INGREDIENT RESULT GROUPING + POLISH FORM LABELS (owner P0) — presentation
 * mapping proofs on the REAL Mapper vocabulary (category + subcategory values
 * verified against the live staging census). Presentation-only: ranking and
 * live-search behavior are pinned unchanged by the existing suites.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  categoryLabelPl,
  compactDisplayName,
  FORM_GROUP_HEADING_PL,
  FORM_GROUP_ORDER,
  formGroupOf,
  groupHitsByForm,
  resultRowTextPl,
  rowFormLabelPl,
} from './ingredientPresentation';
import { formLabelPl } from './ingredientSearch';

const SRC = resolve(import.meta.dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(SRC, ...p), 'utf8');

describe('owner defect — the exact bad row can no longer render (tests 1/2/3/12)', () => {
  it('chilled ordinary milk renders as „Świeże", never „Świeży owoc"', () => {
    // REAL row: PI-ING-000234 „MILK 1.5% · Milk · Chilled" (dairy / milk)
    const row = resultRowTextPl({ name: 'MILK 1.5% · Milk · Chilled', category: 'dairy', form: 'milk' });
    expect(row).toBe('MILK 1.5% · Nabiał · Świeże');
    expect(row).not.toContain('Świeży owoc');
    expect(row).not.toContain('Chilled'); // raw internal value never beside the Polish label
  });
  it('the shared rank-label module no longer emits the fruit-specific label either', () => {
    expect(formLabelPl('fresh_fruit_profile')).toBe('Świeże');
    expect(formLabelPl('milk')).toBe('Świeże');
  });
  it('Fresh Fruit renders as „Świeże" (PINEAPPLE · Owoce · Świeże)', () => {
    expect(
      resultRowTextPl({ name: 'PINEAPPLE · Fresh Fruit', category: 'fruit', form: 'fresh_fruit_profile' }),
    ).toBe('PINEAPPLE · Owoce · Świeże');
  });
  it('fresh herb renders as „Świeże" (BASIL · Zioła · Świeże)', () => {
    expect(
      resultRowTextPl({ name: 'BASIL · Botanical · Fresh', category: 'botanical', form: 'fresh_herb' }),
    ).toBe('BASIL · Zioła · Świeże');
  });
});

describe('form taxonomy on the real vocabulary (tests 4/8/9/10/11)', () => {
  it('milk, pineapple and basil share ONE fresh group', () => {
    expect(formGroupOf('milk', 'dairy')).toBe('fresh');
    expect(formGroupOf('fresh_fruit_profile', 'fruit')).toBe('fresh');
    expect(formGroupOf('fresh_herb', 'botanical')).toBe('fresh');
    expect(FORM_GROUP_HEADING_PL.fresh).toBe('Świeże');
  });
  it('maps the real subcategories to the right groups', () => {
    expect(formGroupOf('frozen_fruit_profile')).toBe('frozen');
    expect(formGroupOf('fruit_puree')).toBe('puree');
    expect(formGroupOf('fruit_juice_concentrate')).toBe('concentrate');
    expect(formGroupOf('flavored_ice_cream_paste')).toBe('paste');
    expect(formGroupOf('variegato_layering_paste')).toBe('paste');
    expect(formGroupOf('fruit_soda', 'beverage')).toBe('liquid');
    expect(formGroupOf('fruit_juice')).toBe('liquid');
    expect(formGroupOf('skimmed_milk_powder')).toBe('powder'); // test 10
    expect(formGroupOf('powdered_ice_cream_mix')).toBe('powder');
    expect(formGroupOf('sucrose')).toBe('powder');
    expect(formGroupOf('tara_gum')).toBe('powder');
    expect(formGroupOf('chocolate_bar_inclusion')).toBe('inclusion');
    expect(formGroupOf('vodka', 'alcohol')).toBe('liquid');
    expect(formGroupOf('coconut_milk', 'coconut')).toBe('liquid'); // NOT fresh dairy
    expect(formGroupOf('milk_powdered_ice_cream_mix', 'base_mix')).toBe('powder'); // NOT fresh
    expect(formGroupOf('', 'specialty')).toBe('other');
    expect(formGroupOf('unmapped_novel_form')).toBe('other'); // never guessed
  });
  it('row labels: powder/dried/dry sweetener + liquid variants', () => {
    expect(rowFormLabelPl('skimmed_milk_powder')).toBe('Proszek');
    expect(rowFormLabelPl('dried_fruit')).toBe('Suszone');
    expect(rowFormLabelPl('sucrose')).toBe('Suche');
    expect(rowFormLabelPl('fruit_juice')).toBe('Sok');
    expect(rowFormLabelPl('cordial_syrup')).toBe('Syrop');
    expect(rowFormLabelPl('fruit_soda', 'beverage')).toBe('Napój');
    expect(rowFormLabelPl('vodka', 'alcohol')).toBe('Płynne');
    expect(rowFormLabelPl('ice_cream_concentrate')).toBe('Koncentrat');
  });
});

describe('category labels (test 5)', () => {
  it('distinguishes Nabiał / Owoce / Zioła and covers the common enums', () => {
    expect(categoryLabelPl('dairy')).toBe('Nabiał');
    expect(categoryLabelPl('fruit')).toBe('Owoce');
    expect(categoryLabelPl('botanical')).toBe('Zioła');
    expect(categoryLabelPl('chocolate')).toBe('Czekolada i kakao');
    expect(categoryLabelPl('sweetener')).toBe('Cukry i substancje słodzące');
    expect(categoryLabelPl('stabilizer')).toBe('Stabilizatory');
    expect(categoryLabelPl('nut')).toBe('Orzechy');
    expect(categoryLabelPl('beverage')).toBe('Napoje');
    expect(categoryLabelPl('alcohol')).toBe('Alkohol');
    expect(categoryLabelPl('base_mix')).toBe('Mieszanki bazowe');
    // unknown → controlled fallback (raw value, no invented translation)
    expect(categoryLabelPl('novel_thing')).toBe('novel_thing');
  });
});

describe('grouped rendering contract (tests 6/7/13/14)', () => {
  // REAL milk-family rows in RANKED order (the ranking suite pins this order).
  const ranked = [
    { id: 'PI-ING-000236', name: 'MILK 3.5% · Milk · Chilled', category: 'dairy', form: 'milk' },
    { id: 'PI-ING-000296', name: 'WHOLE MILK · Milk', category: 'dairy', form: 'milk' },
    { id: 'PI-ING-000177', name: 'BUTTERMILK · Milk · Chilled', category: 'dairy', form: 'buttermilk' },
    { id: 'PI-ING-000270', name: 'SKIMMED MILK · Milk', category: 'dairy', form: 'skimmed_milk_powder' },
    { id: 'PI-ING-000237', name: 'MILK PROTEIN CONCENTRATE WPC 75% · Milk', category: 'dairy', form: 'protein_concentrate' },
    { id: 'PI-ING-000149', name: 'COCONUT MILK · Coconut · Dry', category: 'coconut', form: 'coconut_milk' },
    { id: 'PI-ING-002018', name: 'MILKA ALPINE MILK CHOCOLATE · Inclusion', category: 'confectionery_inclusion', form: 'chocolate_bar_inclusion' },
  ];

  it('splits into non-empty groups in the fixed order; rank preserved inside groups', () => {
    const groups = groupHitsByForm(ranked);
    expect(groups.map((g) => g.headingPl)).toEqual([
      'Świeże', 'Koncentraty', 'Płynne i napoje', 'Proszki i suche', 'Dodatki',
    ]);
    // fresh keeps its internal rank order: MILK 3.5% before WHOLE MILK before BUTTERMILK
    expect(groups[0]!.hits.map((h) => h.id)).toEqual(['PI-ING-000236', 'PI-ING-000296', 'PI-ING-000177']);
    expect(groups.find((g) => g.group === 'concentrate')!.hits[0]!.id).toBe('PI-ING-000237');
    expect(groups.find((g) => g.group === 'powder')!.hits[0]!.id).toBe('PI-ING-000270');
    expect(groups.find((g) => g.group === 'inclusion')!.hits[0]!.id).toBe('PI-ING-002018');
  });

  it('group order is deterministic and fresh < paste < liquid in the canonical order', () => {
    expect(FORM_GROUP_ORDER.indexOf('fresh')).toBeLessThan(FORM_GROUP_ORDER.indexOf('paste'));
    expect(FORM_GROUP_ORDER.indexOf('paste')).toBeLessThan(FORM_GROUP_ORDER.indexOf('liquid'));
    expect(FORM_GROUP_ORDER.indexOf('liquid')).toBeLessThan(FORM_GROUP_ORDER.indexOf('powder'));
    expect([...FORM_GROUP_ORDER]).toEqual([
      'fresh', 'frozen', 'puree', 'concentrate', 'paste', 'liquid', 'powder', 'aroma', 'inclusion', 'other',
    ]);
  });

  it('pineapple family: Świeże → Puree → Pasty → Płynne i napoje', () => {
    const groups = groupHitsByForm([
      { id: 'PI-ING-000390', name: 'PINEAPPLE · Fresh Fruit', category: 'fruit', form: 'fresh_fruit_profile' },
      { id: 'PI-ING-000389', name: 'PINEAPPLE · Puree · Frozen/Chilled', category: 'fruit', form: 'fruit_puree' },
      { id: 'PI-ING-000726', name: 'FORTEFRUTTO PINEAPPLE N · PreGel Paste · ST-45272', category: 'fruit', form: 'fruit_flavor_paste' },
      { id: 'PI-ING-001889', name: 'FANTA PINEAPPLE · Beverage', category: 'beverage', form: 'fruit_soda' },
    ]);
    expect(groups.map((g) => g.headingPl)).toEqual(['Świeże', 'Puree i przeciery', 'Pasty', 'Płynne i napoje']);
  });

  it('the live picker renders the grouped optgroups, not one generic „Wyniki" group', () => {
    const src = read('features', 'ingredient-builder', 'ServerIngredientPicker.tsx');
    expect(src).toContain('groupHitsByForm');
    expect(src).toContain('resultRowTextPl');
    expect(src).not.toContain('b.resultsLabel'); // the single-group rendering is gone
  });
});

describe('census finalization — the FULL live vocabulary maps honestly (verified on tunab, 2026-07-24)', () => {
  it('every chilled dairy census form is „Świeże" — CREAM 18% must never read as „Inne"', () => {
    for (const sub of [
      'cream_18_percent', 'cream_33_percent_uht', 'clotted_cream', 'creme_fraiche',
      'fresh_whipping_cream', 'unsalted_butter', 'cream_cheese', 'mascarpone_cream_cheese',
      'cottage_cheese', 'fatty_cottage_cheese_8_percent', 'soft_cheese', 'blue_cheese_roquefort',
      'brie_cheese', 'gorgonzola_cheese', 'mozzarella_cheese', 'parmesan_cheese', 'ricotta_cheese',
      'greek_yogurt', 'natural_yogurt', 'skyr_yoghurt', 'yoghurt_9_percent',
    ]) {
      expect(formGroupOf(sub, 'dairy')).toBe('fresh');
      expect(rowFormLabelPl(sub, 'dairy')).toBe('Świeże');
    }
    // real owner row: CREAM 18% · Piątnica Cream · Chilled · BIO
    expect(resultRowTextPl({ name: 'CREAM 18% · Piątnica Cream · Chilled · BIO', category: 'dairy', form: 'cream_18_percent' }))
      .toBe('CREAM 18% · Nabiał · Świeże');
  });
  it('generic fresh_* vocabulary is fresh (flower, whipping cream) — cheesecake pastes are NOT', () => {
    expect(formGroupOf('fresh_flower', 'botanical')).toBe('fresh');
    expect(formGroupOf('fresh_whipping_cream', 'dairy')).toBe('fresh');
    expect(formGroupOf('cheesecake_paste', 'flavor_paste')).toBe('paste'); // 'cheese' substring never leaks
    expect(formGroupOf('yogurt_flavored_ice_cream_paste', 'flavor_paste')).toBe('paste');
    expect(formGroupOf('yogurt_powdered_ice_cream_mix', 'base_mix')).toBe('powder');
  });
  it('explicit liquid_* vocabulary is liquid — never „Proszki i suche" via mix/emulsifier keywords', () => {
    expect(formGroupOf('liquid_emulsifier', 'emulsifier')).toBe('liquid');
    expect(formGroupOf('liquid_stabilizer_emulsifier_mix', 'stabilizer')).toBe('liquid');
    expect(formGroupOf('glucose_syrup_liquid', 'sweetener')).toBe('liquid');
    expect(rowFormLabelPl('glucose_syrup_liquid', 'sweetener')).toBe('Syrop');
  });
  it('agar + pectin are stabilizer powders, not „Inne"', () => {
    expect(formGroupOf('agar', 'stabilizer')).toBe('powder');
    expect(formGroupOf('pectin', 'stabilizer')).toBe('powder');
    expect(rowFormLabelPl('agar', 'stabilizer')).toBe('Proszek');
  });
  it('paste categories keep drink-named pastes in „Pasty" (real rows: whisky / prosecco / cream_liqueur under flavor_paste)', () => {
    expect(formGroupOf('whisky', 'flavor_paste')).toBe('paste');
    expect(formGroupOf('whisky_cream', 'flavor_paste')).toBe('paste');
    expect(formGroupOf('prosecco', 'flavor_paste')).toBe('paste');
    expect(formGroupOf('cream_liqueur', 'flavor_paste')).toBe('paste');
    expect(formGroupOf('liquorice', 'flavor_paste')).toBe('paste');
    // …while the REAL alcohol rows stay liquid
    expect(formGroupOf('whisky_liqueur', 'alcohol')).toBe('liquid');
    expect(formGroupOf('prosecco', 'alcohol')).toBe('liquid');
  });
  it('the two remaining live categories carry Polish labels (no raw enum beside Polish text)', () => {
    expect(categoryLabelPl('seed')).toBe('Nasiona');
    expect(categoryLabelPl('confectionery_spread')).toBe('Kremy do smarowania');
  });
  it('missing vocabularies still map honestly to Inne — never an invented form', () => {
    expect(formGroupOf('kajmak', 'dairy')).toBe('other');
    expect(formGroupOf('condensed_milk', 'dairy')).toBe('other');
    expect(formGroupOf('couverture', 'chocolate')).toBe('other');
    expect(rowFormLabelPl('kajmak', 'dairy')).toBe('Inne');
  });
});

describe('row text (compact — no raw internal segments)', () => {
  it('keeps the first display segment and drops raw form/storage/SKU tails', () => {
    expect(compactDisplayName('MILK 3.5% · Milk · Chilled')).toBe('MILK 3.5%');
    expect(compactDisplayName('FORTEFRUTTO PINEAPPLE N · PreGel Paste · ST-45272')).toBe('FORTEFRUTTO PINEAPPLE N');
    expect(compactDisplayName('PLAIN NAME')).toBe('PLAIN NAME');
  });
  it('the owner examples render exactly', () => {
    expect(resultRowTextPl({ name: 'STRAWBERRY PUREE · Fabbri · 7788', category: 'fruit', form: 'fruit_puree' }))
      .toBe('STRAWBERRY PUREE · Owoce · Puree');
    expect(resultRowTextPl({ name: 'FORTEFRUTTO PINEAPPLE N · PreGel Paste · ST-45272', category: 'fruit', form: 'fruit_flavor_paste' }))
      .toBe('FORTEFRUTTO PINEAPPLE N · Owoce · Pasta');
    expect(resultRowTextPl({ name: 'FANTA PINEAPPLE · Beverage', category: 'beverage', form: 'fruit_soda' }))
      .toBe('FANTA PINEAPPLE · Napoje · Napój');
  });
});
