import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';

const queryClient = new QueryClient();

export function AppProviders({ children }: { children: ReactNode }) {
  const initAuth = useAuthStore((state) => state.init);
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const loadSubscription = useSubscriptionStore((state) => state.load);
  const clearSubscription = useSubscriptionStore((state) => state.clear);

  // Restore any persisted session once on mount (no-op when auth is unavailable).
  useEffect(() => {
    initAuth();
  }, [initAuth]);

  // Load the user's subscription when they sign in; clear it on sign-out.
  useEffect(() => {
    if (userId) void loadSubscription();
    else clearSubscription();
  }, [userId, loadSubscription, clearSubscription]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
