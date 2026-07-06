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

describe('PiCalculatedActivationPreviewPage — reads + the ONE guarded status write', () => {
  it('reads via the two read services and runs the pure planner', () => {
    expect(PAGE.includes('listMyProducts(')).toBe(true);
    expect(PAGE.includes('listEngineApprovedIngredients(')).toBe(true);
    expect(PAGE.includes('planClassDerivedActivations(')).toBe(true);
  });
  it('its ONLY write is the narrow guarded setProductLifecycleStatus (persists pi_calculated)', () => {
    expect(PAGE.includes("from '@/services/productStatusWrite'")).toBe(true);
    expect(PAGE.includes('setProductLifecycleStatus(')).toBe(true);
    // no broad update / match-save / enrichment / create writes
    expect(
      /matchAndSaveProduct|saveProductMatchResult|saveProductMapperReview|updateProduct\(|createProduct|importProductCatalog|applyProductEnrichment/.test(PAGE),
    ).toBe(false);
  });
  it('activates only pi_calculated — never PI Verified, never a red-flag override', () => {
    expect(/'pi_calculated'/.test(PAGE)).toBe(true);
    expect(/'pi_verified'/.test(PAGE)).toBe(false);
    expect(/independent_provenance|red_flags_clear/.test(PAGE)).toBe(false);
  });
  it('never writes pac/pod or npac', () => {
    expect(/pac_value\s*[:=]|pod_value\s*[:=]|npac_value/.test(PAGE)).toBe(false);
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
