/**
 * INTIMPORT canonical identity preflight.
 *
 * Tabular intake does not need Vision, but it must use the same exact-barcode
 * catalogue lookup as Scanner before paying for research. The result is adapted
 * to the synchronous Product Intelligence index; canonicalization itself stays
 * server-owned during catalog-submit.
 */
import type { IntimportCandidate } from '@/data/products/intimport';
import { validateBarcode } from '@/features/product-scanner/barcode';
import type { IntimportCanonicalIndex } from '@/features/product-intelligence/intimportIntelligence';
import { lookupExactBarcode, type ScanExactProduct } from '@/services/productScanner';

export interface IntimportCanonicalLookupResult {
  index: IntimportCanonicalIndex;
  matches: ReadonlyMap<string, ScanExactProduct>;
  attempted: number;
  failed: number;
}

export async function loadIntimportCanonicalExactMatches(
  candidates: readonly IntimportCandidate[],
  lookup: typeof lookupExactBarcode = lookupExactBarcode,
  concurrency = 4,
): Promise<IntimportCanonicalLookupResult> {
  const barcodes = [
    ...new Map(
      candidates.flatMap((candidate) => {
        const barcode = candidate.ean ? validateBarcode(candidate.ean) : null;
        return barcode ? [[barcode.lookupValue, barcode] as const] : [];
      }),
    ).values(),
  ];
  const matches = new Map<string, ScanExactProduct>();
  let failed = 0;
  const queue = [...barcodes];
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), Math.max(1, queue.length)) },
    async () => {
      for (;;) {
        const barcode = queue.shift();
        if (!barcode) return;
        try {
          const match = await lookup(barcode);
          if (match) matches.set(barcode.lookupValue, match);
        } catch {
          // A transient internal read failure must not turn into a false match.
          // The row proceeds through evidence/research and server canonicalization.
          failed += 1;
        }
      }
    },
  );
  await Promise.all(workers);

  return {
    index: {
      byBarcode: (values) =>
        values
          .flatMap((value) => {
            const barcode = validateBarcode(value);
            return barcode ? [matches.get(barcode.lookupValue)?.id ?? null] : [];
          })
          .find((value): value is string => value !== null) ?? null,
    },
    matches,
    attempted: barcodes.length,
    failed,
  };
}
