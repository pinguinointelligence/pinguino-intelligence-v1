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
  invokes: [] as Array<{ name: string; body: unknown }>,
  invokeResult: null as unknown,
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
          return { data: null, error: { message: 'signed URLs are not used for share photos' } };
        },
      }),
    },
    functions: {
      invoke: async (name: string, options: { body: unknown }) => {
        h.invokes.push({ name, body: options.body });
        return h.invokeResult;
      },
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
    h.invokes = [];
    h.invokeResult = null;
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

  it('SVC-SP-06 the share dialog reads by link id only; every failure throws — never „no photo”', async () => {
    const payload = {
      ok: true,
      share_link_id: 'link-1',
      category: 'sorbet',
      has_own_photo: false,
    };
    h.rpcResult = { data: payload, error: null };
    await expect(service.readSharePhoto('link-1')).resolves.toEqual(payload);
    expect(h.rpcs).toEqual([
      { fn: 'gellatti_share_photo_v1', args: { p_share_link_id: 'link-1' } },
    ]);

    // A missing function (PGRST202) used to read as „no share photos”. It is a failure now.
    h.rpcResult = {
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function' },
    };
    await expect(service.readSharePhoto('link-1')).rejects.toThrow('Could not find the function');
  });

  const response = (status: number, headers: Record<string, string> = {}, body?: string) =>
    new Response(status === 204 ? null : (body ?? null), { status, headers });

  it('SVC-SP-07 a guest asks with the TOKEN in the body; the bytes come back typed as the image', async () => {
    const bytes = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], {
      type: 'application/octet-stream',
    });
    h.invokeResult = {
      data: bytes,
      error: null,
      response: response(200, { 'x-share-photo-type': 'image/jpeg' }),
    };
    const result = await service.fetchSharePhoto({ token: 'tok_abc' });
    expect(h.invokes).toEqual([{ name: 'share-photo', body: { token: 'tok_abc' } }]);
    expect(result.kind).toBe('photo');
    expect(result.kind === 'photo' && result.blob.type).toBe('image/jpeg');
    expect(h.signed).toEqual([]); // no signed URL anywhere in the chain
  });

  it('SVC-SP-08 /received asks by share id; 204 means the link carries no own photo', async () => {
    h.invokeResult = { data: '', error: null, response: response(204) };
    await expect(service.fetchSharePhoto({ shareLinkId: 'link-1' })).resolves.toEqual({
      kind: 'none',
    });
    expect(h.invokes).toEqual([{ name: 'share-photo', body: { shareLinkId: 'link-1' } }]);
  });

  it('SVC-SP-09 a server refusal is a refusal with its reason, not „no photo”', async () => {
    for (const [status, reason] of [
      [404, 'not_found'],
      [410, 'revoked'],
      [410, 'expired'],
    ] as const) {
      const context = response(
        status,
        { 'content-type': 'application/json' },
        JSON.stringify({ error: reason }),
      );
      h.invokeResult = { data: null, error: Object.assign(new Error('http'), { context }) };
      await expect(service.fetchSharePhoto({ token: 'tok_abc' })).resolves.toEqual({
        kind: 'refused',
        reason,
      });
    }
  });

  it('SVC-SP-10 transport, gateway and server failures throw — they are never „no photo”', async () => {
    const gateway404 = response(
      404,
      { 'content-type': 'application/json' },
      JSON.stringify({ code: 'NOT_FOUND', message: 'Requested function was not found' }),
    );
    for (const invokeResult of [
      { data: null, error: Object.assign(new Error('http'), { context: gateway404 }) },
      { data: null, error: Object.assign(new Error('http'), { context: response(503) }) },
      { data: null, error: new Error('Failed to fetch') },
      { data: '', error: null, response: response(200) }, // an empty 200 is not a photo
    ]) {
      h.invokeResult = invokeResult;
      await expect(service.fetchSharePhoto({ token: 'tok_abc' })).rejects.toThrow(
        'share_photo_unavailable',
      );
    }
  });
});
