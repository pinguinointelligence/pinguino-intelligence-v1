/**
 * PINGÜINO Customer Flow — shared pure types (Agent B).
 *
 * The customer-flow namespace is the PURE, deterministic conversational layer
 * that sits ABOVE the locked spine intent normalizer (`@/spine`). It owns the
 * customer-facing question script, honest gap states, device/batch handling,
 * ready-recipe matching and the demo-redaction view contract.
 *
 * HARD SCOPE (test-pinned):
 *  - no IO, no DOM, no clock, no randomness — every function returns NEW state;
 *  - no engine math and no recipe gram generation here (that is the engine's
 *    job at integration, via the public `@/engine` barrel);
 *  - flavor / profile detection and internal chocolate routing are REUSED from
 *    the locked spine parser — never re-implemented here;
 *  - the customer NEVER chooses "Chocolate": chocolate is an INTERNAL engine
 *    profile only. The only visible product-type choices are the four below.
 */
import type { ProductCategory } from '@/engine';
import type { ProductProfile } from '@/spine';

/**
 * The ONLY product-type choices ever shown to a customer. "Chocolate" is
 * deliberately absent — chocolate intent is routed to the internal engine
 * profile without ever surfacing as a user choice.
 */
export type CustomerProductType = 'gelato' | 'sorbet' | 'vegan' | 'protein';

/** The visible product-type choices, in stable display order (never chocolate). */
export const CUSTOMER_PRODUCT_TYPE_CHOICES: readonly CustomerProductType[] = [
  'gelato',
  'sorbet',
  'vegan',
  'protein',
];

/** New recipe vs. ready recipe — two EQUAL options (no default, no primary). */
export type RecipePath = 'new_recipe' | 'ready_recipe';

export interface RecipePathOption {
  path: RecipePath;
  /** Both options are presented with equal weight — neither is a default. */
  equalWeight: true;
}

export const RECIPE_PATH_OPTIONS: readonly RecipePathOption[] = [
  { path: 'new_recipe', equalWeight: true },
  { path: 'ready_recipe', equalWeight: true },
];

/**
 * Spine flavor tags that mean "chocolate family". Used to gate the INTERNAL
 * chocolate engine profile off the editable flavor chips (so a corrected /
 * removed chocolate chip is honored deterministically).
 */
export const CHOCOLATE_FLAVOR_TAGS: ReadonlySet<string> = new Set(['chocolate', 'cocoa', 'gianduja']);

/**
 * The customer→spine product-profile string for each visible choice. `protein`
 * maps to the spine's known-unsupported value ON PURPOSE — the spine returns an
 * honest `unsupported_product_profile` warning, which the customer flow surfaces
 * as a validation_required gap instead of a silent fallback.
 */
export const CUSTOMER_TYPE_TO_SPINE_PROFILE_INPUT: Readonly<Record<CustomerProductType, string>> = {
  gelato: 'gelato',
  sorbet: 'sorbet',
  vegan: 'vegan',
  protein: 'protein',
};

/**
 * Internal spine profile → engine ProductCategory. `standard_gelato` maps to the
 * milk base; chocolate/sorbet/vegan carry their own dedicated categories. This is
 * the documented mapping, never a fabricated one.
 */
export const SPINE_PROFILE_TO_ENGINE_CATEGORY: Readonly<Record<ProductProfile, ProductCategory>> = {
  standard_gelato: 'milk_gelato',
  chocolate_gelato: 'chocolate_gelato',
  sorbet: 'sorbet',
  vegan_gelato: 'vegan_gelato',
};

/** The customer-facing type a resolved internal profile maps back to. */
export const SPINE_PROFILE_TO_CUSTOMER_TYPE: Readonly<Record<ProductProfile, CustomerProductType>> = {
  // chocolate_gelato is still shown to the customer as Gelato (never "Chocolate").
  standard_gelato: 'gelato',
  chocolate_gelato: 'gelato',
  sorbet: 'sorbet',
  vegan_gelato: 'vegan',
};

/** The questions the customer flow can ask (deterministic, ordered by priority). */
export type CustomerFlowQuestionId =
  | 'product_type'
  | 'device_capacity'
  | 'batch'
  | 'recipe_path';
