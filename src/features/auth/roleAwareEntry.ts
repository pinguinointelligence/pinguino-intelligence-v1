import type { EffectiveAccess } from '@/access/accountAccess/contracts';

export const ADMIN_OVERVIEW_PATH = '/admin/overview';

export type RoleAwareEntry = 'root' | 'start' | 'home';
type AuthStatus = 'loading' | 'authed' | 'anon';

/** Pure role priority for the three ordinary app entrypoints. */
export function roleAwareEntryDestination(input: {
  entry: RoleAwareEntry;
  authStatus: AuthStatus;
  effectiveAccess: EffectiveAccess | null;
}): string | null {
  if (input.authStatus !== 'authed' || input.effectiveAccess === null) return null;
  if (input.effectiveAccess.canAdmin) return ADMIN_OVERVIEW_PATH;
  if (input.effectiveAccess.canPro) return '/pro/recipe';
  if (input.effectiveAccess.canHome && input.entry !== 'home') return '/home';
  return null;
}
