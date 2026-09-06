/**
 * GEL-P0-033 — Owner Decision: current Label workflow, 2026-09-06.
 *
 * This is additive to GEL-P0-032. The snapshot selector remains untouched; the
 * current recipe fallback now owns automatic LOT/date, actionable missing data,
 * final-product facts and the canonical settings round trip.
 */
import { describe, expect, it } from 'vitest';
import { readCode } from './sourceContract';

const draftModel = readCode('features', 'master-label', 'draftLabelPreview.ts');
const draftPersistence = readCode('features', 'master-label', 'labelDraftPersistence.ts');
const draftCard = readCode('features', 'master-label', 'DraftLabelCard.tsx');
const workspace = readCode('features', 'master-label', 'LabelWorkspace.tsx');
const nav = readCode('features', 'shell', 'appNav.ts');
const labelsPage = readCode('pages', 'destinations', 'GlobalDestinationPages.tsx');

describe('GEL-P0-033 — automatic facts and final-product authority', () => {
  it('uses the canonical Production LOT generator and current final product', () => {
    expect(draftPersistence).toContain('productionLotCodeForRun');
    expect(draftModel).toContain('calculateFinalProduct');
    expect(draftModel).toContain('recipeToppingsFromFrozenBehavior');
  });

  it('does not keep the retired ingredient-confirmation label gate', () => {
    expect(draftModel).not.toContain('confirmed_ingredients');
    expect(draftCard).not.toContain('Potwierdzone składniki z produkcji');
    expect(draftCard).not.toContain('Te dane powstają dopiero w Produkcji');
  });
});

describe('GEL-P0-033 — actionable data, settings and print', () => {
  it('keeps inline controls with a per-field check action', () => {
    expect(workspace).toContain('label-field-confirm-');
    expect(workspace).toContain('`${title} — zapisz`');
    expect(workspace).toContain("'label-field-change'");
  });

  it('renders the two bottom actions and gates print on real preflight only', () => {
    expect(draftCard).toContain('Drukuj finalną etykietę');
    expect(draftCard).toContain('ZMIEŃ');
    expect(draftCard).toContain('disabled={!draft.readyForPrint}');
  });

  it('restores the canonical menu entry and exact return route', () => {
    expect(nav).toContain("id: 'labels'");
    expect(nav).toContain("to: '/labels'");
    expect(labelsPage).toContain('labelSettingsReturn');
    expect(labelsPage).toContain('← Wróć');
  });

  it('offers production date in settings', () => {
    expect(workspace).toContain('data-testid="label-production-date-setting"');
    expect(workspace).toContain('value={draft.productionDate}');
  });
});
