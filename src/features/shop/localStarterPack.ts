import { supabase } from '@/lib/supabase/client';
import type { LocalPackSnapshot } from './localStarterPackPdf';

/**
 * The client half of the 0 EUR Local Starter Pack.
 *
 * It sends a COUNTRY and an ADDRESS and nothing else. Whether that country is
 * live, which components it owes, which suppliers to name and what the document
 * says are all resolved by `shop-local-pack` server-side — a client that could
 * name its own component list could print any link into a Gellatti-branded PDF.
 */

export interface LocalPackRequest {
  countryIso2: string;
  address: {
    name: string;
    line1: string;
    line2?: string;
    postalCode: string;
    city: string;
    state?: string;
    phone?: string;
  };
}

export interface LocalPackResult {
  orderId: string;
  orderNumber: string;
  country: string;
  components: number;
}

/** Raised with the function's own machine code so callers can map it to copy. */
export class LocalPackError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'LocalPackError';
  }
}

export async function createLocalStarterPackOrder(
  request: LocalPackRequest,
): Promise<LocalPackResult> {
  if (!supabase) throw new LocalPackError('backend_unavailable');
  const { data, error } = await supabase.functions.invoke('shop-local-pack', { body: request });
  if (error) {
    /* The function answers with a machine code in the body; surface it rather
       than the transport error, so "your country is not ready yet" never
       reaches a customer as "FunctionsHttpError". */
    let code = 'local_pack_failed';
    const context = (error as { context?: { json?: () => Promise<unknown> } }).context;
    try {
      const body = (await context?.json?.()) as { error?: string } | undefined;
      if (body?.error) code = body.error;
    } catch {
      /* keep the generic code */
    }
    throw new LocalPackError(code);
  }
  const result = data as LocalPackResult | null;
  if (!result?.orderId) throw new LocalPackError('local_pack_failed');
  return result;
}

/** The frozen snapshot for one order, for regenerating its PDF. */
export async function getLocalPackSnapshot(orderId: string): Promise<{
  snapshot: LocalPackSnapshot;
  orderNumber: string;
} | null> {
  if (!supabase) throw new LocalPackError('backend_unavailable');
  const { data, error } = await supabase
    .from('shop_orders')
    .select('order_number,local_pack_snapshot')
    .eq('id', orderId)
    .maybeSingle();
  if (error) throw error;
  const row = data as unknown as {
    order_number?: string;
    local_pack_snapshot?: LocalPackSnapshot | null;
  } | null;
  if (!row?.local_pack_snapshot) return null;
  return { snapshot: row.local_pack_snapshot, orderNumber: String(row.order_number ?? '') };
}
