/**
 * §36 — Gellatti prints rectangular labels.
 *
 * The interesting half of this rule is what it must NOT do. A label already
 * saved as round is an immutable historical record; deleting the round
 * renderers would not remove the option, it would corrupt the archive. So the
 * CHOICE disappears from every customer surface, and the ability to draw what
 * was already chosen stays exactly where it is.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workspace = readFileSync('src/features/master-label/LabelWorkspace.tsx', 'utf8');
const pdf = readFileSync('src/features/master-label/masterLabelPdf.ts', 'utf8');
const print = readFileSync('src/features/master-label/masterLabelPrint.ts', 'utf8');
const geometry = readFileSync('src/features/master-label/labelGeometry.ts', 'utf8');

describe('§36 — no customer can choose a round label', () => {
  it('the basic picker no longer offers one', () => {
    // The two-button „Prostokątna / Okrągła" pair is gone with its round half.
    expect(workspace).not.toMatch(/>\s*Okrągła\s*</);
    expect(workspace).not.toContain('onClick={() => changeRound(sizes.current.round.diameterMm)}');
  });

  it('the settings select offers round ONLY to a label that already is one', () => {
    const select = workspace.slice(workspace.indexOf('data-testid="label-presentation-format"'));
    const options = select.slice(0, select.indexOf('</select>'));
    expect(options).toContain('<option value="rectangle">Prostokąt</option>');
    expect(options).toContain("format === 'round' ?");
    expect(options).toContain('Okrągła (archiwalna)');
  });
});

describe('§36 — an archived round label still renders', () => {
  it('the PDF renderer keeps its round branch', () => {
    expect(pdf).toContain("data.format === 'round'");
  });

  it('the print renderer keeps its round branch', () => {
    expect(print).toContain("data.format === 'round'");
  });

  it('the geometry authority still measures a round label', () => {
    expect(geometry).toContain("input.format === 'round'");
    expect(geometry).toContain("format: 'rectangle' | 'round'");
  });
});
