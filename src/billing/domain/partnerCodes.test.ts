/**
 * Module 6 tests — partnerCodes.
 * Pins PC1 (deterministic normalization), PC2 (5–16 length), PC3 (banned
 * words), PC4 (case-insensitive), PC6 (readable suggestions, numeric suffix
 * only on collision).
 */

import { describe, expect, it } from 'vitest';
import {
  OFFENSIVE_CODE_WORDS,
  PARTNER_CODE_MAX_LENGTH,
  PARTNER_CODE_MIN_LENGTH,
  PROTECTED_CODE_WORDS,
  normalizePartnerCode,
  partnerCodesEqual,
  suggestPartnerCode,
  validatePartnerCode,
} from './partnerCodes';

describe('PC1: normalizePartnerCode', () => {
  it('trims and uppercases', () => {
    expect(normalizePartnerCode('  ninjamaria  ')).toBe('NINJAMARIA');
  });

  it('strips accents deterministically (é→E, ñ→N, ü→U)', () => {
    expect(normalizePartnerCode('José')).toBe('JOSE');
    expect(normalizePartnerCode('Muñoz')).toBe('MUNOZ');
    expect(normalizePartnerCode('Müller')).toBe('MULLER');
  });

  it('strips inner spaces', () => {
    expect(normalizePartnerCode('ninja maria')).toBe('NINJAMARIA');
    expect(normalizePartnerCode('ninja\tmaria studio')).toBe('NINJAMARIASTUDIO');
  });

  it('is deterministic and idempotent', () => {
    const once = normalizePartnerCode(' Ninjá María ');
    expect(once).toBe('NINJAMARIA');
    expect(normalizePartnerCode(once)).toBe(once);
  });
});

describe('PC2/PC4: validatePartnerCode', () => {
  it('accepts a clean code and returns the canonical form', () => {
    expect(validatePartnerCode('NinjaMaria')).toEqual({ ok: true, code: 'NINJAMARIA' });
  });

  it('PC4: validation is case-insensitive', () => {
    expect(validatePartnerCode('ninjamaria')).toEqual(validatePartnerCode('NINJAMARIA'));
    expect(partnerCodesEqual('ninjamaria', 'NINJAMARIA')).toBe(true);
    expect(partnerCodesEqual('ninja maria', 'NINJAMARIA')).toBe(true);
    expect(partnerCodesEqual('ninjamaria', 'NINJAMARIA2')).toBe(false);
  });

  it('digits are allowed', () => {
    expect(validatePartnerCode('MARIA2026')).toEqual({ ok: true, code: 'MARIA2026' });
  });

  it('PC2: length boundaries — 4 too short, 5 and 16 OK, 17 too long', () => {
    expect(PARTNER_CODE_MIN_LENGTH).toBe(5);
    expect(PARTNER_CODE_MAX_LENGTH).toBe(16);
    expect(validatePartnerCode('ABCD')).toEqual({ ok: false, reason: 'too_short' });
    expect(validatePartnerCode('ABCDE')).toEqual({ ok: true, code: 'ABCDE' });
    expect(validatePartnerCode('A'.repeat(16))).toEqual({ ok: true, code: 'A'.repeat(16) });
    expect(validatePartnerCode('A'.repeat(17))).toEqual({ ok: false, reason: 'too_long' });
  });

  it('empty / whitespace-only input refuses with empty', () => {
    expect(validatePartnerCode('')).toEqual({ ok: false, reason: 'empty' });
    expect(validatePartnerCode('   ')).toEqual({ ok: false, reason: 'empty' });
  });

  it('PC1: non-alphanumeric characters refuse (hyphen, underscore, symbols)', () => {
    expect(validatePartnerCode('NINJA-MARIA')).toEqual({ ok: false, reason: 'invalid_characters' });
    expect(validatePartnerCode('NINJA_MARIA')).toEqual({ ok: false, reason: 'invalid_characters' });
    expect(validatePartnerCode('NINJA.MARIA')).toEqual({ ok: false, reason: 'invalid_characters' });
    expect(validatePartnerCode('MARIA#GREEN')).toEqual({ ok: false, reason: 'invalid_characters' });
    expect(validatePartnerCode('MARIA€GREEN')).toEqual({ ok: false, reason: 'invalid_characters' });
  });

  it('PC3: protected system words are rejected (whole code or contained)', () => {
    expect(PROTECTED_CODE_WORDS).toContain('ADMIN');
    expect(PROTECTED_CODE_WORDS).toContain('PINGUINO');
    expect(PROTECTED_CODE_WORDS).toContain('STRIPE');
    expect(validatePartnerCode('ADMIN')).toEqual({ ok: false, reason: 'banned_word' });
    expect(validatePartnerCode('ADMIN2026')).toEqual({ ok: false, reason: 'banned_word' });
    expect(validatePartnerCode('PINGUINOVIP')).toEqual({ ok: false, reason: 'banned_word' });
    expect(validatePartnerCode('TEAMSTRIPE')).toEqual({ ok: false, reason: 'banned_word' });
  });

  it('PC3/PC4: banned matching happens on the NORMALIZED code (case/accents)', () => {
    expect(validatePartnerCode('admin')).toEqual({ ok: false, reason: 'banned_word' });
    expect(validatePartnerCode('pingüino')).toEqual({ ok: false, reason: 'banned_word' });
  });

  it('PC3: offensive words are rejected', () => {
    expect(OFFENSIVE_CODE_WORDS.length).toBeGreaterThan(0);
    const sample = OFFENSIVE_CODE_WORDS[0] as string;
    expect(validatePartnerCode(`${sample}YEAH`)).toEqual({ ok: false, reason: 'banned_word' });
  });

  it('PC3: banned list is overridable (custom list)', () => {
    expect(validatePartnerCode('HELLO1', { bannedWords: ['HELLO'] })).toEqual({
      ok: false,
      reason: 'banned_word',
    });
    expect(validatePartnerCode('ADMIN99', { bannedWords: [] })).toEqual({ ok: true, code: 'ADMIN99' });
  });

  it('results are immutable', () => {
    expect(Object.isFrozen(validatePartnerCode('NINJAMARIA'))).toBe(true);
    expect(Object.isFrozen(validatePartnerCode(''))).toBe(true);
  });
});

