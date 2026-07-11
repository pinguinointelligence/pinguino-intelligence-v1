/**
 * ACCOUNT ACCESS — shared contracts (types only, no logic, no IO, no vendor SDK).
 *
 * The central identity / entitlement / session / device / security layer. It CONSUMES
 * the Billing entitlement result (it never rewrites Billing history) and layers
 * account-state, admin and session/device concerns on top.
 *
 * LOCKED IDENTITY PRINCIPLES encoded by these types:
 *   • the authenticated internal user id (auth.uid()) is the authorization identity —
 *     never the email (email links an invite/application to an account ONCE, then
 *     internal ids resolve permissions);
 *   • admin status and partner status are SEPARATE concepts;
 *   • a user may hold multiple entitlement sources; the resolver preserves all of them
 *     and exposes the winning result + denial reasons;
 *   • client-side route visibility is NOT authorization — every protected action is
 *     checked server-side / by RLS (these pure types are the decision inputs).
 */

/* ── identity ────────────────────────────────────────────────────────────── */

/** A resolved application identity (mirrors src/services/auth AuthUser). */
export interface AccountIdentity {
  /** Internal authenticated user id — the ONLY authorization identity. */
  userId: string;
  /** Verified email, when the provider confirmed it (used once for linking only). */
  email: string | null;
  emailVerified: boolean;
}

export type AuthProvider = 'password' | 'google' | 'magic_link';

/** A provider account linked to one internal user id (deterministic, audited). */
export interface ProviderLink {
  userId: string;
  provider: AuthProvider;
  providerAccountId: string;
  emailVerifiedAt: string | null;
  linkedAt: string;
}

/* ── account state ───────────────────────────────────────────────────────── */

export type AccountState =
  | 'active'
  | 'pending_verification'
  | 'security_locked'
  | 'suspended'
  | 'deletion_requested'
  | 'disabled'
  | 'restored';

/** States in which no new interactive session may be established. */
export const BLOCKING_ACCOUNT_STATES: readonly AccountState[] = [
  'security_locked',
  'suspended',
  'disabled',
];

/* ── entitlement input (CONSUMED from Billing — never rewritten here) ──────── */

/** Entitlement scopes as owned by Billing (src/billing/entitlements). */
export type EntitlementScope = 'home' | 'pro' | 'partner';

/** Why an entitlement exists. Mirrors Billing source_type + account-access admin/invite. */
export type EntitlementSourceType =
  | 'paid_subscription'
  | 'approved_partner'
  | 'admin_grant'
  | 'invite_home_trial'
  | 'franchise_grant';

/**
 * The minimal, structural shape account-access needs from Billing's resolver output.
 * An adapter maps Billing's real ResolvedEntitlements → this — account-access never
 * imports the payment-provider SDK and never mutates Billing rows.
 */
export interface EntitlementResultLike {
  hasHome: boolean;
  hasPro: boolean;
  hasPartnerMode: boolean;
  /** Per-scope contributing sources (preserved verbatim for the audit trail). */
  sourcesByScope: Partial<Record<EntitlementScope, readonly EntitlementSourceType[]>>;
  /** Human-readable trail from Billing (why each row granted/was excluded). */
  explanation: readonly string[];
}

/** Approved-partner status as owned by Billing (partners.status / partner_applications). */
export type PartnerStatus =
  | 'none'
  | 'under_review'
  | 'approved'
  | 'suspended'
  | 'terminated'
  | 'rejected';

/** Only this partner status grants free Home+Pro+Partner via entitlement. */
export const ACTIVE_PARTNER_STATUS: PartnerStatus = 'approved';

/* ── admin (separate from partner) ───────────────────────────────────────── */

export type AdminRole = 'none' | 'support_admin' | 'super_admin';

/* ── effective access (the resolver output) ──────────────────────────────── */

export type AppMode = 'home' | 'pro' | 'partner' | 'admin';

