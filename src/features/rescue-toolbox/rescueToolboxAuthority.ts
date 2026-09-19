/**
 * THE ONE CANONICAL RESCUE TOOLBOX AUTHORITY (NAPRAWA 5).
 *
 * Before this file the repository held several overlapping answers to „may this
 * ingredient be offered as a Rescue candidate, and at what dose":
 * `starterPackRescuePalette`, `rescueIngredientAdvisor`'s candidate family, the
 * profile formulation toolboxes and the Starter Pack palette logic. They did not
 * agree — the palette refused EVERY candidate on a Protein draft with
 * `blocked_science`, while the Owner's decision is that Protein uses the REAL
 * Protein authority and is not globally disabled.
 *
 * Independent lists that disagree about whether Fructose exists are the defect.
 * This module is the single source of truth. The older modules may remain as
 * adapters, but they delegate here; nothing else may restate a candidate list, a
 * compatibility rule or a dosage window.
 *
 * WHAT THIS FILE DOES NOT DO. It does not rank, search, simulate or score. It
 * answers three questions about ONE candidate against ONE draft — is it
 * admissible, is it already in the recipe, and what interval may it occupy — and
 * it answers them from authorities that already exist:
 *
 *   vegan admissibility  → `assessEngineIngredientVeganEligibility`
 *   base route           → `rescueBaseRoute` → `recipeProteinSourceProfile`
 *   composition/identity → `canonicalToolboxComposition` via the palette adapter
 *   ±2 permission        → `directionRelaxationPermitted` (NAPRAWA 1)
 *   extension factor     → `EXTENDED_RANGE_UPPER_FACTOR` (NAPRAWA 1)
 *   inulin dosage        → `OWNER_INULIN_POLICY` / `permittedInulinBand`
 *   stabilizer dosage    → `GELLATTI_STABILIZER_AUTHORITY`
 *
 * PROFILE IDENTITY OUTRANKS DIRECTION. A mathematically attractive candidate
 * that converts Sorbet into dairy Gelato, Vegan into a dairy or egg product, or
 * a plant Protein route into a dairy one is INVALID, not merely lower-ranked.
 */
import type { EngineIngredient, ProductCategory, RecipeInput } from '@/engine';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import { assessEngineIngredientVeganEligibility } from '@/data/ingredients/veganEligibility';
import { GELLATTI_STABILIZER_AUTHORITY } from '@/data/ingredients/gellattiStabilizerAuthority';
import {
  OWNER_INULIN_POLICY,
  permittedInulinBand,
} from '@/features/product-intelligence/ownerInulinPolicy';
import {
  directionRelaxationPermitted,
  EXTENDED_RANGE_UPPER_FACTOR,
  type GramBand,
} from '@/features/recipe-direction/directionRelaxation';
import type { ConstraintSet } from '@/features/recipe-constraints';
import { rescueBaseRoute, type RescueBaseRoute } from './rescueBaseRoute';

/** What a candidate can technically DO for a Direction axis. Roles exist so the
 *  search can pick a lever for the axis it is missing, never to rank by name. */
export type RescueRole =
  /** Raises sweetness / POD. */
  | 'sweetness_pod'
  /** Moves the freezing point / PAC — the hardness–softness lever. */
  | 'freezing_pac'
  /** Adds non-sweet solids and body. */
  | 'body_solids'
  /** Adds dairy solids-not-fat. */
  | 'dairy_solids'
  /** Adds dairy fat. */
  | 'dairy_fat'
  /** Emulsification / structure from egg. */
  | 'emulsifier'
  /** Stabilizer system. */
  | 'stabilizer';

/**
 * How much of this ingredient may be added, and on whose authority.
 *
 * `percent_of_batch` carries a PUBLISHED owner window. `owner_inulin_policy` and
 * `product_owned_exact` defer to an authority that already exists elsewhere.
 * `capped_technical_window` is the honest label for „no owner dosage authority
 * has been published for this ingredient": the search may still probe inside a
 * deliberately conservative cap, and the absence is recorded as a missing
 * authority rather than dressed up as a limit.
 */
