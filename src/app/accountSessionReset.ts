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
import { useCustomerPriceStore } from '@/stores/customerPriceStore';
import { useProductionSessionStore } from '@/features/production-workspace/productionSessionStore';
import { useMasterLabelStore } from '@/features/master-label/masterLabelStore';
import { useIngredientTableUxStore } from '@/features/ingredient-builder/ingredientTableUxStore';

export const ACCOUNT_OWNER_STORAGE_KEY = 'pinguino-active-account-owner';
export const ANONYMOUS_OWNER_MARKER = '__pinguino_anonymous__';

export interface AccountOwnerStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

let runtimeOwnerUserId: string | null | undefined;

/**
 * Boot-safe account isolation decision. An authenticated boot with no owner
 * marker is treated as unknown legacy ownership and cleared once. A dedicated
 * anonymous marker preserves only data explicitly known to come from an
 * anonymous session, including across a reload before first login.
 */
export function shouldClearAccountScopedState(input: {
  persistedOwnerMarker: string | null;
  nextUserId: string | null;
  runtimePreviousOwnerUserId?: string | null;
}): boolean {
  if (input.runtimePreviousOwnerUserId !== undefined) {
    return (
      typeof input.runtimePreviousOwnerUserId === 'string' &&
      input.runtimePreviousOwnerUserId !== input.nextUserId
    );
  }
  if (input.nextUserId === null) {
    return input.persistedOwnerMarker !== null &&
      input.persistedOwnerMarker !== ANONYMOUS_OWNER_MARKER;
  }
  if (input.persistedOwnerMarker === input.nextUserId) return false;
  if (input.persistedOwnerMarker === ANONYMOUS_OWNER_MARKER) return false;
  return true;
}

/**
 * Runtime boundary independent of browser storage. This is what guarantees a
 * logout/account switch still clears private memory when localStorage is
 * blocked or throws SecurityError.
 */
export function resolvedAccountBoundaryRequiresClear(
  storage: AccountOwnerStorage | null,
  nextUserId: string | null,
): boolean {
  const shouldClear = shouldClearAccountScopedState({
    persistedOwnerMarker: readPersistedAccountOwner(storage),
    nextUserId,
    runtimePreviousOwnerUserId: runtimeOwnerUserId,
  });
  runtimeOwnerUserId = nextUserId;
  return shouldClear;
}

export function resetRuntimeAccountOwnerForTests(): void {
  runtimeOwnerUserId = undefined;
}

export function readPersistedAccountOwner(storage: AccountOwnerStorage | null): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(ACCOUNT_OWNER_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writePersistedAccountOwner(
  storage: AccountOwnerStorage | null,
  ownerUserId: string | null,
): void {
  if (!storage) return;
  try {
    storage.setItem(ACCOUNT_OWNER_STORAGE_KEY, ownerUserId ?? ANONYMOUS_OWNER_MARKER);
  } catch {
    // Storage can be disabled. The render gate still performs the conservative
    // in-memory reset before any private surface is shown.
  }
}

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
  useCustomerPriceStore.getState().clear();
  useProductionSessionStore.getState().clear();
  useMasterLabelStore.getState().clear();
  useIngredientTableUxStore.getState().reset();
}
