// @vitest-environment jsdom
/**
 * „Udostępnij recepturę" with an optional own photograph (owner decision
 * 2026-09-17). The link never waits for a photo; a failed or unfinished upload
 * is never shown as the photograph; the share sheet still sends the LINK only.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BRANDED_PROFILE_IMAGE } from '@/features/community/domain/recipeImageAuthority';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const service = vi.hoisted(() => ({
  createShareLink: vi.fn(),
  readSharePhoto: vi.fn(),
  attachSharePhoto: vi.fn(),
  detachSharePhoto: vi.fn(),
}));
vi.mock('@/services/community', () => service);

/** jsdom has no object URLs; keep the real constructor (see PublishToCommunityDialog.test). */
class PreviewURL extends URL {
  static override createObjectURL = vi.fn(() => 'blob:own-photo');
  static override revokeObjectURL = vi.fn();
}

const { ShareRecipeDialog } = await import('./ShareRecipeDialog');

const LINK = {
  share_link_id: 'link-1',
  token: 'secret-token',
  version_number: 4,
  partner_attribution: false,
  created_at: '2026-09-17T10:00:00Z',
};

describe('share dialog — own photo for the recipient', () => {
  let host: HTMLDivElement;
  let root: Root;
  let share: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    for (const fn of Object.values(service)) fn.mockReset();
    service.createShareLink.mockResolvedValue(LINK);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    vi.stubGlobal('URL', PreviewURL);
    share = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'share');
  });

  const settle = async () => {
    await act(async () => {
      for (let i = 0; i < 6; i += 1) await Promise.resolve();
    });
  };
  const button = (label: string) =>
    [...host.querySelectorAll('button')].find((candidate) => candidate.textContent === label);
  const openWithLink = async () => {
    await act(async () => {
      root.render(
        <ShareRecipeDialog recipeId="recipe-9" versionNumber={4} onClose={() => undefined} />,
      );
    });
    await act(async () => button('Udostępnij recepturę')!.click());
    await settle();
  };
  const preview = () => host.querySelector<HTMLImageElement>('[data-testid="share-photo-preview"]');
  const choose = async (file: File) => {
    const input = host.querySelector<HTMLInputElement>('[data-testid="share-photo-gallery"]')!;
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    await settle();
  };

  it('SHARE-DLG-01 when the photo options cannot be read, the section says so and retries — the link still works', async () => {
    service.readSharePhoto.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({
      ok: true,
      share_link_id: 'link-1',
      category: 'sorbet',
      has_own_photo: false,
    });
    await openWithLink();
    expect(service.createShareLink).toHaveBeenCalledWith('recipe-9', 4, null);
    expect(host.querySelector('input[readonly]')?.getAttribute('value')).toContain(
      '/share/secret-token',
    );
    const section = host.querySelector('[data-testid="share-photo"]')!;
    expect(section.querySelector('[role="alert"]')?.textContent).toBe(
      'Nie udało się sprawdzić zdjęcia dla tego linku.',
    );
    expect(preview()).toBeNull(); // a failure is never shown as the profile photograph

    await act(async () => button('Spróbuj ponownie')!.click());
    await settle();
    expect(service.readSharePhoto).toHaveBeenCalledTimes(2);
    expect(preview()!.getAttribute('src')).toBe(BRANDED_PROFILE_IMAGE.sorbet);
  });

  it('SHARE-DLG-02 no photo yet: the recipient would see the SHARED VERSION’s profile photograph', async () => {
    service.readSharePhoto.mockResolvedValue({
      ok: true,
      share_link_id: 'link-1',
      category: 'vegan_gelato',
      has_own_photo: false,
    });
    await openWithLink();
    expect(service.readSharePhoto).toHaveBeenCalledWith('link-1');
    expect(preview()!.getAttribute('src')).toBe(BRANDED_PROFILE_IMAGE.vegan);
    expect(preview()!.dataset.imageOrigin).toBe('branded_profile');
    expect(host.textContent).toContain('Bez własnego zdjęcia odbiorca zobaczy zdjęcie Gellatti');
    expect(button('Kopiuj link') ?? button('Copy link')).toBeDefined();
  });

  it('SHARE-DLG-03 an attached photo becomes the preview; the share sheet still sends title + url only', async () => {
    service.readSharePhoto.mockResolvedValue({
      ok: true,
      share_link_id: 'link-1',
      category: 'sorbet',
      has_own_photo: false,
    });
    service.attachSharePhoto.mockResolvedValue(undefined);
    await openWithLink();
    const file = new File(['ice'], 'lody.jpg', { type: 'image/jpeg' });
    await choose(file);

    expect(service.attachSharePhoto).toHaveBeenCalledWith('link-1', file);
    expect(preview()!.getAttribute('src')).toBe('blob:own-photo');
    expect(preview()!.dataset.imageOrigin).toBe('user_photo');
    expect(host.textContent).toContain('Zdjęcie dodane. Zobaczy je każdy, kto otworzy ten link');

    const shareButton = [...host.querySelectorAll('button')].find(
      (b) => b.textContent === 'Udostępnij',
    );
    await act(async () => shareButton!.click());
    expect(share).toHaveBeenCalledTimes(1);
    const payload = share.mock.calls[0]![0] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(['title', 'url']);
    expect(payload.url).toContain('/share/secret-token');
  });

  it('SHARE-DLG-04 a failed upload is not a photo: real state, retry, or share without one', async () => {
    service.readSharePhoto.mockResolvedValue({
      ok: true,
      share_link_id: 'link-1',
      category: 'protein_gelato',
      has_own_photo: false,
    });
    service.attachSharePhoto
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(undefined);
    await openWithLink();
    const file = new File(['ice'], 'lody.jpg', { type: 'image/jpeg' });
    await choose(file);

    expect(host.querySelector('[data-testid="share-photo"] [role="alert"]')?.textContent).toContain(
      'Nie udało się dodać zdjęcia',
    );
    expect(preview()!.getAttribute('src')).toBe(BRANDED_PROFILE_IMAGE.protein);
    expect(preview()!.dataset.imageOrigin).toBe('branded_profile');

    await act(async () => button('Spróbuj ponownie')!.click());
    await settle();
    expect(service.attachSharePhoto).toHaveBeenCalledTimes(2);
    expect(service.attachSharePhoto).toHaveBeenLastCalledWith('link-1', file);
    expect(preview()!.dataset.imageOrigin).toBe('user_photo');
  });

  it('SHARE-DLG-05 „Udostępnij bez zdjęcia” clears the failure and keeps the profile photograph', async () => {
    service.readSharePhoto.mockResolvedValue({
      ok: true,
      share_link_id: 'link-1',
      category: 'milk_gelato',
      has_own_photo: false,
    });
    service.attachSharePhoto.mockRejectedValue(new Error('network'));
    await openWithLink();
    await choose(new File(['ice'], 'lody.jpg', { type: 'image/jpeg' }));
    await act(async () => button('Udostępnij bez zdjęcia')!.click());
    expect(host.querySelector('[data-testid="share-photo"] [role="alert"]')).toBeNull();
    expect(preview()!.getAttribute('src')).toBe(BRANDED_PROFILE_IMAGE.gelato);
    expect(service.attachSharePhoto).toHaveBeenCalledTimes(1);
  });

  it('SHARE-DLG-06 removing the photo detaches it and the recipient sees the profile photograph again', async () => {
    service.readSharePhoto.mockResolvedValue({
      ok: true,
      share_link_id: 'link-1',
      category: 'sorbet',
      has_own_photo: false,
    });
    service.attachSharePhoto.mockResolvedValue(undefined);
    service.detachSharePhoto.mockResolvedValue(undefined);
    await openWithLink();
    await choose(new File(['ice'], 'lody.jpg', { type: 'image/jpeg' }));
    await act(async () => button('Usuń zdjęcie')!.click());
    await settle();
    expect(service.detachSharePhoto).toHaveBeenCalledWith('link-1');
    expect(preview()!.getAttribute('src')).toBe(BRANDED_PROFILE_IMAGE.sorbet);
    expect(preview()!.dataset.imageOrigin).toBe('branded_profile');
  });

  it('SHARE-DLG-07 a failed REPLACEMENT keeps the attached photo: the recipient still sees it, and the dialog says so', async () => {
    service.readSharePhoto.mockResolvedValue({
      ok: true,
      share_link_id: 'link-1',
      category: 'sorbet',
      has_own_photo: false,
    });
    PreviewURL.createObjectURL
      .mockImplementationOnce(() => 'blob:first')
      .mockImplementationOnce(() => 'blob:second');
    service.attachSharePhoto
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('network'))
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(undefined);
    await openWithLink();
    await choose(new File(['first'], 'first.jpg', { type: 'image/jpeg' }));
    const second = new File(['second'], 'second.jpg', { type: 'image/jpeg' });
    await choose(second);

    const alert = () => host.querySelector('[data-testid="share-photo"] [role="alert"]');
    expect(alert()?.textContent).toBe(
      'Nie udało się dodać nowego zdjęcia. Odbiorca nadal widzi poprzednie.',
    );
    expect(preview()!.getAttribute('src')).toBe('blob:first');
    expect(preview()!.dataset.imageOrigin).toBe('user_photo');
    expect(button('Udostępnij bez zdjęcia')).toBeUndefined(); // nothing claims the photo is gone
    expect(button('Usuń zdjęcie')).toBeDefined();

    await act(async () => button('Zostaw obecne zdjęcie')!.click());
    expect(alert()).toBeNull();
    expect(host.textContent).toContain('Zdjęcie dodane. Zobaczy je każdy, kto otworzy ten link');
    expect(preview()!.getAttribute('src')).toBe('blob:first');

    await choose(second);
    await act(async () => button('Spróbuj ponownie')!.click());
    await settle();
    expect(service.attachSharePhoto).toHaveBeenCalledTimes(4);
    expect(service.attachSharePhoto).toHaveBeenLastCalledWith('link-1', second);
    expect(alert()).toBeNull();
    expect(preview()!.getAttribute('src')).toBe('blob:second');
    expect(PreviewURL.revokeObjectURL).toHaveBeenCalledWith('blob:first');
    expect(service.detachSharePhoto).not.toHaveBeenCalled();
  });

  it('SHARE-DLG-08 a failed REMOVAL says so and keeps the photo; trying again removes it', async () => {
    service.readSharePhoto.mockResolvedValue({
      ok: true,
      share_link_id: 'link-1',
      category: 'sorbet',
      has_own_photo: false,
    });
    service.attachSharePhoto.mockResolvedValue(undefined);
    service.detachSharePhoto
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(undefined);
    await openWithLink();
    await choose(new File(['ice'], 'lody.jpg', { type: 'image/jpeg' }));
    await act(async () => button('Usuń zdjęcie')!.click());
    await settle();

    const alert = () => host.querySelector('[data-testid="share-photo"] [role="alert"]');
    expect(alert()?.textContent).toBe('Nie udało się usunąć zdjęcia. Odbiorca nadal je widzi.');
    expect(preview()!.dataset.imageOrigin).toBe('user_photo');

    await act(async () => button('Spróbuj ponownie')!.click());
    await settle();
    expect(service.detachSharePhoto).toHaveBeenCalledTimes(2);
    expect(alert()).toBeNull();
    expect(preview()!.getAttribute('src')).toBe(BRANDED_PROFILE_IMAGE.sorbet);
    expect(preview()!.dataset.imageOrigin).toBe('branded_profile');
  });
});
