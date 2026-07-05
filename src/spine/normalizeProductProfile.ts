/**
 * PINGUINO Spine — product-profile normalization (Product_Profile.md §4,
 * Recipe_Intent.md §10, locked v1.0).
 *
 * Pure mapping of legacy/current names onto the four active profiles.
 * Unsupported v1.0 inputs (granita, protein, fresh, storage, frozen drinks)
 * return a structured unsupported result with a warning — they are NEVER
 * silently mapped to a supported profile. Anything unrecognized is likewise
 * unsupported, never guessed.
 */
import type { DesignerWarning, ProductProfile } from './types';

/** Legacy/current aliases → active v1.0 profiles (locked mapping). */
export const PRODUCT_PROFILE_ALIASES: Readonly<Record<string, ProductProfile>> = {
  gelato: 'standard_gelato',
  milk_gelato: 'standard_gelato',
  fruit_gelato: 'standard_gelato',
  nut_gelato: 'standard_gelato',
  alcohol_gelato: 'standard_gelato',

  standard_gelato: 'standard_gelato',

  sorbet: 'sorbet',

  vegan: 'vegan_gelato',
  vegan_gelato: 'vegan_gelato',

  chocolate: 'chocolate_gelato',
  chocolate_gelato: 'chocolate_gelato',
};

/** Known but outside v1.0 scope — must warn, never silently map. */
export const UNSUPPORTED_PRODUCT_PROFILES_V1 = [
  'granita',
  'protein',
  'protein_gelato',
  'fresh',
  'storage_minus18',
  'frozen_drinks',
  'slush',
] as const;

export interface ProductProfileNormalizationOk {
  status: 'ok';
  profile: ProductProfile;
  /** Raw input as received. */
  input: string;
  /** Input after mechanical hygiene (trim/lowercase/underscores). */
  canonicalInput: string;
  warnings: DesignerWarning[];
}

export interface ProductProfileNormalizationUnsupported {
  status: 'unsupported_product_profile';
  profile: null;
  input: string;
  canonicalInput: string;
  warnings: DesignerWarning[];
}

export type ProductProfileNormalization =
  | ProductProfileNormalizationOk
  | ProductProfileNormalizationUnsupported;

/** Mechanical input hygiene only — no flavor parsing, no intent guessing. */
const canonicalize = (raw: string): string =>
  raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

/**
 * Normalize a product-profile name. Pure and deterministic:
 * - known alias → active profile (+ `legacy_profile_normalized` info warning
 *   when the alias differs from the canonical profile id),
 * - known-unsupported → structured unsupported result
 *   (`granita_unsupported_v1` for granita, `unsupported_product_profile` otherwise),
 * - anything else → unsupported, never silently mapped.
 */
export function normalizeProductProfile(rawInput: string): ProductProfileNormalization {
  const canonicalInput = canonicalize(rawInput);

  const aliased = PRODUCT_PROFILE_ALIASES[canonicalInput];
  if (aliased !== undefined) {
    const warnings: DesignerWarning[] =
      canonicalInput === aliased
        ? []
        : [
            {
              code: 'legacy_profile_normalized',
              severity: 'info',
              messageKey: 'spine.product_profile.legacy_normalized',
              context: { from: canonicalInput, to: aliased },
            },
          ];
    return { status: 'ok', profile: aliased, input: rawInput, canonicalInput, warnings };
  }

  if (canonicalInput === 'granita') {
    return {
      status: 'unsupported_product_profile',
      profile: null,
      input: rawInput,
      canonicalInput,
      warnings: [
        {
          code: 'granita_unsupported_v1',
          severity: 'warning',
          messageKey: 'spine.product_profile.granita_unsupported_v1',
        },
      ],
    };
  }

  const knownUnsupported = (UNSUPPORTED_PRODUCT_PROFILES_V1 as readonly string[]).includes(
    canonicalInput,
  );
  return {
    status: 'unsupported_product_profile',
    profile: null,
    input: rawInput,
    canonicalInput,
    warnings: [
      {
        code: 'unsupported_product_profile',
        severity: 'warning',
        messageKey: knownUnsupported
          ? 'spine.product_profile.unsupported_v1'
          : 'spine.product_profile.unrecognized',
        context: { input: canonicalInput },
      },
    ],
  };
}