describe('PC6: suggestPartnerCode', () => {
  const NONE = new Set<string>();

  it('builds a readable code from a public name', () => {
    expect(suggestPartnerCode(['Ninja María!'], NONE)).toEqual({ ok: true, code: 'NINJAMARIA' });
  });

  it('no suffix when there is no collision', () => {
    expect(suggestPartnerCode(['NinjaMaria'], new Set(['OTHERCODE']))).toEqual({
      ok: true,
      code: 'NINJAMARIA',
    });
  });

  it('numeric suffix ONLY on collision: NINJAMARIA → NINJAMARIA2 → NINJAMARIA3', () => {
    expect(suggestPartnerCode(['NinjaMaria'], new Set(['NINJAMARIA']))).toEqual({
      ok: true,
      code: 'NINJAMARIA2',
    });
    expect(suggestPartnerCode(['NinjaMaria'], new Set(['NINJAMARIA', 'NINJAMARIA2']))).toEqual({
      ok: true,
      code: 'NINJAMARIA3',
    });
  });

  it('long names are truncated to the 16-char maximum', () => {
    const result = suggestPartnerCode(['Chocolate Atelier Barcelona'], NONE);
    expect(result).toEqual({ ok: true, code: 'CHOCOLATEATELIER' });
  });

  it('suffix truncates the base so base+suffix still fits 16 chars', () => {
    const base = 'CHOCOLATEATELIER'; // exactly 16
    const result = suggestPartnerCode(['Chocolate Atelier Barcelona'], new Set([base]));
    expect(result).toEqual({ ok: true, code: 'CHOCOLATEATELIE2' });
  });

  it('falls through to the next source when the first is unusable', () => {
    expect(suggestPartnerCode(['AB', 'Ninja Maria'], NONE)).toEqual({ ok: true, code: 'NINJAMARIA' });
    expect(suggestPartnerCode(['ADMIN', 'Ninja Maria'], NONE)).toEqual({ ok: true, code: 'NINJAMARIA' });
    expect(suggestPartnerCode(['!!!', 'Ninja Maria'], NONE)).toEqual({ ok: true, code: 'NINJAMARIA' });
  });

  it('refuses when no source yields a usable base', () => {
    expect(suggestPartnerCode(['AB', '!!'], NONE)).toEqual({ ok: false, reason: 'no_usable_source' });
    expect(suggestPartnerCode([], NONE)).toEqual({ ok: false, reason: 'no_usable_source' });
  });

  it('deterministic: same inputs → same suggestion', () => {
    const taken = new Set(['NINJAMARIA']);
    expect(suggestPartnerCode(['NinjaMaria'], taken)).toEqual(suggestPartnerCode(['NinjaMaria'], taken));
  });
});
