/**
 * Auth service (Phase 2A) — the boundary between the app and Supabase auth.
 *
 * The app/stores/UI call these functions and receive APP-LEVEL types only
 * (`AuthUser`), never raw Supabase types. When Supabase is not configured every
 * call resolves to an "unavailable" result so the UI can degrade gracefully.
 */
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '@/lib/supabase/client';
import {
  CustomerOperationError,
  toCustomerSafeError,
  type CustomerErrorCode,
} from '@/copy/customerError';
import { allowedOAuthRedirectOrigin } from './authRedirect';

export interface AuthUser {
  id: string;
  email: string | null;
  displayName: string | null;
}

export type AuthResult =
  | { ok: true; needsConfirmation: boolean }
  | { ok: false; code: CustomerErrorCode; message: string };

/** Whether real auth is wired in this build (both public env vars present). */
export const isAuthAvailable = isSupabaseConfigured;

const authFailure = (cause: unknown): AuthResult => {
  const error = toCustomerSafeError(cause, 'auth');
  return { ok: false, code: error.code, message: error.message };
};

const unavailable = (): AuthResult => authFailure(new CustomerOperationError('AUTH_UNAVAILABLE'));

const toUser = (user: User | null | undefined): AuthUser | null =>
  user
    ? {
        id: user.id,
        email: user.email ?? null,
        displayName: (user.user_metadata?.display_name as string | undefined) ?? null,
      }
    : null;

/**
 * Opt-in served QA trace. It records only event shape — never token, email,
 * user id, headers or storage values. `?owner-auth-trace=1` is intentionally a
 * diagnostic switch rather than permanent customer console noise.
 */
const traceAuth = (
  event: AuthChangeEvent | 'SESSION_SNAPSHOT' | 'SESSION_READ_FAILED',
  sessionPresent: boolean,
  userPresent: boolean,
): void => {
  if (typeof window === 'undefined') return;
  if (new URLSearchParams(window.location.search).get('owner-auth-trace') !== '1') return;
  console.info('[owner-auth-trace]', { event, sessionPresent, userPresent });
};

export async function signUp(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return authFailure(error);
  // No session ⇒ the project requires email confirmation before sign-in.
  return { ok: true, needsConfirmation: data.session === null };
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return unavailable();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return authFailure(error);
  return { ok: true, needsConfirmation: false };
}

/**
 * Google sign-in via the hosted OAuth flow. Navigates the browser away to
 * Google; the session is picked up on return by `detectSessionInUrl` +
 * `onAuthStateChange` on whatever route the user lands on. `redirectTo` is
 * ONLY ever the app's own current origin (validated against a closed
 * allowlist); when the origin is not recognised we omit it and the backend
 * falls back to its dashboard-configured Site URL.
 */
export async function signInWithGoogle(): Promise<AuthResult> {
  if (!supabase) return unavailable();
  const origin = typeof window !== 'undefined' ? window.location.origin : undefined;
  const redirectTo = allowedOAuthRedirectOrigin(origin);
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: redirectTo ? { redirectTo } : undefined,
  });
  if (error) return authFailure(error);
  return { ok: true, needsConfirmation: false };
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    traceAuth('SESSION_READ_FAILED', false, false);
    // A transient read/refresh error is not proof of logout. The auth store
    // keeps its current projection and waits for the authoritative auth event.
    throw error;
  }
  traceAuth('SESSION_SNAPSHOT', Boolean(data.session), Boolean(data.session?.user));
  return toUser(data.session?.user);
}

/** Subscribe to auth changes; returns an unsubscribe function. */
export function onAuthChange(
  callback: (event: AuthChangeEvent, user: AuthUser | null) => void,
): () => void {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((event, session: Session | null) => {
    const user = toUser(session?.user);
    traceAuth(event, Boolean(session), Boolean(user));
    callback(event, user);
  });
  return () => data.subscription.unsubscribe();
}
