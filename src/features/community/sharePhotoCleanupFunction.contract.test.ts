/// <reference types="node" />
/**
 * `share-photo-cleanup` Edge Function — PREPARED, NOT DEPLOYED (owner decision
 * 2026-09-17). The worker that removes exactly the files the database claimed and
 * then confirmed, from `recipe-share-photos` only, through the Storage API.
 *
 * The call secret is its own secret: the service role key is never the call
 * credential, only this worker's internal credential. The decision flow is run
 * here for real (`handleCleanupRequest` with injected calls), so a refusal is
 * proven to reach neither claim, nor confirm, nor remove, nor settle. The Deno
 * entrypoint is additionally read as source.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  BUCKET,
  CLAIM_LIMIT,
  CLEANUP_KEY_HEADER,
  JSON_HEADERS,
  confirmedNames,
  planRemoval,
  removalOutcome,
  secretEquals,
} from '../../../supabase/functions/share-photo-cleanup/protocol';
import { handleCleanupRequest } from '../../../supabase/functions/share-photo-cleanup/worker';

const EDGE = readFileSync(
  join(process.cwd(), 'supabase/functions/share-photo-cleanup/index.ts'),
  'utf8',
);
const TOKEN = '0f8fad5b-d9cb-469f-a165-70867728950e';
const NAME = '1d76adac-8d3f-494c-94cb-80bdb4bce21f/c7da0166-c5d2-4c76-a648-3ad446c68b54.jpg';
const OTHER = '1d76adac-8d3f-494c-94cb-80bdb4bce21f/0bd1f2c5-02d1-40f9-8961-05f93081e196.jpg';
const SECRET = 'cleanup-call-secret-9f3c';
/** A project JWT (anon key shape) and a signed-in user token — neither is a call credential. */
const PUBLIC_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.signature';
const USER_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.signature';
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature';

function calls(
  overrides: Partial<Record<'claim' | 'confirm' | 'remove' | 'settle', unknown>> = {},
) {
  return {
    claim: vi.fn(async () => ({ data: { claim_token: TOKEN, objects: [NAME] }, error: null })),
    confirm: vi.fn(async () => ({ data: { objects: [NAME] }, error: null })),
    remove: vi.fn(async () => ({ error: null })),
    settle: vi.fn(async () => ({ data: { deleted: 1, failed: 0 }, error: null })),
    ...overrides,
  } as unknown as Parameters<typeof handleCleanupRequest>[2] & {
    claim: ReturnType<typeof vi.fn>;
    confirm: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    settle: ReturnType<typeof vi.fn>;
  };
}
const post = (headers: Record<string, string> = {}, method = 'POST') =>
  new Request('https://example.functions.supabase.co/share-photo-cleanup', { method, headers });

