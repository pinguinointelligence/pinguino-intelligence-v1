/**
 * Ingredient result PRESENTATION (owner P0 — grouping + Polish labels). PURE:
 * one canonical mapping from the real Mapper vocabulary (ingredient_category +
 * ingredient_subcategory, verified against the live staging census) to
 * customer-facing Polish CATEGORY labels, FORM groups and row form labels.
 *
 * Presentation-only: no search logic, no ranking change, no data change. The
 * generic natural-state group is „Świeże" (NEVER the fruit-specific „Świeży
 * owoc") because it contains milk, cream, fruit AND herbs. Raw internal values
 * (`Chilled`, enum names) never render next to the Polish labels — they stay
 * available to owner QA diagnostics only.
 */

/* ─────────────────────────────────────────────────────────── form groups ── */

export type FormGroup =
  | 'fresh'
  | 'frozen'
  | 'puree'
  | 'concentrate'
  | 'paste'
  | 'liquid'
  | 'powder'
  | 'aroma'
  | 'inclusion'
  | 'other';

/** The owner-mandated group order (only non-empty groups render). */
export const FORM_GROUP_ORDER: readonly FormGroup[] = [
  'fresh', 'frozen', 'puree', 'concentrate', 'paste', 'liquid', 'powder', 'aroma', 'inclusion', 'other',
];

export const FORM_GROUP_HEADING_PL: Record<FormGroup, string> = {
  fresh: 'Świeże',
  frozen: 'Mrożone',
  puree: 'Puree i przeciery',
  concentrate: 'Koncentraty',
  paste: 'Pasty',
  liquid: 'Płynne i napoje',
  powder: 'Proszki i suche',
  aroma: 'Aromaty',
  inclusion: 'Dodatki',
  other: 'Inne',
};

/** Natural chilled/raw forms — EXACT subcategory matches (never substrings, so
 * `milk_powdered_ice_cream_mix` or `coconut_milk` can never land here). */
const FRESH_FORMS: ReadonlySet<string> = new Set([
  'fresh_fruit_profile', 'fruit_profile', 'tropical_fruit_profile', 'fruit_peel',
  'frozen_or_fresh', 'fresh_herb', 'milk', 'fresh_milk', 'cream', 'buttermilk',
  'cream_33_percent', 'cream_36_percent_uht', 'mascarpone_cheese',
  'vegetable_profile', 'root_vegetable', 'leafy_green',
]);

const has = (f: string, ...needles: string[]): boolean => needles.some((n) => f.includes(n));

/**
 * Canonical form-group resolution from the REAL Mapper subcategory vocabulary.
 * Order matters (an inclusion wins over its base word; dry mixes win over the
 * plain-milk exact set because the exact set never substring-matches).
 */
export function formGroupOf(subcategory: string | null | undefined, category?: string): FormGroup {
  const f = (subcategory ?? '').toLowerCase().trim();
  if (f === '') return 'other';

  if (FRESH_FORMS.has(f)) return 'fresh';
  if (has(f, 'frozen')) return 'frozen';
  if (has(f, 'puree')) return 'puree';
  if (has(f, 'concentrate', 'nectar')) return 'concentrate';
  if (has(f, 'inclusion', 'pieces', 'chips', 'crisp', 'flakes', 'wafer', 'cookie', 'cracker', 'crumble', 'topping')) {
    return 'inclusion';
  }
  if (has(f, 'paste', 'variegat', 'compound', 'spread')) return 'paste';
  if (has(f, 'aroma', 'essence', 'extract', 'flavoring_agent')) return 'aroma';
  if (
    has(f, 'powder', 'powdered', 'mix', 'dry', 'dried', 'icing', 'flour', 'maltodextrin', 'lactose') ||
    has(f, 'sucrose', 'dextrose', 'fructose', 'invert_sugar', 'sugar', 'sweetener', 'stabilizer', 'emulsifier', 'gum', 'fiber', 'starch')
  ) {
    return 'powder';
  }
  if (
    has(f, 'drink', 'soda', 'beverage', 'juice', 'syrup', 'cordial', 'beer', 'wine', 'liqueur', 'vodka',
      'whiskey', 'whisky', 'rum', 'gin', 'spirit', 'tequila', 'cola', 'tea', 'water', 'honey', 'coconut_milk') ||
    (category ?? '').toLowerCase() === 'alcohol' ||
    (category ?? '').toLowerCase() === 'beverage'
  ) {
    return 'liquid';
  }
  return 'other';
}

