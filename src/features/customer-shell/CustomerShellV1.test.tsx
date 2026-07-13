import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { CustomerShellV1 } from './CustomerShellV1';
import { customerShellCopy as copy } from './customerShellCopy';

/**
 * Light render smoke test (node env, static markup — the repo's convention).
 * `CustomerShellV1` now uses react-router `Link` (global nav), so it renders under
 * a MemoryRouter here just as it renders under the app's BrowserRouter in prod.
 */
const render = () => renderToStaticMarkup(
  <MemoryRouter>
    <CustomerShellV1 />
  </MemoryRouter>,
);

describe('CustomerShellV1', () => {
  it('renders the home headline', () => {
    const html = render();
    expect(html).toContain(copy.home.headline);
    expect(html).toContain('Co dzisiaj robimy?');
  });

  it('shows the example affordance and the voice/text entry', () => {
    const html = render();
    expect(html).toContain(copy.home.tryExample);
    expect(html).toContain(copy.home.placeholder);
    // No SpeechRecognition in node → the mic renders its unavailable state.
    expect(html).toContain(copy.mic.unavailable);
  });

  it('shows the global navigation trigger', () => {
    const html = render();
    expect(html).toContain(copy.menu.open); // hamburger aria-label
    expect(html).toContain(copy.menu.brand);
  });

  it('shows NO customer-visible preview disclaimer (removed)', () => {
    const html = render();
    expect(html).not.toContain('Wersja poglądowa');
    expect(html).not.toContain('charakter poglądowy');
  });

  it('leaks no digit-gram value on the initial Demo screen', () => {
    const html = render();
    // e.g. "620 g" / "5g" — a number immediately bound to a grams unit.
    expect(/\b\d[\d.,]*\s?g\b/.test(html)).toBe(false);
  });
});
