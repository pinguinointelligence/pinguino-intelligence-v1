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
  uploadCommunityPhoto: vi.fn(),
  claimCreatorProfile: vi.fn(),
}));

vi.mock('@/services/community', () => service);

/**
 * jsdom has no `URL.createObjectURL`. Stub it on a SUBCLASS: replacing `URL`
 * with a plain object would also remove the constructor the photo check uses.
 */
class PreviewURL extends URL {
  static override createObjectURL = vi.fn(() => 'blob:community-photo');
}

describe('post-production Community invitation', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    service.publishRecipe.mockReset();
    service.uploadCommunityPhoto.mockReset();
    service.claimCreatorProfile.mockReset();
    vi.stubGlobal('URL', PreviewURL);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
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

  it('uploads the maker photo before publishing the exact immutable version', async () => {
    const imageUrl =
      'https://staging.example/storage/v1/object/public/community-recipe-images/owner-1/photo.jpg';
    service.uploadCommunityPhoto.mockResolvedValue(imageUrl);
    service.publishRecipe.mockResolvedValue({
      publication_id: 'publication-1',
      handle: 'marysia',
      slug: 'gelato-pistacjowe',
      version_number: 2,
    });
    await render(true);
    const dialog = document.querySelector('[data-testid="publish-community-dialog"]')!;
    const input = dialog.querySelector<HTMLInputElement>(
      '[data-testid="publication-photo-gallery"]',
    )!;
    const file = new File(['gelato'], 'gelato.jpg', { type: 'image/jpeg' });
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));

    const publish = [...dialog.querySelectorAll('button')].find(
      (button) => button.textContent === 'Opublikuj w Community',
    )!;
    await act(async () => {
      publish.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(service.uploadCommunityPhoto).toHaveBeenCalledWith(file);
    expect(service.publishRecipe).toHaveBeenCalledWith(
      expect.objectContaining({
        recipeId: 'recipe-1',
        versionNumber: 2,
        imageUrl,
      }),
    );
  });
});

