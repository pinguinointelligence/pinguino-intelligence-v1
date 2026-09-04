/**
 * SCAN IMPORT 2.0 — Supabase adapters (staging development only; not wired to any UI).
 *
 * ONE exact-by-code data path: `search_products_v1(p_query = <digits>)`, whose numeric qualification is
 * exact equality against the catalogue's `eans[]` (products.ean_code_normalized ∪ current product_variants.ean)
 * — see the forensic audit §3. It runs as the caller's own JWT from the browser and from any server path,
 * so client and server can only differ by account visibility, and that difference is explicit
 * (`guestScope`). Direct table reads are NOT used: RLS on `products` exposes own rows only (verified on
 * staging 2026-09-04). Catalogue, behaviour and price ports read the SAME memoised RPC row.
 *
 * Known limits (documented in SCAN_IMPORT_V2_IMPLEMENTATION_STATUS.md): the RPC does not expose
 * ownership/visibility, so `private_own` twins cannot be told apart from `canonical_shared` here; guests
 * have no exact path (the RPC is revoked from anon). A dedicated exact-identity RPC is the next step.
 */
import type {
  BehaviourPort,
  CatalogPort,
  ExactCandidate,
  ImportOutcome,
  ImportPort,
  OfflineCacheEntry,
  OfflineCachePort,
  PreferencePort,
  PricePort,
  PriceState,
  RequestContext,
} from '../contracts';
import { NetworkError } from '../contracts';

export interface SupabaseLike {
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
  from(table: string): {
    upsert(
      values: Record<string, unknown>,
      options?: { onConflict?: string },
    ): PromiseLike<{ error: { message: string } | null }>;
  };
}

interface SearchRow {
  id: string;
  current_version_id: string | null;
  entity_kind: string;
  status: string | null;
  provenance: string | null;
  display_name: string;
  brand: string | null;
  mapped_ingredient_id: string | null;
  markets: string[] | null;
  eans: string[] | null;
  usable_in_base: boolean | null;
  main_allowed: boolean | null;
  usable_as_topping: boolean | null;
  blocked_reason: string | null;
  public_data: Record<string, unknown> | null;
  private_price: number | null;
  private_currency: string | null;
}

const NETWORK = /fetch failed|failed to fetch|network|econn|enotfound|timeout/i;

function asRows(data: unknown): SearchRow[] {
  return Array.isArray(data) ? (data as SearchRow[]) : [];
}

export function candidateFromRow(row: SearchRow, keys: readonly string[]): ExactCandidate | null {
  const eans = Array.isArray(row.eans) ? row.eans : [];
  const ean = eans.find((e) => keys.includes(e));
  if (!ean) return null; // the RPC also matches names/aliases; only an exact EAN hit is an identity
  const provenance = row.provenance ?? '';
  const provisional =
    row.entity_kind === 'customer_provisional' || provenance.startsWith('customer_added');
  const pd = row.public_data ?? {};
  const pi = (pd['productIntelligence'] as Record<string, unknown> | undefined) ?? undefined;
  const markets = Array.isArray(row.markets)
    ? row.markets.filter((m) => typeof m === 'string')
    : [];
  return {
    productId: row.id,
    productCode: typeof pd['productCode'] === 'string' ? (pd['productCode'] as string) : null,
    displayName: row.display_name,
    brand: row.brand,
    ean,
    strength: provisional ? 'provisional_linked' : 'canonical_shared',
    entityKind:
      row.entity_kind === 'pi_base' || row.entity_kind === 'customer_provisional'
        ? row.entity_kind
        : 'commercial_product',
    engineReady:
      pi?.['engineUsable'] === true ||
      row.usable_in_base === true ||
      row.usable_as_topping === true,
    mapperSlotId: row.mapped_ingredient_id ?? null,
    country: markets.length === 1 ? markets[0]! : null,
    currentVersionId: row.current_version_id,
    evidence: {
      status: row.status,
      provenance: row.provenance,
      usableInBase: row.usable_in_base,
      usableAsTopping: row.usable_as_topping,
      mainAllowed: row.main_allowed,
      blockedReason: row.blocked_reason,
      lifecycleRejected: pd['lifecycleRejected'] === true,
      hasProductIntelligence: Boolean(pi),
      markets,
    },
  };
}

