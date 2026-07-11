/**
 * OCR intake image STORAGE service (migration 0024) — the ONLY access to the private
 * `product-intake-images` bucket behind `ocr_intake_images`.
 *
 * Locked storage rules mirrored here (0024):
 *   • the bucket is PRIVATE — images are shown via short-lived SIGNED URLs the owner
 *     creates for themselves; a leaked object path alone is useless;
 *   • objects live under a per-user folder `{auth.uid()}/{session}/{imageId}.{ext}` —
 *     folder-1 MUST be the owner uid (every 0024 policy pins it), so one user can never
 *     touch another user's uploads;
 *   • caps mirror 0022/0024 EXACTLY: 10 MiB per file, PNG/JPEG/WebP only (the contract's
 *     AcceptedMime) — HEIC/HEIF is converted client-side or honestly rejected upstream;
 *   • no in-place UPDATE: replacing an image is remove + upload (new checksum, new row).
 *
 * Client-access pattern (copied from the products/snapshots services): only
 * `src/lib/supabase/client.ts` imports supabase-js; reads degrade to null when the client
 * is unconfigured, writes throw UNAVAILABLE. The owner uid is stamped into the object path
 * itself — no service role, no privileged key.
 */
import { supabase } from '@/lib/supabase/client';
import { getCurrentUser } from '@/services/auth';
import type { AcceptedMime } from '@/features/ocr-intake/intakeContracts';

/** The private bucket seeded by migration 0024. */
export const BUCKET = 'product-intake-images';
const UNAVAILABLE = 'Product intake image storage is not available in this build.';

/** 10 MiB — MUST stay equal to 0022's ocr_intake_images.byte_size cap and 0024's
 * bucket file_size_limit. */
export const MAX_INTAKE_IMAGE_BYTES = 10485760;

/** The contract's AcceptedMime allowlist (= the 0024 bucket allowed_mime_types). */
const MIME_EXT: Record<AcceptedMime, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};
const ACCEPTED_MIMES = new Set<string>(Object.keys(MIME_EXT));

/** Bytes-or-Blob size, without reading the payload. */
function byteLengthOf(bytes: Uint8Array | Blob): number {
  return bytes instanceof Blob ? bytes.size : bytes.byteLength;
}

function assertAcceptedMime(mime: string): asserts mime is AcceptedMime {
  if (!ACCEPTED_MIMES.has(mime)) {
    throw new Error(`Unsupported image type "${mime}" — intake accepts only PNG, JPEG or WebP.`);
  }
}

function assertWithinSizeCap(bytes: Uint8Array | Blob): void {
  const size = byteLengthOf(bytes);
  if (size <= 0) throw new Error('Intake image is empty.');
  if (size > MAX_INTAKE_IMAGE_BYTES) {
    throw new Error(
      `Intake image is ${size} bytes — exceeds the ${MAX_INTAKE_IMAGE_BYTES}-byte (10 MiB) cap.`,
    );
  }
}

/**
 * The owner-scoped object path for one intake image: `{userId}/{sessionId}/{imageId}.{ext}`.
 * Folder-1 is the owner uid so every 0024 policy (`(storage.foldername(name))[1] =
 * auth.uid()::text`) matches. Pure — no IO.
 */
export function intakeObjectPath(
  userId: string,
  sessionId: string,
  imageId: string,
  mime: AcceptedMime,
): string {
  const ext = MIME_EXT[mime];
  return `${userId}/${sessionId}/${imageId}.${ext}`;
}

/**
 * Upload one intake image to the private bucket under the owner's folder. Validates the
 * MIME allowlist and the 10 MiB cap BEFORE the call (defense-in-depth on top of the
 * bucket's own limits), never overwrites (`upsert: false`), and returns the stored path.
 */
export async function uploadIntakeImage(
  sessionId: string,
  imageId: string,
  bytes: Uint8Array | Blob,
  mime: AcceptedMime,
): Promise<{ path: string }> {
  if (!supabase) throw new Error(UNAVAILABLE);
  const user = await getCurrentUser();
  if (!user) throw new Error('You must be signed in to upload an intake image.');
  assertAcceptedMime(mime);
  assertWithinSizeCap(bytes);
  const path = intakeObjectPath(user.id, sessionId, imageId, mime);
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (error) throw new Error(error.message);
  return { path };
}

/**
 * Create a short-lived signed URL for a stored intake object so the owner can view it
 * (the bucket is private — there is no public URL). Degrades to null when the client is
 * unconfigured. Default expiry 1 hour.
 */
export async function createIntakeImageSignedUrl(
  path: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error) throw new Error(error.message);
  return data?.signedUrl ?? null;
}

/**
 * Remove a stored intake object. Used when replacing an image (remove + upload — never an
 * in-place byte swap, which would detach the bytes from their recorded checksum).
 */
export async function removeIntakeObject(path: string): Promise<void> {
  if (!supabase) throw new Error(UNAVAILABLE);
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw new Error(error.message);
}
