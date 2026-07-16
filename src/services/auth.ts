/**
 * Auth service (Phase 2A) — the boundary between the app and Supabase auth.
 *
 * The app/stores/UI call these functions and receive APP-LEVEL types only
 * (`AuthUser`), never raw Supabase types. When Supabase is not configured every
 * call resolves to an "unavailable" result so the UI can degrade gracefully.
 */
import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '@/lib/supabase/client';
import { allowedOAuthRedirectOrigin } from './authRedirect';

export interface AuthUser {
  id: string;
  email: string | null;
  displayName: string | null;
}

export type AuthResult =
  | { ok: true; needsConfirmation: boolean }
  | { ok: false; message: string };

/** Whether real auth is wired in this build (both public env vars present). */
export const isAuthAvailable = isSupabaseConfigured;

const UNAVAILABLE = 'Sign-in is not available in this build.';

const toUser = (user: User | null | undefined): AuthUser | null =>
  user
    ? {
        id: user.id,
        email: user.email ?? null,
        displayName: (user.user_metadata?.display_name as string | undefined) ?? null,
      }
    : null;

export async function signUp(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: UNAVAILABLE };
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { ok: false, message: error.message };
  // No session ⇒ the project requires email confirmation before sign-in.
  return { ok: true, needsConfirmation: data.session === null };
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: UNAVAILABLE };
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, message: error.message };
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
  if (!supabase) return { ok: false, message: UNAVAILABLE };
  const origin = typeof window !== 'undefined' ? window.location.origin : undefined;
  const redirectTo = allowedOAuthRedirectOrigin(origin);
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: redirectTo ? { redirectTo } : undefined,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true, needsConfirmation: false };
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return toUser(data.session?.user);
}

/** Subscribe to auth changes; returns an unsubscribe function. */
export function onAuthChange(callback: (user: AuthUser | null) => void): () => void {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session: Session | null) => {
    callback(toUser(session?.user));
  });
  return () => data.subscription.unsubscribe();
}
