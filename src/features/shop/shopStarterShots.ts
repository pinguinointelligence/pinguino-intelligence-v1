import { shopCopy as c } from '@/copy/shop';

/**
 * Gellatti Starter Pack photography, and the placeholder that stands in where
 * photography does not exist yet.
 *
 * SHOP C3 (owner approved 2026-08-31). The three shots are the owner's real
 * product images. Web derivatives only: a uniform crop of the studio margin
 * and a white-point correction, so the bag sits on the page ground with no
 * visible frame. The bag, the wordmark, the brandmark, the colour, the zipper
 * construction and the proportions are untouched — the masters are not in the
 * repository and are never edited.
 *
 * Because the studio ground IS the page ground, the featured product needs no
 * container at all. That is the whole point of the approved treatment: white
 * on white, with the product carried by the page.
 */

export type ShopShotId = 'front' | 'angle' | 'side';

export interface ShopShot {
  readonly id: ShopShotId;
  readonly src: string;
  readonly thumb: string;
  /** Names the VIEW, never the product — the product is named beside it. */
  readonly label: string;
}

/** Front first: it is the primary, and the strip only shows the other two. */
export const SHOP_STARTER_SHOTS: readonly ShopShot[] = [
  {
    id: 'front',
    src: '/shop/starter-front.jpg',
    thumb: '/shop/starter-front-thumb.jpg',
    label: c.starterPack.galleryFront,
  },
  {
    id: 'angle',
    src: '/shop/starter-angle.jpg',
    thumb: '/shop/starter-angle-thumb.jpg',
    label: c.starterPack.galleryAngle,
  },
  {
    id: 'side',
    src: '/shop/starter-side.jpg',
    thumb: '/shop/starter-side-thumb.jpg',
    label: c.starterPack.gallerySide,
  },
];
