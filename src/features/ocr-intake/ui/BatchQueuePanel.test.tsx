/**
 * BatchQueuePanel — stable ordering, honest outcome chips, derived summary
 * math (never a stored counter), retry gating and the CSV-export slot.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { BatchIntake } from '../intakeContracts';
import { ocrCopy } from '../ocrCopy';
import { BatchQueuePanel } from './BatchQueuePanel';
import { summarizeBatch } from './intakeUiSupport';

const noop = () => undefined;

const batch: BatchIntake = {
  batchId: 'b-1',
  sessionIds: ['s-1', 's-2', 's-3', 's-4', 's-5'],
  outcomes: {
    's-1': 'saved',
    's-2': 'duplicate',
    's-3': 'needs_review',
    's-4': 'failed',
    // s-5 missing on purpose → pending by default
  },
};

const render = (b: BatchIntake, onExportCsv: (() => void) | null = null) =>
  renderToStaticMarkup(
    <BatchQueuePanel batch={b} onRetryFailed={noop} onExportCsv={onExportCsv} />,
  );
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');

describe('summarizeBatch — derived math', () => {
  it('counts every outcome and treats a missing outcome as pending', () => {
    expect(summarizeBatch(batch)).toEqual({
      processed: 4,
      saved: 1,
      duplicate: 1,
      needsReview: 1,
      failed: 1,
      pending: 1,
    });
  });

  it('processed = saved + duplicate + needsReview + failed (pending excluded)', () => {
    const s = summarizeBatch(batch);
    expect(s.processed).toBe(s.saved + s.duplicate + s.needsReview + s.failed);
    expect(s.processed + s.pending).toBe(batch.sessionIds.length);
  });

  it('an empty batch is all zeros — no invented counts', () => {
    expect(summarizeBatch({ batchId: 'b', sessionIds: [], outcomes: {} })).toEqual({
      processed: 0,
      saved: 0,
      duplicate: 0,
      needsReview: 0,
      failed: 0,
      pending: 0,
    });
  });

  it('only listed sessions count — stray outcome keys are ignored', () => {
    const s = summarizeBatch({
      batchId: 'b',
      sessionIds: ['a'],
      outcomes: { a: 'saved', ghost: 'failed' },
    });
    expect(s).toEqual({ processed: 1, saved: 1, duplicate: 0, needsReview: 0, failed: 0, pending: 0 });
  });
});

describe('BatchQueuePanel — rendering', () => {
  it('renders the queue in STABLE sessionIds order with positions', () => {
    const t = text(render(batch));
    expect(t.indexOf('1.')).toBeLessThan(t.indexOf('2.'));
    expect(t.indexOf('s-1')).toBeLessThan(t.indexOf('s-2'));
    expect(t.indexOf('s-4')).toBeLessThan(t.indexOf('s-5'));
  });

  it('renders one honest outcome chip per item, including the defaulted pending', () => {
    const t = text(render(batch));
    for (const label of Object.values(ocrCopy.batch.outcomes)) expect(t).toContain(label);
  });

  it('announces the derived summary line as a status region with exact numbers', () => {
    const html = render(batch);
    expect(html).toContain('role="status"');
    const t = text(html);
    expect(t).toContain(`${ocrCopy.batch.summaryLabels.processed} 4`);
    expect(t).toContain(`${ocrCopy.batch.summaryLabels.saved} 1`);
    expect(t).toContain(`${ocrCopy.batch.summaryLabels.needsReview} 1`);
    expect(t).toContain(`${ocrCopy.batch.summaryLabels.pending} 1`);
  });

  it('retry-failed is enabled only when something failed', () => {
    const withFailure = render(batch);
    expect(withFailure).not.toMatch(
      new RegExp(`aria-label="${ocrCopy.batch.retryFailed}"[^>]*disabled=""`),
    );
    const clean = render({ ...batch, outcomes: { 's-1': 'saved' } });
    expect(clean).toMatch(new RegExp(`aria-label="${ocrCopy.batch.retryFailed}"[^>]*disabled=""`));
  });

  it('the CSV-export slot is honestly disabled until the export function is wired', () => {
    const unwired = render(batch, null);
    expect(unwired).toMatch(new RegExp(`aria-label="${ocrCopy.batch.exportCsv}"[^>]*disabled=""`));
    expect(text(unwired)).toContain(ocrCopy.batch.exportCsvPending);
    const wired = render(batch, noop);
    expect(wired).not.toMatch(new RegExp(`aria-label="${ocrCopy.batch.exportCsv}"[^>]*disabled=""`));
    expect(text(wired)).not.toContain(ocrCopy.batch.exportCsvPending);
  });

  it('renders the empty state as a status region', () => {
    const html = render({ batchId: 'b', sessionIds: [], outcomes: {} });
    expect(text(html)).toContain(ocrCopy.batch.empty);
    expect(html).toContain('role="status"');
  });

  it('falls back to the session id when no label is provided', () => {
    expect(text(render(batch))).toContain(`${ocrCopy.batch.itemLabel} s-1`);
  });

  it('uses provided session labels when available', () => {
    const html = renderToStaticMarkup(
      <BatchQueuePanel
        batch={batch}
        sessionLabels={{ 's-1': 'Greek yogurt 4-pack' }}
        onRetryFailed={noop}
        onExportCsv={null}
      />,
    );
    expect(text(html)).toContain('Greek yogurt 4-pack');
  });

  it('action controls are real, labelled <button> elements', () => {
    const html = render(batch);
    expect((html.match(/<button type="button"/g) ?? []).length).toBe(2);
    expect(html).toContain(`aria-label="${ocrCopy.batch.retryFailed}"`);
    expect(html).toContain(`aria-label="${ocrCopy.batch.exportCsv}"`);
  });
});
