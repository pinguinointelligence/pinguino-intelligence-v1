/**
 * Scanner 1.4 — the shared contract for the one exact GELLATTI resolver.
 *
 * The database RPC owns exact equality, lifecycle, publication and account visibility. These
 * helpers only describe the requests made to that RPC and turn its explicit rows into the same
 * candidate/result shape for the browser V2 path and product-scan-analyze. They never read or
 * write catalog tables and never perform fuzzy matching.
 */

export type ExactSymbology = 'EAN-13' | 'EAN-8' | 'UPC-A' | 'UPC-E';

export interface ExactLookupIdentity {
  symbology: ExactSymbology;
  canonicalGtin13: string;
  lookupKeys: readonly string[];
  rawValue: string | null;
}

export interface GtinExactRow {
  product_id: string;
  product_code: string | null;
  display_name: string;
  brand: string | null;
  matched_gtin: string;
  matched_from: string;
  product_kind: string;
  entity_kind: string;
  visibility: string;
  ownership: 'own' | 'linked' | 'public';
  current_version_id: string | null;
  verification_status: string | null;
  product_country: string | null;
  markets: string[] | null;
  mapper_ingredient_id: string | null;
  engine_usable: boolean;
  lifecycle_rejected: boolean;
  /** State and version facts are returned by the same SQL snapshot as the identity. */
  is_active: boolean;
  merged_into_product_id: string | null;
  current_version_facts: Record<string, unknown>;
}

export interface ExactRpcClient {
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export type ExactResolverErrorCode = 'UNAVAILABLE' | 'MALFORMED_RESPONSE';

export class ExactResolverError extends Error {
  readonly code: ExactResolverErrorCode;
  readonly retryable: boolean;

  constructor(code: ExactResolverErrorCode, message: string, retryable: boolean) {
    super(message);
    this.name = 'ExactResolverError';
    this.code = code;
    this.retryable = retryable;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';

/**
 * The RPC response is an authority boundary. A non-array or partially shaped response is an
 * unavailable authority, not an empty catalogue. This prevents catch/default branches from
 * manufacturing NO_EXACT_PRODUCT out of transport, permission or schema failures.
 */
export function isGtinExactRow(value: unknown): value is GtinExactRow {
  if (!isRecord(value)) return false;
  return (
    typeof value.product_id === 'string' &&
    isNullableString(value.product_code) &&
    typeof value.display_name === 'string' &&
    isNullableString(value.brand) &&
    typeof value.matched_gtin === 'string' &&
    /^\d{8,13}$/.test(value.matched_gtin) &&
    typeof value.matched_from === 'string' &&
    typeof value.product_kind === 'string' &&
    typeof value.entity_kind === 'string' &&
    typeof value.visibility === 'string' &&
    (value.ownership === 'own' || value.ownership === 'linked' || value.ownership === 'public') &&
    typeof value.current_version_id === 'string' &&
    isNullableString(value.verification_status) &&
    isNullableString(value.product_country) &&
    (value.markets === null ||
      (Array.isArray(value.markets) && value.markets.every((market) => typeof market === 'string'))) &&
    isNullableString(value.mapper_ingredient_id) &&
    typeof value.engine_usable === 'boolean' &&
    typeof value.lifecycle_rejected === 'boolean' &&
    typeof value.is_active === 'boolean' &&
    isNullableString(value.merged_into_product_id) &&
    isRecord(value.current_version_facts)
  );
}

export function parseGtinExactRows(data: unknown): GtinExactRow[] {
  if (!Array.isArray(data))
    throw new ExactResolverError(
      'MALFORMED_RESPONSE',
      'MALFORMED_RESPONSE: exact resolver did not return an array',
      false,
    );
  const rows: GtinExactRow[] = [];
  for (const [index, value] of data.entries()) {
    if (!isGtinExactRow(value))
      throw new ExactResolverError(
        'MALFORMED_RESPONSE',
        `MALFORMED_RESPONSE: exact resolver row ${index} failed the response contract`,
        false,
      );
    rows.push(value);
  }
  return rows;
}

const TRANSIENT_EXACT_ERROR =
  /timeout|timed out|fetch failed|failed to fetch|network|econn|enotfound|reset|temporar|\b429\b|\b503\b/i;
const AUTHORIZATION_ERROR = /permission|forbidden|unauthori[sz]ed|rls|jwt|auth/i;

export function isRetryableExactResolverError(error: unknown): boolean {
  if (error instanceof ExactResolverError) return error.retryable;
  const message = error instanceof Error ? error.message : String(error);
  return !AUTHORIZATION_ERROR.test(message) && TRANSIENT_EXACT_ERROR.test(message);
}

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new ExactResolverError('UNAVAILABLE', 'exact resolver timeout', true)),
      timeoutMs,
    );
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** One bounded retry for a transient exact lookup; errors never become an empty row set. */
export async function exactRowsWithRetry(
  client: ExactRpcClient,
  query: ExactLookupQuery,
  options: { timeoutMs?: number } = {},
): Promise<GtinExactRow[]> {
  const timeoutMs = options.timeoutMs ?? 3_000;
  let lastError: unknown = new ExactResolverError('UNAVAILABLE', 'exact resolver unavailable', true);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await withTimeout(
        client.rpc('resolve_exact_products_by_gtin_v1', {
          p_gtin: query.gtin,
          p_symbology: query.symbology,
        }),
        timeoutMs,
      );
      if (response.error) {
        const retryable = isRetryableExactResolverError(new Error(response.error.message));
        throw new ExactResolverError(
          'UNAVAILABLE',
          `exact resolver failed: ${response.error.message}`,
          retryable,
        );
      }
      return parseGtinExactRows(response.data);
    } catch (error) {
      const normalizedError =
        error instanceof ExactResolverError
          ? error
          : new ExactResolverError(
              'UNAVAILABLE',
              `exact resolver request failed: ${error instanceof Error ? error.message : String(error)}`,
              isRetryableExactResolverError(error),
            );
      lastError = normalizedError;
      if (attempt === 1 || !normalizedError.retryable) throw normalizedError;
    }
  }
  throw lastError;
}

