import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  customerFormulationSourcePl,
  customerOptimizerNoSolutionPl,
  customerSolverSourcePl,
  customerStopReasonPl,
} from './customerConstraintStudioPresentation';

describe('customer PI copy boundary', () => {
  it('keeps solver counts out of normal customer messages', () => {
    const copy = [
      customerStopReasonPl('local_no_proposal'),
      customerStopReasonPl('template_fixed_point'),
      customerOptimizerNoSolutionPl(['NPAC']),
      customerSolverSourcePl,
      customerFormulationSourcePl('milk-gelato'),
    ].join('\n');
    expect(copy).not.toMatch(/\b\d+\s*[×x]\b|wywołani|uruchomiony\s+\d|\d+\s+rund/i);
    expect(copy).toContain('Parametry poza zakresem: NPAC');
  });

  it('wires customer panels to the sanitized projection while retaining Owner proof copy', () => {
    const pro = readFileSync(
      new URL('../pro-core/ProRecalcPanel.tsx', import.meta.url),
      'utf8',
    );
    const preview = readFileSync(
      new URL('./ui/ConstraintPreviewCard.tsx', import.meta.url),
      'utf8',
    );
    expect(pro).toContain('customerPreviewIssueMessagePl');
    expect(pro).toContain('customerStopReasonPl');
    expect(preview).toContain('customerSolverSourcePl');
    expect(preview).toContain('customerFormulationSourcePl');
  });
});
