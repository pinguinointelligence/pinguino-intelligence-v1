/**
 * Auth store (Phase 2A) — current session identity for the UI.
 *
 * Consumes the `@/services/auth` boundary only; it never imports the vendor
 * client directly (the UI/store layer stays vendor-free per the boundary guard).
 * `init()` restores any persisted session and subscribes to auth changes; when
 * auth is unavailable the store settles to a permanent `anon` state.
 */
import { create } from 'zustand';
import {
  getCurrentUser,
  isAuthAvailable,
  onAuthChange,
  signIn as serviceSignIn,
  signInWithGoogle as serviceSignInWithGoogle,
  signOut as serviceSignOut,
  signUp as serviceSignUp,
  type AuthResult,
  type AuthUser,
} from '@/services/auth';

type AuthStatus = 'loading' | 'authed' | 'anon';

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  /** False when this build has no auth backend configured (UI shows "unavailable"). */
  available: boolean;
  init: () => void;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  /** Hosted Google OAuth — on success the browser navigates away; the session
   * is restored by the auth-change subscription when the user returns. */
  signInWithGoogle: () => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

let initialized = false;
let authProjectionRevision = 0;

export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',
  user: null,
  available: isAuthAvailable,

  init: () => {
    if (initialized) return;
    initialized = true;
    if (!isAuthAvailable) {
      set({ status: 'anon' });
      return;
    }
    const snapshotRevision = authProjectionRevision;
    void getCurrentUser()
      .then((user) => {
        // The auth event stream may deliver INITIAL_SESSION/SIGNED_IN before this promise
        // settles. A late snapshot must never overwrite that newer event with
        // a false guest projection.
        if (authProjectionRevision !== snapshotRevision) return;
        set({ user, status: user ? 'authed' : 'anon' });
      })
      .catch(() => {
        // A session read/refresh error is not a SIGNED_OUT event. Preserve the
        // current projection and let the auth event stream settle identity.
      });
    onAuthChange((event, user) => {
      authProjectionRevision += 1;
      if (user) {
        set({ user, status: 'authed' });
        return;
      }
      // Only explicit/initial no-session events establish anonymous identity.
      // A malformed/transient TOKEN_REFRESHED callback with no session cannot
      // wipe account state or entitlement on its own.
      if (event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') {
        set({ user: null, status: 'anon' });
      }
    });
  },

  signIn: (email, password) => serviceSignIn(email, password),
  signUp: (email, password) => serviceSignUp(email, password),
  signInWithGoogle: () => serviceSignInWithGoogle(),
  signOut: async () => {
    await serviceSignOut();
    set({ user: null, status: 'anon' });
  },
}));

/** Test-only reset for the module-level one-shot bootstrap. */
export function __resetAuthStoreForTests(): void {
  initialized = false;
  authProjectionRevision = 0;
  useAuthStore.setState({ status: 'loading', user: null, available: isAuthAvailable });
}
