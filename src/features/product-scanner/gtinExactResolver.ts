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
