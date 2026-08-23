/**
 * Gellatti Community / Creator / Sharing service — the ONLY Supabase access
 * for the Community surfaces. UI, stores and features reach these functions,
 * never the Supabase client (the `src/services/**` boundary).
 *
 * SHAPE OF THE CONTRACT: every call is an RPC, not a table read. That is
 * deliberate. A table read can only be filtered by RLS, and RLS cannot redact
 * a column — it can only hide a row. The demo-safe projection has to be
 * COMPUTED, so the database function is the boundary and this module is a thin
 * typed client for it (§16).
 *
 * The client therefore holds no entitlement logic at all: it does not decide
 * whether to show grams, it receives a payload that either has them or does
 * not. `entitlement` on each response says which happened, for UI copy only.
 */
import { supabase } from '@/lib/supabase/client';
import { emptyUnconfiguredRead } from '@/services/backendGuard';
import type { DemoSafeRecipe } from '@/features/community/domain/demoSafeRecipe';
import type { RankingWindow } from '@/features/community/domain/ranking';

const UNAVAILABLE = 'Gellatti Community is not available in this build.';

/** How much of a recipe the caller actually received. */
export type ShareEntitlement = 'shared_recipe_demo' | 'community_public' | 'full';

export interface CreatorRef {
  handle?: string;
  display_handle?: string;
  display_name: string;
  avatar_url?: string;
  /** Present on the profile read; absent on the compact card reference. */
  bio?: string;
  country?: string;
  city?: string;
  verification_status?: 'unverified' | 'verified' | 'official';
}

export interface PublicationMetrics {
  unique_users: number;
  unique_makers: number;
  total_makes: number;
  remix_count: number;
  rating_count: number;
  /** null when nobody has rated — never a fabricated default (§59). */
  rating_average: number | null;
}

/** §22: the unremovable „Na podstawie" attribution on a published remix. */
export interface BasedOnRef {
  title: string;
  slug: string;
  creator_display_name: string;
  handle?: string;
}

export interface CommunityCard {
  publication_id: string;
  title: string;
  slug: string;
  /** Present ONLY when this publication descends from another published one. */
  based_on?: BasedOnRef;
  description?: string;
  image_url?: string;
  category?: string;
  tags?: string[];
  version_number: number;
  published_at: string;
  creator: CreatorRef;
  metrics: PublicationMetrics;
}

export interface PublicationPage extends CommunityCard {
  ok: true;
  entitlement: 'community_public';
  /** Demo-safe by construction — this shape has no gram field to read. */
  recipe: DemoSafeRecipe;
}

export interface SharePreview {
  ok: true;
  share_link_id: string;
  title: string;
  version_number: number;
  entitlement: ShareEntitlement;
  created_by: CreatorRef;
  shared_by?: { display_name?: string };
  shared_by_is_creator: boolean;
  recipe: DemoSafeRecipe;
  /** Present ONLY on an entitled response. Absent is the Demo case. */
  recipe_input?: unknown;
  recipe_id?: string;
  recipe_version_id?: string;
  engine_version?: string;
  config_version?: string;
  total_batch_g?: number;
}

export type ShareFailureReason = 'not_found' | 'revoked' | 'expired';
export type ShareResolution = SharePreview | { ok: false; reason: ShareFailureReason };

export interface CreatedShareLink {
  share_link_id: string;
  /** Returned EXACTLY once — the database keeps only its hash. */
  token: string;
  version_number: number;
  partner_attribution: boolean;
  created_at: string;
}

export interface ReceivedShare {
  share_link_id: string;
  title: string;
  version_number: number;
  received_at: string;
  last_opened_at: string;
  status: 'active' | 'revoked' | 'expired';
  created_by: string;
  created_by_handle?: string;
  shared_by?: string;
  shared_by_is_creator: boolean;
  entitlement: ShareEntitlement;
  recipe: DemoSafeRecipe;
}

export interface SentShare {
  share_link_id: string;
  title: string;
  recipe_id: string;
  version_number: number;
  created_at: string;
  status: 'active' | 'revoked' | 'expired';
  expires_at?: string;
  opens: number;
  unique_opens: number;
  /** Whether this link currently credits an ACTIVE Gellatti Partner. */
  partner_attribution: boolean;
}

/** Call an RPC, or degrade honestly when the backend is not configured. */
async function readRpc<T>(surface: string, fn: string, args: Record<string, unknown>, fallback: T): Promise<T> {
  if (!supabase) return emptyUnconfiguredRead(surface, fallback);
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return (data as T) ?? fallback;
}

async function writeRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error(UNAVAILABLE);
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

// ── Creator profile ─────────────────────────────────────────────────────────

export interface CreatorProfileInput {
  handle: string;
  displayName: string;
  bio?: string | null;
  country?: string | null;
  city?: string | null;
  avatarUrl?: string | null;
  isPublic?: boolean;
}

export async function claimCreatorProfile(input: CreatorProfileInput) {
  return writeRpc<{ id: string; handle: string; display_name: string; is_public: boolean }>(
    'gellatti_claim_creator_handle_v1',
    {
      p_handle: input.handle,
      p_display_name: input.displayName,
      p_bio: input.bio ?? null,
      p_country: input.country ?? null,
      p_city: input.city ?? null,
      p_avatar_url: input.avatarUrl ?? null,
      p_is_public: input.isPublic ?? true,
    },
  );
}

