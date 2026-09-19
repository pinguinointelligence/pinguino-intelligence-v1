/**
 * The saved printout is named after the batch, not after the application.
 *
 * Printing a label happens from an isolated iframe, and Chrome takes the suggested PDF
 * name from the TOP document's title — so every label an operator saved came out as the
 * application's own name. A shelf of printouts was a shelf of identical file names.
 *
 * The name answers the three questions a printed label is looked up by, in that order:
 * which LOT, which recipe, printed when.
 */
import { describe, expect, it } from 'vitest';
import { masterLabelPrintDocumentName } from './masterLabelPrint';
import type { MasterLabelData } from './masterLabel';

const label = (over: Partial<MasterLabelData> = {}) =>
  ({
    lotCode: 'LOT-20260919-B14E0C9B5A',
    productName: { pl: 'Banana · Fresh Fruit Gelato' },
    labelLanguages: ['pl'],
    ...over,
  }) as unknown as MasterLabelData;

const PRINTED_ON = new Date(2026, 8, 19, 15, 21);

describe('the printed label names its own file', () => {
  it('puts the LOT first, then the recipe, then the day it was printed', () => {
    expect(masterLabelPrintDocumentName(label(), PRINTED_ON)).toBe(
      'LOT 20260919-B14E0C9B5A — Banana · Fresh Fruit Gelato — 2026-09-19',
    );
  });

  it('does not say LOT twice, whatever prefix the code carries', () => {
    for (const code of ['LOT-20260919-B14E0C9B5A', 'LOT: 20260919-B14E0C9B5A', '20260919-B14E0C9B5A']) {
      expect(masterLabelPrintDocumentName(label({ lotCode: code }), PRINTED_ON)).toContain(
        'LOT 20260919-B14E0C9B5A',
      );
      expect(masterLabelPrintDocumentName(label({ lotCode: code }), PRINTED_ON)).not.toContain(
        'LOT LOT',
      );
    }
  });

  it('is still a filename when the recipe is not', () => {
    const name = masterLabelPrintDocumentName(
      label({ productName: { pl: 'Sorbet 50/50 "Lato": mocny * test?' } }),
      PRINTED_ON,
    );
    // The characters filesystems refuse, and the double spaces removing them would leave.
    expect(name).not.toMatch(/[/\\:*?"<>|]/);
    expect(name).not.toMatch(/ {2}/);
    expect(name).toContain('LOT 20260919-B14E0C9B5A');
    expect(name).toContain('2026-09-19');
  });

  it('uses the print day, not the production date frozen on the label', () => {
    expect(masterLabelPrintDocumentName(label(), new Date(2027, 0, 2))).toContain('2027-01-02');
  });

  it('still names the file when the recipe has no name yet', () => {
    const name = masterLabelPrintDocumentName(label({ productName: { pl: '  ' } }), PRINTED_ON);
    expect(name).toBe('LOT 20260919-B14E0C9B5A — 2026-09-19');
  });
});
