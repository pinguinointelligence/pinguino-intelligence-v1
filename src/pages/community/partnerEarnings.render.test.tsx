/**
 * H-DASH-02 / H-DASH-07 — the partner page shows money first, and when each
 * commission can settle.
 *
 * Renders the real PartnerPage from a seeded workspace: the Overview's three
 * earnings tiles (this month · W trakcie · Do wypłaty) and the commissions
 * table's "Do wypłaty od" column.
 */
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PartnerWorkspace } from '@/services/partner';
import { PartnerPage } from './PartnerPage';

vi.mock('@/components/shared/DestinationSurface', () => ({
  DestinationSurface: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const commission = (
  id: string,
  status: string,
  amountCents: number,
  earnedAt: string,
  eligibleAt: string | null,
) => ({
  id,
  status,
  product: 'pro',
  cadence: 'monthly',
  amountCents,
  currency: 'EUR',
  earnedAt,
  eligibleAt,
  livemode: false,
});

const WORKSPACE: PartnerWorkspace = {
  ok: true,
  partner: {
    id: 'partner-1',
    status: 'active',
    tier: 'standard',
    onboardingComplete: true,
    payoutsEnabled: false,
    connectAccountPresent: false,
  },
  profile: {
    slug: 'kasia',
    displayName: 'Kasia',
    logoPath: null,
    shortDescription: null,
    websiteUrl: null,
    socialLinks: {},
    defaultDestinationPath: '/',
    moderationStatus: 'APPROVED',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  codes: [],
  links: [],
  commissions: [
    commission('c1', 'held', 499, '2026-09-02T10:00:00.000Z', '2026-10-02T10:00:00.000Z'),
    commission('c2', 'eligible', 900, '2026-08-10T10:00:00.000Z', '2026-09-09T10:00:00.000Z'),
    commission('c3', 'reversed', 499, '2026-09-03T10:00:00.000Z', null),
    commission('c4', 'paid', 1400, '2026-09-05T10:00:00.000Z', '2026-10-05T10:00:00.000Z'),
  ],
  payouts: [
    {
      id: 'p1',
      status: 'failed',
      amountCents: 2500,
      carryForwardCents: -300,
      currency: 'EUR',
      paidAt: null,
      createdAt: '2026-09-01T02:45:00.000Z',
      failureReason: 'account_closed',
    },
  ],
};

const render = (section: 'overview' | 'earnings' | 'payouts') => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(['partner-workspace'], WORKSPACE);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/partner?section=${section}`]}>
        <PartnerPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const flat = (value: string) => value.replace(/\s+/g, ' ');
const text = (html: string) => flat(html.replace(/<[^>]+>/g, ' '));
const eur = (cents: number) =>
  flat(new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'EUR' }).format(cents / 100));
const day = (iso: string) => flat(new Date(iso).toLocaleDateString('pl-PL'));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-15T12:00:00.000Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('H-DASH-02 — the Overview leads with money', () => {
  it('this month: held 4,99 + paid 14,00 — the reversal is left out', () => {
    expect(text(render('overview'))).toContain(`Prowizja w tym miesiącu ${eur(1899)}`);
  });

  it('W trakcie and Do wypłaty are the ledger states, labelled with the ledger copy', () => {
    const overview = text(render('overview'));
    expect(overview).toContain(`W trakcie ${eur(499)}`);
    expect(overview).toContain(`Do wypłaty ${eur(900)}`);
  });

  it('the activity tiles are still there, below', () => {
    expect(text(render('overview'))).toContain('Aktywne kody 0 / 3');
  });
});

describe('H-DASH-07 — each commission says when it can settle', () => {
  it('the table has a "Do wypłaty od" column with the eligible date', () => {
    const earnings = text(render('earnings'));
    expect(earnings).toContain('Do wypłaty od');
    expect(earnings).toContain(day('2026-10-02T10:00:00.000Z'));
  });

  it('a commission without an eligible date shows a dash, not "Invalid Date"', () => {
    const earnings = text(render('earnings'));
    expect(earnings).not.toContain('Invalid Date');
    expect(earnings).toMatch(/ — /);
  });
});

describe('H-DASH-08 — a payout reads as copy, and a failure never leaks its raw reason', () => {
  it('status, amount and carry-forward are shown', () => {
    const payouts = text(render('payouts'));
    expect(payouts).toContain('Nieudana');
    expect(payouts).toContain(eur(2500));
    expect(payouts).toContain('Przeniesienie');
  });

  it("the provider's failure code is not printed — the status help explains instead", () => {
    const html = render('payouts');
    expect(text(html)).not.toContain('account_closed');
    expect(html).toContain('Przelew się nie powiódł');
  });
});