export async function getCreator(handle: string) {
  return readRpc<
    | { ok: true; creator: CreatorRef; metrics: Record<string, number | null>; publications: CommunityCard[] }
    | { ok: false; reason: 'not_found' }
  >('community.getCreator', 'gellatti_get_creator_v1', { p_handle: handle }, {
    ok: false,
    reason: 'not_found',
  });
}

export async function creatorAnalytics() {
  return readRpc<Record<string, unknown>>(
    'community.creatorAnalytics',
    'gellatti_creator_analytics_v1',
    {},
    { ok: false, reason: 'no_creator_profile' },
  );
}

// ── Publishing (§7, §53) ────────────────────────────────────────────────────

export interface PublishInput {
  recipeId: string;
  /** The IMMUTABLE version to publish — never „latest" (§5). */
  versionNumber: number;
  slug: string;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  category?: string | null;
  tags?: string[];
}

export async function publishRecipe(input: PublishInput) {
  return writeRpc<{ publication_id: string; handle: string; slug: string; version_number: number }>(
    'gellatti_publish_recipe_v1',
    {
      p_recipe_id: input.recipeId,
      p_version_number: input.versionNumber,
      p_slug: input.slug,
      p_title: input.title,
      p_description: input.description ?? null,
      p_image_url: input.imageUrl ?? null,
      p_category: input.category ?? null,
      p_tags: input.tags ?? [],
    },
  );
}

export async function unpublishRecipe(publicationId: string) {
  return writeRpc<{ publication_id: string; status: string }>('gellatti_unpublish_v1', {
    p_publication_id: publicationId,
  });
}

// ── Public Community surfaces ───────────────────────────────────────────────

export async function getPublication(handle: string, slug: string) {
  return readRpc<PublicationPage | { ok: false; reason: 'not_found' }>(
    'community.getPublication',
    'gellatti_get_publication_v1',
    { p_handle: handle, p_slug: slug },
    { ok: false, reason: 'not_found' },
  );
}

/** The entitled read. Refuses server-side when the caller has not paid (§9). */
export async function getPublicationFull(publicationId: string) {
  return readRpc<
    | { ok: true; entitlement: 'full'; recipe_input: unknown; recipe_id: string; version_number: number; total_batch_g: number; engine_version: string; config_version: string; title: string }
    | { ok: false; reason: 'not_found' | 'entitlement_required' }
  >('community.getPublicationFull', 'gellatti_get_publication_full_v1', {
    p_publication_id: publicationId,
  }, { ok: false, reason: 'not_found' });
}

export async function listCommunity(
  window: RankingWindow = 'trending',
  category: string | null = null,
  limit = 24,
  offset = 0,
) {
  return readRpc<CommunityCard[]>('community.list', 'gellatti_list_community_v1', {
    p_window: window,
    p_category: category,
    p_limit: limit,
    p_offset: offset,
  }, []);
}

export async function topRecipes(window: RankingWindow = 'all_time', limit = 100) {
  return readRpc<CommunityCard[]>('community.topRecipes', 'gellatti_top_recipes_v1', {
    p_window: window,
    p_limit: limit,
  }, []);
}

export interface TopCreatorEntry {
  handle: string;
  display_handle: string;
  display_name: string;
  avatar_url?: string;
  country?: string;
  verification_status?: string;
  metrics: {
    public_recipe_count: number;
    unique_users: number;
    unique_makers: number;
    total_makes: number;
    remix_count: number;
    rating_average: number | null;
  };
}

export async function topCreators(limit = 50) {
  return readRpc<TopCreatorEntry[]>('community.topCreators', 'gellatti_top_creators_v1', {
    p_limit: limit,
  }, []);
}

export async function searchCommunity(query: string, limit = 24) {
  return readRpc<CommunityCard[]>('community.search', 'gellatti_search_community_v1', {
    p_query: query,
    p_limit: limit,
  }, []);
}

// ── Direct sharing (§10–§13) ────────────────────────────────────────────────

export async function createShareLink(
  recipeId: string,
  versionNumber: number,
  publicationId: string | null = null,
) {
  return writeRpc<CreatedShareLink>('gellatti_create_share_link_v1', {
    p_recipe_id: recipeId,
    p_version_number: versionNumber,
    p_publication_id: publicationId,
  });
}

/** Logged-out resolution: demo-safe, records nothing about the visitor. */
export async function resolveShare(token: string) {
  return readRpc<ShareResolution>('community.resolveShare', 'gellatti_resolve_share_v1', {
    p_token: token,
  }, { ok: false, reason: 'not_found' });
}

/**
 * Signed-in open: files the recipe under „Udostępnione mi", records Partner
 * acquisition evidence when the link credits an ACTIVE partner, and returns
 * the full formulation only to an entitled recipient (§14, §20, §29).
 */
export async function openShare(token: string) {
  return writeRpc<ShareResolution>('gellatti_open_share_v1', { p_token: token });
}

