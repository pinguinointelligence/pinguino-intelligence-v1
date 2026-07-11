/**
 * Unified effective-access resolver (PURE, deterministic, no IO/SDK).
 *
 * CONSUMES the Billing entitlement result (never rewrites Billing history) and layers
 * account-state, partner-status and admin concerns to produce one EffectiveAccess with a
 * server-authorized mode list + honest denial reasons.
 *
 * Locked rules enforced here:
 *   • authorization is by internal user id + entitlement rows — NEVER by email;
 *   • admin and partner are separate (admin never implies partner, partner never implies admin);
 *   • a blocking account state (suspended/security_locked/disabled) denies everything;
 *   • a partner whose status is not 'approved' LOSES partner-granted access even if a stale
 *     entitlement row still lists it (defence against "suspended partner keeps free Pro").
 */
import {
  ACTIVE_PARTNER_STATUS,
  BLOCKING_ACCOUNT_STATES,
  type AppMode,
  type EffectiveAccess,
  type EffectiveAccessInput,
  type EntitlementScope,
  type EntitlementSourceType,
} from './contracts';

const onlySourceIs = (
  sources: readonly EntitlementSourceType[] | undefined,
  source: EntitlementSourceType,
): boolean => sources !== undefined && sources.length > 0 && sources.every((s) => s === source);

/**
 * Resolve the effective access for a signed-in identity. Deterministic: the same inputs
 * always yield the same result. Preserves every contributing source and explains denials.
 */
export function resolveEffectiveAccess(input: EffectiveAccessInput): EffectiveAccess {
  const { identity, accountState, entitlements, partnerStatus, adminRole } = input;
  const denialReasons: string[] = [...entitlements.explanation];

  const blocked = BLOCKING_ACCOUNT_STATES.includes(accountState);
  const partnerActive = partnerStatus === ACTIVE_PARTNER_STATUS;

  // A scope is granted only if Billing reports it AND (its grant is not partner-only-while-
  // the-partner-is-inactive). This makes partner suspension effective even on a stale input.
  const scopeGranted = (scope: EntitlementScope, hasScope: boolean): boolean => {
    if (blocked || !hasScope) return false;
    const sources = entitlements.sourcesByScope[scope];
    if (onlySourceIs(sources, 'approved_partner') && !partnerActive) {
      denialReasons.push(
        `${scope}: denied — the only source is an approved-partner grant but partner status is '${partnerStatus}'`,
      );
      return false;
    }
    return true;
  };

  if (blocked) denialReasons.push(`account state '${accountState}' blocks all access`);

  const canHome = scopeGranted('home', entitlements.hasHome);
  const canPro = scopeGranted('pro', entitlements.hasPro);
  // Partner MODE additionally requires an approved partner status (not just an entitlement).
  const canPartner = !blocked && entitlements.hasPartnerMode && partnerActive;
  if (!blocked && entitlements.hasPartnerMode && !partnerActive) {
    denialReasons.push(`partner mode denied — partner status is '${partnerStatus}', not 'approved'`);
  }
  const canAdmin = !blocked && adminRole !== 'none';

  const signedInAndActive = Boolean(identity.userId) && !blocked;

  const allowedModes: AppMode[] = [];
  if (canHome) allowedModes.push('home');
  if (canPro) allowedModes.push('pro');
  if (canPartner) allowedModes.push('partner');
  if (canAdmin) allowedModes.push('admin');

  return {
    canHome,
    canPro,
    canPartner,
    canAdmin,
    exactGrams: canPro,
    saveRecipes: signedInAndActive,
    professionalScaling: canPro,
    partnerAnalytics: canPartner,
    accountAdministration: canAdmin,
    allowedModes,
    activeSourcesByScope: entitlements.sourcesByScope,
    denialReasons,
  };
}
