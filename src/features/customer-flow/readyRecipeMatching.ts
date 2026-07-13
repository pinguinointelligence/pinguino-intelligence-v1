/**
 * Ready-recipe matching (Agent B) — pure and deterministic.
 *
 * The customer can pick a READY recipe instead of designing a new one. This
 * module returns 5–6 (max 6) closest ideas from the available catalogue
 * metadata, and turns a selected card into a SEPARATE editable working draft.
 *
 * HONESTY RULES:
 *  - matches carry LABELS only (`closest_idea`, `similar_flavor_profile`,
 *    `matches_device`, `vegan_version`, `similar_base`) — NEVER a fabricated
 *    numeric match percentage (there is no real scoring model);
 *  - the catalogue is IMMUTABLE — selecting a card clones its metadata into a
 *    new working draft and never mutates the source;
 *  - no doses, no ingredient composition, no engine math live here — the card is
 *    METADATA only (id, flavor code, image code, tags, device/serving profile).
 *
 * The concrete catalogue lives in `__fixtures__/catalogueFixtures.ts` — a
 * repository-safe TEST fixture, not real catalogue records.
 */
import type { CustomerProductType } from './types';
import type { ProductProfile } from '@/spine';

/** The ONE clean catalogue mapping contract (metadata only — never doses). */
export interface CatalogueRecipeCard {
  id: string;
  /** Source recipe version, preserved on selection. */
  version: string;
  title: string;
  description: string;
  /** Main flavor code (e.g. 'vanilla'). */
  flavorCode: string;
  /** Secondary flavor code, or null. */
  secondaryFlavorCode: string | null;
  /** Image code + resolved path (fixture path, never a real asset claim). */
  imageCode: string;
  imagePath: string;
  /** The visible customer type this card is presented as. */
  productType: CustomerProductType;
  /** The internal engine profile the card maps to. */
  internalProfile: ProductProfile;
  flavorTags: readonly string[];
  dietaryTags: readonly string[];
  /** Device preset ids this card is compatible with. */
  deviceCompatibility: readonly string[];
  /** Serving profile id (e.g. 'display-minus-11'). */
  servingProfile: string;
  availability: 'available' | 'coming_soon';
  /** The entitlement that gates exact grams for this card's downstream view. */
  gramVisibilityEntitlement: 'exact_grams';
}

export interface ReadyRecipeQuery {
  mainFlavorTag?: string;
  secondaryFlavorTag?: string;
  productType?: CustomerProductType;
  requireVegan?: boolean;
  deviceId?: string;
  servingProfile?: string;
  tags?: readonly string[];
}

/** Honest match labels — no percentages. */
export type MatchLabel =
  | 'closest_idea'
  | 'similar_flavor_profile'
  | 'matches_device'
  | 'vegan_version'
  | 'similar_base';

export interface ReadyRecipeMatch {
  card: CatalogueRecipeCard;
  label: MatchLabel;
  /** The concrete criteria that matched — honest and enumerable, not a score. */
  matchedOn: string[];
}

/** Max cards returned to the customer (the "5–6, max 6" rule). */
export const MAX_READY_RECIPE_MATCHES = 6;

interface ScoredCard {
  card: CatalogueRecipeCard;
  score: number;
  matchedOn: string[];
}

function scoreCard(query: ReadyRecipeQuery, card: CatalogueRecipeCard): ScoredCard {
  let score = 0;
  const matchedOn: string[] = [];
  const tags = new Set(card.flavorTags);

  if (query.mainFlavorTag !== undefined && tags.has(query.mainFlavorTag)) {
    score += 4;
    matchedOn.push('main_flavor');
  }
  if (query.secondaryFlavorTag !== undefined && tags.has(query.secondaryFlavorTag)) {
    score += 2;
    matchedOn.push('secondary_flavor');
  }
  if (query.productType !== undefined && card.productType === query.productType) {
    score += 2;
    matchedOn.push('product_type');
  }
  if (query.requireVegan === true && card.dietaryTags.includes('vegan')) {
    score += 2;
    matchedOn.push('vegan');
  }
  if (query.deviceId !== undefined && card.deviceCompatibility.includes(query.deviceId)) {
    score += 1;
    matchedOn.push('device');
  }
  if (query.servingProfile !== undefined && card.servingProfile === query.servingProfile) {
    score += 1;
    matchedOn.push('serving_profile');
  }
  for (const t of query.tags ?? []) {
    if (tags.has(t)) {
      score += 1;
      matchedOn.push(`tag:${t}`);
    }
  }
  return { card, score, matchedOn };
}

/** Pick the honest label from the criteria that matched (deterministic). */
function labelFor(matchedOn: readonly string[]): MatchLabel {
  if (matchedOn.includes('main_flavor')) return 'similar_flavor_profile';
  if (matchedOn.includes('device')) return 'matches_device';
  if (matchedOn.includes('vegan')) return 'vegan_version';
  if (matchedOn.includes('product_type')) return 'similar_base';
  return 'closest_idea';
}

/**
 * Return the closest available cards, ranked. Deterministic ordering: score
 * descending, then card id ascending. Capped at 6 (returns fewer only when the
 * available catalogue is smaller). Every returned card carries an honest label.
 * `coming_soon` cards are excluded — never offered.
 */
export function matchReadyRecipes(
  query: ReadyRecipeQuery,
  catalogue: readonly CatalogueRecipeCard[],
): ReadyRecipeMatch[] {
  const ranked = catalogue
    .filter((c) => c.availability === 'available')
    .map((c) => scoreCard(query, c))
    .sort((a, b) => (b.score - a.score) || a.card.id.localeCompare(b.card.id))
    .slice(0, MAX_READY_RECIPE_MATCHES);

  return ranked.map((s) => ({ card: s.card, label: labelFor(s.matchedOn), matchedOn: s.matchedOn }));
}

/* ------------------------------------------------------------------------ *
 * Selection → separate editable working draft (catalogue stays immutable)   *
 * ------------------------------------------------------------------------ */

export interface ReadyRecipeWorkingDraft {
  /** Preserved source identity — the catalogue record is never mutated. */
  sourceRecipeId: string;
  sourceVersion: string;
  title: string;
  description: string;
  productType: CustomerProductType;
  internalProfile: ProductProfile;
  /** Editable copies of the source metadata (new arrays — not shared refs). */
  flavorTags: string[];
  dietaryTags: string[];
  /** Marker that this is a mutable working draft (never the catalogue source). */
  editable: true;
  notes: string[];
}

/**
 * Turn a selected catalogue card into a SEPARATE editable working draft. The
 * source card is never mutated; arrays are cloned so later edits to the draft
 * cannot leak back into the catalogue.
 */
export function selectReadyRecipe(card: CatalogueRecipeCard): ReadyRecipeWorkingDraft {
  return {
    sourceRecipeId: card.id,
    sourceVersion: card.version,
    title: card.title,
    description: card.description,
    productType: card.productType,
    internalProfile: card.internalProfile,
    flavorTags: [...card.flavorTags],
    dietaryTags: [...card.dietaryTags],
    editable: true,
    notes: ['customer_flow.ready_recipe_working_draft_created'],
  };
}
