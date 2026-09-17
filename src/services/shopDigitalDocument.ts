import { supabase } from '@/lib/supabase/client';

/**
 * The client half of the 0 € document order ("Składniki bazy lodów" PDF).
 *
 * It names a DOCUMENT KEY and nothing else. Whether this account may order it, what it
 * costs (always 0), which version and which file the order is pinned to, and who may
 * download it are all decided server-side by `shop-digital-document`. The download link it
 * returns is short-lived and never stored here: every "Download PDF" asks for a fresh one.
 */

/** The market-less base guide (v1.1, English). Kept for its existing orders; no longer offered. */
export const INFOPAK_DOCUMENT_KEY = 'GELATO_BASE_INGREDIENTS';

/**
 * The 0 € document on offer: one PDF per market and language, listing the seven Starter Pack
 * items with that market's local equivalents (owner correction 2026-09-17).
 */
export const STARTER_LOCAL_DOCUMENT_KEY = 'STARTER_PACK_LOCAL_GUIDE';

export type DocumentAvailabilityState = 'OFF' | 'TEST_ACCOUNTS_ONLY' | 'ON';

export interface DocumentAvailability {
  documentKey: string;
  state: DocumentAvailabilityState;
  /** Whether THIS caller may place an order now (false while signed out). */
  orderable: boolean;
}

/** One language variant of a market document, as the server answers for THIS caller. */
export interface DocumentVariant {
  language: string;
  state: DocumentAvailabilityState;
  orderable: boolean;
}

/** A market with at least one variant that is not OFF. */
export interface DocumentMarket {
  countryIso2: string;
  variants: DocumentVariant[];
}

/** Which market document to order: a market and one of its languages. */
export interface DocumentMarketChoice {
  countryIso2: string;
  language: string;
}

export interface DocumentDownload {
  url: string;
  fileName: string;
  expiresInSeconds: number;
}

export interface DocumentOrderResult {
  orderId: string;
  orderNumber: string;
  created: boolean;
  documentVersion: string;
  countryIso2: string | null;
  language: string | null;
  download: DocumentDownload;
  emailQueued: boolean;
}

export interface MyDocumentOrder {
  id: string;
  orderNumber: string;
  status: string;
  createdAt: string;
  totalCents: number;
  currency: string;
  documentKey: string;
  documentVersion: string;
  language: string;
  countryIso2: string | null;
  emailStatus: string | null;
}

export interface AdminDocumentOrder {
  id: string;
  orderNumber: string;
  email: string;
  userId: string | null;
  status: string;
  createdAt: string;
  documentKey: string;
  documentVersion: string;
  documentSha256: string;
  countryIso2: string | null;
  language: string | null;
  qaAccount: boolean;
  emailStatus: string | null;
}

/** Raised with the function's own machine code so callers can map it to copy. */
export class DocumentOrderError extends Error {
  constructor(
    readonly code: string,
    readonly orderId: string | null = null,
  ) {
    super(code);
    this.name = 'DocumentOrderError';
  }
}

const invoke = async <T>(body: Record<string, unknown>, fallback: string): Promise<T> => {
  if (!supabase) throw new DocumentOrderError('backend_unavailable');
  const { data, error } = await supabase.functions.invoke('shop-digital-document', { body });
  if (error) {
    let code = fallback;
    let orderId: string | null = null;
    const context = (error as { context?: { json?: () => Promise<unknown> } }).context;
    try {
      const payload = (await context?.json?.()) as { error?: string; orderId?: string } | undefined;
      if (payload?.error) code = payload.error;
      if (payload?.orderId) orderId = payload.orderId;
    } catch {
      /* keep the fallback code */
    }
    throw new DocumentOrderError(code, orderId);
  }
  return data as T;
};

