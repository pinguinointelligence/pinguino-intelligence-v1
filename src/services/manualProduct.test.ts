import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  ingest: vi.fn(),
  key: vi.fn().mockResolvedValue('product:manual:test'),
}));

vi.mock('@/services/productIngest', () => ({
  ingestProduct: h.ingest,
  productIngestIdempotencyKey: h.key,
}));

import { createManualProduct } from './manualProduct';

const input = {
  displayName: 'Kakao klienta',
  brand: 'Marka',
  explicitlyUnbranded: false,
  ean: null,
  packageSize: '250 g',
  category: 'kakao',
  nutrition: {
    energyKcal: 350, fat: 12, carbohydrate: 45, sugars: 8, protein: 20, salt: 0.1,
  },
  ingredientsText: 'kakao, cukier',
  allergensText: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  h.key.mockResolvedValue('product:manual:test');
  h.ingest.mockResolvedValue({ productCode: 'PM-ING-000001', engineUsable: true });
});

describe('manual PM intake', () => {
  it('uses the same canonical ingest with user-confirmed provenance', async () => {
    await expect(createManualProduct(input)).resolves.toMatchObject({ productCode: 'PM-ING-000001' });
    expect(h.ingest).toHaveBeenCalledWith(expect.objectContaining({
      source: 'manual',
      input: expect.objectContaining({
        manualProductProfileProposal: { version: 1 },
        facts: expect.objectContaining({ allergensText: null }),
      }),
      evidence: expect.objectContaining({ provenance: 'USER_CONFIRMED' }),
    }));
  });

  it('routes a checksum-valid GTIN through exact barcode identity reuse', async () => {
    await createManualProduct({ ...input, ean: '4001686322536' });
    expect(h.ingest).toHaveBeenCalledWith(expect.objectContaining({ source: 'barcode' }));
  });

  it('rejects an invalid GTIN before canonical ingest', async () => {
    await expect(createManualProduct({ ...input, ean: '4001686322537' })).rejects.toThrow(
      'nieprawidłową sumę kontrolną',
    );
    expect(h.ingest).not.toHaveBeenCalled();
  });
});