/** One adapter session shares the memoised RPC rows between the catalogue, behaviour and price ports. */
export function createSupabaseV2Ports(client: SupabaseLike): {
  catalog: CatalogPort;
  behaviour: BehaviourPort;
  price: PricePort;
  preferences: PreferencePort;
  importer: ImportPort;
  rowsById: ReadonlyMap<string, SearchRow>;
} {
  const rowsById = new Map<string, SearchRow>();

  const searchExact = async (key: string): Promise<SearchRow[]> => {
    const { data, error } = await client.rpc('search_products_v1', {
      p_query: key,
      p_context: 'BASE',
      p_market_scope: 'global',
      p_selected_markets: [],
      p_favorites_only: false,
      p_product_profile: null,
      p_entity_kind: null,
      p_limit: 50,
      p_cursor: 0,
      p_token_groups: [],
    });
    if (error) {
      if (NETWORK.test(error.message)) throw new NetworkError(error.message);
      throw new Error(`lookup_failed: ${error.message}`);
    }
    return asRows(data);
  };

  const catalog: CatalogPort = {
    async exactByKeys(keys, ctx: RequestContext) {
      // guests: the exact RPC is revoked from anon — no exact path, explicitly (never a silent empty)
      if (ctx.accountId === null) return [];
      const out = new Map<string, ExactCandidate>();
      for (const key of keys) {
        for (const row of await searchExact(key)) {
          rowsById.set(row.id, row);
          const c = candidateFromRow(row, keys);
          if (c && !out.has(c.productId)) out.set(c.productId, c);
        }
      }
      return [...out.values()];
    },
  };

  const behaviour: BehaviourPort = {
    async classify(productId) {
      const row = rowsById.get(productId);
      if (!row) return { outcome: 'unknown_requires_review', bindingId: null };
      const pd = row.public_data ?? {};
      if (pd['lifecycleRejected'] === true) return { outcome: 'blocked', bindingId: null };
      const pi = pd['productIntelligence'] as Record<string, unknown> | undefined;
      if (pi && pi['productBehaviorAuthority'])
        return { outcome: 'classified', bindingId: row.current_version_id };
      return { outcome: 'unknown_requires_review', bindingId: null };
    },
  };

  const price: PricePort = {
    async priceState(productId): Promise<PriceState> {
      const row = rowsById.get(productId);
      if (
        row &&
        typeof row.private_price === 'number' &&
        Number.isFinite(row.private_price) &&
        row.private_currency
      )
        return {
          state: 'known',
          pricePerKg: row.private_price,
          currency: row.private_currency,
          source: 'private',
        };
      return { state: 'missing', pricePerKg: null, currency: null, source: 'missing' };
    },
  };

  const slotRowToCandidate = (r: Record<string, unknown>): ExactCandidate => ({
    productId: String(r['id']),
    productCode: null,
    displayName: String(r['display_name'] ?? ''),
    brand: (r['brand'] as string | null) ?? null,
    ean:
      Array.isArray(r['eans']) && typeof (r['eans'] as unknown[])[0] === 'string'
        ? ((r['eans'] as string[])[0] as string)
        : '',
    strength: 'canonical_shared',
    entityKind: r['entity_kind'] === 'pi_base' ? 'pi_base' : 'commercial_product',
    engineReady: true,
    mapperSlotId: (r['requested_mapper_ingredient_id'] as string | null) ?? null,
    country: (r['resolution_country'] as string | null) ?? null,
    currentVersionId: (r['current_version_id'] as string | null) ?? null,
  });

  const preferences: PreferencePort = {
    async preferredExactForSlot(slotId, ctx) {
      if (ctx.accountId === null) return null;
      const { data, error } = await client.rpc('get_user_preferred_product_for_slot_v1', {
        p_mapper_ingredient_id: slotId,
      });
      if (error || typeof data !== 'string') return null;
      const row = rowsById.get(data);
      return row ? candidateFromRow(row, row.eans ?? []) : ({ productId: data } as ExactCandidate);
    },
    async countryDefaultsForSlot(slotId, productCountry) {
      const { data, error } = await client.rpc('resolve_country_product_slots_v1', {
        p_mapper_ingredient_ids: [slotId],
        p_product_country: productCountry,
        p_product_profile: null,
      });
      if (error) return { primary: null, fallbacks: [] };
      const rows = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
      const same = rows.filter(
        (r) => productCountry === null || r['resolution_country'] === productCountry,
      );
      const primary = same.find((r) => r['resolution_source'] === 'COUNTRY_PRIMARY_DEFAULT');
      const fallbacks = same
        .filter((r) => r['resolution_source'] === 'COUNTRY_SAFE_FALLBACK')
        .map(slotRowToCandidate);
      return { primary: primary ? slotRowToCandidate(primary) : null, fallbacks };
    },
  };

  /**
   * LINK ONLY. V2 never creates a product: an exact resolution links the account to the existing
   * product through `user_product_relations` (PK user_id, product_id → idempotent). Creating a new
   * product remains the legacy finalize flow (needs an analysed scan session) — owner decision pending.
   */
  const importer: ImportPort = {
    async importOrLink({ product, ctx }): Promise<ImportOutcome> {
      if (ctx.accountId === null) throw new Error('guest_cannot_import');
      const { error } = await client
        .from('user_product_relations')
        .upsert(
          { user_id: ctx.accountId, product_id: product.productId, favorite: true },
          { onConflict: 'user_id,product_id' },
        );
      if (error) throw new Error(`customer_product_link_failed: ${error.message}`);
      return {
        kind: 'existing_product',
        productId: product.productId,
        productCode: product.productCode,
        created: false,
      };
    },
  };

  return { catalog, behaviour, price, preferences, importer, rowsById };
}

