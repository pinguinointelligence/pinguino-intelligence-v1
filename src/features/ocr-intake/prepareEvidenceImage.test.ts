import { describe, expect, it, vi } from 'vitest';
import { MAX_LABEL_IMAGE_BYTES } from './ocrEngine';
import { prepareEvidenceImage } from './prepareEvidenceImage';

describe('OCR evidence image preparation', () => {
  it('rejects a WebP whose normalized PNG expands beyond the upload limit', async () => {
    const supplied = new File(['small'], 'label.webp', { type: 'image/webp' });
    const expanded = new File([new Uint8Array(MAX_LABEL_IMAGE_BYTES + 1)], 'label.png', {
      type: 'image/png',
    });
    const normalize = vi.fn(async () => expanded);

    await expect(prepareEvidenceImage(supplied, normalize)).resolves.toMatchObject({
      ok: false,
    });
    expect(normalize).toHaveBeenCalledOnce();
  });

  it('returns the exact normalized bytes after both validations pass', async () => {
    const supplied = new File(['small'], 'label.webp', { type: 'image/webp' });
    const normalized = new File(['png'], 'label.png', { type: 'image/png' });
    await expect(prepareEvidenceImage(supplied, async () => normalized)).resolves.toEqual({
      ok: true,
      file: normalized,
    });
  });

  it('rejects an oversized PNG dimension header before OCR', async () => {
    const png = new Uint8Array(24);
    png.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
    png.set(new TextEncoder().encode('IHDR'), 12);
    new DataView(png.buffer).setUint32(16, 12_000);
    new DataView(png.buffer).setUint32(20, 12_000);
    const buffer = new ArrayBuffer(png.byteLength);
    new Uint8Array(buffer).set(png);
    await expect(
      prepareEvidenceImage(new File([buffer], 'huge.png', { type: 'image/png' })),
    ).resolves.toEqual({
      ok: false,
      reason: 'Nie udało się bezpiecznie odczytać obrazu: huge.png.',
    });
  });
});
