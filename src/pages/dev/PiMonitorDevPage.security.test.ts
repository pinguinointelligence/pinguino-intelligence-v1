/// <reference types="node" />
/**
 * Static boundary guard for the DEV-only PI Recipe Monitor page. Proves: DEV-only
 * route + NotFound fallback, renders a pure preview (real engine + solver via the
 * feature runner), and writes NOTHING — no Supabase / DB service, no recipe save,
 * no pac/pod write, no product-status activation, no deep engine import.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const HERE = import.meta.dirname;
const SRC = resolve(HERE, '..', '..');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const read = (...p: string[]) => stripComments(readFileSync(join(...p), 'utf8'));

const PAGE = read(HERE, 'PiMonitorDevPage.tsx');
const ROUTER = read(SRC, 'app', 'router.tsx');

describe('PiMonitorDevPage — DEV-only', () => {
  it('guards on import.meta.env.DEV and falls back to NotFound', () => {
    expect(/if\s*\(\s*!import\.meta\.env\.DEV\s*\)/.test(PAGE)).toBe(true);
    expect(PAGE.includes('NotFoundPage')).toBe(true);
  });

  it('registers /dev/pi-monitor ONLY under import.meta.env.DEV', () => {
    expect(/import\.meta\.env\.DEV\s*&&[\s\S]*?\/dev\/pi-monitor/.test(ROUTER)).toBe(true);
    expect(/path="\/dev\/pi-monitor"/.test(ROUTER)).toBe(true);
  });
});

describe('PiMonitorDevPage — pure preview, no persistence', () => {
  it('renders through the feature runner + fixtures (no direct engine/DB)', () => {
    expect(PAGE.includes('realPiRecalculationRunner')).toBe(true);
    expect(PAGE.includes('PI_MONITOR_FIXTURES')).toBe(true);
  });

  it('no Supabase / DB service / Mapper basement / raw DB verbs', () => {
    expect(/supabase|service_role/i.test(PAGE)).toBe(false);
    expect(/@\/lib\/supabase|@\/services\//.test(PAGE)).toBe(false);
    expect(/mapper_basement/i.test(PAGE)).toBe(false);
    for (const v of ['.from(', '.insert(', '.update(', '.upsert(', '.delete(']) {
      expect(PAGE.includes(v), v).toBe(false);
    }
  });

  it('no deep engine import, no recipe save, no pac/pod write, no product-status activation', () => {
    expect(/from\s+['"]@\/engine\/[^'"]+['"]/.test(PAGE)).toBe(false);
    expect(/saveRecipe|persistRecipe|\.save\(/i.test(PAGE)).toBe(false);
    expect(/pac_value\s*[:=]|pod_value\s*[:=]/.test(PAGE)).toBe(false);
    expect(/setProductLifecycleStatus|pi_calculated|pi_verified/.test(PAGE)).toBe(false);
  });
});