export type RescueDosageAuthority =
  | {
      readonly kind: 'percent_of_batch';
      readonly provenance: string;
      /** Upper edge of the NORMAL envelope, as a percentage of target batch. */
      readonly normalMaxPercent: number;
      /** Absolute maximum. Nothing — no request, no relaxation — passes it. */
      readonly hardMaxPercent: number;
    }
  | { readonly kind: 'owner_inulin_policy'; readonly provenance: string }
  | { readonly kind: 'product_owned_exact'; readonly provenance: string }
  | {
      readonly kind: 'capped_technical_window';
      readonly provenance: string;
      readonly hardMaxPercent: number;
    };

/** A condition that must hold for this candidate on THIS draft, checked against
 *  a real authority — never a hard-coded profile branch. */
export type RescueHardCondition =
  /** The exact ingredient must assess as VEGAN_VERIFIED. */
  | 'vegan_verified_required'
  /** Every Protein gate must still pass after the addition. */
  | 'protein_qualification_preserved'
  /** Never a generic first-choice lever; needs a real technological reason and
   *  must not outrank a simpler sugar or body lever at equal result. */
  | 'requires_technological_justification';

/** What adding this candidate does to the recipe's identity. Used to refuse, and
 *  to disclose when it is permitted. */
export interface RescueProfileIdentityEffect {
  readonly introducesDairy: boolean;
  readonly introducesEgg: boolean;
  readonly introducesAnimalOrigin: boolean;
  readonly allergens: readonly string[];
}

export interface RescueToolboxEntry {
  readonly canonicalIngredientId: string;
  /** Identity inside the canonical toolbox composition tables. */
  readonly toolboxId: string;
  readonly namePl: string;
  /** Instrumental case, for copy such as „Dodaj 4 g fruktozy". */
  readonly withNamePl: string;
  readonly starterPackProduct: boolean;
  /** `'all'` means every profile; otherwise the exact categories. */
  readonly allowedProfiles: 'all' | readonly ProductCategory[];
  readonly allowedBaseRoutes: readonly RescueBaseRoute[];
  readonly rescueRoles: readonly RescueRole[];
  readonly dosageAuthority: RescueDosageAuthority;
  readonly hardConditions: readonly RescueHardCondition[];
  readonly profileIdentityEffects: RescueProfileIdentityEffect;
}

const NO_IDENTITY_EFFECT: RescueProfileIdentityEffect = Object.freeze({
  introducesDairy: false,
  introducesEgg: false,
  introducesAnimalOrigin: false,
  allergens: Object.freeze([]),
});

const DAIRY_IDENTITY_EFFECT: RescueProfileIdentityEffect = Object.freeze({
  introducesDairy: true,
  introducesEgg: false,
  introducesAnimalOrigin: true,
  allergens: Object.freeze(['milk']),
});

const EGG_IDENTITY_EFFECT: RescueProfileIdentityEffect = Object.freeze({
  introducesDairy: false,
  introducesEgg: true,
  introducesAnimalOrigin: true,
  allergens: Object.freeze(['egg']),
});

/**
 * FRUCTOSE — the Owner's final dosage authority (2026-09-19).
 *
 * Basis: percentage of TOTAL target batch mass. Absent is 0 g. The normal range
 * is `>0 % … 6 %`; the controlled extension is `>6 % … 8 %`; `8 %` is the
 * structural hard maximum and above it the candidate is rejected. There is no
 * fixed percentage minimum — the search takes the SMALLEST practicalized
 * positive whole-gram amount that produces a material improvement.
 *
 * The extension is not written down here as „8". It is DERIVED from the same
 * generic ±2 rule NAPRAWA 1 already owns (`EXTENDED_RANGE_UPPER_FACTOR`, +50 %)
 * and then intersected with the hard maximum: 6 % × 1.5 = 9 %, and the hard
 * maximum cuts it to 8 %. That is exactly the Owner's arithmetic, and keeping it
 * derived means the next ingredient with a published window inherits the rule
 * instead of another hand-written constant.
 *
 * THE CAP APPLIES TO THE ADDED CANONICAL PURE FRUCTOSE LINE. Natural fructose
 * inside fruit, honey or anything else stays ordinary CORE physics — POD, PAC /
 * NPAC, total sugars, ice fraction, hardness, sweetness and every hard gate.
 * There is deliberately no second, simplistic „total fructose" rejection model.
 */
