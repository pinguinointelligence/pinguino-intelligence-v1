/**
 * DESIGN V3.0 VIII + owner 2026-09-17 (B) — recipe suggestions WHILE the idea is being
 * recognised, before „Create my recipe”. PURE: the version key of an idea, and the card
 * view of the existing §32–§36 matches. No IO, no ranking of its own, no new source.
 *
 * The cards are exactly what the existing matching produces: every official Gellatti
 * match (closest first, never a Technical Base or heritage record) and at most the one
 * highest-ranked Community Top 100 match. A card never carries grams.
 */
import {
  officialCollectionById,
  officialRecipeById,
} from '@/data/recipes/official/officialRecipeLibrary';
import {
  officialProductTypeLabelPl,
  officialRecipeOriginLabelPl,
} from '@/copy/officialRecipeLibrary';
import { homeCreatorCopy } from '../homeCreatorCopy';
import type { IntentChip } from '../homeDraftStore';
import type { IntentProfile } from '../homeIntentParsing';
import type { RecipeMatch, RequestedIngredient } from '../homeRecipeMatching';

/** The identities matching may use: resolved, unambiguous chips only (§22). */
export function requestedFromChips(chips: readonly IntentChip[]): readonly RequestedIngredient[] {
  return chips
    .filter((chip) => chip.productId !== null && !chip.ambiguous)
    .map((chip) => ({
      productId: chip.productId as string,
      statedRole: chip.role,
      displayName: chip.productName ?? chip.label,
      // A generic idea („truskawka”) resolved to its frozen SA-03 default asks for the
      // concept; an exact product (scan, choice, brand, literal catalogue) asks for itself.
      conceptKey:
        chip.resolvedBy?.authority === 'SA03_CONCEPT_DEFAULT'
          ? (chip.resolvedBy.conceptKey ?? null)
          : null,
    }));
}

/**
 * The version of an idea, as far as suggestions are concerned: the resolved identities,
 * their stated roles and the profile. Removing a chip or resolving another one changes it,
 * so a skipped suggestion comes back for a different idea — and never repeats for the same.
 */
export function ideaSuggestionSignature(
  chips: readonly IntentChip[],
  profile: IntentProfile | null,
): string {
  const requested = requestedFromChips(chips)
    .map((item) => `${item.productId}:${item.statedRole ?? '-'}:${item.conceptKey ?? '-'}`)
    .sort();
  return requested.length === 0 ? '' : `${profile ?? '-'}|${requested.join(',')}`;
}

export interface HomeSuggestionCard {
  readonly id: string;
  readonly source: 'official' | 'community';
  readonly title: string;
  readonly imageUrl: string | null;
  /** Collection name (official) or „Community · Top 100”. */
  readonly eyebrow: string;
  /** One quiet line: „typ · pochodzenie” or „autor · miejsce N”. */
  readonly subline: string | null;
  /** §32/§36 — what the customer would also be making. Names only. */
  readonly alsoIncludes: readonly string[];
  /** §38 — the ORIGINAL creator of a Community family, never the intermediate remixer. */
  readonly basedOn: string | null;
  /** The form of the SAME flavour the suggestion uses („Puree truskawkowe”). */
  readonly usedForm: string | null;
  /**
   * Set when the Community search could not cover every approved-form combination: this
   * card matches, but it may not be presented as the best of all Community recipes.
   */
  readonly searchIncomplete: boolean;
  readonly match: RecipeMatch;
}

const joinQuiet = (parts: readonly (string | null | undefined)[]): string | null => {
  const text = parts.filter((part): part is string => Boolean(part?.trim())).join(' · ');
  return text || null;
};

export function suggestionCards(input: {
  readonly official: readonly RecipeMatch[];
  readonly community: RecipeMatch | null;
  /** The Community search was bounded — see `HomeSuggestionCard.searchIncomplete`. */
  readonly communityPartial?: boolean;
}): readonly HomeSuggestionCard[] {
  const copy = homeCreatorCopy.match;
  const cards: HomeSuggestionCard[] = input.official.map((match) => {
    const recipe = officialRecipeById(match.candidate.id);
    const collection = recipe ? officialCollectionById(recipe.collection).name : copy.byGellatti;
    return {
      id: match.candidate.id,
      source: 'official',
      title: match.candidate.title,
      imageUrl: match.candidate.imageUrl,
      eyebrow: collection,
      subline: recipe
        ? joinQuiet([
            officialProductTypeLabelPl(recipe.productType),
            officialRecipeOriginLabelPl(recipe.origin),
          ])
        : null,
      alsoIncludes: match.alsoIncludes,
      basedOn: null,
      usedForm: match.usedForms?.join(', ') || null,
      searchIncomplete: false,
      match,
    };
  });
  if (input.community) {
    const candidate = input.community.candidate;
    cards.push({
      id: candidate.id,
      source: 'community',
      title: candidate.title,
      imageUrl: candidate.imageUrl,
      eyebrow: copy.communityEyebrow,
      subline: joinQuiet([
        candidate.authorName ?? null,
        typeof candidate.rank === 'number' ? copy.rankShort(candidate.rank) : null,
      ]),
      alsoIncludes: input.community.alsoIncludes,
      basedOn: candidate.originalCreatorName ?? null,
      usedForm: input.community.usedForms?.join(', ') || null,
      searchIncomplete: input.communityPartial === true,
      match: input.community,
    });
  }
  return cards;
}
