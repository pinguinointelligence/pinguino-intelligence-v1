/**
 * GELLATTI HOME §90/§91/§94 — Community Likes and Favourites.
 *
 * Thin service over the tables and readers created in
 * `20260830120000_community_likes_favorites.sql`. All the real rules live in the
 * database: the primary key prevents duplicates, RLS scopes writes to the owner, and
 * the SECURITY DEFINER readers decide what a viewer may see. This file adds no policy
 * of its own — it only calls.
 *
 * §94: nothing here consults an entitlement. Liking and favouriting need a session,
 * not a subscription.
 */
import { supabase } from '@/lib/supabase/client';

export interface PublicationSocialState {
  readonly publicationId: string;
  readonly likeCount: number;
  readonly favoriteCount: number;
  readonly viewerLiked: boolean;
  readonly viewerFavorited: boolean;
}

export interface PublicationLiker {
  readonly handle: string | null;
  readonly displayHandle: string | null;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  readonly likedAt: string;
}

const EMPTY = (publicationId: string): PublicationSocialState => ({
  publicationId,
  likeCount: 0,
  favoriteCount: 0,
  viewerLiked: false,
  viewerFavorited: false,
});

/** Counts + the viewer's own state. Anonymous callers get counts and two `false`s. */
export async function publicationSocialState(
  publicationId: string,
): Promise<PublicationSocialState> {
  if (!supabase) return EMPTY(publicationId);
  const { data, error } = await supabase.rpc('gellatti_publication_social_v1', {
    p_publication_id: publicationId,
  });
  if (error || !data) return EMPTY(publicationId);
  const row = data as Record<string, unknown>;
  return {
    publicationId,
    likeCount: Number(row.like_count ?? 0),
    favoriteCount: Number(row.favorite_count ?? 0),
    viewerLiked: row.viewer_liked === true,
    viewerFavorited: row.viewer_favorited === true,
  };
}

async function requireUserId(): Promise<string> {
  if (!supabase) throw new Error('Community backend is unavailable.');
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message);
  const userId = data.user?.id;
  // §94: a session is the ONLY requirement — no entitlement is consulted.
  if (!userId) throw new Error('Sign in to like or save a recipe.');
  return userId;
}

/**
 * Like / unlike. `upsert` with `ignoreDuplicates` makes a double tap a no-op rather
 * than an error, which matters because the optimistic UI can race a slow network.
 */
export async function setLiked(publicationId: string, liked: boolean): Promise<void> {
  const userId = await requireUserId();
  if (!supabase) throw new Error('Community backend is unavailable.');
  const { error } = liked
    ? await supabase
        .from('publication_likes')
        .upsert({ publication_id: publicationId, user_id: userId }, { ignoreDuplicates: true })
    : await supabase
        .from('publication_likes')
        .delete()
        .eq('publication_id', publicationId)
        .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export async function setFavorited(publicationId: string, favorited: boolean): Promise<void> {
  const userId = await requireUserId();
  if (!supabase) throw new Error('Community backend is unavailable.');
  const { error } = favorited
    ? await supabase
        .from('publication_favorites')
        .upsert({ publication_id: publicationId, user_id: userId }, { ignoreDuplicates: true })
    : await supabase
        .from('publication_favorites')
        .delete()
        .eq('publication_id', publicationId)
        .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

/** §91: who liked this — public creator profiles only, never a user id. */
export async function publicationLikers(
  publicationId: string,
  limit = 50,
  offset = 0,
): Promise<readonly PublicationLiker[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('gellatti_publication_likers_v1', {
    p_publication_id: publicationId,
    p_limit: limit,
    p_offset: offset,
  });
  if (error || !Array.isArray(data)) return [];
  return (data as Record<string, unknown>[]).map((row) => ({
    handle: (row.handle as string | null) ?? null,
    displayHandle: (row.display_handle as string | null) ?? null,
    displayName: (row.display_name as string | null) ?? null,
    avatarUrl: (row.avatar_url as string | null) ?? null,
    likedAt: String(row.liked_at ?? ''),
  }));
}

/** The signed-in user's saved publications, newest first (§90 Save/Favourite). */
export async function myFavoritePublicationIds(): Promise<readonly string[]> {
  if (!supabase) return [];
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user?.id) return [];
  const { data, error } = await supabase
    .from('publication_favorites')
    .select('publication_id')
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false });
  if (error || !Array.isArray(data)) return [];
  return (data as { publication_id: string }[]).map((row) => row.publication_id);
}
