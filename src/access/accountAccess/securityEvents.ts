/**
 * Append-only account-security event builders (PURE). Every builder produces a SecurityEvent
 * with a deterministic correlation key (idempotency) and structurally cannot carry a
 * password, token, raw magic link or secret — metadata is limited to safe scalars and a
 * runtime guard strips any key that looks secret.
 */
import type { SecurityActorType, SecurityEvent, SecurityEventType } from './contracts';

/** Keys that must never appear in security-event metadata. */
const FORBIDDEN_METADATA_KEY = /pass|token|secret|magic|otp|cvv|card|key$|_key|authorization/i;

export type SafeMetadataValue = string | number | boolean | null;

/** Strip any key that looks like a credential; keep only safe scalar values. */
export function sanitizeMetadata(
  metadata: Readonly<Record<string, unknown>>,
): Record<string, SafeMetadataValue> {
  const safe: Record<string, SafeMetadataValue> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (FORBIDDEN_METADATA_KEY.test(key)) continue;
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
      safe[key] = value as SafeMetadataValue;
    }
  }
  return safe;
}

export interface SecurityEventInput {
  actorType: SecurityActorType;
  actorId: string | null;
  affectedUserId: string;
  eventType: SecurityEventType;
  occurredAt: string;
  deviceId?: string | null;
  sessionId?: string | null;
  metadata?: Readonly<Record<string, unknown>>;
  reason?: string | null;
  /** Optional explicit correlation key; else a deterministic one is derived. */
  correlationKey?: string;
}

/**
 * Build a sanitized, append-only security event. The correlation key defaults to a
 * deterministic composite so replaying the same logical event is idempotent.
 */
export function buildSecurityEvent(input: SecurityEventInput): SecurityEvent {
  const correlationKey =
    input.correlationKey ??
    `${input.eventType}:${input.affectedUserId}:${input.sessionId ?? input.deviceId ?? '-'}:${input.occurredAt}`;
  return {
    actorType: input.actorType,
    actorId: input.actorId,
    affectedUserId: input.affectedUserId,
    eventType: input.eventType,
    occurredAt: input.occurredAt,
    deviceId: input.deviceId ?? null,
    sessionId: input.sessionId ?? null,
    metadata: sanitizeMetadata(input.metadata ?? {}),
    reason: input.reason ?? null,
    correlationKey,
  };
}

/** Convenience for a user-actor event (login, device, session actions the user performs). */
export function userSecurityEvent(
  affectedUserId: string,
  eventType: SecurityEventType,
  occurredAt: string,
  extra: Partial<SecurityEventInput> = {},
): SecurityEvent {
  return buildSecurityEvent({
    actorType: 'user',
    actorId: affectedUserId,
    affectedUserId,
    eventType,
    occurredAt,
    ...extra,
  });
}

/** Convenience for an admin-actor event (suspension, grant, revoke — reason required). */
export function adminSecurityEvent(
  adminId: string,
  affectedUserId: string,
  eventType: SecurityEventType,
  occurredAt: string,
  reason: string,
  extra: Partial<SecurityEventInput> = {},
): SecurityEvent {
  if (reason.trim() === '') throw new Error('admin security events require a reason');
  return buildSecurityEvent({
    actorType: 'admin',
    actorId: adminId,
    affectedUserId,
    eventType,
    occurredAt,
    reason,
    ...extra,
  });
}