describe('Community requires the maker’s own photo — „Opublikuję później” (owner 2026-09-17)', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    service.publishRecipe.mockReset();
    service.uploadCommunityPhoto.mockReset();
    service.claimCreatorProfile.mockReset();
    vi.stubGlobal('URL', PreviewURL);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  const render = async (
    overrides: { recipeId?: string; versionNumber?: number; onClose?: () => void } = {},
  ) => {
    await act(async () => {
      root.render(
        <PublishToCommunityDialog
          recipeId={overrides.recipeId ?? 'recipe-1'}
          versionNumber={overrides.versionNumber ?? 3}
          defaultTitle="Sorbet malinowy"
          hasCreatorProfile
          onClose={overrides.onClose ?? (() => undefined)}
        />,
      );
    });
  };
  const dialog = () => document.querySelector('[data-testid="publish-community-dialog"]')!;
  const button = (label: string) =>
    [...dialog().querySelectorAll('button')].find((candidate) => candidate.textContent === label);
  const choosePhoto = async (file: File) => {
    const input = dialog().querySelector<HTMLInputElement>(
      '[data-testid="publication-photo-camera"]',
    )!;
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  };
  const settle = async () => {
    for (let i = 0; i < 4; i += 1) await Promise.resolve();
  };

  it('COMM-PHOTO-01 without an own photo publishing is unavailable and says why', async () => {
    await render();
    const publish = button('Opublikuj w Community')!;
    expect(publish.disabled).toBe(true);
    const hint = dialog().querySelector('[data-testid="community-own-photo-required"]')!;
    expect(hint.textContent).toBe(
      'Aby opublikować w Community, dodaj własne zdjęcie gotowych lodów. Możesz zrobić to później — Twoja receptura pozostaje zapisana.',
    );
    expect(publish.getAttribute('aria-describedby')).toBe(hint.id);
    expect(dialog().querySelector('[data-testid="publication-photo-camera"]')).not.toBeNull();
    expect(dialog().querySelector('[data-testid="publication-photo-gallery"]')).not.toBeNull();
    expect(button('Zrób zdjęcie')).toBeUndefined(); // the camera/gallery triggers are labels, not buttons
    expect(dialog().textContent).toContain('Zrób zdjęcie');
    expect(dialog().textContent).toContain('Wybierz z galerii');
  });

  it('COMM-PHOTO-02 „Opublikuję później” ends the attempt and publishes, uploads and schedules nothing', async () => {
    const onClose = vi.fn();
    await render({ onClose });
    await act(async () => button('Opublikuję później')!.click());
    await settle();
    expect(onClose).toHaveBeenCalledOnce();
    expect(service.uploadCommunityPhoto).not.toHaveBeenCalled();
    expect(service.publishRecipe).not.toHaveBeenCalled();
  });

  it('COMM-PHOTO-03 the „stays saved” sentence needs a real saved version', async () => {
    for (const overrides of [{ recipeId: '' }, { versionNumber: 0 }, { versionNumber: 1.5 }]) {
      await render(overrides);
      const hint = dialog().querySelector('[data-testid="community-own-photo-required"]')!;
      expect(hint.textContent, JSON.stringify(overrides)).toBe(
        'Aby opublikować w Community, dodaj własne zdjęcie gotowych lodów.',
      );
    }
  });

  it('COMM-PHOTO-04 a chosen photo lifts the block; the existing publication path runs', async () => {
    const imageUrl =
      'https://tunabqqrwabacxjcxxkz.supabase.co/storage/v1/object/public/community-recipe-images/owner-1/photo.jpg';
    service.uploadCommunityPhoto.mockResolvedValue(imageUrl);
    service.publishRecipe.mockResolvedValue({
      publication_id: 'p-1',
      handle: 'm',
      slug: 's',
      version_number: 3,
    });
    const onClose = vi.fn();
    await render({ onClose });
    const file = new File(['ice'], 'lody.jpg', { type: 'image/jpeg' });
    await choosePhoto(file);

    expect(dialog().querySelector('[data-testid="community-own-photo-required"]')).toBeNull();
    expect(button('Opublikuję później')).toBeUndefined();
    expect(button('Anuluj')).toBeDefined();
    const publish = button('Opublikuj w Community')!;
    expect(publish.disabled).toBe(false);

    await act(async () => {
      publish.click();
      await settle();
    });
    expect(service.uploadCommunityPhoto).toHaveBeenCalledWith(file);
    expect(service.publishRecipe).toHaveBeenCalledWith(
      expect.objectContaining({ recipeId: 'recipe-1', versionNumber: 3, imageUrl }),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('COMM-PHOTO-05 a failed upload is not an attached photo: nothing is published and the dialog stays', async () => {
    service.uploadCommunityPhoto.mockRejectedValue(new Error('upload failed'));
    const onClose = vi.fn();
    await render({ onClose });
    await choosePhoto(new File(['ice'], 'lody.jpg', { type: 'image/jpeg' }));
    await act(async () => {
      button('Opublikuj w Community')!.click();
      await settle();
    });
    expect(service.publishRecipe).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(dialog().querySelector('[role="alert"]')).not.toBeNull();
  });

  it('COMM-PHOTO-06 a Gellatti asset returned in place of an upload is refused before publishing', async () => {
    const onClose = vi.fn();
    for (const notAnUpload of [
      'https://staging.pinguinoai.com/brand/profile/gelato.jpg',
      'https://staging.pinguinoai.com/brand/profile/gelato.jpg?/storage/v1/object/public/community-recipe-images/owner-1/photo.jpg',
      '/recipes/FL-000001_chocolate_fudge_with_brown_sugar.webp',
    ]) {
      service.uploadCommunityPhoto.mockResolvedValue(notAnUpload);
      await render({ onClose });
      await choosePhoto(new File(['ice'], 'lody.jpg', { type: 'image/jpeg' }));
      await act(async () => {
        button('Opublikuj w Community')!.click();
        await settle();
      });
      expect(service.publishRecipe, notAnUpload).not.toHaveBeenCalled();
    }
    expect(onClose).not.toHaveBeenCalled();
  });
});
