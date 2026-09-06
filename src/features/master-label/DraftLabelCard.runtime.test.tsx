// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildLabelPreflight } from './masterLabel';
import { createCompleteLabel } from './masterLabelTestFixture';
import { DraftLabelCard } from './DraftLabelCard';
import type { DraftLabelPreview } from './draftLabelPreview';

const preview = (incomplete = false): DraftLabelPreview => {
  const label = createCompleteLabel('EU', {
    sourceKind: 'recipe_draft',
    actualBatchQuantityG: 1025,
    packageQuantity: {
      value: 1025,
      unit: 'g',
      netWeightG: 1025,
      netVolumeMl: null,
      source: 'selected_fill',
      confirmedAt: '2026-09-06',
    },
    netQuantityG: 1025,
    productionDate: '2026-09-06',
    lotCode: 'LOT-20260906-LABELDRAFT',
    ...(incomplete
      ? {
          legalProductName: { pl: '' },
          allergens: {
            status: 'incomplete' as const,
            declared: [],
            mayContain: [],
            labelStatements: [],
            reviewedByUser: false,
          },
          preflightAcknowledged: false,
        }
      : {}),
  });
  const blockers = buildLabelPreflight(label).items.filter((item) => item.status !== 'ready');
  return {
    kind: 'draft',
    label,
    productName: 'Gelato mleczne',
    ingredients: label.ingredients.map((item) => ({
      id: item.lineId,
      name: item.names.pl ?? Object.values(item.names)[0] ?? '',
      grams: item.actualGrams,
      percent: item.percent,
    })),
    baseBatchG: 1000,
    finalProductG: 1025,
    plannedBatchG: 1025,
    confirmedFields: [],
    pending: blockers.map((item) => item.field),
    blockers,
    readyForPrint: blockers.length === 0,
  };
};

describe('DraftLabelCard', () => {
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

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  const renderCard = async (draft: DraftLabelPreview, onSave = vi.fn()) => {
    const onOpenSettings = vi.fn();
    await act(async () => {
      root.render(
        <MemoryRouter>
          <DraftLabelCard
            draft={draft}
            logoUrl={null}
            onSave={onSave}
            onOpenSettings={onOpenSettings}
          />
        </MemoryRouter>,
      );
    });
    return { onOpenSettings };
  };

  it('renders the exact preview LOT/date/final mass and both bottom actions', async () => {
    const { onOpenSettings } = await renderCard(preview());
    expect(host.textContent).toContain('LOT-20260906-LABELDRAFT');
    expect(host.textContent).toContain('2026-09-06');
    expect(host.textContent).toContain('Baza techniczna');
    expect(host.textContent).toContain('1000 g');
    expect(host.textContent).toContain('1025 g');
    expect(host.textContent).toContain('Alergeny: milk');
    expect(host.querySelector('[data-testid="label-allergens-change"]')?.textContent).toBe('Zmień');
    const print = host.querySelector<HTMLButtonElement>('[data-testid="draft-label-print"]')!;
    expect(print.disabled).toBe(false);
    const change = host.querySelector<HTMLButtonElement>('[data-testid="draft-label-change"]')!;
    await act(async () => change.click());
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('restores the confirmed inline state and enables it only after Zmień', async () => {
    const restored = preview(true);
    await renderCard({ ...restored, confirmedFields: ['legal_product_name'] });
    const legal = host.querySelector<HTMLElement>('[data-label-field="legal_product_name"]')!;
    const input = legal.querySelector<HTMLInputElement>('input')!;
    expect(input.matches(':disabled')).toBe(true);
    const change = legal.querySelector<HTMLButtonElement>(
      '[data-testid="label-field-change-legal_product_name"]',
    )!;
    await act(async () => change.click());
    expect(input.matches(':disabled')).toBe(false);
  });

  it('shows UNKNOWN as a direct non-blocking label row instead of passive missing data', async () => {
    const onSave = vi.fn(async () => undefined);
    await renderCard(preview(true), onSave);
    const legal = host.querySelector<HTMLElement>('[data-label-field="legal_product_name"]')!;
    expect(legal).not.toBeNull();
    expect(
      legal.querySelector('[data-testid="label-field-confirm-legal_product_name"]'),
    ).not.toBeNull();
    const acknowledgement = host.querySelector<HTMLElement>(
      '[data-label-field="acknowledgement"]',
    )!;
    const acknowledgementCheckbox = acknowledgement.querySelector<HTMLInputElement>('input')!;
    await act(async () => {
      acknowledgementCheckbox.click();
    });
    expect(acknowledgementCheckbox.checked).toBe(true);
    const confirm = acknowledgement.querySelector<HTMLButtonElement>(
      '[data-testid="label-field-confirm-acknowledgement"]',
    )!;
    await act(async () => {
      confirm.click();
      await Promise.resolve();
    });
    expect(onSave).toHaveBeenCalledWith(expect.any(Object), 'acknowledgement');
    expect(host.querySelector('[data-testid="label-field-saved-acknowledgement"]')).not.toBeNull();
    expect(acknowledgement.querySelector('fieldset')?.hasAttribute('disabled')).toBe(true);
    expect(
      acknowledgement.querySelector('[data-testid="label-field-change-acknowledgement"]'),
    ).not.toBeNull();
    expect(host.textContent).toContain('Alergeny nieustalone');
    expect(host.textContent).not.toContain('Brakuje danych źródłowych produktu o alergenach');
    expect(host.textContent?.toLowerCase()).not.toContain('bez alergenów');
    expect(host.querySelector('[data-testid="label-allergens-set"]')?.textContent).toBe('Ustaw');
  });
});
