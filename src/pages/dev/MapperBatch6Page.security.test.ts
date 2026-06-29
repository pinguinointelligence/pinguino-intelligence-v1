/// <reference types="node" />
/**
 * Static boundary guard for the DEV-only six-product Mapper batch page. Scans the
 * comment-stripped source of the page + its view (and the router) and proves the batch
 * stayed safe: DEV-only, EXACTLY the six hardcoded ids, the only action is the
 * boundary-tested orchestrator matchAndSaveProduct, no full-list / import / create /
 * runMatch, no direct DB / locked-base / privileged access, no nav exposure.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const HERE = import.meta.dirname;
const SRC = resolve(HERE, '..', '..'); // .../src
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const read = (...p: string[]) => stripComments(readFileSync(join(...p), 'utf8'));

const PAGE = read(HERE, 'MapperBatch6Page.tsx');
const VIEW = read(HERE, 'mapperBatch6View.tsx');
const ALL = `${PAGE}\n${VIEW}`;
const ROUTER = read(SRC, 'app', 'router.tsx');

const IDS = [
  '0acf8585-0967-4d8f-ad4e-597d2dd26f6a',
  '50bee8c3-60b4-447a-84c6-ce8474e2ff59',
  'a8cecf22-d2ef-4426-af9a-8133a1516782',
  'f5c2d6a7-87f1-42d4-a2e2-de82b3af844e',
  '69fb82a0-62a8-4eb2-94ed-4e1fbe648691',
  '31a9a7df-ccb3-4c61-a1ea-dd5d86c2a079',
];

describe('MapperBatch6Page — DEV-only', () => {
  it('guards on import.meta.env.DEV and falls back to NotFound', () => {
    expect(/if\s*\(\s*!import\.meta\.env\.DEV\s*\)/.test(PAGE)).toBe(true);
    expect(PAGE.includes('NotFoundPage')).toBe(true);
  });
  it('registers the /dev/mapper-batch-6 route ONLY under import.meta.env.DEV', () => {
    expect(/import\.meta\.env\.DEV\s*&&[\s\S]*?\/dev\/mapper-batch-6/.test(ROUTER)).toBe(true);
    expect(/path="\/dev\/mapper-batch-6"/.test(ROUTER)).toBe(true);
  });
});

describe('MapperBatch6Page — exactly the six single-candidate products', () => {
  it('contains EXACTLY the six hardcoded ids (each once, no others)', () => {
    const found = ALL.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) ?? [];
    expect(found.length).toBe(6);
    expect([...new Set(found)].sort()).toEqual([...IDS].sort());
  });
  it('its only action is matchAndSaveProduct — no full-list / import / create / runMatch', () => {
    expect(PAGE.includes('matchAndSaveProduct(')).toBe(true);
    expect(/listMyProducts|importProductCatalog|createProductWithIdentity|runMatch/.test(ALL)).toBe(false);
  });
});

describe('MapperBatch6Page — no DB / locked base / privileged / engine access', () => {
  it('its only service import is the boundary-tested orchestrator', () => {
    expect(PAGE.includes("from '@/services/productMapper'")).toBe(true);
    expect(/@\/services\/(products|ingredients)\b/.test(ALL)).toBe(false);
  });
  it('never touches Supabase, a privileged key, the locked base, or raw DB verbs', () => {
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

describe('MapperBatch6Page — no auto-run, no nav exposure', () => {
  it('has no scheduler / mount-time auto-run (runs only from the click handler)', () => {
    expect(/\b(cron|schedule|setInterval|setTimeout|onInsert|trigger|subscribe|background)\b/i.test(ALL)).toBe(false);
    expect(/useEffect/.test(ALL)).toBe(false);
  });
  it('does not modify or reference the navigation config', () => {
    expect(/navConfig|NAV_ITEMS/.test(ALL)).toBe(false);
  });
});
