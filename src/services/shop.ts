import { supabase } from '@/lib/supabase/client';

const unavailable = (): never => {
  throw new Error('Shop backend is unavailable in this build.');
};

/** Raw contract values — never translated, shown through a display map. */
export type ShopAvailability = 'in_stock' | 'preorder' | 'out_of_stock';
export type ShopOrderStatus = 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded';
export type ShopFulfillmentStatus =
  | 'awaiting'
  | 'preparing'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export interface ShopProduct {
  id: string;
  sku: string;
  slug: string;
  kind: 'single' | 'bundle';
  title: string;
  description: string | null;
  canonicalIngredientId: string | null;
  packSizeG: number | null;
  priceCents: number;
  currency: string;
  imageUrl: string | null;
  availability: ShopAvailability;
  leadTimeWeeks: number | null;
  /** What is actually PACKED in a bundle — `packSizeG` here is the packed
   *  amount, which for the Starter Pack differs from each item's retail SKU. */
  contents: Array<{ sku: string; title: string; packSizeG: number | null; quantity: number }>;
  /** Total packed grams of a bundle. Null for a single product. */
  contentsTotalG: number | null;
  /** Raw allergen tokens. Empty means NO STATEMENT EXISTS for this article —
   *  never render that as an "allergen free" claim. */
  allergens: ShopAllergen[];
}

export type ShopAllergen = 'milk' | 'egg';

/** Where a parcel goes. Written back from the payment session, so it is empty
 *  until the order is paid. */
export interface ShopShippingAddress {
  name: string | null;
  line1: string | null;
  line2: string | null;
  postalCode: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  phone: string | null;
}

export interface ShopTracking {
  carrier: string | null;
  number: string | null;
}

export interface ShopOrderItem {
  sku: string;
  title: string;
  packSizeG: number | null;
  unitPriceCents: number;
  quantity: number;
  isPreorder: boolean;
}

export interface ShopOrder {
  id: string;
  orderNumber: string;
  status: ShopOrderStatus;
  fulfillmentStatus: ShopFulfillmentStatus;
  containsPreorder: boolean;
  leadTimeWeeks: number | null;
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  created_at: string;
  paidAt: string | null;
  shippedAt: string | null;
  shipping: ShopShippingAddress;
  tracking: ShopTracking;
  items: ShopOrderItem[];
}

export async function getShopCatalog(): Promise<ShopProduct[]> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.rpc('gellatti_shop_catalog_v1');
  if (error) throw new Error(error.message);
  return (data ?? []) as ShopProduct[];
}

export async function getMyShopOrders(): Promise<ShopOrder[]> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.rpc('gellatti_my_shop_orders_v1');
  if (error) throw new Error(error.message);
  return (data ?? []) as ShopOrder[];
}

export interface ShopCheckoutLine {
  sku: string;
  quantity: number;
}

/** The client submits SKUs only — every amount is resolved server-side. */
export async function startShopCheckout(input: {
  items: readonly ShopCheckoutLine[];
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string; orderId: string; orderNumber: string }> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.functions.invoke('shop-checkout', {
    body: { items: input.items, successUrl: input.successUrl, cancelUrl: input.cancelUrl },
  });
  if (error) {
    const detail = await error.context?.text?.().catch(() => null);
    throw new Error(detail ?? error.message);
  }
  return data as { url: string; orderId: string; orderNumber: string };
}

export interface ShopOrderSyncResult {
  orderNumber: string;
  status: ShopOrderStatus;
  paymentStatus: string;
  /** The whole order, so the confirmation screen can close the purchase
   *  without a second round trip — and without the browser reconstructing
   *  what was bought from a cart it has already cleared. */
  order: ShopOrder | null;
}

/** Payment truth comes from Stripe, never from the browser. */
export async function syncShopOrder(orderId: string): Promise<ShopOrderSyncResult> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.functions.invoke('shop-order-sync', {
    body: { orderId },
  });
  if (error) {
    const detail = await error.context?.text?.().catch(() => null);
    throw new Error(detail ?? error.message);
  }
  return data as ShopOrderSyncResult;
}

/* ------------------------------- admin ---------------------------------- */

export interface AdminShopProduct {
  id: string;
  sku: string;
  slug: string;
  kind: 'single' | 'bundle';
  title: string;
  description: string | null;
  canonical_ingredient_id: string | null;
  pack_size_g: number | null;
  price_cents: number;
  currency: string;
  image_url: string | null;
  availability: ShopAvailability;
  lead_time_weeks: number | null;
  active: boolean;
  sort_order: number;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
}

export async function getAdminShopProducts(): Promise<AdminShopProduct[]> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.rpc('gellatti_admin_shop_products_v1');
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminShopProduct[];
}

export interface AdminShopProductDraft {
  id?: string;
  sku: string;
  slug?: string;
  kind?: 'single' | 'bundle';
  title: string;
  description?: string | null;
  canonicalIngredientId?: string | null;
  packSizeG?: number | null;
  priceCents: number;
  currency?: string;
  imageUrl?: string | null;
  availability: ShopAvailability;
  leadTimeWeeks?: number | null;
  active: boolean;
  sortOrder?: number;
}

export async function upsertAdminShopProduct(draft: AdminShopProductDraft): Promise<void> {
  if (!supabase) return unavailable();
  const { error } = await supabase.rpc('gellatti_admin_shop_product_upsert_v1', {
    p_product: draft,
  });
  if (error) throw new Error(error.message);
}

/** The operator needs the payment provider's own references to reconcile an
 *  order, but the UI must not know which provider that is — the boundary guard
 *  keeps provider names out of the view layer, and a second provider must not
 *  mean editing screens. The service maps them into one neutral shape. */
export interface PaymentReference {
  sessionId: string | null;
  intentId: string | null;
}

export interface AdminShopOrder extends ShopOrder {
  email: string;
  userId: string | null;
  cancelledAt: string | null;
  refundedAt: string | null;
  paymentReference: PaymentReference;
}

interface AdminShopOrderRow extends ShopOrder {
  email: string;
  userId: string | null;
  cancelledAt: string | null;
  refundedAt: string | null;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
}

export async function getAdminShopOrders(): Promise<AdminShopOrder[]> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.rpc('gellatti_admin_shop_orders_v1', { p_limit: 200 });
  if (error) throw new Error(error.message);
  return ((data ?? []) as AdminShopOrderRow[]).map((row) => ({
    ...row,
    paymentReference: {
      sessionId: row.stripeCheckoutSessionId,
      intentId: row.stripePaymentIntentId,
    },
  }));
}

/** Moving an order along its lifecycle. A shipment is recorded in the SAME
 *  call that marks it shipped, so a parcel can never be „shipped" with nobody
 *  able to say by whom or under what number. */
export async function setShopOrderFulfillment(input: {
  orderId: string;
  fulfillmentStatus: ShopFulfillmentStatus;
  trackingCarrier?: string | null;
  trackingNumber?: string | null;
}): Promise<void> {
  if (!supabase) return unavailable();
  const { error } = await supabase.rpc('gellatti_admin_shop_order_action_v1', {
    p_order_id: input.orderId,
    p_fulfillment_status: input.fulfillmentStatus,
    p_tracking_carrier: input.trackingCarrier ?? null,
    p_tracking_number: input.trackingNumber ?? null,
  });
  if (error) throw new Error(error.message);
}