export const FRUCTOSE_NORMAL_MAX_PERCENT = 6;
export const FRUCTOSE_HARD_MAX_PERCENT = 8;

const ENTRIES: readonly RescueToolboxEntry[] = Object.freeze([
  {
    canonicalIngredientId: 'PI-ING-000494',
    toolboxId: 'dextrose',
    namePl: 'Dekstroza',
    withNamePl: 'dekstrozą',
    starterPackProduct: true,
    allowedProfiles: 'all',
    allowedBaseRoutes: ['dairy', 'plant', 'water'],
    rescueRoles: ['sweetness_pod', 'freezing_pac'],
    dosageAuthority: {
      kind: 'capped_technical_window',
      provenance: 'no published owner dosage window — conservative technical cap (OPEN-QUESTIONS Q1)',
      hardMaxPercent: 8,
    },
    hardConditions: [],
    profileIdentityEffects: NO_IDENTITY_EFFECT,
  },
  {
    canonicalIngredientId: 'PI-ING-000496',
    toolboxId: 'fructose',
    namePl: 'Fruktoza',
    withNamePl: 'fruktozą',
    starterPackProduct: true,
    allowedProfiles: 'all',
    allowedBaseRoutes: ['dairy', 'plant', 'water'],
    rescueRoles: ['sweetness_pod', 'freezing_pac'],
    dosageAuthority: {
      kind: 'percent_of_batch',
      provenance: 'owner final Fructose dosage authority 2026-09-19',
      normalMaxPercent: FRUCTOSE_NORMAL_MAX_PERCENT,
      hardMaxPercent: FRUCTOSE_HARD_MAX_PERCENT,
    },
    hardConditions: [],
    profileIdentityEffects: NO_IDENTITY_EFFECT,
  },
  {
    canonicalIngredientId: OWNER_INULIN_POLICY.mapperIngredientId,
    toolboxId: 'inulin',
    namePl: 'Inulina',
    withNamePl: 'inuliną',
    starterPackProduct: true,
    allowedProfiles: 'all',
    allowedBaseRoutes: ['dairy', 'plant', 'water'],
    rescueRoles: ['body_solids', 'freezing_pac'],
    dosageAuthority: {
      kind: 'owner_inulin_policy',
      provenance: OWNER_INULIN_POLICY.provenance,
    },
    hardConditions: [],
    profileIdentityEffects: NO_IDENTITY_EFFECT,
  },
  {
    canonicalIngredientId: 'PI-ING-002114',
    toolboxId: 'gellatti_stabilizer',
    namePl: 'Gellatti Stabilizer',
    withNamePl: 'Gellatti Stabilizer',
    starterPackProduct: true,
    allowedProfiles: 'all',
    allowedBaseRoutes: ['dairy', 'plant', 'water'],
    rescueRoles: ['stabilizer'],
    dosageAuthority: {
      kind: 'product_owned_exact',
      provenance: 'Gellatti Stabilizer product-owned profile dose',
    },
    hardConditions: [],
    profileIdentityEffects: NO_IDENTITY_EFFECT,
  },
  {
    canonicalIngredientId: 'PI-ING-000270',
    toolboxId: 'smp',
    namePl: 'Odtłuszczone mleko w proszku 0,8%',
    withNamePl: 'odtłuszczonym mlekiem w proszku 0,8%',
    starterPackProduct: true,
    // Dairy families and the DAIRY Protein route only. Never Sorbet, never
    // Vegan, never a plant Protein route.
    allowedProfiles: [
      'milk_gelato',
      'fruit_gelato',
      'nut_gelato',
      'chocolate_gelato',
      'alcohol_gelato',
      'protein_gelato',
    ],
    allowedBaseRoutes: ['dairy'],
    rescueRoles: ['dairy_solids', 'body_solids'],
    dosageAuthority: {
      kind: 'capped_technical_window',
      provenance: 'no published owner dosage window — conservative technical cap (OPEN-QUESTIONS Q1)',
      hardMaxPercent: 8,
    },
    hardConditions: ['protein_qualification_preserved'],
    profileIdentityEffects: DAIRY_IDENTITY_EFFECT,
  },
  {
    canonicalIngredientId: 'PI-ING-000260',
    toolboxId: 'cream_powder_42',
    namePl: 'Śmietanka w proszku 42%',
    withNamePl: 'śmietanką w proszku 42%',
    starterPackProduct: true,
    allowedProfiles: [
      'milk_gelato',
      'fruit_gelato',
      'nut_gelato',
      'chocolate_gelato',
      'alcohol_gelato',
      'protein_gelato',
    ],
    allowedBaseRoutes: ['dairy'],
    rescueRoles: ['dairy_fat', 'body_solids'],
    dosageAuthority: {
      kind: 'capped_technical_window',
      provenance: 'no published owner dosage window — conservative technical cap (OPEN-QUESTIONS Q1)',
      hardMaxPercent: 8,
    },
    hardConditions: ['protein_qualification_preserved'],
    profileIdentityEffects: DAIRY_IDENTITY_EFFECT,
  },
  {
    canonicalIngredientId: 'PI-ING-001645',
    toolboxId: 'dried_egg_yolk',
    namePl: 'Suszone żółtko jaja',
    withNamePl: 'suszonym żółtkiem jaja',
    starterPackProduct: true,
    // Dairy gelato families only, and never as a generic Direction lever. On a
    // Protein draft it is not a normal automatic candidate: only an existing
    // Protein authority may permit it, and none does today.
    allowedProfiles: [
      'milk_gelato',
      'fruit_gelato',
      'nut_gelato',
      'chocolate_gelato',
      'alcohol_gelato',
    ],
    allowedBaseRoutes: ['dairy'],
    rescueRoles: ['emulsifier', 'body_solids'],
    dosageAuthority: {
      kind: 'capped_technical_window',
      provenance: 'no published owner dosage window — conservative technical cap (OPEN-QUESTIONS Q1)',
      hardMaxPercent: 8,
    },
    hardConditions: ['requires_technological_justification'],
    profileIdentityEffects: EGG_IDENTITY_EFFECT,
  },
]);

