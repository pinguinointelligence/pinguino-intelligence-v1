/**
 * Reviewed enrichment WRITE service. Applies a reviewer-approved enrichment patch through the
 * canonical ingest transaction. The ONLY writable fields are the label-nutrition
 * columns (ENRICHABLE_FIELDS); everything else is stripped before the write.
 *
 * Safety (enforced here + by productEnrichment.security.test.ts):
 *   • routes the narrow patch through canonical ingest — never writes products or Mapper directly;
 *   • the patch is re-narrowed to ENRICHABLE_FIELDS, so pac_value/pod_value, identity
 *     (EAN/barcode/product_code), and status can NEVER be written;
 *   • a PI Verified product is NOT silently overwritten — it requires an explicit override;
 *   • every applied change creates an immutable canonical product_versions row;
 *   • no privileged key; no engine; no npac_value; PAC/POD is never computed.
 */
import { getProduct, updateProduct, updateProductUnlessStatus } from '@/services/products';
import { ENRICHABLE_FIELDS, type EnrichableField, type EnrichmentPatch } from '@/data/products/productEnrichment';
import type { ProductRow } from '@/data/products/productRow';

export interface ApplyEnrichmentOptions {
  /** Required to enrich a PI Verified product (never silent); pairs with a reason. */
  allowPiVerifiedOverride?: boolean;
  /** Free-text reviewer note recorded with the override decision. */
  reason?: string;
}

export interface ApplyEnrichmentResult {
  product: ProductRow;
  versionRecorded: true;
  appliedFields: EnrichableField[];
}

/** Keep only finite values for the enrichable nutrition fields — drop everything else. */
function narrowToEnrichable(patch: EnrichmentPatch): Partial<Record<EnrichableField, number>> {
  const safe: Partial<Record<EnrichableField, number>> = {};
  for (const field of ENRICHABLE_FIELDS) {
    const value = patch[field];
    if (typeof value === 'number' && Number.isFinite(value)) safe[field] = value;
  }
  return safe;
}

/**
 * Apply a reviewed enrichment patch to a product. The ingest transaction creates its immutable
 * version atomically. Throws if the patch
 * is empty after narrowing, if the product is missing/not owned, or if it is PI Verified and no
 * explicit override was given.
 */
export async function applyProductEnrichment(
  productId: string,
  patch: EnrichmentPatch,
  options: ApplyEnrichmentOptions = {},
): Promise<ApplyEnrichmentResult> {
  const safe = narrowToEnrichable(patch);
  const appliedFields = Object.keys(safe) as EnrichableField[];
  if (appliedFields.length === 0) {
    throw new Error('No enrichable nutrition fields selected.');
  }

  const current = await getProduct(productId);
  if (!current) throw new Error('Product not found or not owned.');

  if (current.status === 'pi_verified' && !options.allowPiVerifiedOverride) {
    throw new Error('This product is PI Verified — enrichment is blocked unless a reviewer explicitly overrides it.');
  }

  // WRITE-TIME guard (closes the check-then-write race): without an explicit override the update
  // itself refuses a row that became PI Verified after the read above.
  const product = options.allowPiVerifiedOverride
    ? await updateProduct(productId, safe)
    : await updateProductUnlessStatus(productId, safe, 'pi_verified');
  return { product, versionRecorded: true, appliedFields };
}
