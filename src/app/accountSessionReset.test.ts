/**
 * Cross-account isolation (owner P0): a real account switch/logout must wipe the
 * PREVIOUS account's private client state so it can never render for the next
 * account — but an anonymous visitor's draft must survive their first login.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import { INITIAL_INTAKE } from '@/features/pi-chat/conversation';
import { useRecipeStore } from '@/stores/recipeStore';
import { useIntakeStore } from '@/stores/intakeStore';
import { useCustomerPriceStore } from '@/stores/customerPriceStore';
import { useProductionSessionStore } from '@/features/production-workspace/productionSessionStore';
import { createProductionSession } from '@/features/production-workspace/productionSession';
import { useMasterLabelStore } from '@/features/master-label/masterLabelStore';
import { useIngredientTableUxStore } from '@/features/ingredient-builder/ingredientTableUxStore';
import {
  ANONYMOUS_OWNER_MARKER,
  clearAccountScopedClientState,
  isAccountBoundaryChange,
  resetRuntimeAccountOwnerForTests,
  resolvedAccountBoundaryRequiresClear,
  shouldClearAccountScopedState,
} from './accountSessionReset';

describe('boot-safe persisted owner gate', () => {
  beforeEach(() => resetRuntimeAccountOwnerForTests());
  it('keeps only the same owner or a known anonymous draft', () => {
    expect(
      shouldClearAccountScopedState({
        persistedOwnerMarker: 'user-a',
        nextUserId: 'user-a',
      }),
    ).toBe(false);
    expect(
      shouldClearAccountScopedState({
        persistedOwnerMarker: ANONYMOUS_OWNER_MARKER,
        nextUserId: 'user-a',
      }),
    ).toBe(false);
  });

  it('clears account switches, logout boots, and unknown-owner authenticated boots', () => {
    for (const input of [
      {
        persistedOwnerMarker: 'user-a',
        nextUserId: 'user-b',
      },
      {
        persistedOwnerMarker: 'user-a',
        nextUserId: null,
      },
      {
        persistedOwnerMarker: null,
        nextUserId: 'user-a',
      },
    ]) {
      expect(shouldClearAccountScopedState(input)).toBe(true);
    }
  });

  it('clears logout/account switch even when browser storage is unavailable', () => {
    expect(resolvedAccountBoundaryRequiresClear(null, 'user-a')).toBe(true);
    expect(resolvedAccountBoundaryRequiresClear(null, null)).toBe(true);
    expect(resolvedAccountBoundaryRequiresClear(null, 'user-b')).toBe(false);
    expect(resolvedAccountBoundaryRequiresClear(null, 'user-c')).toBe(true);
  });
});

describe('isAccountBoundaryChange — fires only on a real account boundary', () => {
  it('does NOT fire on first mount or anon→login (anonymous draft is preserved)', () => {
    expect(isAccountBoundaryChange(undefined, null)).toBe(false); // first run, anon
    expect(isAccountBoundaryChange(undefined, 'user-a')).toBe(false); // first run, already authed
    expect(isAccountBoundaryChange(null, 'user-a')).toBe(false); // anon → login: keep the draft
    expect(isAccountBoundaryChange(null, null)).toBe(false);
  });

  it('DOES fire on logout and on a direct account switch', () => {
    expect(isAccountBoundaryChange('user-a', null)).toBe(true); // logout
    expect(isAccountBoundaryChange('user-a', 'user-b')).toBe(true); // switch A → B
  });

  it('does not fire when the same signed-in user repeats', () => {
    expect(isAccountBoundaryChange('user-a', 'user-a')).toBe(false);
  });
});

describe('clearAccountScopedClientState — wipes the previous account private state', () => {
  it('clears the query cache (saved recipes / products), the recipe draft, and intake', () => {
    const qc = new QueryClient();
    qc.setQueryData(['saved-recipes'], [{ id: 'other-users-recipe' }]);
    qc.setQueryData(['my-products'], [{ id: 'other-users-product' }]);
    useRecipeStore.setState({ activePresetId: null });
    useIntakeStore.setState({ flavorIdea: 'leaked pistachio idea' });
    useCustomerPriceStore.setState({
      activeOwnerUserId: 'owner-a',
      status: 'ready',
      overridesByCanonicalId: {
        'PI-ING-000236': {
          overrideId: 'private-price',
          ownerUserId: 'owner-a',
          canonicalIngredientId: 'PI-ING-000236',
          pricePerKg: 1.12,
          currency: 'EUR',
          createdBy: 'owner-a',
          createdAt: '2026-08-09T00:00:00.000Z',
          updatedAt: '2026-08-09T00:00:00.000Z',
        },
      },
    });
    useProductionSessionStore.setState({
      session: createProductionSession({
        sessionId: 'private-run',
        ownerUserId: 'owner-a',
        source: {
          recipeId: null,
          recipeVersionId: null,
          recipeVersionNumber: null,
          recipeName: 'Private run',
        },
        plannedInput: {
          items: DEFAULT_PRESET.items,
          mode: DEFAULT_PRESET.mode,
          category: DEFAULT_PRESET.category,
          target_temperature_c: DEFAULT_PRESET.target_temperature_c,
          target_batch_grams: DEFAULT_PRESET.target_batch_grams,
          machine_capacity_grams: null,
        },
        startedAt: '2026-08-09T00:00:00.000Z',
      }),
    });
    useMasterLabelStore.setState({ label: null });
    useIngredientTableUxStore.getState().markRequiredRemoved('private-line', 'Secret ingredient');

    clearAccountScopedClientState(qc);

    expect(qc.getQueryData(['saved-recipes'])).toBeUndefined();
    expect(qc.getQueryData(['my-products'])).toBeUndefined();
    expect(useRecipeStore.getState().activePresetId).toBe(DEFAULT_PRESET.id);
    expect(useIntakeStore.getState().flavorIdea).toBe(INITIAL_INTAKE.flavorIdea);
    expect(useCustomerPriceStore.getState().activeOwnerUserId).toBeNull();
    expect(useCustomerPriceStore.getState().overridesByCanonicalId).toEqual({});
    expect(useProductionSessionStore.getState().session).toBeNull();
    expect(useMasterLabelStore.getState().label).toBeNull();
    expect(useIngredientTableUxStore.getState().unresolvedRequiredByLineId).toEqual({});
  });
});
