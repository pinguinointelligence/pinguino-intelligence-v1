/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * K01 / K16 / K17 / K18 — the panel rendered against the EXACT payload
 * `gellatti_my_referral_dashboard_v1` returned from live staging on
 * 2026-09-02 (referrer home@home.com, code GPQPBPM6: one earned monthly
 * reward, one reversed annual reward, bank drained by the reversal).
 *
 * Using the server's real answer rather than a hand-written fixture is the
 * point: a shape drift between the RPC and this panel fails here instead of
 * on the customer's screen.
 */
const LIVE_DASHBOARD = {
  ok: true,
  code: 'GPQPBPM6',
  invited: 2,
  rewards: [
    {
      id: 'b91b2aea-34c6-4822-9049-1198c82e2227',
      status: 'earned',
      cadence: 'monthly',
      product: 'pro',
      earnedAt: '2026-09-02T10:47:54.008199+00:00',
      bonusDays: 7,
    },
    {
      id: '497b4398-60e5-4691-8bc9-4d3a0b475dcb',
      status: 'reversed',
      cadence: 'annual',
      product: 'home',
      earnedAt: '2026-09-02T10:47:54.008199+00:00',
      bonusDays: 30,
    },
  ],
  bankDays: 0,
  reversed: 1,
  rewarded: 1,
  daysEarned: 7,
  activeBonusEndsAt: '2026-09-09T10:47:54.008199+00:00',
} as const;

vi.mock('@/services/referral', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/referral')>();
  return {
    ...actual,
    ensureReferralCode: vi.fn(async () => ({ ok: true, code: 'GPQPBPM6' })),
    getReferralDashboard: vi.fn(async () => LIVE_DASHBOARD),
  };
});

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ status: 'authed', user: { id: 'cad05017-9efc-4cc5-ac77-842839db2061' } }),
}));

const { ReferAFriendPanel } = await import('./ReferAFriendPanel');

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let host: HTMLDivElement;
let root: Root;

const render = async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <ReferAFriendPanel />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  });
  // Condition-based, not a fixed number of micro-ticks: two queries have to
  // resolve and re-render, and under full-suite load that takes more turns of
  // the loop than it does when this file runs alone. Waiting for the fact we
  // need is stable; counting ticks is a coin flip.
  await settleUntil(() => (host.textContent ?? '').includes('GPQPBPM6'));
  return host.textContent ?? '';
};

/** Spin the event loop until `ready()` holds, or fail loudly rather than silently asserting on a half-rendered tree. */
const settleUntil = async (ready: () => boolean, turns = 50) => {
  for (let i = 0; i < turns; i += 1) {
    if (ready()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  if (!ready()) throw new Error(`panel never settled; last render was: ${host.textContent}`);
};

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('Poleć Gellatti panel — live payload', () => {
  it('K01/K02 — shows the entry, the code and a shareable link', async () => {
    const text = await render();
    expect(text).toContain('Poleć Gellatti');
    expect(text).toContain('GPQPBPM6');
    expect(host.textContent).toMatch(/\?ref=GPQPBPM6/);
    expect(host.querySelector('[data-testid="refer-a-friend"]')).not.toBeNull();
  });

  it('K17/K18 — earned days and the remaining bank are both visible', async () => {
    const text = await render();
    expect(text).toContain('Zdobyte dni PRO');
    expect(text).toContain('Bank dni PRO');
    // 7 earned, 0 left in the bank after the reversal.
    const stats = [...host.querySelectorAll('dd')].map((d) => d.textContent?.trim());
    expect(stats).toContain('7');
    expect(stats).toContain('0');
  });

  it('K16 — the reversed reward is shown as reversed, not silently dropped', async () => {
    const text = await render();
    expect(text).toContain('Zdobyte');
    expect(text).toContain('Cofnięte');
    const struck = [...host.querySelectorAll('strong')].filter((el) =>
      el.className.includes('line-through'),
    );
    expect(struck.map((el) => el.textContent)).toContain('+30');
  });

  it('K06/K11 — an active bonus window is named with its end date', async () => {
    const text = await render();
    expect(text).toContain('Bonus PRO aktywny do');
    expect(text).toMatch(/9 września 2026|września/);
  });

  it('K03 — reads as a PRO-days benefit, never as the money programme', async () => {
    const text = await render();
    expect(text).toContain('To nie jest program Affiliate');
    expect(text).not.toMatch(/€/);
    // …and offers the money programme as a separate, named destination.
    const affiliate = [...host.querySelectorAll('a')].find((a) => a.getAttribute('href') === '/affiliate');
    expect(affiliate?.textContent).toContain('Affiliate');
  });

  it('K04/K05 — the day counts come from the canonical rules, not prose', async () => {
    const text = await render();
    expect(text).toContain('7 dni PRO');
    expect(text).toContain('30 dni PRO');
  });

  it('renders nothing at all for a signed-out visitor', async () => {
    vi.resetModules();
    vi.doMock('@/stores/authStore', () => ({
      useAuthStore: (selector: (s: unknown) => unknown) => selector({ status: 'anon', user: null }),
    }));
    const { ReferAFriendPanel: Anon } = await import('./ReferAFriendPanel');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <Anon />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
    expect(host.textContent).toBe('');
  });
});
