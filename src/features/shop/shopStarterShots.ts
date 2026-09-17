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

/**
 * The placeholder photo for single articles — OWNER DECISION 2026-09-12,
 * scoped to seven articles 2026-09-17.
 *
 * ONE owner-supplied photo of a plain stand-up pouch (a transparent PNG), shared
 * by the singles in `SHOP_SINGLE_PLACEHOLDER_SKUS` until each has photography of
 * its own (`ShopProduct.imageUrl`, which always wins). It is illustrative, never
 * the article itself, so it renders as decoration. It supersedes C3's „the
 * reserved frame is never filled" for those seven articles ONLY, and it is never
 * one of the Starter Pack shots above.
 */
export const SHOP_SINGLE_PLACEHOLDER_SRC = '/shop/single-placeholder.png';

/**
 * The seven physical singles that show the placeholder, by SKU. A single added
 * later is NOT covered: it keeps the empty reserved frame until it has a photo
 * of its own or the owner names it here.
 */
export const SHOP_SINGLE_PLACEHOLDER_SKUS: readonly string[] = [
  'GEL-DEX-500',
  'GEL-FRU-500',
  'GEL-INU-500',
  'GEL-STB-500',
  'GEL-YOL-500',
  'GEL-SMP-500',
  'GEL-CRP-500',
];
