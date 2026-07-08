/// <reference types="node" />
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { OptimizationPreviewPage } from './OptimizationPreviewPage';

const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');

describe('OptimizationPreviewPage — headless render (browser-proof equivalent)', () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <OptimizationPreviewPage />
    </MemoryRouter>,
  );
  const body = text(html);

  it('renders the DEV preview with every fixture and its final decision', () => {
    expect(body).toMatch(/Optimization Preview/);
    expect(body).toMatch(/Standard Gelato · POD too low/);
    expect(body).toMatch(/Standard Gelato · fat far too high/);
    expect(body).toMatch(/Strawberry Sorbet/);
    expect(body).toMatch(/Granita/);
    // the five decision states are all represented across the cards
    expect(body).toMatch(/tradeoff/);
    expect(body).toMatch(/impossible/);
    expect(body).toMatch(/no_action_needed/);
    expect(body).toMatch(/blocked/);
  });

  it('renders before→after metrics for the corrected tradeoff fixture', () => {
    // the arrow separator only appears when an after-metric is present (a real rerun ran)
    expect(html).toMatch(/→/);
    expect(body).toMatch(/NPAC/);
    expect(body).toMatch(/POD/);
  });

  it('states plainly that it is a non-persisting preview', () => {
    expect(body).toMatch(/Preview only/);
    expect(body).toMatch(/nothing is saved/);
  });
});
