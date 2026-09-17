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
 * The four `/brand/profile/*.jpg` files are the OWNER-APPROVED photographs
 * delivered 2026-09-17 (1254 × 1254, square — the share page frames them
 * square so neither the bowl logo nor the scene is cropped). They were swapped
 * on disk, exactly as this design intended; no code changed with them.
 *
 * A customer's recipe shared from HOME or PRO is the `customer_share`
 * context: the customer's own photograph, otherwise the branded card of the
 * SHARED VERSION's profile. Library pictures stay available to every other
 * caller, but never stand in for a customer's share.
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
  /**
   * Owner decision 2026-09-17: a customer's recipe shared from HOME or PRO
   * shows the customer's own photograph, otherwise the branded card of its
   * profile. A library picture is never used there, even when the customer's
   * version started from one of our recipes. Omitted = the full order above.
   */
  readonly context?: 'customer_share';
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

  const code = input.context === 'customer_share' ? null : usable(input.libraryFlavorCode);
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
 *
 * So the answer is not „anything that is not one of our paths" — an absolute
 * `https://…/brand/profile/gelato.jpg`, or our asset with the upload path
 * smuggled into a query or fragment, would pass that. It is the shape of a
 * maker's upload and nothing else: one canonical https URL of a public object
 * in the Community photo bucket (`<owner folder>/<file>`), no query, no
 * fragment, no dot segments. Who owns the object is proven by the database at
 * publish time; this check only refuses what can never be an upload.
 */
const COMMUNITY_PHOTO_OBJECT_PATH =
  /^\/storage\/v1\/object\/public\/community-recipe-images\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

export function communityPhotoAccepted(imageUrl: string | null | undefined): boolean {
  const url = usable(imageUrl);
  if (url === null) return false;
  if (url.includes('?') || url.includes('#')) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Relative paths (`/brand/…`, `/recipes/…`) are our own assets, never an upload.
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  // Canonical only: dot segments, credentials or re-encodings would parse to a
  // different address than the one that is stored and rendered.
  if (parsed.href !== url || parsed.username || parsed.password) return false;
  return COMMUNITY_PHOTO_OBJECT_PATH.test(parsed.pathname);
}
