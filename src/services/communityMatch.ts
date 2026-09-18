/**
 * §32–§40 — the IO half of Community matching.
 *
 * Lives in `src/services/**` because that is the ONLY sanctioned place to touch
 * Supabase: `studioBoundary.test.ts` fails the build if a feature, store or page
 * imports the client directly. The mapping into feature types stays in
 * `@/features/home-creator/matching`, so this file carries no presentation concern.
 *
 * The strict §32 rule is decided inside the match oracles — `…_v1` (one id set) and
 * `…_v2` (an AND of groups, OR inside a group) — never in a formulation oracle. They
 * return public card fields and ingredient NAMES. No gram, ratio, percentage or mass
 * ordering crosses this boundary; gram visibility remains entirely the existing
 * entitlement authority's business.
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

/* ── v2: one request per idea — AND between groups, OR inside a group ─────────── */

const V2_FUNCTION = 'gellatti_match_community_top100_v2';

/**
 * The oracle's own request limits. Beyond them it REFUSES with `[]` — which is
 * indistinguishable from „no match”, so a request outside them is never sent at all.
 */
export const COMMUNITY_MATCH_V2_MAX_GROUPS = 8;
export const COMMUNITY_MATCH_V2_MAX_IDS = 64;
/** A v2 answer later than this is abandoned — and reported as an error, never as „no match”. */
export const COMMUNITY_MATCH_V2_TIMEOUT_MS = 5_000;

/** A v1 card plus the requested ids (of any group) the publication contains. */
export interface CommunityMatchRowV2 extends CommunityMatchRow {
  matched_ids: string[];
}

export type CommunityMatchV2Outcome =
  /** The oracle answered. `rejected` cards were dropped here and are NOT in `rows`. */
  | {
      readonly kind: 'ok';
      readonly rows: readonly CommunityMatchRowV2[];
      readonly rejected: number;
    }
  /** v2 does not exist on this backend (not deployed yet) or there is no backend at all. */
  | { readonly kind: 'unavailable'; readonly reason: 'not_deployed' | 'not_configured' }
  /** Nothing is known about the match — never read this as „no match”. */
  | {
      readonly kind: 'error';
      readonly reason: 'timeout' | 'failed' | 'malformed' | 'invalid_request';
    };

/** Whether the oracle would take this request rather than refuse it with `[]`. */
export function communityGroupsWithinLimits(groups: readonly (readonly string[])[]): boolean {
  const total = groups.reduce((sum, group) => sum + group.length, 0);
  return (
    groups.length >= 1 &&
    groups.length <= COMMUNITY_MATCH_V2_MAX_GROUPS &&
    total <= COMMUNITY_MATCH_V2_MAX_IDS &&
    groups.every(
      (group) =>
        group.length > 0 && group.every((id) => typeof id === 'string' && id.trim() !== ''),
    )
  );
}

/**
 * PostgREST answers PGRST202 when the function is not in its schema cache; Postgres
 * answers 42883 when it does not exist. A 42883 about ANYTHING else (an operator, a
 * function called inside v2) is a broken oracle, not a missing one.
 */
function isMissingV2(error: { code?: string; message?: string }): boolean {
  if (error.code === 'PGRST202') return true;
  const message = error.message ?? '';
  return error.code === '42883' && message.includes(V2_FUNCTION) && /does not exist/i.test(message);
}

/** Keys that would carry a quantity — the gram boundary forbids every one of them. */
const QUANTITY_KEYS: ReadonlySet<string> = new Set([
  'planned_grams',
  'actual_grams',
  'grams',
  'total_batch_g',
]);
const QUANTITY_KEY_SHAPE = /(^|_)(g|kg|grams?|mass|pct|percent|percentage|ratio)$/i;

