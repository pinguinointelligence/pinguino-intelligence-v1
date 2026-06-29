import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** Mock the write services the page touches, so nothing persists on mount. The PURE
 *  matchProduct is NOT mocked (it never writes); the page only runs it from a click. */
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
import { MapperReviewPage } from './MapperReviewPage';

const render = (el: ReactElement) => renderToStaticMarkup(<MemoryRouter>{el}</MemoryRouter>);
const visibleText = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');

const sampleRow: ReviewRow = {
  code: 'PR-ING-000035',
  id: 'pid-35',
  product_name: 'Pistacho natural',
  product_category: 'nut_paste',
  mapper_status: 'needs_review',
  product_fat: 45,
  product_carbohydrate: 28,
  product_sugars: 8,
  product_protein: 20,
  product_salt: 0.05,
  candidates: [
    {
      basement_id: 'PI-ING-000413',
      name: 'Delipaste Pure Pistachio',
      category: 'nut',
      subcategory: 'pistachio',
      fat: 44,
      carbohydrate: 30,
      sugars: 10,
      protein: 18,
      salt: 0.1,
      pac: 12,
      pod: 9,
      mean_pp: 1.2,
    },
    {
      basement_id: 'PI-ING-000444',
      name: 'Roasted Pistachio Pulp 100%',
      category: 'nut',
      subcategory: 'pistachio',
      fat: 47,
      carbohydrate: 26,
      sugars: 7,
      protein: 21,
      salt: 0.0,
      pac: 6,
      pod: 5,
      mean_pp: 1.36,
    },
  ],
};

const baseProps = {
  rows: [] as ReviewRow[],
  loading: false,
  loaded: false,
  busyId: null as string | null,
  message: null as string | null,
  errorMessage: null as string | null,
  hiddenBroad: 0,
  hiddenNoCandidate: 0,
  onLoad: () => {},
  onConfirm: () => {},
  onReject: () => {},
};

afterEach(() => vi.clearAllMocks());

describe('MapperReviewView — presentational', () => {
  it('shows the load button + the not-engine-ready / read-only-on-load warning', () => {
    const text = visibleText(render(<MapperReviewView {...baseProps} />));
    expect(text).toContain('Load reviewable products');
    expect(text).toMatch(/nothing is written on load/i);
    expect(text).toMatch(/not.*engine-ready/i);
  });

  it('renders a multi-candidate row: product + each candidate (composition, distance, PAC/POD) + a Confirm each and a Reject', () => {
    const html = render(<MapperReviewView {...baseProps} rows={[sampleRow]} loaded />);
    const text = visibleText(html);
    expect(text).toContain('PR-ING-000035');
    expect(text).toContain('PI-ING-000413');
    expect(text).toContain('PI-ING-000444'); // both candidates listed
    expect(text).toContain('Roasted Pistachio Pulp 100%');
    expect(text).toContain('1.2'); // candidate distance shown
    expect(text).toContain('Reject all');
    // a Confirm button per candidate (the two candidates each get one; plus the warning copy)
    expect((html.match(/>Confirm</g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('disables actions on a resolved (already matched/rejected) row', () => {
    const html = render(<MapperReviewView {...baseProps} rows={[{ ...sampleRow, mapper_status: 'matched' }]} loaded />);
    expect(html).toContain('disabled');
  });

  it('reports the hidden buckets after load', () => {
    const text = visibleText(render(<MapperReviewView {...baseProps} loaded hiddenBroad={31} hiddenNoCandidate={17} />));
    expect(text).toContain('31');
    expect(text).toContain('17');
  });
});

describe('MapperReviewPage — container', () => {
  it('renders the review surface but loads / acts on nothing at mount (no auto-run)', () => {
    const html = render(<MapperReviewPage />);
    expect(visibleText(html)).toContain('Load reviewable products');
    expect(h.listMyProducts).not.toHaveBeenCalled();
    expect(h.confirmProductMatchTo).not.toHaveBeenCalled();
    expect(h.rejectProductMatch).not.toHaveBeenCalled();
  });
});
