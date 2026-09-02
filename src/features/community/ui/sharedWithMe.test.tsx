// @vitest-environment jsdom
/**
 * „Udostępnione mi" — the whole surface, rendered (§12, §13).
 *
 * The live database tests proved the RULES. This proves the SCREEN: that both
 * views exist, that every state the spec names is actually shown to a user,
 * and that the two privacy asymmetries hold in the markup —
 *   * the sent view shows counts, never who opened a link;
 *   * removing a received recipe is a local hide, and the component never
 *     asks the service to delete anything.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const listReceivedShares = vi.fn();
const listSentShares = vi.fn();
const removeReceivedShare = vi.fn<(shareLinkId: string) => Promise<void>>();
const revokeShareLink = vi.fn<(shareLinkId: string) => Promise<void>>();

vi.mock('@/services/community', () => ({
  listReceivedShares: () => listReceivedShares(),
  listSentShares: () => listSentShares(),
  removeReceivedShare: (id: string) => removeReceivedShare(id),
  revokeShareLink: (id: string) => revokeShareLink(id),
}));

const { SharedWithMePanel } = await import('./SharedWithMePanel');

const RECEIVED = [
  {
    share_link_id: 'share-demo',
    title: 'Pistachio Salted Caramel',
    version_number: 1,
    received_at: '2026-08-20T10:00:00Z',
    last_opened_at: '2026-08-21T10:00:00Z',
    status: 'active' as const,
    created_by: 'Marysia',
    created_by_handle: 'marysia',
    shared_by: 'Jan',
    shared_by_is_creator: false,
    entitlement: 'shared_recipe_demo' as const,
    recipe: { demo_safe: true as const, line_count: 2, items: [] },
  },
  {
    share_link_id: 'share-full',
    title: 'Truskawka',
    version_number: 3,
    received_at: '2026-08-19T10:00:00Z',
    last_opened_at: '2026-08-19T10:00:00Z',
    status: 'active' as const,
    created_by: 'Marysia',
    shared_by: 'Marysia',
    shared_by_is_creator: true,
    entitlement: 'full' as const,
    recipe: { demo_safe: true as const, line_count: 4, items: [] },
  },
];

const SENT = [
  {
    share_link_id: 'out-active',
    title: 'Pistachio Salted Caramel',
    recipe_id: 'recipe-1',
    version_number: 1,
    created_at: '2026-08-20T10:00:00Z',
    status: 'active' as const,
    opens: 7,
    unique_opens: 3,
    partner_attribution: true,
  },
  {
    share_link_id: 'out-revoked',
    title: 'Wycofana',
    recipe_id: 'recipe-2',
    version_number: 2,
    created_at: '2026-08-18T10:00:00Z',
    status: 'revoked' as const,
    opens: 1,
    unique_opens: 1,
    partner_attribution: false,
  },
];

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

const render = async () => {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <SharedWithMePanel />
      </MemoryRouter>,
    );
  });
};

const click = async (label: string) => {
  const button = [...container.querySelectorAll('button')].find(
    (node) => node.textContent?.trim() === label,
  );
  if (!button) throw new Error(`no button "${label}" — have: ${[...container.querySelectorAll('button')].map((n) => n.textContent).join(' | ')}`);
  await act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

beforeEach(() => {
  // Matches the repo's other jsdom runtime tests — keeps act() quiet and its
  // warnings meaningful rather than constant noise.
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  listReceivedShares.mockResolvedValue(RECEIVED);
  listSentShares.mockResolvedValue(SENT);
  removeReceivedShare.mockClear();
  removeReceivedShare.mockResolvedValue(undefined);
  revokeShareLink.mockClear();
  revokeShareLink.mockResolvedValue(undefined);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('Otrzymane', () => {
  it('shows both views as switchable', async () => {
    await render();
    const tabs = [...container.querySelectorAll('button')].map((node) => node.textContent);
    expect(tabs).toContain('Otrzymane');
    expect(tabs).toContain('Wysłane przeze mnie');
  });

  it('shows Created by, and Shared by ONLY when it differs', async () => {
    await render();
    const text = container.textContent ?? '';
    expect(text).toContain('Pistachio Salted Caramel');
    expect(text).toContain('Marysia');
    // Jan shared Marysia's recipe → both are named.
    expect(text).toContain('Udostępnione przez');
    expect(text).toContain('Jan');
    // Marysia shared her own → the row must not repeat the sharer byline.
    const truskawkaRow = [...container.querySelectorAll('li')].find((node) =>
      node.textContent?.includes('Truskawka'),
    );
    expect(truskawkaRow?.textContent).not.toContain('Udostępnione przez');
  });

  it('distinguishes the Demo state from the unlocked state', async () => {
    await render();
    const rows = [...container.querySelectorAll('li')];
    const demo = rows.find((node) => node.textContent?.includes('Pistachio'));
    const full = rows.find((node) => node.textContent?.includes('Truskawka'));
    expect(demo?.textContent).toContain('Podgląd Gellatti');
    expect(full?.textContent).toContain('Odblokowane');
  });

  it('links the creator handle when the creator is public', async () => {
    await render();
    const links = [...container.querySelectorAll('a')].map((node) => node.getAttribute('href'));
    expect(links).toContain('/@marysia');
  });

  it('reopening goes through the token-free received route', async () => {
    await render();
    const links = [...container.querySelectorAll('a')].map((node) => node.getAttribute('href'));
    expect(links).toContain('/received/share-demo');
    // never a /share/<id> link: a share id is not a token (§12)
    expect(links.some((href) => href?.startsWith('/share/'))).toBe(false);
  });

  it('„Usuń z otrzymanych" hides the row locally and deletes nothing', async () => {
    await render();
    expect(container.textContent).toContain('Pistachio Salted Caramel');
    await click('Usuń z otrzymanych');
    expect(removeReceivedShare).toHaveBeenCalledWith('share-demo');
    expect(container.textContent).not.toContain('Pistachio Salted Caramel');
    // the OTHER received recipe is untouched, and nothing was revoked
    expect(container.textContent).toContain('Truskawka');
    expect(revokeShareLink).not.toHaveBeenCalled();
  });
});

describe('Wysłane przeze mnie', () => {
  const openSent = async () => {
    await render();
    await click('Wysłane przeze mnie');
  };

  it('shows aggregate opens and the active/revoked state', async () => {
    await openSent();
    const text = container.textContent ?? '';
    expect(text).toContain('3');
    expect(text).toContain('Unikalnych otwarć');
    expect(text).toContain('Aktywny');
    expect(text).toContain('Unieważniony');
  });

  it('marks a Partner-attributed link', async () => {
    await openSent();
    const rows = [...container.querySelectorAll('li')];
    const attributed = rows.find((node) => node.textContent?.includes('Pistachio'));
    const plain = rows.find((node) => node.textContent?.includes('Wycofana'));
    expect(attributed?.textContent).toContain('Gellatti Partner');
    expect(plain?.textContent).not.toContain('Gellatti Partner');
  });

  it('NEVER names a recipient — a sharer sees counts, not people (§13, §81)', async () => {
    await openSent();
    const text = container.textContent ?? '';
    for (const name of ['Katarzyna', 'Jan', '@example', 'recipient']) {
      expect(text).not.toContain(name);
    }
  });

  it('offers revoke on an active link only, and revokes through the service', async () => {
    await openSent();
    const revokeButtons = [...container.querySelectorAll('button')].filter(
      (node) => node.textContent?.trim() === 'Unieważnij link',
    );
    expect(revokeButtons).toHaveLength(1);
    await click('Unieważnij link');
    expect(revokeShareLink).toHaveBeenCalledWith('out-active');
    expect(container.textContent).toContain('Unieważniony');
    // revoking an outgoing share must never remove anything from the library
    expect(removeReceivedShare).not.toHaveBeenCalled();
  });
});

describe('empty states are honest', () => {
  it('says nobody has shared with you, rather than faking activity', async () => {
    listReceivedShares.mockResolvedValue([]);
    listSentShares.mockResolvedValue([]);
    await render();
    expect(container.textContent).toContain('Nie masz jeszcze udostępnionych receptur.');
    await click('Wysłane przeze mnie');
    expect(container.textContent).toContain('Nie masz jeszcze wysłanych receptur.');
  });
});
