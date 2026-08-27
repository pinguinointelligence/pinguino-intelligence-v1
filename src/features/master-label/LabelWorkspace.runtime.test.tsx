// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { calculateRecipe, type RecipeInput } from '@/engine';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import {
  completeProductionSession,
  confirmProductionLine,
  createProductionSession,
} from '@/features/production-workspace/productionSession';
import {
  defaultAccountLabelProfile,
  inMemoryLabelRepository,
  resetInMemoryLabelRepositoryForTests,
  type LabelRepository,
  type RunLabelSnapshot,
} from '@/services/labels/labelRepository';
import { useAuthStore } from '@/stores/authStore';
import { LabelWorkspace } from './LabelWorkspace';
import { COMPLETE_LABEL_NUTRITION, createCompleteLabel } from './masterLabelTestFixture';

function completedSnapshot() {
  const input: RecipeInput = {
    items: DEFAULT_PRESET.items.map((item) => ({ ...item, actual_grams: null })),
    mode: DEFAULT_PRESET.mode,
    category: DEFAULT_PRESET.category,
    target_temperature_c: DEFAULT_PRESET.target_temperature_c,
    target_batch_grams: DEFAULT_PRESET.target_batch_grams,
    machine_capacity_grams: null,
  };
  let session = createProductionSession({
    sessionId: 'run-label-workspace',
    ownerUserId: 'owner-label-workspace',
    source: {
      recipeId: 'recipe-label-workspace',
      recipeVersionId: 'version-label-workspace',
      recipeVersionNumber: 3,
      recipeName: 'Gelato faktyczne',
    },
    plannedInput: input,
    plannedComposition: {
      schemaVersion: 1,
      baseScope: 'BASE_FORMULATION',
      baseOrder: input.items.map((item) => item.id),
      toppings: [],
      behaviorSnapshots: productBehaviorTestSnapshots(input),
      migrationAmbiguities: [],
    },
    startedAt: '2026-08-24T10:00:00.000Z',
  });
  for (const [index, line] of session.lines.entries()) {
    session = confirmProductionLine(
      session,
      line.lineId,
      `2026-08-24T10:${String(index + 1).padStart(2, '0')}:00.000Z`,
    );
  }
  return completeProductionSession(
    session,
    calculateRecipe(input),
    '2026-08-24T11:00:00.000Z',
    'owner-label-workspace',
  ).completionSnapshot!;
}

