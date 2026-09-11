/**
 * PRO MOBILE UX v2 · B6 — the ONE next step of the phone's bottom strip.
 *
 * configure → (Przelicz, owned by the strip's own recalculation authority) →
 * save → Monitor → Produkcja. Every input is an existing published fact.
 */
import { describe, expect, it } from 'vitest';
import { mobileNextStep, type MobileNextStepInput } from './mobileNextStep';

const base: MobileNextStepInput = {
  settingsConfirmed: true,
  saveRequired: false,
  savedAndClean: false,
  activeTab: 'profile',
};

describe('mobileNextStep', () => {
  it('asks for the settings first — Przelicz would refuse until they are confirmed', () => {
    expect(mobileNextStep({ ...base, settingsConfirmed: false })).toBe('settings');
    expect(mobileNextStep({ ...base, settingsConfirmed: false, saveRequired: true })).toBe(
      'settings',
    );
  });

  it('offers „Zapisz recepturę" exactly when the workbar says a save would succeed', () => {
    expect(mobileNextStep({ ...base, saveRequired: true })).toBe('save');
    expect(mobileNextStep({ ...base, saveRequired: true, savedAndClean: true })).toBe('save');
  });

  it('moves on to Monitor from a saved recipe, then to Produkcja from Monitor', () => {
    expect(mobileNextStep({ ...base, savedAndClean: true, activeTab: 'profile' })).toBe('monitor');
    expect(mobileNextStep({ ...base, savedAndClean: true, activeTab: 'monitor' })).toBe(
      'production',
    );
  });

  it('adds no second CTA where the screen already owns the action', () => {
    expect(mobileNextStep({ ...base, savedAndClean: true, activeTab: 'production' })).toBeNull();
    expect(mobileNextStep({ ...base, savedAndClean: true, activeTab: 'summary' })).toBeNull();
  });

  it('offers nothing it cannot back up: an unsaved recipe the workbar will not save yet', () => {
    expect(mobileNextStep({ ...base })).toBeNull();
    // Settings still loading (no copy mounted) is not "unconfirmed".
    expect(mobileNextStep({ ...base, settingsConfirmed: null })).toBeNull();
  });
});
