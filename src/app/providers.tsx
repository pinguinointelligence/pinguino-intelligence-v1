import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { useAuthStore } from '@/stores/authStore';

const queryClient = new QueryClient();

export function AppProviders({ children }: { children: ReactNode }) {
  const initAuth = useAuthStore((state) => state.init);

  // Restore any persisted session once on mount (no-op when auth is unavailable).
  useEffect(() => {
    initAuth();
  }, [initAuth]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
