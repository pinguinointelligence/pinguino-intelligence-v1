/**
 * Deterministic discovery tree for the 2500-row flavour-inspiration dataset.
 *
 * The workbook remains the immutable source. This module derives a small set of
 * ingredient-led families and concise directions at runtime; it never copies rows,
 * invents recipes or imports grams. The entry screen may render at most six families.
 */
import { FLAVOR_CATALOGUE } from './flavorCatalogue';
import type { FlavorCatalogueEntry } from './flavorCatalogueTypes';
import type { CustomerProductType } from '@/features/customer-flow/types';

export type InspirationFamilyId =
  | 'strawberry'
  | 'banana'
  | 'vanilla'
  | 'chocolate'
  | 'pistachio'
  | 'hazelnut'
  | 'coffee'
  | 'mango'
  | 'citrus'
  | 'raspberry'
  | 'caramel'
  | 'coconut'
  | 'almond'
  | 'peanut'
  | 'tea'
  | 'alcohol'
  | 'protein'
  | 'confectionery'
  | 'other_fruit'
  | 'dessert'
  | 'aromatic'
  | 'other';

export type InspirationDirectionId =
  | 'classic'
  | 'chocolate'
  | 'white_chocolate'
  | 'nut'
  | 'caramel'
  | 'cheesecake'
  | 'coffee_tea'
  | 'herbal'
  | 'floral'
  | 'spiced'
  | 'fruit'
  | 'citrus'
  | 'crunch'
  | 'dessert'
  | 'alcohol'
  | 'other';

export interface InspirationDirection {
  id: InspirationDirectionId;
  label: string;
  count: number;
  featuredEntry: FlavorCatalogueEntry;
}

export interface InspirationFamily {
  id: InspirationFamilyId;
  label: string;
  count: number;
  directions: InspirationDirection[];
  longTailCount: number;
  entries: readonly FlavorCatalogueEntry[];
}

const FAMILY_LABELS: Readonly<Record<InspirationFamilyId, string>> = {
  strawberry: 'Truskawka',
  banana: 'Banan',
  vanilla: 'Wanilia',
  chocolate: 'Czekolada',
  pistachio: 'Pistacja',
  hazelnut: 'Orzech laskowy',
  coffee: 'Kawa',
  mango: 'Mango',
  citrus: 'Cytrusy',
  raspberry: 'Malina',
  caramel: 'Karmel',
  coconut: 'Kokos',
  almond: 'Migdał',
  peanut: 'Orzech ziemny',
  tea: 'Herbata i matcha',
  alcohol: 'Alkohol',
  protein: 'Proteinowe',
  confectionery: 'Słodycze i praliny',
  other_fruit: 'Inne owoce',
  dessert: 'Desery i wypieki',
  aromatic: 'Zioła, kwiaty i przyprawy',
  other: 'Inne pomysły',
};

const DIRECTION_LABELS: Readonly<Record<InspirationDirectionId, string>> = {
  classic: 'Klasycznie',
  chocolate: 'Z czekoladą',
  white_chocolate: 'Z białą czekoladą',
  nut: 'Z orzechami',
  caramel: 'Z karmelem',
  cheesecake: 'Cheesecake',
  coffee_tea: 'Z kawą lub herbatą',
  herbal: 'Ziołowo',
  floral: 'Kwiatowo',
  spiced: 'Z przyprawami',
  fruit: 'Z innym owocem',
  citrus: 'Cytrusowo',
  crunch: 'Z chrupiącym dodatkiem',
  dessert: 'Deserowo',
  alcohol: 'Z alkoholem',
  other: 'Inny kierunek',
};

const normalize = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const includesAny = (value: string, terms: readonly string[]): boolean =>
  terms.some((term) => value.includes(term));

const FIRST_INGREDIENT_RULES: readonly [InspirationFamilyId, readonly string[]][] = [
  ['strawberry', ['strawberry']],
  ['banana', ['banana']],
  ['vanilla', ['vanilla', 'vaniglia']],
  ['chocolate', ['chocolate', 'cocoa', 'cacao', 'fudge']],
  ['pistachio', ['pistachio']],
  ['hazelnut', ['hazelnut', 'gianduja']],
  ['coffee', ['coffee', 'espresso', 'cafe']],
  ['mango', ['mango']],
  ['citrus', ['lemon', 'lime', 'orange', 'yuzu', 'citrus', 'bergamot']],
  ['raspberry', ['raspberry']],
  ['caramel', ['caramel', 'dulce de leche', 'toffee']],
  ['coconut', ['coconut']],
  ['almond', ['almond', 'marzipan']],
  ['peanut', ['peanut']],
  ['tea', ['matcha', 'tea', 'hojicha']],
];

