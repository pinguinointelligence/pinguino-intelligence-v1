import type { MarketProfileCode } from './marketProfiles';

export interface MarketAllergenRule {
  canonicalKey: string;
  display: string;
  aliases: readonly string[];
}

type AllergenRuleEntry = readonly [string, string, (readonly string[])?];

const rules = (...entries: AllergenRuleEntry[]): readonly MarketAllergenRule[] =>
  entries.map(([canonicalKey, display, aliases = []]) => ({ canonicalKey, display, aliases }));

const EU_UK = rules(
  ['gluten_wheat', 'wheat', ['wheat', 'pszenica', 'blé']],
  ['gluten_rye', 'rye', ['rye', 'żyto', 'seigle']],
  ['gluten_barley', 'barley', ['barley', 'jęczmień', 'orge']],
  ['gluten_oats', 'oats', ['oats', 'owies', 'avoine']],
  ['crustaceans', 'crustaceans', ['crustacean']],
  ['eggs', 'eggs', ['egg', 'jaja', 'oeuf', 'œuf']],
  ['fish', 'fish', ['ryby', 'poisson']],
  ['peanuts', 'peanuts', ['peanut', 'orzeszki ziemne', 'arachide']],
  ['soy', 'soybeans', ['soy', 'soya', 'soja']],
  ['milk', 'milk', ['mleko', 'lait']],
  [
    'tree_nuts',
    'nuts',
    ['almond', 'hazelnut', 'walnut', 'cashew', 'pecan', 'pistachio', 'macadamia'],
  ],
  ['celery', 'celery', ['seler', 'céleri']],
  ['mustard', 'mustard', ['gorczyca', 'moutarde']],
  ['sesame', 'sesame', ['sezam', 'sésame']],
  ['sulphites', 'sulphites', ['sulfites', 'sulphur dioxide', 'dwutlenek siarki']],
  ['lupin', 'lupin', ['łubin', 'lupine']],
  ['molluscs', 'molluscs', ['mollusc']],
);

const US = rules(
  ['milk', 'milk', ['mleko', 'lait']],
  ['eggs', 'egg', ['eggs', 'jaja']],
  ['fish', 'fish', []],
  ['crustaceans', 'crustacean shellfish', ['crustacean']],
  [
    'tree_nuts',
    'tree nuts',
    ['almond', 'hazelnut', 'walnut', 'cashew', 'pecan', 'pistachio', 'macadamia'],
  ],
  ['peanuts', 'peanuts', ['peanut']],
  ['gluten_wheat', 'wheat', ['wheat']],
  ['soy', 'soybeans', ['soy', 'soya']],
  ['sesame', 'sesame', []],
);

const CANADA = rules(
  ...EU_UK.map((rule) => [rule.canonicalKey, rule.display, rule.aliases] as const),
  ['triticale', 'triticale', []],
);

export const CANADA_FRENCH_ALLERGEN_NAMES: Readonly<Record<string, string>> = Object.freeze({
  milk: 'lait',
  eggs: 'œufs',
  egg: 'œufs',
  wheat: 'blé',
  soybeans: 'soja',
  soy: 'soja',
  peanuts: 'arachides',
  sesame: 'sésame',
  mustard: 'moutarde',
  nuts: 'noix',
  'tree nuts': 'noix',
  sulphites: 'sulfites',
  fish: 'poisson',
  crustaceans: 'crustacés',
  'crustacean shellfish': 'crustacés',
  rye: 'seigle',
  barley: 'orge',
  oats: 'avoine',
  celery: 'céleri',
  lupin: 'lupin',
  molluscs: 'mollusques',
  triticale: 'triticale',
});

export function canadianFrenchAllergenName(value: string): string {
  return CANADA_FRENCH_ALLERGEN_NAMES[value.toLowerCase()] ?? value;
}

const AU_NZ = rules(
  ['gluten_wheat', 'wheat', ['wheat']],
  ['gluten_rye', 'rye', ['rye']],
  ['gluten_barley', 'barley', ['barley']],
  ['gluten_oats', 'oats', ['oats']],
  ['crustaceans', 'crustacean', ['crustaceans']],
  ['eggs', 'egg', ['eggs']],
  ['fish', 'fish', []],
  ['milk', 'milk', []],
  ['lupin', 'lupin', []],
  ['peanuts', 'peanut', ['peanuts']],
  ['soy', 'soy', ['soya']],
  ['sesame', 'sesame', []],
  [
    'tree_nuts',
    'tree nuts',
    ['almond', 'hazelnut', 'walnut', 'cashew', 'pecan', 'pistachio', 'macadamia'],
  ],
  ['molluscs', 'mollusc', ['molluscs']],
  ['sulphites', 'sulphites', ['sulfites', 'sulphur dioxide']],
);

export const MARKET_ALLERGEN_RULES: Readonly<
  Record<MarketProfileCode, readonly MarketAllergenRule[]>
> = Object.freeze({
  EU: EU_UK,
  UK: EU_UK,
  US,
  CA: CANADA,
  AU_NZ,
  WORLD: [...CANADA, ...US].filter(
    (rule, index, all) =>
      all.findIndex((candidate) => candidate.canonicalKey === rule.canonicalKey) === index,
  ),
});

const normalized = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const allergenParts = (value: string): { key: string; source: string } => {
  const [key, ...source] = value.split(':');
  return { key: key?.trim() ?? '', source: source.join(':').trim() };
};

export function resolveMarketAllergen(
  market: MarketProfileCode,
  value: string,
): MarketAllergenRule | null {
  const needle = normalized(allergenParts(value).key);
  return (
    MARKET_ALLERGEN_RULES[market].find((rule) =>
      [rule.canonicalKey, rule.display, ...rule.aliases].some(
        (candidate) => normalized(candidate) === needle,
      ),
    ) ?? null
  );
}

export function marketAllergenDisplay(market: MarketProfileCode, value: string): string | null {
  const rule = resolveMarketAllergen(market, value);
  if (!rule) return null;
  const source = allergenParts(value).source;
  if (!source) return rule.display;
  if (market === 'US') return source;
  return source;
}

export function marketAllergenDeclarationIssues(
  market: MarketProfileCode,
  values: readonly string[],
): string[] {
  if (market !== 'US') return [];
  const sourceRequired = new Set(['fish', 'crustaceans', 'tree_nuts']);
  return values.flatMap((value) => {
    const rule = resolveMarketAllergen(market, value);
    if (!rule || !sourceRequired.has(rule.canonicalKey) || allergenParts(value).source) return [];
    return [
      `FDA wymaga konkretnego źródła dla ${rule.display} (np. ${rule.canonicalKey}: almond/cod/shrimp).`,
    ];
  });
}

export function unresolvedMarketAllergens(
  market: MarketProfileCode,
  values: readonly string[],
): string[] {
  return values.filter((value) => !resolveMarketAllergen(market, value));
}
