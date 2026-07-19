/**
 * Live Account-Access sync (READ-ONLY) — the runtime bridge that turns a signed-in
 * user's REAL entitlement rows into the `EffectiveAccess` the persona resolver consumes.
 *
 * This is the previously-missing link in the authorization chain (owner P0 2026-07-18:
 * "Home and Pro render the same experience"). Until now nothing ever called
 * `proCoreAccessStore.setEffectiveAccess`, so `effectiveAccess` stayed `null` and
 * `useProCorePersona` fell back to 'demo' for EVERYONE — home@home.com and pro@pro.com
 * included. This module closes that gap:
 *
 *   authed user id → RLS-scoped `public.entitlements` rows (0015) → Billing's pure
 *   resolver → account-access `resolveEffectiveAccess` → EffectiveAccess → the store.
 *
 * HONESTY / SAFETY rules (all locked):
 *   • authorization is by internal user id + entitlement rows, NEVER by email;
 *   • the frontend only ever READS its own rows (RLS: auth.uid() = user_id) — it can
 *     never write or self-grant a scope;
 *   • ANY failure (no auth, Supabase absent, read error, junk rows) resolves to `null`
 *     → an honest 'demo', never a guessed paid scope;
 *   • account-state / partner-status / admin-role are held at the honest MVP baseline
 *     (active / none / none) until the account-access tables (migration 0025) are
 *     applied and read here — a suspended-account or partner mechanism is a follow-up,
 *     tracked in the account-access memory, and does NOT over-grant in the meantime.
 *
 * The IO adapter takes the client as a parameter so the pure derivation and the
 * row-shape defence are fully unit-testable without a live backend (vitest is node-env).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import type { EntitlementRow } from '@/billing/entitlements/entitlementResolver';
import type { EffectiveAccess } from '@/access/accountAccess/contracts';
import { resolveAccountAccess } from './billingEntitlementBridge';

/** The columns the pure resolver reasons about (mirrors `EntitlementRow`). */
const ENTITLEMENT_COLUMNS = 'id, scope, source_type, source_id, starts_at, ends_at, status';

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/**
 * Defensive parse of one raw DB row into an `EntitlementRow`. A row missing a required
 * field (or with the wrong type) is DROPPED (`null`), never fabricated — schema drift
 * degrades to fewer grants, never to a crash or an invented entitlement. Unknown
 * `scope` / `source_type` / `status` values are preserved verbatim: the pure resolver
 * already treats unknown statuses as not-active and unknown scopes as ungranted.
 */
export function parseEntitlementRow(raw: unknown): EntitlementRow | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (
    !isNonEmptyString(r.id) ||
    !isNonEmptyString(r.scope) ||
    !isNonEmptyString(r.source_type) ||
    !isNonEmptyString(r.source_id) ||
    !isNonEmptyString(r.starts_at) ||
    !isNonEmptyString(r.status)
  ) {
    return null;
  }
  if (r.ends_at !== null && typeof r.ends_at !== 'string') return null;
  return {
    id: r.id,
    scope: r.scope,
    source_type: r.source_type,
    source_id: r.source_id,
    starts_at: r.starts_at,
    ends_at: (r.ends_at as string | null) ?? null,
    status: r.status,
  };
}

/**
 * PURE: a signed-in identity + its fetched active entitlement rows → EffectiveAccess.
 *
 * account-state / partner-status / admin-role default to the honest MVP baseline
 * (see file header). Deterministic given (userId, rows, now); no IO.
 */
export function deriveEffectiveAccess(input: {
  userId: string;
  email: string | null;
  entitlementRows: readonly EntitlementRow[];
  now: string;
}): EffectiveAccess {
  return resolveAccountAccess({
    identity: { userId: input.userId, email: input.email, emailVerified: true },
    accountState: 'active',
    entitlementRows: input.entitlementRows,
    partnerStatus: 'none',
    adminRole: 'none',
    now: input.now,
  });
}

/**
 * IO: fetch the current user's ACTIVE entitlement rows. RLS restricts the result to
 * the caller's own rows; the explicit `user_id` + `status` filters are defence-in-depth
 * and keep the payload minimal. Malformed rows are dropped by `parseEntitlementRow`.
 * Throws on a transport/query error so the caller can fail safe to 'demo'.
 */
export async function fetchActiveEntitlementRows(
  client: Pick<SupabaseClient, 'from'>,
  userId: string,
): Promise<EntitlementRow[]> {
  const { data, error } = await client
    .from('entitlements')
    .select(ENTITLEMENT_COLUMNS)
    .eq('user_id', userId)
    .eq('status', 'active');
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map(parseEntitlementRow)
    .filter((row): row is EntitlementRow => row !== null);
}

/**
 * End-to-end resolve for the signed-in user, for `setEffectiveAccess`.
 *
 * Returns `null` — an HONEST 'demo' — whenever auth or Supabase is unavailable or the
 * read fails, and NEVER a guessed paid scope. A `home`-scoped row yields `canHome`; a
 * `pro`-scoped row yields `canPro` (+ exact grams + professional scaling). No row → demo.
 */
export async function syncEffectiveAccess(
  userId: string | null,
  email: string | null,
): Promise<EffectiveAccess | null> {
  if (userId === null || supabase === null) return null;
  try {
    const rows = await fetchActiveEntitlementRows(supabase, userId);
    return deriveEffectiveAccess({
      userId,
      email,
      entitlementRows: rows,
      now: new Date().toISOString(),
    });
  } catch {
    // Fail safe to demo — a read error must never accidentally grant Home/Pro.
    return null;
  }
}
