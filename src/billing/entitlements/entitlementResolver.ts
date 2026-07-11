/**
 * Entitlement resolver — PURE, no IO, no vendor SDK (Billing/Partner spec §22).
 *
 * Input: the caller's `entitlements` rows (migration 0015) read via read-own
 * RLS or by an Edge Function. Output: whether each scope (home / pro /
 * partner) is granted RIGHT NOW, why (the contributing source rows), when the
 * grant expires, and a human-readable explanation trail.
 *
 * Deliberate boundaries:
 *  - Scopes are reported VERBATIM: `pro` does NOT imply `home` here. Whether
 *    Pro inherits Home-derived capabilities is a capability-layer decision
 *    (src/access/plans.ts), not a resolver decision.
 *  - A row counts only if status === 'active' AND starts_at <= now AND
 *    (ends_at is null OR ends_at > now). Revoked, expired (by status OR by
 *    clock), and not-yet-started rows never grant anything — but they are
 *    named in the explanation trail so support can see why.
 *  - Overlapping sources resolve to the LONGEST-LIVING active grant: the
 *    scope expires at the latest ends_at among active sources, or never if
 *    any active source is open-ended (ends_at null).
 *  - Revoking one source never hides another: every active source is kept in
 *    `sources`, so removing any one of them simply re-resolves to the rest.
 */

export type EntitlementScope = 'home' | 'pro' | 'partner';

export type EntitlementSourceType =
  | 'paid_subscription'
  | 'approved_partner'
  | 'admin_grant'
  | 'invite_home_trial';

/**
 * Local mirror of the `public.entitlements` row (migration 0015) — only the
 * columns the resolver reasons about. `status` and `source_type` stay open
 * strings so an old client never crashes on a future vocabulary addition
 * (unknown statuses are treated as NOT active).
 */
export interface EntitlementRow {
  id: string;
  scope: EntitlementScope | string;
  source_type: EntitlementSourceType | string;
  source_id: string;
  /** ISO timestamptz — when the grant becomes effective. */
  starts_at: string;
  /** ISO timestamptz or null — null = open-ended (until revoked). */
  ends_at: string | null;
  /** 'active' | 'revoked' | 'expired' (open string, see above). */
  status: string;
}

/** Resolution for one scope: granted?, why, and until when. */
export interface ScopeResolution {
  granted: boolean;
  /**
   * When the scope stops being granted: the LATEST ends_at among active
   * sources, or null when any active source is open-ended (never expires).
   * Always null when not granted.
   */
  expiresAt: string | null;
  /** Every row currently granting this scope (the "why"). */
  sources: EntitlementRow[];
}

export interface ResolvedEntitlements {
  hasHome: boolean;
  hasPro: boolean;
  hasPartnerMode: boolean;
  home: ScopeResolution;
  pro: ScopeResolution;
  partner: ScopeResolution;
  /** Human-readable trail: every row considered and why it did(n't) count. */
  explanation: string[];
}

const SCOPES: readonly EntitlementScope[] = ['home', 'pro', 'partner'];

const emptyScope = (): ScopeResolution => ({
  granted: false,
  expiresAt: null,
  sources: [],
});

const label = (row: EntitlementRow): string =>
  `${row.scope}/${row.source_type}#${row.id}`;

/** Why a row does not grant anything right now; null = it does. */
function inactiveReason(row: EntitlementRow, now: Date): string | null {
  if (row.status !== 'active') return `status is '${row.status}'`;
  if (new Date(row.starts_at).getTime() > now.getTime()) {
    return `not started (starts_at ${row.starts_at})`;
  }
  if (row.ends_at !== null && new Date(row.ends_at).getTime() <= now.getTime()) {
    return `ended (ends_at ${row.ends_at})`;
  }
  return null;
}

/**
 * Resolve entitlement rows into per-scope grants. Pure + time-injectable
 * (same convention as `planFromSubscription`).
 */
export function resolveEntitlements(
  rows: readonly EntitlementRow[],
  now: Date = new Date(),
): ResolvedEntitlements {
  const explanation: string[] = [];
  const byScope: Record<EntitlementScope, ScopeResolution> = {
    home: emptyScope(),
    pro: emptyScope(),
    partner: emptyScope(),
  };

  for (const row of rows) {
    if (!SCOPES.includes(row.scope as EntitlementScope)) {
      explanation.push(`ignored ${label(row)}: unknown scope '${row.scope}'`);
      continue;
    }
    const reason = inactiveReason(row, now);
    if (reason !== null) {
      explanation.push(`excluded ${label(row)}: ${reason}`);
      continue;
    }
    const scope = byScope[row.scope as EntitlementScope];
    scope.sources.push(row);
    explanation.push(
      `granted ${label(row)}: active${row.ends_at === null ? ', open-ended' : ` until ${row.ends_at}`}`,
    );
  }

  for (const scopeName of SCOPES) {
    const scope = byScope[scopeName];
    if (scope.sources.length === 0) continue;
    scope.granted = true;
    // longest-living grant wins: open-ended beats any date; otherwise max
    const openEnded = scope.sources.some((s) => s.ends_at === null);
    scope.expiresAt = openEnded
      ? null
      : scope.sources
          .map((s) => s.ends_at as string)
          .reduce((a, b) => (new Date(a).getTime() >= new Date(b).getTime() ? a : b));
    explanation.push(
      `scope ${scopeName}: granted by ${scope.sources.length} source(s), ` +
        (scope.expiresAt === null ? 'no expiry' : `expires ${scope.expiresAt}`),
    );
  }

  return {
    hasHome: byScope.home.granted,
    hasPro: byScope.pro.granted,
    hasPartnerMode: byScope.partner.granted,
    home: byScope.home,
    pro: byScope.pro,
    partner: byScope.partner,
    explanation,
  };
}
