/**
 * Catalogue-unavailable note pins — AUDIT #2 (P0) + SPEC §18.5/§3.2, owner
 * decision (Slice C): the note shown when no approved catalogue backend is
 * connected must be honest CUSTOMER Polish (no internal environment jargon)
 * and must name the real ways forward (the sheet actions that actually exist),
 * so the picker state is never a wordless dead end.
 */
import { describe, expect, it } from 'vitest';
import { RESOLUTION_ACTIONS } from '@/features/ingredient-resolution';
import { CATALOGUE_UNAVAILABLE, SAMPLE_SOURCE } from './inMemoryCatalog';

describe('CATALOGUE_UNAVAILABLE (honest customer note, AUDIT #2)', () => {
  it('is the unavailable kind', () => {
    expect(CATALOGUE_UNAVAILABLE.kind).toBe('unavailable');
  });

  it('leaks no internal wording', () => {
    for (const jargon of ['bezpiecznego środowiska', 'konfiguracji', 'backend', 'Mapper']) {
      expect(CATALOGUE_UNAVAILABLE.note).not.toContain(jargon);
    }
  });

  it('names real ways forward — actions that exist verbatim on the resolution sheet', () => {
    const labels = RESOLUTION_ACTIONS.map((a) => a.label);
    for (const named of ['Skanuj etykietę', 'Dodaj produkt ręcznie']) {
      expect(CATALOGUE_UNAVAILABLE.note).toContain(named);
      expect(labels).toContain(named);
    }
  });

  it('promises nothing it cannot keep (no availability dates, no "wkrótce")', () => {
    expect(CATALOGUE_UNAVAILABLE.note.toLowerCase()).not.toMatch(/wkrótce|niedługo|za \d/);
  });

  it('the sample source stays DEV-labelled and separate from the unavailable note', () => {
    expect(SAMPLE_SOURCE.kind).toBe('sample');
    expect(SAMPLE_SOURCE.note).toContain('DEV');
  });
});
