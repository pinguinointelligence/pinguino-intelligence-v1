/** @vitest-environment jsdom */
/**
 * K16 — a reversed referral reward stays visible, struck through.
 *
 * The reversal itself is pinned in `referralWebhookWiring.test.ts`, and
 * `referralPanelContract.test.ts` pins where the panel reads from. Neither
 * renders a row, so nothing proved what the referrer actually SEES after a
 * refund. A reward that silently disappears reads as a bug to the person who
 * earned it, and one still shown as earned promises days that are gone.
 *
 * Renders the real ReferralPanel from a seeded dashboard: one earned reward and
 * one reversed reward.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { referralCopyPl as c } from '@/copy/referral';
import type { ReferralDashboard } from '@/services/referral';
import { ReferralPanel } from './ReferralPanel';

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (state: { user: { id: string } | null }) => unknown) =>
    select({ user: { id: 'referrer-1' } }),
}));

const DASHBOARD: ReferralDashboard = {
  ok: true,
  code: 'GVLN474V',
  invited: 2,
  rewarded: 1,
  reversed: 1,
  daysEarned: 7,
  bankDays: 0,
  activeBonusEndsAt: null,
  rewards: [
    {
      id: 'reward-earned',
      product: 'home',
      cadence: 'monthly',
      bonusDays: 7,
      status: 'earned',
      earnedAt: '2026-09-05T10:00:00.000Z',
    },
    {
      id: 'reward-reversed',
      product: 'pro',
      cadence: 'annual',
      bonusDays: 30,
      status: 'reversed',
      earnedAt: '2026-09-03T10:00:00.000Z',
    },
  ],
};

const render = (dashboard: ReferralDashboard) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(['referral', 'dashboard'], dashboard);
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/account?section=referral']}>
        <ReferralPanel />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return host;
};

const rewardRows = (host: HTMLElement) =>
  [...host.querySelectorAll('li')].filter((li) => /\+\d+/.test(li.textContent ?? ''));

/** The span that carries the day count, e.g. "+30". */
const daysOf = (row: Element) =>
  [...row.querySelectorAll('span')].find((span) => /^\+\d+$/.test(span.textContent ?? ''));

describe('K16 — a reversed referral reward', () => {
  it('stays in the list next to the earned one', () => {
    const rows = rewardRows(render(DASHBOARD));
    expect(rows).toHaveLength(2);
  });

  it('reads Cofnięte, with its days struck through and dimmed', () => {
    const reversed = rewardRows(render(DASHBOARD)).find((row) =>
      row.textContent?.includes(c.rewardStatus.reversed),
    );
    expect(reversed).toBeDefined();
    expect(reversed!.textContent).not.toContain(c.rewardStatus.earned);
    const days = daysOf(reversed!);
    expect(days?.textContent).toBe('+30');
    expect(days?.className).toContain('line-through');
    expect(days?.className).toContain('opacity-55');
  });

  it('leaves an earned reward reading Zdobyte, not struck', () => {
    const earned = rewardRows(render(DASHBOARD)).find((row) =>
      row.textContent?.includes(c.rewardStatus.earned),
    );
    expect(earned).toBeDefined();
    const days = daysOf(earned!);
    expect(days?.textContent).toBe('+7');
    expect(days?.className).not.toContain('line-through');
  });

  it('names product and cadence as copy, never as raw contract values', () => {
    const [earned, reversed] = rewardRows(render(DASHBOARD));
    expect(earned!.textContent).toContain(`${c.product.home} · ${c.product.monthly}`);
    expect(reversed!.textContent).toContain(`${c.product.pro} · ${c.product.annual}`);
    for (const raw of ['reversed', 'earned', 'annual', 'monthly']) {
      expect(earned!.textContent).not.toContain(raw);
      expect(reversed!.textContent).not.toContain(raw);
    }
  });

  it('shows the empty line, not a blank list, when there are no rewards', () => {
    const host = render({ ...DASHBOARD, rewarded: 0, reversed: 0, daysEarned: 0, rewards: [] });
    expect(rewardRows(host)).toHaveLength(0);
    expect(host.querySelector('[data-testid="referral-empty"]')?.textContent).toBe(c.stats.empty);
  });
});
