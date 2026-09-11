/**
 * R-DES-02 — the Partner area never prints a raw value.
 *
 * `partnerVisibleData.test.ts` and `partnerAccountDisplay.test.ts` read the
 * page SOURCE. This renders every section with a workspace holding every value
 * the database allows — plus a raw Stripe invoice id and a provider failure
 * code the RPC also returns — and reads the text a partner actually sees: no
 * enum value, no Stripe id, no provider code, no `undefined` / `null` / `NaN`.
 * Each section must also show the copy for those values, so an empty render
 * cannot pass.
 *
 * H-DASH-03 rides along: every tier reads as its copy in Settings.
 */
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import {
  COMMISSION_CADENCE_COPY,
  COMMISSION_PRODUCT_COPY,
  COMMISSION_STATUS_COPY,
  PAYOUT_STATUS_COPY,
} from '@/features/affiliate/commissionDisplay';
import {
  CONTENT_LINK_STATUS_COPY,
  PARTNER_CODE_STATUS_COPY,
} from '@/features/affiliate/codeLinkDisplay';
import {
  PARTNER_STATUS_COPY,
  PARTNER_TIER_COPY,
  PROFILE_MODERATION_COPY,
} from '@/features/affiliate/partnerAccountDisplay';
import type { PartnerCodeAnalytics, PartnerWorkspace } from '@/services/partner';
import { PartnerPage } from './PartnerPage';

