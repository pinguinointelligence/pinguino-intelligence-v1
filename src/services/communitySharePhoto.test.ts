/**
 * Own photograph on a direct share — the service contract (owner decision
 * 2026-09-17). Backend mocked; the assertions are on what the client would
 * actually send: which bucket, which folder, which RPC, in which order.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  uploads: [] as Array<{ bucket: string; path: string; contentType: string; upsert: boolean }>,
  signed: [] as Array<{ bucket: string; path: string; seconds: number }>,
  rpcs: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  uploadError: null as { message: string } | null,
  rpcResult: { data: null as unknown, error: null as { code?: string; message: string } | null },
  signError: null as { message: string } | null,
}));

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    storage: {
      from: (bucket: string) => ({
        upload: async (
          path: string,
          _file: File,
          options: { contentType: string; upsert: boolean },
        ) => {
          h.uploads.push({
            bucket,
            path,
            contentType: options.contentType,
            upsert: options.upsert,
          });
          return { error: h.uploadError };
        },
        getPublicUrl: (path: string) => ({
          data: {
            publicUrl: `https://project.supabase.co/storage/v1/object/public/${bucket}/${path}`,
          },
        }),
        createSignedUrl: async (path: string, seconds: number) => {
          h.signed.push({ bucket, path, seconds });
          return h.signError
            ? { data: null, error: h.signError }
            : {
                data: {
                  signedUrl: `https://project.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=t`,
                },
                error: null,
              };
        },
      }),
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      h.rpcs.push({ fn, args });
      return h.rpcResult;
    },
  },
}));
vi.mock('@/services/auth', () => ({ getCurrentUser: async () => ({ id: 'user-1' }) }));

const service = await import('./community');

const photo = (type = 'image/jpeg', bytes = 5) =>
  new File([new Uint8Array(bytes)], 'lody.jpg', { type });

describe('direct-share own photo — service', () => {
  beforeEach(() => {
    h.uploads = [];
    h.signed = [];
    h.rpcs = [];
    h.uploadError = null;
    h.rpcResult = { data: null, error: null };
    h.signError = null;
  });

  it('SVC-SP-01 the Community upload is unchanged: public bucket, own folder, public URL', async () => {
    const url = await service.uploadCommunityPhoto(photo('image/png'));
    expect(h.uploads).toHaveLength(1);
    expect(h.uploads[0]).toMatchObject({
      bucket: 'community-recipe-images',
      contentType: 'image/png',
      upsert: false,
    });
    expect(h.uploads[0]!.path).toMatch(/^user-1\/[A-Za-z0-9-]+\.png$/);
    expect(url).toBe(
      `https://project.supabase.co/storage/v1/object/public/community-recipe-images/${h.uploads[0]!.path}`,
    );
  });

  it('SVC-SP-02 a share photo goes to the PRIVATE bucket under the link folder, then attaches', async () => {
    h.rpcResult = { data: { share_link_id: 'link-1', own_photo: true }, error: null };
    await service.attachSharePhoto('link-1', photo());
    expect(h.uploads).toHaveLength(1);
    expect(h.uploads[0]).toMatchObject({ bucket: 'recipe-share-photos', upsert: false });
    expect(h.uploads[0]!.path).toMatch(/^link-1\/[A-Za-z0-9-]+\.jpg$/);
    expect(h.uploads[0]!.path).not.toContain('user-1'); // no account id in a recipient-visible path
    expect(h.rpcs).toEqual([
      {
        fn: 'gellatti_set_share_photo_v1',
        args: { p_share_link_id: 'link-1', p_storage_path: h.uploads[0]!.path },
      },
    ]);
  });

  it('SVC-SP-03 a failed upload never attaches anything', async () => {
    h.uploadError = { message: 'storage down' };
    await expect(service.attachSharePhoto('link-1', photo())).rejects.toThrow('storage down');
    expect(h.rpcs).toEqual([]);
  });

  it('SVC-SP-04 the same validation guards both uploads', async () => {
    await expect(service.attachSharePhoto('link-1', photo('image/gif'))).rejects.toThrow(
      'JPEG, PNG lub WebP',
    );
    await expect(service.attachSharePhoto('link-1', photo('image/jpeg', 0))).rejects.toThrow(
      '10 MB',
    );
    await expect(service.uploadCommunityPhoto(photo('image/gif'))).rejects.toThrow(
      'JPEG, PNG lub WebP',
    );
    expect(h.uploads).toEqual([]);
    expect(h.rpcs).toEqual([]);
  });

  it('SVC-SP-05 detaching sends a null path for that link only', async () => {
    h.rpcResult = { data: { share_link_id: 'link-1', own_photo: false }, error: null };
    await service.detachSharePhoto('link-1');
    expect(h.rpcs).toEqual([
      {
        fn: 'gellatti_set_share_photo_v1',
        args: { p_share_link_id: 'link-1', p_storage_path: null },
      },
    ]);
    expect(h.uploads).toEqual([]);
  });

  it('SVC-SP-06 reading asks by link id only; an undeployed backend reads as „no share photos”', async () => {
    h.rpcResult = {
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function' },
    };
    await expect(service.readSharePhoto('link-1')).resolves.toBeNull();
    expect(h.rpcs).toEqual([
      { fn: 'gellatti_share_photo_v1', args: { p_share_link_id: 'link-1' } },
    ]);

    h.rpcResult = { data: null, error: { code: '42501', message: 'authentication required' } };
    await expect(service.readSharePhoto('link-1')).rejects.toThrow('authentication required');

    const payload = {
      ok: true,
      share_link_id: 'link-1',
      category: 'sorbet',
      own_photo_path: 'link-1/a.jpg',
    };
    h.rpcResult = { data: payload, error: null };
    await expect(service.readSharePhoto('link-1')).resolves.toEqual(payload);
  });

  it('SVC-SP-07 the signed read URL comes from the private bucket and expires within an hour', async () => {
    const url = await service.signedSharePhotoUrl('link-1/a.jpg');
    expect(h.signed).toEqual([
      { bucket: 'recipe-share-photos', path: 'link-1/a.jpg', seconds: 3600 },
    ]);
    expect(url).toContain('/object/sign/recipe-share-photos/link-1/a.jpg');
    h.signError = { message: 'Object not found' };
    await expect(service.signedSharePhotoUrl('link-1/a.jpg')).rejects.toThrow('Object not found');
  });
});
