import type { CatalogProductSearchHit } from '@/features/global-catalog/contracts';
import {
  canonicalSearchConceptForQuery,
  normalizeSearchText,
  type CanonicalSearchConcept,
} from './ingredientSearch';
import { ingredientCategorySymbolFor } from './ingredientCategorySymbols';

export const PRODUCT_DISCOVERY_TOP_FILTERS = [
  'favorites',
  'all',
  'fruit',
  'dairy',
  'nuts',
  'chocolate',
  'technical',
] as const;

export type ProductDiscoveryTopFilter = (typeof PRODUCT_DISCOVERY_TOP_FILTERS)[number];

export const FRUIT_DISCOVERY_SUBFILTERS = ['all', 'fresh', 'frozen', 'puree', 'paste'] as const;
export const TECHNICAL_DISCOVERY_SUBFILTERS = ['all', 'sugars', 'stabilizers', 'inulin'] as const;

export type ProductDiscoverySubfilter =
  | (typeof FRUIT_DISCOVERY_SUBFILTERS)[number]
  | (typeof TECHNICAL_DISCOVERY_SUBFILTERS)[number];

type TechnologicalFamily = CanonicalSearchConcept | 'dairy' | 'nuts' | 'chocolate' | null;

export type ProductDiscoveryReplaceFamily = 'milk' | 'cream' | null;

export interface ProductDiscoveryMetadata {
  displayName: string;
  originalName?: string | null;
  canonicalFamily?: string | null;
  category?: string | null;
  productForm?: string | null;
  aliases?: readonly string[];
  favorite?: boolean;
}

const normalizedProductText = (hit: ProductDiscoveryMetadata): string =>
  normalizeSearchText(
    [
      hit.canonicalFamily,
      hit.category,
      hit.productForm,
      hit.displayName,
      hit.originalName,
      ...(hit.aliases ?? []),
    ]
      .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
      .join(' '),
  );

const categoryKey = (hit: ProductDiscoveryMetadata): string =>
  normalizeSearchText(hit.category ?? '').replaceAll(' ', '_');

function technologicalFamilyFor(hit: ProductDiscoveryMetadata): TechnologicalFamily {
  const category = categoryKey(hit);
  const form = normalizeSearchText(hit.productForm ?? '');
  const family = normalizeSearchText(hit.canonicalFamily ?? '');
  const text = normalizedProductText(hit);
  const taxonomyFamily = ingredientCategorySymbolFor({
    category: hit.category,
    form: hit.productForm,
  });

  if (taxonomyFamily === 'dairy') {
    if (/\b(cream|crema|panna|sahne|rahm|smietan)/.test(`${family} ${form} ${text}`)) {
      return 'cream';
    }
    if (/\b(milk|milch|mlek|mleczn|leche|latte|lait)/.test(`${family} ${form} ${text}`)) {
      return 'milk';
    }
  }
  if (text.includes('inulin')) return 'inulin';
  if (category === 'stabilizer' || /\bstabiliz|\bstabilis|\bestabiliz/.test(text)) {
    return 'stabilizer';
  }
  if (
    ['sugar', 'sweetener'].includes(category) ||
    /\b(sugar|cukier|zucker|azucar|zuccher|sucre|sucros|sacharoz|dextros|fructos|glucos)/.test(text)
  ) {
    return 'sugar';
  }
  if (taxonomyFamily === 'dairy') return 'dairy';
  if (taxonomyFamily === 'fruit') return 'fruit';
  if (taxonomyFamily === 'nuts') return 'nuts';
  if (taxonomyFamily === 'chocolate') return 'chocolate';
  return null;
}

type TechnicalSubfilter = 'sugars' | 'stabilizers' | 'inulin' | null;

const technicalSubfilterFor = (hit: ProductDiscoveryMetadata): TechnicalSubfilter => {
  const family = technologicalFamilyFor(hit);
  if (family === 'inulin') return 'inulin';
  if (family === 'stabilizer') return 'stabilizers';
  if (family === 'sugar') return 'sugars';
  return null;
};

type FruitSubfilter = 'fresh' | 'frozen' | 'puree' | 'paste' | null;

