/// <reference types="node" />
/**
 * Static boundary guard for the DEV-only Mapper review page. Scans the comment-stripped
 * page + view (and the router + ProductImportPage) and proves the review surface stayed
 * safe: DEV-only, no nav, READS for display only, the ONLY product writes are
 * confirmProductMatch / rejectProductMatch, no matching / batch / import / create, no raw
 * DB / locked-base / privileged access, no auto-run, and ProductImportPage is untouched.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const HERE = import.meta.dirname;
const SRC = resolve(HERE, '..', '..'); // .../src
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const read = (...p: string[]) => stripComments(readFileSync(join(...p), 'utf8'));

const PAGE = read(HERE, 'MapperReviewPage.tsx');
const VIEW = read(HERE, 'mapperReviewView.tsx');
const ALL = `${PAGE}\n${VIEW}`;
const ROUTER = read(SRC, 'app', 'router.tsx');
const IMPORT_PAGE = read(SRC, 'pages', 'destinations', 'ProductImportPage.tsx');

describe('MapperReviewPage — DEV-only', () => {
  it('guards on import.meta.env.DEV and falls back to NotFound', () => {
    expect(/if\s*\(\s*!import\.meta\.env\.DEV\s*\)/.test(PAGE)).toBe(true);
    expect(PAGE.includes('NotFoundPage')).toBe(true);
  });
  it('registers the /dev/mapper-review route ONLY under import.meta.env.DEV', () => {
    expect(/import\.meta\.env\.DEV\s*&&[\s\S]*?\/dev\/mapper-review/.test(ROUTER)).toBe(true);
    expect(/path="\/dev\/mapper-review"/.test(ROUTER)).toBe(true);
  });
});

describe('MapperReviewPage — confirm/reject only; pure matchProduct for display; no persist-match', () => {
  it('its persisted write actions are exactly confirmProductMatchTo / rejectProductMatch', () => {
    expect(PAGE.includes("from '@/services/productReview'")).toBe(true);
    expect(PAGE.includes('confirmProductMatchTo')).toBe(true);
    expect(PAGE.includes('rejectProductMatch')).toBe(true);
  });
  it('uses the PURE matchProduct only to compute candidates — never a persist / match-and-save path', () => {
    expect(PAGE.includes("from '@/data/products/productMatcher'")).toBe(true);
    expect(
      /matchAndSaveProduct|importProductCatalog|createProduct|updateProduct|saveProductMatchResult|saveProductMapperReview|runMatch/.test(
        ALL,
      ),
    ).toBe(false);
  });
  it('reads product + candidate data for DISPLAY via the read services', () => {
    expect(PAGE.includes('listMyProducts(')).toBe(true);
    expect(PAGE.includes('listEngineApprovedIngredients(')).toBe(true);
  });
});

describe('MapperReviewPage — no DB / locked base / privileged / engine access', () => {
  it('never touches Supabase, a privileged key, the locked base, or raw DB verbs', () => {
    expect(/supabase/i.test(ALL)).toBe(false);
    expect(/@\/lib\/supabase/.test(ALL)).toBe(false);
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

describe('MapperReviewPage — no auto-run, no nav exposure', () => {
  it('has no mount-time auto-run (loads + acts only from click handlers)', () => {
    expect(/useEffect/.test(ALL)).toBe(false);
    expect(/\b(cron|schedule|setInterval|setTimeout|onInsert|trigger|subscribe|background)\b/i.test(ALL)).toBe(false);
  });
  it('does not modify or reference the navigation config', () => {
    expect(/navConfig|NAV_ITEMS/.test(ALL)).toBe(false);
  });
});

describe('ProductImportPage — still untouched by the review path', () => {
  it('does not reference the review or match run paths', () => {
    expect(/confirmProductMatch|rejectProductMatch|matchAndSaveProduct|runMatch/.test(IMPORT_PAGE)).toBe(false);
  });
});
