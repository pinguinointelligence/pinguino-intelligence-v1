/** @vitest-environment jsdom */
/**
 * FRANCHISE — the rebuilt page, as a visitor meets it (DESIGN F1, 2026-09-18).
 *
 * The flow is: the dark top, four formats, ONE opened format under the row,
 * „Jak działa Gellatti”, and the enquiry form — compact, on the page, last.
 * These contracts fail if any of the old page comes back: four details at once,
 * the form replaced by a second contact mechanism, a lane CTA landing on the
 * wrong format, or a Maszyny enquiry arriving indistinguishable from a Lokal
 * one.
 */
import type { ReactNode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const submitFranchiseInquiry = vi.fn();
vi.mock('@/services/franchise', () => ({
  submitFranchiseInquiry: (...args: unknown[]) => submitFranchiseInquiry(...args),
}));
/* The page's own shell is the canonical AppShell and is exercised elsewhere.
   What is under test here is what the page itself does. */
vi.mock('@/components/shared/DestinationSurface', () => ({
  DestinationSurface: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const { FranchisePage } = await import('./GlobalDestinationPages');

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  submitFranchiseInquiry.mockReset();
  submitFranchiseInquiry.mockResolvedValue({ id: 'x', status: 'new' });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const mount = (entry = '/franchise') => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  act(() => {
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[entry]}>
          <FranchisePage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  });
  return host;
};

/** The dialog portals to <body>, so the page is queried document-wide. */
const at = (testId: string) => document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);

const click = (node: HTMLElement | null) => {
  if (!node) throw new Error('nothing to click');
  act(() => node.dispatchEvent(new MouseEvent('click', { bubbles: true })));
};

const panels = () => document.querySelectorAll('[data-testid="franchise-format-panel"]');
const openFormat = () => panels()[0]?.getAttribute('data-franchise-format');
const form = () => document.querySelector<HTMLFormElement>('#franchise-inquiry');

const setValue = (control: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(control, value);
  act(() => control.dispatchEvent(new Event('input', { bubbles: true })));
};

describe('one format is open at a time', () => {
  it('offers the four formats and opens Lokal from the first render', () => {
    mount();
    for (const id of ['local', 'food-truck', 'cart', 'machines']) {
      expect(at(`franchise-format-${id}`)).not.toBeNull();
    }
    // Owner correction 2026-09-19: no empty state under the row, ever.
    expect(panels()).toHaveLength(1);
    expect(openFormat()).toBe('local');
    expect(at('franchise-format-local')!.getAttribute('aria-selected')).toBe('true');
  });

  it('a click swaps the one open block, it never opens a second', () => {
    mount();
    click(at('franchise-format-machines'));
    expect(panels()).toHaveLength(1);
    expect(openFormat()).toBe('machines');
    expect(at('franchise-format-machines')!.getAttribute('aria-selected')).toBe('true');
    expect(at('franchise-format-local')!.getAttribute('aria-selected')).toBe('false');

    click(at('franchise-format-cart'));
    expect(panels()).toHaveLength(1);
    expect(openFormat()).toBe('cart');
  });

  it('opens on the format the lane CTA came from', () => {
    mount('/franchise?from=%2Fmobile');
    expect(openFormat()).toBe('cart');
  });
});

describe('the open format leads with its photographs', () => {
  const gallery = () => at('franchise-format-gallery');
  /** The slide actually on show — read off the DOM, not off the component. */
  const shown = () => {
    const slides = [...document.querySelectorAll('[data-gallery-slide]')];
    const active = slides.filter((s) => s.getAttribute('data-active') === 'true');
    // Exactly one photograph is ever visible; the rest are hidden from AT too.
    expect(active).toHaveLength(1);
    expect(active[0]!.getAttribute('aria-hidden')).toBeNull();
    expect(slides.filter((s) => s.getAttribute('aria-hidden') === 'true')).toHaveLength(
      slides.length - 1,
    );
    return Number(active[0]!.getAttribute('data-gallery-slide'));
  };
  const sources = () =>
    [...document.querySelectorAll<HTMLImageElement>(
      '[data-testid="franchise-format-gallery"] img',
    )].map((img) => img.getAttribute('src'));

  it('puts the gallery ABOVE the description and the points', () => {
    mount();
    const panel = panels()[0]!;
    const order = [...panel.querySelectorAll('[data-testid="franchise-format-gallery"], h2, ul')];
    expect(order[0]!.getAttribute('data-testid')).toBe('franchise-format-gallery');
    expect(order[1]!.tagName).toBe('H2');
    expect(order[2]!.tagName).toBe('UL');
  });

  it('shows Food Truck open-and-serving first and keeps the towed shot LAST', () => {
    mount();
    click(at('franchise-format-food-truck'));
    // OWNER ORDER 2026-09-19. W03 is the photograph the format already had; it
    // is not deleted, it is the last slide.
    expect(sources()).toEqual([
      '/images/work-with-us/A07.png',
      '/images/work-with-us/A06.png',
      '/images/work-with-us/W03.png',
    ]);
    expect(shown()).toBe(0);
    expect(gallery()!.getAttribute('data-gallery-count')).toBe('3');
  });

  it('pages with the arrows, and wraps rather than dead-ending', () => {
    mount();
    click(at('franchise-format-food-truck'));
    click(at('franchise-gallery-right'));
    expect(shown()).toBe(1);
    click(at('franchise-gallery-right'));
    expect(shown()).toBe(2);
    click(at('franchise-gallery-right'));
    expect(shown()).toBe(0);
    click(at('franchise-gallery-left'));
    expect(shown()).toBe(2);
  });

  it('starts each format at its OWN first photograph', () => {
    mount();
    click(at('franchise-format-food-truck'));
    click(at('franchise-gallery-right'));
    expect(shown()).toBe(1);
    click(at('franchise-format-cart'));
    // A stale index would open the cart on its second picture.
    expect(shown()).toBe(0);
    expect(sources()[0]).toBe('/images/work-with-us/A05.png');
  });

  it('draws NO controls for a format that still has one photograph', () => {
    mount();
    // Lokal is open from the first render and is the one awaiting more images.
    expect(gallery()!.getAttribute('data-gallery-count')).toBe('1');
    expect(at('franchise-gallery-left')).toBeNull();
    expect(at('franchise-gallery-right')).toBeNull();
  });

  it('keeps every format\'s existing photograph somewhere in its gallery', () => {
    mount();
    for (const [id, existing] of [
      ['local', 'F01'],
      ['food-truck', 'W03'],
      ['cart', 'W02'],
      ['machines', 'W04'],
    ] as const) {
      click(at(`franchise-format-${id}`));
      expect(sources()).toContain(`/images/work-with-us/${existing}.png`);
    }
  });
});

describe('the enquiry stays a form, on the page', () => {
  it('is rendered with the page, not behind a second contact mechanism', () => {
    mount();
    expect(form()).not.toBeNull();
    expect(at('franchise-contact-open')).toBeNull();
    expect(document.querySelectorAll('form')).toHaveLength(1);
  });

  it('keeps the fields the stored authority defines', () => {
    mount();
    const labels = [...document.querySelectorAll('#franchise-inquiry label')].map(
      (l) => l.textContent?.trim().split(/(?=[A-ZŁŚŻ])/)[0],
    );
    expect(labels).toHaveLength(6);
    expect(document.querySelectorAll('#franchise-inquiry input')).toHaveLength(5);
    expect(document.querySelectorAll('#franchise-inquiry textarea')).toHaveLength(1);
  });

  it('still honours #lead, which every lane CTA and old external link uses', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    mount('/franchise?from=%2Ftrailer#lead');
    expect(openFormat()).toBe('food-truck');
    expect(scrollIntoView).toHaveBeenCalled();
  });
});

