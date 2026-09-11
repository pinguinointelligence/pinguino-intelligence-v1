/** @vitest-environment jsdom */
/**
 * PRO MOBILE UX v2 · B14 — the tour pictures load like the words next to them.
 *
 * Each ≈1.7 MB PNG now has WebP renditions (≈20–130 KB) at the two widths the
 * layout needs; the PNG stays the fallback. The picture is keyed by step, so a
 * new step's words never sit over the previous step's picture while its own
 * one is still loading.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { KnowledgeTour } from './KnowledgeTour';
import { knowledgeTourSteps } from './knowledgeTourModel';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const mount = (path: string) => {
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <KnowledgeTour />
      </MemoryRouter>,
    );
  });
  return host.querySelector<HTMLElement>('[data-testid="knowledge-tour"]')!;
};

describe('B14 — tour imagery', () => {
  it('offers the WebP renditions at the widths the layout needs, with the PNG as the fallback', () => {
    const tour = mount('/how-it-works?step=1');
    const source = tour.querySelector('.knowledge-tour__artwork picture source[type="image/webp"]');
    expect(source?.getAttribute('srcset')).toBe(
      '/guide/01-960.webp 960w, /guide/01-1672.webp 1672w',
    );
    expect(source?.getAttribute('sizes')).toBe('(max-width: 60rem) 100vw, 56vw');
    const image = tour.querySelector<HTMLImageElement>('.knowledge-tour__artwork img');
    expect(image?.getAttribute('src')).toBe('/guide/01.png');
    expect(image?.getAttribute('decoding')).toBe('async');
    expect(image?.getAttribute('width')).toBe('1672');
    expect(image?.getAttribute('height')).toBe('941');
  });

  it('mounts a NEW picture for a new step, so the previous one can never linger', () => {
    const tour = mount('/how-it-works?step=1');
    const first = tour.querySelector('.knowledge-tour__artwork img');
    const next = tour.querySelector<HTMLButtonElement>(
      '.knowledge-tour__navigation button[aria-label="Dalej"]',
    );
    expect(next).not.toBeNull();
    act(() => next!.click());
    const second = tour.querySelector('.knowledge-tour__artwork img');
    expect(second?.getAttribute('src')).toBe('/guide/02.png');
    expect(second).not.toBe(first);
  });

  it('ships both WebP renditions for every step', () => {
    for (const step of knowledgeTourSteps()) {
      for (const width of [960, 1672]) {
        const file = step.image.replace(/\.png$/, `-${width}.webp`);
        expect(existsSync(resolve(process.cwd(), `public${file}`)), file).toBe(true);
      }
    }
  });
});
