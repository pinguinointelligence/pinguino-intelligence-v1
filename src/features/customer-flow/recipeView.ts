/**
 * Customer result-card VIEW CONTRACT + DEMO REDACTION (Agent B) — pure.
 *
 * Builds the customer-visible recipe view. Exact grams appear ONLY when the
 * gram-visibility capability grants them. For a Demo persona the redaction
 * happens IN THE DATA: the returned line objects have NO `grams` property at all
 * (not merely hidden in the UI). Home and Pro receive exact grams through the
 * capability — NEVER through a raw `isPro` boolean.
 *
 * BOUNDARY: this module defines its OWN minimal capability interface. It does
 * not import the pro-core capability files — the integration layer maps a real
 * entitlement onto this shape.
 */
import type { CustomerProductType } from './types';

/**
 * The single gram-visibility capability the view depends on. Mirrors the
 * `canViewExactGrams` entitlement conceptually, kept local on purpose so the
 * pure view never reaches into another feature's capability module.
 */
export interface GramVisibilityCapability {
  canViewExactGrams: boolean;
}

/** Personas the integration layer resolves an entitlement onto. */
export type CustomerPersona = 'demo' | 'home' | 'pro';

const PERSONA_GRAM_VISIBILITY: Readonly<Record<CustomerPersona, boolean>> = {
  demo: false,
  home: true,
  pro: true,
};

/** Resolve the gram-visibility capability for a persona (never an isPro flag). */
export function gramVisibilityForPersona(persona: CustomerPersona): GramVisibilityCapability {
  return { canViewExactGrams: PERSONA_GRAM_VISIBILITY[persona] };
}

/* ------------------------------------------------------------------------ *
 * Input (source recipe, exact grams present) → View (redacted at source)    *
 * ------------------------------------------------------------------------ */

export interface CustomerRecipeLineInput {
  ingredientId: string;
  ingredientName: string;
  /** Exact grams from the source recipe. */
  grams: number;
}

export interface CustomerRecipeInput {
  recipeId: string;
  title: string;
  productType: CustomerProductType;
  lines: readonly CustomerRecipeLineInput[];
  servingProfile?: string;
}

export interface CustomerRecipeViewLine {
  ingredientId: string;
  ingredientName: string;
  /** Present ONLY when the capability grants exact grams; OMITTED otherwise. */
  grams?: number;
}

export interface CustomerRecipeView {
  recipeId: string;
  title: string;
  productType: CustomerProductType;
  /** True only when exact grams are present in the returned data. */
  gramsVisible: boolean;
  lines: CustomerRecipeViewLine[];
  servingProfile?: string;
}

/**
 * Build the customer-visible recipe view, redacting at source. When the
 * capability withholds exact grams (Demo), each returned line is constructed
 * WITHOUT a `grams` property — the number never enters the payload.
 */
export function buildCustomerRecipeView(
  recipe: CustomerRecipeInput,
  capability: GramVisibilityCapability,
): CustomerRecipeView {
  const gramsVisible = capability.canViewExactGrams === true;

  const lines: CustomerRecipeViewLine[] = recipe.lines.map((line) => {
    const base: CustomerRecipeViewLine = {
      ingredientId: line.ingredientId,
      ingredientName: line.ingredientName,
    };
    // Only attach grams when allowed — Demo lines carry no grams key at all.
    return gramsVisible ? { ...base, grams: line.grams } : base;
  });

  return {
    recipeId: recipe.recipeId,
    title: recipe.title,
    productType: recipe.productType,
    gramsVisible,
    lines,
    ...(recipe.servingProfile !== undefined ? { servingProfile: recipe.servingProfile } : {}),
  };
}
