import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useRef, type ReactNode } from 'react';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { consumeOAuthRedirectError } from '@/services/authRedirect';
import { syncEffectiveAccess } from '@/services/accountAccess/liveEffectiveAccess';
import { useProCoreAccessStore } from '@/features/pro-core/proCoreAccessStore';
import { useAuthStore } from '@/stores/authStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { clearAccountScopedClientState, isAccountBoundaryChange } from './accountSessionReset';

const queryClient = new QueryClient();

// Captured synchronously at module evaluation — before any async URL processing
// by the auth client can run — so an OAuth error redirect (cancelled/failed at
// Google) is read and scrubbed from the address bar exactly once. `null` on
// every ordinary page load; successful token redirects are untouched.
const bootOAuthError = consumeOAuthRedirectError();

export function AppProviders({ children }: { children: ReactNode }) {
  const initAuth = useAuthStore((state) => state.init);
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const userEmail = useAuthStore((state) => state.user?.email ?? null);
  const loadSubscription = useSubscriptionStore((state) => state.load);
  const clearSubscription = useSubscriptionStore((state) => state.clear);
  const setEffectiveAccess = useProCoreAccessStore((state) => state.setEffectiveAccess);

  // Restore any persisted session once on mount (no-op when auth is unavailable).
  useEffect(() => {
    initAuth();
    if (bootOAuthError) {
      useAuthModalStore.getState().openWithNotice({
        kind: bootOAuthError.kind === 'cancelled' ? 'oauth-cancelled' : 'oauth-failed',
        detail: bootOAuthError.description,
      });
    }
  }, [initAuth]);

  // Load the user's subscription when they sign in; clear it on sign-out.
  useEffect(() => {
    if (userId) void loadSubscription();
    else clearSubscription();
  }, [userId, loadSubscription, clearSubscription]);

  // Cross-account isolation (owner P0): when a REAL signed-in user logs out or is
  // switched on the same browser, wipe the previous account's private client
  // state (query cache = another user's saved recipes/products, recipe draft,
  // intake) so it can never render for the next account. Narrow by design — never
  // fires on first mount or anon→login, so an anonymous draft is preserved.
  const prevUserIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const prev = prevUserIdRef.current;
    prevUserIdRef.current = userId;
    if (isAccountBoundaryChange(prev, userId)) clearAccountScopedClientState(queryClient);
  }, [userId]);

  // Resolve the REAL Home/Pro entitlement into the persona store on every auth
  // change (owner P0 2026-07-18): this is what makes home@home.com and
  // pro@pro.com two different products instead of both collapsing to demo. On
  // sign-out — or any read failure / unconfigured backend — it clears to null,
  // an honest 'demo'. A late resolve is ignored once the user changed again.
  useEffect(() => {
    let cancelled = false;
    void syncEffectiveAccess(userId, userEmail).then((access) => {
      if (!cancelled) setEffectiveAccess(access);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, userEmail, setEffectiveAccess]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
