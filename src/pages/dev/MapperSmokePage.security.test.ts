/// <reference types="node" />
/**
 * Static boundary guard for the DEV-only one-product Mapper smoke page. Scans the
 * comment-stripped source of the page + its view (and the router + ProductImportPage)
 * and proves the slice stayed a single-product DEV tool: DEV-only, one hardcoded id,
 * no batch/full matching, no direct DB / locked-base / privileged access, no nav, and
 * ProductImportPage is untouched. No live DB, no render.
 *
 * "No mapper_basement write path" is proven structurally: the page's ONLY service import
 * is matchAndSaveProduct from '@/services/productMapper' — the orchestrator that
 * productMapper.security.test.ts already pins as never writing the locked reference base.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const HERE = import.meta.dirname;
const SRC = resolve(HERE, '..', '..'); // .../src
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const read = (...p: string[]) => stripComments(readFileSync(join(...p), 'utf8'));

const PAGE = read(HERE, 'MapperSmokePage.tsx');
const VIEW = read(HERE, 'mapperSmokeView.tsx');
const ALL = `${PAGE}\n${VIEW}`;
const ROUTER = read(SRC, 'app', 'router.tsx');
const IMPORT_PAGE = read(SRC, 'pages', 'destinations', 'ProductImportPage.tsx');

const SMOKE_ID = '18313d47-ddad-4e4e-b1f9-ba39c9ad9434';

describe('MapperSmokePage — DEV-only', () => {
  it('the page guards on import.meta.env.DEV and falls back to NotFound', () => {
    expect(/if\s*\(\s*!import\.meta\.env\.DEV\s*\)/.test(PAGE)).toBe(true);
    expect(PAGE.includes('NotFoundPage')).toBe(true);
  });
  it('registers the /dev/mapper-smoke route ONLY under import.meta.env.DEV', () => {
    expect(/import\.meta\.env\.DEV\s*&&[\s\S]*?\/dev\/mapper-smoke/.test(ROUTER)).toBe(true);
    // and the path is not registered unconditionally anywhere else
    expect(/path="\/dev\/mapper-smoke"/.test(ROUTER)).toBe(true);
  });
});

describe('MapperSmokePage — exactly one product, no batch / full matching', () => {
  it('calls matchAndSaveProduct with the single hardcoded smoke id', () => {
    expect(PAGE.includes('matchAndSaveProduct(')).toBe(true);
    expect(PAGE.includes(SMOKE_ID)).toBe(true);
  });
  it('references no product id other than the one smoke id', () => {
    const ids = ALL.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) ?? [];
    expect([...new Set(ids)]).toEqual([SMOKE_ID]);
  });
  it('has no batch / loop / list / import / runMatch path', () => {
    expect(/listMyProducts|importProductCatalog|createProductWithIdentity|runMatch/.test(ALL)).toBe(false);
    expect(/\.map\(|\.forEach\(|\bfor\s*\(|\bwhile\s*\(/.test(ALL)).toBe(false);
  });
});

describe('MapperSmokePage — no DB / locked base / privileged / engine access', () => {
  it('its only service import is the boundary-tested orchestrator (no data layer, no basement read)', () => {
    expect(PAGE.includes("from '@/services/productMapper'")).toBe(true);
    expect(/@\/services\/(products|ingredients)\b/.test(ALL)).toBe(false);
  });
  it('never touches Supabase, a privileged key, or the locked reference base directly', () => {
    expect(/supabase/i.test(ALL)).toBe(false);
    expect(/service[_-]?role/i.test(ALL)).toBe(false);
    expect(/mapper_basement/i.test(ALL)).toBe(false);
    expect(/npac_value/i.test(ALL)).toBe(false);
    for (const verb of ['.from(', '.insert(', '.update(', '.upsert(', '.delete(']) {
      expect(ALL.includes(verb), verb).toBe(false);
    }
  });
  it('imports no engine, AI, or billing', () => {
    expect(/@\/engine/.test(ALL)).toBe(false);
    expect(/\b(openai|stripe)\b/i.test(ALL)).toBe(false);
  });
});

describe('MapperSmokePage — no auto-run, no nav exposure', () => {
  it('has no scheduler / trigger / mount-time auto-run', () => {
    expect(/\b(cron|schedule|setInterval|setTimeout|onInsert|trigger|subscribe|background)\b/i.test(ALL)).toBe(false);
    expect(/useEffect/.test(ALL)).toBe(false); // the match runs only from the click handler
  });
  it('does not modify or reference the navigation config', () => {
    expect(/navConfig|NAV_ITEMS/.test(ALL)).toBe(false);
  });
});

describe('ProductImportPage — still untouched by the Mapper run path', () => {
  it('does not reference matchAndSaveProduct (or the products data layer)', () => {
    expect(/matchAndSaveProduct|createProductWithIdentity/.test(IMPORT_PAGE)).toBe(false);
    expect(/runMatch/.test(IMPORT_PAGE)).toBe(false);
  });
});
