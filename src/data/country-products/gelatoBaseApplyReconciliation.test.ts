import { describe, expect, it } from 'vitest';
import { reconcileExistingApplyProduct } from '../../../scripts/countryProducts/lib/applyReconciliation.mjs';

describe('GELATO base apply resume reconciliation', () => {
  it('accepts its own approved product and partially-created routes', () => {
    expect(
      reconcileExistingApplyProduct({
        productKey: 'V23:MILK:GTIN-00012345678905',
        gtin: '00012345678905',
        request: { status: 'APPROVED', approved_product_id: 'product-1' },
        exactProduct: { id: 'product-1' },
        ingestEvent: { product_id: 'product-1', status: 'accepted' },
        routePrimaries: [
          { proposalKey: 'V23:AA:MILK:GTIN-00012345678905', primary: { product_id: 'product-1' } },
          { proposalKey: 'V23:BB:MILK:GTIN-00012345678905', primary: null },
        ],
      }),
    ).toEqual({
      approvedProductId: 'product-1',
      ingestedProductId: 'product-1',
      ownedProductId: 'product-1',
      issues: [],
    });
  });

  it('recognizes its own fail-closed product when APPROVE_LINK was refused', () => {
    expect(
      reconcileExistingApplyProduct({
        productKey: 'V23:MILK:GTIN-00012345678905',
        gtin: '00012345678905',
        request: { status: 'ADMIN_REVIEW', approved_product_id: null },
        exactProduct: { id: 'blocked-product' },
        ingestEvent: { product_id: 'blocked-product', status: 'blocked' },
        routePrimaries: [],
      }),
    ).toEqual({
      approvedProductId: null,
      ingestedProductId: 'blocked-product',
      ownedProductId: 'blocked-product',
      issues: [],
    });
  });

  it('still refuses a foreign exact product or primary route', () => {
    const result = reconcileExistingApplyProduct({
      productKey: 'V23:MILK:GTIN-00012345678905',
      gtin: '00012345678905',
      request: { status: 'APPROVED', approved_product_id: 'product-1' },
      exactProduct: { id: 'foreign-product' },
      ingestEvent: { product_id: 'product-1', status: 'accepted' },
      routePrimaries: [
        { proposalKey: 'V23:AA:MILK:GTIN-00012345678905', primary: { product_id: 'foreign-product' } },
      ],
    });
    expect(result.approvedProductId).toBe('product-1');
    expect(result.issues).toEqual([
      'V23:MILK:GTIN-00012345678905: GTIN 00012345678905 now exists outside this approved request',
      'V23:AA:MILK:GTIN-00012345678905: an active primary exists outside this approved request',
    ]);
  });

  it('rejects a malformed approved request and a missing approved GTIN product', () => {
    expect(
      reconcileExistingApplyProduct({
        productKey: 'V23:MILK:GTIN-00012345678905',
        gtin: '00012345678905',
        request: { status: 'APPROVED', approved_product_id: null },
        exactProduct: null,
        ingestEvent: null,
        routePrimaries: [],
      }).issues,
    ).toEqual(['V23:MILK:GTIN-00012345678905: APPROVED request has no approved product']);

    expect(
      reconcileExistingApplyProduct({
        productKey: 'V23:MILK:GTIN-00012345678905',
        gtin: '00012345678905',
        request: { status: 'APPROVED', approved_product_id: 'product-1' },
        exactProduct: null,
        ingestEvent: { product_id: 'product-1', status: 'accepted' },
        routePrimaries: [],
      }).issues,
    ).toEqual([
      'V23:MILK:GTIN-00012345678905: approved product is no longer the active exact GTIN product',
    ]);
  });
});
