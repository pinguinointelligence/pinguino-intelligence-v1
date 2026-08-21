import { describe, expect, it } from 'vitest';
import type { CatalogProductSearchHit } from '@/features/global-catalog/contracts';
import { validateBarcode } from './barcode';
import {
  DEFAULT_PRODUCT_SCAN_BUDGET,
  exactBarcodeMatch,
  nextEvidencePrompt,
  nextProductScanStep,
} from './pipeline';

const product: CatalogProductSearchHit = {
  id: 'product-1',
  entityKind: 'commercial_product',
  status: 'verified',
  displayName: 'Produkt',
  originalName: null,
  originalLanguage: null,
  brand: 'Marka',
  canonicalFamily: null,
  category: null,
  mappedIngredientId: null,
  markets: [],
  retailers: [],
  eans: ['036000291452'],
  aliases: [],
  favorite: false,
  recentlyUsedAt: null,
  usableInBase: false,
  usableAsTopping: true,
  missingFields: [],
  invalidFields: [],
  verificationMethod: 'automatic',
  publicData: {},
};

describe('Product Scan Session routing', () => {
  it('defaults to at most four useful images per session', () => {
    expect(DEFAULT_PRODUCT_SCAN_BUDGET.maxImages).toBe(4);
  });

  it('stops on an exact barcode before any paid vision call', () => {
    const barcode = validateBarcode('036000291452')!;
    expect(exactBarcodeMatch(barcode, [product])).toBe(product);
    expect(
      nextProductScanStep({
        barcode,
        barcodeCandidates: [product],
        imageCount: 2,
        visionCalls: 0,
        result: null,
        missingCriticalFields: [],
      }),
    ).toEqual({ kind: 'existing_product', product });
  });

  it('allows exactly one main call and one accurate retry', () => {
    const input = {
      barcode: null,
      barcodeCandidates: [],
      imageCount: 2,
      result: null,
      missingCriticalFields: [],
    } as const;
    expect(nextProductScanStep({ ...input, visionCalls: 0 })).toEqual({
      kind: 'vision',
      accurateRetryAllowed: true,
    });
    expect(nextProductScanStep({ ...input, visionCalls: 1 })).toEqual({
      kind: 'vision',
      accurateRetryAllowed: false,
    });
    expect(nextProductScanStep({ ...input, visionCalls: 2 })).toEqual({
      kind: 'blocked',
      reason: 'evidence_required',
    });
  });

  it('asks for the next concrete label surface', () => {
    expect(nextEvidencePrompt(['nutrition_salt'])).toContain('tabeli odżywczej');
    expect(nextEvidencePrompt(['ingredientsText'])).toContain('składu i alergenów');
    expect(nextEvidencePrompt(['product_identity'])).toContain('przodu opakowania');
  });
});
