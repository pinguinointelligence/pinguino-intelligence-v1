/// <reference types="node" />
/**
 * `share-photo-cleanup` Edge Function — PREPARED, NOT DEPLOYED (owner decision
 * 2026-09-17). The operator-only worker that removes exactly the files the
 * database claimed, from `recipe-share-photos` only, through the Storage API.
 *
 * The pure protocol is tested directly; the Deno entrypoint is read as source,
 * the way sharePhotoFunction.contract.test reads share-photo.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BUCKET,
  CLAIM_LIMIT,
  JSON_HEADERS,
  planRemoval,
  removalOutcome,
  secretEquals,
} from '../../../supabase/functions/share-photo-cleanup/protocol';

const EDGE = readFileSync(
  join(process.cwd(), 'supabase/functions/share-photo-cleanup/index.ts'),
  'utf8',
);
const TOKEN = '0f8fad5b-d9cb-469f-a165-70867728950e';
const NAME = '1d76adac-8d3f-494c-94cb-80bdb4bce21f/c7da0166-c5d2-4c76-a648-3ad446c68b54.jpg';

describe('share-photo-cleanup protocol', () => {
  it('CLN-FN-01 acts only on a uuid claim token and share-photo object names', () => {
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

  it('CLN-FN-02 a Storage error reports nothing removed; otherwise settle verifies each file itself', () => {
    const plan = planRemoval({ claim_token: TOKEN, objects: [NAME] });
    expect(removalOutcome(plan, new Error('boom'))).toEqual({
      removed: [],
      error: 'storage_remove_failed',
    });
    expect(removalOutcome(plan, null)).toEqual({ removed: [NAME], error: null });
  });

  it('CLN-FN-03 the caller must present exactly the service role key', () => {
    expect(secretEquals('service-key', 'service-key')).toBe(true);
    expect(secretEquals('service-kez', 'service-key')).toBe(false);
    expect(secretEquals('service-key-longer', 'service-key')).toBe(false);
    expect(secretEquals('', '')).toBe(false);
    expect(BUCKET).toBe('recipe-share-photos');
    expect(CLAIM_LIMIT).toBeLessThanOrEqual(200);
    expect(JSON_HEADERS['Cache-Control']).toBe('no-store');
  });
});

describe('share-photo-cleanup entrypoint (source)', () => {
  const auth = EDGE.indexOf('if (!secretEquals(presented, serviceRoleKey))');
  const admin = EDGE.indexOf('const admin = createClient(');
  const claim = EDGE.indexOf("'gellatti_share_photo_cleanup_claim_v1'");
  const remove = EDGE.indexOf('.remove(plan.names)');
  const settle = EDGE.indexOf("'gellatti_share_photo_cleanup_settle_v1'");

  it('CLN-FN-04 authorises the scheduler before anything else, then claim → remove → settle', () => {
    expect(auth).toBeGreaterThan(-1);
    expect(EDGE.indexOf("if (req.method !== 'POST')")).toBeLessThan(auth);
    expect(admin).toBeGreaterThan(auth);
    expect(claim).toBeGreaterThan(admin);
    expect(remove).toBeGreaterThan(claim);
    expect(settle).toBeGreaterThan(remove);
    expect(EDGE.indexOf('if (!plan.token || plan.names.length === 0)')).toBeLessThan(remove);
  });

  it('CLN-FN-05 removes only the claimed names from the share-photo bucket; never lists, never another bucket', () => {
    expect(EDGE.match(/\.storage\.from\(/g)).toHaveLength(1);
    expect(EDGE).toContain('admin.storage.from(BUCKET).remove(plan.names)');
    expect(EDGE).not.toMatch(
      /\.list\(|\.move\(|\.copy\(|\.upload\(|community-recipe-images|createSignedUrl/,
    );
    expect(EDGE).not.toMatch(/from\('recipe_share|\.from\(['"](?!recipe-share-photos)/);
  });

  it('CLN-FN-06 logs nothing and answers without file names', () => {
    expect(EDGE).not.toMatch(/console\.|log\(/);
    expect(EDGE).toContain('return json(200, { claimed: plan.names.length, settled });');
    expect(EDGE).not.toMatch(/json\([^)]*names[^.]/);
  });
});
