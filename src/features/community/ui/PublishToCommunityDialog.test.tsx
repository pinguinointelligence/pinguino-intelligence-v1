// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublishToCommunityDialog } from './PublishToCommunityDialog';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const service = vi.hoisted(() => ({
  publishRecipe: vi.fn(),
  claimCreatorProfile: vi.fn(),
}));

vi.mock('@/services/community', () => service);

describe('post-production Community invitation', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    service.publishRecipe.mockReset();
    service.claimCreatorProfile.mockReset();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  const render = async (hasCreatorProfile: boolean) => {
    await act(async () => {
      root.render(
        <PublishToCommunityDialog
          recipeId="recipe-1"
          versionNumber={2}
          defaultTitle="Gelato pistacjowe"
          hasCreatorProfile={hasCreatorProfile}
          completionContext
          onClose={() => undefined}
        />,
      );
    });
  };

  it('leads with pride and sharing, with privacy/version mechanics secondary', async () => {
    await render(true);
    const dialog = document.querySelector('[data-testid="publish-community-dialog"]')!;
    expect(dialog.textContent).toContain('Pokaż swój wynik w Community');
    expect(dialog.textContent).toContain('Świetna partia? Udostępnij recepturę i pokaż ją innym.');
    expect(dialog.textContent).toContain(
      'Dokładne gramatury pozostają chronione zgodnie z Twoim planem.',
    );
    expect(dialog.textContent).toContain('wersję 2');
    expect(dialog.querySelector('input')?.getAttribute('value')).toBe('Gelato pistacjowe');
  });

  it('turns a missing Creator profile into an inline continuation instead of a dead end', async () => {
    service.claimCreatorProfile.mockResolvedValue({ handle: 'marysia' });
    await render(false);
    const dialog = document.querySelector('[data-testid="publish-community-dialog"]')!;
    expect(dialog.textContent).toContain('Chcesz publikować w Community?');
    expect(dialog.textContent).toContain('Potem wrócisz tutaj i dokończysz publikację.');

    const create = [...dialog.querySelectorAll('button')].find(
      (button) => button.textContent === 'Utwórz profil',
    )!;
    await act(async () => create.click());
    expect(dialog.querySelector('[data-testid="community-creator-continuation"]')).not.toBeNull();

    const inputs = dialog.querySelectorAll<HTMLInputElement>('input');
    await act(async () => {
      const displayName = inputs[0]!;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(displayName, 'Marysia');
      displayName.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const save = [...dialog.querySelectorAll('button')].find(
      (button) => button.textContent === 'Zapisz profil',
    )!;
    await act(async () => {
      save.click();
      await Promise.resolve();
    });
    expect(service.claimCreatorProfile).toHaveBeenCalledOnce();
    expect(dialog.textContent).toContain('Pokaż swój wynik w Community');
    expect(dialog.querySelector('input')?.getAttribute('value')).toBe('Gelato pistacjowe');
  });
});
