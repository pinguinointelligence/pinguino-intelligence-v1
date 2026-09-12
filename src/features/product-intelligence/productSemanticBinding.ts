import { MAPPER_SEARCH_RELEASE_ID } from '../mapper-search-runtime/generated/releaseManifest.ts';
import type { MapperSearchResolution } from '../mapper-search-runtime/types.ts';
import type { ProductSemanticClassification } from './productRecognition.ts';
import {
  supportsSemanticBehaviorReference,
  type TrustedProductBehaviorAuthority,
} from './productBehaviorAuthority.ts';

export const PRODUCT_SEMANTIC_BINDING_AUTHORITY = 'PR_ING_SEMANTIC_BINDING_V1' as const;

export type ProductOnboardingSource =
  | 'scanner'
  | 'recipe_library_import'
  | 'manual_import'
  | 'admin_import'
  | 'future_import'
  | 'revalidation';

export type ProductSemanticBindingState = 'RESOLVED' | 'UNRESOLVED' | 'CONFLICT';

export interface ExactProductIdentityBinding {
  productId: string;
  articleCode: string | null;
  productVersionId: string;
  ean: string | null;
  brand: string | null;
  productName: string;
  variant: string | null;
  pack: string | null;
}

export interface BoundSearchConcept {
  id: string;
  key: string;
  targetType: string;
}

export interface ProductSemanticBinding {
  authority: typeof PRODUCT_SEMANTIC_BINDING_AUTHORITY;
  source: ProductOnboardingSource;
  state: ProductSemanticBindingState;
  exactIdentity: ExactProductIdentityBinding;
  searchAuthority: {
    releaseId: string;
    concepts: BoundSearchConcept[];
    roleKeys: string[];
  };
  classification: {
    family: ProductSemanticClassification['ingredientFamily'];
    form: ProductSemanticClassification['physicalForm'];
    role: ProductSemanticClassification['intendedUsageRole'];
    archetype: ProductSemanticClassification['productArchetype'];
    flavorDomain: ProductSemanticClassification['flavorDomain'];
    compatibleMapperCategories: string[];
  };
  behavior: {
    familyId: string | null;
    subfamilyId: string | null;
    formId: string | null;
    behaviorRole: string;
    behaviorFingerprint: string;
    referenceMapperIngredientId: string | null;
    runtimeMapperIngredientId: null;
  };
  readiness: {
    privateRecipe: {
      base: boolean;
      topping: boolean;
    };
    publicCatalogue: boolean;
  };
  marketCountries: string[];
  reasonCodes: string[];
}

const canonicalArticleCode = /^(?:PR|PM|CA)-ING-\d{6}$/;

const normalizedGtin = (value: string | null): string | null => {
  const digits = value?.replace(/\D/g, '') ?? '';
  return digits.length >= 8 && digits.length <= 14 ? digits : null;
};

const exactIdentityIsStrong = (identity: ExactProductIdentityBinding): boolean =>
  Boolean(
    identity.productId.trim() && identity.productVersionId.trim() && identity.productName.trim(),
  ) &&
  (canonicalArticleCode.test(identity.articleCode ?? '') ||
    Boolean(normalizedGtin(identity.ean) && identity.brand?.trim()));

const boundConcepts = (resolution: MapperSearchResolution): BoundSearchConcept[] => {
  const mentions = resolution.searchMentions.flatMap((mention) => {
    const targetType = mention.targetType;
    if (targetType !== 'INGREDIENT_CONCEPT' && targetType !== 'NAMED_COMPOSITE') return [];
    return [
      {
        id: mention.specializationId ?? mention.targetId,
        key: mention.specializationKey ?? mention.targetKey,
        targetType,
      },
    ];
  });
  return [
    ...new Map(
      mentions.map((mention) => [`${mention.targetType}:${mention.id}`, mention]),
    ).values(),
  ];
};

/**
 * Bind an exact PR/PM/CA identity to the FINAL Mapper/Search concepts and the
 * server-issued ProductBehavior verdict. It never chooses or manufactures a
 * PI identity. Missing/ambiguous authority fails closed per role.
 */