/** The first quantity-like key anywhere in the card, or null. */
function quantityKeyIn(value: unknown, depth = 0): string | null {
  if (depth > 8 || value === null || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = quantityKeyIn(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  for (const [key, inner] of Object.entries(value)) {
    if (QUANTITY_KEYS.has(key) || QUANTITY_KEY_SHAPE.test(key)) return key;
    const found = quantityKeyIn(inner, depth + 1);
    if (found) return found;
  }
  return null;
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');
const isNullableString = (value: unknown) => value === null || typeof value === 'string';
const isNullableObject = (value: unknown) =>
  value === null || (typeof value === 'object' && !Array.isArray(value));

/** Why a card cannot be rendered, or null when it can. */
function cardDefect(card: unknown): string | null {
  if (card === null || typeof card !== 'object' || Array.isArray(card)) return 'not an object';
  const quantityKey = quantityKeyIn(card);
  if (quantityKey) return `quantity key "${quantityKey}"`;
  const row = card as Record<string, unknown>;
  if (typeof row.publication_id !== 'string' || row.publication_id === '') return 'publication_id';
  if (typeof row.slug !== 'string') return 'slug';
  if (typeof row.title !== 'string') return 'title';
  if (typeof row.rank !== 'number' || !Number.isFinite(row.rank)) return 'rank';
  if (row.all_requested_present !== true) return 'all_requested_present';
  if (!isStringArray(row.matched_ids)) return 'matched_ids';
  if (!(row.also_includes == null || isStringArray(row.also_includes))) return 'also_includes';
  for (const key of ['description', 'image_url', 'category'] as const) {
    if (!(row[key] === undefined || isNullableString(row[key]))) return key;
  }
  for (const key of ['creator', 'based_on'] as const) {
    if (!(row[key] === undefined || isNullableObject(row[key]))) return key;
  }
  return null;
}

/**
 * Ask v2 ONCE which Top 100 publications contain, for EVERY group, at least one of its
 * ids. Each group is one requested ingredient and its owner-approved forms.
 *
 * Unlike v1 this never collapses a failure into `[]`: the caller has to be able to tell
 * „the oracle proved there is no match” from „the oracle is missing / slow / broken”.
 */
export async function matchCommunityTop100GroupRows(input: {
  readonly groups: readonly (readonly string[])[];
  readonly category: string | null;
  readonly limit?: number;
  readonly timeoutMs?: number;
}): Promise<CommunityMatchV2Outcome> {
  if (!supabase) return { kind: 'unavailable', reason: 'not_configured' };
  // The oracle would answer `[]` — a refusal that reads exactly like „no match”.
  if (!communityGroupsWithinLimits(input.groups)) {
    return { kind: 'error', reason: 'invalid_request' };
  }

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve('timeout');
    }, input.timeoutMs ?? COMMUNITY_MATCH_V2_TIMEOUT_MS);
  });
  try {
    const response = await Promise.race([
      supabase
        .rpc(V2_FUNCTION, {
          p_ingredient_groups: input.groups.map((group) => [...group]),
          p_category: input.category,
          p_limit: input.limit ?? 10,
        })
        .abortSignal(controller.signal),
      deadline,
    ]);
    if (response === 'timeout') {
      console.warn(`[GELLATTI] communityMatch.v2: no answer within the deadline`);
      return { kind: 'error', reason: 'timeout' };
    }
    const { data, error } = response;
    if (error) {
      if (isMissingV2(error)) return { kind: 'unavailable', reason: 'not_deployed' };
      console.warn(`[GELLATTI] communityMatch.v2: failed (${error.code ?? 'no code'})`);
      return { kind: 'error', reason: 'failed' };
    }
    if (!Array.isArray(data)) {
      console.warn('[GELLATTI] communityMatch.v2: the answer is not a list');
      return { kind: 'error', reason: 'malformed' };
    }
    const rows: CommunityMatchRowV2[] = [];
    let rejected = 0;
    for (const card of data as unknown[]) {
      const defect = cardDefect(card);
      if (defect) {
        rejected += 1;
        // The card is not rendered. Only the defect is logged, never the card's content.
        console.warn(`[GELLATTI] communityMatch.v2: card dropped — ${defect}`);
        continue;
      }
      rows.push(card as CommunityMatchRowV2);
    }
    return { kind: 'ok', rows, rejected };
  } catch {
    return { kind: 'error', reason: 'failed' };
  } finally {
    clearTimeout(timer);
  }
}
