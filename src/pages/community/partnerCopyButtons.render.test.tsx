/**
 * H-DASH-06 — every current code and every campaign link can be copied in one
 * click, and a current code shows its public link. An archived or blocked code
 * offers nothing to copy: it no longer attributes new people.
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

/* GAP 1 (owner 2026-09-19): /partner no longer reads the protected workspace
   RPC without a session — it is revoked from anon, and reading it anyway is
   what showed a signed-out visitor a failure instead of the application.
   These contracts describe a PARTNER'S OWN WORKSPACE, which exists only for a
   signed-in Partner, so they present one. Nothing else about them changed.

   The store is MOCKED rather than set with `setState`: these render through
   `renderToStaticMarkup`, and on the server path zustand serves
   `getInitialState()`, so a mutation made inside a test would never be seen. */
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: { status: string; user: { id: string } }) => unknown) =>
    selector({ status: 'authed', user: { id: 'partner-under-test' } }),
}));

const code = (id: string, status: PartnerCodeAnalytics['status']): PartnerCodeAnalytics => ({
  id,
  code: `KASIA${id.toUpperCase()}`,
  slug: `kasia-${id}`,
  label: null,
  status,
  createdAt: '2026-09-01T10:00:00.000Z',
  clickCount: 0,
  uniqueVisitors: 0,
  signups: 0,
  paidCustomers: 0,
  grossAttributedRevenueCents: 0,
  refundCommissionCents: 0,
  pendingCommissionCents: 0,
  approvedCommissionCents: 0,
  paidCommissionCents: 0,
});

const link = (id: string, codeId: string, slug: string) => ({
  id,
  label: `Kampania ${slug}`,
  destinationType: 'PRICING',
  destinationPath: '/subscription',
  partnerCodeId: codeId,
  linkSlug: slug,
  status: 'ACTIVE',
  clickCount: 0,
  uniqueVisitors: 0,
  signups: 0,
  paidCustomers: 0,
});

const workspace: PartnerWorkspace = {
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
    updatedAt: '2026-09-01T10:00:00.000Z',
  },
  codes: [code('a', 'active'), code('b', 'active'), code('c', 'retired'), code('d', 'blocked')],
  links: [link('l1', 'a', 'lato'), link('l2', 'b', 'zima')],
  commissions: [],
  payouts: [],
};

const render = (section: 'codes' | 'content') => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(['partner-workspace'], workspace);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/partner?section=${section}`]}>
        <PartnerPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

/** How many buttons read exactly `label`. */
const buttons = (html: string, label: string) => html.split(`>${label}</button>`).length - 1;

describe('H-DASH-06 — one click to copy a code or a link', () => {
  it('each current code offers its code and its public link to copy', () => {
    const html = render('codes');
    expect(buttons(html, 'Kopiuj kod')).toBe(2);
    expect(buttons(html, 'Kopiuj link')).toBe(2);
    expect(html).toContain('/kasia/kasia-a');
    expect(html).toContain('/kasia/kasia-b');
  });

  it('an archived or blocked code offers nothing to copy', () => {
    const html = render('codes');
    expect(html).not.toContain('/kasia/kasia-c');
    expect(html).not.toContain('/kasia/kasia-d');
  });

  it('every campaign link can be copied', () => {
    expect(buttons(render('content'), 'Kopiuj link')).toBe(2);
  });
});
