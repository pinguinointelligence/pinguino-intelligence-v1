import { shopCopy as c } from '@/copy/shop';
import { shopContentTitle } from './shopContentTitle';

/** The bundle's SKU. Its catalogue row is still titled „Gellatti Starter Pack". */
export const SHOP_BUNDLE_SKU = 'GEL-STARTER-PACK';

/**
 * The customer-facing product name.
 *
 * OWNER, 2026-09-01: the bundle is called simply „Zestaw Startowy". The
 * Gellatti brand is already carried by the official wordmark in the global
 * header, so it is not re-set as a second prominent type treatment on the
 * product.
 *
 * This is a PRESENTATION map, not a data change: the catalogue row, the order
 * items already written and the Admin queue keep the title they were created
 * with, so no historical record is rewritten by a visual pass.
 */
export const shopProductName = (product: { sku: string; title: string }): string =>
  product.sku === SHOP_BUNDLE_SKU ? c.starterPack.name : shopContentTitle(product.title);
