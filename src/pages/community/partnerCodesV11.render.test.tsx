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
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: { status: string; user: { id: string } }) => unknown) =>
    selector({ status: 'authed', user: { id: 'partner-under-test' } }),
}));

/**
 * „Moje kody” — DESIGN Version 11 (owner 2026-09-19).
 *
 * The section used to be a twelve-column table pinned to `min-w-[980px]` inside
 * a sideways scroller. It did not fit any phone and barely fit a tablet, so the
 * numbers a partner checks most often lived behind a horizontal drag.
 *
 * V11 replaces it with one card per code. The risk in that change is silent
 * loss: a column quietly dropped because it no longer had a header to live
 * under. These contracts exist to make that impossible — every figure the table
 * carried is asserted on the card.
 */
const code = (over: Partial<PartnerCodeAnalytics> = {}) =>
  ({
    id: over.code ?? 'ania',
    code: 'ania',
    slug: 'ania',
    label: 'Instagram',
    status: 'active',
    clickCount: 1240,
    uniqueVisitors: 910,
    signups: 48,
    paidCustomers: 22,
    activeSubscriptions: 17,
    grossAttributedRevenueCents: 129900,
    refundCommissionCents: 900,
    pendingCommissionCents: 4610,
    approvedCommissionCents: 8230,
    paidCommissionCents: 21400,
    ...over,
  }) as PartnerCodeAnalytics;

const workspace = (codes: readonly PartnerCodeAnalytics[]) =>
  ({
    ok: true,
    partner: { status: 'active', tier: 'standard' },
    profile: { slug: 'ania', displayName: 'Ania', moderationStatus: 'approved' },
    codes,
    commissions: [],
    payouts: [],
    contentLinks: [],
    links: [],
  }) as unknown as PartnerWorkspace;

const render = (data: PartnerWorkspace) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(['partner-workspace'], data);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/partner?section=codes']}>
        <PartnerPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const flat = (value: string) => value.replace(/\s+/g, ' ');
const text = (html: string) => flat(html.replace(/<[^>]+>/g, ' '));

describe('a code is readable without dragging the page sideways', () => {
  it('no longer pins the section to a 980 px table', () => {
    const html = render(workspace([code()]));
    expect(html).not.toContain('min-w-[980px]');
    expect(html).not.toContain('<table');
  });

  it('gives each code its own card', () => {
    const html = render(workspace([code(), code({ code: 'ania-yt', slug: 'ania-yt' })]));
    expect(html).toContain('data-testid="partner-code-ania"');
    expect(html).toContain('data-testid="partner-code-ania-yt"');
  });
});

describe('nothing the table carried was dropped to make it fit', () => {
  const html = render(workspace([code()]));
  const body = text(html);

  it('keeps the whole funnel', () => {
    for (const label of ['Kliknięcia', 'Unikalni', 'Rejestracje', 'Klienci']) {
      expect(body).toContain(label);
    }
    expect(body).toContain('1240');
    expect(body).toContain('910');
    expect(body).toContain('48');
    expect(body).toContain('22');
  });

  it('keeps the whole ledger, including refunds and the three commission states', () => {
    for (const label of [
      'Przychód brutto',
      'Zwroty',
      'Prowizja oczekująca',
      'Zatwierdzona',
      'Wypłacona',
    ]) {
      expect(body).toContain(label);
    }
  });

  it('keeps the code, its label, its status and its public path', () => {
    expect(body).toContain('ania');
    expect(body).toContain('Instagram');
    expect(body).toContain('/ania/ania');
  });

  it('still offers archiving on a current code', () => {
    expect(body).toContain('Archiwizuj');
  });
});

describe('an absent figure is not invented', () => {
  it('shows active subscriptions only when the payload carries them', () => {
    const withCount = text(render(workspace([code({ activeSubscriptions: 17 })])));
    expect(withCount).toContain('Aktywne subskrypcje');

    const without = text(
      render(workspace([code({ activeSubscriptions: null as unknown as number })])),
    );
    // Absent for every code means the column is not offered at all — it is not
    // rendered as a zero the partner could mistake for a real reading.
    expect(without).not.toContain('Aktywne subskrypcje 0');
  });

  it('does not offer archiving on a code that is already archived', () => {
    const archived = render(workspace([code({ status: 'retired' })]));
    expect(text(archived)).not.toContain('Archiwizuj');
  });
});
