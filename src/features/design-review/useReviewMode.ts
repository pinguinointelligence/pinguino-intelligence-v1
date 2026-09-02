/**
 * useReviewMode — the runtime hook for the staging-only owner/QA design-review mode.
 * Thin wrapper: EXISTING persona resolution + the pure `isReviewModeEnabled` resolver.
 */
import { useProCorePersona } from '@/features/pro-core/useProCorePersona';
import { useAuthStore } from '@/stores/authStore';
import { isReviewModeEnabled, ownerReviewStorageKey } from './reviewMode';

export function useReviewMode(): boolean {
  const persona = useProCorePersona();
  const ownerUserId = useAuthStore((state) => state.user?.id ?? null);
  let ownerOptIn = false;
  if (typeof window !== 'undefined') {
    try {
      const storageKey = ownerReviewStorageKey(ownerUserId);
      const requested = new URLSearchParams(window.location.search).get('owner-review') === '1';
      if (requested) window.sessionStorage.setItem(storageKey, '1');
      ownerOptIn = requested || window.sessionStorage.getItem(storageKey) === '1';
    } catch {
      ownerOptIn = false;
    }
  }
  return isReviewModeEnabled({
    isDev: import.meta.env.DEV,
    envFlag: import.meta.env.VITE_DESIGN_REVIEW as string | undefined,
    hostname: typeof window === 'undefined' ? undefined : window.location.hostname,
    persona,
    ownerOptIn,
  });
}
