import { supabase } from '@/lib/supabase/client';

/**
 * The client half of the 0 € document order ("Składniki bazy lodów" PDF).
 *
 * It names a DOCUMENT KEY and nothing else. Whether this account may order it, what it
 * costs (always 0), which version and which file the order is pinned to, and who may
 * download it are all decided server-side by `shop-digital-document`. The download link it
 * returns is short-lived and never stored here: every "Download PDF" asks for a fresh one.
 */

export const INFOPAK_DOCUMENT_KEY = 'GELATO_BASE_INGREDIENTS';

export type DocumentAvailabilityState = 'OFF' | 'TEST_ACCOUNTS_ONLY' | 'ON';

export interface DocumentAvailability {
  documentKey: string;
  state: DocumentAvailabilityState;
  /** Whether THIS caller may place an order now (false while signed out). */
  orderable: boolean;
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

export async function orderDocument(documentKey: string): Promise<DocumentOrderResult> {
  const result = await invoke<DocumentOrderResult | null>(
    {
      action: 'order',
      documentKey,
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

/** The account's active order for a document (the list comes newest first), if it has one. */
export function findActiveDocumentOrder(
  orders: readonly MyDocumentOrder[] | undefined,
  documentKey: string,
): MyDocumentOrder | null {
  return (
    orders?.find((order) => order.documentKey === documentKey && order.status !== 'cancelled') ??
    null
  );
}

/** Opens a fresh, short-lived download link in the current tab. */
export function openDocumentDownload(download: DocumentDownload): void {
  if (typeof window !== 'undefined') window.location.assign(download.url);
}
