/** @vitest-environment jsdom */
/**
 * SHOP single photos — OWNER DECISION 2026-09-17. The seven physical singles
 * show their own photo; a picture that cannot load gives way to the next
 * candidate, in a fixed order, and the frame never shows a broken image:
 *
 *   ShopProduct.imageUrl → own photo → shared placeholder → empty outline
 *
 * jsdom never fetches images, so each failure is the `error` event a browser
 * fires on a missing file, dispatched by hand.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ShopReservedFrame } from './ShopPackaging';
import {
  SHOP_SINGLE_OWN_PHOTOS,
  SHOP_SINGLE_PLACEHOLDER_SKUS,
  SHOP_SINGLE_PLACEHOLDER_SRC,
} from './shopStarterShots';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let host: HTMLDivElement;
let root: Root;

const render = async (sku: string, imageUrl: string | null) => {
  await act(async () => root.render(<ShopReservedFrame sku={sku} imageUrl={imageUrl} />));
};

const image = () => host.querySelector('img');

/** The src the frame shows now, or null once it has fallen back to the outline. */
const shown = () => image()?.getAttribute('src') ?? null;

const failToLoad = async () => {
  const img = image();
  expect(img).not.toBeNull();
  await act(async () => {
    img!.dispatchEvent(new Event('error'));
  });
};

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe('shop reserved frame · own photo, then placeholder, then outline', () => {
  it('walks own photo → placeholder → outline for each of the seven singles', async () => {
    expect(SHOP_SINGLE_OWN_PHOTOS.size).toBe(7);
    for (const [sku, ownPhoto] of SHOP_SINGLE_OWN_PHOTOS) {
      expect(SHOP_SINGLE_PLACEHOLDER_SKUS).toContain(sku);
      await render(sku, null);
      expect(shown()).toBe(ownPhoto);
      expect(image()?.getAttribute('alt')).toBe('');

      await failToLoad();
      expect(shown()).toBe(SHOP_SINGLE_PLACEHOLDER_SRC);

      await failToLoad();
      expect(shown()).toBeNull();
      // The empty reserved outline, inside the same decorative frame.
      const frame = host.querySelector('[data-testid="shop-reserved-frame"]');
      expect(frame?.getAttribute('aria-hidden')).toBe('true');
      expect(frame?.querySelector('span')).not.toBeNull();

      await act(async () => root.unmount());
      root = createRoot(host);
    }
  });

  it('lets fructose fall back to the shared placeholder like the other six', async () => {
    await render('GEL-FRU-500', null);
    expect(shown()).toBe('/shop/singles/fructose.png');
    await failToLoad();
    expect(shown()).toBe(SHOP_SINGLE_PLACEHOLDER_SRC);
  });

  it("puts an article's imageUrl first, ahead of its own photo and the placeholder", async () => {
    await render('GEL-DEX-500', '/shop/catalogue-photo.jpg');
    expect(shown()).toBe('/shop/catalogue-photo.jpg');
    await failToLoad();
    expect(shown()).toBe('/shop/singles/dextrose.png');
    await failToLoad();
    expect(shown()).toBe(SHOP_SINGLE_PLACEHOLDER_SRC);
    await failToLoad();
    expect(shown()).toBeNull();
  });

  it('gives a single the owner has not named no borrowed picture', async () => {
    await render('GEL-NEW-500', null);
    expect(shown()).toBeNull();

    await act(async () => root.unmount());
    root = createRoot(host);

    await render('GEL-NEW-500', '/shop/catalogue-photo.jpg');
    expect(shown()).toBe('/shop/catalogue-photo.jpg');
    await failToLoad();
    expect(shown()).toBeNull();
  });
});
