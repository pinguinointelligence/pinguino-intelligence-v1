/**
 * Single-active-session policy (PURE, deterministic). One user = one active interactive
 * session at a time. A second-device login CONFLICTS and must ask the user to take over or
 * cancel — never silently concurrent, never silently terminating the other session (except
 * admin/suspension/security paths handled elsewhere).
 */
import {
  BLOCKING_ACCOUNT_STATES,
  type AccountState,
  type AppSession,
  type LoginAttempt,
  type LoginEvaluation,
  type SessionState,
} from './contracts';

/** Legal session-state transitions (everything else throws). */
const SESSION_TRANSITIONS: Readonly<Record<SessionState, readonly SessionState[]>> = {
  pending: ['active', 'blocked', 'expired'],
  active: ['revoked', 'replaced', 'expired', 'conflicting'],
  conflicting: ['active', 'revoked', 'expired'],
  revoked: [],
  expired: [],
  replaced: [],
  blocked: [],
};

export function canTransitionSession(from: SessionState, to: SessionState): boolean {
  return SESSION_TRANSITIONS[from].includes(to);
}

/**
 * Evaluate a login attempt against the current active session (if any). Deterministic:
 *   • blocking account state  → blocked;
 *   • no active session       → activate;
 *   • same user + same device → resume_same (a refresh / reconnect, NOT a conflict);
 *   • otherwise               → conflict (the user must choose takeover or cancel).
 */
export function evaluateLogin(
  existingActive: AppSession | null,
  attempt: LoginAttempt,
  accountState: AccountState,
): LoginEvaluation {
  if (BLOCKING_ACCOUNT_STATES.includes(accountState)) {
    return { outcome: 'blocked', conflictingSessionId: null, reason: `account state '${accountState}'` };
  }
  if (existingActive === null || existingActive.state !== 'active') {
    return { outcome: 'activate', conflictingSessionId: null, reason: 'no active session' };
  }
  if (existingActive.userId === attempt.userId && existingActive.deviceId === attempt.deviceId) {
    return { outcome: 'resume_same', conflictingSessionId: existingActive.sessionId, reason: 'same device refresh/reconnect' };
  }
  return {
    outcome: 'conflict',
    conflictingSessionId: existingActive.sessionId,
    reason: 'another device already has an active session',
  };
}

export interface TakeoverResult {
  /** The prior session, transitioned to 'replaced' + revoked. */
  oldSession: AppSession;
  /** The new session, now 'active'. */
  newSession: AppSession;
  /** Deterministic idempotency key so replaying the takeover is a no-op. */
  idempotencyKey: string;
}

/**
 * Resolve a CONFIRMED takeover: revoke/replace the old session and activate the new one.
 * Pure — the caller persists the two rows + a 'session_takeover' security event.
 */
export function confirmTakeover(
  oldActive: AppSession,
  attempt: LoginAttempt,
  newSessionId: string,
  now: string,
): TakeoverResult {
  if (oldActive.state !== 'active') {
    throw new Error(`takeover requires an active prior session, got '${oldActive.state}'`);
  }
  const newSession: AppSession = {
    sessionId: newSessionId,
    userId: attempt.userId,
    deviceId: attempt.deviceId,
    state: 'active',
    createdAt: now,
    lastActivityAt: now,
    expiresAt: null,
    revokedAt: null,
    replacedBy: null,
  };
  const oldSession: AppSession = {
    ...oldActive,
    state: 'replaced',
    revokedAt: now,
    replacedBy: newSessionId,
  };
  return {
    oldSession,
    newSession,
    idempotencyKey: `takeover:${attempt.userId}:${oldActive.sessionId}:${newSessionId}`,
  };
}

/** Cancel a login on conflict — the new attempt is blocked; the old session is untouched. */
export function cancelOnConflict(attempt: LoginAttempt, now: string): AppSession {
  return {
    sessionId: attempt.attemptId,
    userId: attempt.userId,
    deviceId: attempt.deviceId,
    state: 'blocked',
    createdAt: now,
    lastActivityAt: now,
    expiresAt: null,
    revokedAt: now,
    replacedBy: null,
  };
}

/** Revoke a session (user sign-out, admin/security revocation). Idempotent on terminal states. */
export function revokeSession(session: AppSession, now: string): AppSession {
  if (session.state === 'revoked' || session.state === 'replaced' || session.state === 'expired') {
    return session;
  }
  return { ...session, state: 'revoked', revokedAt: now };
}
