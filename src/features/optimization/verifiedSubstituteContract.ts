/**
 * Verified-composition substitute contract (Spine Slice 22) — the PURE gate
 * that decides which substitutes may enter the IF10 EXACT recalculation.
 *
 * The IF10 spine router already refuses unverified / unsafe substitutes at the
 * flag level; this contract is the stricter features-level requirement for
 * NUMBERS: a substitute earns an exact preview only with a complete, engine-
 * ready composition AND allowlisted provenance AND every safety gate passing.
 *
 * Provenance hard rules (allowlist + explicit denials):
 *  - accepted sources: `internal_reference_catalog`, `owner_verified_entry`;
 *  - Mapper product rows are NEVER accepted as verified composition (they are
 *    match candidates, not calibrated references);
 *  - PI Calculated products are NEVER accepted as verified substitutes
 *    (calculated ≠ verified);
 *  - verification status must be one of `verified_reference` /
 *    `calibrated_reference` / `owner_approved_reference` — anything else blocks.
 *
 * Safety hard rules (mirror the spine router; NEVER silent):
 *  - dairy into a dairy-forbidding profile (sorbet/vegan) blocks — NO approval
 *    flag can override it;
 *  - allergen-carrying substitutes require explicit approval;
 *  - alcohol-carrying substitutes require explicit approval;
 *  - sweetener/polyol/HIS substitutes require an explicit supported rule;
 *  - the substitute family must match the original line's family unless
 *    cross-family substitution is EXPLICITLY approved, and must be allowed for
 *    the product profile; unknown families block, never guessed;
 *  - a hero-line substitution is allowed but ALWAYS warned as an identity
 *    change (locked §18: the hero is never silently altered).
 *
 * Pure module: no DB, no Mapper, no inventory, no persistence, no mutation.
 */
import type { IngredientCategory, IngredientComponentProfile } from '@/engine';
import {
  DAIRY_CORRECTION_FAMILIES,
  PRODUCT_PROFILE_REGISTRY,
  type CorrectionFamily,
  type ProductProfile,
  type StockShortageConstraints,
  type StockShortageSubstitute,
} from '@/spine';

export type SubstituteVerificationStatus =
  | 'verified_reference'
  | 'calibrated_reference'
  | 'owner_approved_reference';

/** Sources a verified substitute may come from — everything else blocks. */
export const ALLOWED_SUBSTITUTE_SOURCES = [
  'internal_reference_catalog',
  'owner_verified_entry',
] as const;
export type AllowedSubstituteSource = (typeof ALLOWED_SUBSTITUTE_SOURCES)[number];

export interface VerifiedSubstituteContract {
  /** The original recipe line this substitute covers. */
  lineId: string;
  originalIngredientName: string;
  originalFamily: CorrectionFamily | null;

  substituteId: string;
  substituteName: string;
  substituteFamily: CorrectionFamily | null;
  /** Engine ingredient category for the in-memory substitute line. */
  engineCategory: IngredientCategory;

  /** COMPLETE engine composition — validated field-by-field; missing blocks. */
  composition: IngredientComponentProfile;
  /** Optional stored engine values (same semantics as EngineIngredient). */
  podValue?: number | null;
  pacValue?: number | null;
  deValue?: number | null;

  provenance: {
    /** Untrusted label — validated against the allowlist + explicit denials. */
    source: string;
    verification: SubstituteVerificationStatus;
  };

  containsAllergens?: boolean;
  isDairy?: boolean;
  containsAlcohol?: boolean;
  isSweetenerPolyolOrHis?: boolean;
  /** True when the substituted line is the hero/main flavor ingredient. */
  substitutesHeroLine?: boolean;
}

export interface SubstituteValidationContext {
  /** Untrusted — unsupported profiles block. */
  productProfile: string;
  /** The IF10 constraints carrying the explicit approval flags. */
  constraints: Pick<
    StockShortageConstraints,
    'allergenSubstitutionApproved' | 'alcoholSubstitutionApproved' | 'sweetenerSubstitutionRuleApproved'
  >;
  /** Cross-family substitution must be EXPLICITLY supported — default no. */
  crossFamilyApproved?: boolean;
}

export interface SubstituteValidation {
  valid: boolean;
  /** Deterministic block codes (empty when valid). */
  blockedReasons: string[];
  /** Non-blocking honesty flags (e.g. the hero identity-change warning). */
  warnings: string[];
}

/** The 16 composition fields the engine consumes — all required and finite. */
const COMPOSITION_FIELDS: readonly (keyof IngredientComponentProfile)[] = [
  'water_percent',
  'solids_percent',
  'fat_percent',
  'protein_percent',
  'carbohydrate_percent',
  'sugar_percent',
  'sucrose_percent',
  'glucose_percent',
  'dextrose_percent',
  'fructose_percent',
  'lactose_percent',
  'polyol_percent',
  'fiber_percent',
  'salt_percent',
  'alcohol_percent',
  'kcal_per_100g',
];

const DAIRY: ReadonlySet<string> = new Set(DAIRY_CORRECTION_FAMILIES);

