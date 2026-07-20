/**
 * Cross-account isolation (owner P0): a real account switch/logout must wipe the
 * PREVIOUS account's private client state so it can never render for the next
 * account — but an anonymous visitor's draft must survive their first login.
 */
import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import { INITIAL_INTAKE } from '@/features/pi-chat/conversation';
import { useRecipeStore } from '@/stores/recipeStore';
import { useIntakeStore } from '@/stores/intakeStore';
import { clearAccountScopedClientState, isAccountBoundaryChange } from './accountSessionReset';

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

    clearAccountScopedClientState(qc);

    expect(qc.getQueryData(['saved-recipes'])).toBeUndefined();
    expect(qc.getQueryData(['my-products'])).toBeUndefined();
    expect(useRecipeStore.getState().activePresetId).toBe(DEFAULT_PRESET.id);
    expect(useIntakeStore.getState().flavorIdea).toBe(INITIAL_INTAKE.flavorIdea);
  });
});
