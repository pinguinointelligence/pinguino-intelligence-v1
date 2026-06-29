import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  listMyProducts: vi.fn(() => Promise.resolve([])),
  listEngineApprovedIngredients: vi.fn(() => Promise.resolve([])),
  confirmProductMatchTo: vi.fn(),
  rejectProductMatch: vi.fn(),
}));
vi.mock('@/services/products', () => ({ listMyProducts: h.listMyProducts }));
vi.mock('@/services/ingredients', () => ({ listEngineApprovedIngredients: h.listEngineApprovedIngredients }));
vi.mock('@/services/productReview', () => ({
  confirmProductMatchTo: h.confirmProductMatchTo,
  rejectProductMatch: h.rejectProductMatch,
}));

import { MapperReviewView, type ReviewRow } from './mapperReviewView';
import { DEFAULT_REVIEW_FILTERS, filterReviewRows } from './mapperReviewFilters';
import { MapperReviewPage } from './MapperReviewPage';

const render = (el: ReactElement) => renderToStaticMarkup(<MemoryRouter>{el}</MemoryRouter>);
const visibleText = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');

const sampleRow = (over: Partial<ReviewRow> = {}): ReviewRow => ({
  code: 'PR-ING-000035', id: 'pid-35', product_name: 'Pistacho natural', product_category: 'nut_paste',
  mapper_status: 'needs_review', product_status: 'draft', recommended_status: 'draft',
  red_flag_codes: [], candidate_count: 2,
  product_fat: 45, product_carbohydrate: 28, product_sugars: 8, product_protein: 20, product_salt: 0.05,
  candidates: [
    { basement_id: 'PI-ING-000413', name: 'Delipaste Pure Pistachio', category: 'nut', subcategory: 'pistachio', fat: 44, carbohydrate: 30, sugars: 10, protein: 18, salt: 0.1, pac: 12, pod: 9, mean_pp: 1.2 },
    { basement_id: 'PI-ING-000444', name: 'Roasted Pistachio Pulp 100%', category: 'nut', subcategory: 'pistachio', fat: 47, carbohydrate: 26, sugars: 7, protein: 21, salt: 0, pac: 6, pod: 5, mean_pp: 1.36 },
  ],
  ...over,
});

const baseProps = {
  rows: [] as ReviewRow[], loading: false, loaded: false, busyId: null as string | null,
  message: null as string | null, errorMessage: null as string | null,
  filters: DEFAULT_REVIEW_FILTERS, onFilterChange: () => {}, onLoad: () => {}, onConfirm: () => {}, onReject: () => {},
};

afterEach(() => vi.clearAllMocks());

describe('filterReviewRows', () => {
  const rows = [
    sampleRow({ id: 'a', mapper_status: null, product_category: 'dairy', candidate_count: 1, red_flag_codes: [] }),
    sampleRow({ id: 'b', mapper_status: 'matched', product_category: 'dairy', candidate_count: 6, red_flag_codes: ['sweetener_or_polyol'] }),
    sampleRow({ id: 'c', mapper_status: null, product_category: 'nut_paste', candidate_count: 3, red_flag_codes: [] }),
  ];
  it('filters by mapper status, category, candidate bucket, and red-flagged', () => {
    expect(filterReviewRows(rows, { ...DEFAULT_REVIEW_FILTERS, mapperStatus: 'null' }).map((r) => r.id)).toEqual(['a', 'c']);
    expect(filterReviewRows(rows, { ...DEFAULT_REVIEW_FILTERS, category: 'nut_paste' }).map((r) => r.id)).toEqual(['c']);
    expect(filterReviewRows(rows, { ...DEFAULT_REVIEW_FILTERS, candidateBucket: '1' }).map((r) => r.id)).toEqual(['a']);
    expect(filterReviewRows(rows, { ...DEFAULT_REVIEW_FILTERS, candidateBucket: '6+' }).map((r) => r.id)).toEqual(['b']);
    expect(filterReviewRows(rows, { ...DEFAULT_REVIEW_FILTERS, redFlaggedOnly: true }).map((r) => r.id)).toEqual(['b']);
  });
});

describe('MapperReviewView — presentational', () => {
  it('shows the load button, filters, and the PAC/POD-not-copied warning', () => {
    const html = render(<MapperReviewView {...baseProps} />);
    const text = visibleText(html);
    expect(text).toContain('Load products');
    expect(text).toMatch(/PAC\/POD not copied/i);
    expect(html).toMatch(/aria-label="mapper status filter"/);
    expect(html).toMatch(/red-flagged only/i);
  });

  it('renders a row with status, recommendation, candidates + Confirm each + Reject', () => {
    const html = render(<MapperReviewView {...baseProps} rows={[sampleRow()]} loaded />);
    const text = visibleText(html);
    expect(text).toContain('PR-ING-000035');
    expect(text).toContain('PI-ING-000413');
    expect(text).toMatch(/recommended status/i);
    expect(text).toContain('Reject all');
    expect((html.match(/>Confirm</g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('shows red flags + disables actions on a resolved row', () => {
    const flagged = sampleRow({ mapper_status: 'matched', red_flag_codes: ['sweetener_or_polyol'] });
    const html = render(<MapperReviewView {...baseProps} rows={[flagged]} loaded />);
    expect(visibleText(html)).toMatch(/red flags: sweetener_or_polyol/);
    expect(html).toContain('disabled');
  });

  it('shows a missing-reference hint when a product has no composition candidate', () => {
    const none = sampleRow({ candidate_count: 0, candidates: [] });
    expect(visibleText(render(<MapperReviewView {...baseProps} rows={[none]} loaded />))).toMatch(/no composition candidate/i);
  });
});

describe('MapperReviewPage — container', () => {
  it('renders but loads / acts on nothing at mount (no auto-run)', () => {
    const html = render(<MapperReviewPage />);
    expect(visibleText(html)).toContain('Load products');
    expect(h.listMyProducts).not.toHaveBeenCalled();
    expect(h.confirmProductMatchTo).not.toHaveBeenCalled();
    expect(h.rejectProductMatch).not.toHaveBeenCalled();
  });
});
