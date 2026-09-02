/**
 * Package normalization + honest completeness (owner v1.4).
 *
 * The owner screenshot showed „Opakowanie: PESO NETO 250 g" — the raw OCR label rendered as the
 * value — for staging session 4c969b3f, whose stored result is
 * `{ unit: 'g', netQuantity: 250, netQuantityText: 'PESO NETO 250 g' }`. Provenance must survive,
 * but the value is `250 g`.
 */
import { describe, expect, it } from 'vitest';
import {
  packageDisplay,
  productCompletionFields,
  productCompletionPayload,
  productCompletionReady,
  scanCompletenessLabel,
  scanBlockerExplanation,
} from './resultPresentation';

const pkg = (
  netQuantity: number | null,
  unit: 'g' | 'kg' | 'ml' | 'l' | null,
  netQuantityText: string | null,
) => ({ netQuantity, unit, netQuantityText });

describe('packageDisplay — the Cacao Puro case', () => {
  it('shows the normalized quantity and keeps the label text as evidence', () => {
    expect(packageDisplay(pkg(250, 'g', 'PESO NETO 250 g'))).toEqual({
      value: '250 g',
      evidence: 'PESO NETO 250 g',
    });
  });

  it('never renders the raw label as the value when a structured quantity exists', () => {
    for (const raw of ['PESO NETO 250 g', 'Net wt. 250g ℮', 'zawartość netto: 250 g']) {
      expect(packageDisplay(pkg(250, 'g', raw)).value).toBe('250 g');
    }
  });

  it('does not repeat the label when it already equals the normalized value', () => {
    expect(packageDisplay(pkg(175, 'g', '175 g'))).toEqual({ value: '175 g', evidence: null });
  });

  it('falls back to the label only when nothing structured was detected', () => {
    expect(packageDisplay(pkg(null, null, 'PESO NETO 250 g'))).toEqual({
      value: 'PESO NETO 250 g',
      evidence: null,
    });
    expect(packageDisplay(pkg(null, null, null))).toEqual({ value: 'Brak danych', evidence: null });
  });

  it('formats non-integer quantities without float noise', () => {
    expect(packageDisplay(pkg(1.5, 'l', '1,5 L')).value).toBe('1.5 l');
  });
});

describe('PM missing-data completion', () => {
  it('asks only for package-readable missing facts, never Engine internals', () => {
    const fields = productCompletionFields([
      'nutrition_fat',
      'nutrition_protein',
      'ingredientsText',
      'high_risk_dosage_authority',
    ]);
    expect(fields.map((field) => field.label)).toEqual(['Tłuszcz', 'Białko', 'Skład produktu']);
    expect(fields.map((field) => field.label).join(' ')).not.toMatch(/POD|PAC|Mapper|technical/i);
  });

  it('accepts decimal commas and emits explicit user-confirmed product facts', () => {
    const fields = productCompletionFields(['nutrition_fat', 'allergen_confirmation']);
    const values = { fat: '12,5', allergensText: 'mleko, soja' };
    expect(productCompletionReady(fields, values)).toBe(true);
    expect(productCompletionPayload(values)).toMatchObject({
      nutrition: { fat: 12.5 },
      allergensText: 'mleko, soja',
    });
  });

  it('keeps missing allergen evidence distinct from a no-allergens claim', () => {
    const fields = productCompletionFields(['allergen_confirmation']);
    expect(productCompletionReady(fields, {}, false)).toBe(false);
    expect(productCompletionReady(fields, {}, true)).toBe(true);
    expect(productCompletionPayload({}).allergensText).toBeNull();
  });
});

describe('scanCompletenessLabel — partial is never dressed up as complete', () => {
  it('reports a complete analysis', () => {
    expect(scanCompletenessLabel('USABLE_FOR_OWNER', [])).toBe('Analiza kompletna');
  });

  it('reports an allergen confirmation as a confirmation, not a failure', () => {
    expect(scanCompletenessLabel('SCAN_DRAFT', ['allergen_confirmation'])).toBe(
      'Wymaga potwierdzenia',
    );
  });

  it('reports a genuinely incomplete analysis', () => {
    expect(scanCompletenessLabel('SCAN_DRAFT', ['nutrition_protein', 'ingredientsText'])).toBe(
      'Analiza niepełna',
    );
  });

  it('never prints the internal overlay enum at the user', () => {
    const states = [
      'SCAN_DRAFT',
      'USABLE_FOR_OWNER',
      'PENDING_PUBLICATION',
      'PUBLISHED',
      'BLOCKED',
    ] as const;
    for (const state of states) {
      const label = scanCompletenessLabel(state, []);
      expect(label).not.toBe(state);
      expect(label).not.toMatch(/[A-Z]{2,}_[A-Z]/);
    }
  });
});

describe('a finished scan says WHY it is still not saveable', () => {
  it('explains a high-risk additive instead of asking for another photograph', () => {
    const explanation = scanBlockerExplanation(['high_risk_dosage_authority']);
    expect(explanation).toContain('autoryzacja dawki');
    expect(explanation).toContain('kolejne zdjęcie tego nie rozstrzygnie');
  });

  it('explains a source disagreement as a decision, not a missing picture', () => {
    expect(scanBlockerExplanation(['conflict_nutrition.salt'])).toContain('różnią się');
  });

  it('says nothing when the only open item is the allergen confirmation the UI already asks', () => {
    expect(scanBlockerExplanation(['allergen_confirmation'])).toBeNull();
    expect(scanBlockerExplanation([])).toBeNull();
  });
});
