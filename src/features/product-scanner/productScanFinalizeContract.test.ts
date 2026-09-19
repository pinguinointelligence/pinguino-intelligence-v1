import { describe, expect, it } from 'vitest';
import {
  PRODUCT_SCAN_FINALIZE_CONTRACT_V2,
  resolveProductScanFinalizeContract,
  withProductScanFinalizeV2Contract,
} from './productScanFinalizeContract';

type JsonObject = Record<string, unknown>;
const objectValue = (value: unknown): JsonObject =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {};

/** The deployed V1 finalizer: no version parsing, ignores automaticEvidence, reads productFields. */
const oldBackendView = (body: JsonObject) => ({
  customerAction: true,
  productFields: objectValue(objectValue(body.confirmations).productFields),
});

const automaticEvidence = {
  source: 'barcode_registry',
  exactGtin: '7350042718481',
  sourceUrl: 'https://world.openfoodfacts.org/product/7350042718481',
  queriedAt: 1,
  productFields: {
    identity: { displayName: 'Vitamin Well Refresh Lemon Kiwi', brand: 'Vitamin Well' },
    nutrition: { energyKcal: 17, basis: 'per_100ml' },
  },
};
const customerFields = {
  identity: { displayName: 'Vitamin Well Refresh cytryna–kiwi' },
  ingredientsText: 'Woda, fruktoza, witaminy.',
};

describe('PRODUCT_SCAN_FINALIZE_V2 compatibility matrix', () => {
  it('old client + old backend keeps the deployed baseline', () => {
    const oldRequest = { confirmations: { productFields: customerFields } };
    expect(oldBackendView(oldRequest)).toEqual({
      customerAction: true,
      productFields: customerFields,
    });
  });

  it('old client + new backend explicitly stays in legacy mode', () => {
    const resolved = resolveProductScanFinalizeContract({
      confirmations: { productFields: customerFields },
    });
    expect(resolved).toEqual({
      mode: 'legacy',
      automaticEvidence: null,
      customerAction: true,
      customerProductFields: customerFields,
    });
  });

  it('new client + old backend receives the lossless compatibility projection', () => {
    const request = withProductScanFinalizeV2Contract({
      automaticEvidence,
      confirmations: {
        evidenceOrigin: 'customer_action',
        productFields: customerFields,
      },
    });
    expect(request.contractVersion).toBe(PRODUCT_SCAN_FINALIZE_CONTRACT_V2);
    expect(oldBackendView(request).productFields).toEqual({
      identity: {
        displayName: 'Vitamin Well Refresh cytryna–kiwi',
        brand: 'Vitamin Well',
      },
      nutrition: { energyKcal: 17, basis: 'per_100ml' },
      ingredientsText: 'Woda, fruktoza, witaminy.',
    });
  });

  it('new client + new backend separates automatic and customer provenance', () => {
    const request = withProductScanFinalizeV2Contract({
      automaticEvidence,
      confirmations: {
        evidenceOrigin: 'customer_action',
        productFields: customerFields,
      },
    });
    expect(resolveProductScanFinalizeContract(request)).toEqual({
      mode: 'v2',
      automaticEvidence,
      customerAction: true,
      customerProductFields: customerFields,
    });
  });

  it('does not infer V2 from fields and rejects an explicit unknown version', () => {
    expect(
      resolveProductScanFinalizeContract({
        automaticEvidence,
        confirmations: { evidenceOrigin: 'customer_action', productFields: customerFields },
      }).mode,
    ).toBe('legacy');
    expect(
      resolveProductScanFinalizeContract({
        contractVersion: 'PRODUCT_SCAN_FINALIZE_V3',
        automaticEvidence,
      }),
    ).toEqual({ mode: 'unsupported', suppliedVersion: 'PRODUCT_SCAN_FINALIZE_V3' });
  });

  it('V2 never promotes its old-backend projection to customer-confirmed evidence', () => {
    const request = withProductScanFinalizeV2Contract({ automaticEvidence, confirmations: {} });
    expect(objectValue(objectValue(request.confirmations).productFields)).toEqual(
      automaticEvidence.productFields,
    );
    expect(resolveProductScanFinalizeContract(request)).toMatchObject({
      mode: 'v2',
      automaticEvidence,
      customerAction: false,
      customerProductFields: {},
    });
  });
});
