/**
 * Billing → Account Access bridge (READ-ONLY). Calls Billing's PURE entitlement resolver
 * over `public.entitlements` rows (migration 0015) and maps the result into the structural
 * shape the account-access resolver consumes. It NEVER writes or rewrites Billing rows —
 * financial subscription state stays owned by the Billing architecture.
 */
import {
  resolveEntitlements,
  type EntitlementRow,
  type ResolvedEntitlements,
  type ScopeResolution,
} from '@/billing/entitlements/entitlementResolver';
import { resolveEffectiveAccess } from '@/access/accountAccess/effectiveAccess';
import type {
  AccountIdentity,
  AccountState,
  AdminRole,
  EffectiveAccess,
  EntitlementResultLike,
  EntitlementScope,
  EntitlementSourceType,
  PartnerStatus,
} from '@/access/accountAccess/contracts';

const scopeSources = (resolution: ScopeResolution): EntitlementSourceType[] => {
  const seen = new Set<string>();
  const out: EntitlementSourceType[] = [];
  for (const row of resolution.sources) {
    if (!seen.has(row.source_type)) {
      seen.add(row.source_type);
      out.push(row.source_type as EntitlementSourceType);
    }
  }
  return out;
};

/** Map Billing's ResolvedEntitlements → the account-access structural input. Pure. */
export function toEntitlementResult(resolved: ResolvedEntitlements): EntitlementResultLike {
  const sourcesByScope: Partial<Record<EntitlementScope, readonly EntitlementSourceType[]>> = {};
  if (resolved.home.granted) sourcesByScope.home = scopeSources(resolved.home);
  if (resolved.pro.granted) sourcesByScope.pro = scopeSources(resolved.pro);
  if (resolved.partner.granted) sourcesByScope.partner = scopeSources(resolved.partner);
  return {
    hasHome: resolved.hasHome,
    hasPro: resolved.hasPro,
    hasPartnerMode: resolved.hasPartnerMode,
    sourcesByScope,
    explanation: resolved.explanation,
  };
}

export interface AccountAccessResolutionInput {
  identity: AccountIdentity;
  accountState: AccountState;
  /** Caller-fetched entitlement rows (RLS-owned) — Billing's source of truth. */
  entitlementRows: readonly EntitlementRow[];
  partnerStatus: PartnerStatus;
  adminRole: AdminRole;
  now: string;
}

/**
 * Resolve a signed-in identity's EffectiveAccess end-to-end: run Billing's pure resolver,
 * map it, then layer account-state/partner/admin via the account-access resolver.
 */
export function resolveAccountAccess(input: AccountAccessResolutionInput): EffectiveAccess {
  const resolved = resolveEntitlements([...input.entitlementRows], new Date(input.now));
  return resolveEffectiveAccess({
    identity: input.identity,
    accountState: input.accountState,
    entitlements: toEntitlementResult(resolved),
    partnerStatus: input.partnerStatus,
    adminRole: input.adminRole,
  });
}
