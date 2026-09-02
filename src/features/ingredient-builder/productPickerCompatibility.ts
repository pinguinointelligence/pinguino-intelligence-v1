import type { CatalogProductSearchHit } from '@/features/global-catalog/contracts';
import type {
  ProductCapability,
  ProductPickerAttemptContext,
} from '@/services/productCapabilityReanalysis';
import { normalizeSearchText } from './ingredientSearch';

export type ProductPickerScope = 'BASE_FORMULATION' | 'POST_PROCESS_ADDON';

export type ProductPickerCompatibility =
  | { state: 'ALLOWED' }
  | { state: 'BLOCKED' }
  | {
      state: 'AVAILABLE_IN_OTHER_CONTEXT';
      availableAs: ProductCapability;
      redirectScope: ProductPickerScope;
      requestedCapability: ProductCapability;
      attemptedContext: ProductPickerAttemptContext;
    };

/**
 * The server-projected role capabilities are the only picker truth. This model
 * deliberately does not compare presentation strings such as TOPPING_ONLY:
 * canonical ProductBehavior may change its vocabulary while these permissions
 * remain the executable contract.
 */
export function getProductPickerCompatibility(
  hit: Pick<CatalogProductSearchHit, 'usableInBase' | 'usableAsTopping'>,
  scope: ProductPickerScope,
): ProductPickerCompatibility {
  const currentAllowed = scope === 'BASE_FORMULATION' ? hit.usableInBase : hit.usableAsTopping;
  if (currentAllowed) return { state: 'ALLOWED' };

  const otherAllowed = scope === 'BASE_FORMULATION' ? hit.usableAsTopping : hit.usableInBase;
  if (!otherAllowed) return { state: 'BLOCKED' };

  return scope === 'BASE_FORMULATION'
    ? {
        state: 'AVAILABLE_IN_OTHER_CONTEXT',
        availableAs: 'TOPPING',
        redirectScope: 'POST_PROCESS_ADDON',
        requestedCapability: 'INGREDIENT',
        attemptedContext: 'INGREDIENT_PICKER',
      }
    : {
        state: 'AVAILABLE_IN_OTHER_CONTEXT',
        availableAs: 'INGREDIENT',
        redirectScope: 'BASE_FORMULATION',
        requestedCapability: 'TOPPING',
        attemptedContext: 'TOPPING_PICKER',
      };
}

/**
 * Wrong-context rows are discovery aids, not catalogue browse content. Admit
 * only an explicit identity match: full/prefix product name, exact brand,
 * article/EAN, or a distinctive whole alias. The caller also caps the number
 * of contextual rows so broad brand searches cannot flood the valid results.
 */
export function contextualPickerMatch(
  hit: Pick<
    CatalogProductSearchHit,
    'displayName' | 'originalName' | 'brand' | 'productCode' | 'eans' | 'aliases'
  >,
  query: string,
): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery.length < 3) return false;

  const displayNames = [hit.displayName, hit.originalName]
    .filter((value): value is string => Boolean(value))
    .map(normalizeSearchText)
    .filter(Boolean);
  const exactIdentities = [hit.brand, hit.productCode, ...hit.eans]
    .filter((value): value is string => Boolean(value))
    .map(normalizeSearchText)
    .filter(Boolean);
  const aliases = hit.aliases.map(normalizeSearchText).filter(Boolean);

  if (exactIdentities.includes(normalizedQuery)) return true;
  if (
    displayNames.some((name) => name === normalizedQuery || name.startsWith(`${normalizedQuery} `))
  ) {
    return true;
  }
  return normalizedQuery.length >= 4 && aliases.some((alias) => alias === normalizedQuery);
}
