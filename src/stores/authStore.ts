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
    void getCurrentUser().then((user) => set({ user, status: user ? 'authed' : 'anon' }));
    onAuthChange((user) => set({ user, status: user ? 'authed' : 'anon' }));
  },

  signIn: (email, password) => serviceSignIn(email, password),
  signUp: (email, password) => serviceSignUp(email, password),
  signInWithGoogle: () => serviceSignInWithGoogle(),
  signOut: async () => {
    await serviceSignOut();
    set({ user: null, status: 'anon' });
  },
}));
