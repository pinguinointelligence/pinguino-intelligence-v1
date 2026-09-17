// @vitest-environment jsdom
/**
 * The picture a recipient sees on `/share/:token` and `/received/:shareLinkId`
 * (owner decision 2026-09-17): the customer's own photograph, otherwise the
 * delivered photograph of the SHARED VERSION's profile — never the viewer's
 * profile, never a library picture, whichever route and entitlement opened it.
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductCategory } from '@/engine';
import { BRANDED_PROFILE_IMAGE } from '@/features/community/domain/recipeImageAuthority';
import type { SharePreview } from '@/services/community';
import { useRecipeStore } from '@/stores/recipeStore';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  signedIn: false,
  resolveShare: vi.fn(),
  openShare: vi.fn(),
  openReceivedShare: vi.fn(),
}));

vi.mock('@/services/community', () => ({
  resolveShare: mocks.resolveShare,
  openShare: mocks.openShare,
  openReceivedShare: mocks.openReceivedShare,
}));
vi.mock('@/access/useAccess', () => ({
  useAccess: () => ({
    isSignedIn: mocks.signedIn,
    tier: mocks.signedIn ? 'pro' : 'demo',
  }),
}));
vi.mock('@/components/shared/DestinationSurface', () => ({
  DestinationSurface: ({ title, children }: { title: string; children?: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));
vi.mock('@/features/community/ui/UseRecipeActions', () => ({
  UseRecipeActions: () => <div data-testid="use-recipe-actions" />,
}));
vi.mock('@/features/community/ui/UnlockCta', () => ({
  UnlockCta: () => <div data-testid="unlock-cta" />,
}));

const { SharedRecipePage } = await import('./SharedRecipePage');

const preview = (
  category: ProductCategory,
  entitlement: SharePreview['entitlement'],
): SharePreview => ({
  ok: true,
  share_link_id: 'share-1',
  title: 'Receptura testowa',
  version_number: 2,
  entitlement,
  created_by: { display_name: 'Anna' },
  shared_by_is_creator: true,
  recipe: {
    demo_safe: true,
    category,
    line_count: 1,
    items: [{ name: 'Mleko' }],
  } as unknown as SharePreview['recipe'],
});

describe('shared recipe picture — own photo, otherwise the shared version profile', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.signedIn = false;
    mocks.resolveShare.mockReset();
    mocks.openShare.mockReset();
    mocks.openReceivedShare.mockReset();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  const open = async (path: string) => {
    await act(async () => {
      root.render(
        // Keyed: a MemoryRouter keeps its first location across re-renders.
        <MemoryRouter key={path} initialEntries={[path]}>
          <Routes>
            <Route path="/share/:token" element={<SharedRecipePage />} />
            <Route path="/received/:shareLinkId" element={<SharedRecipePage />} />
          </Routes>
        </MemoryRouter>,
      );
    });
    await act(async () => {
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
    });
    return host.querySelector<HTMLImageElement>('[data-testid="shared-recipe-image"]');
  };

  const CASES: ReadonlyArray<readonly [ProductCategory, keyof typeof BRANDED_PROFILE_IMAGE]> = [
    ['milk_gelato', 'gelato'],
    ['chocolate_gelato', 'gelato'],
    ['sorbet', 'sorbet'],
    ['vegan_gelato', 'vegan'],
    ['protein_gelato', 'protein'],
  ];

  it('SHARE-IMG-01 logged-out token open: each profile shows its delivered photograph, square', async () => {
    for (const [category, expected] of CASES) {
      mocks.resolveShare.mockResolvedValueOnce(preview(category, 'shared_recipe_demo'));
      const image = await open(`/share/token-${category}`);
      expect(image, category).not.toBeNull();
      expect(image!.getAttribute('src'), category).toBe(BRANDED_PROFILE_IMAGE[expected]);
      expect(image!.dataset.imageOrigin).toBe('branded_profile');
      expect(image!.className).toContain('aspect-square');
      expect(image!.className).toContain('object-cover');
    }
  });

  it('SHARE-IMG-02 signed-in token open and /received reopen show the same version photograph', async () => {
    mocks.signedIn = true;
    mocks.openShare.mockResolvedValue(preview('vegan_gelato', 'full'));
    mocks.openReceivedShare.mockResolvedValue(preview('vegan_gelato', 'full'));

    const viaToken = await open('/share/token-1');
    expect(viaToken!.getAttribute('src')).toBe(BRANDED_PROFILE_IMAGE.vegan);
    expect(mocks.openShare).toHaveBeenCalledWith('token-1');

    const viaReceived = await open('/received/share-1');
    expect(viaReceived!.getAttribute('src')).toBe(BRANDED_PROFILE_IMAGE.vegan);
    expect(mocks.openReceivedShare).toHaveBeenCalledWith('share-1');
  });

  it('SHARE-IMG-03 the shared version profile wins over the viewer’s own working profile', async () => {
    useRecipeStore.setState({ category: 'protein_gelato' });
    mocks.signedIn = true;
    mocks.openShare.mockResolvedValue(preview('sorbet', 'full'));
    const image = await open('/share/token-2');
    expect(useRecipeStore.getState().category).toBe('protein_gelato');
    expect(image!.getAttribute('src')).toBe(BRANDED_PROFILE_IMAGE.sorbet);
  });
});
