import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** Mock the ONLY service the page touches, so no orchestrator / Supabase is loaded
 *  and we can prove the match never runs on mount. */
const h = vi.hoisted(() => ({ matchAndSaveProduct: vi.fn() }));
vi.mock('@/services/productMapper', () => ({ matchAndSaveProduct: h.matchAndSaveProduct }));

import { MapperSmokeView } from './mapperSmokeView';
import { MapperSmokePage } from './MapperSmokePage';

const render = (el: ReactElement) => renderToStaticMarkup(<MemoryRouter>{el}</MemoryRouter>);
const visibleText = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');

const baseProps = {
  productCode: 'PR-ING-000002',
  productId: '18313d47-ddad-4e4e-b1f9-ba39c9ad9434',
  running: false,
  resultJson: null as string | null,
  errorMessage: null as string | null,
  onRun: () => {},
};

afterEach(() => vi.clearAllMocks());

describe('MapperSmokeView — presentational', () => {
  it('shows the exact button label, the single target product, and the mapper-only warning', () => {
    const html = render(<MapperSmokeView {...baseProps} />);
    const text = visibleText(html);
    expect(text).toContain('Run one-product Mapper smoke');
    expect(text).toContain('PR-ING-000002');
    expect(text).toContain('18313d47-ddad-4e4e-b1f9-ba39c9ad9434');
    expect(text).toMatch(/only the 11 Mapper result columns/i);
    expect(text).toMatch(/is not a batch/i);
    expect(html).not.toContain('disabled'); // enabled when idle
  });

  it('disables the button while a match is running', () => {
    const html = render(<MapperSmokeView {...baseProps} running />);
    expect(html).toContain('disabled');
    expect(visibleText(html)).toContain('Running');
  });

  it('renders the result JSON when present, and an error message when present', () => {
    const ok = render(<MapperSmokeView {...baseProps} resultJson={'{"mapper_status":"unmatched"}'} />);
    expect(visibleText(ok)).toContain('unmatched');
    const bad = render(<MapperSmokeView {...baseProps} errorMessage="Product not found or not owned." />);
    expect(visibleText(bad)).toContain('Product not found or not owned.');
  });
});

describe('MapperSmokePage — container', () => {
  it('renders the smoke surface but does NOT run matching on mount (no auto-run)', () => {
    const html = render(<MapperSmokePage />);
    expect(visibleText(html)).toContain('Run one-product Mapper smoke');
    expect(h.matchAndSaveProduct).not.toHaveBeenCalled();
  });
});
