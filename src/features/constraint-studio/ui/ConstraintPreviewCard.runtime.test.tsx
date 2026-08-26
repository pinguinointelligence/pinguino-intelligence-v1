/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import { buildBatchRescalePreview, type ConstraintPreview } from '../applyPipeline';
import { ConstraintPreviewCard } from './ConstraintPreviewCard';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let host: HTMLDivElement;
let root: Root;

const previewFixture = (): { preview: ConstraintPreview; unchangedName: string } => {
  const built = buildBatchRescalePreview(
    starterMilkBase(),
    { byLineId: {} },
    1_200,
    '2026-08-26T10:00:00.000Z',
  );
  if (!built.ok) throw new Error(`batch preview fixture failed: ${built.code}`);
  const first = built.preview.lines[0];
  if (!first || first.beforeGrams === null) throw new Error('preview fixture has no stable row');
  return {
    preview: {
      ...built.preview,
      lines: built.preview.lines.map((line, index) =>
        index === 0
          ? {
              ...line,
              kind: 'unchanged' as const,
              afterGrams: line.beforeGrams,
            }
          : line,
      ),
    },
    unchangedName: first.name,
  };
};

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe('compact PI preview presentation', () => {
  it('shows customer essentials, reveals unchanged rows on demand and preserves Apply/Back actions', async () => {
    const { preview, unchangedName } = previewFixture();
    const onApply = vi.fn();
    const onCancel = vi.fn();

    await act(async () => {
      root.render(
        <ConstraintPreviewCard
          preview={preview}
          onApply={onApply}
          onCancel={onCancel}
          showCloseControl
        />,
      );
    });

    expect(host.textContent).toContain('Proponowane zmiany receptury');
    expect(host.querySelector('[data-testid="preview-customer-view"]')?.className).toContain(
      '[--color-ivory:#202124]',
    );
    expect(host.textContent).toContain('Zmiany składników');
    expect(host.textContent).toContain('Zastosuj zmiany');
    expect(host.textContent).toContain('Wróć');
    expect(host.textContent).not.toContain('Suma przed:');
    expect(host.textContent).not.toContain('Chronione przez Apply');
    expect(host.textContent).not.toContain(unchangedName);
    expect(host.querySelector('[data-testid="preview-technical-details"]')).toBeNull();

    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="preview-toggle-unchanged"]')?.click();
    });
    expect(host.textContent).toContain(unchangedName);
    expect(
      host
        .querySelector<HTMLButtonElement>('[data-testid="preview-toggle-unchanged"]')
        ?.getAttribute('aria-expanded'),
    ).toBe('true');

    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="preview-apply"]')?.click();
      host.querySelector<HTMLButtonElement>('[data-testid="preview-cancel"]')?.click();
      host.querySelector<HTMLButtonElement>('[data-testid="preview-close"]')?.click();
    });
    expect(onApply).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('adds the same customer view plus a closed technical accordion for an admin', async () => {
    const { preview } = previewFixture();
    await act(async () => {
      root.render(
        <ConstraintPreviewCard
          preview={preview}
          onApply={() => undefined}
          onCancel={() => undefined}
          showTechnicalDetails
        />,
      );
    });

    const details = host.querySelector<HTMLDetailsElement>(
      '[data-testid="preview-technical-details"]',
    );
    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);
    expect(details?.textContent).toContain('Szczegóły techniczne');
    expect(details?.textContent).toContain('Suma przed:');
    expect(host.textContent).toContain('Proponowane zmiany receptury');
  });
});
