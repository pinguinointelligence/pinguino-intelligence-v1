/// <reference types="node" />
/**
 * `share-photo` Edge Function (owner decisions 2026-09-17): the private
 * photograph of a direct share is served as bytes, per request, after the
 * database decided — to a guest holding a valid token too — and every new
 * request after a revoke or expiry is refused.
 *
 * The pure protocol is tested directly; the Deno entrypoint is read as source,
 * the way catalogSubmitImageSafety reads catalog-submit.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CORS_HEADERS,
  PRIVATE_HEADERS,
  linkRefusalAt,
  parseSharePhotoRequest,
  photoTypeOf,
  refusalOf,
  refusalStatus,
} from '../../../supabase/functions/share-photo/protocol';

const EDGE = readFileSync(join(process.cwd(), 'supabase/functions/share-photo/index.ts'), 'utf8');
const TOKEN = 'uR2bHn5wVd3qPzX8cLmK1sT4yF6gJ0aE9hQ7iNoWbZc'; // 43 chars, the real format
const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

describe('share-photo protocol', () => {
  it('SHARE-FN-01 accepts exactly one of a well-formed token or share id', () => {
    expect(parseSharePhotoRequest({ token: TOKEN })).toEqual({ by: 'token', token: TOKEN });
    expect(parseSharePhotoRequest({ shareLinkId: ID })).toEqual({
      by: 'share_link_id',
      shareLinkId: ID,
    });
    for (const body of [
      null,
      [],
      'token',
      {},
      { token: TOKEN, shareLinkId: ID },
      { token: 'short' },
      { token: `${TOKEN}?x=1` },
      { token: 42 },
      { shareLinkId: 'not-a-uuid' },
      { shareLinkId: `${ID}/../x` },
    ]) {
      expect(parseSharePhotoRequest(body), JSON.stringify(body)).toBeNull();
    }
  });

  it('SHARE-FN-02 a refusal is 410 only for a link that existed and is switched off, 404 otherwise', () => {
    expect(refusalStatus(refusalOf({ ok: false, reason: 'revoked' }))).toBe(410);
    expect(refusalStatus(refusalOf({ ok: false, reason: 'expired' }))).toBe(410);
    expect(refusalStatus(refusalOf({ ok: false, reason: 'not_found' }))).toBe(404);
    expect(refusalStatus(refusalOf({ ok: false, reason: 'anything else' }))).toBe(404);
    expect(refusalStatus(refusalOf({ ok: false }))).toBe(404);
  });

  it('SHARE-FN-03 the link is re-checked when the bytes are read: a revoke in between wins', () => {
    const now = new Date('2026-09-17T12:00:00Z');
    expect(linkRefusalAt({ status: 'active', expires_at: null }, now)).toBeNull();
    expect(linkRefusalAt({ status: 'active', expires_at: '2026-09-18T00:00:00Z' }, now)).toBeNull();
    expect(linkRefusalAt({ status: 'revoked', expires_at: null }, now)).toBe('revoked');
    expect(linkRefusalAt({ status: 'active', expires_at: '2026-09-17T12:00:00Z' }, now)).toBe(
      'expired',
    );
    expect(linkRefusalAt(null, now)).toBe('not_found');
  });

  it('SHARE-FN-04 private photograph headers: nothing may store it, nothing may sniff it', () => {
    expect(PRIVATE_HEADERS['Cache-Control']).toBe('private, no-store, max-age=0');
    expect(PRIVATE_HEADERS['X-Content-Type-Options']).toBe('nosniff');
    expect(PRIVATE_HEADERS['Referrer-Policy']).toBe('no-referrer');
    expect(PRIVATE_HEADERS.Vary).toBe('Authorization');
    expect(CORS_HEADERS['Access-Control-Allow-Methods']).toBe('POST, OPTIONS');
    expect(CORS_HEADERS['Access-Control-Expose-Headers']).toBe('x-share-photo-type');
    expect(photoTypeOf('image/webp')).toBe('image/webp');
    expect(photoTypeOf('text/html')).toBe('application/octet-stream');
    expect(photoTypeOf(undefined)).toBe('application/octet-stream');
  });
});

describe('share-photo entrypoint (source)', () => {
  const decide = EDGE.indexOf("caller.rpc(\n    'gellatti_share_photo_v1'");
  const admin = EDGE.indexOf("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')");
  const download = EDGE.indexOf('.download(row.storage_path)');

  it('SHARE-FN-05 decides with the CALLER’s credentials before the service role touches anything', () => {
    expect(decide).toBeGreaterThan(-1);
    expect(EDGE).toContain(
      "global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }",
    );
    expect(admin).toBeGreaterThan(decide);
    expect(download).toBeGreaterThan(admin);
    expect(EDGE.indexOf('if (!decision.ok)')).toBeLessThan(admin);
    expect(EDGE.indexOf('if (!decision.has_own_photo) return noPhoto();')).toBeLessThan(admin);
  });

  it('SHARE-FN-06 reads only the photograph of the decided link, after re-checking that link', () => {
    expect(EDGE).toContain(".eq('share_link_id', decision.share_link_id)");
    expect(EDGE).toContain('recipe_share_links!inner(status, expires_at)');
    expect(EDGE.indexOf('linkRefusalAt(')).toBeLessThan(download);
    expect(EDGE).toContain("const BUCKET = 'recipe-share-photos';");
  });

  it('SHARE-FN-07 no signed URL, no redirect, no token in a URL, nothing logged', () => {
    expect(EDGE).not.toMatch(/createSignedUrl|getPublicUrl|Response\.redirect|status:\s*30[1278]/);
    expect(EDGE).not.toMatch(/console\.|log\(/);
    expect(EDGE).not.toMatch(/searchParams|new URL\(req\.url\)/);
    expect(EDGE).toContain("if (req.method !== 'POST') return refuse(405, 'method_not_allowed');");
  });

  it('SHARE-FN-08 every answer carries the private headers', () => {
    const responses = EDGE.match(/new Response\(/g) ?? [];
    // OPTIONS preflight, refuse(), noPhoto(), the bytes
    expect(responses).toHaveLength(4);
    expect(EDGE.match(/\.\.\.PRIVATE_HEADERS/g)).toHaveLength(3);
  });
});