const BY_ID = new Map(ENTRIES.map((entry) => [entry.canonicalIngredientId, entry] as const));

export const rescueToolboxEntries = (): readonly RescueToolboxEntry[] => ENTRIES;

export const rescueToolboxEntry = (canonicalIngredientId: string): RescueToolboxEntry | null =>
  BY_ID.get(canonicalIngredientId) ?? null;

/** Where a candidate already stands in the draft. Presence is NOT an exclusion:
 *  an ingredient already in the recipe is adjusted, never duplicated, and a
 *  constrained one routes to Constraint Rescue instead of Ingredient Rescue. */
export type RescuePresence = 'absent' | 'present_unlocked' | 'present_constrained';

export function rescuePresence(
  entry: RescueToolboxEntry,
  input: RecipeInput,
  set: ConstraintSet = { byLineId: {} },
): RescuePresence {
  const line = input.items.find(
    (item) => canonicalIngredientId(item.ingredient) === entry.canonicalIngredientId,
  );
  if (line === undefined) return 'absent';
  if (line.lock_type !== 'unlocked') return 'present_constrained';
  const constraint = set.byLineId[line.id];
  if (constraint !== undefined && constraint.mode !== 'ai') return 'present_constrained';
  return 'present_unlocked';
}

export type RescueInadmissibleReason =
  | 'admissible'
  | 'profile_incompatible'
  | 'base_route_incompatible'
  | 'base_route_unresolved'
  | 'vegan_not_verified'
  | 'identity_would_change'
  | 'authority_unavailable';

export interface RescueAdmissibility {
  readonly admissible: boolean;
  readonly reason: RescueInadmissibleReason;
  readonly presence: RescuePresence;
  readonly baseRoute: RescueBaseRoute;
  /** True when the candidate is permitted but must justify itself technically
   *  and may not outrank a simpler lever at an equivalent result. */
  readonly conditional: boolean;
}

