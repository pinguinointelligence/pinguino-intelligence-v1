import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcceptedMime } from '@/features/ocr-intake/intakeContracts';

const h = vi.hoisted(() => {
  const state: { uploadError: unknown; signed: unknown; signedError: unknown; removeError: unknown } = {
    uploadError: null,
    signed: { signedUrl: 'https://signed.example/x' },
    signedError: null,
    removeError: null,
  };
  const bucket = {
    upload: vi.fn(async () => ({ data: { path: 'p' }, error: state.uploadError })),
    createSignedUrl: vi.fn(async () => ({ data: state.signed, error: state.signedError })),
    remove: vi.fn(async () => ({ data: null, error: state.removeError })),
  };
  const storage = { from: vi.fn(() => bucket) };
  return { state, bucket, storage };
});
vi.mock('@/lib/supabase/client', () => ({ supabase: { storage: h.storage } }));
vi.mock('@/services/auth', () => ({ getCurrentUser: vi.fn() }));

import { getCurrentUser } from '@/services/auth';
import {
  BUCKET,
  MAX_INTAKE_IMAGE_BYTES,
  createIntakeImageSignedUrl,
  intakeObjectPath,
  removeIntakeObject,
  uploadIntakeImage,
} from './ocrIntakeStorage';

const asUser = (id: string | null) =>
  vi.mocked(getCurrentUser).mockResolvedValue(id ? ({ id } as never) : null);

afterEach(() => {
  vi.clearAllMocks();
  h.state.uploadError = null;
  h.state.signed = { signedUrl: 'https://signed.example/x' };
  h.state.signedError = null;
  h.state.removeError = null;
});

describe('intakeObjectPath (pure, owner-folder)', () => {
  it('puts the owner uid as folder-1 and maps the mime to an extension', () => {
    expect(intakeObjectPath('u1', 's1', 'i1', 'image/png')).toBe('u1/s1/i1.png');
    expect(intakeObjectPath('u1', 's1', 'i1', 'image/jpeg')).toBe('u1/s1/i1.jpg');
    expect(intakeObjectPath('u1', 's1', 'i1', 'image/webp')).toBe('u1/s1/i1.webp');
  });
});

describe('uploadIntakeImage', () => {
  it('uploads under the owner folder, private, never overwriting', async () => {
    asUser('u1');
    const bytes = new Uint8Array(1000);
    const { path } = await uploadIntakeImage('s1', 'i1', bytes, 'image/png');
    expect(path).toBe('u1/s1/i1.png');
    expect(h.storage.from).toHaveBeenCalledWith(BUCKET);
    expect(h.bucket.upload).toHaveBeenCalledWith('u1/s1/i1.png', bytes, {
      contentType: 'image/png',
      upsert: false,
    });
  });

  it('requires a signed-in user', async () => {
    asUser(null);
    await expect(uploadIntakeImage('s1', 'i1', new Uint8Array(10), 'image/png')).rejects.toThrow(
      /signed in/i,
    );
  });

  it('rejects an unsupported mime before any upload', async () => {
    asUser('u1');
    await expect(
      uploadIntakeImage('s1', 'i1', new Uint8Array(10), 'application/pdf' as AcceptedMime),
    ).rejects.toThrow(/PNG, JPEG or WebP/);
    expect(h.bucket.upload).not.toHaveBeenCalled();
  });

  it('rejects an over-cap image (10 MiB) before any upload', async () => {
    asUser('u1');
    await expect(
      uploadIntakeImage('s1', 'i1', new Uint8Array(MAX_INTAKE_IMAGE_BYTES + 1), 'image/png'),
    ).rejects.toThrow(/cap/);
    expect(h.bucket.upload).not.toHaveBeenCalled();
  });

  it('rejects an empty image', async () => {
    asUser('u1');
    await expect(uploadIntakeImage('s1', 'i1', new Uint8Array(0), 'image/png')).rejects.toThrow(
      /empty/i,
    );
  });

  it('surfaces a storage error', async () => {
    asUser('u1');
    h.state.uploadError = { message: 'bucket exploded' };
    await expect(uploadIntakeImage('s1', 'i1', new Uint8Array(10), 'image/png')).rejects.toThrow(
      'bucket exploded',
    );
  });
});

describe('createIntakeImageSignedUrl', () => {
  it('returns the signed url', async () => {
    expect(await createIntakeImageSignedUrl('u1/s1/i1.png', 60)).toBe('https://signed.example/x');
    expect(h.bucket.createSignedUrl).toHaveBeenCalledWith('u1/s1/i1.png', 60);
  });
  it('returns null when the signer yields none', async () => {
    h.state.signed = null;
    expect(await createIntakeImageSignedUrl('p')).toBeNull();
  });
});

describe('removeIntakeObject', () => {
  it('removes exactly the given path (for replace = remove + upload)', async () => {
    await removeIntakeObject('u1/s1/i1.png');
    expect(h.bucket.remove).toHaveBeenCalledWith(['u1/s1/i1.png']);
  });
});
