import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  customerFormulationSourcePl,
  customerOptimizerNoSolutionPl,
  customerPreviewIssueMessagePl,
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
    const pro = readFileSync(new URL('../pro-core/ProRecalcPanel.tsx', import.meta.url), 'utf8');
    const preview = readFileSync(
      new URL('./ui/ConstraintPreviewCard.tsx', import.meta.url),
      'utf8',
    );
    expect(pro).toContain('customerPreviewIssueMessagePl');
    expect(pro).toContain('customerStopReasonPl');
    expect(preview).toContain('customerSolverSourcePl');
    expect(preview).toContain('customerFormulationSourcePl');
  });

  it('reports an exact Direction fixed point truthfully instead of claiming no changes are needed', () => {
    const copy = customerPreviewIssueMessagePl({
      ok: false,
      code: 'no_proposal',
      directionTargetUnreached: true,
      violatedMetrics: ['pod', 'npac'],
      solverInvocations: 3,
    });

    expect(copy).toContain('najbliższy osiągalny wynik');
    expect(copy).toContain('twardych ograniczeń');
    expect(copy).toContain('POD');
    expect(copy).toContain('NPAC');
    expect(copy).not.toContain('Nie są potrzebne żadne zmiany');
  });

  it('labels a Vegan search stop without claiming impossibility or nearest status', () => {
    const copy = customerPreviewIssueMessagePl({
      ok: false,
      code: 'no_proposal',
      failureKind: 'SEARCH_FAILED',
      directionTargetUnreached: true,
      violatedMetrics: ['pod', 'npac'],
      solverInvocations: 4,
      searchEvidence: {
        reason: 'vegan_direction_search_exhausted',
        requestedTargets: { sweetness: 1, softness: -2, creaminess: 0, flavor: 0 },
        bindingMetrics: ['pod', 'npac'],
        solverInvocations: 4,
        stopReason: 'fixed_point_no_proposal',
      },
    });

    expect(copy).toContain('nie znalazło propozycji');
    expect(copy).toContain('nie jest dowód niewykonalności');
    expect(copy).toContain('POD');
    expect(copy).toContain('NPAC');
    expect(copy).not.toContain('najbliższy');
    expect(copy).not.toContain('nie da się');
  });
});
