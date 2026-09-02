/**
 * ONE saved-recipe calendar (owner v1.4).
 *
 * The reproducer: `QA Protein v2 -12C` was saved exactly once, at 2026-08-22T23:29:59.494922Z, and
 * has exactly one immutable version. „Moje receptury" printed ZAKTUALIZOWANO 23.08.2026 (local day
 * in Europe/Warsaw) while the „Wersje" tab printed „22.08.2026 · v1" (UTC ISO slice) — which read
 * as a save that produced no version. Both surfaces now share this formatter, so the same instant
 * can never render as two dates again.
 */
import { describe, expect, it } from 'vitest';
import { formatSavedRecipeDate } from './savedRecipeDate';
import { formatVersionDate } from '@/features/pro-core/RecipeVersionsSection';

const QA_PROTEIN_V2_SAVED_AT = '2026-08-22T23:29:59.494922+00:00';

describe('formatSavedRecipeDate', () => {
  it('gives the library and the Wersje tab the SAME date for the same instant', () => {
    expect(formatVersionDate(QA_PROTEIN_V2_SAVED_AT)).toBe(
      formatSavedRecipeDate(QA_PROTEIN_V2_SAVED_AT),
    );
  });

  it('agrees with the viewer local calendar the library already used', () => {
    expect(formatSavedRecipeDate(QA_PROTEIN_V2_SAVED_AT)).toBe(
      new Date(QA_PROTEIN_V2_SAVED_AT).toLocaleDateString('pl-PL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }),
    );
  });

  it('renders DD.MM.YYYY with padding', () => {
    const iso = '2026-01-05T12:00:00.000Z';
    expect(formatSavedRecipeDate(iso)).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
  });

  it('never throws on absent or malformed input', () => {
    expect(formatSavedRecipeDate(null)).toBe('—');
    expect(formatSavedRecipeDate(undefined)).toBe('—');
    expect(formatSavedRecipeDate('')).toBe('—');
    expect(formatSavedRecipeDate('nonsense-value')).toBe('nonsense-v');
  });
});
