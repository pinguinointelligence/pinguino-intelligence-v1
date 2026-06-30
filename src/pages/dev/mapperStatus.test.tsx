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
import { explainPiVerified, filterStatusRows } from './mapperStatusFilters';

const render = (el: ReactElement) => renderToStaticMarkup(<MemoryRouter>{el}</MemoryRouter>);
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');
const btnDisabled = (html: string, label: string) =>
  new RegExp(`<button[^>]*\\sdisabled[^>]*>[^<]*${label}`).test(html);

const row = (over: Partial<StatusRow> = {}): StatusRow => ({
  code: 'PR-ING-000010', id: 'p1', product_name: 'Nata', mapper_status: 'matched',
  current_status: 'draft', recommended_status: 'pi_generated', customer_label: 'PI Generated',
  engine_readiness: 'reference_linked', red_flag_codes: [], blockers: ['PI Verified needs independent data'],
  studio_eligible: true,
  ...over,
});
const base = {
  rows: [] as StatusRow[], loading: false, loaded: false, busyId: null as string | null,
  message: null as string | null, errorMessage: null as string | null, reasons: {} as Record<string, string>,
  onLoad: () => {}, onReasonChange: () => {}, onApply: () => {}, onManualAdjust: () => {}, onVerify: () => {},
};

afterEach(() => vi.clearAllMocks());

describe('MapperStatusView', () => {
  it('shows current→recommended, readiness, and Apply + Manual + Verify actions', () => {
    const html = render(<MapperStatusView {...base} rows={[row()]} loaded />);
    const t = text(html);
    expect(t).toMatch(/status\s+draft\s+→\s+recommended\s+pi_generated/);
    expect(t).toMatch(/reference-linked/i);
    expect(t).toContain('Apply pi_generated');
    expect(t).toContain('Manual adjust');
    expect(t).toContain('Verify (PI Verified)');
  });

  it('a red-flagged row blocks Verify and disables Apply until a reason is entered', () => {
    const flagged = row({ red_flag_codes: ['sweetener_or_polyol'] });
    const noReason = render(<MapperStatusView {...base} rows={[flagged]} loaded />);
    expect(text(noReason)).toMatch(/PI Verified blocked/i);
    expect(btnDisabled(noReason, 'Apply')).toBe(true);
    expect(btnDisabled(noReason, 'Verify')).toBe(true);
    // a reason enables Apply, but Verify stays blocked because of the red flag
    const withReason = render(<MapperStatusView {...base} rows={[flagged]} reasons={{ p1: 'owner override' }} loaded />);
    expect(btnDisabled(withReason, 'Apply')).toBe(false);
    expect(btnDisabled(withReason, 'Verify')).toBe(true);
  });

  it('a clean row with a reason enables Verify', () => {
    const html = render(<MapperStatusView {...base} rows={[row()]} reasons={{ p1: 'producer technical sheet' }} loaded />);
    expect(btnDisabled(html, 'Verify')).toBe(false);
  });

  it('an up-to-date product shows no Apply button (Manual/Verify remain)', () => {
    const t = text(render(<MapperStatusView {...base} rows={[row({ current_status: 'pi_generated' })]} loaded />));
    expect(t).toContain('status up to date');
    expect(t).not.toMatch(/Apply pi_generated/);
  });

  it('the warning states Verify is blocked for red-flagged products', () => {
    expect(text(render(<MapperStatusView {...base} />))).toMatch(/blocked for any red-flagged product/i);
  });

  it('shows a Studio-eligibility badge per row and an eligible count', () => {
    const t = text(render(
      <MapperStatusView {...base} rows={[row(), row({ id: 'p2', code: 'PR-ING-000011', studio_eligible: false })]} loaded />,
    ));
    expect(t).toMatch(/Studio ✓/);
    expect(t).toMatch(/Studio ✗/);
    expect(t).toMatch(/1 \/ 2 Studio-eligible/);
  });
});

describe('PI Verified eligibility', () => {
  it('shows a per-row eligibility block with provenance + why-not reasons', () => {
    const t = text(render(<MapperStatusView {...base} rows={[row()]} loaded />));
    expect(t).toMatch(/PI Verified:/);
    expect(t).toMatch(/Reference-linked only/);
    expect(t).toMatch(/needs a written reviewer reason/);
    expect(t).toMatch(/explicit reviewer sign-off/);
  });

  it('a reference-linked clean row is gated on a reason, not hard-blocked', () => {
    const e = explainPiVerified(row());
    expect(e.blocked).toBe(false);
    expect(e.needs_reason).toBe(true);
    expect(e.provenance).toMatch(/Reference-linked only/);
  });

  it('red flags hard-block PI Verified (a reason cannot override)', () => {
    const e = explainPiVerified(row({ red_flag_codes: ['sweetener_or_polyol'] }));
    expect(e.blocked).toBe(true);
    expect(e.reasons.join(' ')).toMatch(/Red flags must be cleared/);
  });

  it('no resolvable engine values hard-block PI Verified', () => {
    const e = explainPiVerified(row({ engine_readiness: 'unresolved' }));
    expect(e.blocked).toBe(true);
    expect(e.provenance).toMatch(/No engine values resolved/);
  });

  it('an already PI Verified row disables Verify and shows the verified state', () => {
    const html = render(<MapperStatusView {...base} rows={[row({ current_status: 'pi_verified', recommended_status: 'pi_verified' })]} reasons={{ p1: 'x' }} loaded />);
    expect(text(html)).toMatch(/already PI Verified/);
    expect(btnDisabled(html, 'Verify')).toBe(true);
  });
});

describe('filterStatusRows', () => {
  const rows = [
    row({ id: 'a', studio_eligible: true, red_flag_codes: [] }),
    row({ id: 'b', studio_eligible: false, engine_readiness: 'unresolved' }),
    row({ id: 'c', studio_eligible: false, red_flag_codes: ['sweetener_or_polyol'] }),
  ];
  it('filters by Studio eligibility, red flags, and missing reference', () => {
    expect(filterStatusRows(rows, 'all')).toHaveLength(3);
    expect(filterStatusRows(rows, 'studio_eligible').map((r) => r.id)).toEqual(['a']);
    expect(filterStatusRows(rows, 'not_eligible').map((r) => r.id)).toEqual(['b', 'c']);
    expect(filterStatusRows(rows, 'red_flagged').map((r) => r.id)).toEqual(['c']);
    expect(filterStatusRows(rows, 'missing_reference').map((r) => r.id)).toEqual(['b']);
  });
});

describe('MapperStatusPage — container', () => {
  it('renders but reads/writes nothing on mount (no auto-run)', () => {
    expect(text(render(<MapperStatusPage />))).toContain('Load products');
    expect(h.listMyProducts).not.toHaveBeenCalled();
    expect(h.setStatus).not.toHaveBeenCalled();
  });
});