export interface EffectiveAccess {
  /** Capability flags (superset compatible with src/access/plans Capabilities). */
  canHome: boolean;
  canPro: boolean;
  canPartner: boolean;
  canAdmin: boolean;
  exactGrams: boolean;
  saveRecipes: boolean;
  professionalScaling: boolean;
  partnerAnalytics: boolean;
  accountAdministration: boolean;
  /** Server-authorized mode list (the ONLY valid modes; UI must not exceed it). */
  allowedModes: readonly AppMode[];
  /** Every scope that contributed, preserved (never collapsed). */
  activeSourcesByScope: Partial<Record<EntitlementScope, readonly EntitlementSourceType[]>>;
  /** Why access was denied/limited (honest trail — includes the Billing explanation). */
  denialReasons: readonly string[];
}

/** Inputs to the deterministic effective-access resolver. */
export interface EffectiveAccessInput {
  identity: AccountIdentity;
  accountState: AccountState;
  /** Billing entitlement result, mapped to the structural shape. */
  entitlements: EntitlementResultLike;
  /** Partner status as owned by Billing (drives partner-mode gating). */
  partnerStatus: PartnerStatus;
  adminRole: AdminRole;
}

/* ── sessions (single active interactive session) ────────────────────────── */

export type SessionState =
  | 'pending'
  | 'active'
  | 'conflicting'
  | 'revoked'
  | 'expired'
  | 'replaced'
  | 'blocked';

export interface AppSession {
  sessionId: string;
  userId: string;
  deviceId: string;
  state: SessionState;
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  /** When replaced by a takeover, the session that replaced it. */
  replacedBy: string | null;
}

export interface LoginAttempt {
  attemptId: string;
  userId: string;
  deviceId: string;
  at: string;
}

export type LoginOutcome = 'activate' | 'conflict' | 'blocked' | 'resume_same';

export interface LoginEvaluation {
  outcome: LoginOutcome;
  /** The existing active session that conflicts, when outcome === 'conflict'. */
  conflictingSessionId: string | null;
  reason: string;
}

/* ── devices (privacy-conscious registry) ────────────────────────────────── */

export type DeviceCategory = 'desktop' | 'tablet' | 'mobile' | 'unknown';

export interface DeviceRecord {
  deviceId: string;
  userId: string;
  /** App-generated random id hash — NOT invasive fingerprinting. */
  deviceHash: string;
  friendlyName: string;
  category: DeviceCategory;
  browserFamily: string | null;
  osFamily: string | null;
  firstSeen: string;
  lastSeen: string;
  trusted: boolean;
  revokedAt: string | null;
}

/* ── security events (append-only audit) ─────────────────────────────────── */

export type SecurityActorType = 'system' | 'admin' | 'user' | 'webhook';

export type SecurityEventType =
  | 'account_created'
  | 'email_verified'
  | 'login_succeeded'
  | 'login_failed'
  | 'login_conflict'
  | 'session_takeover'
  | 'session_revoked'
  | 'all_sessions_revoked'
  | 'password_reset_requested'
  | 'password_changed'
  | 'provider_linked'
  | 'provider_conflict'
  | 'device_registered'
  | 'device_renamed'
  | 'device_revoked'
  | 'account_suspended'
  | 'account_restored'
  | 'entitlement_added'
  | 'entitlement_removed'
  | 'partner_access_activated'
  | 'partner_access_suspended'
  | 'admin_grant_added'
  | 'admin_grant_removed';

export interface SecurityEvent {
  actorType: SecurityActorType;
  /** Actor's internal id (or null for anonymous/system). */
  actorId: string | null;
  affectedUserId: string;
  eventType: SecurityEventType;
  occurredAt: string;
  deviceId: string | null;
  sessionId: string | null;
  /** Safe structured metadata — NEVER a password, token, raw magic link or secret. */
  metadata: Readonly<Record<string, string | number | boolean | null>>;
  reason: string | null;
  /** Idempotency / correlation key so the same event is never double-recorded. */
  correlationKey: string;
}
