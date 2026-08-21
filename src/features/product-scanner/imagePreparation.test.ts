import { describe, expect, it, vi } from 'vitest';
import { prepareProductScanImage, type ProductScanImageDependencies } from './imagePreparation';

const normalized = new File(['png'], 'label.png', { type: 'image/png' });

function dependencies(
  overrides: Partial<ProductScanImageDependencies> = {},
): ProductScanImageDependencies {
  return {
    detectHeic: vi.fn(async () => false),
    convertHeic: vi.fn(async () => new Blob(['jpeg'], { type: 'image/jpeg' })),
    normalize: vi.fn(async () => ({ ok: true as const, file: normalized })),
    ...overrides,
  };
}

describe('Product Scanner image preparation', () => {
  it('normalizes JPEG/PNG/WEBP through the existing evidence boundary', async () => {
    const deps = dependencies();
    const result = await prepareProductScanImage(
      new File(['jpeg'], 'front.jpg', { type: 'image/jpeg' }),
      deps,
    );
    expect(result).toMatchObject({
      ok: true,
      value: { file: normalized, originalMime: 'image/jpeg' },
    });
    if (result.ok)
      expect(result.value.transformations).toEqual(
        expect.arrayContaining(['metadata_stripped', 'exif_orientation_applied']),
      );
    expect(deps.convertHeic).not.toHaveBeenCalled();
  });

  it('converts HEIC before canonical normalization', async () => {
    const deps = dependencies({ detectHeic: vi.fn(async () => true) });
    const result = await prepareProductScanImage(
      new File(['heic'], 'label.heic', { type: 'image/heic' }),
      deps,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.transformations).toContain('heic_to_jpeg');
    expect(deps.convertHeic).toHaveBeenCalledOnce();
    expect(deps.normalize).toHaveBeenCalledWith(expect.objectContaining({ type: 'image/jpeg' }));
  });

  it('fails closed when HEIC conversion cannot decode the source', async () => {
    const deps = dependencies({
      detectHeic: vi.fn(async () => true),
      convertHeic: vi.fn(async () => {
        throw new Error('decode');
      }),
    });
    await expect(
      prepareProductScanImage(new File(['bad'], 'bad.heif', { type: 'image/heif' }), deps),
    ).resolves.toEqual({ ok: false, reason: 'Nie udało się odczytać HEIC/HEIF: bad.heif.' });
  });
});
