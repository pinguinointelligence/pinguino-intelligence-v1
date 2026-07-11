/**
 * EvidenceReviewPanel — renderToStaticMarkup proof that review renders the
 * contract ReviewedField[] honestly: provenance badges, SPLIT confidences,
 * source evidence, warnings, conflict resolution, and the no-invention rule
 * (absent/missing NEVER becomes 0).
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { FieldEvidence, IntakeFieldKey, ReviewedField } from '../intakeContracts';
import { ocrCopy } from '../ocrCopy';
import { EvidenceReviewPanel } from './EvidenceReviewPanel';
import { FIELD_GROUPS, resolveFieldDisplay } from './intakeUiSupport';

const noop = () => undefined;

const candidate = (over: Partial<FieldEvidence>): FieldEvidence => ({
  extractedRaw: 'RAW',
  normalized: 'normalized',
  evidence: { imageId: 'img-front', lineIndex: 2, sourceText: 'RAW TEXT' },
  extractionConfidence: 91,
  normalizationConfidence: 88,
  provenance: 'explicit',
  warnings: [],
  ...over,
});

const field = (fieldKey: IntakeFieldKey, over: Partial<ReviewedField>): ReviewedField => ({
  fieldKey,
  candidates: [candidate({})],
  chosenCandidate: null,
  editedValue: null,
  reviewStatus: 'needs_confirmation',
  ...over,
});

const render = (fields: ReviewedField[]) =>
  renderToStaticMarkup(
    <EvidenceReviewPanel
      fields={fields}
      onEdit={noop}
      onMarkUnknown={noop}
      onChooseCandidate={noop}
      onConfirm={noop}
    />,
  );

const text = (html: string) =>
  html.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&[a-z#0-9]+;/g, ' ');

describe('resolveFieldDisplay — the no-invention rule', () => {
  it('a manual edit wins over every candidate', () => {
    const f = field('product_name', { editedValue: 'Edited name', reviewStatus: 'edited' });
    expect(resolveFieldDisplay(f)).toEqual({ kind: 'value', value: 'Edited name', candidate: null });
  });

  it('the explicitly chosen candidate wins in a conflict', () => {
    const a = candidate({ normalized: '123' });
    const b = candidate({ normalized: '128' });
    const f = field('energy_kcal', { candidates: [a, b], chosenCandidate: 1 });
    expect(resolveFieldDisplay(f)).toEqual({ kind: 'value', value: '128', candidate: b });
  });

  it('a single candidate displays without an explicit choice', () => {
    const f = field('brand', {});
    const display = resolveFieldDisplay(f);
    expect(display.kind).toBe('value');
    if (display.kind === 'value') expect(display.value).toBe('normalized');
  });

  it('falls back to extractedRaw when normalization produced nothing', () => {
    const f = field('brand', { candidates: [candidate({ normalized: null })] });
    const display = resolveFieldDisplay(f);
    if (display.kind === 'value') expect(display.value).toBe('RAW');
    expect(display.kind).toBe('value');
  });

  it('absent provenance is MISSING — never a value, never 0', () => {
    const f = field('fibre', {
      candidates: [candidate({ extractedRaw: null, normalized: null, provenance: 'absent', evidence: null })],
    });
    expect(resolveFieldDisplay(f)).toEqual({ kind: 'missing' });
  });

  it('two unresolved candidates are a CONFLICT, not a silent pick', () => {
    const f = field('energy_kcal', {
      candidates: [candidate({ normalized: '123' }), candidate({ normalized: '128' })],
      reviewStatus: 'conflict_unresolved',
    });
    expect(resolveFieldDisplay(f)).toEqual({ kind: 'conflict' });
  });

  it('marked_unknown displays as unknown even when candidates exist', () => {
    const f = field('supplier', { reviewStatus: 'marked_unknown' });
    expect(resolveFieldDisplay(f)).toEqual({ kind: 'unknown' });
  });

  it('no candidates at all is missing', () => {
    expect(resolveFieldDisplay(field('country', { candidates: [] }))).toEqual({ kind: 'missing' });
  });
});

describe('field grouping', () => {
  it('the groups cover ALL 28 contract fields exactly once', () => {
    const grouped = FIELD_GROUPS.flatMap((g) => g.fields);
    expect(grouped.length).toBe(28);
    expect(new Set(grouped).size).toBe(28);
    expect([...grouped].sort()).toEqual(Object.keys(ocrCopy.evidence.fields).sort());
  });

  it('renders all four group headings', () => {
    const t = text(render([]));
    for (const heading of Object.values(ocrCopy.evidence.groups)) expect(t).toContain(heading);
  });

  it('renders the nutrition group as a TABLE', () => {
    const html = render([]);
    expect(html).toContain('<table');
    expect((html.match(/<table/g) ?? []).length).toBe(1);
  });
});

describe('honest rendering', () => {
  it('a field with NO evidence shows the missing indicator — and never a fabricated 0', () => {
    const html = render([]);
    const t = text(html);
    // all 28 contract fields render, every one missing
    expect((t.match(new RegExp(ocrCopy.evidence.missing.replace(/[()]/g, '\\$&'), 'g')) ?? []).length).toBe(28);
    expect(t).not.toMatch(/\b0\s*%/);
  });

  it('renders value + provenance badge + SPLIT confidences for an explicit candidate', () => {
    const t = text(render([field('product_name', {})]));
    expect(t).toContain('normalized');
    expect(t).toContain(ocrCopy.evidence.provenance.explicit);
    expect(t).toContain(`${ocrCopy.evidence.readConfidence} 91%`);
    expect(t).toContain(`${ocrCopy.evidence.normalizationConfidence} 88%`);
  });

  it('renders calculated and inferred provenance badges distinctly', () => {
    const t = text(
      render([
        field('sugars', { candidates: [candidate({ provenance: 'calculated' })] }),
        field('category', { candidates: [candidate({ provenance: 'inferred' })] }),
      ]),
    );
    expect(t).toContain(ocrCopy.evidence.provenance.calculated);
    expect(t).toContain(ocrCopy.evidence.provenance.inferred);
  });

  it('null confidences render as n/a — never as 0%', () => {
    const t = text(
      render([
        field('category', {
          candidates: [candidate({ extractionConfidence: null, normalizationConfidence: null })],
        }),
      ]),
    );
    expect(t).toContain(`${ocrCopy.evidence.readConfidence} ${ocrCopy.evidence.noConfidence}`);
    expect(t).not.toContain('0%');
  });

  it('shows the source evidence: image, line index and verbatim source text', () => {
    const t = text(render([field('product_name', {})]));
    expect(t).toContain(`${ocrCopy.evidence.source}: img-front`);
    expect(t).toContain(`${ocrCopy.evidence.line} 2`);
    expect(t).toContain('RAW TEXT');
  });

  it('renders candidate warnings verbatim', () => {
    const t = text(
      render([field('sodium', { candidates: [candidate({ warnings: ['never auto-converted to salt'] })] })]),
    );
    expect(t).toContain('never auto-converted to salt');
  });

  it('renders the review status chips honestly', () => {
    const t = text(
      render([
        field('brand', { reviewStatus: 'confirmed', chosenCandidate: 0 }),
        field('product_name', { reviewStatus: 'needs_confirmation' }),
      ]),
    );
    expect(t).toContain(ocrCopy.evidence.status.confirmed);
    expect(t).toContain(ocrCopy.evidence.status.needs_confirmation);
  });

  it('marked_unknown renders the unknown indicator instead of any candidate value', () => {
    const t = text(render([field('supplier', { reviewStatus: 'marked_unknown' })]));
    expect(t).toContain(ocrCopy.evidence.markedUnknown);
  });
});

describe('conflict UI', () => {
  const conflict = field('energy_kcal', {
    candidates: [candidate({ normalized: '123' }), candidate({ normalized: '128', extractionConfidence: 61 })],
    reviewStatus: 'conflict_unresolved',
  });

  it('lists every candidate with its own provenance + confidence and a choose button', () => {
    const html = render([conflict]);
    const t = text(html);
    expect(t).toContain(ocrCopy.evidence.conflictTitle);
    expect(t).toContain('123');
    expect(t).toContain('128');
    expect((html.match(new RegExp(`>${ocrCopy.evidence.useCandidate}</button>`, 'g')) ?? []).length).toBe(2);
  });

  it('marks the chosen candidate instead of offering its button again', () => {
    const chosen = { ...conflict, chosenCandidate: 0 as const };
    const html = render([chosen]);
    expect(text(html)).toContain(ocrCopy.evidence.chosen);
    expect((html.match(new RegExp(`>${ocrCopy.evidence.useCandidate}</button>`, 'g')) ?? []).length).toBe(1);
  });

  it('choose buttons carry per-candidate aria-labels', () => {
    const html = render([conflict]);
    expect(html).toContain(
      `aria-label="${ocrCopy.evidence.useCandidate}: ${ocrCopy.evidence.fields.energy_kcal} 1"`,
    );
    expect(html).toContain(
      `aria-label="${ocrCopy.evidence.useCandidate}: ${ocrCopy.evidence.fields.energy_kcal} 2"`,
    );
  });
});

describe('actions + accessibility', () => {
  it('every field carries a labelled edit input', () => {
    const html = render([field('product_name', {})]);
    expect(html).toContain(
      `aria-label="${ocrCopy.evidence.editAction}: ${ocrCopy.evidence.fields.product_name}"`,
    );
  });

  it('confirm and mark-unknown are labelled real buttons for a pending field', () => {
    const html = render([field('product_name', {})]);
    expect(html).toContain(
      `aria-label="${ocrCopy.evidence.confirmAction}: ${ocrCopy.evidence.fields.product_name}"`,
    );
    expect(html).toContain(
      `aria-label="${ocrCopy.evidence.markUnknownAction}: ${ocrCopy.evidence.fields.product_name}"`,
    );
  });

  it('a confirmed field offers no redundant confirm button', () => {
    const html = render([field('brand', { reviewStatus: 'confirmed', chosenCandidate: 0 })]);
    expect(html).not.toContain(
      `aria-label="${ocrCopy.evidence.confirmAction}: ${ocrCopy.evidence.fields.brand}"`,
    );
  });

  it('a marked-unknown field offers no redundant mark-unknown button', () => {
    const html = render([field('supplier', { reviewStatus: 'marked_unknown' })]);
    expect(html).not.toContain(
      `aria-label="${ocrCopy.evidence.markUnknownAction}: ${ocrCopy.evidence.fields.supplier}"`,
    );
  });
});