/**
 * IS THIS CANDIDATE ADMISSIBLE ON THIS DRAFT?
 *
 * Identity first, physics never. The order is deliberate: profile, then base
 * route, then the identity effect judged against the draft's own vegan
 * authority. A candidate that fails any of them is not a worse candidate — it is
 * not a candidate.
 *
 * `ingredient` is the exact canonical payload the Rescue would add. It is passed
 * in rather than resolved here so that this module owns POLICY and the caller
 * owns identity hydration — and so the vegan question is asked of the very
 * object that would enter the recipe, not of an id that stands for it.
 */
export function rescueAdmissibility(
  entry: RescueToolboxEntry,
  input: RecipeInput,
  ingredient: EngineIngredient | null,
  set: ConstraintSet = { byLineId: {} },
): RescueAdmissibility {
  const baseRoute = rescueBaseRoute(input);
  const presence = rescuePresence(entry, input, set);
  const base = { presence, baseRoute, conditional: false } as const;

  // ORDER MATTERS, and this order is the informative one.
  //
  // Policy first, identity payload last. A line ALREADY IN THE RECIPE is
  // adjusted, never hydrated and never duplicated, so whether a fresh canonical
  // payload could be built is irrelevant to it — and answering
  // `authority_unavailable` for a row the customer is already using would hide
  // the only fact that matters about it. The legacy palette contract says the
  // same thing in its own words: „an already-present FINAL row remains
  // already_present even when its Estimated authority correctly prevents
  // materializing a new rescue payload".
  if (entry.allowedProfiles !== 'all' && !entry.allowedProfiles.includes(input.category)) {
    return { ...base, admissible: false, reason: 'profile_incompatible' };
  }
  if (!entry.allowedBaseRoutes.includes(baseRoute)) {
    // An UNRESOLVED route is reported as its own reason. It is a missing
    // authority, never evidence that the target is physically impossible.
    return {
      ...base,
      admissible: false,
      reason: baseRoute === 'unknown' ? 'base_route_unresolved' : 'base_route_incompatible',
    };
  }
  // IDENTITY EFFECTS, decided from the entry alone so they bind whether or not a
  // payload can be built: a Vegan draft and a water-base Sorbet never receive
  // dairy, egg or anything animal-origin, however good the physics would be.
  const effect = entry.profileIdentityEffects;
  if (
    (input.category === 'vegan_gelato' || baseRoute === 'water') &&
    (effect.introducesDairy || effect.introducesEgg || effect.introducesAnimalOrigin)
  ) {
    return { ...base, admissible: false, reason: 'identity_would_change' };
  }
  // An existing line is ADJUSTED. Presence is a routing signal, and the caller
  // reads it from `presence`; nothing below applies to a row already in use.
  if (presence !== 'absent') {
    return {
      ...base,
      admissible: true,
      reason: 'admissible',
      conditional: entry.hardConditions.includes('requires_technological_justification'),
    };
  }
  // Only an ADDITION needs a canonical payload, and only an addition can be
  // asked the vegan question — of the exact object that would enter the recipe,
  // through the ONE vegan authority. There is no second vegan list here.
  if (ingredient === null) {
    return { ...base, admissible: false, reason: 'authority_unavailable' };
  }
  if (
    input.category === 'vegan_gelato' &&
    assessEngineIngredientVeganEligibility(ingredient).status !== 'VEGAN_VERIFIED'
  ) {
    return { ...base, admissible: false, reason: 'vegan_not_verified' };
  }
  return {
    ...base,
    admissible: true,
    reason: 'admissible',
    conditional: entry.hardConditions.includes('requires_technological_justification'),
  };
}

export interface RescueDosageWindow {
  /** `>0 g` up to the normal ceiling. The lower edge is open: there is no fixed
   *  minimum, only the smallest practical whole gram that earns its place. */
  readonly normal: GramBand;
  /** The controlled extension, available ONLY to a ±2 request. Equal to
   *  `normal` when nothing may be extended. */
  readonly extended: GramBand;
  /** Absolute ceiling. Nothing passes it, at any level, ever. */
  readonly hardMaxGrams: number;
  /** The window this draft may actually use right now, given its Direction
   *  level: `normal` at ±1 and below, `extended` at ±2. */
  readonly permitted: GramBand;
  readonly provenance: string;
}

