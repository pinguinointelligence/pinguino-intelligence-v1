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
 * Each physical single's own photograph, by SKU — OWNER DECISION 2026-09-17.
 *
 * The owner's photos of the seven singles: the same white stand-up pouch as the
 * placeholder below, labelled for its article. Web derivatives only: the white
 * studio ground and its cast shadow are cut away, and each pouch sits exactly
 * where the placeholder's pouch sits in the same transparent 512 px square, so
 * every row keeps the approved scale. The pouch and its label are untouched —
 * the masters are not in the repository.
 *
 * An article's own `ShopProduct.imageUrl` still wins. If a photo here fails to
 * load, the frame falls back to the shared placeholder, then to the empty
 * outline. A single added later has no entry until the owner supplies one.
 */
export const SHOP_SINGLE_OWN_PHOTOS: ReadonlyMap<string, string> = new Map([
  ['GEL-DEX-500', '/shop/singles/dextrose.png'],
  ['GEL-FRU-500', '/shop/singles/fructose.png'],
  ['GEL-INU-500', '/shop/singles/inulin.png'],
  ['GEL-STB-500', '/shop/singles/gellatti-stabilizer.png'],
  ['GEL-YOL-500', '/shop/singles/dried-egg-yolk.png'],
  ['GEL-SMP-500', '/shop/singles/skimmed-milk-powder.png'],
  ['GEL-CRP-500', '/shop/singles/cream-powder-42.png'],
]);

/**
 * The placeholder photo for single articles — OWNER DECISION 2026-09-12,
 * scoped to seven articles 2026-09-17.
 *
 * ONE owner-supplied photo of a plain stand-up pouch (a transparent PNG), shared
 * by the singles in `SHOP_SINGLE_PLACEHOLDER_SKUS`. Since the seven received
 * their own photos (2026-09-17, above) it is the FALLBACK behind them, shown
 * only when an own photo cannot load. It is illustrative, never the article
 * itself, so it renders as decoration. It supersedes C3's „the reserved frame is
 * never filled" for those seven articles ONLY, and it is never one of the
 * Starter Pack shots above.
 */
export const SHOP_SINGLE_PLACEHOLDER_SRC = '/shop/single-placeholder.png';

/**
 * The seven physical singles that may show the placeholder, by SKU. A single
 * added later is NOT covered: it keeps the empty reserved frame until it has a
 * photo of its own or the owner names it here.
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
