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
    expect(host.textContent).not.toContain('Baza techniczna');
    expect(host.textContent).toContain('1025 g');
    expect(host.textContent).toContain('Alergeny: milk');
    expect(host.querySelector('[data-testid="label-allergens-change"]')?.textContent).toBe('Zmień');
    const print = host.querySelector<HTMLButtonElement>('[data-testid="draft-label-print"]')!;
    expect(print.disabled).toBe(false);
    const change = host.querySelector<HTMLButtonElement>('[data-testid="draft-label-change"]')!;
    await act(async () => change.click());
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('keeps audit fields off the main card and exposes only Drukuj and Zmień', async () => {
    const restored = preview(true);
    await renderCard({ ...restored, confirmedFields: ['legal_product_name'] });
    expect(host.querySelector('[data-label-field="legal_product_name"]')).toBeNull();
    expect(host.querySelector('[data-label-field="acknowledgement"]')).toBeNull();
    expect(host.textContent).not.toContain('Ostatnie potwierdzenie');
    expect(host.textContent).not.toContain('Źródło potwierdzenia');
    expect(
      [...host.querySelectorAll('[data-testid="draft-label-actions"] button')].map((button) =>
        button.textContent?.trim(),
      ),
    ).toEqual(['Drukuj', 'Zmień']);
  });

  it('shows UNKNOWN as a compact row and offers the shared non-blocking print dialog', async () => {
    const onSave = vi.fn(async () => undefined);
    await renderCard(preview(true), onSave);
    expect(host.textContent).toContain('Alergeny nieustalone');
    expect(host.textContent).not.toContain('Brakuje danych źródłowych produktu o alergenach');
    expect(host.textContent?.toLowerCase()).not.toContain('bez alergenów');
    expect(host.querySelector('[data-testid="label-allergens-set"]')?.textContent).toBe('Ustaw');
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-testid="draft-label-print"]')!.click(),
    );
    expect(document.querySelector('[data-testid="label-print-missing-dialog"]')).not.toBeNull();
    expect(
      document.querySelector<HTMLInputElement>('[data-testid="label-print-missing-allergens"]')
        ?.value,
    ).toBe('');
    expect(document.body.textContent).toContain('Drukuj bez uzupełniania');
    expect(document.body.textContent).toContain(
      'Nieuzupełnione informacje nie pojawią się na etykiecie.',
    );
  });
});