vi.mock('@/components/shared/DestinationSurface', () => ({
  DestinationSurface: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const keys = <T extends object>(map: T) => Object.keys(map) as Array<keyof T & string>;

const STRIPE_INVOICE = 'in_1RawStripeInvoice';
const PROVIDER_FAILURE = 'insufficient_funds';
const DESTINATION_TYPES = [
  'PRICING',
  'COMMUNITY_RECIPE',
  'SHARED_RECIPE',
  'PUBLIC_PAGE',
  'PUBLIC_PROFILE',
];

const codes: PartnerCodeAnalytics[] = keys(PARTNER_CODE_STATUS_COPY).map((status, index) => ({
  id: `code-${index}`,
  code: `KASIA${index}`,
  slug: `kasia-${index}`,
  label: null,
  status,
  createdAt: '2026-09-01T10:00:00.000Z',
  clickCount: 3,
  uniqueVisitors: 2,
  signups: 1,
  paidCustomers: 1,
  activeSubscriptions: 1,
  grossAttributedRevenueCents: 4900,
  refundCommissionCents: 0,
  pendingCommissionCents: 900,
  approvedCommissionCents: 500,
  paidCommissionCents: 250,
}));

const links = keys(CONTENT_LINK_STATUS_COPY).map((status, index) => ({
  id: `link-${index}`,
  label: `Kampania ${index + 1}`,
  destinationType: DESTINATION_TYPES[index % DESTINATION_TYPES.length],
  destinationPath: '/subscription',
  partnerCodeId: 'code-0',
  linkSlug: `kampania-${index}`,
  status,
  clickCount: 4,
  uniqueVisitors: 3,
  signups: 1,
  paidCustomers: 1,
  activeSubscriptions: 1,
  createdAt: '2026-09-01T10:00:00.000Z',
}));

/** Every status, and every product and cadence at least once. */
const products = keys(COMMISSION_PRODUCT_COPY);
const cadences = keys(COMMISSION_CADENCE_COPY);
const commissions = keys(COMMISSION_STATUS_COPY).map((status, index) => ({
  id: `commission-${index}`,
  product: products[index % products.length],
  cadence: cadences[index % cadences.length],
  amountCents: status === 'reversed' ? -900 : 900,
  currency: 'eur',
  status,
  earnedAt: '2026-09-02T10:00:00.000Z',
  eligibleAt: '2026-11-02T10:00:00.000Z',
  livemode: false,
  invoiceId: STRIPE_INVOICE,
}));

const payouts = keys(PAYOUT_STATUS_COPY).map((status, index) => ({
  id: `payout-${index}`,
  status,
  amountCents: 2500,
  currency: 'eur',
  carryForwardCents: index === 0 ? -300 : 0,
  paidAt: status === 'paid' ? '2026-09-05T10:00:00.000Z' : null,
  createdAt: '2026-09-04T10:00:00.000Z',
  failureReason: PROVIDER_FAILURE,
  invoiceId: STRIPE_INVOICE,
}));

const workspace = (tier = 'standard', moderationStatus = 'APPROVED'): PartnerWorkspace => ({
  ok: true,
  partner: {
    id: 'partner-1',
    status: 'active',
    tier,
    onboardingComplete: true,
    payoutsEnabled: true,
    connectAccountPresent: true,
  },
  profile: {
    slug: 'kasia',
    displayName: 'Kasia Lody',
    logoPath: null,
    shortDescription: 'Lody rzemieślnicze',
    websiteUrl: null,
    socialLinks: {},
    defaultDestinationPath: '/',
    moderationStatus,
    updatedAt: '2026-09-01T10:00:00.000Z',
  },
  codes,
  links,
  commissions,
  payouts,
});

type Section =
  | 'overview'
  | 'codes'
  | 'generator'
  | 'content'
  | 'earnings'
  | 'payouts'
  | 'profile'
  | 'settings';

const visibleText = (section: Section, data: PartnerWorkspace = workspace()) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(['partner-workspace'], data);
  const html = renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/partner?section=${section}`]}>
        <PartnerPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
};

const RAW_VALUES = [
  ...keys(COMMISSION_STATUS_COPY),
  ...keys(COMMISSION_PRODUCT_COPY),
  ...keys(COMMISSION_CADENCE_COPY),
  ...keys(PAYOUT_STATUS_COPY),
  ...keys(PARTNER_CODE_STATUS_COPY),
  ...keys(CONTENT_LINK_STATUS_COPY),
  ...keys(PROFILE_MODERATION_COPY),
  ...keys(PARTNER_STATUS_COPY),
  ...keys(PARTNER_TIER_COPY),
  ...DESTINATION_TYPES,
  PROVIDER_FAILURE,
];

/** Everything raw a partner could read in `text`; empty when the page is clean. */
const leaks = (text: string): string[] => [
  ...RAW_VALUES.filter((value) => new RegExp(`(?<![\\w-])${value}(?![\\w-])`).test(text)),
  ...(text.match(/\b(?:in|acct|cus|pi|po|tr|ch|re|sub|evt)_[A-Za-z0-9]{6,}/g) ?? []),
  ...['undefined', 'null', 'NaN', '[object Object]', 'Invalid Date'].filter((word) =>
    text.includes(word),
  ),
];

const labels = (map: Readonly<Record<string, { label: string }>>) =>
  Object.values(map).map((copy) => copy.label);

/** What each section must show, so an empty or gated render cannot pass. */
const SHOWS: Record<Section, string[]> = {
  overview: ['Aktywne kody'],
  codes: ['KASIA0', ...labels(PARTNER_CODE_STATUS_COPY)],
  generator: ['Generuj bezpieczny link'],
  content: ['Kampania 1', ...labels(CONTENT_LINK_STATUS_COPY)],
  earnings: labels(COMMISSION_STATUS_COPY),
  payouts: labels(PAYOUT_STATUS_COPY),
  profile: [PROFILE_MODERATION_COPY.APPROVED.label],
  settings: [`Status ${PARTNER_STATUS_COPY.active.label}`],
};

describe('R-DES-02 — every Partner section reads as copy, never as a raw value', () => {
  for (const section of Object.keys(SHOWS) as Section[]) {
    it(`${section}: shows its copy and nothing raw`, () => {
      const text = visibleText(section);
      for (const expected of SHOWS[section]) expect(text).toContain(expected);
      expect(leaks(text)).toEqual([]);
    });
  }

  it('profile: every moderation state reads as copy', () => {
    for (const moderation of keys(PROFILE_MODERATION_COPY)) {
      const text = visibleText('profile', workspace('standard', moderation));
      expect(text).toContain(PROFILE_MODERATION_COPY[moderation].label);
      expect(leaks(text)).toEqual([]);
    }
  });

  it('the scan itself catches a raw value, a Stripe id and a provider code', () => {
    expect(leaks(`Status held · ${STRIPE_INVOICE} · ${PROVIDER_FAILURE} · undefined`)).toEqual([
      'held',
      PROVIDER_FAILURE,
      STRIPE_INVOICE,
      'undefined',
    ]);
  });
});

describe('H-DASH-03 — the tier reads as Standard / Gold / Elite', () => {
  for (const tier of keys(PARTNER_TIER_COPY)) {
    it(`${tier} → ${PARTNER_TIER_COPY[tier].label}`, () => {
      const text = visibleText('settings', workspace(tier));
      expect(text).toContain(`Tier ${PARTNER_TIER_COPY[tier].label}`);
      expect(leaks(text)).toEqual([]);
    });
  }
});
