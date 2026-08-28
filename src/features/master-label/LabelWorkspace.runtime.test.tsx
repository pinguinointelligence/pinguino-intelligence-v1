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
  type AccountLabelProfile,
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
  const completed = completeProductionSession(
    session,
    calculateRecipe(input),
    '2026-08-24T11:00:00.000Z',
    'owner-label-workspace',
  ).completionSnapshot!;
  return {
    ...completed,
    finalProduct: {
      ...completed.finalProduct,
      labelNutritionPer100g: COMPLETE_LABEL_NUTRITION,
    },
  };
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

  async function renderWorkspace(
    initialView: 'data' | 'label' | 'settings' = 'label',
    options: {
      snapshot?: ReturnType<typeof completedSnapshot>;
      profileOverrides?: Partial<AccountLabelProfile>;
    } = {},
  ) {
    const repository = inMemoryLabelRepository('owner-label-workspace');
    const defaultProfile = defaultAccountLabelProfile('owner-label-workspace');
    await repository.saveAccountProfile({
      ...defaultProfile,
      businessName: 'Gellatti Laboratory',
      logoPath: 'owner-label-workspace/logo.png',
      presentation: {
        ...defaultProfile.presentation,
        widthMm: 102,
        heightMm: 152,
        printer: {
          ...defaultProfile.presentation.printer,
          widthMm: 102,
          heightMm: 152,
        },
      },
      ...options.profileOverrides,
    });
    await act(async () => {
      root.render(
        <LabelWorkspace
          snapshot={options.snapshot ?? completedSnapshot()}
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

  const setSelectValue = (select: HTMLSelectElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    setter?.call(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const checkboxWithText = (root: Element, text: string) =>
    [...root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find((input) =>
      input.parentElement?.textContent?.includes(text),
    );

  const completeRequiredLabelData = async () => {
    const intake = host.querySelector('[data-testid="label-data-intake"]')!;
    const fill = (field: string, values: string[]) => {
      const inputs = [
        ...intake.querySelectorAll<HTMLInputElement>(`[data-label-field="${field}"] input`),
      ].filter((input) => input.type !== 'checkbox');
      inputs.forEach((input, index) => setInputValue(input, values[index] ?? values[0]!));
    };

    await act(async () => {
      fill('legal_product_name', ['Lody mleczne']);
      fill('operator', ['Gellatti Laboratory', '1 Test Street', 'ES']);
      fill('date_mark', ['2027-02-27']);
      const context = intake.querySelector<HTMLSelectElement>(
        '[data-label-field="jurisdiction_context"] select',
      );
      if (context) setSelectValue(context, 'PL');
      const nutrition = intake.querySelector<HTMLElement>('[data-label-field="market_nutrition"]');
      const energy = ['EU', 'UK', 'AU_NZ'].includes(intake.getAttribute('data-label-market') ?? '')
        ? [...(nutrition?.querySelectorAll<HTMLInputElement>('input[type="number"]') ?? [])].find(
            (input) => !input.hasAttribute('data-label-nutrition-source'),
          )
        : undefined;
      if (energy) setInputValue(energy, '900');
      const authority = nutrition?.querySelector<HTMLSelectElement>('select');
      if (authority) setSelectValue(authority, 'market_factors');
    });

    for (const text of [
      'Potwierdzam przegląd danych alergenowych',
      'Sprawdziłem dane etykiety przed wydrukiem',
    ]) {
      const checkbox = checkboxWithText(intake, text);
      if (checkbox && !checkbox.checked) await act(async () => checkbox.click());
    }
  };

  it('moves from required data to the actual label before exposing Settings as step three', async () => {
    await renderWorkspace('data');

    const workspace = host.querySelector('[data-testid="label-workspace"]')!;
    const intake = workspace.querySelector('[data-testid="label-data-intake"]')!;
    const continueButton = intake.querySelector<HTMLButtonElement>(
      '[data-testid="show-label-preview"]',
    )!;

    expect(workspace.getAttribute('data-active-label-view')).toBe('data');
    expect(workspace.querySelectorAll('[data-testid^="label-workspace-dot-"]')).toHaveLength(3);
    expect(
      [
        ...workspace.querySelectorAll<HTMLButtonElement>('[data-testid^="label-workspace-dot-"]'),
      ].map((dot) => dot.getAttribute('aria-label')),
    ).toEqual(['Dane do etykiety', 'Etykieta', 'Ustawienia etykiety']);
    expect(intake.textContent).toContain('Dokończ etykietę');
    expect(intake.textContent).not.toContain('Pokaż brakujące');
    expect(intake.textContent).not.toContain('Ustawienia drukarki');
    expect(intake.textContent).not.toContain('Jurysdykcja / profil');
    expect(intake.textContent).toContain('Gelato faktyczne');
    expect(intake.textContent).toContain('Składniki');
    expect(intake.textContent).toContain('GOTOWE');
    expect(intake.querySelector('[data-label-field="legal_product_name"]')).not.toBeNull();
    expect(intake.querySelector('[data-label-field="storage"]')).toBeNull();
    expect(intake.querySelector('[data-label-field="date_mark"]')).not.toBeNull();
    expect(intake.querySelector('[data-label-field="allergens"]')).toBeNull();
    expect(intake.querySelector('[data-label-field="market_nutrition"]')).toBeNull();
    const wholeBatch = intake.querySelector<HTMLInputElement>(
      '[data-testid="whole-batch-package-mass"]',
    );
    expect(wholeBatch?.value).toBe(String(completedSnapshot().actualFinalMassG));
    expect(intake.textContent).toContain('Cała partia = jedno opakowanie');
    expect(intake.textContent).toContain('Dzielę na kilka opakowań');
    expect(continueButton.disabled).toBe(true);
    expect(continueButton.textContent).toMatch(/^Uzupełnij \d+ p/);
    expect(
      workspace.querySelector<HTMLButtonElement>('[data-testid="label-workspace-dot-settings"]')
        ?.disabled,
    ).toBe(true);

    await completeRequiredLabelData();

    expect(continueButton.disabled).toBe(false);
    expect(continueButton.textContent).toBe('Pokaż etykietę');
    await act(async () => continueButton.click());

    expect(workspace.getAttribute('data-active-label-view')).toBe('label');
    expect(workspace.querySelector('[data-testid="label-consumer-preview"]')).not.toBeNull();
    expect(button('Ustawienia')).not.toBeUndefined();
    expect(button('Pobierz PDF')).not.toBeUndefined();
    expect((button('Drukuj') as HTMLButtonElement).disabled).toBe(false);
    expect(workspace.querySelector('[data-testid="label-print-blocked-message"]')).toBeNull();
    expect(workspace.querySelector('[data-testid="label-print-ready-message"]')).not.toBeNull();
    expect(
      workspace.querySelector<HTMLButtonElement>('[data-testid="label-workspace-dot-label"]')
        ?.disabled,
    ).toBe(false);

    await act(async () => button('Ustawienia')!.click());
    const settings = workspace.querySelector('[data-testid="label-settings-view"]')!;
    expect(workspace.getAttribute('data-active-label-view')).toBe('settings');
    expect(settings.textContent).not.toContain('Uzupełnij wymagane pola');
    expect(settings.querySelector('[data-label-field]')).toBeNull();
    expect(settings.textContent).toContain('Profil, format i drukarka');
    expect(button('Zastosuj ustawienia')).not.toBeUndefined();
    await act(async () => button('Wstecz')!.click());
    expect(workspace.getAttribute('data-active-label-view')).toBe('label');
    expect(workspace.querySelector('[data-testid="label-consumer-preview"]')).not.toBeNull();
  });

  it('collects a missing saturated-fat source value in Step 1 for the WORLD profile', async () => {
    const snapshot = completedSnapshot();
    await renderWorkspace('data', {
      snapshot: {
        ...snapshot,
        finalProduct: {
          ...snapshot.finalProduct,
          labelNutritionPer100g: {
            ...COMPLETE_LABEL_NUTRITION,
            saturated_fat_g: null,
          },
        },
      },
      profileOverrides: {
        market: 'WORLD',
        uiLanguage: 'en',
        labelLanguages: ['en'],
      },
    });

    await completeRequiredLabelData();

    const intake = host.querySelector('[data-testid="label-data-intake"]')!;
    const sourceInput = intake.querySelector<HTMLInputElement>(
      '[data-label-nutrition-source="saturated_fat_g"]',
    )!;
    const continueButton = intake.querySelector<HTMLButtonElement>(
      '[data-testid="show-label-preview"]',
    )!;

    expect(sourceInput).not.toBeNull();
    expect(sourceInput.disabled).toBe(false);
    expect(continueButton.disabled).toBe(true);
    expect(intake.textContent).toContain('Tylko pola, których nie ma');

    await act(async () => setInputValue(sourceInput, '3.4'));

    expect(sourceInput.disabled).toBe(false);
    expect(continueButton.disabled).toBe(false);
    await act(async () => continueButton.click());
    expect(host.querySelector('[data-testid="label-consumer-preview"]')?.textContent).toContain(
      '3.4 g',
    );
  });

  it('serves one AU/NZ superset intake with no country split and required origin', async () => {
    await renderWorkspace('data', {
      profileOverrides: {
        market: 'AU_NZ',
        uiLanguage: 'en',
        labelLanguages: ['en'],
      },
    });

    const intake = host.querySelector('[data-testid="label-data-intake"]')!;
    expect(intake.getAttribute('data-label-market')).toBe('AU_NZ');
    expect(intake.textContent).toContain('Australia / New Zealand');
    expect(intake.textContent).not.toContain('AU/NZ sub-context');
    expect(intake.textContent).not.toContain('Wybierz Australię');
    expect(intake.querySelector('[data-label-field="jurisdiction_context"]')).toBeNull();
    expect(intake.querySelector('[data-label-field="origin"]')).not.toBeNull();
    expect(
      intake.querySelector<HTMLInputElement>('[data-testid="whole-batch-package-mass"]')?.value,
    ).toBe(String(completedSnapshot().actualFinalMassG));
  });

  it('shows one market-driven preview with ACTUAL overview outside the print boundary', async () => {
    await renderWorkspace();
    await completeRequiredLabelData();
    await act(async () => button('Pokaż etykietę')!.click());
    expect(host.querySelector('[data-workspace-mode="run"]')).not.toBeNull();
    expect(host.textContent).toContain('Gelato faktyczne');
    expect(host.textContent).toContain('Gellatti Laboratory');
    expect(host.textContent).toContain('Net quantity');
    expect(host.textContent).toContain('Ingredients');
    expect(host.textContent).toContain('Nutrition declaration');
    expect(host.textContent).toContain('Koszt');
    expect(host.textContent).toContain('Baza techniczna');
    expect(host.querySelector('[data-testid="label-print-blocked-message"]')).toBeNull();
    expect(host.querySelector('[data-testid="label-print-ready-message"]')).not.toBeNull();
    expect(
      host.querySelector('[data-testid="label-consumer-preview"]')?.getAttribute('data-market'),
    ).toBe('EU');
    expect(
      host
        .querySelector('[data-testid="label-consumer-preview"]')
        ?.getAttribute('data-label-layout'),
    ).toBe('eu_declaration');
    expect(
      host.querySelector('[data-testid="label-consumer-preview-sizer"]')?.getAttribute('class'),
    ).toContain('max-w-full');
    expect(
      host.querySelector('[data-testid="label-consumer-preview"]')?.getAttribute('style'),
    ).toContain('aspect-ratio: 102 / 152');
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
    expect(button('Pobierz PDF')).not.toBeUndefined();
    expect((button('Drukuj') as HTMLButtonElement | undefined)?.disabled).toBe(false);
  });

  it('opens the complete Settings state inside the same three-step workspace', async () => {
    await renderWorkspace('settings');
    expect(host.querySelector('[data-active-label-view="data"]')).not.toBeNull();
    await completeRequiredLabelData();
    await act(async () => button('Pokaż etykietę')!.click());
    await act(async () => button('Ustawienia')!.click());
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
    expect(editor?.textContent).toContain('Rynek sprzedaży');
    expect(editor?.textContent).toContain('Zapamiętaj jako domyślne');
    expect(editor?.textContent).toContain('Kopie');
    expect(editor?.textContent).not.toContain('LOT · nadawany automatycznie');
    expect(editor?.textContent).not.toContain('Energia według zasad rynku');
    expect(editor?.textContent).not.toContain('Uzupełnij wymagane pola');
    expect(editor?.querySelector('[data-label-field]')).toBeNull();
    expect(editor?.textContent).not.toContain('Wymagane pola profilu');
    expect(editor?.querySelector('[data-testid="optional-label-fields"]')).toBeNull();
    expect(editor?.textContent).not.toContain('Marka / nazwa firmy');
    expect(editor?.textContent).not.toContain('Operator');

    const market = editor!.querySelector<HTMLSelectElement>('[data-testid="label-market-select"]')!;
    expect([...market.options].map((option) => option.value)).toEqual([
      'EU',
      'UK',
      'US',
      'CA',
      'AU_NZ',
      'WORLD',
    ]);
    expect([...market.options].filter((option) => option.text.includes('Australia'))).toHaveLength(
      1,
    );
    await act(async () => setSelectValue(market, 'CA'));
    expect(market.value).toBe('CA');
    await act(async () => setSelectValue(market, 'UK'));
    const apply = button('Zastosuj ustawienia') as HTMLButtonElement;
    expect(apply.disabled).toBe(false);
    expect(market.value).toBe('UK');
    await act(async () => apply.click());
    expect(host.querySelector('[data-active-label-view="data"]')).not.toBeNull();
    expect(
      host.querySelector('[data-testid="label-data-intake"]')?.getAttribute('data-label-market'),
    ).toBe('UK');
    expect(
      host.querySelector<HTMLButtonElement>('[data-testid="label-workspace-dot-label"]')?.disabled,
    ).toBe(true);
  });

  it('keeps Step 3 configuration-only and does not persist an unapplied market change', async () => {
    const repository = await renderWorkspace('settings');
    await completeRequiredLabelData();
    await act(async () => button('Pokaż etykietę')!.click());
    await act(async () => button('Ustawienia')!.click());

    const editor = host.querySelector('[data-testid="label-settings-view"]')!;
    expect(editor.querySelector('[data-label-field]')).toBeNull();
    expect(editor.textContent).not.toContain('Pochodzenie');
    expect(editor.textContent).not.toContain('GTIN');
    const market = editor.querySelector<HTMLSelectElement>('[data-testid="label-market-select"]')!;
    await act(async () => setSelectValue(market, 'WORLD'));
    expect(market.value).toBe('WORLD');
    expect((await repository.getAccountProfile())?.market).toBe('EU');
    await act(async () => button('Wstecz')!.click());
    expect(host.querySelector('[data-active-label-view="label"]')).not.toBeNull();
    expect((await repository.getAccountProfile())?.market).toBe('EU');
  });

  it('marks every preflight-missing required field in Step 1 and updates the one live count', async () => {
    await renderWorkspace('data');
    const settings = host.querySelector('[data-testid="label-data-intake"]')!;
    const missingFields = () => settings.querySelectorAll('[data-missing-required="true"]');

    expect(settings.querySelector('[data-testid="show-label-preview"]')?.textContent).toBe(
      'Uzupełnij 5 pól',
    );
    expect(missingFields()).toHaveLength(5);
    expect(
      [...missingFields()].map((field) => field.getAttribute('data-label-field')).sort(),
    ).toEqual([
      'acknowledgement',
      'date_mark',
      'jurisdiction_context',
      'legal_product_name',
      'operator',
    ]);
    await completeRequiredLabelData();
    expect([...missingFields()].map((field) => field.getAttribute('data-label-field'))).toEqual([]);
    expect(settings.querySelector('[data-testid="show-label-preview"]')?.textContent).toBe(
      'Pokaż etykietę',
    );
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

    let settings = host.querySelector('[data-testid="label-data-intake"]')!;
    const acknowledgement = [
      ...settings.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    ].find((input) => input.parentElement?.textContent?.includes('Sprawdziłem dane etykiety'))!;
    await act(async () => acknowledgement.click());

    const showLabel = button('Pokaż etykietę') as HTMLButtonElement;
    expect([...settings.querySelectorAll('[data-missing-required="true"]')]).toHaveLength(0);
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
    expect(settings.querySelector('[data-label-field]')).toBeNull();
    expect(settings.textContent).toContain('Profil, format i drukarka');
    expect(settings.textContent).not.toContain('Uzupełnij wymagane pola');
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
    expect(settingsDot.disabled).toBe(true);
    await act(async () => settingsDot.click());
    expect(host.querySelector('[data-active-label-view="data"]')).not.toBeNull();
    expect(
      host.querySelector('[data-testid="label-data-intake"]')?.getAttribute('data-label-market'),
    ).toBe('EU');
    expect(
      host.querySelector<HTMLButtonElement>('[data-testid="label-workspace-dot-settings"]')
        ?.disabled,
    ).toBe(true);
  });

  it('guards an incomplete Settings deep link and preserves mobile form interaction', async () => {
    await renderWorkspace('settings');
    const workspace = host.querySelector('[data-testid="label-workspace"]')!;
    expect(workspace.getAttribute('data-active-label-view')).toBe('data');
    expect(workspace.querySelector('[data-testid="label-data-intake"]')?.textContent).toContain(
      'European Union',
    );

    await swipe(workspace, 260, 130);
    expect(workspace.getAttribute('data-active-label-view')).toBe('data');
    await swipe(workspace, 80, 170);
    expect(workspace.getAttribute('data-active-label-view')).toBe('data');

    const settingsInput = workspace.querySelector<HTMLInputElement>(
      '[data-testid="label-data-intake"] input',
    )!;
    await swipe(settingsInput, 90, 200);
    expect(workspace.getAttribute('data-active-label-view')).toBe('data');

    await completeRequiredLabelData();
    await act(async () => button('Pokaż etykietę')!.click());
    await act(async () => button('Ustawienia')!.click());
    expect(workspace.getAttribute('data-active-label-view')).toBe('settings');
    expect(
      workspace.querySelector('[data-testid="label-settings-view"] [data-label-field]'),
    ).toBeNull();
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
