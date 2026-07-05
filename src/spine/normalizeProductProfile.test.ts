import { describe, expect, it } from 'vitest';
import {
  PRODUCT_PROFILE_ALIASES,
  UNSUPPORTED_PRODUCT_PROFILES_V1,
  normalizeProductProfile,
} from './normalizeProductProfile';

describe('normalizeProductProfile — locked alias map', () => {
  const CASES = [
    ['gelato', 'standard_gelato'],
    ['milk_gelato', 'standard_gelato'],
    ['fruit_gelato', 'standard_gelato'],
    ['nut_gelato', 'standard_gelato'],
    ['alcohol_gelato', 'standard_gelato'],
    ['standard_gelato', 'standard_gelato'],
    ['sorbet', 'sorbet'],
    ['vegan', 'vegan_gelato'],
    ['vegan_gelato', 'vegan_gelato'],
    ['chocolate', 'chocolate_gelato'],
    ['chocolate_gelato', 'chocolate_gelato'],
  ] as const;

  it.each(CASES)('%s -> %s', (input, expected) => {
    const result = normalizeProductProfile(input);
    expect(result.status).toBe('ok');
    expect(result.profile).toBe(expected);
  });

  it('the exported alias map matches the locked table exactly', () => {
    expect(Object.entries(PRODUCT_PROFILE_ALIASES).sort()).toEqual(
      CASES.map(([from, to]) => [from, to]).sort(),
    );
  });

  it('is mechanical about case, spacing and hyphens — no flavor guessing', () => {
    expect(normalizeProductProfile('Gelato').profile).toBe('standard_gelato');
    expect(normalizeProductProfile('  MILK GELATO  ').profile).toBe('standard_gelato');
    expect(normalizeProductProfile('milk-gelato').profile).toBe('standard_gelato');
  });

  it('marks legacy aliases with an info warning; canonical ids stay warning-free', () => {
    const legacy = normalizeProductProfile('gelato');
    expect(legacy.warnings).toHaveLength(1);
    expect(legacy.warnings[0]).toMatchObject({
      code: 'legacy_profile_normalized',
      severity: 'info',
    });

    expect(normalizeProductProfile('standard_gelato').warnings).toEqual([]);
    expect(normalizeProductProfile('sorbet').warnings).toEqual([]);
  });
});

describe('normalizeProductProfile — unsupported v1.0 inputs never silently map', () => {
  it('granita returns a structured unsupported result with its dedicated warning', () => {
    const result = normalizeProductProfile('granita');
    expect(result.status).toBe('unsupported_product_profile');
    expect(result.profile).toBeNull();
    expect(result.warnings[0]).toMatchObject({
      code: 'granita_unsupported_v1',
      severity: 'warning',
    });
  });

  it.each(['protein', 'protein_gelato', 'fresh', 'storage_minus18', 'frozen_drinks', 'slush'])(
    '%s returns unsupported with a warning',
    (input) => {
      const result = normalizeProductProfile(input);
      expect(result.status).toBe('unsupported_product_profile');
      expect(result.profile).toBeNull();
      expect(result.warnings[0]).toMatchObject({
        code: 'unsupported_product_profile',
        severity: 'warning',
      });
    },
  );

  it('every entry in the unsupported list stays outside the alias map', () => {
    for (const unsupported of UNSUPPORTED_PRODUCT_PROFILES_V1) {
      expect(PRODUCT_PROFILE_ALIASES[unsupported]).toBeUndefined();
      expect(normalizeProductProfile(unsupported).profile).toBeNull();
    }
  });

  it('unknown inputs are unsupported, never guessed', () => {
    for (const input of ['mystery_product', 'ice cream cake', '']) {
      const result = normalizeProductProfile(input);
      expect(result.status).toBe('unsupported_product_profile');
      expect(result.profile).toBeNull();
      expect(result.warnings.length).toBeGreaterThan(0);
    }
  });

  it('is pure and deterministic', () => {
    expect(normalizeProductProfile('vegan')).toEqual(normalizeProductProfile('vegan'));
    expect(normalizeProductProfile('granita')).toEqual(normalizeProductProfile('granita'));
  });
});
