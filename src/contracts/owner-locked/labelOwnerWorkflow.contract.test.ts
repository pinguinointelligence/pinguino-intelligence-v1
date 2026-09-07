/**
 * GEL-P0-033 — Owner Decision: current Label workflow, 2026-09-06.
 *
 * This is additive to GEL-P0-032. The snapshot selector remains untouched; the
 * current recipe fallback owns automatic LOT/date, final-product facts and the
 * canonical settings round trip. Missing editable print data is disclosed in
 * one non-blocking dialog for every renderer.
 */
import { describe, expect, it } from 'vitest';
import { readCode } from './sourceContract';

const draftModel = readCode('features', 'master-label', 'draftLabelPreview.ts');
const draftPersistence = readCode('features', 'master-label', 'labelDraftPersistence.ts');
const draftCard = readCode('features', 'master-label', 'DraftLabelCard.tsx');
const workspace = readCode('features', 'master-label', 'LabelWorkspace.tsx');
const allergenControl = readCode('features', 'master-label', 'AllergenStatementControl.tsx');
const printDialog = readCode('features', 'master-label', 'PrintMissingDataDialog.tsx');
const printMissingData = readCode('features', 'master-label', 'printMissingData.ts');
const masterLabel = readCode('features', 'master-label', 'masterLabel.ts');
const labelRepository = readCode('services', 'labels', 'labelRepository.ts');
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

  it('renders only the two bottom actions and never gates print on missing content', () => {
    expect(draftCard).toContain('Drukuj');
    expect(draftCard).toContain('Zmień');
    expect(draftCard).not.toContain('disabled={!draft.readyForPrint}');
    expect(workspace).toContain('data-testid="label-print"');
    expect(masterLabel).toContain('readyForSystemPrint: true');
  });

  it('uses one shared, partial-fill print dialog for every market', () => {
    expect(printDialog).toContain('Uzupełnij i pokaż podgląd');
    expect(printDialog).toContain('Drukuj bez uzupełniania');
    expect(printDialog).toContain('Wróć');
    expect(printDialog).toContain('Nieuzupełnione informacje nie pojawią się na etykiecie.');
    expect(printMissingData).toContain('export function printMissingFields');
    expect(printMissingData).not.toContain("label.market === 'WORLD'");
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

  it('keeps SOL-031 as one local, non-blocking final allergen statement', () => {
    expect(draftModel).not.toContain('allergenState');
    expect(allergenControl).toContain('Alergeny nieustalone');
    expect(allergenControl).toContain('Informacje o alergenach ustala producent żywności.');
    expect(allergenControl).toContain('Ustaw');
    expect(allergenControl).toContain('Zmień');
    expect(allergenControl).toContain('Wróć');
    expect(masterLabel).toContain("case 'allergens':\n      return ready('Alergeny')");
    expect(masterLabel).toContain('knownSourceAllergenStatements');
    expect(printMissingData).toContain('const knownAllergens = labelAllergenStatement(label)');
    expect(printMissingData).toContain('labelStatements: [value]');
  });

  it('keeps snapshot authority while allowing omitted editable fields', () => {
    expect(labelRepository).toContain('production_save_label_snapshot_v3');
    expect(labelRepository).not.toContain(
      "throw new Error('Przed zapisaniem etykiety potwierdź dane wymagane do druku')",
    );
  });
});