const fruitSubfilterFor = (hit: ProductDiscoveryMetadata): FruitSubfilter => {
  const form = normalizeSearchText(hit.productForm ?? '');
  if (/\bfresh\b|fresh fruit/.test(form)) return 'fresh';
  if (/\bfrozen\b/.test(form)) return 'frozen';
  if (/puree|purée/.test(form)) return 'puree';
  if (/paste|pasta/.test(form)) return 'paste';
  return null;
};

export function resolveInitialProductDiscoveryFilter(
  favoriteCount: number,
): ProductDiscoveryTopFilter {
  return favoriteCount > 0 ? 'favorites' : 'all';
}

export function matchesProductDiscoveryFilter(
  hit: ProductDiscoveryMetadata,
  filter: ProductDiscoveryTopFilter,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'favorites') return hit.favorite === true;
  const family = technologicalFamilyFor(hit);
  if (filter === 'technical') {
    const category = categoryKey(hit);
    return (
      technicalSubfilterFor(hit) !== null ||
      ['emulsifier', 'acid', 'additive', 'functional_additive', 'fiber'].includes(category)
    );
  }
  if (filter === 'dairy') return family === 'milk' || family === 'cream' || family === 'dairy';
  return family === filter;
}

export function matchesProductDiscoverySubfilter(
  hit: ProductDiscoveryMetadata,
  filter: ProductDiscoveryTopFilter,
  subfilter: ProductDiscoverySubfilter,
): boolean {
  if (subfilter === 'all') return true;
  if (filter === 'fruit') return fruitSubfilterFor(hit) === subfilter;
  if (filter === 'technical') return technicalSubfilterFor(hit) === subfilter;
  return true;
}

export function matchesProductDiscoveryFamily(
  hit: ProductDiscoveryMetadata,
  family: Exclude<ProductDiscoveryReplaceFamily, null>,
): boolean {
  return technologicalFamilyFor(hit) === family;
}

export function availableContextualSubfilters(
  hits: readonly ProductDiscoveryMetadata[],
  filter: ProductDiscoveryTopFilter,
): ProductDiscoverySubfilter[] {
  if (filter === 'fruit') {
    const present = new Set(hits.map(fruitSubfilterFor).filter(Boolean));
    if (present.size === 0) return [];
    return FRUIT_DISCOVERY_SUBFILTERS.filter(
      (subfilter) => subfilter === 'all' || present.has(subfilter),
    );
  }
  if (filter === 'technical') {
    const present = new Set(hits.map(technicalSubfilterFor).filter(Boolean));
    if (present.size === 0) return [];
    return TECHNICAL_DISCOVERY_SUBFILTERS.filter(
      (subfilter) => subfilter === 'all' || present.has(subfilter),
    );
  }
  return [];
}

function finiteNumberAt(value: unknown, key: string): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : null;
}