describe('share-photo-cleanup call secret', () => {
  const cases: [string, Record<string, string>, string | null, number, string][] = [
    ['the cleanup secret', { [CLEANUP_KEY_HEADER]: SECRET }, SECRET, 200, ''],
    [
      'a wrong secret',
      { [CLEANUP_KEY_HEADER]: 'cleanup-call-secret-9f3d' },
      SECRET,
      403,
      'forbidden',
    ],
    ['no secret at all', {}, SECRET, 403, 'forbidden'],
    ['an empty secret', { [CLEANUP_KEY_HEADER]: '' }, SECRET, 403, 'forbidden'],
    ['a signed-in user token', { Authorization: `Bearer ${USER_TOKEN}` }, SECRET, 403, 'forbidden'],
    [
      'the public anon key',
      { Authorization: `Bearer ${PUBLIC_ANON_KEY}` },
      SECRET,
      403,
      'forbidden',
    ],
    [
      'the service role key as the caller',
      { Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      SECRET,
      403,
      'forbidden',
    ],
    [
      'the right secret but nothing configured',
      { [CLEANUP_KEY_HEADER]: SECRET },
      null,
      503,
      'not_configured',
    ],
    ['a blank configuration', { [CLEANUP_KEY_HEADER]: '  ' }, '   ', 503, 'not_configured'],
  ];

  it.each(cases)(
    'CLN-FN-01 %s → the worker answers correctly and a refusal never claims, confirms, removes or settles',
    async (_label, headers, configured, status, error) => {
      const deps = calls();
      const response = await handleCleanupRequest(post(headers), { cleanupKey: configured }, deps);
      expect(response.status).toBe(status);
      const body = (await response.json()) as Record<string, unknown>;
      if (error) {
        expect(body.error).toBe(error);
        expect(deps.claim).not.toHaveBeenCalled();
        expect(deps.confirm).not.toHaveBeenCalled();
        expect(deps.remove).not.toHaveBeenCalled();
        expect(deps.settle).not.toHaveBeenCalled();
      } else {
        expect(deps.claim).toHaveBeenCalledWith(CLAIM_LIMIT);
        expect(deps.remove).toHaveBeenCalledWith([NAME]);
      }
    },
  );

  it('CLN-FN-02 anything but POST is refused before the secret is even considered', async () => {
    const deps = calls();
    const response = await handleCleanupRequest(
      post({ [CLEANUP_KEY_HEADER]: SECRET }, 'GET'),
      { cleanupKey: SECRET },
      deps,
    );
    expect(response.status).toBe(405);
    expect(deps.claim).not.toHaveBeenCalled();
  });
});

describe('share-photo-cleanup decision flow', () => {
  it('CLN-FN-03 claim → confirm → remove → settle, with the claim token carried through', async () => {
    const deps = calls({
      claim: vi.fn(async () => ({
        data: { claim_token: TOKEN, objects: [NAME, OTHER] },
        error: null,
      })),
      confirm: vi.fn(async () => ({ data: { objects: [NAME, OTHER] }, error: null })),
    });
    const response = await handleCleanupRequest(
      post({ [CLEANUP_KEY_HEADER]: SECRET }),
      { cleanupKey: SECRET },
      deps,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      claimed: 2,
      confirmed: 2,
      settled: { deleted: 1, failed: 0 },
    });
    expect(deps.confirm).toHaveBeenCalledWith(TOKEN, [NAME, OTHER]);
    expect(deps.remove).toHaveBeenCalledWith([NAME, OTHER]);
    expect(deps.settle).toHaveBeenCalledWith(TOKEN, [NAME, OTHER], null);
    const order = (spy: ReturnType<typeof vi.fn>) => spy.mock.invocationCallOrder[0] ?? -1;
    expect(order(deps.claim)).toBeGreaterThan(0);
    expect(order(deps.claim)).toBeLessThan(order(deps.confirm));
    expect(order(deps.confirm)).toBeLessThan(order(deps.remove));
    expect(order(deps.remove)).toBeLessThan(order(deps.settle));
  });

  it('CLN-FN-04 a file the database no longer confirms is never removed (the rollback race)', async () => {
    const deps = calls({
      claim: vi.fn(async () => ({
        data: { claim_token: TOKEN, objects: [NAME, OTHER] },
        error: null,
      })),
      confirm: vi.fn(async () => ({ data: { objects: [OTHER] }, error: null })),
    });
    const response = await handleCleanupRequest(
      post({ [CLEANUP_KEY_HEADER]: SECRET }),
      { cleanupKey: SECRET },
      deps,
    );
    expect(response.status).toBe(200);
    expect(deps.remove).toHaveBeenCalledWith([OTHER]);
    expect(deps.settle).toHaveBeenCalledWith(TOKEN, [OTHER], null);
  });

  it('CLN-FN-05 nothing confirmed (paused, or every file taken back) removes nothing at all', async () => {
    const deps = calls({
      confirm: vi.fn(async () => ({ data: { objects: [], paused: true }, error: null })),
    });
    const response = await handleCleanupRequest(
      post({ [CLEANUP_KEY_HEADER]: SECRET }),
      { cleanupKey: SECRET },
      deps,
    );
    expect(await response.json()).toEqual({ claimed: 1, confirmed: 0 });
    expect(deps.remove).not.toHaveBeenCalled();
    expect(deps.settle).not.toHaveBeenCalled();
  });

  it('CLN-FN-06 a failure at any step stops the run without deleting or mis-reporting', async () => {
    const claimFailed = calls({
      claim: vi.fn(async () => ({ data: null, error: new Error('down') })),
    });
    expect(
      (
        await handleCleanupRequest(
          post({ [CLEANUP_KEY_HEADER]: SECRET }),
          { cleanupKey: SECRET },
          claimFailed,
        )
      ).status,
    ).toBe(503);
    expect(claimFailed.remove).not.toHaveBeenCalled();

    const confirmFailed = calls({
      confirm: vi.fn(async () => ({ data: null, error: new Error('down') })),
    });
    expect(
      (
        await handleCleanupRequest(
          post({ [CLEANUP_KEY_HEADER]: SECRET }),
          { cleanupKey: SECRET },
          confirmFailed,
        )
      ).status,
    ).toBe(503);
    expect(confirmFailed.remove).not.toHaveBeenCalled();
    expect(confirmFailed.settle).not.toHaveBeenCalled();

    const storageFailed = calls({ remove: vi.fn(async () => ({ error: new Error('storage') })) });
    expect(
      (
        await handleCleanupRequest(
          post({ [CLEANUP_KEY_HEADER]: SECRET }),
          { cleanupKey: SECRET },
          storageFailed,
        )
      ).status,
    ).toBe(200);
    expect(storageFailed.settle).toHaveBeenCalledWith(TOKEN, [], 'storage_remove_failed');

    const settleFailed = calls({
      settle: vi.fn(async () => ({ data: null, error: new Error('down') })),
    });
    expect(
      (
        await handleCleanupRequest(
          post({ [CLEANUP_KEY_HEADER]: SECRET }),
          { cleanupKey: SECRET },
          settleFailed,
        )
      ).status,
    ).toBe(503);

    const nothingDue = calls({
      claim: vi.fn(async () => ({ data: { claim_token: null, objects: [] }, error: null })),
    });
    expect(
      await (
        await handleCleanupRequest(
          post({ [CLEANUP_KEY_HEADER]: SECRET }),
          { cleanupKey: SECRET },
          nothingDue,
        )
      ).json(),
    ).toEqual({ claimed: 0 });
    expect(nothingDue.confirm).not.toHaveBeenCalled();
  });
});

