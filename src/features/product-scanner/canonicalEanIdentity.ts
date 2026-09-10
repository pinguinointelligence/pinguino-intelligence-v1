/**
 * ONE EXACT EAN, ONE CANONICAL PRODUCT — and the owner's private row as an overlay beside it.
 *
 * `product_variants` carries a UNIQUE index on `ean` that ignores `is_current`
 * (`product_variants_ean_uniq ... WHERE ean IS NOT NULL`), so an EAN has exactly one variant row,
 * ever. There is no variant history: the row is RE-POINTED, never superseded by a second one.
 *
 * That single row is the whole address space for an EAN, and on 2026-09-07 it produced this:
 *
 *   home@home.com scanned 8402001042911 first  -> PM-ING-007193, private, 73.4, REVIEW
 *   pro@pro.com   scanned the same code later  -> PR-ING-007197, shared,  94.12, BASE_READY
 *   the variant row still pointed at the PM, and the PR had no variant row at all
 *
 * so the better shared product was unaddressable by anyone: its owner kept being handed the worse
 * private record, and every other account fell through to the full path — which is what created
 * the second product in the first place. Privacy was working; canonicalisation did not exist.
 *
 * These functions decide, from rows alone, which product IS the article and which is merely one
 * customer's overlay on it. No network, no ordering luck, no second source of truth.
 */

/** The subset of `products` this decision needs. */
export interface EanProductRow {
  id: string;
  product_code?: string | null;
  product_kind: string;
  visibility?: string | null;
  owner_user_id?: string | null;
  is_active?: boolean | null;
  merged_into_product_id?: string | null;
  canonical_verification_status?: string | null;
  /** Computed from current immutable facts by the caller when available. */
  publication_identity_eligible?: boolean | null;
}

export interface CanonicalEanResolution {
  /** The product identity the EAN resolves to for EVERY account, or null when there is none. */
  canonical: EanProductRow | null;
  /** The caller's OWN private row for this EAN, attached separately. Never anyone else's. */
  privateOverlay: EanProductRow | null;
  /** True when the variant row addresses something other than `canonical` and must be re-pointed. */
  variantNeedsRepoint: boolean;
  reason:
    | 'canonical_shared_product'
    | 'own_private_product_only'
    | 'foreign_private_product_only'
    | 'no_product';
}

const usable = (row: EanProductRow): boolean =>
  row.is_active !== false && (row.merged_into_product_id ?? null) === null;

/**
 * A shared registry product: the thing an EAN means to everybody. `mapper_reference` is not a
 * customer product and is handled by the caller's own earlier branch, so it is not considered here.
 */
export const isSharedCanonical = (row: EanProductRow): boolean =>
  usable(row) &&
  row.canonical_verification_status !== 'blocked' &&
  row.publication_identity_eligible !== false &&
  row.product_kind === 'commercial_product' &&
  row.visibility === 'shared';

export const isPrivateProvisional = (row: EanProductRow): boolean =>
  usable(row) && row.product_kind === 'customer_provisional';

/**
 * @param rows every product carrying this EAN — normally one or two.
 * @param actorUserId the signed-in account, or null.
 * @param variantProductId what the canonical variant row currently addresses.
 */
export function resolveCanonicalEanIdentity(
  rows: readonly EanProductRow[],
  actorUserId: string | null,
  variantProductId: string | null,
): CanonicalEanResolution {
  const live = rows.filter(usable);
  const shared = live.filter(isSharedCanonical);
  /*
    More than one shared row for one EAN is the state this whole change exists to prevent, and it
    is not resolvable from row data alone. Rather than pick by ordering — the exact failure mode
    the owner rejected — the OLDEST is kept as the identity, because that is the row other records
    have had the longest to reference, and the situation is reported rather than smoothed over.
  */
  const canonical = shared.length > 0 ? (shared[0] ?? null) : null;

  const privateOverlay =
    actorUserId === null
      ? null
      : (live.find((row) => isPrivateProvisional(row) && row.owner_user_id === actorUserId) ??
        null);

  if (canonical) {
    return {
      canonical,
      // A customer who first saved this article privately keeps that row, beside the shared truth.
      privateOverlay: privateOverlay && privateOverlay.id !== canonical.id ? privateOverlay : null,
      variantNeedsRepoint: variantProductId !== null && variantProductId !== canonical.id,
      reason: 'canonical_shared_product',
    };
  }

  // No shared product yet. The owner's own private row is still their product (contract point 3:
  // until a shared PR exists, the variant may legitimately address a private PM).
  if (privateOverlay) {
    return {
      canonical: privateOverlay,
      privateOverlay: null,
      variantNeedsRepoint: false,
      reason: 'own_private_product_only',
    };
  }

  // Somebody else's private row, and nothing shared. It must not be returned, and — the part that
  // was broken — it must not be treated as an answer either: the caller has no product here.
  if (live.some(isPrivateProvisional)) {
    return {
      canonical: null,
      privateOverlay: null,
      variantNeedsRepoint: false,
      reason: 'foreign_private_product_only',
    };
  }

  return {
    canonical: null,
    privateOverlay: null,
    variantNeedsRepoint: false,
    reason: 'no_product',
  };
}

/** More than one shared registry row for one EAN — never expected, always worth reporting. */
export const conflictingSharedProducts = (rows: readonly EanProductRow[]): EanProductRow[] => {
  const shared = rows.filter(isSharedCanonical);
  return shared.length > 1 ? shared : [];
};