describe('a lead still says what it is about', () => {
  const fill = () => {
    const inputs = [...document.querySelectorAll<HTMLInputElement>('#franchise-inquiry input')];
    setValue(inputs[0]!, 'Anna Kowalska');
    setValue(inputs[1]!, 'anna@example.com');
  };
  const submit = async () => {
    await act(async () => {
      form()!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
  };

  it('carries the concept of the format that was open', async () => {
    mount();
    click(at('franchise-format-cart'));
    fill();
    await submit();
    expect(submitFranchiseInquiry).toHaveBeenCalledWith(
      expect.objectContaining({ concept: 'wozek' }),
    );
  });

  /**
   * Maszyny has no stored concept — inventing a fifth would change a canonical
   * contract — so the route is what tells it apart, which is what the enquiry's
   * `source_route` allowlist exists for.
   */
  it('tells a Maszyny enquiry apart by its route', async () => {
    mount();
    click(at('franchise-format-machines'));
    fill();
    await submit();
    expect(submitFranchiseInquiry).toHaveBeenCalledWith(
      expect.objectContaining({ sourceRoute: '/machines' }),
    );
  });

  it('never overwrites where the question actually started', async () => {
    mount('/franchise?from=%2Ftrailer');
    click(at('franchise-format-machines'));
    fill();
    await submit();
    expect(submitFranchiseInquiry).toHaveBeenCalledWith(
      expect.objectContaining({ sourceRoute: '/trailer' }),
    );
  });
});
