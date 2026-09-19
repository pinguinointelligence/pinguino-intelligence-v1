// @vitest-environment jsdom
/**
 * „Korekta partii" must never be a dead end — found on served staging, not in a test.
 *
 * A deviation was confirmed, the sheet opened, and it offered nothing: no options, no
 * explanation, only „Wróć". The operator is standing over a vessel with 150 g in it and
 * the batch cannot go on. An empty option list has three very different meanings — the
 * authority is still answering, it refused every option, or the request failed — and the
 * sheet has to say which.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { productionProcessCopy as copy } from './productionProcessCopy';
import { ProcessCorrectionSheet, type ProcessSheetFrame } from './ProductionProcessSheets';
import type { ProductionCorrectionView } from './productionProcessSteps';

const Frame: ProcessSheetFrame = ({ children }) => <div>{children}</div>;

const view = (over: Partial<ProductionCorrectionView>): ProductionCorrectionView => ({
  what: { name: 'BANANA · Fresh Fruit', actualG: 150, planG: 135 },
  options: [],
  pendingReason: null,
  impossibleReason: null,
  recommendedId: null,
  selectedId: null,
  applyLabel: copy.correctionTitle,
  ...over,
});

describe('„Korekta partii" always says what is happening', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  const render = (correction: ProductionCorrectionView, onRetry?: () => void) =>
    act(() => {
      root.render(
        <ProcessCorrectionSheet
          frame={Frame}
          correction={correction}
          onSelect={() => undefined}
          onApply={() => undefined}
          onBack={() => undefined}
          onRetry={onRetry ?? null}
        />,
      );
    });

  it('says it is still calculating instead of showing an empty sheet', () => {
    render(view({ pendingReason: copy.correctionCalculating }));
    expect(host.querySelector('[data-testid="process-correction-pending"]')?.textContent).toBe(
      copy.correctionCalculating,
    );
    // Still the normal heading: waiting is not the same as refusing.
    expect(host.textContent).toContain(copy.correctionTitle);
    expect(host.textContent).not.toContain(copy.correctionImpossible);
  });

  it('names the refusal when the authority offers nothing', () => {
    render(view({ impossibleReason: 'Nie ma bezpiecznego sposobu na tę partię.' }));
    expect(host.textContent).toContain(copy.correctionImpossible);
    expect(host.textContent).toContain('Nie ma bezpiecznego sposobu na tę partię.');
    expect(host.querySelector('[data-testid="process-correction-pending"]')).toBeNull();
  });

  it('offers a retry when the request failed, and none when it did not', () => {
    const retry = vi.fn();
    render(view({ impossibleReason: copy.correctionUnavailable }), retry);
    const button = host.querySelector<HTMLButtonElement>(
      '[data-testid="process-correction-retry"]',
    );
    expect(button).not.toBeNull();
    act(() => button!.click());
    expect(retry).toHaveBeenCalledTimes(1);

    render(view({ impossibleReason: copy.correctionUnavailable }));
    expect(host.querySelector('[data-testid="process-correction-retry"]')).toBeNull();
  });

  it('shows no waiting line once there are options to choose from', () => {
    render(
      view({
        options: [
          {
            id: 'leave_as_is',
            title: 'Zostaw jak jest',
            explanation: '…',
            score: 8,
            finalMassG: 465,
          },
        ],
        selectedId: 'leave_as_is',
        pendingReason: copy.correctionCalculating,
      }),
    );
    expect(host.querySelector('[data-testid="process-correction-options"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="process-correction-pending"]')).toBeNull();
  });
});
