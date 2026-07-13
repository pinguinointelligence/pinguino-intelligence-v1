import { describe, expect, it } from 'vitest';
import {
  FLAVOR_INTENSITY_OPTIONS,
  VERIFIED_FLAVOR_DOSE_PROFILES,
  customerRecipeStatusKind,
  getFlavorIntensity,
  resolveIntensityDose,
  setFlavorIntensity,
  type FlavorIntensityPreferences,
  type VerifiedFlavorDoseProfiles,
} from './flavorIntensity';

describe('flavor intensity — a preference only, never an invented dose', () => {
  it('offers exactly the three intensities in display order', () => {
    expect(FLAVOR_INTENSITY_OPTIONS).toEqual(['delicate', 'pronounced', 'strong']);
  });

  it('captures the chosen intensity as a preference (and is pure)', () => {
    const empty: FlavorIntensityPreferences = {};
    const next = setFlavorIntensity(empty, 'rum', 'strong');
    expect(getFlavorIntensity(next, 'rum')).toBe('strong');
    expect(getFlavorIntensity(next, 'vanilla')).toBeNull();
    // The original is untouched — no mutation.
    expect(empty).toEqual({});
    expect(next).not.toBe(empty);
  });

  it('NEVER converts an intensity into grams without a verified profile', () => {
    for (const intensity of FLAVOR_INTENSITY_OPTIONS) {
      const result = resolveIntensityDose('rum', intensity);
      expect(result.resolved).toBe(false);
      expect(result.grams).toBeUndefined();
    }
    // The default table is intentionally empty — no verified dose exists.
    expect(Object.keys(VERIFIED_FLAVOR_DOSE_PROFILES)).toHaveLength(0);
  });

  it('a null intensity never resolves a dose', () => {
    expect(resolveIntensityDose('rum', null)).toEqual({ resolved: false });
  });

  it('resolves grams ONLY from a supplied verified profile (exact tag + intensity)', () => {
    const profiles: VerifiedFlavorDoseProfiles = { rum: { strong: { grams: 18 } } };
    expect(resolveIntensityDose('rum', 'strong', profiles)).toEqual({ resolved: true, grams: 18 });
    expect(resolveIntensityDose('rum', 'delicate', profiles).resolved).toBe(false);
    expect(resolveIntensityDose('vanilla', 'strong', profiles).resolved).toBe(false);
  });

  it('ignores a non-positive or non-finite verified dose (still unresolved)', () => {
    const profiles = {
      rum: { strong: { grams: 0 } },
      whisky: { strong: { grams: Number.NaN } },
    } as VerifiedFlavorDoseProfiles;
    expect(resolveIntensityDose('rum', 'strong', profiles).resolved).toBe(false);
    expect(resolveIntensityDose('whisky', 'strong', profiles).resolved).toBe(false);
  });

  it('blocks a "fully calculated" claim while any line is unresolved', () => {
    expect(customerRecipeStatusKind(2)).toBe('needs_intensity');
    expect(customerRecipeStatusKind(1)).toBe('needs_intensity');
    expect(customerRecipeStatusKind(0)).toBe('fully_calculated');
  });
});