export async function getDocumentAvailability(documentKey: string): Promise<DocumentAvailability> {
  if (!supabase) throw new DocumentOrderError('backend_unavailable');
  const { data, error } = await supabase.rpc('gellatti_shop_document_availability_v1', {
    p_document_key: documentKey,
  });
  if (error) throw new DocumentOrderError('availability_unavailable');
  const row = (data ?? {}) as Partial<DocumentAvailability>;
  return {
    documentKey,
    state: row.state === 'ON' || row.state === 'TEST_ACCOUNTS_ONLY' ? row.state : 'OFF',
    orderable: row.orderable === true,
  };
}

const isState = (value: unknown): value is DocumentAvailabilityState =>
  value === 'ON' || value === 'TEST_ACCOUNTS_ONLY' || value === 'OFF';

/** Markets (and their language variants) that currently offer this document. */
export async function getDocumentMarkets(documentKey: string): Promise<DocumentMarket[]> {
  if (!supabase) throw new DocumentOrderError('backend_unavailable');
  const { data, error } = await supabase.rpc('gellatti_shop_document_markets_v1', {
    p_document_key: documentKey,
  });
  if (error) throw new DocumentOrderError('availability_unavailable');
  const rows = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>;
  return rows
    .map((row) => ({
      countryIso2: String(row.countryIso2 ?? ''),
      variants: (Array.isArray(row.variants) ? row.variants : [])
        .map((variant: Record<string, unknown>) => ({
          language: String(variant.language ?? ''),
          state: isState(variant.state) ? variant.state : ('OFF' as const),
          orderable: variant.orderable === true,
        }))
        .filter((variant) => variant.language !== '' && variant.state !== 'OFF'),
    }))
    .filter((market) => /^[A-Z]{2}$/.test(market.countryIso2) && market.variants.length > 0);
}

export async function orderDocument(
  documentKey: string,
  market?: DocumentMarketChoice,
): Promise<DocumentOrderResult> {
  const result = await invoke<DocumentOrderResult | null>(
    {
      action: 'order',
      documentKey,
      ...(market ? { countryIso2: market.countryIso2, language: market.language } : {}),
      /* Only picks which of the app's own addresses a notification links to; the
         function checks it against a closed list and ignores anything else. */
      origin: typeof window === 'undefined' ? '' : window.location.origin,
    },
    'order_failed',
  );
  if (!result?.orderId || !result.download?.url) {
    throw new DocumentOrderError('order_failed', result?.orderId ?? null);
  }
  return result;
}

export async function getDocumentDownload(orderId: string): Promise<DocumentDownload> {
  const result = await invoke<{ download?: DocumentDownload } | null>(
    { action: 'download', orderId },
    'download_failed',
  );
  if (!result?.download?.url) throw new DocumentOrderError('download_failed', orderId);
  return result.download;
}

export async function getMyDocumentOrders(): Promise<MyDocumentOrder[]> {
  if (!supabase) throw new DocumentOrderError('backend_unavailable');
  const { data, error } = await supabase.rpc('gellatti_my_shop_documents_v1');
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as MyDocumentOrder[];
}

export async function getAdminDocumentOrders(): Promise<AdminDocumentOrder[]> {
  if (!supabase) throw new DocumentOrderError('backend_unavailable');
  const { data, error } = await supabase.rpc('gellatti_admin_shop_documents_v1', { p_limit: 200 });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as AdminDocumentOrder[];
}

/**
 * The account's active order for a document (the list comes newest first), if it has one.
 * For a market document, only an order for that market and language counts.
 */
export function findActiveDocumentOrder(
  orders: readonly MyDocumentOrder[] | undefined,
  documentKey: string,
  market?: DocumentMarketChoice | null,
): MyDocumentOrder | null {
  return (
    orders?.find(
      (order) =>
        order.documentKey === documentKey &&
        order.status !== 'cancelled' &&
        (!market ||
          (order.countryIso2 === market.countryIso2 && order.language === market.language)),
    ) ?? null
  );
}

/** Opens a fresh, short-lived download link in the current tab. */
export function openDocumentDownload(download: DocumentDownload): void {
  if (typeof window !== 'undefined') window.location.assign(download.url);
}
