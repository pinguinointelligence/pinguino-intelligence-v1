/**
 * Module 6 — partnerCodes: partner referral code normalization, validation
 * and suggestion generation.
 *
 * LOCKED RULES implemented here (cited as PC1..PC6 in code):
 *  PC1 Normalization: trim, strip accents (é→E), strip spaces, uppercase —
 *      deterministic; the result may contain ASCII letters+digits ONLY.
 *  PC2 Display length 5–16 characters (after normalization).
 *  PC3 Banned-word list rejected: protected system words (ADMIN, PINGUINO,
 *      STRIPE, …) plus a small offensive list. Matching is by containment on
 *      the normalized code (conservative: false positives are acceptable for
 *      a public code namespace — the suggestion generator simply produces a
 *      different code).
 *  PC4 Validation is case-insensitive (both 'ninjamaria' and 'NINJAMARIA'
 *      normalize to the same code).
 *  PC5 Codes are PUBLIC identifiers, never secrets — nothing here is
 *      security-sensitive material.
 *  PC6 Suggestion generator: readable code from channel/brand/public name
 *      (e.g. NINJAMARIA); numeric suffix ONLY on collision (NINJAMARIA2,
 *      NINJAMARIA3, …).
 *
 * Pure + deterministic: collision checks are against a caller-provided set.
 */

import { frozen } from './types';

export const PARTNER_CODE_MIN_LENGTH = 5 as const; // PC2
export const PARTNER_CODE_MAX_LENGTH = 16 as const; // PC2

/** PC3: protected system words — never allowed inside a partner code. */
export const PROTECTED_CODE_WORDS: readonly string[] = frozen([
  'ADMIN',
  'PINGUINO',
  'STRIPE',
  'SUPPORT',
  'STAFF',
  'OFFICIAL',
  'SYSTEM',
  'BILLING',
  'PAYOUT',
]);

/** PC3: small offensive list (normalized forms). */
export const OFFENSIVE_CODE_WORDS: readonly string[] = frozen([
  'FUCK',
  'SHIT',
  'CUNT',
  'NAZI',
  'RAPE',
  'PUTA',
  'MIERDA',
]);

const DEFAULT_BANNED_WORDS: readonly string[] = frozen([...PROTECTED_CODE_WORDS, ...OFFENSIVE_CODE_WORDS]);

export type PartnerCodeRefusalReason =
  | 'empty'
  | 'invalid_characters'
  | 'too_short'
  | 'too_long'
  | 'banned_word';

export type PartnerCodeValidation =
  | { readonly ok: true; readonly code: string }
  | { readonly ok: false; readonly reason: PartnerCodeRefusalReason };

/**
 * PC1: deterministic normalization — trim, Unicode-decompose and drop
 * combining marks (é→E, ü→U, ñ→N), strip ALL whitespace, uppercase.
 * Returns the normalized string WITHOUT validating length/charset (that is
 * validatePartnerCode's job), so error reporting can distinguish reasons.
 */
export function normalizePartnerCode(raw: string): string {
  return raw
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining accents (PC1)
    .replace(/\s+/g, '') // strip inner spaces (PC1)
    .toUpperCase();
}

/**
 * PC1–PC4: validate (case-insensitively, via normalization) and return the
 * canonical code or a typed refusal.
 */
export function validatePartnerCode(
  raw: string,
  options: { readonly bannedWords?: readonly string[] } = {},
): PartnerCodeValidation {
  const bannedWords = options.bannedWords ?? DEFAULT_BANNED_WORDS;
  const normalized = normalizePartnerCode(raw);
  if (normalized.length === 0) {
    return frozen({ ok: false as const, reason: 'empty' as const });
  }
  if (!/^[A-Z0-9]+$/.test(normalized)) {
    // PC1: after accent/space stripping, only ASCII letters+digits survive.
    return frozen({ ok: false as const, reason: 'invalid_characters' as const });
  }
  if (normalized.length < PARTNER_CODE_MIN_LENGTH) {
    return frozen({ ok: false as const, reason: 'too_short' as const });
  }
  if (normalized.length > PARTNER_CODE_MAX_LENGTH) {
    return frozen({ ok: false as const, reason: 'too_long' as const });
  }
  for (const banned of bannedWords) {
    if (normalized.includes(banned)) {
      return frozen({ ok: false as const, reason: 'banned_word' as const }); // PC3
    }
  }
  return frozen({ ok: true as const, code: normalized });
}

/** PC4: two raw inputs designate the same code iff they normalize identically. */
export function partnerCodesEqual(a: string, b: string): boolean {
  return normalizePartnerCode(a) === normalizePartnerCode(b);
}

export type SuggestionRefusalReason = 'no_usable_source' | 'namespace_exhausted';

export type PartnerCodeSuggestion =
  | { readonly ok: true; readonly code: string }
  | { readonly ok: false; readonly reason: SuggestionRefusalReason };

const MAX_SUFFIX_ATTEMPTS = 9999;

/**
 * PC6: suggest a readable partner code from candidate sources (channel name,
 * brand name, public name — in the order provided). The first source that
 * yields a valid base is used; a numeric suffix is appended ONLY on collision
 * with `existingCodes` (NINJAMARIA → NINJAMARIA2 → NINJAMARIA3 …), truncating
 * the base when needed so base+suffix still fits PC2's 16-char maximum.
 *
 * Pure: `existingCodes` must already contain normalized codes.
 */
export function suggestPartnerCode(
  sources: readonly string[],
  existingCodes: ReadonlySet<string>,
  options: { readonly bannedWords?: readonly string[] } = {},
): PartnerCodeSuggestion {
  for (const source of sources) {
    // Normalize then drop any residual non-alphanumerics (e.g. 'Ninja-María!'
    // → 'NINJAMARIA') so human names produce readable bases.
    const base = normalizePartnerCode(source)
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, PARTNER_CODE_MAX_LENGTH);
    const baseValidation = validatePartnerCode(base, options);
    if (!baseValidation.ok) continue; // try next source (too short / banned / empty)
    if (!existingCodes.has(baseValidation.code)) {
      return frozen({ ok: true as const, code: baseValidation.code });
    }
    // PC6: numeric suffix only on collision.
    for (let suffix = 2; suffix <= MAX_SUFFIX_ATTEMPTS; suffix += 1) {
      const suffixText = String(suffix);
      const truncatedBase = baseValidation.code.slice(0, PARTNER_CODE_MAX_LENGTH - suffixText.length);
      const candidate = `${truncatedBase}${suffixText}`;
      if (candidate.length < PARTNER_CODE_MIN_LENGTH) break;
      if (!existingCodes.has(candidate)) {
        return frozen({ ok: true as const, code: candidate });
      }
    }
    return frozen({ ok: false as const, reason: 'namespace_exhausted' as const });
  }
  return frozen({ ok: false as const, reason: 'no_usable_source' as const });
}
