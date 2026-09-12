import {
  planMapperCatalogSearch,
  type MapperSearchResolution,
} from '@/features/mapper-search-runtime';
import {
  bindExactProductSemanticContext,
  type ProductOnboardingSource,
  type ProductSemanticBinding,
} from '@/features/product-intelligence/productSemanticBinding';
import type { ProductSemanticClassification } from '@/features/product-intelligence/productRecognition';
import type { TrustedProductBehaviorAuthority } from '@/features/product-intelligence/productBehaviorAuthority';
import type { CatalogProductSearchHit } from './contracts';

const objectAt = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const stringOrNull = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';

const stringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

function trustedPersistedSemanticBindingAt(
  hit: CatalogProductSearchHit,
): ProductSemanticBinding | null {
  const binding = objectAt(hit.publicData.productSemanticBinding);
  const identity = objectAt(binding?.exactIdentity);
  const search = objectAt(binding?.searchAuthority);
  const classification = objectAt(binding?.classification);
  const behavior = objectAt(binding?.behavior);
  const readiness = objectAt(binding?.readiness);
  const privateRecipe = objectAt(readiness?.privateRecipe);
  const concepts = Array.isArray(search?.concepts) ? search.concepts.map(objectAt) : [];
  if (
    binding?.authority !== 'PR_ING_SEMANTIC_BINDING_V1' ||
    !['RESOLVED', 'UNRESOLVED', 'CONFLICT'].includes(String(binding.state)) ||
    identity?.productId !== hit.id ||
    identity.productVersionId !== hit.currentVersionId ||
    (hit.productCode && identity.articleCode !== hit.productCode) ||
    search?.releaseId !== 'GELLATTI-SA10-2026-09-10-FINAL' ||
    (binding.state === 'RESOLVED' &&
      (concepts.length === 0 ||
        concepts.some(
          (concept) =>
            !concept ||
            typeof concept.id !== 'string' ||
            concept.id.startsWith('PI-') ||
            typeof concept.key !== 'string' ||
            !['INGREDIENT_CONCEPT', 'NAMED_COMPOSITE'].includes(String(concept.targetType)),
        ))) ||
    typeof classification?.family !== 'string' ||
    typeof classification.form !== 'string' ||
    typeof classification.role !== 'string' ||
    behavior?.runtimeMapperIngredientId !== null ||
    typeof behavior.behaviorFingerprint !== 'string' ||
    typeof privateRecipe?.base !== 'boolean' ||
    typeof privateRecipe.topping !== 'boolean' ||
    typeof readiness?.publicCatalogue !== 'boolean' ||
    !stringArray(binding.reasonCodes)
  ) {
    return null;
  }
  return binding as unknown as ProductSemanticBinding;
}

function trustedRecognitionAt(
  publicData: Record<string, unknown>,
): ProductSemanticClassification | null {
  const intelligence = objectAt(publicData.productIntelligence);
  const profile = objectAt(intelligence?.productProfileAuthority);
  const recognition = objectAt(profile?.recognition);
  if (
    recognition?.authority !== 'PRODUCT_RECOGNITION_V2' ||
    typeof recognition.classificationSource !== 'string' ||
    typeof recognition.productArchetype !== 'string' ||
    typeof recognition.ingredientFamily !== 'string' ||
    typeof recognition.physicalForm !== 'string' ||
    typeof recognition.intendedUsageRole !== 'string' ||
    typeof recognition.flavorDomain !== 'string' ||
    typeof recognition.modelRequired !== 'boolean' ||
    typeof recognition.confidence !== 'number' ||
    !Number.isFinite(recognition.confidence) ||
    !stringArray(recognition.compatibleMapperCategories) ||
    !stringArray(recognition.evidenceRefs)
  ) {
    return null;
  }
  return recognition as unknown as ProductSemanticClassification;
}

function trustedBehaviorAt(
  publicData: Record<string, unknown>,
): TrustedProductBehaviorAuthority | null {
  const intelligence = objectAt(publicData.productIntelligence);
  const behavior = objectAt(intelligence?.productBehaviorAuthority);
  if (
    behavior?.authority !== 'PRODUCT_BEHAVIOR_V1' ||
    behavior.validationMode !== 'server_recomputed_product_behavior' ||
    behavior.articleIdentity !== 'PRODUCT_OWNED' ||
    !['classified', 'unknown_requires_review', 'blocked'].includes(
      String(behavior.classificationOutcome),
    ) ||
    typeof behavior.baseRecipeEligible !== 'boolean' ||
    typeof behavior.toppingEligible !== 'boolean' ||
    typeof behavior.intendedUsageRole !== 'string' ||
    !stringOrNull(behavior.referenceMapperIngredientId) ||
    behavior.runtimeMapperIngredientId !== null ||
    !stringOrNull(behavior.familyId) ||
    !stringOrNull(behavior.subfamilyId) ||
    !stringOrNull(behavior.formId) ||
    typeof behavior.behaviorRole !== 'string' ||
    typeof behavior.behaviorFingerprint !== 'string' ||
    !stringArray(behavior.classificationReasonCodes)
  ) {
    return null;
  }
  return behavior as unknown as TrustedProductBehaviorAuthority;
}

