import { resolveFinalProductSemanticSearch } from './generated/productSemanticSearch.bundle.mjs';
import type { MapperSearchResolution } from '../../../src/features/mapper-search-runtime/types.ts';
import {
  bindExactProductSemanticContext,
  type ProductOnboardingSource,
  type ProductSemanticBinding,
} from '../../../src/features/product-intelligence/productSemanticBinding.ts';
import type { ProductSemanticClassification } from '../../../src/features/product-intelligence/productRecognition.ts';
import type { TrustedProductBehaviorAuthority } from '../../../src/features/product-intelligence/productBehaviorAuthority.ts';

export interface SharedSemanticIdentityEvidence {
  ean: string | null;
  brand: string | null;
  productName: string;
  variant: string | null;
  pack: string | null;
  category?: string | null;
  description?: string | null;
}

const hasBoundSearchConcept = (resolution: MapperSearchResolution): boolean =>
  resolution.searchMentions.some(
    (mention) =>
      mention.targetType === 'INGREDIENT_CONCEPT' || mention.targetType === 'NAMED_COMPOSITE',
  );

const carriesSearchAmbiguity = (resolution: MapperSearchResolution): boolean =>
  resolution.technicalMentions.some((mention) => mention.action === 'AMBIGUITY_GATE') ||
  resolution.searchGaps.some((gap) =>
    ['AMBIGUOUS_FALLBACK', 'AMBIGUOUS_TECHNICAL_CODE'].includes(gap.reason),
  );

/**
 * Build the service-only proposal that crosses the SQL transaction boundary.
 * The database replaces both SERVER_ASSIGNED sentinels and the provisional
 * article code with the exact product/version/code it actually persisted.
 */
export async function buildSharedProductSemanticBindingProposal(input: {
  source: ProductOnboardingSource;
  identity: SharedSemanticIdentityEvidence;
  recognition: ProductSemanticClassification;
  behavior: TrustedProductBehaviorAuthority;
  profileEngineUsable: boolean;
  profileRoleReady: boolean;
  publicationReady: boolean;
  marketCountries?: readonly string[];
}): Promise<ProductSemanticBinding> {
  const marketCountries = input.marketCountries ?? [];
  const identityQuery = [
    input.identity.productName,
    input.identity.variant,
    input.identity.category,
    input.recognition.ingredientFamily,
    input.recognition.physicalForm,
    input.recognition.flavorDomain,
    ...input.recognition.compatibleMapperCategories,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(' ');
  const identityResolution = await resolveFinalProductSemanticSearch(
    identityQuery,
    marketCountries,
  );
  const description = input.identity.description?.trim();
  // Exact name/variant/category are the product identity authority. A broad marketing sentence
  // can mention other foods, textures or colours and must not erase a concept already resolved
  // from that identity (the live Haribo copy did exactly that). Description remains a bounded
  // fallback only when identity is both unresolved and unambiguous.
  const searchResolution =
    hasBoundSearchConcept(identityResolution) ||
    carriesSearchAmbiguity(identityResolution) ||
    !description
      ? identityResolution
      : await resolveFinalProductSemanticSearch(
          `${identityQuery} ${description}`,
          marketCountries,
        );
  return bindExactProductSemanticContext({
    source: input.source,
    exactIdentity: {
      productId: 'SERVER_ASSIGNED_PRODUCT',
      articleCode: 'PR-ING-000000',
      productVersionId: 'SERVER_ASSIGNED_VERSION',
      ean: input.identity.ean,
      brand: input.identity.brand,
      productName: input.identity.productName,
      variant: input.identity.variant,
      pack: input.identity.pack,
    },
    recognition: input.recognition,
    behavior: input.behavior,
    searchResolution,
    profileEngineUsable: input.profileEngineUsable,
    profileRoleReady: input.profileRoleReady,
    publicationReady: input.publicationReady,
    marketCountries,
  });
}