const CUSTOMER_CONCRETE_FAMILY_IDS = new Set<InspirationFamilyId>(
  FIRST_INGREDIENT_RULES.map(([id]) => id),
);

/** One and only one root family for every source row. */
export function inspirationFamilyId(entry: FlavorCatalogueEntry): InspirationFamilyId {
  const category = normalize(entry.category);
  if (category === 'branded confectionery') return 'confectionery';
  if (category === 'alcohol inspired') return 'alcohol';
  if (category === 'protein') return 'protein';

  const firstIngredient = normalize(entry.mainIngredients[0] ?? entry.mainFlavorTag);
  for (const [family, terms] of FIRST_INGREDIENT_RULES) {
    if (includesAny(firstIngredient, terms)) return family;
  }

  if (['fruit', 'tropical', 'citrus'].includes(category)) return 'other_fruit';
  if (
    [
      'dessert',
      'pie',
      'cheesecake',
      'cookie',
      'cookies & cream',
      'bakery',
      'yogurt',
      'kids',
    ].includes(category)
  ) {
    return 'dessert';
  }
  if (['floral', 'herbal', 'spice', 'vegetable'].includes(category)) return 'aromatic';
  return 'other';
}

/**
 * Customer discovery deliberately differs from the immutable internal clustering.
 * Product-type and technical buckets stay available for analytics, but customer
 * navigation resolves an entry to a concrete flavour family whenever its source
 * language supports one. Protein is therefore a filter, never a flavour family.
 */
export function customerInspirationFamilyId(
  entry: FlavorCatalogueEntry,
): InspirationFamilyId | null {
  const internalFamily = inspirationFamilyId(entry);
  if (CUSTOMER_CONCRETE_FAMILY_IDS.has(internalFamily)) return internalFamily;

  const customerLanguage = normalize(
    `${entry.mainIngredients[0] ?? ''} ${entry.mainFlavorTag} ${entry.flavorName}`,
  );
  for (const [family, terms] of FIRST_INGREDIENT_RULES) {
    if (includesAny(customerLanguage, terms)) return family;
  }
  return null;
}

function directionId(entry: FlavorCatalogueEntry): InspirationDirectionId {
  const secondary = normalize(
    `${entry.flavorName} ${entry.mainIngredients.slice(1).join(' ')} ${entry.tags.join(' ')}`,
  );
  const hasExplicitSecondary =
    entry.mainIngredients.length > 1 || /\bwith\b|\+/.test(normalize(entry.flavorName));
  if (!hasExplicitSecondary) return 'classic';
  if (includesAny(secondary, ['white chocolate'])) return 'white_chocolate';
  if (includesAny(secondary, ['chocolate', 'cocoa', 'cacao', 'brownie', 'fudge']))
    return 'chocolate';
  if (
    includesAny(secondary, [
      'pistachio',
      'hazelnut',
      'almond',
      'peanut',
      'pecan',
      'walnut',
      'praline',
    ])
  )
    return 'nut';
  if (includesAny(secondary, ['caramel', 'dulce de leche', 'toffee'])) return 'caramel';
  if (includesAny(secondary, ['cheesecake', 'cream cheese', 'mascarpone'])) return 'cheesecake';
  if (includesAny(secondary, ['coffee', 'espresso', 'matcha', 'tea', 'hojicha']))
    return 'coffee_tea';
  if (includesAny(secondary, ['basil', 'mint', 'rosemary', 'thyme', 'herb'])) return 'herbal';
  if (includesAny(secondary, ['rose', 'lavender', 'hibiscus', 'floral'])) return 'floral';
  if (includesAny(secondary, ['cinnamon', 'cardamom', 'chili', 'pepper', 'spice'])) return 'spiced';
  if (includesAny(secondary, ['lemon', 'lime', 'orange', 'yuzu', 'citrus'])) return 'citrus';
  if (
    includesAny(secondary, [
      'rum',
      'whiskey',
      'whisky',
      'gin',
      'liqueur',
      'wine',
      'beer',
      'alcohol',
    ])
  )
    return 'alcohol';
  if (
    includesAny(secondary, ['crunch', 'crumble', 'cookie', 'biscuit', 'wafer', 'pieces', 'chips'])
  )
    return 'crunch';
  if (
    includesAny(secondary, [
      'strawberry',
      'raspberry',
      'mango',
      'banana',
      'berry',
      'fruit',
      'cherry',
      'peach',
    ])
  )
    return 'fruit';
  if (includesAny(secondary, ['cake', 'pie', 'tiramisu', 'pudding', 'marshmallow', 'meringue']))
    return 'dessert';
  return 'other';
}

