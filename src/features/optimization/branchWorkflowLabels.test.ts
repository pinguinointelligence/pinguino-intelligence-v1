import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  branchCodeLabelKeysPl,
  branchCodeLabelPl,
  humanizeBranchCode,
} from './branchWorkflowLabels';
import { BRANCH_STATUS_LABEL } from './branchWorkflowPolicy';

const HERE = import.meta.dirname;

describe('branch-workflow display map (DISPLAY_MAP_ONLY)', () => {
  it('localises the contract codes without ever changing them', () => {
    // The KEY stays the raw spine contract value; only the wording is Polish.
    expect(branchCodeLabelPl('rescue_same_target_batch')).toBe('ratuj tę samą docelową partię');
    expect(branchCodeLabelPl('weigh_actual_batch_g')).toBe('zważ rzeczywistą partię (g)');
    expect(branchCodeLabelPl('stop_and_buy_missing_product')).toBe(
      'zatrzymaj i dokup brakujący produkt',
    );
    for (const code of branchCodeLabelKeysPl()) {
      expect(code).toMatch(/^[a-z0-9]+(_[a-z0-9]+)*$/); // raw snake_case contract shape
    }
  });

  it('falls back to the humanised raw code for an unknown contract value', () => {
    expect(branchCodeLabelPl('some_future_spine_code')).toBe('some future spine code');
    expect(humanizeBranchCode('some_future_spine_code')).toBe('some future spine code');
  });

  it('never returns an empty label', () => {
    for (const code of [...branchCodeLabelKeysPl(), 'unknown_code', '']) {
      expect(typeof branchCodeLabelPl(code)).toBe('string');
    }
    expect(branchCodeLabelPl('x')).toBe('x');
  });

  it('the panel renders codes through the display map, never raw', () => {
    const panelSrc = readFileSync(join(HERE, 'BranchWorkflowPreviewPanel.tsx'), 'utf8');
    expect(panelSrc).toContain('branchCodeLabelPl');
    // the old inline humanizer must not resurrect as the render path
    expect(panelSrc).not.toContain("s.replace(/_/g, ' ')");
  });

  it('every branch status label is Polish customer wording', () => {
    for (const label of Object.values(BRANCH_STATUS_LABEL)) {
      expect(label).not.toMatch(/\b(verified|blocked|missing|failed|not supported|improvement)\b/i);
    }
  });
});
