import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { consumeOAuthRedirectError } from '@/services/authRedirect';
import { useAuthStore } from '@/stores/authStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';

const queryClient = new QueryClient();

// Captured synchronously at module evaluation — before any async URL processing
// by the auth client can run — so an OAuth error redirect (cancelled/failed at
// Google) is read and scrubbed from the address bar exactly once. `null` on
// every ordinary page load; successful token redirects are untouched.
const bootOAuthError = consumeOAuthRedirectError();

export function AppProviders({ children }: { children: ReactNode }) {
  const initAuth = useAuthStore((state) => state.init);
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const loadSubscription = useSubscriptionStore((state) => state.load);
  const clearSubscription = useSubscriptionStore((state) => state.clear);

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

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