const preferredFeatured = (entries: readonly FlavorCatalogueEntry[]): FlavorCatalogueEntry =>
  [...entries].sort((a, b) => {
    if (a.imageStatus !== b.imageStatus) return a.imageStatus === 'present' ? -1 : 1;
    return a.popularityRank - b.popularityRank || a.flavorCode.localeCompare(b.flavorCode);
  })[0]!;

/** Build every family and 6–10 useful directions without ever dumping 2500 cards. */
function clusterWithFamilyResolver(
  catalogue: readonly FlavorCatalogueEntry[],
  resolveFamily: (entry: FlavorCatalogueEntry) => InspirationFamilyId | null,
): InspirationFamily[] {
  const byFamily = new Map<InspirationFamilyId, FlavorCatalogueEntry[]>();
  for (const entry of catalogue) {
    const family = resolveFamily(entry);
    if (family === null) continue;
    const list = byFamily.get(family) ?? [];
    list.push(entry);
    byFamily.set(family, list);
  }

  return [...byFamily.entries()]
    .map(([id, entries]): InspirationFamily => {
      const byDirection = new Map<InspirationDirectionId, FlavorCatalogueEntry[]>();
      for (const entry of entries) {
        const direction = directionId(entry);
        const list = byDirection.get(direction) ?? [];
        list.push(entry);
        byDirection.set(direction, list);
      }
      const directions = [...byDirection.entries()]
        .map(
          ([direction, directionEntries]): InspirationDirection => ({
            id: direction,
            label: DIRECTION_LABELS[direction],
            count: directionEntries.length,
            featuredEntry: preferredFeatured(directionEntries),
          }),
        )
        .sort((a, b) => {
          if (a.id === 'classic') return -1;
          if (b.id === 'classic') return 1;
          return (
            a.featuredEntry.popularityRank - b.featuredEntry.popularityRank ||
            a.id.localeCompare(b.id)
          );
        })
        .slice(0, 10);
      return {
        id,
        label: FAMILY_LABELS[id],
        count: entries.length,
        directions,
        longTailCount: Math.max(0, entries.length - directions.length),
        entries: [...entries].sort((a, b) => a.popularityRank - b.popularityRank),
      };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pl'));
}

export function clusterFlavorInspirations(
  catalogue: readonly FlavorCatalogueEntry[] = FLAVOR_CATALOGUE,
): InspirationFamily[] {
  return clusterWithFamilyResolver(catalogue, inspirationFamilyId);
}

export type InspirationProductFilter = 'all' | CustomerProductType;

export function customerFacingInspirationFamilies(
  productType: InspirationProductFilter = 'all',
  catalogue: readonly FlavorCatalogueEntry[] = FLAVOR_CATALOGUE,
): InspirationFamily[] {
  const matchingEntries =
    productType === 'all'
      ? catalogue
      : catalogue.filter((entry) => entry.supportedVisibleTypes.includes(productType));
  return clusterWithFamilyResolver(matchingEntries, customerInspirationFamilyId);
}

export const MAX_INITIAL_DISCOVERY_CARDS = 6;

export function initialDiscoveryFamilies(
  families: readonly InspirationFamily[] = customerFacingInspirationFamilies(),
): InspirationFamily[] {
  return [...families]
    .filter((family) => CUSTOMER_CONCRETE_FAMILY_IDS.has(family.id))
    .sort(
      (a, b) =>
        (a.entries[0]?.popularityRank ?? Number.MAX_SAFE_INTEGER) -
          (b.entries[0]?.popularityRank ?? Number.MAX_SAFE_INTEGER) ||
        a.label.localeCompare(b.label, 'pl'),
    )
    .slice(0, MAX_INITIAL_DISCOVERY_CARDS);
}

export function searchInspirationFamilies(
  query: string,
  families: readonly InspirationFamily[] = customerFacingInspirationFamilies(),
): InspirationFamily[] {
  const needle = normalize(query.trim());
  if (needle === '') return [...families];
  return families.filter(
    (family) =>
      normalize(family.label).includes(needle) ||
      family.entries.some((entry) =>
        normalize(`${entry.flavorName} ${entry.mainIngredients.join(' ')}`).includes(needle),
      ),
  );
}