export function bindExactProductSemanticContext(input: {
  source: ProductOnboardingSource;
  exactIdentity: ExactProductIdentityBinding;
  recognition: ProductSemanticClassification;
  behavior: TrustedProductBehaviorAuthority;
  searchResolution: MapperSearchResolution;
  profileEngineUsable: boolean;
  profileRoleReady: boolean;
  publicationReady: boolean;
  marketCountries?: readonly string[];
}): ProductSemanticBinding {
  const concepts =
    input.searchResolution.releaseId === MAPPER_SEARCH_RELEASE_ID
      ? boundConcepts(input.searchResolution)
      : [];
  const reasons = new Set<string>();
  if (!exactIdentityIsStrong(input.exactIdentity)) reasons.add('exact_product_identity_unresolved');
  if (!supportsSemanticBehaviorReference(input.recognition)) {
    reasons.add('product_semantics_unresolved');
  }
  if (input.behavior.classificationOutcome !== 'classified') {
    input.behavior.classificationReasonCodes.forEach((reason) => reasons.add(reason));
    reasons.add('product_behavior_unresolved');
  }
  if (input.behavior.intendedUsageRole !== input.recognition.intendedUsageRole) {
    reasons.add('role_conflict');
  }
  if (input.searchResolution.releaseId !== MAPPER_SEARCH_RELEASE_ID) {
    reasons.add('search_release_mismatch');
  } else if (concepts.length === 0) {
    reasons.add('search_concept_unresolved');
  }
  const searchAmbiguous =
    input.searchResolution.technicalMentions.some(
      (mention) => mention.action === 'AMBIGUITY_GATE',
    ) ||
    input.searchResolution.searchGaps.some((gap) =>
      ['AMBIGUOUS_FALLBACK', 'AMBIGUOUS_TECHNICAL_CODE'].includes(gap.reason),
    );
  if (searchAmbiguous) reasons.add('search_semantics_ambiguous');
  if (input.recognition.intendedUsageRole === 'NEITHER_REVIEW') {
    reasons.add('product_role_unresolved');
  }

  const conflict =
    input.behavior.intendedUsageRole !== input.recognition.intendedUsageRole ||
    input.behavior.classificationOutcome === 'blocked' ||
    searchAmbiguous;
  const state: ProductSemanticBindingState =
    reasons.size === 0 ? 'RESOLVED' : conflict ? 'CONFLICT' : 'UNRESOLVED';
  const authorityReady = state === 'RESOLVED';
  const base =
    authorityReady &&
    input.profileRoleReady &&
    input.behavior.baseRecipeEligible &&
    input.profileEngineUsable;
  const topping = authorityReady && input.profileRoleReady && input.behavior.toppingEligible;

  return {
    authority: PRODUCT_SEMANTIC_BINDING_AUTHORITY,
    source: input.source,
    state,
    exactIdentity: {
      ...input.exactIdentity,
      articleCode: input.exactIdentity.articleCode?.trim() || null,
      ean: normalizedGtin(input.exactIdentity.ean),
      brand: input.exactIdentity.brand?.trim() || null,
      productName: input.exactIdentity.productName.trim(),
      variant: input.exactIdentity.variant?.trim() || null,
      pack: input.exactIdentity.pack?.trim() || null,
    },
    searchAuthority: {
      releaseId: input.searchResolution.releaseId,
      concepts,
      roleKeys: [
        ...new Set(
          input.searchResolution.roleMentions
            .filter((mention) => !mention.negated)
            .flatMap(
              (mention) => [mention.roleKey, mention.roleSubtypeKey].filter(Boolean) as string[],
            ),
        ),
      ],
    },
    classification: {
      family: input.recognition.ingredientFamily,
      form: input.recognition.physicalForm,
      role: input.recognition.intendedUsageRole,
      archetype: input.recognition.productArchetype,
      flavorDomain: input.recognition.flavorDomain,
      compatibleMapperCategories: [...input.recognition.compatibleMapperCategories],
    },
    behavior: {
      familyId: input.behavior.familyId,
      subfamilyId: input.behavior.subfamilyId,
      formId: input.behavior.formId,
      behaviorRole: input.behavior.behaviorRole,
      behaviorFingerprint: input.behavior.behaviorFingerprint,
      referenceMapperIngredientId: input.behavior.referenceMapperIngredientId,
      runtimeMapperIngredientId: null,
    },
    readiness: {
      privateRecipe: { base, topping },
      publicCatalogue: authorityReady && input.publicationReady,
    },
    marketCountries: [
      ...new Set(
        (input.marketCountries ?? [])
          .map((country) => country.trim().toUpperCase())
          .filter((country) => /^[A-Z]{2}$/.test(country)),
      ),
    ],
    reasonCodes: [...reasons],
  };
}