describe('share-photo-cleanup protocol', () => {
  it('CLN-FN-07 acts only on a uuid claim token and share-photo object names', () => {
    expect(planRemoval({ claim_token: TOKEN, objects: [NAME, NAME] })).toEqual({
      token: TOKEN,
      names: [NAME],
      rejected: 1,
    });
    expect(planRemoval({ claim_token: null, objects: [] })).toEqual({
      token: null,
      names: [],
      rejected: 0,
    });
    for (const claim of [null, [], 'x', { claim_token: 'not-a-uuid', objects: [NAME] }]) {
      expect(planRemoval(claim).names, JSON.stringify(claim)).toEqual([]);
    }
    const hostile = planRemoval({
      claim_token: TOKEN,
      objects: [
        `${NAME}?x=1`,
        `../${NAME}`,
        'community-recipe-images/abc.jpg',
        '11111111-1111-4111-8111-111111111111/../x.jpg',
        '1d76adac-8d3f-494c-94cb-80bdb4bce21f/',
        '1d76adac-8d3f-494c-94cb-80bdb4bce21f/photo.gif',
        42,
      ],
    });
    expect(hostile.names).toEqual([]);
    expect(hostile.rejected).toBe(7);
  });

  it('CLN-FN-08 confirmation can only shrink the claim, never widen it', () => {
    const plan = planRemoval({ claim_token: TOKEN, objects: [NAME] });
    expect(confirmedNames(plan, { objects: [NAME] })).toEqual([NAME]);
    expect(confirmedNames(plan, { objects: [NAME, NAME] })).toEqual([NAME]);
    expect(confirmedNames(plan, { objects: [OTHER] })).toEqual([]);
    expect(confirmedNames(plan, { objects: ['community-recipe-images/abc.jpg'] })).toEqual([]);
    for (const answer of [null, 'x', [], { objects: 'all' }, {}]) {
      expect(confirmedNames(plan, answer), JSON.stringify(answer)).toEqual([]);
    }
  });

  it('CLN-FN-09 a Storage error reports nothing removed; otherwise settle verifies each file itself', () => {
    expect(removalOutcome([NAME], new Error('boom'))).toEqual({
      removed: [],
      error: 'storage_remove_failed',
    });
    expect(removalOutcome([NAME], null)).toEqual({ removed: [NAME], error: null });
  });

  it('CLN-FN-10 the secret comparison is exact, and an unset secret can never match', () => {
    expect(secretEquals(SECRET, SECRET)).toBe(true);
    expect(secretEquals('cleanup-call-secret-9f3d', SECRET)).toBe(false);
    expect(secretEquals(`${SECRET} `, SECRET)).toBe(false);
    expect(secretEquals('', '')).toBe(false);
    expect(BUCKET).toBe('recipe-share-photos');
    expect(CLAIM_LIMIT).toBeLessThanOrEqual(200);
    expect(JSON_HEADERS['Cache-Control']).toBe('no-store');
    expect(CLEANUP_KEY_HEADER).toBe('x-gellatti-cleanup-key');
  });
});

describe('share-photo-cleanup entrypoint (source)', () => {
  it('CLN-FN-11 the admin client is built only after the caller is authorised, and is not the call credential', () => {
    // The client is created lazily inside the injected calls, so no service-role
    // client exists before handleCleanupRequest has checked the secret.
    expect(EDGE).toContain('let client: SupabaseClient | null = null;');
    expect(EDGE).toContain('(client ??= createClient(url, serviceRoleKey');
    expect(EDGE.indexOf('handleCleanupRequest(')).toBeLessThan(EDGE.indexOf('claim: (limit) =>'));
    expect(EDGE).toContain("cleanupKey: Deno.env.get('SHARE_PHOTO_CLEANUP_KEY')");
    expect(EDGE).not.toMatch(/secretEquals\([^)]*SERVICE_ROLE/);
    expect(EDGE).not.toMatch(/Authorization/);
  });

  it('CLN-FN-12 removes only through the share-photo bucket; never lists, never another bucket, logs nothing', () => {
    expect(EDGE.match(/\.storage\.from\(/g)).toHaveLength(1);
    expect(EDGE).toContain('.storage.from(BUCKET).remove(names)');
    expect(EDGE).not.toMatch(
      /\.list\(|\.move\(|\.copy\(|\.upload\(|community-recipe-images|createSignedUrl/,
    );
    expect(EDGE).not.toMatch(/console\.|log\(/);
    expect(EDGE).toContain('--no-verify-jwt');
  });
});
