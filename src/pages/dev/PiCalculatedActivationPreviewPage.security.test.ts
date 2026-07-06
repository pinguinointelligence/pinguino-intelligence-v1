/// <reference types="node" />
/**
 * Static boundary guard for the DEV-only PI Calculated activation preview. Proves: DEV-only route
 * + NotFound fallback, reads only, runs the PURE planner, executes NOTHING — no write/persist
 * service, no pac/pod or status write, no supabase / locked base / raw DB verbs, no engine/AI/billing.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const HERE = import.meta.dirname;
const SRC = resolve(HERE, '..', '..');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const read = (...p: string[]) => stripComments(readFileSync(join(...p), 'utf8'));

const PAGE = read(HERE, 'PiCalculatedActivationPreviewPage.tsx');
const ROUTER = read(SRC, 'app', 'router.tsx');

describe('PiCalculatedActivationPreviewPage — DEV-only', () => {
  it('guards on import.meta.env.DEV and falls back to NotFound', () => {
    expect(/if\s*\(\s*!import\.meta\.env\.DEV\s*\)/.test(PAGE)).toBe(true);
    expect(PAGE.includes('NotFoundPage')).toBe(true);
  });
  it('registers /dev/pi-calculated-activation-preview ONLY under import.meta.env.DEV', () => {
    expect(/import\.meta\.env\.DEV\s*&&[\s\S]*?\/dev\/pi-calculated-activation-preview/.test(ROUTER)).toBe(true);
    expect(/path="\/dev\/pi-calculated-activation-preview"/.test(ROUTER)).toBe(true);
  });
});

describe('PiCalculatedActivationPreviewPage — plans only, executes nothing', () => {
  it('reads via the two read services and runs the pure planner', () => {
    expect(PAGE.includes('listMyProducts(')).toBe(true);
    expect(PAGE.includes('listEngineApprovedIngredients(')).toBe(true);
    expect(PAGE.includes('planClassDerivedActivations(')).toBe(true);
  });
  it('never calls any write/persist service (incl. the status write it PLANS)', () => {
    expect(
      /setProductLifecycleStatus\(|matchAndSaveProduct|saveProductMatchResult|updateProduct\(|createProduct|applyProductEnrichment/.test(PAGE),
    ).toBe(false);
    // it must not IMPORT the status-write service either — it only renders the plan string
    expect(/from '@\/services\/productStatusWrite'/.test(PAGE)).toBe(false);
  });
  it('never writes pac/pod, status, or npac', () => {
    expect(/pac_value\s*[:=]|pod_value\s*[:=]|npac_value/.test(PAGE)).toBe(false);
    expect(/\.status\s*=/.test(PAGE)).toBe(false);
  });
});

describe('PiCalculatedActivationPreviewPage — no DB / engine / nav', () => {
  it('no Supabase / privileged key / locked base / raw DB verbs', () => {
    expect(/supabase/i.test(PAGE)).toBe(false);
    expect(/@\/lib\/supabase/.test(PAGE)).toBe(false);
    expect(/service[_-]?role/i.test(PAGE)).toBe(false);
    expect(/mapper_basement/i.test(PAGE)).toBe(false);
    for (const v of ['.from(', '.insert(', '.update(', '.upsert(', '.delete(']) {
      expect(PAGE.includes(v), v).toBe(false);
    }
  });
  it('no engine/AI/billing, no nav', () => {
    expect(/@\/engine/.test(PAGE)).toBe(false);
    expect(/\b(openai|stripe)\b/i.test(PAGE)).toBe(false);
    expect(/navConfig|NAV_ITEMS/.test(PAGE)).toBe(false);
  });
});
