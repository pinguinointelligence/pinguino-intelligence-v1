import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { consumeOAuthRedirectError } from '@/services/authRedirect';
import { syncEffectiveAccess } from '@/services/accountAccess/liveEffectiveAccess';
import { useProCoreAccessStore } from '@/features/pro-core/proCoreAccessStore';
import { useAuthStore } from '@/stores/authStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import {
  clearAccountScopedClientState,
  resolvedAccountBoundaryRequiresClear,
  writePersistedAccountOwner,
  type AccountOwnerStorage,
} from './accountSessionReset';
import { listUserRecipeDefaults } from '@/services/userRecipeDefaults';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';

const queryClient = new QueryClient();

// Captured before any async auth URL processing. Ordinary/successful loads are null.
const bootOAuthError = consumeOAuthRedirectError();

function browserOwnerStorage(): AccountOwnerStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function ResolvedAccountProviders({
  children,
  identity,
  userId,
  userEmail,
}: {
  children: ReactNode;
  identity: string;
  userId: string | null;
  userEmail: string | null;
}) {
  const loadSubscription = useSubscriptionStore((state) => state.load);
  const clearSubscription = useSubscriptionStore((state) => state.clear);
  const setEffectiveAccess = useProCoreAccessStore((state) => state.setEffectiveAccess);

  // The component is keyed by resolved identity. Its initializer runs before
  // any child is produced, so a persisted A -> B or A -> anonymous transition
  // is cleared synchronously. StrictMode's repeated initializer is idempotent:
  // the first pass writes the new owner marker and the second sees a match.
  const [isolatedIdentity] = useState(() => {
    const storage = browserOwnerStorage();
    if (resolvedAccountBoundaryRequiresClear(storage, userId)) {
      clearAccountScopedClientState(queryClient);
    }
    writePersistedAccountOwner(storage, userId);
    return identity;
  });

  useEffect(() => {
    if (userId) void loadSubscription();
    else clearSubscription();
  }, [userId, loadSubscription, clearSubscription]);

  useEffect(() => {
    let cancelled = false;
    void syncEffectiveAccess(userId, userEmail).then((access) => {
      if (!cancelled) setEffectiveAccess(access);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, userEmail, setEffectiveAccess]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void listUserRecipeDefaults(userId).then((rows) => {
      if (cancelled) return;
      useRecipeProfileStore.getState().replaceDefaultsForOwner(
        userId,
        rows.map((row) => ({
          productContextKey: row.product_context_key,
          settings: row.settings,
        })),
      );
    }).catch(() => {
      // Defaults are convenience state. A transient read failure must not
      // block the recipe workspace or fabricate fallback settings.
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (isolatedIdentity !== identity) return null;
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

export function AppProviders({ children }: { children: ReactNode }) {
  const initAuth = useAuthStore((state) => state.init);
  const authStatus = useAuthStore((state) => state.status);
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const userEmail = useAuthStore((state) => state.user?.email ?? null);

  useEffect(() => {
    initAuth();
    if (bootOAuthError) {
      useAuthModalStore.getState().openWithNotice({
        kind: bootOAuthError.kind === 'cancelled' ? 'oauth-cancelled' : 'oauth-failed',
        detail: bootOAuthError.description,
      });
    }
  }, [initAuth]);

  if (authStatus === 'loading') return null;
  const resolvedUserId = authStatus === 'authed' ? userId : null;
  const identity = resolvedUserId ?? 'anonymous';
  return (
    <ResolvedAccountProviders
      key={identity}
      identity={identity}
      userId={resolvedUserId}
      userEmail={resolvedUserId ? userEmail : null}
    >
      {children}
    </ResolvedAccountProviders>
  );
}
