/**
 * SCAN IMPORT 2.0 — app wiring for the isolated QA harness.
 *
 * The services layer is the only sanctioned place where UI reaches the backend client
 * (studio boundary guard). This module holds NO business logic: it builds the Scan Import 2.0
 * ports over the app client for the current session (guests get the read-only public path)
 * and exposes the current account id. The exact-identity authority is chosen by the caller
 * explicitly — there is no silent fallback between the dedicated RPC and the interim search path.
 */
import { supabase } from '@/lib/supabase/client';
import {
  createOpenFoodFactsEvidencePort,
  createSupabaseDiscoveryPort,
  createSupabaseV2Ports,
  type OfflineCachePort,
  type ScanImportV2Ports,
} from '@/scan-import-v2';

export type ScanImportV2ExactAuthority = 'gtin_rpc' | 'search_rpc';

/** true when the app client exists (env configured); the harness shows a plain message otherwise */
export function isScanImportV2BackendConfigured(): boolean {
  return supabase !== null;
}

export function createScanImportV2AppPorts(opts: {
  exactAuthority: ScanImportV2ExactAuthority;
  offlineCache: OfflineCachePort;
  externalTimeoutMs?: number;
}): ScanImportV2Ports | null {
  if (!supabase) return null;
  const client = supabase as never;
  return {
    ...createSupabaseV2Ports(client, { exactAuthority: opts.exactAuthority }),
    // exact-GTIN registry evidence (Open Food Facts, by code only) — the first source for an unknown code
    external: createOpenFoodFactsEvidencePort(),
    offlineCache: opts.offlineCache,
    externalTimeoutMs: opts.externalTimeoutMs ?? 8_000,
    discovery: createSupabaseDiscoveryPort(client),
  };
}

/** current signed-in account id, or null for guests / unconfigured backend */
export async function getScanImportV2AccountId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}
