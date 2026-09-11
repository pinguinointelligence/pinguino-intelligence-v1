/**
 * §37/§38 — the label screen is a PREVIEW, and the expiry date is asked for at
 * the moment it is needed.
 *
 * The owner's rule has two halves, and the second is the one that is easy to get
 * wrong: a missing best-before date must not stop someone from LOOKING at their
 * label, and pressing Drukuj must ask for it in a small window rather than
 * sending them into the full settings screen to find one field.
 *
 * Both halves already hold; this pins them so a later change to the print gate
 * cannot quietly reintroduce either failure.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createCompleteLabel } from './masterLabelTestFixture';
import { printMissingFields } from './printMissingData';
import { buildLabelPreflight } from './masterLabel';

const workspace = readFileSync('src/features/master-label/LabelWorkspace.tsx', 'utf8');

const withoutDate = () => {
  const label = createCompleteLabel('EU');
  return { ...label, dateMark: { ...label.dateMark, kind: 'unresolved' as const, date: null } };
};

describe('§38 — a missing expiry date never blocks the preview', () => {
  it('the label still builds and still renders without a date', () => {
    const preflight = buildLabelPreflight(withoutDate());
    expect(preflight).toBeTruthy();
    // The geometry verdict is about SIZE. It must not become a data verdict.
    expect(typeof preflight.geometry.fits).toBe('boolean');
  });

  it('the ONLY place the missing-data list gates anything is the print request', () => {
    const gate = workspace.slice(workspace.indexOf('const requestPrint'));
    const body = gate.slice(0, gate.indexOf('const onTouchStart'));
    expect(body).toContain('if (printMissingFields(label).length > 0)');
    expect(body).toContain('setPrintMissingOpen(true)');
    // One consult in the whole component, and it is inside requestPrint.
    expect((workspace.match(/printMissingFields\(/g) ?? []).length).toBe(1);
  });
});

describe('§38 — Drukuj asks for the date itself', () => {
  it('the date is one of the fields the small window collects', () => {
    const fields = printMissingFields(withoutDate());
    const date = fields.find((field) => field.id === 'date_mark');
    expect(date).toBeDefined();
    expect(date!.kind).toBe('date');
    expect(date!.label).toBe('Data trwałości');
  });

  it('a label that already has its date is not asked again', () => {
    const fields = printMissingFields(createCompleteLabel('EU'));
    expect(fields.some((field) => field.id === 'date_mark')).toBe(false);
  });

  it('the window prints from where it stands — it does not route to settings', () => {
    const dialog = readFileSync('src/features/master-label/PrintMissingDataDialog.tsx', 'utf8');
    expect(dialog).not.toMatch(/openView\('settings'\)|onOpenSettings/);
    const mount = workspace.slice(workspace.indexOf('<PrintMissingDataDialog'));
    expect(mount.slice(0, mount.indexOf('/>'))).toContain('finalizeAndPrint');
  });
});

describe('§37 — the main label screen offers a preview and two actions', () => {
  it('Drukuj and Zmień ustawienia, and no third administrative control beside them', () => {
    const actions = workspace.slice(workspace.indexOf('data-testid="label-print"'));
    const bar = actions.slice(0, actions.indexOf('data-testid="label-change"') + 40);
    expect(bar).toContain('Drukuj');
    expect(workspace).toContain('Zmień ustawienia');
    expect(workspace).toContain('data-testid="label-change"');
  });
});