const isSupportedProfile = (p: string): boolean =>
  Object.prototype.hasOwnProperty.call(PRODUCT_PROFILE_REGISTRY, p);

/**
 * Validate one substitute contract against the profile + explicit approvals.
 * Pure and deterministic; mutates nothing. Every block reason is surfaced —
 * nothing is silently accepted or remapped.
 */
export function validateVerifiedSubstitute(
  contract: VerifiedSubstituteContract,
  ctx: SubstituteValidationContext,
): SubstituteValidation {
  const blockedReasons: string[] = [];
  const warnings: string[] = [];

  // Provenance: explicit denials first (clear reasons), then the allowlist.
  const source = (contract.provenance?.source ?? '').toLowerCase();
  if (source.includes('mapper')) {
    blockedReasons.push('mapper_products_never_calibrated_substitutes');
  } else if (source.includes('pi_calculated')) {
    blockedReasons.push('pi_calculated_never_verified_substitute');
  } else if (!(ALLOWED_SUBSTITUTE_SOURCES as readonly string[]).includes(contract.provenance?.source)) {
    blockedReasons.push('substitute_source_not_allowed');
  }
  const verification = contract.provenance?.verification as string;
  if (
    verification !== 'verified_reference' &&
    verification !== 'calibrated_reference' &&
    verification !== 'owner_approved_reference'
  ) {
    blockedReasons.push('unverified_substitute');
  }

  // Composition: complete, finite, sane — missing composition blocks.
  const composition = contract.composition;
  const compositionInvalid =
    !composition ||
    COMPOSITION_FIELDS.some((field) => {
      const v = composition[field];
      return typeof v !== 'number' || !Number.isFinite(v) || v < 0;
    });
  if (compositionInvalid) {
    blockedReasons.push('missing_or_invalid_composition');
  } else if (Math.abs(composition.water_percent + composition.solids_percent - 100) > 0.5) {
    blockedReasons.push('composition_water_solids_inconsistent');
  }

  // Profile + family gates.
  if (!isSupportedProfile(ctx.productProfile)) {
    blockedReasons.push('unsupported_product_profile');
  } else {
    const def = PRODUCT_PROFILE_REGISTRY[ctx.productProfile as ProductProfile];
    const allowed = new Set<string>(def.allowedCorrectionFamilies);
    const forbidden = new Set<string>(def.forbiddenCorrectionFamilies);

    const substituteIsDairy =
      contract.isDairy === true ||
      (contract.substituteFamily !== null && DAIRY.has(contract.substituteFamily));
    if (
      substituteIsDairy &&
      (forbidden.has('milk') || forbidden.has('cream') || forbidden.has('skimmed_milk_powder'))
    ) {
      // Hard block — no approval flag can override dairy into sorbet/vegan.
      blockedReasons.push('dairy_substitute_forbidden_for_profile');
    }
    if (contract.substituteFamily === null) {
      blockedReasons.push('substitute_family_unknown');
    } else if (!allowed.has(contract.substituteFamily)) {
      blockedReasons.push('substitute_family_not_allowed_for_profile');
    }
    if (
      contract.substituteFamily !== null &&
      contract.originalFamily !== null &&
      contract.substituteFamily !== contract.originalFamily &&
      ctx.crossFamilyApproved !== true
    ) {
      blockedReasons.push('substitute_family_mismatch_requires_explicit_support');
    }
  }

  // Explicit-approval safety gates — substitution is never silent.
  if (contract.containsAllergens === true && ctx.constraints.allergenSubstitutionApproved !== true) {
    blockedReasons.push('allergen_substitution_requires_explicit_approval');
  }
  if (contract.containsAlcohol === true && ctx.constraints.alcoholSubstitutionApproved !== true) {
    blockedReasons.push('alcohol_substitution_requires_explicit_approval');
  }
  if (
    contract.isSweetenerPolyolOrHis === true &&
    ctx.constraints.sweetenerSubstitutionRuleApproved !== true
  ) {
    blockedReasons.push('sweetener_polyol_his_substitution_requires_supported_rule');
  }

  // Hero substitution: allowed, but ALWAYS an explicit identity-change warning.
  if (contract.substitutesHeroLine === true) {
    warnings.push('hero_ingredient_substitution_changes_product_identity');
  }

  return { valid: blockedReasons.length === 0, blockedReasons, warnings };
}

/**
 * Derive the flag-level spine substitute from a contract, POST-validation —
 * so the IF10 router and the exact preview judge the SAME facts. The
 * `hasVerifiedIngredientData` flag is the validation result, never asserted
 * independently.
 */
export function substituteToShortageLine(
  contract: VerifiedSubstituteContract,
  validation: SubstituteValidation,
): StockShortageSubstitute {
  return {
    ingredientName: contract.substituteName,
    available: true,
    hasVerifiedIngredientData: validation.valid,
    correctionFamily: contract.substituteFamily,
    isDairy: contract.isDairy,
    containsAllergens: contract.containsAllergens,
    containsAlcohol: contract.containsAlcohol,
    isSweetenerPolyolOrHis: contract.isSweetenerPolyolOrHis,
  };
}
