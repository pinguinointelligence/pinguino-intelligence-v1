import { resolveFinalProductSemanticSearch } from './generated/productSemanticSearch.bundle.mjs';
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
  const query = [
    input.identity.productName,
    input.identity.variant,
    input.identity.category,
    input.identity.description,
    input.recognition.ingredientFamily,
    input.recognition.physicalForm,
    input.recognition.flavorDomain,
    ...input.recognition.compatibleMapperCategories,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(' ');
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
    searchResolution: await resolveFinalProductSemanticSearch(query, marketCountries),
    profileEngineUsable: input.profileEngineUsable,
    profileRoleReady: input.profileRoleReady,
    publicationReady: input.publicationReady,
    marketCountries,
  });
}
