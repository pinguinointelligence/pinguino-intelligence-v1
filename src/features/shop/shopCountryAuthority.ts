import { supabase } from '@/lib/supabase/client';

/**
 * WHERE ARE YOU STARTING? — the one question that decides how a Starter Pack is
 * fulfilled.
 *
 * There is ONE visible product. A country does not get its own SKU; it selects
 * a MODE on the same product:
 *
 *   physical  — the pack ships, 59 EUR + shipping from `shop_shipping_rates`
 *   local     — the same components, bought locally, 0 EUR, delivered as a PDF
 *   none      — neither is available here yet, said honestly
 *
 * Every value here is DATA. `shop_country_local_readiness` decides `local` by
 * counting filled links against the canonical bundle, so a country becomes
 * customer-live when an operator saves the last URL — never by a deploy. The
 * client cannot override that: it reads the computed flag, it does not compute
 * one of its own.
 */

const unavailable = (): never => {
  throw new Error('Shop backend is unavailable in this build.');
};

/** How the Starter Pack is fulfilled for the selected country. */
export type StarterPackMode = 'physical' | 'local' | 'none';

export interface ShopCountry {
  iso2: string;
  name: string;
  physicalAvailable: boolean;
  /** Operator intent. NOT the same as being live — see `localLive`. */
  localIntended: boolean;
  /** Intent AND a complete mapping. This is what the Shop may act on. */
  localLive: boolean;
  /** Canonical components still missing a local link, by SKU. Admin's work list. */
  missingComponents: string[];
  componentsRequired: number;
  componentsReady: number;
}

export interface ShopShippingRate {
  countryIso2: string;
  carrier: string;
  service: string | null;
  priceCents: number;
  currency: string;
  etaMinDays: number | null;
  etaMaxDays: number | null;
}

/** One local purchase recommendation for one canonical component. */
export interface ShopLocalComponent {
  componentSku: string;
  componentTitle: string;
  localProductName: string;
  supplierName: string;
  purchaseUrl: string;
  packSize: string | null;
  displayPrice: string | null;
  notes: string | null;
}

/**
 * The mode for one country. `none` is a real answer, not an error: a country we
 * do not ship to and have not mapped yet gets an honest state rather than a
 * broken purchase.
 */
export const starterPackModeFor = (country: ShopCountry | null): StarterPackMode => {
  if (!country) return 'none';
  if (country.physicalAvailable) return 'physical';
  if (country.localLive) return 'local';
  return 'none';
};

const rowToCountry = (row: Record<string, unknown>): ShopCountry => ({
  iso2: String(row.iso2),
  name: String(row.name),
  physicalAvailable: row.physical_starter_pack_available === true,
  localIntended: row.local_starter_pack_available === true,
  localLive: row.local_starter_pack_live === true,
  missingComponents: Array.isArray(row.missing_components)
    ? (row.missing_components as string[])
    : [],
  componentsRequired: Number(row.components_required ?? 0),
  componentsReady: Number(row.components_ready ?? 0),
});

/**
 * Every country the Shop may offer, with its computed readiness.
 *
 * Read from the readiness VIEW rather than the table, so `localLive` is the
 * database's answer and not a rule re-implemented in the client.
 */
export async function getShopCountries(): Promise<ShopCountry[]> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase
    .from('shop_country_local_readiness')
    .select(
      'iso2,name,active,physical_starter_pack_available,local_starter_pack_available,' +
        'local_starter_pack_live,missing_components,components_required,components_ready',
    );
  if (error) throw error;
  /* The generated database types do not yet describe these objects, so the rows
     cross the boundary as `unknown` and are narrowed here — once, in the reader
     that owns the shape, rather than at every call site. */
  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  return rows
    .filter((row) => row.active !== false)
    .map(rowToCountry)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * What shipping costs to this country, from the ONE authority.
 *
 * Returns null when the country has no enabled rate — which is exactly why the
 * caller must not fall back to a constant: no rate means no physical offer, not
 * a guessed price.
 */
export async function getShippingRate(iso2: string): Promise<ShopShippingRate | null> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase
    .from('shop_shipping_rates')
    .select('country_iso2,carrier,service,customer_price_cents,currency,eta_min_days,eta_max_days')
    .eq('country_iso2', iso2)
    .eq('enabled', true)
    .eq('active', true)
    .eq('physical_starter_pack_allowed', true)
    .order('sort_order', { ascending: true })
    .limit(1);
  if (error) throw error;
  const row = ((data ?? []) as unknown as Array<Record<string, unknown>>)[0];
  if (!row) return null;
  return {
    countryIso2: String(row.country_iso2),
    carrier: String(row.carrier),
    service: row.service == null ? null : String(row.service),
    priceCents: Number(row.customer_price_cents),
    currency: String(row.currency),
    etaMinDays: row.eta_min_days == null ? null : Number(row.eta_min_days),
    etaMaxDays: row.eta_max_days == null ? null : Number(row.eta_max_days),
  };
}

/**
 * The local shopping list for one country, in canonical bundle order.
 *
 * Only COMPLETE rows are returned. A half-filled row is not a recommendation —
 * it would print a "Buy" link that goes nowhere — so the query requires the
 * three fields that make an entry actionable, the same three the readiness view
 * counts. That keeps one definition of "complete" instead of two.
 */
export async function getLocalComponents(iso2: string): Promise<ShopLocalComponent[]> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase
    .from('shop_country_components')
    .select(
      'local_product_name,supplier_name,purchase_url,pack_size,display_price,notes,sort_order,' +
        'shop_products!inner(sku,title)',
    )
    .eq('country_iso2', iso2)
    .eq('active', true)
    .not('purchase_url', 'is', null)
    .not('local_product_name', 'is', null)
    .not('supplier_name', 'is', null)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  return rows.map((row) => {
    const product = row.shop_products as { sku?: unknown; title?: unknown } | undefined;
    return {
      componentSku: String(product?.sku ?? ''),
      componentTitle: String(product?.title ?? ''),
      localProductName: String(row.local_product_name),
      supplierName: String(row.supplier_name),
      purchaseUrl: String(row.purchase_url),
      packSize: row.pack_size == null ? null : String(row.pack_size),
      displayPrice: row.display_price == null ? null : String(row.display_price),
      notes: row.notes == null ? null : String(row.notes),
    };
  });
}
