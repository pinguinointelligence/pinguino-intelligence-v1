import { describe, expect, it } from 'vitest';
import {
  FALLBACK_LOCALE,
  REFERENCE_LOCALE,
  SUPPORTED_LOCALES,
  isSupportedLocale,
  resolveDisplayLabel,
  resolveLocaleResource,
  type AppLocale,
} from './locale';

describe('presentation-layer locale registry', () => {
  it('Polish is the reference and the fallback locale', () => {
    expect(REFERENCE_LOCALE).toBe('pl');
    expect(FALLBACK_LOCALE).toBe('pl');
    expect(SUPPORTED_LOCALES).toContain('pl');
  });

  it('recognises only supported locales', () => {
    expect(isSupportedLocale('pl')).toBe(true);
    expect(isSupportedLocale('en')).toBe(false);
    expect(isSupportedLocale(null)).toBe(false);
  });

  it('resolves a locale resource and falls back to Polish', () => {
    const resources = { pl: 'polski' } as const;
    expect(resolveLocaleResource(resources)).toBe('polski');
    expect(resolveLocaleResource(resources, 'pl')).toBe('polski');
    // an unknown locale degrades to the reference locale, never to undefined
    expect(resolveLocaleResource(resources, 'xx' as AppLocale)).toBe('polski');
  });

  it('throws only when even the fallback resource is absent', () => {
    expect(() => resolveLocaleResource({} as Record<AppLocale, string>)).toThrow(
      /Locale resource is missing/,
    );
  });

  it('keeps the RAW CONTRACT VALUE as the display-map key', () => {
    const maps = { pl: { APPROVED: 'Zatwierdzone', USER_CANCELED: 'Anulowane przez użytkownika' } };
    expect(resolveDisplayLabel(maps, 'APPROVED')).toBe('Zatwierdzone');
    expect(resolveDisplayLabel(maps, 'USER_CANCELED')).toBe('Anulowane przez użytkownika');
    // the key itself is never rewritten by the presentation layer
    expect(Object.keys(maps.pl)).toEqual(['APPROVED', 'USER_CANCELED']);
  });

  it('returns the raw value when a code has no wording yet', () => {
    const maps = { pl: { APPROVED: 'Zatwierdzone' } };
    expect(resolveDisplayLabel(maps, 'FUTURE_STATUS')).toBe('FUTURE_STATUS');
    expect(resolveDisplayLabel(maps, 'FUTURE_STATUS', 'pl', 'Nieznany status')).toBe(
      'Nieznany status',
    );
  });
});
