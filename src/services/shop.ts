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
  contents: Array<{ sku: string; title: string; packSizeG: number | null }>;
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
  totalCents: number;
  currency: string;
  created_at: string;
  paidAt: string | null;
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

/** Payment truth comes from Stripe, never from the browser. */
export async function syncShopOrder(orderId: string): Promise<{
  orderNumber: string;
  status: ShopOrderStatus;
  paymentStatus: string;
}> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.functions.invoke('shop-order-sync', {
    body: { orderId },
  });
  if (error) {
    const detail = await error.context?.text?.().catch(() => null);
    throw new Error(detail ?? error.message);
  }
  return data as { orderNumber: string; status: ShopOrderStatus; paymentStatus: string };
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
  subtotalCents: number;
  paymentReference: PaymentReference;
}

interface AdminShopOrderRow extends ShopOrder {
  email: string;
  userId: string | null;
  subtotalCents: number;
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

export async function setShopOrderFulfillment(input: {
  orderId: string;
  fulfillmentStatus: ShopFulfillmentStatus;
}): Promise<void> {
  if (!supabase) return unavailable();
  const { error } = await supabase.rpc('gellatti_admin_shop_order_action_v1', {
    p_order_id: input.orderId,
    p_fulfillment_status: input.fulfillmentStatus,
  });
  if (error) throw new Error(error.message);
}
