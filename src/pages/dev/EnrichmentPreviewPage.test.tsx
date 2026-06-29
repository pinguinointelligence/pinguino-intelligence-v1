import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ fetchOff: vi.fn() }));
vi.mock('@/services/openFoodFacts', () => ({ fetchOpenFoodFactsProduct: h.fetchOff }));

import { EnrichmentPreviewView, EnrichmentPreviewPage } from './EnrichmentPreviewPage';
import type { OffProduct } from '@/data/products/openFoodFactsAdapter';

const off = (over: Partial<OffProduct> = {}): OffProduct => ({
  found: true, ean: '3017620422003', name: 'Nutella', ingredients_text: null,
  nutrition: { fat_percent: 30.9, saturated_fat_percent: 10.6, carbohydrate_percent: 57.5, total_sugars_percent: 56.3, protein_percent: 6.3, salt_percent: 0.107, kcal_per_100g: 539 },
  source: 'public_composition_db', ...over,
});
const render = (el: ReactElement) => renderToStaticMarkup(<MemoryRouter>{el}</MemoryRouter>);
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');

describe('EnrichmentPreviewView', () => {
  it('shows a found product nutrition + the public-DB source tier (preview only)', () => {
    const t = text(render(<EnrichmentPreviewView result={off()} loading={false} errorMessage={null} />));
    expect(t).toContain('Nutella');
    expect(t).toMatch(/public composition DB/);
    expect(t).toContain('30.9');
    expect(t).toMatch(/Preview only/);
    expect(t).toMatch(/separate, reviewed step/);
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

describe('EnrichmentPreviewPage — container', () => {
  it('renders an EAN input and looks nothing up on mount', () => {
    const t = text(render(<EnrichmentPreviewPage />));
    expect(t).toMatch(/Look up/);
    expect(h.fetchOff).not.toHaveBeenCalled();
  });
});