/**
 * Reopen a share already filed under „Udostępnione mi", without the token.
 * Access is proven by the recipient row the first open created — a stranger
 * guessing a share id has no such row and is refused (§12).
 */
export async function openReceivedShare(shareLinkId: string) {
  return writeRpc<ShareResolution>('gellatti_open_received_share_v1', {
    p_share_link_id: shareLinkId,
  });
}

export async function listReceivedShares() {
  return readRpc<ReceivedShare[]>(
    'community.receivedShares',
    'gellatti_list_received_shares_v1',
    {},
    [],
  );
}

export async function listSentShares() {
  return readRpc<SentShare[]>('community.sentShares', 'gellatti_list_sent_shares_v1', {}, []);
}

/** Revoke a link. New access is denied; existing independent copies stay (§54). */
export async function revokeShareLink(shareLinkId: string): Promise<void> {
  if (!supabase) throw new Error(UNAVAILABLE);
  const { error } = await supabase
    .from('recipe_share_links')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('id', shareLinkId);
  if (error) throw new Error(error.message);
}

/**
 * „Usuń z moich otrzymanych" — hides the row for THIS recipient only. The
 * sender's recipe and the share record are untouched (§12).
 */
export async function removeReceivedShare(shareLinkId: string): Promise<void> {
  if (!supabase) throw new Error(UNAVAILABLE);
  const { error } = await supabase
    .from('recipe_share_recipients')
    .update({ removed_by_recipient: true })
    .eq('share_link_id', shareLinkId);
  if (error) throw new Error(error.message);
}

// ── Proof of use (§21, §22, §41, §42) ───────────────────────────────────────

/**
 * Stamp lineage + the usage event AFTER the derived recipe has been saved by
 * the existing recipe-persistence path. Splitting it this way is why recipe
 * saving, versioning and the Engine needed no changes at all.
 */
export async function recordDerivation(input: {
  derivedRecipeId: string;
  relation: 'copy' | 'remix';
  publicationId?: string | null;
  shareLinkId?: string | null;
}) {
  return writeRpc<{ recipe_id: string; relation: string; depth: number }>(
    'gellatti_record_derivation_v1',
    {
      p_derived_recipe_id: input.derivedRecipeId,
      p_relation: input.relation,
      p_publication_id: input.publicationId ?? null,
      p_share_link_id: input.shareLinkId ?? null,
    },
  );
}

export async function recordMake(input: {
  publicationId: string;
  productionRunId: string;
  recipeId?: string | null;
}) {
  return writeRpc<{ recorded: boolean; make_event_id: string | null }>('gellatti_record_make_v1', {
    p_publication_id: input.publicationId,
    p_production_run_id: input.productionRunId,
    p_recipe_id: input.recipeId ?? null,
  });
}

export async function ratePublication(publicationId: string, stars: number, review?: string | null) {
  return writeRpc<{ rated: boolean; stars: number }>('gellatti_rate_publication_v1', {
    p_publication_id: publicationId,
    p_stars: stars,
    p_review: review ?? null,
  });
}

// ── Moderation intake (§51) ─────────────────────────────────────────────────

export type ReportReason =
  | 'spam'
  | 'inappropriate'
  | 'stolen_content'
  | 'misleading_or_dangerous'
  | 'abuse'
  | 'other';

export async function reportContent(input: {
  publicationId?: string | null;
  creatorProfileId?: string | null;
  reason: ReportReason;
  detail?: string | null;
}): Promise<void> {
  if (!supabase) throw new Error(UNAVAILABLE);
  const { data: userData } = await supabase.auth.getUser();
  const reporter = userData?.user?.id;
  if (!reporter) throw new Error('You must be signed in to report content.');
  const { error } = await supabase.from('community_reports').insert({
    reporter_user_id: reporter,
    publication_id: input.publicationId ?? null,
    creator_profile_id: input.creatorProfileId ?? null,
    reason: input.reason,
    detail: input.detail ?? null,
  });
  if (error) throw new Error(error.message);
}

// ── Partner dashboard (§35) ─────────────────────────────────────────────────

export interface PartnerDashboard {
  ok: true;
  partner_status: 'active';
  tier: string;
  payouts_enabled: boolean;
  codes: Array<{ code: string; slug: string; status: string }>;
  traffic: {
    referral_opens: number;
    recipe_share_opens: number;
    recipe_share_unique_opens: number;
  };
  attributions: { pending: number; active: number };
  commissions: Record<string, { count: number; amount_cents: number; currency: string }>;
}

export type PartnerDashboardResult =
  | PartnerDashboard
  | { ok: false; reason: 'not_a_partner' | 'partner_not_active'; partner_status?: string };

/**
 * „You have no commissions yet" and „you are not an active Partner" are
 * different answers, and the RPC returns them as different reasons so no
 * screen can imply that recipe success alone earns money (§83, owner rule).
 */
export async function partnerDashboard() {
  return readRpc<PartnerDashboardResult>(
    'community.partnerDashboard',
    'gellatti_partner_dashboard_v1',
    {},
    { ok: false, reason: 'not_a_partner' },
  );
}
