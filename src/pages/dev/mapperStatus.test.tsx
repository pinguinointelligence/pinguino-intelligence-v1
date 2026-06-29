import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  listMyProducts: vi.fn(() => Promise.resolve([])),
  listEngineApprovedIngredients: vi.fn(() => Promise.resolve([])),
  setStatus: vi.fn(),
}));
vi.mock('@/services/products', () => ({ listMyProducts: h.listMyProducts }));
vi.mock('@/services/ingredients', () => ({ listEngineApprovedIngredients: h.listEngineApprovedIngredients }));
vi.mock('@/services/productStatusWrite', () => ({ setProductLifecycleStatus: h.setStatus }));

import { MapperStatusView, type StatusRow } from './mapperStatusView';
import { MapperStatusPage } from './MapperStatusPage';

const render = (el: ReactElement) => renderToStaticMarkup(<MemoryRouter>{el}</MemoryRouter>);
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');

const row = (over: Partial<StatusRow> = {}): StatusRow => ({
  code: 'PR-ING-000010', id: 'p1', product_name: 'Nata', mapper_status: 'matched',
  current_status: 'draft', recommended_status: 'pi_generated', customer_label: 'PI Generated',
  engine_readiness: 'reference_linked', red_flag_codes: [], blockers: ['PI Verified needs independent data'],
  ...over,
});
const base = {
  rows: [] as StatusRow[], loading: false, loaded: false, busyId: null as string | null,
  message: null as string | null, errorMessage: null as string | null, reasons: {} as Record<string, string>,
  onLoad: () => {}, onReasonChange: () => {}, onApply: () => {},
};

afterEach(() => vi.clearAllMocks());

describe('MapperStatusView', () => {
  it('shows current→recommended, engine readiness, and an Apply button', () => {
    const t = text(render(<MapperStatusView {...base} rows={[row()]} loaded />));
    expect(t).toContain('PR-ING-000010');
    expect(t).toMatch(/status\s+draft\s+→\s+recommended\s+pi_generated/);
    expect(t).toMatch(/reference-linked/i);
    expect(t).toContain('Apply pi_generated');
  });

  // true when the rendered Apply button carries the disabled attribute
  const applyDisabled = (html: string) => /<button[^>]*\sdisabled[^>]*>[^<]*Apply/.test(html);

  it('a red-flagged row disables Apply until a reason is entered', () => {
    const flagged = row({ red_flag_codes: ['sweetener_or_polyol'] });
    const noReason = render(<MapperStatusView {...base} rows={[flagged]} loaded />);
    expect(noReason).toMatch(/reason required/i); // placeholder attribute in raw HTML
    expect(applyDisabled(noReason)).toBe(true);
    const withReason = render(<MapperStatusView {...base} rows={[flagged]} reasons={{ p1: 'owner override' }} loaded />);
    expect(applyDisabled(withReason)).toBe(false);
  });

  it('an up-to-date product shows no Apply button', () => {
    const t = text(render(<MapperStatusView {...base} rows={[row({ current_status: 'pi_generated' })]} loaded />));
    expect(t).toContain('status up to date');
    expect(t).not.toMatch(/Apply pi_generated/); // the per-row Apply button is absent (warning copy aside)
  });

  it('the warning states PI Verified is never set here', () => {
    expect(text(render(<MapperStatusView {...base} />))).toMatch(/PI Verified is never set here/i);
  });
});

describe('MapperStatusPage — container', () => {
  it('renders but reads/writes nothing on mount (no auto-run)', () => {
    expect(text(render(<MapperStatusPage />))).toContain('Load products');
    expect(h.listMyProducts).not.toHaveBeenCalled();
    expect(h.setStatus).not.toHaveBeenCalled();
  });
});