describe('LabelWorkspace unified actual-run surface', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    resetInMemoryLabelRepositoryForTests();
    useAuthStore.setState({
      status: 'authed',
      user: { id: 'owner-label-workspace', email: null, displayName: null },
      available: true,
    });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  async function renderWorkspace(initialView: 'data' | 'label' | 'settings' = 'label') {
    const repository = inMemoryLabelRepository('owner-label-workspace');
    await repository.saveAccountProfile({
      ...defaultAccountLabelProfile('owner-label-workspace'),
      businessName: 'Gellatti Laboratory',
      logoPath: 'owner-label-workspace/logo.png',
    });
    await act(async () => {
      root.render(
        <LabelWorkspace
          snapshot={completedSnapshot()}
          repository={repository}
          initialView={initialView}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    return repository;
  }

  const button = (label: string) =>
    [...host.querySelectorAll('button')].find(
      (candidate) => candidate.textContent?.trim() === label,
    );

  const setInputValue = (input: HTMLInputElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const swipe = async (target: Element, startX: number, endX: number) => {
    const start = new Event('touchstart', { bubbles: true });
    Object.defineProperty(start, 'touches', {
      value: [{ clientX: startX, clientY: 120 }],
    });
    const end = new Event('touchend', { bubbles: true });
    Object.defineProperty(end, 'changedTouches', {
      value: [{ clientX: endX, clientY: 124 }],
    });
    await act(async () => {
      target.dispatchEvent(start);
      target.dispatchEvent(end);
    });
  };

  it('moves from required data to the actual label before exposing Settings as step three', async () => {
    await renderWorkspace('data');

    const workspace = host.querySelector('[data-testid="label-workspace"]')!;
    const intake = workspace.querySelector('[data-testid="label-data-intake"]')!;
    const continueButton = button('Pokaż etykietę') as HTMLButtonElement;

    expect(workspace.getAttribute('data-active-label-view')).toBe('data');
    expect(workspace.querySelectorAll('[data-testid^="label-workspace-dot-"]')).toHaveLength(3);
    expect(
      [
        ...workspace.querySelectorAll<HTMLButtonElement>('[data-testid^="label-workspace-dot-"]'),
      ].map((dot) => dot.getAttribute('aria-label')),
    ).toEqual(['Dane do etykiety', 'Etykieta', 'Ustawienia etykiety']);
    expect(intake.textContent).toContain('Uzupełnij dane do etykiety');
    expect(intake.textContent).not.toContain('Jurysdykcja / profil');
    expect(intake.textContent).not.toContain('Profil drukarki');
    expect(intake.querySelector('[data-label-intake-field="product-name"]')).toBeNull();
    expect(intake.querySelector('[data-label-intake-field="operator-name"]')).not.toBeNull();
    expect(intake.querySelector('[data-label-intake-field="operator-address"]')).not.toBeNull();
    expect(intake.querySelector('[data-label-intake-field="operator-country"]')).not.toBeNull();
    expect(intake.querySelector('[data-label-intake-field="market-context"]')).not.toBeNull();
    expect(intake.querySelector('[data-label-intake-field="package-quantity"]')).not.toBeNull();
    expect(continueButton.disabled).toBe(true);
    expect(
      workspace.querySelector<HTMLButtonElement>('[data-testid="label-workspace-dot-settings"]')
        ?.disabled,
    ).toBe(true);

    await act(async () => {
      setInputValue(
        intake.querySelector<HTMLInputElement>('[data-label-intake-field="operator-name"]')!,
        'Gellatti Laboratory',
      );
      setInputValue(
        intake.querySelector<HTMLInputElement>('[data-label-intake-field="operator-address"]')!,
        '1 Test Street',
      );
      setInputValue(
        intake.querySelector<HTMLInputElement>('[data-label-intake-field="operator-country"]')!,
        'ES',
      );
      setInputValue(
        intake.querySelector<HTMLInputElement>('[data-label-intake-field="market-context"]')!,
        'ES',
      );
      setInputValue(
        intake.querySelector<HTMLInputElement>('[data-label-intake-field="package-quantity"]')!,
        '500',
      );
    });

    expect(continueButton.disabled).toBe(false);
    await act(async () => continueButton.click());

    expect(workspace.getAttribute('data-active-label-view')).toBe('label');
    expect(workspace.querySelector('[data-testid="label-consumer-preview"]')).not.toBeNull();
    expect(button('Ustawienia')).not.toBeUndefined();
    expect(button('Pobierz podgląd')).not.toBeUndefined();
    expect((button('Drukuj') as HTMLButtonElement).disabled).toBe(true);
    expect(
      workspace.querySelector<HTMLButtonElement>('[data-testid="label-workspace-dot-label"]')
        ?.disabled,
    ).toBe(false);

    await act(async () => button('Ustawienia')!.click());
    const settings = workspace.querySelector('[data-testid="label-settings-view"]')!;
    expect(workspace.getAttribute('data-active-label-view')).toBe('settings');
    expect(settings.textContent).toContain('Uzupełnij wymagane pola');
    expect(settings.querySelector('[data-label-field="legal_product_name"]')).not.toBeNull();
    expect(settings.querySelector('[data-label-field="storage"]')).not.toBeNull();
    expect(settings.querySelector('[data-label-field="date_mark"]')).not.toBeNull();
    expect(settings.querySelector('[data-label-field="allergens"]')).not.toBeNull();
    expect(settings.querySelector('[data-label-field="market_nutrition"]')).not.toBeNull();
    expect((button('Pokaż etykietę') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => button('Wróć do etykiety')!.click());
    expect(workspace.getAttribute('data-active-label-view')).toBe('label');
    expect(workspace.querySelector('[data-testid="label-consumer-preview"]')).not.toBeNull();
  });

  it('shows one market-driven preview with ACTUAL overview outside the print boundary', async () => {
    await renderWorkspace();
    expect(host.querySelector('[data-workspace-mode="run"]')).not.toBeNull();
    expect(host.textContent).toContain('Gelato faktyczne');
    expect(host.textContent).toContain('Gellatti Laboratory');
    expect(host.textContent).toContain('Net quantity');
    expect(host.textContent).toContain('Ingredients');
    expect(host.textContent).toContain('Nutrition declaration');
    expect(host.textContent).toContain('Koszt');
    expect(host.textContent).toContain('Baza techniczna');
    expect(host.querySelector('[data-testid="label-print-blocked-message"]')).not.toBeNull();
    expect(
      host
        .querySelector('[data-testid="label-print-blocked-message"]')
        ?.closest('[data-friendly-lab-message="true"]'),
    ).toBeNull();
    expect(
      host.querySelector('[data-testid="label-consumer-preview"]')?.getAttribute('data-market'),
    ).toBe('EU');
    expect(
      host
        .querySelector('[data-testid="label-consumer-preview"]')
        ?.getAttribute('data-label-layout'),
    ).toBe('eu_declaration');
    const exactPreview = host.querySelector<HTMLIFrameElement>(
      '[data-testid="label-print-document-preview"]',
    );
    expect(exactPreview?.getAttribute('srcdoc')).toContain('data-label-document="preview"');
    expect(exactPreview?.getAttribute('srcdoc')).toContain('data-market-layout="eu_declaration"');
    expect(completedSnapshot().lotCode).toMatch(/^LOT-20260824-/);
    expect(host.querySelector('[data-testid="consumer-lot"]')?.textContent).toMatch(
      /^LOT-20260824-/,
    );
    expect(
      host.querySelector('[data-testid="consumer-print-boundary"]')?.textContent,
    ).not.toContain('Koszt');
    const internal = host.querySelector('[data-testid="label-internal-overview"]');
    expect(internal?.textContent).toContain('Koszt');
    expect(internal?.textContent).toContain('Baza techniczna');
    expect(internal?.textContent).not.toContain('Składniki');
    expect(internal?.textContent).not.toContain('Wartości odżywcze');
    expect(host.textContent).not.toContain('none_declared');
    expect(button('Pobierz podgląd')).not.toBeUndefined();
    expect((button('Drukuj') as HTMLButtonElement | undefined)?.disabled).toBe(true);
  });

  it('opens the complete Settings state inside the same three-step workspace', async () => {
    await renderWorkspace('settings');
    expect(host.querySelector('[data-active-label-view="settings"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="label-workspace"]')?.getAttribute('data-run-id')).toBe(
      'run-label-workspace',
    );
    expect(host.querySelectorAll('[data-testid^="label-workspace-dot-"]')).toHaveLength(3);
    const editor = host.querySelector('[data-testid="label-settings-view"]');
    expect(host.querySelector('[data-active-label-view="settings"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="label-run-editor"]')).toBeNull();
    expect(editor?.querySelector('[role="dialog"]')).toBeNull();
    expect(editor?.innerHTML).toContain('min-h-11');
    expect(editor?.textContent).toContain('Jurysdykcja / profil');
    expect(editor?.textContent).toContain('Zapisz jako domyślne');
    expect(editor?.textContent).toContain('Kopie');
    expect(editor?.textContent).toContain('LOT · nadawany automatycznie');
    expect(editor?.textContent).toContain('Energia według zasad rynku');
    expect(editor?.textContent).toContain('Podstawa wartości energii');
    expect(editor?.textContent).toContain('Wymagane pola profilu European Union są zawsze aktywne');
    expect(editor?.querySelector('[data-testid="optional-label-fields"] input')).not.toBeNull();

    const us = [...editor!.querySelectorAll('button')].find((button) =>
      button.textContent?.startsWith('United States'),
    );
    expect(us?.getAttribute('aria-disabled')).toBeNull();
    const canada = [...editor!.querySelectorAll('button')].find((button) =>
      button.textContent?.startsWith('Canada'),
    );
    await act(async () => canada!.click());
    expect(editor?.querySelector('[data-market-active="true"]')?.textContent).toContain('Canada');
    const uk = [...editor!.querySelectorAll('button')].find((button) =>
      button.textContent?.startsWith('United Kingdom'),
    );
    await act(async () => uk!.click());
    const apply = [...editor!.querySelectorAll('button')].find(
      (button) => button.textContent === 'Pokaż etykietę',
    );
    expect((apply as HTMLButtonElement).disabled).toBe(true);
    expect(
      host.querySelector('[data-testid="label-settings-view"] [data-market-active="true"]')
        ?.textContent,
    ).toContain('United Kingdom');
    await act(async () => button('Wróć do danych etykiety')!.click());
    expect(host.querySelector('[data-active-label-view="data"]')).not.toBeNull();
    expect(
      host.querySelector('[data-testid="label-data-intake"]')?.getAttribute('data-label-market'),
    ).toBe('EU');
    expect(
      host.querySelector<HTMLButtonElement>('[data-testid="label-workspace-dot-label"]')?.disabled,
    ).toBe(true);
  });

  it('locks required fields and does not persist an optional toggle while required data is missing', async () => {
    const repository = await renderWorkspace('settings');

    let editor = host.querySelector('[data-testid="label-settings-view"]')!;
    expect(editor.querySelector('[data-testid="required-label-fields"] input')).toBeNull();
    const originLabel = [
      ...editor.querySelectorAll('[data-testid="optional-label-fields"] label'),
    ].find((label) => label.textContent?.includes('Pochodzenie'))!;
    const originToggle = originLabel.querySelector('input')!;
    expect(originToggle.checked).toBe(true);
    await act(async () => originToggle.click());
    expect(originToggle.checked).toBe(false);
    await act(async () => originToggle.click());
    expect(originToggle.checked).toBe(true);
    await act(async () => originToggle.click());

    const apply = [...editor.querySelectorAll('button')].find(
      (button) => button.textContent === 'Pokaż etykietę',
    )!;
    expect((apply as HTMLButtonElement).disabled).toBe(true);
    expect((await repository.getAccountProfile())?.enabledOptionalFields).toContain('origin');

    await act(async () => {
      root.render(<></>);
      root.render(
        <LabelWorkspace
          key="reloaded-label-workspace"
          snapshot={completedSnapshot()}
          repository={repository}
          initialView="settings"
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    editor = host.querySelector('[data-testid="label-settings-view"]')!;
    const reloadedOrigin = [
      ...editor.querySelectorAll('[data-testid="optional-label-fields"] label'),
    ]
      .find((label) => label.textContent?.includes('Pochodzenie'))!
      .querySelector('input')!;
    expect(reloadedOrigin.checked).toBe(true);
  });

  it('marks exactly the preflight-missing required fields and updates the one live count', async () => {
    await renderWorkspace('settings');
    const settings = host.querySelector('[data-testid="label-settings-view"]')!;
    const missingCount = () =>
      settings.querySelector('[data-testid="label-settings-missing-count"]')?.textContent ?? '';
    const missingFields = () => settings.querySelectorAll('[data-missing-required="true"]');

    expect(missingCount()).toContain('Uzupełnij wymagane pola');
    expect(missingCount()).toMatch(/Brakuje \d+ informacji/);
    expect(missingFields()).toHaveLength(7);
    expect(
      [...missingFields()].map((field) => field.getAttribute('data-label-field')).sort(),
    ).toEqual([
      'allergens',
      'date_mark',
      'legal_product_name',
      'market_nutrition',
      'net_quantity',
      'operator',
      'storage',
    ]);

    const fill = async (field: string, values: string[]) => {
      const inputs = [
        ...settings.querySelectorAll<HTMLInputElement>(`[data-label-field="${field}"] input`),
      ].filter((input) => input.type !== 'checkbox');
      await act(async () => {
        inputs.forEach((input, index) => setInputValue(input, values[index] ?? values[0]!));
      });
    };

    await fill('legal_product_name', ['Ice cream']);
    await fill('net_quantity', ['500']);
    await act(async () =>
      settings.querySelector<HTMLInputElement>('[data-label-field="allergens"] input')!.click(),
    );
    await fill('operator', ['Gellatti Laboratory', '1 Test Street', 'ES']);
    await fill('storage', ['Keep frozen']);
    await fill('date_mark', ['2026-09-24']);
    const nutrition = settings.querySelector<HTMLElement>('[data-label-field="market_nutrition"]')!;
    await act(async () => setInputValue(nutrition.querySelector('input')!, '900'));
    await act(async () => {
      const authority = settings.querySelector<HTMLSelectElement>(
        '[data-label-field="market_nutrition"] select',
      )!;
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      setter?.call(authority, 'market_factors');
      authority.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect([...missingFields()].map((field) => field.getAttribute('data-label-field'))).toEqual([
      'market_nutrition',
    ]);
  });

  it('opens Step 3 from the primary CTA and preserves valid settings on direct return', async () => {
    const repository = inMemoryLabelRepository('owner-label-workspace');
    const baseProfile = defaultAccountLabelProfile('owner-label-workspace');
    await repository.saveAccountProfile({
      ...baseProfile,
      market: 'WORLD',
      uiLanguage: 'en',
      labelLanguages: ['en'],
      businessName: 'Gellatti Laboratory',
      enabledOptionalFields: [],
      facilityDefaults: {
        ...baseProfile.facilityDefaults,
        operatorName: 'Gellatti Laboratory',
        address: '1 Test Street',
        countryCode: 'ES',
      },
      presentation: {
        ...baseProfile.presentation,
        widthMm: 102,
        heightMm: 152,
        printer: {
          ...baseProfile.presentation.printer,
          widthMm: 102,
          heightMm: 152,
        },
      },
    });
    const snapshot = completedSnapshot();
    const snapshotWithCompleteNutrition = {
      ...snapshot,
      finalProduct: {
        ...snapshot.finalProduct,
        labelNutritionPer100g: COMPLETE_LABEL_NUTRITION,
      },
    };
    await act(async () => {
      root.render(
        <LabelWorkspace
          snapshot={snapshotWithCompleteNutrition}
          repository={repository}
          initialView="settings"
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    let settings = host.querySelector('[data-testid="label-settings-view"]')!;
    const fillRequired = async (field: string, value: string) => {
      const input = settings.querySelector<HTMLInputElement>(
        `[data-label-field="${field}"] input`,
      )!;
      await act(async () => setInputValue(input, value));
    };
    await fillRequired('net_quantity', '500');
    await fillRequired('storage', 'Keep frozen');
    await act(async () =>
      settings.querySelector<HTMLInputElement>('[data-label-field="allergens"] input')!.click(),
    );
    const acknowledgement = [
      ...settings.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    ].find((input) => input.parentElement?.textContent?.includes('Sprawdziłem dane etykiety'))!;
    await act(async () => acknowledgement.click());

    const showLabel = button('Pokaż etykietę') as HTMLButtonElement;
    expect(
      [...settings.querySelectorAll('[data-missing-required="true"]')].map((field) =>
        field.getAttribute('data-label-field'),
      ),
    ).toEqual([]);
    expect(showLabel.disabled).toBe(false);
    await act(async () => {
      showLabel.click();
      await Promise.resolve();
    });

    const workspace = host.querySelector('[data-testid="label-workspace"]')!;
    expect(workspace.getAttribute('data-active-label-view')).toBe('label');
    expect(workspace.querySelector('[data-testid="label-consumer-preview"]')).not.toBeNull();
    expect(
      workspace
        .querySelector('[data-testid="label-print-ready-message"]')
        ?.getAttribute('data-friendly-lab-timing'),
    ).toBe('informational');
    expect(workspace.textContent).toContain('Gotowe. Etykieta czeka na druk.');
    expect(button('Pobierz PDF')).not.toBeUndefined();
    expect((button('Drukuj') as HTMLButtonElement).disabled).toBe(false);

    await act(async () => button('Ustawienia')!.click());
    settings = host.querySelector('[data-testid="label-settings-view"]')!;
    expect(
      settings.querySelector<HTMLInputElement>('[data-label-field="net_quantity"] input')?.value,
    ).toBe('500');
    expect(
      settings.querySelector<HTMLInputElement>('[data-label-field="storage"] input')?.value,
    ).toBe('Keep frozen');
    expect(
      settings.querySelector<HTMLInputElement>('[data-label-field="allergens"] input')?.checked,
    ).toBe(true);
    const labelStep = workspace.querySelector<HTMLButtonElement>(
      '[data-testid="label-workspace-dot-label"]',
    )!;
    expect(labelStep.disabled).toBe(false);
    await act(async () => labelStep.click());
    expect(workspace.getAttribute('data-active-label-view')).toBe('label');
  });

  it('uses accessible dots and returns an incomplete deep link to required data', async () => {
    await renderWorkspace();
    const settingsDot = host.querySelector<HTMLButtonElement>(
      '[data-testid="label-workspace-dot-settings"]',
    )!;
    expect(settingsDot.getAttribute('aria-current')).toBeNull();
    await act(async () => settingsDot.click());
    expect(settingsDot.getAttribute('aria-current')).toBe('step');

    const settings = host.querySelector('[data-testid="label-settings-view"]')!;
    const uk = [...settings.querySelectorAll('button')].find((candidate) =>
      candidate.textContent?.startsWith('United Kingdom'),
    )!;
    await act(async () => uk.click());
    await act(async () => button('Wróć do danych etykiety')!.click());

    expect(host.querySelector('[data-active-label-view="data"]')).not.toBeNull();
    expect(
      host.querySelector('[data-testid="label-data-intake"]')?.getAttribute('data-label-market'),
    ).toBe('EU');
    expect(
      host.querySelector<HTMLButtonElement>('[data-testid="label-workspace-dot-settings"]')
        ?.disabled,
    ).toBe(true);
  });

  it('opens the same Settings state from a deep link and supports guarded mobile swipe', async () => {
    await renderWorkspace('settings');
    const workspace = host.querySelector('[data-testid="label-workspace"]')!;
    expect(workspace.getAttribute('data-active-label-view')).toBe('settings');
    expect(
      workspace.querySelector('[data-testid="label-settings-view"] [data-market-active="true"]')
        ?.textContent,
    ).toContain('European Union');

    await swipe(workspace, 260, 130);
    expect(workspace.getAttribute('data-active-label-view')).toBe('settings');
    await swipe(workspace, 80, 170);
    expect(workspace.getAttribute('data-active-label-view')).toBe('settings');

    await act(async () => button('Wróć do danych etykiety')!.click());
    expect(workspace.getAttribute('data-active-label-view')).toBe('data');

    const settingsInput = workspace.querySelector<HTMLInputElement>(
      '[data-testid="label-data-intake"] input',
    )!;
    await swipe(settingsInput, 90, 200);
    expect(workspace.getAttribute('data-active-label-view')).toBe('data');
  });

  it('starts a new version from the current profile without rewriting the selected snapshot', async () => {
    const base = inMemoryLabelRepository('owner-label-workspace');
    await base.saveAccountProfile({
      ...defaultAccountLabelProfile('owner-label-workspace'),
      market: 'WORLD',
      uiLanguage: 'en',
      labelLanguages: ['en'],
      businessName: 'Gellatti Laboratory',
    });
    const actual = completedSnapshot();
    const immutableLabel = createCompleteLabel('EU', {
      sourceCompletionSessionId: actual.sessionId,
      sourceCompletedAt: actual.productionCompletedAt,
    });
    const immutable: RunLabelSnapshot = {
      snapshotId: 'snapshot-eu-v1',
      version: 1,
      contentHash: 'immutable-eu-hash',
      runId: actual.sessionId,
      ownerUserId: 'owner-label-workspace',
      label: immutableLabel,
      accountProfileSnapshot: { market: 'EU' },
      logoPath: null,
      createdAt: '2026-08-24T11:05:00.000Z',
    };
    const repository: LabelRepository = {
      ...base,
      getRunLabelSnapshot: async () => structuredClone(immutable),
      getRunLabelSnapshotById: async (snapshotId) =>
        snapshotId === immutable.snapshotId ? structuredClone(immutable) : null,
    };

    await act(async () => {
      root.render(<LabelWorkspace snapshot={actual} repository={repository} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(host.textContent).toContain('European Union');
    expect(button('Nowa wersja')).not.toBeUndefined();
    await act(async () => {
      button('Nowa wersja')!.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(host.querySelector('[data-active-label-view="data"]')).not.toBeNull();
    expect(
      host.querySelector('[data-testid="label-data-intake"]')?.getAttribute('data-label-market'),
    ).toBe('WORLD');
    expect(immutable.label.market).toBe('EU');
    expect(immutable.version).toBe(1);
  });
});
