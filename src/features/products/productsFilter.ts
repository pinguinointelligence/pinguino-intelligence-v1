/**
 * Produkty — the page's own filters.
 *
 * OWNER CORRECTION 2026-09-07. „Dodaj produkt" and „Niezweryfikowane" had been added to the
 * hamburger as separate entries, duplicating the product area from the drawer. They belong INSIDE
 * `/products`: „Skanuj produkt" is the page's action, and Wszystkie / Moje produkty /
 * Niezweryfikowane are its filters. The URLs are unchanged — `?filter=` still selects the list, so
 * „Uzupełnij dane" and every saved link keep working — but nothing about them is navigation.
 */

export const PRODUCT_FILTERS = ['all', 'mine', 'unverified'] as const;
export type ProductFilter = (typeof PRODUCT_FILTERS)[number];

export const PRODUCT_FILTER_LABEL: Record<ProductFilter, string> = {
  all: 'Wszystkie',
  mine: 'Moje produkty',
  unverified: 'Niezweryfikowane',
};

/** An unknown or absent `?filter=` is the whole catalogue, never an error. */
export function productFilterFromParam(value: string | null): ProductFilter {
  return (PRODUCT_FILTERS as readonly string[]).includes(value ?? '')
    ? (value as ProductFilter)
    : 'all';
}

/**
 * Where „← Produkty" goes from the scanner. „Skanuj produkt" is an action ON the products page, so
 * leaving it returns to the LIST the customer was on — otherwise someone completing an unverified
 * product is dropped onto the whole catalogue and has to find their way back to the filter.
 */
export function productsReturnPath(from: string | null): string {
  const filter = productFilterFromParam(from);
  return filter === 'all' ? '/products' : `/products?filter=${filter}`;
}
