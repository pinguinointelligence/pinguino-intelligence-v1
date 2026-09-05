/**
 * Label photographs for the discovery lifecycle: one plain helper that turns a File / Blob or a
 * canvas data URL into the `LabelImage` contract the discovery port sends to the analysis authority.
 * Transformation tokens are the canonical ones the server accepts (proven on staging, 2026-09-05).
 */
import type { LabelImage } from './discovery/contracts';

export const LABEL_IMAGE_TRANSFORMATIONS = [
  'exif_orientation_applied',
  'metadata_stripped',
  'downscaled_if_needed',
] as const;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
}

export async function fileToLabelImage(
  file: Blob,
  source: LabelImage['source'] = 'gallery',
): Promise<LabelImage> {
  const mime = file.type || 'image/jpeg';
  const bytes = new Uint8Array(await file.arrayBuffer());
  return {
    assetId: globalThis.crypto.randomUUID(),
    mime,
    base64: bytesToBase64(bytes),
    source,
    originalMime: mime,
    transformations: [...LABEL_IMAGE_TRANSFORMATIONS],
    qualityScore: null,
  };
}

export function dataUrlToLabelImage(dataUrl: string, source: LabelImage['source']): LabelImage {
  const comma = dataUrl.indexOf(',');
  const head = comma >= 0 ? dataUrl.slice(0, comma) : '';
  const mime = /^data:([^;]+)/.exec(head)?.[1] ?? 'image/jpeg';
  return {
    assetId: globalThis.crypto.randomUUID(),
    mime,
    base64: comma >= 0 ? dataUrl.slice(comma + 1) : '',
    source,
    originalMime: mime,
    transformations: [...LABEL_IMAGE_TRANSFORMATIONS],
    qualityScore: null,
  };
}
