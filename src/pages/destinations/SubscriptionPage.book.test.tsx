/**
 * `/subscription` — THE BOOK (owner redesign, 2026-09-18).
 *
 * Pins the contract that makes the page sell honestly:
 *  - NO global „Miesięcznie | Rocznie" toggle — each plan owns its own pair;
 *  - Home and Pro are selected INDEPENDENTLY (two scoped radiogroups);
 *  - the annual side shows the REAL figures (yearly price, effective monthly,
 *    euro saving, floored percent) on sight, including while collapsed;
 *  - „2 miesiące gratis" never appears — it understates the real benefit;
 *  - the monthly side carries the no-risk promise WITHOUT quoting an exact
 *    top-up (that belongs to the conversion preview);
 *  - every displayed amount comes from the catalogue, and the CTA charges the
 *    offer key of the cadence the book is actually showing.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { annualEconomics, publicOffersForProduct } from '@/billing/catalog/offerDisplay';
import { DEFAULT_OFFER_FLAGS } from '@/billing/catalog/offerFlags';
import { checkoutOfferKey } from '@/services/billingCheckout';
import { landingCopy } from '@/pages/landing/landingCopy';
import { SubscriptionPage } from './SubscriptionPage';

const render = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/subscription']}>
        <SubscriptionPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const html = render();
const home = annualEconomics('home', DEFAULT_OFFER_FLAGS)!;
const pro = annualEconomics('pro', DEFAULT_OFFER_FLAGS)!;
const cy = landingCopy.subscription.checkout.cycle;

describe('the book replaces the global toggle', () => {
  it('gives each plan its OWN radiogroup, scoped by product', () => {
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('name="cycle-home"');
    expect(html).toContain('name="cycle-pro"');
    // Two groups × two pages = four cadence radios.
    expect((html.match(/role="radio"/g) ?? []).length).toBe(4);
  });

  it('opens both plans on the monthly page by default', () => {
    // Exactly one checked radio per plan, and it is the monthly one.
    expect((html.match(/aria-checked="true"/g) ?? []).length).toBe(2);
    const homeGroup = html.slice(
      html.indexOf('name="cycle-home"'),
      html.indexOf('name="cycle-pro"'),
    );
    const monthlyIdx = homeGroup.indexOf(cy.monthlyTitle);
    const annualIdx = homeGroup.indexOf(cy.annualTitle);
    expect(monthlyIdx).toBeGreaterThan(-1);
    expect(annualIdx).toBeGreaterThan(monthlyIdx); // monthly page sits left of annual
  });

  it('carries no global cycle switch any more', () => {
    expect(html).not.toContain('aria-pressed');
  });

  it('splits the spread ≈2/3 to ≈1/3 on wide screens and drops it on phones', () => {
    expect(html).toContain('sm:flex-[2_1_0%]'); // the selected page
    expect(html).toContain('sm:flex-[1_1_0%]'); // the turned-away page
    // The ratio is a `sm:` rule only — a phone stacks the pages full-width.
    expect(html).toContain(
      'flex flex-col overflow-hidden border border-[var(--g-line)] sm:flex-row',
    );
    expect(html).toContain('motion-reduce:transition-none');
  });
});

describe('the annual page sells the real benefit on sight', () => {
  // Both books open on monthly, yet the annual page already carries its figures.
  it('sells BEFORE any click: price, effective monthly, euro saving and percent', () => {
    for (const e of [home, pro]) {
      expect(html).toContain(e.annualLabel); // 49 € / 199 €
      expect(html).toContain(e.effectiveMonthlyLabel); // 4,08 € / 16,58 €
      expect(html).toContain(e.savingsLabel); // 70,88 € / 100,88 €
      expect(html).toContain(`−${e.savingsPercent}%`); // −59% / −33%
    }
  });

  it('never says „gratis" — the banned claim understates the real benefit', () => {
    expect(html).not.toMatch(/gratis/i);
  });
});

describe('the monthly page removes the risk without quoting a number', () => {
  it('promises the paid month is credited', () => {
    expect(html).toContain(cy.noRiskTitle);
    expect(html).toContain(cy.noRiskBody);
  });

  it('does NOT print an exact conversion top-up on a plan card', () => {
    // 39,01 € / 174,01 € belong to the conversion preview, not to a visitor
    // who has not started converting.
    expect(html).not.toContain('39,01');
    expect(html).not.toContain('174,01');
  });
});

describe('prices and checkout stay tied to the catalogue', () => {
  it('renders only catalogue amounts for both plans', () => {
    for (const product of ['home', 'pro'] as const) {
      const { monthly, yearly } = publicOffersForProduct(product, DEFAULT_OFFER_FLAGS);
      expect(html).toContain(monthly!.label.split(' / ')[0]);
      expect(html).toContain(yearly!.label.split(' / ')[0]);
    }
  });

  it('names the cadence it will charge on each CTA', () => {
    const { monthly } = publicOffersForProduct('home', DEFAULT_OFFER_FLAGS);
    expect(html).toContain(`${landingCopy.subscription.homeCta} · ${monthly!.label}`);
  });

  it('has a real standard offer key behind every cadence a book can select', () => {
    for (const product of ['home', 'pro'] as const) {
      for (const cycle of ['monthly', 'yearly'] as const) {
        expect(checkoutOfferKey(product, cycle)).toBe(`${product}_${cycle}_standard`);
      }
    }
  });
});
