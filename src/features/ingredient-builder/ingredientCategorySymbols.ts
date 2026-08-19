export type IngredientCategorySymbolId =
  | 'all'
  | 'favorites'
  | 'fresh'
  | 'dairy'
  | 'dry'
  | 'chocolate'
  | 'fruit'
  | 'nuts'
  | 'paste'
  | 'other';

export type IngredientCategoryFilterId = Exclude<IngredientCategorySymbolId, 'other'>;

export interface IngredientCategoryMetadata {
  category?: string | null;
  form?: string | null;
  favorite?: boolean;
}

type IngredientCategoryFamily = Exclude<IngredientCategorySymbolId, 'all' | 'favorites' | 'other'>;

const CATEGORY_FAMILY: Readonly<Record<string, IngredientCategoryFamily>> = {
  dairy: 'dairy',
  milk: 'dairy',
  egg: 'dairy',
  egg_product: 'dairy',
  chocolate: 'chocolate',
  chocolate_cocoa: 'chocolate',
  cocoa: 'chocolate',
  coating: 'chocolate',
  fruit: 'fruit',
  fruit_powder: 'fruit',
  nut: 'nuts',
  nut_paste: 'nuts',
  seed: 'nuts',
  coconut: 'nuts',
  flavor_paste: 'paste',
  confectionery_spread: 'paste',
  sauce: 'paste',
  variegate: 'paste',
  sweetener: 'dry',
  sugar: 'dry',
  stabilizer: 'dry',
  fiber: 'dry',
  protein: 'dry',
  cereal: 'dry',
  starch: 'dry',
  emulsifier: 'dry',
  acid: 'dry',
  additive: 'dry',
  functional_additive: 'dry',
  flavor_powder: 'dry',
  icing_powder: 'dry',
  botanical: 'fresh',
  vegetable: 'fresh',
};

const FAMILY_TOKENS: Readonly<Record<IngredientCategoryFamily, readonly string[]>> = {
  dairy: ['dairy', 'milk', 'cream', 'mlecz', 'nabiał'],
  dry: ['dry', 'powder', 'proszek', 'suche', 'sugar', 'sweetener', 'stabilizer'],
  chocolate: ['chocolate', 'cocoa', 'czekolad', 'kakao'],
  fruit: ['fruit', 'owoc'],
  nuts: ['nut', 'orzech', 'seed', 'nasion', 'coconut', 'kokos'],
  paste: ['paste', 'puree', 'purée', 'pasta', 'przecier', 'spread', 'variegate'],
  fresh: ['fresh', 'chilled', 'śwież'],
};

const normalizeMetadata = (value: string | null | undefined): string =>
  (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .trim();

const familySetFor = ({
  category,
  form,
}: IngredientCategoryMetadata): Set<IngredientCategoryFamily> => {
  const categoryKey = normalizeMetadata(category);
  const metadata = `${categoryKey.replaceAll('_', ' ')} ${normalizeMetadata(form).replaceAll('_', ' ')}`;
  const families = new Set<IngredientCategoryFamily>();
  const exact = CATEGORY_FAMILY[categoryKey];
  if (exact) families.add(exact);
  for (const [family, tokens] of Object.entries(FAMILY_TOKENS) as Array<
    [IngredientCategoryFamily, readonly string[]]
  >) {
    if (tokens.some((token) => metadata.includes(normalizeMetadata(token)))) families.add(family);
  }
  return families;
};

/**
 * Resolve the one primary decorative symbol shown beside an ingredient. The
 * exact Mapper category wins; form keywords only provide a controlled fallback.
 */
export function ingredientCategorySymbolFor(
  metadata: IngredientCategoryMetadata,
): Exclude<IngredientCategorySymbolId, 'all' | 'favorites'> {
  const categoryFamily = CATEGORY_FAMILY[normalizeMetadata(metadata.category)];
  if (categoryFamily) return categoryFamily;
  const families = familySetFor(metadata);
  return (
    (['chocolate', 'dairy', 'fruit', 'nuts', 'paste', 'fresh', 'dry'] as const).find((family) =>
      families.has(family),
    ) ?? 'other'
  );
}

/** One canonical matcher drives the filter chips; a product may match a form
 * filter as well as its primary category (for example fruit purée). */
export function ingredientCategoryMatchesFilter(
  metadata: IngredientCategoryMetadata,
  filter: IngredientCategoryFilterId,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'favorites') return metadata.favorite === true;
  return familySetFor(metadata).has(filter);
}
