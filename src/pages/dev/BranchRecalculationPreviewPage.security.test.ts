/// <reference types="node" />
/**
 * Static boundary guard for the DEV-only IF9/IF10 Branch Recalculation Preview
 * page. Proves: DEV-only route + NotFound fallback, renders through the feature
 * preview modules only, and writes NOTHING — no DB client / service write, no
 * recipe save, no inventory write, no pac/pod write, no deep engine import.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const HERE = import.meta.dirname;
const SRC = resolve(HERE, '..', '..');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const PAGE = stripComments(readFileSync(join(HERE, 'BranchRecalculationPreviewPage.tsx'), 'utf8'));
const ROUTER = stripComments(readFileSync(join(SRC, 'app', 'router.tsx'), 'utf8'));

describe('BranchRecalculationPreviewPage — DEV-only', () => {
  it('guards on import.meta.env.DEV and falls back to NotFound', () => {
    expect(/if\s*\(\s*!import\.meta\.env\.DEV\s*\)/.test(PAGE)).toBe(true);
    expect(PAGE.includes('NotFoundPage')).toBe(true);
  });

  it('registers /dev/branch-recalculation-preview ONLY under import.meta.env.DEV', () => {
    expect(/import\.meta\.env\.DEV\s*&&[\s\S]*?\/dev\/branch-recalculation-preview/.test(ROUTER)).toBe(true);
    expect(/path="\/dev\/branch-recalculation-preview"/.test(ROUTER)).toBe(true);
  });
});

describe('BranchRecalculationPreviewPage — pure preview, no persistence', () => {
  it('renders through the branch preview feature modules + fixtures (no direct engine)', () => {
    expect(PAGE.includes('BRANCH_RECALCULATION_SCENARIOS')).toBe(true);
    expect(PAGE.includes('previewBatchRescueRecalculation')).toBe(true);
    expect(PAGE.includes('previewStockShortageRecalculation')).toBe(true);
    expect(/from\s+['"]@\/engine/.test(PAGE)).toBe(false); // page never touches the engine itself
  });

  it('shows the Slice 20/23 single-shot vs multi-step vs multi-lever fields', () => {
    expect(PAGE.includes('singleShotReason')).toBe(true);
    expect(PAGE.includes('multiStep')).toBe(true);
    expect(/multi-step:/.test(PAGE)).toBe(true);
    expect(PAGE.includes('multiLever')).toBe(true);
    expect(/multi-lever:/.test(PAGE)).toBe(true);
  });

  it('no DB client / service / Mapper / inventory / raw write verbs', () => {
    expect(/service_role/i.test(PAGE)).toBe(false);
    expect(/@\/lib\/|@\/services\//.test(PAGE)).toBe(false);
    expect(/mapper_basement|writeInventory|updateStock|decrementStock/i.test(PAGE)).toBe(false);
    for (const v of ['.from(', '.insert(', '.update(', '.upsert(', '.delete(']) {
      expect(PAGE.includes(v), v).toBe(false);
    }
  });

  it('no recipe save, no pac/pod write, no product-status activation, no apply/save buttons', () => {
    expect(/saveRecipe|persistRecipe|\.save\(/i.test(PAGE)).toBe(false);
    expect(/pac_value\s*[:=]|pod_value\s*[:=]/.test(PAGE)).toBe(false);
    expect(/setProductLifecycleStatus|pi_calculated|pi_verified/.test(PAGE)).toBe(false);
    expect(/onClick/.test(PAGE)).toBe(false); // render-only — nothing to apply or save
  });
});