function technologicalPercent(hit: CatalogProductSearchHit): number | null {
  const technical = finiteNumberAt(hit.publicData.technicalComposition, 'fat');
  if (technical !== null) return technical;
  const label = `${hit.displayName} ${hit.originalName ?? ''}`.match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (!label) return null;
  const parsed = Number(label[1]!.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

const percentageLabel = (value: number, minimumFractionDigits = 0): string =>
  minimumFractionDigits > 0
    ? value.toFixed(minimumFractionDigits)
    : Number.isInteger(value)
      ? value.toFixed(0)
      : String(value).replace(',', '.');

function canonicalPrimaryName(
  hit: ProductDiscoveryMetadata,
  family: TechnologicalFamily,
  percent: number | null,
): string {
  if ((family === 'milk' || family === 'cream') && percent !== null) {
    return `${family.toUpperCase()} ${percentageLabel(percent, family === 'milk' ? 1 : 0)}%`;
  }
  return hit.displayName.split(/\s+(?:·|—)\s+/u)[0]!.trim();
}

function canonicalSlotKey(
  hit: CatalogProductSearchHit,
  family: TechnologicalFamily,
  percent: number | null,
): string {
  if ((family === 'milk' || family === 'cream') && percent !== null) {
    return `${family}:${percentageLabel(percent)}`;
  }
  return `${family ?? 'other'}:${hit.mappedIngredientId ?? hit.id}`;
}

export interface CanonicalProductDiscoveryItem {
  hit: CatalogProductSearchHit;
  slotKey: string;
  primaryName: string;
  secondaryText: string | null;
  family: TechnologicalFamily;
  variantPercent: number | null;
}

const exactProductProjection = (hit: CatalogProductSearchHit): CanonicalProductDiscoveryItem => ({
  hit,
  slotKey: `${hit.entityKind}:${hit.id}`,
  primaryName: hit.displayName,
  secondaryText: hit.brand,
  family: technologicalFamilyFor(hit),
  variantPercent: technologicalPercent(hit),
});

/**
 * Generic technological intent projects commercial duplicates through their
 * canonical Mapper slot. Exact brand/EAN/article queries preserve exact products.
 * A Mapper reference wins a grouped slot. Canonical country/user resolution may
 * attach one exact product behind it without creating duplicate generic rows.
 */
export function projectCatalogHitsForDiscovery(input: {
  hits: readonly CatalogProductSearchHit[];
  query: string;
}): CanonicalProductDiscoveryItem[] {
  const intent = canonicalSearchConceptForQuery(input.query);
  if (intent === null) return input.hits.map(exactProductProjection);

  const candidates = input.hits
    .map((hit, index) => ({ hit, index, family: technologicalFamilyFor(hit) }))
    .filter((candidate) => candidate.family === intent);
  if (candidates.length === 0) return input.hits.map(exactProductProjection);

  const grouped = new Map<string, typeof candidates>();
  for (const candidate of candidates) {
    const percent = technologicalPercent(candidate.hit);
    const key = canonicalSlotKey(candidate.hit, candidate.family, percent);
    const group = grouped.get(key) ?? [];
    group.push(candidate);
    grouped.set(key, group);
  }

  return [...grouped.entries()]
    .flatMap(([slotKey, group]) => {
      const reference = group.find((candidate) => candidate.hit.entityKind === 'pi_base');
      // Until the country-default/user-preference authority lands, two exact
      // products without a canonical reference are ambiguous. Hiding that slot
      // is safer than making the first network row a silent business rule.
      if (!reference && group.length > 1) return [];
      const chosen = reference ?? group[0]!;
      const percent = technologicalPercent(chosen.hit);
      const resolvedExact = chosen.hit.resolvedExactProduct;
      return [
        {
          hit: chosen.hit,
          slotKey,
          primaryName: canonicalPrimaryName(chosen.hit, chosen.family, percent),
          secondaryText: resolvedExact
            ? resolvedExact.brand
              ? `${resolvedExact.brand} · ${resolvedExact.displayName}`
              : resolvedExact.displayName
            : chosen.hit.entityKind === 'commercial_product'
              ? chosen.hit.brand
              : null,
          family: chosen.family,
          variantPercent: percent,
          firstIndex: Math.min(...group.map((candidate) => candidate.index)),
        },
      ];
    })
    .sort((left, right) => {
      if (intent === 'milk' || intent === 'cream') {
        const leftPercent = left.variantPercent ?? Number.POSITIVE_INFINITY;
        const rightPercent = right.variantPercent ?? Number.POSITIVE_INFINITY;
        if (leftPercent !== rightPercent) return leftPercent - rightPercent;
      }
      return left.firstIndex - right.firstIndex;
    })
    .map((item) => ({
      hit: item.hit,
      slotKey: item.slotKey,
      primaryName: item.primaryName,
      secondaryText: item.secondaryText,
      family: item.family,
      variantPercent: item.variantPercent,
    }));
}

export interface ProductDiscoveryReplaceContext {
  filter: ProductDiscoveryTopFilter;
  subfilter: ProductDiscoverySubfilter;
  family: ProductDiscoveryReplaceFamily;
}

export function canonicalReplaceContext(
  hit: ProductDiscoveryMetadata,
): ProductDiscoveryReplaceContext {
  const family = technologicalFamilyFor(hit);
  const technical = technicalSubfilterFor(hit);
  if (technical) return { filter: 'technical', subfilter: technical, family: null };
  if (family === 'milk' || family === 'cream') {
    return { filter: 'dairy', subfilter: 'all', family };
  }
  if (family === 'dairy') return { filter: 'dairy', subfilter: 'all', family: null };
  if (family === 'fruit' || family === 'nuts' || family === 'chocolate') {
    return { filter: family, subfilter: 'all', family: null };
  }
  return { filter: 'all', subfilter: 'all', family: null };
}
