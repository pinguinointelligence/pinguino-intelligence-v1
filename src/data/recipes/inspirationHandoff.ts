/**
 * Discovery → current recipe-creation flow handoff.
 *
 * The URL carries intent metadata only. It deliberately has no `grams`, dose,
 * formula, role or Engine result field: the existing PINGÜINO flow remains the
 * only place that can formulate a technical recipe.
 */
import type { CustomerProductType } from '@/features/customer-flow/types';
import type { FlavorCatalogueEntry } from './flavorCatalogueTypes';

export interface InspirationStartIntent {
  source: 'flavor_inspiration' | 'curated_collection';
  sourceId: string;
  title: string;
  productType: CustomerProductType;
  definingIngredients: readonly string[];
  /** Existing canonical Mapper ids only. Never doses and never inferred ids. */
  canonicalIngredientIds: readonly string[];
  adaptationWarning: string | null;
  prompt: string;
}

const PRODUCT_LABEL: Readonly<Record<CustomerProductType, string>> = {
  gelato: 'Gelato',
  sorbet: 'Sorbet',
  vegan: 'Vegan',
  protein: 'Protein',
};

export function flavorInspirationStartIntent(entry: FlavorCatalogueEntry): InspirationStartIntent {
  const ingredients = entry.mainIngredients.slice(0, 4);
  return {
    source: 'flavor_inspiration',
    sourceId: entry.flavorCode,
    title: entry.flavorName,
    productType: entry.visibleProductType,
    definingIngredients: ingredients,
    canonicalIngredientIds: [],
    adaptationWarning: null,
    prompt: `${PRODUCT_LABEL[entry.visibleProductType]}: ${entry.flavorName}. Kierunek składników: ${ingredients.join(', ')}.`,
  };
}

export function inspirationStartHref(intent: InspirationStartIntent): string {
  const params = new URLSearchParams({
    source: intent.source,
    inspiration: intent.sourceId,
    product: intent.productType,
    idea: intent.prompt,
  });
  if (intent.canonicalIngredientIds.length > 0) {
    params.set('canonical', intent.canonicalIngredientIds.join(','));
  }
  if (intent.adaptationWarning !== null) params.set('adaptation', intent.adaptationWarning);
  return `/start?${params.toString()}`;
}

const PRODUCT_TYPES: ReadonlySet<string> = new Set(['gelato', 'sorbet', 'vegan', 'protein']);

/** Parse only our explicit discovery deep-link; ordinary `/start` stays unchanged. */
export function parseInspirationStartIntent(
  params: Pick<URLSearchParams, 'get'>,
): Pick<
  InspirationStartIntent,
  'source' | 'sourceId' | 'productType' | 'prompt' | 'adaptationWarning' | 'canonicalIngredientIds'
> | null {
  const source = params.get('source');
  const sourceId = params.get('inspiration')?.trim() ?? '';
  const product = params.get('product')?.trim() ?? '';
  const prompt = params.get('idea')?.trim() ?? '';
  if (
    (source !== 'flavor_inspiration' && source !== 'curated_collection') ||
    sourceId === '' ||
    prompt === '' ||
    !PRODUCT_TYPES.has(product)
  ) {
    return null;
  }
  return {
    source,
    sourceId,
    productType: product as CustomerProductType,
    prompt,
    adaptationWarning: params.get('adaptation')?.trim() || null,
    canonicalIngredientIds: (params.get('canonical') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => /^PI-ING-\d{6}$/.test(value)),
  };
}
