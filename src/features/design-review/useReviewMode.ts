/**
 * useReviewMode — the runtime hook for the staging-only owner/QA design-review mode.
 * Thin wrapper: EXISTING persona resolution + the pure `isReviewModeEnabled` resolver.
 */
import { useProCorePersona } from '@/features/pro-core/useProCorePersona';
import { isReviewModeEnabled } from './reviewMode';

export function useReviewMode(): boolean {
  const persona = useProCorePersona();
  return isReviewModeEnabled({
    isDev: import.meta.env.DEV,
    envFlag: import.meta.env.VITE_DESIGN_REVIEW as string | undefined,
    persona,
  });
}
