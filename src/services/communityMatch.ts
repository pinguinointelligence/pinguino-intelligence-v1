/**
 * §32–§40 — the IO half of Community matching.
 *
 * Lives in `src/services/**` because that is the ONLY sanctioned place to touch
 * Supabase: `studioBoundary.test.ts` fails the build if a feature, store or page
 * imports the client directly. The mapping into feature types stays in
 * `@/features/home-creator/matching`, so this file carries no presentation concern.
 *
 * The strict §32 rule is decided inside `gellatti_match_community_top100_v1`, a match
 * oracle — not a formulation oracle. It returns public card fields and ingredient
 * NAMES. No gram, ratio, percentage or mass ordering crosses this boundary; gram
 * visibility remains entirely the existing entitlement authority's business.
 */
import { supabase } from '@/lib/supabase/client';

/** Exactly the shape the oracle returns. Deliberately has no gram field to map. */
export interface CommunityMatchRow {
  publication_id: string;
  slug: string;
  title: string;
  description: string | null;
  image_url: string | null;
  category: string | null;
  rank: number;
  all_requested_present: boolean;
  also_includes: string[] | null;
  creator: {
    handle?: string | null;
    display_name?: string | null;
    display_handle?: string | null;
    avatar_url?: string | null;
    verification_status?: string | null;
  } | null;
  based_on: { creator_display_name?: string | null; title?: string | null } | null;
}

/**
 * Ask the oracle which Top 100 publications satisfy EVERY requested identity.
 *
 * Returns `[]` on any failure. A matching outage must never block creation — §35's
 * "no trustworthy match" and "the matcher is down" produce the same, correct customer
 * experience: no popup, carry on creating.
 */
export async function matchCommunityTop100Rows(input: {
  readonly ingredientIds: readonly string[];
  readonly category: string | null;
  readonly limit?: number;
}): Promise<readonly CommunityMatchRow[]> {
  if (!supabase) return [];
  if (input.ingredientIds.length === 0) return [];

  const { data, error } = await supabase.rpc('gellatti_match_community_top100_v1', {
    p_ingredient_ids: [...input.ingredientIds],
    p_category: input.category,
    p_limit: input.limit ?? 10,
  });
  if (error || !Array.isArray(data)) return [];
  return data as CommunityMatchRow[];
}
