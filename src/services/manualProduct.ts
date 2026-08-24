import { validateBarcode } from '@/features/product-scanner/barcode';
import {
  ingestProduct,
  productIngestIdempotencyKey,
  type ProductIngestResult,
} from '@/services/productIngest';

export interface ManualProductInput {
  displayName: string;
  brand: string | null;
  explicitlyUnbranded: boolean;
  ean: string | null;
  packageSize: string;
  category: string | null;
  nutrition: {
    energyKcal: number;
    fat: number;
    carbohydrate: number;
    sugars: number;
    protein: number;
    salt: number;
    fibre?: number | null;
  };
  ingredientsText: string;
  allergensText: string | null;
}

/** Manual PM entry is a thin adapter into the same canonical ingest used by
 * Scanner and PR. The browser declares label facts; the server recomputes the
 * profile, provenance, accuracy and PM identity. */
export async function createManualProduct(input: ManualProductInput): Promise<ProductIngestResult> {
  const displayName = input.displayName.trim();
  const brand = input.brand?.trim() || null;
  const ingredientsText = input.ingredientsText.trim();
  if (!displayName || (!brand && !input.explicitlyUnbranded) || !ingredientsText) {
    throw new Error('Uzupełnij nazwę, markę i skład produktu.');
  }
  const suppliedEan = input.ean?.trim() || null;
  const barcode = suppliedEan ? validateBarcode(suppliedEan) : null;
  if (suppliedEan && !barcode) throw new Error('Kod EAN/GTIN ma nieprawidłową sumę kontrolną.');
  const canonicalInput: Record<string, unknown> = {
    productKind: 'commercial_product',
    displayName,
    originalName: displayName,
    brand,
    explicitlyUnbranded: input.explicitlyUnbranded,
    category: input.category?.trim() || null,
    ean: barcode?.lookupValue ?? null,
    barcode: barcode?.lookupValue ?? null,
    provenance: 'manual_completion',
    manualProductProfileProposal: { version: 1 },
    facts: {
      packageSize: input.packageSize.trim() || null,
      nutrition: { basis: 'per_100g', ...input.nutrition },
      nutritionBasis: 'per_100g',
      ingredientsText,
      allergensText: input.allergensText?.trim() || null,
    },
  };
  const source = barcode ? 'barcode' : 'manual';
  return ingestProduct({
    source,
    idempotencyKey: await productIngestIdempotencyKey(source, canonicalInput, 'manual-pm-v1'),
    input: canonicalInput,
    evidence: {
      provenance: 'USER_CONFIRMED',
      fields: [
        'identity', 'brand', 'netQuantity', 'energyKcal', 'fat', 'carbohydrate',
        'sugars', 'protein', 'salt', 'ingredients',
        ...(input.allergensText?.trim() ? ['allergens'] : []),
        ...(barcode ? ['barcode'] : []),
      ],
    },
    privateOverlay: {},
  });
}
