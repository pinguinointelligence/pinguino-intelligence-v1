/**
 * Account-boundary client-state reset (owner P0 — cross-account isolation).
 *
 * The machine preference is already scoped by user id (userScopedMachineKey), and
 * effectiveAccess + the subscription cache are cleared on sign-out. But several
 * OTHER account-specific client surfaces persist unscoped and would otherwise leak
 * one account's PRIVATE data to the next account on the same browser:
 *   - the react-query cache (`saved-recipes`, `my-products`) — another user's rows;
 *   - the persisted recipe draft (recipeStore) — a Pro user's working recipe;
 *   - the intake conversation inputs (intakeStore).
 *
 * This module resets those the moment a REAL signed-in user logs out or is switched.
 * The decision is deliberately narrow so it never wipes an ANONYMOUS visitor's draft
 * on their first login (that carry-over is intentional; only cross-ACCOUNT leakage is
 * the bug).
 */
import type { QueryClient } from '@tanstack/react-query';
import { useRecipeStore } from '@/stores/recipeStore';
import { useIntakeStore } from '@/stores/intakeStore';

/**
 * True only when a REAL signed-in user id changed to a different value (logout →
 * null, or a direct account switch A → B). False on the first run (prev
 * undefined) and on anon → login (prev null), so an anonymous draft is preserved.
 */
export function isAccountBoundaryChange(
  prev: string | null | undefined,
  next: string | null,
): boolean {
  return typeof prev === 'string' && prev !== next;
}

/**
 * Clear the private, account-scoped client state that is NOT already scoped by
 * user id or cleared elsewhere. Call this on an account boundary change.
 */
export function clearAccountScopedClientState(queryClient: QueryClient): void {
  // Drop every cached query (saved-recipes / my-products are globally keyed).
  queryClient.clear();
  // Reset the persisted private recipe draft + intake conversation to defaults.
  useRecipeStore.getState().resetToDemo();
  useIntakeStore.getState().reset();
}
