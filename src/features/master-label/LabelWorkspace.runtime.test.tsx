// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { marketProfile, type MarketProfileCode } from './marketProfiles';
import {
  FRIENDLY_LAB_MOMENT_EVENT,
  type FriendlyLabMomentEventDetail,
} from '@/components/shared/friendlyLabMoment';

function completedSnapshot() {
  const input: RecipeInput = {
    items: DEFAULT_PRESET.items.map((item) => ({ ...item, actual_grams: null })),
    mode: DEFAULT_PRESET.mode,
    category: DEFAULT_PRESET.category,
    target_temperature_c: DEFAULT_PRESET.target_temperature_c,
    target_batch_grams: DEFAULT_PRESET.target_batch_grams,
    machine_capacity_grams: null,
  };
  const behaviorSnapshots = productBehaviorTestSnapshots(input);
  for (const frozen of Object.values(behaviorSnapshots)) {
    frozen.source = 'supplier_specification';
    if (
      (frozen.sharedFacts?.nutritionPer100g?.fat ?? 0) > 0 &&
      frozen.sharedFacts?.nutritionPer100g
    ) {
      frozen.sharedFacts.nutritionPer100g.saturatedFat ??= 0;
    }
  }
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
      behaviorSnapshots,
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

function incompletePrintSnapshot() {
  const snapshot = completedSnapshot();
  const frozen = Object.values(snapshot.productComposition.behaviorSnapshots ?? {});
  frozen.forEach((item, index) => {
    item.sharedFacts!.allergens = {
      ingredientsText: `Ingredient ${index + 1}`,
      allergensText: index === 0 ? 'Contains milk' : 'UNKNOWN',
      declared: index === 0 ? ['milk'] : [],
      mayContain: [],
      evidenceVersion: `allergens:print-dialog:${index}`,
    };
  });
  return {
    ...snapshot,
    finalProduct: {
      ...snapshot.finalProduct,
      labelNutritionPer100g: {
        ...COMPLETE_LABEL_NUTRITION,
        saturated_fat_g: null,
      },
    },
  };
}

describe('LabelWorkspace unified actual-run surface', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let moments: FriendlyLabMomentEventDetail[];
  let onMoment: (event: Event) => void;

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
    moments = [];
    onMoment = (event) => moments.push((event as CustomEvent<FriendlyLabMomentEventDetail>).detail);
    window.addEventListener(FRIENDLY_LAB_MOMENT_EVENT, onMoment);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    vi.restoreAllMocks();
    window.removeEventListener(FRIENDLY_LAB_MOMENT_EVENT, onMoment);
    host.remove();
  });

  async function renderWorkspace(
    initialView: 'data' | 'label' | 'settings' = 'label',
    options: {
      snapshot?: ReturnType<typeof completedSnapshot>;
      profileOverrides?: Partial<AccountLabelProfile>;
      settingsHome?: 'inline' | 'production';
      onOpenSettings?: (runId: string) => void;
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
        <MemoryRouter>
          <LabelWorkspace
            snapshot={options.snapshot ?? completedSnapshot()}
            repository={repository}
            initialView={initialView}
            {...(options.settingsHome ? { settingsHome: options.settingsHome } : {})}
            {...(options.onOpenSettings ? { onOpenSettings: options.onOpenSettings } : {})}
          />
        </MemoryRouter>,
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
    expect(continueButton.disabled).toBe(false);
    expect(continueButton.textContent).toBe('Pokaż etykietę');
    expect(
      workspace.querySelector<HTMLButtonElement>('[data-testid="label-workspace-dot-settings"]')
        ?.disabled,
    ).toBe(false);

    await completeRequiredLabelData();

    expect(continueButton.disabled).toBe(false);
    expect(continueButton.textContent).toBe('Pokaż etykietę');
    expect(moments).toHaveLength(0);
    await act(async () => continueButton.click());

    expect(workspace.getAttribute('data-active-label-view')).toBe('label');
    expect(workspace.querySelector('[data-testid="label-consumer-preview"]')).not.toBeNull();
    expect(workspace.querySelector('[data-testid="label-change"]')?.textContent).toBe(
      'Zmień ustawienia',
    );
    expect(button('Pobierz PDF')).toBeUndefined();
    expect((button('Drukuj') as HTMLButtonElement).disabled).toBe(false);
    expect(workspace.querySelector('[data-testid="label-print-blocked-message"]')).toBeNull();
    expect(workspace.querySelector('[data-testid="label-print-ready-message"]')).toBeNull();
    expect(workspace.querySelector('[data-testid="label-workspace-dots"]')).toBeNull();
    expect(moments).toHaveLength(0);
    expect(workspace.querySelector('[data-testid="label-workspace-dot-label"]')).toBeNull();

    await act(async () =>
      workspace.querySelector<HTMLButtonElement>('[data-testid="label-change"]')!.click(),
    );
    const settings = workspace.querySelector('[data-testid="label-settings-view"]')!;
    expect(workspace.getAttribute('data-active-label-view')).toBe('settings');
    expect(settings.textContent).not.toContain('Uzupełnij wymagane pola');
    expect(settings.querySelector('[data-label-field]')).toBeNull();
    expect(settings.textContent).toContain('Profil, format i drukarka');
    expect(button('Zastosuj ustawienia')).not.toBeUndefined();
    await act(async () => button('Wróć')!.click());
    expect(workspace.getAttribute('data-active-label-view')).toBe('label');
    expect(workspace.querySelector('[data-testid="label-consumer-preview"]')).not.toBeNull();
  });

  it('keeps World saturated-fat editing out of the main screen and in the shared print dialog', async () => {
    const snapshot = completedSnapshot();
    const snapshotWithoutSaturatedFat = {
      ...snapshot,
      finalProduct: {
        ...snapshot.finalProduct,
        labelNutritionPer100g: {
          ...COMPLETE_LABEL_NUTRITION,
          saturated_fat_g: null,
        },
      },
    };
    await renderWorkspace('data', {
      snapshot: snapshotWithoutSaturatedFat,
      settingsHome: 'production',
      profileOverrides: {
        market: 'WORLD',
        uiLanguage: 'en',
        labelLanguages: ['en'],
      },
    });

    expect(host.querySelector('[data-testid="label-data-intake"]')).toBeNull();
    expect(host.textContent).not.toContain('Tłuszcze nasycone nieustalone');
    expect(host.textContent).not.toContain('Źródło potwierdzenia');
    expect(host.querySelector<HTMLButtonElement>('[data-testid="label-print"]')?.disabled).toBe(
      false,
    );
    expect(host.querySelector('[data-testid="label-saturated-fat-set"]')).toBeNull();
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-testid="label-print"]')!.click(),
    );
    expect(document.querySelector('[data-testid="label-print-missing-dialog"]')).not.toBeNull();
    expect(
      document.querySelector('[data-testid="label-print-missing-saturated_fat_g"]'),
    ).not.toBeNull();
  });

  it('never revives the World saturated-fat evidence workflow when another nutrition field is missing', async () => {
    const snapshot = completedSnapshot();
    await renderWorkspace('data', {
      snapshot: {
        ...snapshot,
        finalProduct: {
          ...snapshot.finalProduct,
          labelNutritionPer100g: {
            ...COMPLETE_LABEL_NUTRITION,
            saturated_fat_g: null,
            sugars_g: null,
          },
        },
      },
      profileOverrides: {
        market: 'WORLD',
        uiLanguage: 'en',
        labelLanguages: ['en'],
      },
    });

    const intake = host.querySelector('[data-testid="label-data-intake"]')!;
    expect(intake.textContent).toContain('Cukry · g / 100 g');
    expect(intake.textContent).not.toContain('Źródło potwierdzenia');
    expect(intake.textContent).not.toContain('Brak potwierdzonych danych składników');
    expect(intake.textContent).not.toContain('raport laboratorium');
  });

  it.each(['EU', 'UK', 'US', 'CA', 'AU_NZ', 'WORLD'] as const)(
    '%s opens one non-blocking missing-data dialog and preserves known allergens when skipped',
    async (market) => {
      const defaultPresentation = defaultAccountLabelProfile('owner-label-workspace').presentation;
      const repository = await renderWorkspace('label', {
        snapshot: incompletePrintSnapshot(),
        settingsHome: 'production',
        profileOverrides: {
          market,
          uiLanguage: 'en',
          labelLanguages:
            marketProfile(market as MarketProfileCode).requiredLanguages.length > 0
              ? [...marketProfile(market as MarketProfileCode).requiredLanguages]
              : ['en'],
          ...(market === 'CA'
            ? {
                presentation: {
                  ...defaultPresentation,
                  heightMm: 220,
                  printer: { ...defaultPresentation.printer, heightMm: 220 },
                },
              }
            : {}),
        },
      });
      const print = host.querySelector<HTMLButtonElement>('[data-testid="label-print"]')!;
      expect(print.disabled).toBe(false);

      await act(async () => print.click());
      const dialog = document.querySelector('[data-testid="label-print-missing-dialog"]')!;
      expect(dialog).not.toBeNull();
      expect(dialog.querySelector('[data-testid="label-print-missing-allergens"]')).not.toBeNull();
      expect(
        dialog.querySelector<HTMLInputElement>('[data-testid="label-print-missing-allergens"]')
          ?.value,
      ).toContain('Contains milk');
      expect(
        dialog.querySelector('[data-testid="label-print-missing-saturated_fat_g"]'),
      ).not.toBeNull();
      expect(dialog.textContent).toContain('Uzupełnij i pokaż podgląd');
      expect(dialog.textContent).toContain('Drukuj bez uzupełniania');
      expect(dialog.textContent).toContain('Wróć');

      await act(async () =>
        dialog
          .querySelector<HTMLButtonElement>('[data-testid="label-print-missing-back"]')!
          .click(),
      );
      expect(document.querySelector('[data-testid="label-print-missing-dialog"]')).toBeNull();
      expect(await repository.getRunLabelSnapshot('run-label-workspace')).toBeNull();

      vi.spyOn(window, 'open').mockReturnValue(null);
      vi.spyOn(window, 'print').mockImplementation(() => undefined);
      await act(async () => print.click());
      await act(async () => {
        document
          .querySelector<HTMLButtonElement>('[data-testid="label-print-missing-skip"]')!
          .click();
        await Promise.resolve();
        await Promise.resolve();
      });
      const saved = await repository.getRunLabelSnapshot('run-label-workspace');
      expect(saved?.label.allergens.labelStatements.join(' · ')).toContain('Contains milk');
      expect(saved?.label.nutritionSource?.saturated_fat_g).toBeNull();
      expect(window.open).not.toHaveBeenCalled();
    },
  );

  it('applies only edited dialog values, prints them and preserves them after reopening', async () => {
    const snapshot = incompletePrintSnapshot();
    const repository = await renderWorkspace('label', {
      snapshot,
      settingsHome: 'production',
      profileOverrides: { market: 'EU', uiLanguage: 'pl', labelLanguages: ['pl'] },
    });
    vi.spyOn(window, 'open').mockReturnValue(null);
    vi.spyOn(window, 'print').mockImplementation(() => undefined);
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-testid="label-print"]')!.click(),
    );
    const allergen = document.querySelector<HTMLInputElement>(
      '[data-testid="label-print-missing-allergens"]',
    )!;
    const saturated = document.querySelector<HTMLInputElement>(
      '[data-testid="label-print-missing-saturated_fat_g"]',
    )!;
    await act(async () => {
      setInputValue(allergen, 'Contains milk. May contain pistachios.');
      setInputValue(saturated, '3.2');
    });
    await act(async () => {
      document
        .querySelector<HTMLButtonElement>('[data-testid="label-print-missing-apply"]')!
        .click();
      await Promise.resolve();
      await Promise.resolve();
    });
    const saved = await repository.getRunLabelSnapshot('run-label-workspace');
    expect(saved?.label.allergens.labelStatements).toEqual([
      'Contains milk. May contain pistachios.',
    ]);
    expect(saved?.label.nutritionSource?.saturated_fat_g).toBe(3.2);

    await act(async () => root.unmount());
    root = createRoot(host);
    await act(async () => {
      root.render(
        <MemoryRouter>
          <LabelWorkspace
            snapshot={snapshot}
            repository={repository}
            initialView="label"
            settingsHome="production"
            onOpenSettings={() => undefined}
          />
        </MemoryRouter>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(host.textContent).toContain('Contains milk. May contain pistachios.');
    expect(host.textContent).toContain('of which saturates3.2 g');
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
    expect(intake.textContent).toContain('Australia / Nowa Zelandia');
    expect(intake.textContent).not.toContain('AU/NZ sub-context');
    expect(intake.textContent).not.toContain('Wybierz Australię');
    expect(intake.querySelector('[data-label-field="jurisdiction_context"]')).toBeNull();
    expect(intake.querySelector('[data-label-field="origin"]')).not.toBeNull();
    expect(
      intake.querySelector<HTMLInputElement>('[data-testid="whole-batch-package-mass"]')?.value,
    ).toBe(String(completedSnapshot().actualFinalMassG));
  });

  it('shows one market-driven preview without duplicated internal overview', async () => {
    await renderWorkspace();
    expect(host.querySelector('[data-workspace-mode="run"]')).not.toBeNull();
    expect(host.textContent).toContain('Gelato faktyczne');
    expect(host.textContent).toContain('Gellatti Laboratory');
    expect(host.textContent).toContain('Net quantity');
    expect(host.textContent).toContain('Ingredients');
    expect(host.textContent).toContain('Nutrition declaration');
    expect(host.textContent).not.toContain('Koszt');
    expect(host.textContent).not.toContain('Baza techniczna');
    expect(host.querySelector('[data-testid="label-print-blocked-message"]')).toBeNull();
    expect(host.querySelector('[data-testid="label-print-ready-message"]')).toBeNull();
    expect(moments).toHaveLength(0);
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
    ).toContain('overflow-hidden');
    const previewStyle = host
      .querySelector('[data-testid="label-consumer-preview"]')
      ?.getAttribute('style');
    expect(previewStyle).toContain('width: 385.511811');
    expect(previewStyle).toContain('height: 574.488188');
    expect(previewStyle).toContain('transform: scale(1)');
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
    expect(host.querySelector('[data-testid="label-internal-overview"]')).toBeNull();
    expect(host.textContent).not.toContain('none_declared');
    expect(button('Pobierz PDF')).toBeUndefined();
    expect((button('Drukuj') as HTMLButtonElement | undefined)?.disabled).toBe(false);
  });

  it('sets one recipe-wide allergen line through the shared dialog and reopens it from the snapshot', async () => {
    const repository = await renderWorkspace('data');
    await completeRequiredLabelData();
    await act(async () => button('Pokaż etykietę')!.click());

    expect(host.textContent).not.toContain('Alergeny nieustalone');
    expect((button('Drukuj') as HTMLButtonElement).disabled).toBe(false);
    expect(host.querySelector('[data-testid="label-allergens-set"]')).toBeNull();
    await act(async () => (button('Drukuj') as HTMLButtonElement).click());
    const input = document.querySelector<HTMLInputElement>(
      '[data-testid="label-print-missing-allergens"]',
    )!;
    await act(async () => setInputValue(input, 'Zawiera: MLEKO. Może zawierać ORZECHY.'));
    await act(async () => {
      document
        .querySelector<HTMLButtonElement>('[data-testid="label-print-missing-apply"]')!
        .click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(host.textContent).toContain('Alergeny: Zawiera: MLEKO. Może zawierać ORZECHY.');
    expect(host.querySelector('[data-testid="label-allergens-change"]')).toBeNull();
    expect(
      (await repository.getRunLabelSnapshot('run-label-workspace'))?.label.allergens
        .labelStatements,
    ).toEqual(['Zawiera: MLEKO. Może zawierać ORZECHY.']);

    await act(async () => root.unmount());
    root = createRoot(host);
    await act(async () => {
      root.render(
        <LabelWorkspace
          snapshot={completedSnapshot()}
          repository={repository}
          initialView="label"
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(host.textContent).toContain('Alergeny: Zawiera: MLEKO. Może zawierać ORZECHY.');
    expect(host.querySelector('[data-testid="label-allergens-change"]')).toBeNull();
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
    expect(editor?.textContent).toContain('Rynek sprzedaży');
    expect(editor?.textContent).toContain('Zapisz jako moje ustawienie domyślne');
    expect(editor?.textContent).not.toContain('Kopie');
    expect(editor?.textContent).toContain('Szerokość (mm)');
    const settingsPreview = editor?.querySelector('[data-testid="label-settings-preview"]');
    expect(settingsPreview).not.toBeNull();
    expect(settingsPreview?.getAttribute('class')).toContain('min-w-0');
    expect(editor?.textContent).not.toContain('Nr partii · nadawany automatycznie');
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
    expect(host.querySelector('[data-active-label-view="label"]')).not.toBeNull();
    expect(
      host.querySelector('[data-testid="label-consumer-preview"]')?.getAttribute('data-market'),
    ).toBe('UK');
  });

  it('uses shared missing fields in settings and validates Owner QA 11 > 5.1', async () => {
    const snapshot = incompletePrintSnapshot();
    await renderWorkspace('settings', {
      snapshot: {
        ...snapshot,
        finalProduct: {
          ...snapshot.finalProduct,
          labelNutritionPer100g: {
            ...snapshot.finalProduct.labelNutritionPer100g!,
            fat_g: 5.1,
            saturated_fat_g: null,
          },
        },
      },
      profileOverrides: { market: 'EU', uiLanguage: 'pl', labelLanguages: ['pl'] },
    });
    const saturated = host.querySelector<HTMLInputElement>(
      '[data-testid="label-print-missing-saturated_fat_g"]',
    )!;
    expect(host.querySelector('[data-testid="label-settings-preview"]')).not.toBeNull();
    await act(async () => setInputValue(saturated, '11'));
    expect(host.textContent).toContain(
      'Tłuszcze nasycone nie mogą być większe niż tłuszcz całkowity (5,1 g).',
    );
    expect(host.textContent).not.toContain('of which saturates11');
    await act(async () => setInputValue(saturated, '3.2'));
    expect(host.textContent).toContain('of which saturates3.2 g');
  });

  it('keeps separate Basic rectangle and round dimensions without presets or Auto', async () => {
    await renderWorkspace('settings');
    const editor = host.querySelector('[data-testid="label-settings-view"]')!;
    expect(editor.textContent).not.toContain('Format: Auto');
    expect(editor.textContent).not.toContain('70 × 50 mm');
    const width = editor.querySelector<HTMLInputElement>('[data-testid="label-basic-width"]')!;
    await act(async () => setInputValue(width, '111'));
    await act(async () => button('Okrągła')!.click());
    const diameter = editor.querySelector<HTMLInputElement>(
      '[data-testid="label-basic-diameter"]',
    )!;
    await act(async () => setInputValue(diameter, '73'));
    await act(async () => button('Prostokątna')!.click());
    expect(editor.querySelector<HTMLInputElement>('[data-testid="label-basic-width"]')?.value).toBe(
      '111',
    );
  });

  it('keeps Step 3 configuration-only and does not persist an unapplied market change', async () => {
    const repository = await renderWorkspace('settings');

    const editor = host.querySelector('[data-testid="label-settings-view"]')!;
    expect(editor.querySelector('[data-label-field]')).toBeNull();
    expect(editor.textContent).not.toContain('Pochodzenie');
    expect(editor.textContent).not.toContain('GTIN');
    const market = editor.querySelector<HTMLSelectElement>('[data-testid="label-market-select"]')!;
    await act(async () => setSelectValue(market, 'WORLD'));
    expect(market.value).toBe('WORLD');
    expect((await repository.getAccountProfile())?.market).toBe('EU');
    await act(async () => button('Wróć')!.click());
    expect(host.querySelector('[data-active-label-view="label"]')).not.toBeNull();
    expect((await repository.getAccountProfile())?.market).toBe('EU');
  });

  it('marks every preflight-missing required field in Step 1 and updates the one live count', async () => {
    await renderWorkspace('data');
    const settings = host.querySelector('[data-testid="label-data-intake"]')!;
    const missingFields = () => settings.querySelectorAll('[data-missing-required="true"]');

    expect(settings.querySelector('[data-testid="show-label-preview"]')?.textContent).toBe(
      'Pokaż etykietę',
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

    const workspace = host.querySelector('[data-testid="label-workspace"]')!;
    expect(workspace.getAttribute('data-active-label-view')).toBe('settings');
    const settings = host.querySelector('[data-testid="label-settings-view"]')!;
    expect(settings.querySelector('[data-label-field]')).toBeNull();
    expect(settings.textContent).toContain('Profil, format i drukarka');
    expect(settings.textContent).toContain('Opakowanie i masa netto');
    expect(settings.textContent).not.toContain('Uzupełnij wymagane pola');
    expect(settings.textContent).not.toContain('Sprawdziłem dane etykiety przed wydrukiem');
    const labelStep = workspace.querySelector<HTMLButtonElement>(
      '[data-testid="label-workspace-dot-label"]',
    )!;
    expect(labelStep.disabled).toBe(false);
    await act(async () => labelStep.click());
    expect(workspace.getAttribute('data-active-label-view')).toBe('label');
  });

  it('keeps the main label free of navigation dots and opens Settings through Zmień', async () => {
    await renderWorkspace();
    expect(host.querySelector('[data-testid="label-workspace-dots"]')).toBeNull();
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-testid="label-change"]')!.click(),
    );
    expect(host.querySelector('[data-active-label-view="settings"]')).not.toBeNull();
  });

  it('allows a Settings deep link and preserves mobile form interaction', async () => {
    await renderWorkspace('settings');
    const workspace = host.querySelector('[data-testid="label-workspace"]')!;
    expect(workspace.getAttribute('data-active-label-view')).toBe('settings');

    const settingsInput = workspace.querySelector<HTMLSelectElement>(
      '[data-testid="label-market-select"]',
    )!;
    await swipe(settingsInput, 90, 200);
    expect(workspace.getAttribute('data-active-label-view')).toBe('settings');
    await swipe(workspace, 260, 130);
    expect(workspace.getAttribute('data-active-label-view')).toBe('settings');
    expect(
      workspace.querySelector('[data-testid="label-settings-view"] [data-label-field]'),
    ).toBeNull();
  });

  it('opens a saved run as a new settings revision without rewriting the selected snapshot', async () => {
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
      root.render(
        <LabelWorkspace snapshot={actual} repository={repository} initialView="settings" />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(host.querySelector('[data-active-label-view="settings"]')).not.toBeNull();
    expect(
      host.querySelector<HTMLSelectElement>('[data-testid="label-market-select"]')?.value,
    ).toBe('EU');
    expect(immutable.label.market).toBe('EU');
    expect(immutable.version).toBe(1);
  });

  /* OWNER DECISION (2026-08-30) — label settings have ONE home.
     Produkcja → Etykiety owns every persistent label setting; the PRO workbench
     `Etykieta` tab is the current label plus the fields still missing for it.
     Nothing is deleted to achieve that: `settingsHome` only decides whether an
     instance renders the settings or points at the one place that does. */
  const dot = (view: 'data' | 'label' | 'settings') =>
    host.querySelector(`[data-testid="label-workspace-dot-${view}"]`);

  it('Produkcja → Etykiety keeps Settings behind the canonical Zmień action', async () => {
    await renderWorkspace('label');
    expect(dot('settings')).toBeNull();
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-testid="label-change"]')!.click(),
    );
    expect(host.querySelector('[data-active-label-view="settings"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="label-settings-home-link"]')).toBeNull();
  });

  it('the PRO workbench Etykieta tab offers no settings view of its own', async () => {
    await renderWorkspace('label', { settingsHome: 'production' });
    expect(dot('settings')).toBeNull();
    expect(host.querySelector('[data-testid="label-workspace"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="label-settings-home-link"]')).toBeNull();
    expect(button('Ustawienia')).toBeUndefined();
  });

  it('keeps the label screen free of a competing view switcher everywhere', async () => {
    await renderWorkspace('label');
    expect(host.querySelectorAll('[data-testid^="label-workspace-dot-"]')).toHaveLength(0);

    // The workbench is ONE stacked flow — preview, then whatever is still
    // missing for it — so a view switcher there would only offer a second way
    // to reach content already on the page.
    await renderWorkspace('label', { settingsHome: 'production' });
    expect(host.querySelectorAll('[data-testid^="label-workspace-dot-"]')).toHaveLength(0);
  });

  it('shows the workbench LABEL first without duplicate edit controls', async () => {
    await renderWorkspace('data', { settingsHome: 'production' });
    // never a bare form: the label view is what is on screen…
    expect(host.querySelector('[data-active-label-view="label"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="label-missing-data-stack"]')).toBeNull();
    expect(host.querySelector('[data-testid="label-allergens-set"]')).toBeNull();
    expect(host.querySelector('[data-testid="label-saturated-fat-set"]')).toBeNull();
  });

  it('orders the PRO label as preview then its two print actions', async () => {
    await renderWorkspace('data', { settingsHome: 'production' });
    const preview = host.querySelector('[data-testid="consumer-print-boundary"]')!;
    const actions = host.querySelector('[data-testid="label-workbench-print-actions"]')!;

    expect(
      preview.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect([...actions.querySelectorAll('button')].map((item) => item.textContent?.trim())).toEqual(
      ['Drukuj', 'Zmień ustawienia'],
    );
  });

  it('shows the accepted compact World label surface and keeps both optional gaps printable', async () => {
    const onOpenSettings = vi.fn();
    const snapshot = completedSnapshot();
    for (const frozen of Object.values(snapshot.productComposition.behaviorSnapshots ?? {})) {
      if (
        (frozen.sharedFacts?.nutritionPer100g?.fat ?? 0) > 0 &&
        frozen.sharedFacts?.nutritionPer100g
      ) {
        frozen.source = 'mapper';
        frozen.sharedFacts.nutritionPer100g.saturatedFat = 0;
      }
    }
    await renderWorkspace('data', {
      snapshot,
      settingsHome: 'production',
      onOpenSettings,
      profileOverrides: {
        market: 'WORLD',
        uiLanguage: 'en',
        labelLanguages: ['en'],
        enabledOptionalFields: [],
      },
    });

    const workspace = host.querySelector('[data-testid="label-workspace"]')!;
    const preview = workspace.querySelector('[data-testid="consumer-print-boundary"]')!;
    const actions = workspace.querySelector('[data-testid="label-workbench-print-actions"]')!;
    expect(workspace.getAttribute('data-active-label-view')).toBe('label');
    expect(
      preview.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(workspace.querySelector('[data-testid="label-market-indicator"]')).toBeNull();
    expect(workspace.querySelector('[data-testid="label-missing-data-stack"]')).toBeNull();
    expect(workspace.querySelector('[data-testid="label-internal-overview"]')).toBeNull();
    expect(workspace.querySelector('[data-testid="label-print-blocked-message"]')).toBeNull();
    expect(workspace.textContent).not.toContain('102 × 152 mm');
    expect(workspace.textContent).not.toContain('Dokończ etykietę');
    expect(workspace.textContent).not.toContain('Ostatnie potwierdzenie');
    expect(workspace.textContent).not.toContain('Alergeny nieustalone');
    expect(workspace.textContent).not.toContain('Tłuszcze nasycone nieustalone');
    expect([...actions.querySelectorAll('button')].map((item) => item.textContent?.trim())).toEqual(
      ['Drukuj', 'Zmień ustawienia'],
    );
    expect(actions.querySelector<HTMLButtonElement>('[data-testid="label-print"]')?.disabled).toBe(
      false,
    );
    await act(async () =>
      actions.querySelector<HTMLButtonElement>('[data-testid="label-change"]')!.click(),
    );
    expect(onOpenSettings).toHaveBeenCalledWith('run-label-workspace');
  });

  it('still opens an incomplete label on its data view at home', async () => {
    await renderWorkspace('data');
    expect(host.querySelector('[data-active-label-view="data"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="label-missing-data-stack"]')).toBeNull();
  });

  it('a ?labelView=settings deep link cannot reopen settings in the workbench', async () => {
    await renderWorkspace('settings', { settingsHome: 'production' });
    expect(dot('settings')).toBeNull();
    expect(host.querySelector('[data-active-label-view="settings"]')).toBeNull();
  });
});
