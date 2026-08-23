import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  RESERVED_HANDLES,
  canonicalHandle,
  slugifyTitle,
  suggestHandle,
  validateHandle,
} from './creatorHandle';

describe('creator handles', () => {
  it('canonicalises case and whitespace (§6: unique case-insensitively)', () => {
    expect(canonicalHandle('  MaRySia ')).toBe('marysia');
    const a = validateHandle('Marysia');
    const b = validateHandle('marysia');
    expect(a.ok && b.ok && a.handle === b.handle).toBe(true);
  });

  it('accepts URL-safe handles and refuses everything else, with a typed reason', () => {
    expect(validateHandle('marysia')).toEqual({ ok: true, handle: 'marysia' });
    expect(validateHandle('gelato_lab-99')).toEqual({ ok: true, handle: 'gelato_lab-99' });
    expect(validateHandle('')).toEqual({ ok: false, reason: 'empty' });
    expect(validateHandle('ab')).toEqual({ ok: false, reason: 'too_short' });
    expect(validateHandle('a'.repeat(31))).toEqual({ ok: false, reason: 'too_long' });
    expect(validateHandle('marysia gelato')).toEqual({ ok: false, reason: 'invalid_characters' });
    expect(validateHandle('maryśka')).toEqual({ ok: false, reason: 'invalid_characters' });
    expect(validateHandle('_leading')).toEqual({ ok: false, reason: 'invalid_characters' });
    expect(validateHandle('marysia/../admin')).toEqual({ ok: false, reason: 'invalid_characters' });
  });

  it('refuses reserved words so a handle can never shadow a route', () => {
    for (const reserved of ['admin', 'share', 'recipes', 'pro', 'top100', 'gellatti']) {
      expect(validateHandle(reserved), reserved).toEqual({ ok: false, reason: 'reserved' });
      expect(validateHandle(reserved.toUpperCase()), reserved).toEqual({
        ok: false,
        reason: 'reserved',
      });
    }
  });

  it('LOCKSTEP: every reserved handle is seeded in the migration too', () => {
    const sql = readFileSync(
      resolve(
        import.meta.dirname,
        '../../../../supabase/migrations/20260823140000_community_creators_sharing_v1.sql',
      ),
      'utf8',
    ).replace(/\r\n?/g, '\n');
    const block = sql.split('insert into public.creator_reserved_handles (handle) values')[1] ?? '';
    const seeded = new Set(
      (block.split('on conflict')[0] ?? '').match(/'([a-z0-9]+)'/g)?.map((m) => m.slice(1, -1)) ?? [],
    );
    expect(seeded.size).toBeGreaterThan(0);
    for (const handle of RESERVED_HANDLES) {
      expect(seeded.has(handle), `${handle} missing from the SQL seed`).toBe(true);
    }
    expect(seeded.size).toBe(RESERVED_HANDLES.length);
  });

  it('suggests a handle from a Polish display name and never suggests a reserved one', () => {
    expect(suggestHandle('Marysia Kowalska')).toBe('marysia-kowalska');
    expect(suggestHandle('Zażółć Gęślą Jaźń')).toBe('zazolc-gesla-jazn');
    expect(suggestHandle('Admin')).toBe('admin-gellatti');
    expect(suggestHandle('a')).toBeNull();
  });

  it('slugifies recipe titles into stable public URLs', () => {
    expect(slugifyTitle('Pistachio Salted Caramel')).toBe('pistachio-salted-caramel');
    expect(slugifyTitle('Truskawka & Bazylia — 2026')).toBe('truskawka-bazylia-2026');
    expect(slugifyTitle('   ')).toBeNull();
    expect(slugifyTitle('!!!')).toBeNull();
    expect(slugifyTitle('x'.repeat(200))?.length).toBe(80);
  });
});
