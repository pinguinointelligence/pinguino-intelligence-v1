// @vitest-environment jsdom
/**
 * `/subscription` — turning the pages for real.
 *
 * The static contract test pins what is rendered; this one CLICKS. It proves
 * the 2/3–1/3 spread actually flips, that the expanded annual page reveals the
 * full breakdown, that Home and Pro are independent, and that the CTA follows
 * the cadence the book is showing (so the checkout charges what the customer read).
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { annualEconomics } from '@/billing/catalog/offerDisplay';
import { DEFAULT_OFFER_FLAGS } from '@/billing/catalog/offerFlags';
import { landingCopy } from '@/pages/landing/landingCopy';
import { SubscriptionPage } from './SubscriptionPage';

const home = annualEconomics('home', DEFAULT_OFFER_FLAGS)!;
const pro = annualEconomics('pro', DEFAULT_OFFER_FLAGS)!;
const cy = landingCopy.subscription.checkout.cycle;

describe('/subscription book — runtime page turns', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  const radios = (product: 'home' | 'pro') =>
    Array.from(host.querySelectorAll<HTMLButtonElement>(`button[name="cycle-${product}"]`));
  /** [monthly, annual] — declaration order is the reading order of the spread. */
  const monthlyPage = (product: 'home' | 'pro') => radios(product)[0];
  const annualPage = (product: 'home' | 'pro') => radios(product)[1];
  const click = async (el: HTMLButtonElement) => {
    await act(async () => {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  };

  beforeEach(async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={['/subscription']}>
            <SubscriptionPage />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it('opens monthly-wide and flips to annual-wide on click', () => {
    expect(monthlyPage('home').getAttribute('aria-checked')).toBe('true');
    expect(monthlyPage('home').className).toContain('sm:flex-[2_1_0%]');
    expect(annualPage('home').className).not.toContain('sm:flex-[2_1_0%]');
  });

  it('turns the page: annual takes ≈2/3 and monthly falls back to ≈1/3', async () => {
    await click(annualPage('home'));
    expect(annualPage('home').getAttribute('aria-checked')).toBe('true');
    expect(annualPage('home').className).toContain('sm:flex-[2_1_0%]');
    expect(monthlyPage('home').getAttribute('aria-checked')).toBe('false');
    expect(monthlyPage('home').className).not.toContain('sm:flex-[2_1_0%]');
  });

  it('reveals the full breakdown only once the annual page is open', async () => {
    expect(host.textContent).not.toContain(home.twelveMonthlyLabel);
    await click(annualPage('home'));
    const text = host.textContent ?? '';
    expect(text).toContain(home.annualLabel); // 49 €
    expect(text).toContain(home.effectiveMonthlyLabel); // 4,08 €
    expect(text).toContain(home.savingsLabel); // 70,88 €
    expect(text).toContain(home.twelveMonthlyLabel); // 119,88 €
    expect(text).toContain(`−${home.savingsPercent}%`); // −59%
    // The honest equivalent — seven months, not the banned „2 miesiące gratis".
    expect(text).toContain(`${home.freeMonthsEquivalent} miesięcy`);
    expect(text).toContain(cy.annualAnchorNote);
  });

  it('keeps HOME and PRO selections independent — no global mode', async () => {
    await click(annualPage('home'));
    expect(annualPage('home').getAttribute('aria-checked')).toBe('true');
    // Pro must be untouched: the visitor can weigh Home yearly vs Pro monthly.
    expect(monthlyPage('pro').getAttribute('aria-checked')).toBe('true');
    expect(annualPage('pro').getAttribute('aria-checked')).toBe('false');

    await click(annualPage('pro'));
    await click(monthlyPage('home'));
    expect(monthlyPage('home').getAttribute('aria-checked')).toBe('true');
    expect(annualPage('pro').getAttribute('aria-checked')).toBe('true');
  });

  it('shows the no-risk promise on monthly and hides it when annual is open', async () => {
    expect(host.textContent).toContain(cy.noRiskBody);
    await click(annualPage('home'));
    await click(annualPage('pro'));
    expect(host.textContent).not.toContain(cy.noRiskBody);
  });

  it('makes the CTA name the cadence it will actually charge', async () => {
    const cta = () =>
      Array.from(host.querySelectorAll('button')).find((b) =>
        b.textContent?.startsWith(landingCopy.subscription.proCta),
      );
    expect(cta()?.textContent).toContain(`${pro.monthlyLabel} / miesiąc`);
    await click(annualPage('pro'));
    expect(cta()?.textContent).toContain(`${pro.annualLabel} / rok`);
  });
});
