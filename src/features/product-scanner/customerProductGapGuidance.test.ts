import { describe, expect, it } from 'vitest';
import { customerProductGapGuidance } from './customerProductGapGuidance';

describe('customer product gap guidance', () => {
  it('does not ask a normal customer for internal water or solids fields', () => {
    const guidance = customerProductGapGuidance([
      'water_percent',
      'total_solids_percent',
      'MISSING_WATER_PERCENT',
      'MISSING_TOTAL_SOLIDS_PERCENT',
    ]);

    expect(guidance.question).toBeNull();
    expect(guidance.requiresPhoto).toBe(false);
    expect(guidance.explanation).not.toMatch(/water_percent|total_solids_percent/i);
    expect(guidance.explanation).toContain('nie jest gotowy do receptury');
  });

  it('asks one short package question for customer-knowable nutrition evidence', () => {
    const guidance = customerProductGapGuidance([
      'MISSING_PROTEIN_PERCENT',
      'MISSING_SALT_PERCENT',
    ]);

    expect(guidance.question).toBe(
      'Czy możesz sprawdzić pełną tabelę wartości odżywczych na opakowaniu?',
    );
    expect(guidance.requiresPhoto).toBe(true);
    expect(guidance.question).not.toMatch(/protein_percent|salt_percent/i);
  });

  it('asks one identity question when the exact barcode is the active blocker', () => {
    const guidance = customerProductGapGuidance([
      'MISSING_EAN',
      'MISSING_INGREDIENTS',
    ]);

    expect(guidance).toEqual({
      question: 'Czy możesz pokazać wyraźnie kod kreskowy produktu?',
      explanation: 'Kod pozwala bezpiecznie rozpoznać dokładnie ten produkt i uniknąć duplikatu.',
      requiresPhoto: true,
    });
  });

  it('keeps technical products fail-closed while asking only for realistic authority', () => {
    const guidance = customerProductGapGuidance(['DOSAGE_AUTHORITY_REQUIRED']);

    expect(guidance.question).toContain('dozowanie albo sposób użycia');
    expect(guidance.requiresPhoto).toBe(true);
    expect(guidance.explanation).toContain('produktu technicznego');
  });

  it('does not expose unknown server reason codes', () => {
    const guidance = customerProductGapGuidance(['INTERNAL_UNRECOGNIZED_GATE_X']);

    expect(guidance.question).toBeNull();
    expect(guidance.requiresPhoto).toBe(false);
    expect(guidance.explanation).not.toContain('INTERNAL_UNRECOGNIZED_GATE_X');
  });

  it('never requests another photo for optional package metadata or its conflict', () => {
    const guidance = customerProductGapGuidance([
      'MATERIAL_CONFLICT:package.netQuantityText',
      'MISSING_MANUFACTURER',
      'MISSING_COUNTRY',
    ]);

    expect(guidance).toMatchObject({ question: null, requiresPhoto: false });
  });
});
