/** @vitest-environment jsdom */
/**
 * I-ADM-05 — in the admin Partners panel a sensitive action asks first, asks
 * why, and only then calls the RPC, with the operator's own reason.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  setPartnerStatus: vi.fn(),
  setPartnerCodeStatus: vi.fn(),
  setPartnerLinkStatus: vi.fn(),
  setPartnerProfileStatus: vi.fn(),
  setAdminCommissionRule: vi.fn(),
  activatePartner: vi.fn(),
  provisionPartnerConnect: vi.fn(),
  addPartnerAdminNote: vi.fn(),
}));

const data = vi.hoisted(() => ({
  partners: [
    {
      id: 'p1',
      email: 'kasia@example.com',
      status: 'active',
      tier: 'standard',
      profile: {
        display_name: 'Kasia Lody',
        slug: 'kasia',
        moderation_status: 'APPROVED',
        logo_path: 'partner-logos/p1.png',
      },
      codes: [{ id: 'c1', code: 'KASIA1', status: 'active' }],
      links: [{ id: 'l1', link_slug: 'lato', status: 'ACTIVE' }],
      connectAccountId: null,
      payoutsEnabled: false,
      clicks: 0,
      attributions: 0,
      pendingCommission: 0,
    },
  ],
}));

vi.mock('@/services/adminControl', () => ({
  ...mocks,
  getAdminDirectory: vi.fn(async () => data.partners),
  getAdminInvites: vi.fn(async () => ({ partner: [] })),
  getAdminCommissionRules: vi.fn(async () => []),
  invitePartnerByEmail: vi.fn(),
  resendPartnerInvitation: vi.fn(),
}));

vi.mock('./AdminPartnerApplicationsPanel', () => ({ AdminPartnerApplicationsPanel: () => null }));

import { AdminPartnersSection } from './AdminPartnersSection';
import { REASON_REQUIRED } from './adminPartnerActionConfirm';

let host: HTMLDivElement;
let root: Root;

/**
 * Wait for `ready`, yielding real macrotasks: react-query hands results to React
 * on a timer, which microtask-only `act` ticks do not always reach.
 */
const waitFor = async (ready: () => boolean) => {
  for (let i = 0; i < 50 && !ready(); i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  if (!ready()) throw new Error('the partner list never rendered');
};

beforeEach(async () => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  for (const fn of Object.values(mocks)) fn.mockReset().mockResolvedValue(undefined);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <AdminPartnersSection />
      </QueryClientProvider>,
    );
  });
  await waitFor(() => buttons('Zawieś').length > 0);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const buttons = (text: string) =>
  Array.from(document.body.querySelectorAll('button')).filter(
    (button) => button.textContent?.trim() === text,
  );
const click = (element: Element | undefined) =>
  act(async () => {
    if (!element) throw new Error('nothing to click');
    (element as HTMLElement).click();
  });
const byTestId = (id: string) => document.body.querySelector(`[data-testid="${id}"]`);
const dialog = () => byTestId('admin-partner-action-confirm');
const reasonInput = () => byTestId('admin-partner-action-reason') as HTMLInputElement | null;
const confirm = () => click(byTestId('admin-partner-action-confirm-primary') ?? undefined);
const type = (input: HTMLInputElement | null | undefined, value: string) =>
  act(async () => {
    if (!input) throw new Error('no input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

describe('I-ADM-05 — sensitive admin actions ask first and ask why', () => {
  it('one click on Zawieś no longer suspends — it asks', async () => {
    await click(buttons('Zawieś')[0]);
    expect(mocks.setPartnerStatus).not.toHaveBeenCalled();
    expect(dialog()?.textContent).toContain('Zawiesić partnera Kasia Lody?');
  });

  it('no reason is prefilled, and a blank one is refused', async () => {
    await click(buttons('Zawieś')[0]);
    expect(reasonInput()?.value).toBe('');
    await confirm();
    expect(mocks.setPartnerStatus).not.toHaveBeenCalled();
    expect(dialog()?.textContent).toContain(REASON_REQUIRED);
  });

  it('with a written reason, the RPC gets exactly that reason', async () => {
    await click(buttons('Zawieś')[0]);
    await type(reasonInput(), 'Kod udostępniony na forum z rabatami');
    await confirm();
    expect(mocks.setPartnerStatus).toHaveBeenCalledWith(
      'p1',
      'suspended',
      'Kod udostępniony na forum z rabatami',
    );
    expect(dialog()).toBeNull();
  });

  it('Anuluj and Escape both cancel — neither confirms', async () => {
    await click(buttons('Zawieś')[0]);
    await type(reasonInput(), 'Sprawdzam');
    await click(byTestId('admin-partner-action-confirm-secondary') ?? undefined);
    expect(dialog()).toBeNull();

    await click(buttons('Zawieś')[0]);
    await type(reasonInput(), 'Sprawdzam');
    await act(async () => {
      reasonInput()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(dialog()).toBeNull();
    expect(mocks.setPartnerStatus).not.toHaveBeenCalled();
  });

  it('a code is disabled only after confirming, with the reason', async () => {
    await click(buttons('Wyłącz')[0]);
    expect(dialog()?.textContent).toContain('Wyłączyć kod KASIA1?');
    await type(reasonInput(), 'Wyciek kodu');
    await confirm();
    expect(mocks.setPartnerCodeStatus).toHaveBeenCalledWith('c1', 'DISABLE', 'Wyciek kodu');
  });

  it('a campaign link likewise', async () => {
    await click(buttons('Wyłącz')[1]);
    expect(dialog()?.textContent).toContain('Wyłączyć link lato?');
    await type(reasonInput(), 'Spam w komentarzach');
    await confirm();
    expect(mocks.setPartnerLinkStatus).toHaveBeenCalledWith('l1', 'DISABLE', 'Spam w komentarzach');
  });

  it('Connect provisioning asks, but needs no reason — the call takes none', async () => {
    await click(buttons('Przygotuj konto Connect')[0]);
    expect(reasonInput()).toBeNull();
    await confirm();
    expect(mocks.provisionPartnerConnect).toHaveBeenCalledWith('p1');
  });

  it('a new commission version asks, and records the reason', async () => {
    await click(buttons('Utwórz wersję')[0]);
    expect(mocks.setAdminCommissionRule).not.toHaveBeenCalled();
    expect(dialog()?.textContent).toContain('Utworzyć nową wersję zasad prowizji?');
    await type(reasonInput(), 'Nowy cennik PRO');
    await confirm();
    expect(mocks.setAdminCommissionRule).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'Nowy cennik PRO' }),
    );
  });

  it('activating an existing user asks for a reason too — it used to be prefilled', async () => {
    const form = Array.from(document.body.querySelectorAll('form')).find((element) =>
      element.textContent?.includes('Aktywuj istniejącego użytkownika'),
    )!;
    const [userId, displayName, slug] = Array.from(form.querySelectorAll('input'));
    await type(userId, 'u-1');
    await type(displayName, 'Nowy Partner');
    await type(slug, 'nowy-partner');
    await click(
      Array.from(form.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Aktywuj istniejącego użytkownika',
      ),
    );
    expect(mocks.activatePartner).not.toHaveBeenCalled();
    expect(dialog()?.textContent).toContain('Aktywować Nowy Partner jako Partnera?');
    await type(reasonInput(), 'Umowa podpisana 11.09');
    await confirm();
    expect(mocks.activatePartner).toHaveBeenCalledWith({
      userId: 'u-1',
      displayName: 'Nowy Partner',
      slug: 'nowy-partner',
      reason: 'Umowa podpisana 11.09',
    });
  });
});