const onboardingSourceFor = (hit: CatalogProductSearchHit): ProductOnboardingSource => {
  const provenance = hit.provenance?.toLocaleLowerCase('en-US') ?? '';
  if (provenance.includes('scanner')) return 'scanner';
  if (provenance.includes('catalog_import')) return 'recipe_library_import';
  if (provenance.includes('admin')) return 'admin_import';
  if (provenance.includes('manual')) return 'manual_import';
  return 'revalidation';
};

/**
 * Enrich a server-authoritative commercial result with its exact semantic
 * context. The FINAL Search runtime supplies concepts only; it never replaces
 * the PR/PM/CA identity with a PI row or changes server role permissions.
 */
export function catalogProductSemanticBinding(
  hit: CatalogProductSearchHit,
  searchResolution: MapperSearchResolution,
  source: ProductOnboardingSource = onboardingSourceFor(hit),
): ProductSemanticBinding | null {
  if (hit.entityKind !== 'commercial_product' || !hit.currentVersionId) return null;
  const persisted = trustedPersistedSemanticBindingAt(hit);
  if (persisted) return persisted;
  const recognition = trustedRecognitionAt(hit.publicData);
  const behavior = trustedBehaviorAt(hit.publicData);
  if (!recognition || !behavior) return null;
  const intelligence = objectAt(hit.publicData.productIntelligence);
  const profile = objectAt(intelligence?.productProfileAuthority);
  const accuracy = objectAt(profile?.productAccuracyAssessment);
  const gellattiReadiness = objectAt(accuracy?.gellattiReadiness);
  const exactIdentity = objectAt(hit.publicData.identity);
  const packageValue = objectAt(hit.publicData.package);
  const numericPackage =
    typeof packageValue?.netQuantity === 'number' && typeof packageValue.unit === 'string'
      ? `${packageValue.netQuantity} ${packageValue.unit}`
      : null;
  const pack =
    typeof exactIdentity?.netQuantity === 'string'
      ? exactIdentity.netQuantity
      : typeof packageValue?.netQuantityText === 'string'
        ? packageValue.netQuantityText
        : (numericPackage ??
          (typeof hit.publicData.netQuantity === 'string' ? hit.publicData.netQuantity : null));

  return bindExactProductSemanticContext({
    source,
    exactIdentity: {
      productId: hit.id,
      articleCode: hit.productCode ?? null,
      productVersionId: hit.currentVersionId,
      ean: hit.eans[0] ?? null,
      brand: hit.brand,
      productName: hit.displayName,
      variant: typeof exactIdentity?.variant === 'string' ? exactIdentity.variant : null,
      pack,
    },
    recognition,
    behavior,
    searchResolution,
    profileEngineUsable: intelligence?.engineUsable === true,
    profileRoleReady: gellattiReadiness?.ready === true,
    publicationReady:
      hit.status === 'verified' && hit.missingFields.length === 0 && hit.invalidFields.length === 0,
    marketCountries: hit.markets,
  });
}

export function attachCatalogProductSemanticBinding(
  hit: CatalogProductSearchHit,
  searchResolution: MapperSearchResolution,
  source?: ProductOnboardingSource,
): CatalogProductSearchHit {
  const semanticBinding = catalogProductSemanticBinding(hit, searchResolution, source);
  return semanticBinding ? { ...hit, semanticBinding } : hit;
}

export function catalogProductSemanticSearchText(
  hit: CatalogProductSearchHit,
  recognition: ProductSemanticClassification,
): string {
  return [
    hit.displayName,
    hit.originalName,
    hit.category,
    hit.canonicalFamily,
    hit.productForm,
    ...hit.aliases,
    recognition.ingredientFamily,
    recognition.physicalForm,
    recognition.flavorDomain,
    ...recognition.compatibleMapperCategories,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(' ');
}

/** Resolve FINAL Search from the exact product's own evidence, never from the
 * user's broad discovery query (which may match many semantically different SKUs). */
export async function attachCatalogProductSemanticBindingFromFinalSearch(
  hit: CatalogProductSearchHit,
  source?: ProductOnboardingSource,
): Promise<CatalogProductSearchHit> {
  if (hit.entityKind !== 'commercial_product') return hit;
  const persisted = trustedPersistedSemanticBindingAt(hit);
  if (persisted) return { ...hit, semanticBinding: persisted };
  const recognition = trustedRecognitionAt(hit.publicData);
  if (!recognition) return hit;
  const semanticQuery = catalogProductSemanticSearchText(hit, recognition);
  const plan = await planMapperCatalogSearch(semanticQuery, {
    marketScope: hit.markets[0] ?? 'GLOBAL',
  });
  return attachCatalogProductSemanticBinding(hit, plan.resolution, source);
}