/** Offline cache: IndexedDB when available (browser), in-memory otherwise. Entries carry the version pointer and a TTL. */
export const OFFLINE_CACHE_TTL_MS = 30 * 24 * 3600 * 1000; // PROVISIONAL — owner may shorten

interface StoredEntry {
  entry: OfflineCacheEntry;
  resolvedAt: number;
  versionId: string | null;
}

export function createOfflineCache(
  options: { now?: () => number; ttlMs?: number; store?: Map<string, StoredEntry> } = {},
): OfflineCachePort & {
  size(): number;
} {
  const now = options.now ?? (() => Date.now());
  const ttl = options.ttlMs ?? OFFLINE_CACHE_TTL_MS;
  const store = options.store ?? new Map<string, StoredEntry>();
  const key = (accountId: string | null, gtin13: string) => `${accountId ?? 'guest'}:${gtin13}`;
  return {
    async get(accountId, canonicalGtin13) {
      const hit = store.get(key(accountId, canonicalGtin13));
      if (!hit) return null;
      if (now() - hit.resolvedAt > ttl) {
        store.delete(key(accountId, canonicalGtin13));
        return null;
      }
      return hit.entry;
    },
    async put(accountId, entry) {
      const gtin13 =
        entry.candidate.ean.length === 12
          ? `0${entry.candidate.ean}`
          : entry.candidate.ean.length === 8
            ? `00000${entry.candidate.ean}`
            : entry.candidate.ean;
      store.set(key(accountId, gtin13), {
        entry,
        resolvedAt: now(),
        versionId: entry.candidate.currentVersionId ?? null,
      });
    },
    size: () => store.size,
  };
}
