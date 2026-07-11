/**
 * DuplicatePanel — the verdict renders verbatim and ONLY the allowed actions
 * exist in the DOM (a forbidden action is absent, not merely disabled).
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { DuplicateAssessment } from '../intakeContracts';
import { ocrCopy } from '../ocrCopy';
import { DuplicatePanel } from './DuplicatePanel';

const noop = () => undefined;
const render = (assessment: DuplicateAssessment) =>
  renderToStaticMarkup(<DuplicatePanel assessment={assessment} onAction={noop} />);
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');

const exact: DuplicateAssessment = {
  verdict: 'exact_duplicate',
  reasons: [{ check: 'ean_match', existingProductId: 'P-000069' }],
  allowedActions: ['open_existing', 'update_existing_with_review'],
};

describe('DuplicatePanel', () => {
  it('renders the exact-duplicate verdict as a status region with its honest note', () => {
    const html = render(exact);
    expect(text(html)).toContain(ocrCopy.duplicate.verdicts.exact_duplicate);
    expect(text(html)).toContain(ocrCopy.duplicate.verdictNotes.exact_duplicate);
    expect(html).toContain('role="status"');
  });

  it('renders likely-duplicate and new-product verdicts', () => {
    const likely = text(render({ ...exact, verdict: 'likely_duplicate' }));
    expect(likely).toContain(ocrCopy.duplicate.verdicts.likely_duplicate);
    const fresh = text(render({ verdict: 'new_product', reasons: [], allowedActions: ['create_new'] }));
    expect(fresh).toContain(ocrCopy.duplicate.verdicts.new_product);
  });

  it('lists every fired reason with the existing product id', () => {
    const t = text(render(exact));
    expect(t).toContain(ocrCopy.duplicate.reasons.ean_match);
    expect(t).toContain('P-000069');
  });

  it('shows the score for a normalized-identity match', () => {
    const t = text(
      render({
        ...exact,
        reasons: [{ check: 'normalized_identity_match', existingProductId: 'P-000042', score: 87 }],
      }),
    );
    expect(t).toContain(ocrCopy.duplicate.reasons.normalized_identity_match);
    expect(t).toContain(`${ocrCopy.duplicate.score} 87`);
  });

  it('renders ONLY the allowed actions — create_new is ABSENT for an exact duplicate', () => {
    const html = render(exact);
    expect(html).toContain(`aria-label="${ocrCopy.duplicate.actions.open_existing}"`);
    expect(html).toContain(`aria-label="${ocrCopy.duplicate.actions.update_existing_with_review}"`);
    expect(html).not.toContain(ocrCopy.duplicate.actions.create_new);
  });

  it('renders only create_new for a new product (no phantom merge buttons)', () => {
    const html = render({ verdict: 'new_product', reasons: [], allowedActions: ['create_new'] });
    expect(html).toContain(`aria-label="${ocrCopy.duplicate.actions.create_new}"`);
    expect(html).not.toContain(ocrCopy.duplicate.actions.open_existing);
    expect(html).not.toContain(ocrCopy.duplicate.actions.update_existing_with_review);
  });

  it('renders all three actions when the verdict allows all three', () => {
    const html = render({
      ...exact,
      verdict: 'likely_duplicate',
      allowedActions: ['open_existing', 'update_existing_with_review', 'create_new'],
    });
    expect((html.match(/<button type="button"/g) ?? []).length).toBe(3);
  });

  it('action controls are real, labelled <button> elements', () => {
    const html = render(exact);
    expect((html.match(/<button type="button"/g) ?? []).length).toBe(2);
  });
});
