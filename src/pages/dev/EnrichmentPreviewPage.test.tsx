import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ fetchOff: vi.fn(), listMyProducts: vi.fn(), applyEnrichment: vi.fn() }));
vi.mock('@/services/openFoodFacts', () => ({ fetchOpenFoodFactsProduct: h.fetchOff }));
vi.mock('@/services/products', () => ({ listMyProducts: h.listMyProducts }));
vi.mock('@/services/productEnrichment', () => ({ applyProductEnrichment: h.applyEnrichment }));

import { EnrichmentPreviewView, EnrichmentMergeView, EnrichmentPreviewPage } from './EnrichmentPreviewPage';
import { compareEnrichment, type EnrichableField } from '@/data/products/productEnrichment';
import type { OffProduct } from '@/data/products/openFoodFactsAdapter';

const off = (over: Partial<OffProduct> = {}): OffProduct => ({
  found: true, ean: '3017620422003', name: 'Nutella', ingredients_text: null,
  nutrition: { fat_percent: 30.9, saturated_fat_percent: 10.6, carbohydrate_percent: 57.5, total_sugars_percent: 56.3, protein_percent: 6.3, salt_percent: 0.107, kcal_per_100g: 539 },
  source: 'public_composition_db', ...over,
});
const render = (el: ReactElement) => renderToStaticMarkup(<MemoryRouter>{el}</MemoryRouter>);
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');

const mergeProps = (over: Partial<Parameters<typeof EnrichmentMergeView>[0]> = {}) => ({
  comparison: compareEnrichment({ fat_percent: 12 }, off()), // fat conflicts, the rest fill
  productCode: 'PR-ING-000010', productName: 'Nata', productEan: '3017620422003', productStatus: 'draft',
  selected: ['protein_percent'] as EnrichableField[], override: false, reason: '', applying: false,
  applyMessage: null, applyError: null,
  onToggle: () => {}, onOverrideChange: () => {}, onReasonChange: () => {}, onApply: () => {},
  ...over,
});

describe('EnrichmentPreviewView', () => {
  it('shows a found product nutrition + the public-DB source tier', () => {
    const t = text(render(<EnrichmentPreviewView result={off()} loading={false} errorMessage={null} />));
    expect(t).toContain('Nutella');
    expect(t).toMatch(/public composition DB/);
    expect(t).toContain('30.9');
  });

  it('shows a not-found message', () => {
    const t = text(render(<EnrichmentPreviewView result={off({ found: false, name: null })} loading={false} errorMessage={null} />));
    expect(t).toMatch(/Not found in OpenFoodFacts/);
  });

  it('surfaces an error', () => {
    const t = text(render(<EnrichmentPreviewView result={null} loading={false} errorMessage="boom" />));
    expect(t).toMatch(/Error: boom/);
  });
});

describe('EnrichmentMergeView', () => {
  it('renders the comparison (fill + conflict) + an apply button', () => {
    const t = text(render(<EnrichmentMergeView {...mergeProps()} />));
    expect(t).toMatch(/Merge into/);
    expect(t).toMatch(/conflict/);
    expect(t).toMatch(/fill/);
    expect(t).toMatch(/Apply selected enrichment \(1\)/);
  });

  it('shows the exact proposed write payload + the snapshot that would be created', () => {
    const t = text(render(<EnrichmentMergeView {...mergeProps({ selected: ['protein_percent'] as EnrichableField[] })} />));
    expect(t).toMatch(/proposed write payload/);
    expect(t).toMatch(/protein_percent/);
    expect(t).toMatch(/snapshot on apply: nutrition/);
  });

  it('blocks a PI Verified product behind an explicit override', () => {
    const t = text(render(<EnrichmentMergeView {...mergeProps({ productStatus: 'pi_verified' })} />));
    expect(t).toMatch(/PI Verified/);
    expect(t).toMatch(/Override PI Verified/);
  });

  it('warns on an EAN mismatch', () => {
    const t = text(render(<EnrichmentMergeView {...mergeProps({ productEan: '999', comparison: compareEnrichment({}, off({ ean: '3017620422003' })) })} />));
    expect(t).toMatch(/EAN mismatch/);
  });

  it('warns when a conflict field is selected (overriding a stronger source)', () => {
    const t = text(render(<EnrichmentMergeView {...mergeProps({ selected: ['fat_percent'] as EnrichableField[] })} />));
    expect(t).toMatch(/overriding a stored value/i);
  });
});

describe('EnrichmentPreviewPage — container', () => {
  it('renders an EAN input and reads/writes nothing on mount', () => {
    const t = text(render(<EnrichmentPreviewPage />));
    expect(t).toMatch(/Look up/);
    expect(h.fetchOff).not.toHaveBeenCalled();
    expect(h.listMyProducts).not.toHaveBeenCalled();
    expect(h.applyEnrichment).not.toHaveBeenCalled();
  });
});
