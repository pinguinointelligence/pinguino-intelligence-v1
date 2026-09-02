import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { AffiliatePage } from './AffiliatePage';
import { affiliateCopy } from '@/copy/affiliate';
import { PUBLIC_GOLD_THRESHOLD } from '@/features/affiliate/publicRateAuthority';

const render = (element: ReactNode, path = '/affiliate') => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>{element}</MemoryRouter>
    </QueryClientProvider>,
  );
};

const html = render(<AffiliatePage />);
const c = affiliateCopy;

describe('Gellatti Affiliate — public page', () => {
  it('C01/C02 — the hero leads with the recurring-commission promise', () => {
    expect(html).toContain(c.hero.titleLine1);
    expect(html).toContain(c.hero.titleLine2);
    expect(html).toContain('Zarabiaj na każdym odnowieniu');
  });

  it('C03 — a signed-out visitor gets the join call to action', () => {
    // renderToStaticMarkup reads the store's INITIAL state, i.e. signed out.
    expect(html).toContain(c.cta.signedOut);
  });

  it('C06 — the recurring explainer names the four-step loop', () => {
    expect(html).toContain(c.recurring.title);
    for (const step of c.recurring.steps) {
      expect(html).toContain(step.title);
    }
    expect(html).toContain(c.recurring.honest);
  });

  it('C07 — the Standard rates render from the canonical authority', () => {
    expect(html).toContain('affiliate-rate-card-standard');
    for (const amount of ['1,99', '4,99']) expect(html).toContain(amount);
    // 9 € and 29 € print without decimals in pl-PL.
    expect(html).toMatch(/9(&nbsp;|\s|\u00A0)?€/);
    expect(html).toMatch(/29(&nbsp;|\s|\u00A0)?€/);
  });

  it('C08 — the Gold rates render from the canonical authority', () => {
    expect(html).toContain('affiliate-rate-card-gold');
    for (const amount of ['2,49', '5,99']) expect(html).toContain(amount);
    expect(html).toMatch(/14(&nbsp;|\s|\u00A0)?€/);
    expect(html).toMatch(/39(&nbsp;|\s|\u00A0)?€/);
  });

  it('C09 — the Elite card carries NO rate at all', () => {
    const eliteCard = html.slice(html.indexOf('affiliate-rate-card-elite'));
    const cardEnd = eliteCard.indexOf('</article>');
    const eliteHtml = eliteCard.slice(0, cardEnd);
    // No euro figure, and none of the seeded Elite amounts.
    expect(eliteHtml).not.toMatch(/€/);
    for (const amount of ['2,99', '6,99', '19', '49', '299', '699', '1900', '4900']) {
      expect(eliteHtml).not.toContain(amount);
    }
  });

  it('C10 — Elite offers individual terms and a conversation', () => {
    expect(html).toContain(c.rates.eliteTerms);
    expect(html).toContain(c.rates.eliteTalk);
    expect(html).toContain(c.rates.eliteCta);
  });

  it('C11/C12 — the audience and three-step sections are present', () => {
    for (const group of c.audience.groups) expect(html).toContain(group.title);
    for (const step of c.how.steps) {
      expect(html).toContain(step.index);
      expect(html).toContain(step.title);
    }
  });

  it('C13 — the application section is on the page with its own anchor', () => {
    expect(html).toContain('id="affiliate-application"');
    expect(html).not.toContain('id="partner-application"');
  });

  it('D05 — the Gold threshold is rendered from the canonical authority', () => {
    expect(html).toContain(String(PUBLIC_GOLD_THRESHOLD));
    expect(html).not.toContain('{threshold}');
  });

  it('E01 — the calculator is on the page', () => {
    expect(html).toContain('affiliate-calculator');
    expect(html).toContain(c.calculator.totalPerYear);
    expect(html).toContain(c.calculator.averagePerMonth);
    expect(html).toContain(c.calculator.assumption);
  });

  it('C14 — the page stays to six sections', () => {
    // Section heads: recurring, rates, audience, how, application (the hero
    // carries its own identity), i.e. the owner's six blocks and no more.
    const sectionHeads = html.match(/<section|data-destination-hero/g) ?? [];
    expect(sectionHeads.length).toBeLessThanOrEqual(8);
  });

  it('D07/L01 — no internal vocabulary and no private data on the public page', () => {
    for (const leak of [
      /partner_/i,
      /commission_entries/i,
      /supabase/i,
      /\bRPC\b/,
      /stripe/i,
      /webhook/i,
    ]) {
      expect(html).not.toMatch(leak);
    }
  });

  it('B07 — the equipment lanes are not mixed in', () => {
    for (const lane of ['/machines', '/mobile', '/trailer', '/franchise', '/work-with-us']) {
      expect(html).not.toContain(`href="${lane}"`);
    }
  });
});
