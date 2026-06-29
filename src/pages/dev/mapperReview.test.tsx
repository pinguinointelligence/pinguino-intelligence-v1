import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** Mock every service the page touches, so no orchestrator / Supabase loads and we can
 *  prove nothing runs on mount. */
const h = vi.hoisted(() => ({
  listMyProducts: vi.fn(),
  listEngineApprovedIngredients: vi.fn(),
  confirmProductMatch: vi.fn(),
  rejectProductMatch: vi.fn(),
}));
vi.mock('@/services/products', () => ({ listMyProducts: h.listMyProducts }));
vi.mock('@/services/ingredients', () => ({ listEngineApprovedIngredients: h.listEngineApprovedIngredients }));
vi.mock('@/services/productReview', () => ({
  confirmProductMatch: h.confirmProductMatch,
  rejectProductMatch: h.rejectProductMatch,
}));

import { MapperReviewView, type ReviewRow } from './mapperReviewView';
import { MapperReviewPage } from './MapperReviewPage';

const render = (el: ReactElement) => renderToStaticMarkup(<MemoryRouter>{el}</MemoryRouter>);
const visibleText = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');

const sampleRow: ReviewRow = {
  code: 'PR-ING-000010',
  id: '0acf8585',
  product_name: 'Nata para montar',
  product_category: 'dairy',
  mapper_status: 'needs_review',
  matched_basement_id: 'PI-ING-000180',
  candidate_name: 'Cream 30% UHT',
  candidate_category: 'dairy',
  candidate_subcategory: 'cream',
  product_fat: 35,
  product_protein: 2,
  product_sugars: 3.1,
  candidate_fat: 30,
  candidate_protein: 2.3,
  candidate_sugars: 3.2,
  candidate_pac: 3.668,
  candidate_pod: 0.512,
};

const baseProps = {
  rows: [] as ReviewRow[],
  loading: false,
  loaded: false,
  busyId: null as string | null,
  message: null as string | null,
  errorMessage: null as string | null,
  onLoad: () => {},
  onConfirm: () => {},
  onReject: () => {},
};

afterEach(() => vi.clearAllMocks());

describe('MapperReviewView — presentational', () => {
  it('shows the load button + the mapper-only / not-engine-ready warning', () => {
    const text = visibleText(render(<MapperReviewView {...baseProps} />));
    expect(text).toContain('Load needs_review products');
    expect(text).toMatch(/only the Mapper-result columns/i);
    expect(text).toMatch(/not.*engine-ready/i);
  });

  it('renders a row with product vs candidate composition + PAC/POD and Confirm/Reject', () => {
    const html = render(<MapperReviewView {...baseProps} rows={[sampleRow]} loaded />);
    const text = visibleText(html);
    expect(text).toContain('PR-ING-000010');
    expect(text).toContain('PI-ING-000180');
    expect(text).toContain('Cream 30% UHT');
    expect(text).toContain('3.668'); // candidate pac shown
    expect(text).toContain('Confirm');
    expect(text).toContain('Reject');
  });

  it('disables actions on a resolved (already matched/rejected) row', () => {
    const html = render(<MapperReviewView {...baseProps} rows={[{ ...sampleRow, mapper_status: 'matched' }]} loaded />);
    expect(html).toContain('disabled');
  });
});

describe('MapperReviewPage — container', () => {
  it('renders the review surface but loads / acts on nothing at mount (no auto-run)', () => {
    const html = render(<MapperReviewPage />);
    expect(visibleText(html)).toContain('Load needs_review products');
    expect(h.listMyProducts).not.toHaveBeenCalled();
    expect(h.confirmProductMatch).not.toHaveBeenCalled();
    expect(h.rejectProductMatch).not.toHaveBeenCalled();
  });
});
