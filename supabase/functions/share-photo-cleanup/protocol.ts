/**
 * share-photo-cleanup — the pure part of the worker, tested directly.
 *
 * The DATABASE decides what may be deleted (`gellatti_share_photo_cleanup_claim_v1`),
 * re-checks it in the moment before the delete (`…_confirm_v1`) and decides what
 * counts as deleted (`…_settle_v1`). This module only refuses a malformed claim,
 * keeps the confirmed list inside the claimed list, and compares the call secret
 * — nothing in it can widen what gets deleted.
 */
export const BUCKET = 'recipe-share-photos';
export const CLAIM_LIMIT = 50;
export const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
/** The cleanup call secret travels here, never in `Authorization`. */
export const CLEANUP_KEY_HEADER = 'x-gellatti-cleanup-key';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** The only object names a share photo can have: `<share link id>/<generated name>.<ext>`. */
const OBJECT_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9-]+\.(jpg|png|webp)$/;

export interface RemovalPlan {
  token: string | null;
  names: string[];
  rejected: number;
}

/** The claim the worker acts on: a uuid token and share-photo object names only. */
export function planRemoval(claim: unknown): RemovalPlan {
  if (!claim || typeof claim !== 'object' || Array.isArray(claim)) {
    return { token: null, names: [], rejected: 0 };
  }
  const { claim_token: token, objects } = claim as { claim_token?: unknown; objects?: unknown };
  const listed = Array.isArray(objects) ? objects : [];
  if (typeof token !== 'string' || !UUID.test(token)) {
    return { token: null, names: [], rejected: listed.length };
  }
  const names = [
    ...new Set(
      listed.filter((name): name is string => typeof name === 'string' && OBJECT_NAME.test(name)),
    ),
  ];
  return { token, names, rejected: listed.length - names.length };
}

/**
 * What the confirm step allows to be deleted: never more than the claim, never a
 * name outside the share-photo shape. Anything the database dropped (a file that
 * became attached again, a pause) simply does not come back.
 */
export function confirmedNames(plan: RemovalPlan, confirmation: unknown): string[] {
  if (!confirmation || typeof confirmation !== 'object' || Array.isArray(confirmation)) return [];
  const { objects } = confirmation as { objects?: unknown };
  if (!Array.isArray(objects)) return [];
  const claimed = new Set(plan.names);
  return [
    ...new Set(
      objects.filter(
        (name): name is string =>
          typeof name === 'string' && OBJECT_NAME.test(name) && claimed.has(name),
      ),
    ),
  ];
}

/**
 * What the worker reports after `remove`. On a Storage error nothing is reported
 * as removed. Without an error every removed name is reported, and settle still
 * records a deletion only for files Storage no longer has — a name Storage kept
 * goes back to the queue.
 */
export function removalOutcome(
  names: string[],
  removeError: unknown,
): { removed: string[]; error: string | null } {
  if (removeError) return { removed: [], error: 'storage_remove_failed' };
  return { removed: names, error: null };
}

/** Constant-time comparison of the presented call secret with the configured one. */
export function secretEquals(presented: string, expected: string): boolean {
  if (!expected) return false;
  const a = new TextEncoder().encode(presented);
  const b = new TextEncoder().encode(expected);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}
