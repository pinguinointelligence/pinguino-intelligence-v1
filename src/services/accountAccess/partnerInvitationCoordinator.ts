import { supabase } from '@/lib/supabase/client';

const INVITATION_RPC = 'gellatti_accept_my_partner_invitation_v1';
const COMPLETION_STORAGE_KEY = 'gellatti_partner_invitation_completion_v1';

export type PartnerInvitationAuthInput = {
  status: 'loading' | 'anon' | 'authed';
  userId: string | null;
};

export type ConfirmedAuthSession = {
  userId: string;
  sessionId: string;
};

export type PartnerInvitationCoordinatorState =
  | 'auth-loading'
  | 'unauthenticated'
  | 'invitation-pending'
  | 'invitation-processing'
  | 'invitation-completed'
  | 'invitation-failed'
  | 'stale-session';

export type PartnerInvitationOutcome =
  | { state: 'auth-loading' | 'unauthenticated' | 'invitation-pending' | 'stale-session' }
  | {
      state: 'invitation-completed';
      accepted: boolean | null;
      deduplicated: boolean;
    }
  | { state: 'invitation-failed'; reason: 'domain' | 'technical' };

type InvitationRpcResult = {
  accepted: boolean;
  reason?: string;
};

type MarkerStorage = Pick<Storage, 'getItem' | 'setItem'>;

type CoordinatorDependencies = {
  getConfirmedSession: () => Promise<ConfirmedAuthSession | null>;
  acceptInvitation: () => Promise<InvitationRpcResult>;
  getStorage: () => MarkerStorage | null;
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

const sameSession = (left: ConfirmedAuthSession, right: ConfirmedAuthSession | null): boolean =>
  right !== null && left.userId === right.userId && left.sessionId === right.sessionId;

const sessionAttemptKey = (session: ConfirmedAuthSession): string =>
  `${session.userId}:${session.sessionId}`;

const browserSessionStorage = (): MarkerStorage | null => {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
};

async function getConfirmedSession(): Promise<ConfirmedAuthSession | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return null;
  const userId = data.claims.sub;
  const sessionId = data.claims.session_id;
  if (
    !isNonEmptyString(userId) ||
    !isNonEmptyString(sessionId) ||
    data.claims.is_anonymous === true
  ) {
    return null;
  }
  return { userId, sessionId };
}

async function acceptInvitation(): Promise<InvitationRpcResult> {
  if (!supabase) return { accepted: false };
  const { data, error } = await supabase.rpc(INVITATION_RPC);
  if (error) {
    const reason = error.message === 'authentication_required' ? 'domain' : 'technical';
    throw new PartnerInvitationError(reason);
  }
  const result = (data ?? {}) as { accepted?: unknown; reason?: unknown };
  return {
    accepted: result.accepted === true,
    reason: typeof result.reason === 'string' ? result.reason : undefined,
  };
}

class PartnerInvitationError extends Error {
  readonly reason: 'domain' | 'technical';

  constructor(reason: 'domain' | 'technical') {
    super('partner_invitation_failed');
    this.name = 'PartnerInvitationError';
    this.reason = reason;
  }
}

/**
 * One coordinator owns the invitation side effect. Its in-memory promise
 * deduplicates Strict Mode/remounts; the session-scoped marker survives a page
 * refresh. Neither the invitation token nor the access token is persisted or
 * logged here.
 */
export function createPartnerInvitationCoordinator(dependencies: CoordinatorDependencies) {
  const inFlight = new Map<string, Promise<PartnerInvitationOutcome>>();
  const completed = new Set<string>();
  let state: PartnerInvitationCoordinatorState = 'invitation-pending';

  const transition = (next: PartnerInvitationCoordinatorState) => {
    state = next;
  };

  const persistedCompletionMatches = (key: string): boolean => {
    if (completed.has(key)) return true;
    try {
      if (dependencies.getStorage()?.getItem(COMPLETION_STORAGE_KEY) !== key) return false;
      completed.add(key);
      return true;
    } catch {
      return false;
    }
  };

  const persistCompletion = (key: string): void => {
    completed.add(key);
    try {
      dependencies.getStorage()?.setItem(COMPLETION_STORAGE_KEY, key);
    } catch {
      // Storage can be disabled. The in-memory guard still covers this mount.
    }
  };

  const evaluate = async (auth: PartnerInvitationAuthInput): Promise<PartnerInvitationOutcome> => {
    if (auth.status === 'loading') {
      transition('auth-loading');
      return { state: 'auth-loading' };
    }
    if (auth.status !== 'authed' || !auth.userId) {
      transition('unauthenticated');
      return { state: 'unauthenticated' };
    }

    const session = await dependencies.getConfirmedSession();
    if (!session) {
      transition('invitation-pending');
      return { state: 'invitation-pending' };
    }
    if (session.userId !== auth.userId) {
      transition('stale-session');
      return { state: 'stale-session' };
    }

    const key = sessionAttemptKey(session);
    if (persistedCompletionMatches(key)) {
      transition('invitation-completed');
      return { state: 'invitation-completed', accepted: null, deduplicated: true };
    }

    const existing = inFlight.get(key);
    if (existing) return existing;

    transition('invitation-processing');
    const request = (async (): Promise<PartnerInvitationOutcome> => {
      try {
        const result = await dependencies.acceptInvitation();
        const currentSession = await dependencies.getConfirmedSession();
        if (!sameSession(session, currentSession)) {
          transition('stale-session');
          return { state: 'stale-session' };
        }
        persistCompletion(key);
        transition('invitation-completed');
        return {
          state: 'invitation-completed',
          accepted: result.accepted,
          deduplicated: false,
        };
      } catch (error) {
        const currentSession = await dependencies.getConfirmedSession();
        if (!sameSession(session, currentSession)) {
          transition('stale-session');
          return { state: 'stale-session' };
        }
        transition('invitation-failed');
        return {
          state: 'invitation-failed',
          reason: error instanceof PartnerInvitationError ? error.reason : 'technical',
        };
      } finally {
        inFlight.delete(key);
      }
    })();
    inFlight.set(key, request);
    return request;
  };

  return {
    evaluate,
    getState: (): PartnerInvitationCoordinatorState => state,
    reset: (): void => {
      inFlight.clear();
      completed.clear();
      state = 'invitation-pending';
    },
  };
}

const partnerInvitationCoordinator = createPartnerInvitationCoordinator({
  getConfirmedSession,
  acceptInvitation,
  getStorage: browserSessionStorage,
});

export const coordinatePartnerInvitation = (
  auth: PartnerInvitationAuthInput,
): Promise<PartnerInvitationOutcome> => partnerInvitationCoordinator.evaluate(auth);

export const getPartnerInvitationCoordinatorState = (): PartnerInvitationCoordinatorState =>
  partnerInvitationCoordinator.getState();

/** Test-only reset for module-level Strict Mode/remount deduplication. */
export const __resetPartnerInvitationCoordinatorForTests = (): void =>
  partnerInvitationCoordinator.reset();