/** Row-level Polish form label (one label per row — never the raw internal value). */
export function rowFormLabelPl(subcategory: string | null | undefined, category?: string): string {
  const group = formGroupOf(subcategory, category);
  const f = (subcategory ?? '').toLowerCase();
  switch (group) {
    case 'fresh':
      return 'Świeże';
    case 'frozen':
      return 'Mrożone';
    case 'puree':
      return 'Puree';
    case 'concentrate':
      return 'Koncentrat';
    case 'paste':
      return 'Pasta';
    case 'liquid':
      if (has(f, 'juice')) return 'Sok';
      if (has(f, 'syrup', 'cordial', 'honey')) return 'Syrop';
      if (has(f, 'drink', 'soda', 'beverage', 'cola', 'tea') || (category ?? '').toLowerCase() === 'beverage') return 'Napój';
      return 'Płynne';
    case 'powder':
      if (has(f, 'dried')) return 'Suszone';
      if (has(f, 'sucrose', 'dextrose', 'fructose', 'invert', 'sugar', 'sweetener', 'stabilizer', 'emulsifier', 'gum', 'fiber', 'starch', 'dry')) {
        return 'Suche';
      }
      return 'Proszek';
    case 'aroma':
      return 'Aromat';
    case 'inclusion':
      return 'Dodatek';
    case 'other':
      return 'Inne';
  }
}

/* ─────────────────────────────────────────────────────── category labels ── */

/** Polish customer-facing category labels for the real Mapper category enums.
 * Unknown → the raw value (controlled fallback, never an invented translation). */
const CATEGORY_PL: Record<string, string> = {
  dairy: 'Nabiał',
  fruit: 'Owoce',
  botanical: 'Zioła',
  chocolate: 'Czekolada i kakao',
  cocoa: 'Czekolada i kakao',
  sweetener: 'Cukry i substancje słodzące',
  stabilizer: 'Stabilizatory',
  nut: 'Orzechy',
  nut_paste: 'Orzechy',
  beverage: 'Napoje',
  alcohol: 'Alkohol',
  base_mix: 'Mieszanki bazowe',
  flavor_paste: 'Pasty smakowe',
  flavor_powder: 'Proszki smakowe',
  flavor_syrup: 'Syropy smakowe',
  flavor_concentrate: 'Koncentraty smakowe',
  vegetable: 'Warzywa',
  coconut: 'Kokos',
  bakery: 'Wypieki',
  bakery_inclusion: 'Wypieki',
  confectionery_inclusion: 'Słodycze',
  decorative_inclusion: 'Dekoracje',
  specialty: 'Specjalne',
  fiber: 'Błonnik',
  egg: 'Jaja',
  egg_product: 'Jaja',
  coffee_tea: 'Kawa i herbata',
  coffee: 'Kawa i herbata',
  protein: 'Białka',
  spice: 'Przyprawy',
  cereal: 'Zboża',
  fat: 'Tłuszcze',
  starch: 'Skrobie',
  icing_powder: 'Proszki dekoracyjne',
  variegate: 'Variegato',
  semi_finished_product: 'Półprodukty',
  fruit_powder: 'Proszki owocowe',
  emulsifier: 'Emulgatory',
  acid: 'Kwasy',
  additive: 'Dodatki funkcjonalne',
  functional_additive: 'Dodatki funkcjonalne',
  colorant: 'Barwniki',
  coating: 'Polewy',
  sauce: 'Sosy',
  liquid: 'Płynne',
  base: 'Bazy',
};

export function categoryLabelPl(category: string | null | undefined): string {
  const key = (category ?? '').toLowerCase().trim();
  return CATEGORY_PL[key] ?? (category ?? '');
}

/* ───────────────────────────────────────────────────────────── row text ── */

/**
 * Compact customer-facing name: the FIRST „·" segment of the display name.
 * The remaining segments repeat raw form/storage/SKU data (`Milk · Chilled`,
 * `PreGel Paste · ST-45272`) that the Polish category+form labels replace.
 */
export function compactDisplayName(display: string): string {
  const first = display.split('·')[0]?.trim() ?? '';
  return first !== '' ? first : display.trim();
}

/** The one canonical row format: `NAZWA · Kategoria · Forma`. */
export function resultRowTextPl(hit: { name: string; category: string; form: string }): string {
  return `${compactDisplayName(hit.name)} · ${categoryLabelPl(hit.category)} · ${rowFormLabelPl(hit.form, hit.category)}`;
}

/* ───────────────────────────────────────────────────────────── grouping ── */

export interface GroupedHits<T> {
  group: FormGroup;
  headingPl: string;
  hits: T[];
}

/**
 * Partition RANKED hits into the owner's form groups, preserving the incoming
 * rank order inside every group (grouping never destroys ranking). Only
 * non-empty groups return, in the fixed FORM_GROUP_ORDER.
 */
export function groupHitsByForm<T extends { category: string; form: string }>(
  hits: readonly T[],
): GroupedHits<T>[] {
  const buckets = new Map<FormGroup, T[]>();
  for (const hit of hits) {
    const group = formGroupOf(hit.form, hit.category);
    const bucket = buckets.get(group);
    if (bucket) bucket.push(hit);
    else buckets.set(group, [hit]);
  }
  return FORM_GROUP_ORDER.filter((group) => buckets.has(group)).map((group) => ({
    group,
    headingPl: FORM_GROUP_HEADING_PL[group],
    hits: buckets.get(group)!,
  }));
}