/**
 * THE INTERVAL A CANDIDATE MAY OCCUPY on this draft.
 *
 * The controlled extension is the GENERIC ±2 rule (NAPRAWA 1, +50 % of the
 * boundary) intersected with the ingredient's own hard maximum — never a second
 * hand-written number. Fructose is the worked example: 6 % × 1.5 = 9 %, and the
 * 8 % hard maximum cuts it to 8 %.
 */
export function rescueDosageWindow(
  entry: RescueToolboxEntry,
  input: RecipeInput,
): RescueDosageWindow | null {
  const batch = input.target_batch_grams;
  if (!Number.isFinite(batch) || batch <= 0) return null;
  const extremeRequest = directionRelaxationPermitted(input);
  const authority = entry.dosageAuthority;

  if (authority.kind === 'owner_inulin_policy') {
    // The inulin band is already owned end-to-end by `permittedInulinBand`,
    // which applies the ±2 extension and intersects every structural limit that
    // governs the same line. Restating any part of it here would recreate the
    // disagreement this module exists to remove.
    const normalMax = (OWNER_INULIN_POLICY.maxPercent / 100) * batch;
    const permittedBand = permittedInulinBand(input);
    const normal: GramBand = {
      minGrams: (OWNER_INULIN_POLICY.minPercent / 100) * batch,
      maxGrams: normalMax,
    };
    const extended: GramBand = {
      minGrams: permittedBand.minGrams,
      maxGrams: permittedBand.maxGrams,
    };
    return {
      normal,
      extended,
      hardMaxGrams: Math.max(normal.maxGrams, extended.maxGrams),
      permitted: extremeRequest ? extended : normal,
      provenance: authority.provenance,
    };
  }

  if (authority.kind === 'product_owned_exact') {
    // An exact product-owned dose is not a window and is never extended.
    const profile = gellattiStabilizerProfile(input);
    const grams = (GELLATTI_STABILIZER_AUTHORITY.dosageGPerKg[profile] * batch) / 1_000;
    const exact: GramBand = { minGrams: grams, maxGrams: grams };
    return {
      normal: exact,
      extended: exact,
      hardMaxGrams: grams,
      permitted: exact,
      provenance: authority.provenance,
    };
  }

  const hardMaxGrams = (authority.hardMaxPercent / 100) * batch;
  const normalMaxPercent =
    authority.kind === 'percent_of_batch' ? authority.normalMaxPercent : authority.hardMaxPercent;
  const normal: GramBand = { minGrams: 0, maxGrams: (normalMaxPercent / 100) * batch };
  const extended: GramBand = {
    minGrams: 0,
    // THE GENERIC ±2 EXTENSION, then the hard maximum. Both, in that order.
    maxGrams: Math.min(normal.maxGrams * EXTENDED_RANGE_UPPER_FACTOR, hardMaxGrams),
  };
  return {
    normal,
    extended,
    hardMaxGrams,
    permitted: extremeRequest ? extended : normal,
    provenance: authority.provenance,
  };
}

/** The stabilizer's own dosage profile, read the way the product authority
 *  defines it rather than by category name. */
function gellattiStabilizerProfile(
  input: RecipeInput,
): keyof typeof GELLATTI_STABILIZER_AUTHORITY.dosageGPerKg {
  if (input.category === 'sorbet') return 'SORBET';
  if (input.items.some((item) => item.ingredient.category === 'chocolate_cocoa')) return 'CHOCOLATE';
  if (input.items.some((item) => item.ingredient.category === 'egg')) return 'EGG';
  return 'STANDARD';
}

/**
 * Does a dose sit outside the normal envelope but inside the controlled one?
 *
 * This is the single question the public score needs. NAPRAWA 1 already fixed
 * the price: using an approved controlled envelope costs exactly ONE public
 * quality point, never more, and never stacks across ingredients.
 */
export function rescueDoseUsesControlledRange(
  window: RescueDosageWindow,
  grams: number,
): boolean {
  return grams > window.normal.maxGrams + 1e-9 && grams <= window.extended.maxGrams + 1e-9;
}

/** Is this dose admissible at all? Above the hard maximum nothing is. */
export function rescueDoseIsPermitted(window: RescueDosageWindow, grams: number): boolean {
  return grams > 0 && grams <= window.permitted.maxGrams + 1e-9;
}
