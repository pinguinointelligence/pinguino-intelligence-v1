import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** Mock the ONLY service the page touches, so no orchestrator / Supabase is loaded and we
 *  can prove the batch never runs on mount. */
const h = vi.hoisted(() => ({ matchAndSaveProduct: vi.fn() }));
vi.mock('@/services/productMapper', () => ({ matchAndSaveProduct: h.matchAndSaveProduct }));

import { MapperBatch6View } from './mapperBatch6View';
import { MapperBatch6Page } from './MapperBatch6Page';

const render = (el: ReactElement) => renderToStaticMarkup(<MemoryRouter>{el}</MemoryRouter>);
const visibleText = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');

afterEach(() => vi.clearAllMocks());

describe('MapperBatch6View — presentational', () => {
  it('shows the batch button, the 6-product count, and the mapper-only warning', () => {
    const html = render(<MapperBatch6View rows={[]} running={false} count={6} onRun={() => {}} />);
    const text = visibleText(html);
    expect(text).toContain('Run 6-product Mapper batch');
    expect(text).toMatch(/exactly 6 hardcoded products/i);
    expect(text).toMatch(/only the 11 Mapper result columns/i);
    expect(text).toMatch(/is not a full-catalog batch/i);
    expect(html).not.toContain('disabled'); // enabled when idle
  });

  it('disables the button while running and renders result rows', () => {
    expect(render(<MapperBatch6View rows={[]} running count={6} onRun={() => {}} />)).toContain('disabled');
    const ok = render(
      <MapperBatch6View
        rows={[{ code: 'PR-ING-000010', ok: true, mapper_status: 'needs_review', match_method: 'category_composition_similarity', match_confidence: 'needs_review', matched_basement_id: 'PI-ING-000180', candidate_count: 1, error: null }]}
        running={false}
        count={6}
        onRun={() => {}}
      />,
    );
    const text = visibleText(ok);
    expect(text).toContain('needs_review');
    expect(text).toContain('PI-ING-000180');
  });
});

describe('MapperBatch6Page — container', () => {
  it('renders the batch surface but does NOT run matching on mount (no auto-run)', () => {
    const html = render(<MapperBatch6Page />);
    expect(visibleText(html)).toContain('Run 6-product Mapper batch');
    expect(h.matchAndSaveProduct).not.toHaveBeenCalled();
  });
});