export interface ExactCandidateLike {
  productId: string;
  productCode: string | null;
  displayName: string;
  brand: string | null;
  ean: string;
  strength: 'canonical_shared' | 'provisional_linked' | 'private_own';
  entityKind: 'commercial_product' | 'customer_provisional';
  engineReady: boolean;
  mapperSlotId: string | null;
  country: string | null;
  currentVersionId: string | null;
  evidence: Readonly<Record<string, unknown>>;
}

export interface ExactLookupQuery {
  gtin: string;
  symbology: ExactSymbology | null;
}

/** Canonical first; an alias is consulted only when the canonical query returns no user product. */
export function exactLookupQueries(identity: ExactLookupIdentity): readonly ExactLookupQuery[] {
  const alias =
    identity.symbology === 'EAN-8'
      ? identity.rawValue && /^\d{8}$/.test(identity.rawValue)
        ? identity.rawValue
        : identity.canonicalGtin13.slice(5)
      : identity.symbology === 'UPC-A'
        ? identity.rawValue && /^\d{12}$/.test(identity.rawValue)
          ? identity.rawValue
          : identity.canonicalGtin13.slice(1)
        : identity.symbology === 'UPC-E'
          ? (identity.lookupKeys.find((key) => key.length === 12) ?? '')
          : '';

  const queries: ExactLookupQuery[] = [{ gtin: identity.canonicalGtin13, symbology: null }];
  if (alias && alias !== identity.canonicalGtin13)
    queries.push({ gtin: alias, symbology: identity.symbology });
  return queries;
}

/**
 * Defensive response-boundary filter. A stale or misconfigured RPC must not turn an internal
 * Mapper row, a foreign private row, or a blocked row into a customer product exact match.
 */
export function candidateFromGtinRow(row: GtinExactRow): ExactCandidateLike | null {
  if (
    row.product_kind === 'mapper_reference' ||
    row.entity_kind === 'pi_base' ||
    row.verification_status === 'blocked' ||
    row.lifecycle_rejected ||
    !row.is_active ||
    row.merged_into_product_id !== null ||
    (row.ownership === 'public' && row.visibility !== 'shared')
  )
    return null;

  const isShared = row.product_kind === 'commercial_product' && row.visibility === 'shared';
  const isAccountScoped = row.ownership === 'own' || row.ownership === 'linked';
  if (!isShared && !isAccountScoped) return null;
  if (row.product_kind !== 'commercial_product' && row.product_kind !== 'customer_provisional')
    return null;

  const strength: ExactCandidateLike['strength'] = isShared
    ? 'canonical_shared'
    : row.entity_kind === 'customer_provisional' || row.ownership === 'linked'
      ? 'provisional_linked'
      : 'private_own';
  const markets = Array.isArray(row.markets)
    ? row.markets.filter((market): market is string => typeof market === 'string')
    : [];

  return {
    productId: row.product_id,
    productCode: row.product_code,
    displayName: row.display_name,
    brand: row.brand,
    ean: row.matched_gtin,
    strength,
    entityKind:
      row.entity_kind === 'customer_provisional' || row.product_kind === 'customer_provisional'
        ? 'customer_provisional'
        : 'commercial_product',
    engineReady: row.engine_usable === true,
    mapperSlotId: row.mapper_ingredient_id ?? null,
    country: row.product_country ?? (markets.length === 1 ? markets[0]! : null),
    currentVersionId: row.current_version_id,
    evidence: {
      matchedFrom: row.matched_from,
      visibility: row.visibility,
      ownership: row.ownership,
      verificationStatus: row.verification_status,
      lifecycleRejected: Boolean(row.lifecycle_rejected),
      markets,
    },
  };
}

const strengthScore = (candidate: ExactCandidateLike): number => {
  const base =
    candidate.strength === 'canonical_shared'
      ? 300
      : candidate.strength === 'provisional_linked'
        ? 200
        : 100;
  return base + (candidate.entityKind === 'commercial_product' ? 2 : 0);
};

export type ExactResolverVerdict =
  | { kind: 'EXACT_PRODUCT'; product: ExactCandidateLike }
  | { kind: 'NO_EXACT_PRODUCT' }
  | { kind: 'EXACT_CONFLICT'; candidates: readonly ExactCandidateLike[] };

/** Shared server/browser precedence: shared commercial identity, then account-scoped product. */
export function exactResolverVerdict(
  candidates: readonly ExactCandidateLike[],
): ExactResolverVerdict {
  const unique = [
    ...new Map(candidates.map((candidate) => [candidate.productId, candidate])).values(),
  ];
  if (unique.length === 0) return { kind: 'NO_EXACT_PRODUCT' };
  const strongest = Math.max(...unique.map(strengthScore));
  const top = unique.filter((candidate) => strengthScore(candidate) === strongest);
  return top.length === 1
    ? { kind: 'EXACT_PRODUCT', product: top[0]! }
    : { kind: 'EXACT_CONFLICT', candidates: top };
}
