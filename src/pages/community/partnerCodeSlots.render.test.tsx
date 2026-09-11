/**
 * D-CODE-05 — archived codes (aliases) never count toward the 3 displayed slots.
 *
 * The database half was proven live (CS3: 3 current codes plus any number of
 * aliases still consume exactly 3 slots). This renders what the partner
 * actually reads — the Overview's "Aktywne kody" tile and the Codes section's
 * limit — with aliases and a blocked code present.
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

const code = (id: string, status: PartnerCodeAnalytics['status']): PartnerCodeAnalytics => ({
  id,
  code: `KOD${id.toUpperCase()}1`,
  slug: `kod-${id}`,
  label: null,
  status,
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
});

const workspace = (codes: PartnerCodeAnalytics[]): PartnerWorkspace => ({
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
  codes,
  links: [],
  commissions: [],
  payouts: [],
});

const render = (section: 'overview' | 'codes', codes: PartnerCodeAnalytics[]) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(['partner-workspace'], workspace(codes));
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/partner?section=${section}`]}>
        <PartnerPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

/**
 * The opening tag of the button labelled `label`. Checked for the `disabled`
 * ATTRIBUTE — the class list always carries `disabled:` variants, so a plain
 * substring match would pass for an enabled button.
 */
const buttonTag = (html: string, label: string): string => {
  const at = html.indexOf(`>${label}<`);
  return at < 0 ? '' : html.slice(html.lastIndexOf('<button', at), at + 1);
};

const DISABLED = /\sdisabled=""/;

const TWO_CURRENT = [
  code('a', 'active'),
  code('b', 'active'),
  code('c', 'retired'),
  code('d', 'retired'),
  code('e', 'blocked'),
];
const THREE_CURRENT = [
  code('a', 'active'),
  code('b', 'active'),
  code('f', 'active'),
  code('c', 'retired'),
  code('d', 'retired'),
];

describe('D-CODE-05 — aliases never count toward the 3 displayed slots', () => {
  it('the Overview counts only current codes: 2 current + 2 aliases + 1 blocked reads 2 / 3', () => {
    expect(text(render('overview', TWO_CURRENT))).toContain('Aktywne kody 2 / 3');
  });

  it('with a slot free, the Codes section still offers a new code', () => {
    const html = render('codes', TWO_CURRENT);
    expect(buttonTag(html, 'Utwórz kod')).not.toBe('');
    expect(buttonTag(html, 'Utwórz kod')).not.toMatch(DISABLED);
    expect(text(html)).not.toContain('Limit 3 aktywnych kodów osiągnięty');
  });

  it('3 current codes fill the slots, however many aliases exist', () => {
    expect(text(render('overview', THREE_CURRENT))).toContain('Aktywne kody 3 / 3');
    const html = render('codes', THREE_CURRENT);
    expect(text(html)).toContain('Limit 3 aktywnych kodów osiągnięty');
    expect(buttonTag(html, 'Utwórz kod')).toMatch(DISABLED);
  });

  it('aliases stay listed — counted out of the slots, not hidden', () => {
    const listed = text(render('codes', TWO_CURRENT));
    for (const item of TWO_CURRENT) expect(listed).toContain(item.code);
  });
});
