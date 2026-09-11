/**
 * §23 — which picture a shared recipe shows, decided ONCE.
 *
 * The owner's rule is an order of preference, not a question to ask the
 * customer: nobody is ever made to pick a fallback image.
 *
 *   1. the user's own photograph, if they took one;
 *   2. otherwise, if this is one of OUR library recipes, that recipe's picture;
 *   3. otherwise, the branded card for its profile.
 *
 * Everything lives here — one asset mapping, one resolution — because the
 * owner's second requirement is that the placeholder files can later be
 * replaced by changing one set of files, without hunting for a component that
 * quietly hardcoded a path of its own.
 *
 * The four `/brand/profile/*.jpg` files are TEMPORARY examples. Replacing them
 * on disk replaces them everywhere; no code changes with them.
 */
import { getFlavorEntryByCode } from '@/data/recipes/flavorCatalogue';

/** The four profiles a Gellatti recipe can present as. */
export type BrandedProfileKey = 'gelato' | 'sorbet' | 'vegan' | 'protein';

/** THE asset mapping. Nothing else in the application may name these files. */
export const BRANDED_PROFILE_IMAGE: Readonly<Record<BrandedProfileKey, string>> = {
  gelato: '/brand/profile/gelato.jpg',
  sorbet: '/brand/profile/sorbet.jpg',
  vegan: '/brand/profile/vegan.jpg',
  protein: '/brand/profile/protein.jpg',
};

/**
 * Everything the application calls a profile, reduced to the four branded
 * cards. Engine spine names, HOME/customer names and the community `category`
 * string all arrive here, so the mapping is deliberately generous — and the
 * default is `gelato`, the profile a recipe has when nothing says otherwise.
 */
export function brandedProfileKey(profile: string | null | undefined): BrandedProfileKey {
  const value = (profile ?? '').trim().toLowerCase();
  if (value.includes('sorbet') || value.includes('granita')) return 'sorbet';
  if (value.includes('protein')) return 'protein';
  if (value.includes('vegan')) return 'vegan';
  return 'gelato';
}

export type RecipeImageOrigin = 'user_photo' | 'library_recipe' | 'branded_profile';

export interface RecipeImageDecision {
  readonly url: string;
  readonly origin: RecipeImageOrigin;
  /** True when the picture is a stand-in, so a caller may mark it as such. */
  readonly isPlaceholder: boolean;
}

export interface RecipeImageInput {
  /** A photograph the user attached to THIS recipe, if any. */
  readonly userImageUrl?: string | null;
  /**
   * The library recipe this was made from, when it is one of ours. Accepts the
   * catalogue's own code (`FL-000001`) — an unknown code is simply not a
   * library recipe, never an error.
   */
  readonly libraryFlavorCode?: string | null;
  /** Profile of the recipe, in any of the names the application uses. */
  readonly profile?: string | null;
}

const usable = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
};

/** §23 — the single decision. Always answers; the customer is never asked. */
export function resolveRecipeImage(input: RecipeImageInput): RecipeImageDecision {
  const own = usable(input.userImageUrl);
  if (own) return { url: own, origin: 'user_photo', isPlaceholder: false };

  const code = usable(input.libraryFlavorCode);
  if (code) {
    const entry = getFlavorEntryByCode(code);
    const path = usable(entry?.imagePath);
    if (path) return { url: path, origin: 'library_recipe', isPlaceholder: false };
  }

  return {
    url: BRANDED_PROFILE_IMAGE[brandedProfileKey(input.profile)],
    origin: 'branded_profile',
    isPlaceholder: true,
  };
}

/**
 * §24 — Community is the one place the order above does NOT apply.
 *
 * A community publication must carry the maker's OWN photograph of the ice
 * cream they actually made. Our branded cards, our GEL library pictures and any
 * stock or generated image are all refused, because a feed of our own artwork
 * signed with other people's names is not a community.
 *
 * This blocks PUBLISHING only. Saving the recipe, sharing it privately and
 * using it again are untouched.
 */
export function communityPhotoAccepted(imageUrl: string | null | undefined): boolean {
  const url = usable(imageUrl);
  if (url === null) return false;
  if (url.startsWith('/brand/')) return false;
  if (url.startsWith('/recipes/')) return false;
  return true;
}
