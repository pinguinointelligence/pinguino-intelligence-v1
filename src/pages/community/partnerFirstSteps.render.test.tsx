/**
 * G-WEL — the Overview opens with "Pierwsze kroki" until the partner has done
 * them, each open step linking to the section where it is done.
 */
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { PartnerCodeAnalytics, PartnerWorkspace } from '@/services/partner';
import { PartnerPage } from './PartnerPage';

vi.mock('@/components/shared/DestinationSurface', () => ({
  DestinationSurface: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const ACTIVE_CODE: PartnerCodeAnalytics = {
  id: 'c1',
  code: 'KASIA1',
  slug: 'kasia1',
  label: null,
  status: 'active',
  createdAt: '2026-09-01T00:00:00.000Z',
  clickCount: 0,
  uniqueVisitors: 0,
  signups: 0,
  paidCustomers: 0,
  grossAttributedRevenueCents: 0,
  refundCommissionCents: 0,
  pendingCommissionCents: 0,
  approvedCommissionCents: 0,
  paidCommissionCents: 0,
};

const workspace = (patch: {
  links?: Array<Record<string, unknown>>;
  connectAccountPresent?: boolean;
  payoutsEnabled?: boolean;
}): PartnerWorkspace => ({
  ok: true,
  partner: {
    id: 'p1',
    status: 'active',
    tier: 'standard',
    onboardingComplete: false,
    payoutsEnabled: patch.payoutsEnabled ?? false,
    connectAccountPresent: patch.connectAccountPresent ?? false,
  },
  codes: [ACTIVE_CODE],
  links: patch.links ?? [],
  commissions: [],
  payouts: [],
});

const overview = (data: PartnerWorkspace) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(['partner-workspace'], data);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/partner?section=overview']}>
        <PartnerPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('G-WEL — a new partner is guided, not dropped into accounting', () => {
  it('a freshly approved partner sees the first steps, with progress', () => {
    const page = text(overview(workspace({})));
    expect(page).toContain('Pierwsze kroki');
    expect(page).toContain('1 z 3 gotowe');
  });

  it('the open link step takes the partner to the link generator', () => {
    expect(overview(workspace({}))).toContain('href="/partner?section=generator"');
  });

  it('while Gellatti prepares the payout account there is nothing to click, and the rest works', () => {
    const html = overview(workspace({}));
    expect(html).not.toContain('href="/partner?section=payouts"');
    expect(text(html)).toContain('Kody i linki działają już teraz');
  });

  it('an unfinished Connect account sends the partner to Wypłaty', () => {
    expect(overview(workspace({ connectAccountPresent: true }))).toContain(
      'href="/partner?section=payouts"',
    );
  });

  it('once everything is done the guide steps aside', () => {
    const done = workspace({
      links: [{ id: 'l1', status: 'ACTIVE', linkSlug: 'lato-lody', clickCount: 0 }],
      connectAccountPresent: true,
      payoutsEnabled: true,
    });
    expect(text(overview(done))).not.toContain('Pierwsze kroki');
  });
});
