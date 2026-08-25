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
} from '@/services/labels/labelRepository';
import { useAuthStore } from '@/stores/authStore';
import { LabelWorkspace } from './LabelWorkspace';

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

  async function renderWorkspace(initialView: 'label' | 'settings' = 'label') {
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

  it('shows one market-driven preview with ACTUAL overview outside the print boundary', async () => {
    await renderWorkspace();
    expect(host.querySelector('[data-workspace-mode="run"]')).not.toBeNull();
    expect(host.textContent).toContain('Gelato faktyczne');
    expect(host.textContent).toContain('Gellatti Laboratory');
    expect(host.textContent).toContain('Masa netto');
    expect(host.textContent).toContain('Składniki');
    expect(host.textContent).toContain('Wartość odżywcza');
    expect(host.textContent).toContain('Koszt');
    expect(host.textContent).toContain('Baza techniczna');
    expect(
      host.querySelector('[data-testid="label-consumer-preview"]')?.getAttribute('data-market'),
    ).toBe('EU');
    expect(
      host
        .querySelector('[data-testid="label-consumer-preview"]')
        ?.getAttribute('data-label-layout'),
    ).toBe('eu_declaration');
    expect(completedSnapshot().lotCode).toMatch(/^LOT-20260824-/);
    expect(host.querySelector('[data-testid="consumer-lot"]')?.textContent).toMatch(/^20260824-/);
    expect(host.querySelector('[data-testid="consumer-lot"]')?.textContent).not.toContain('LOT-');
    expect(
      host.querySelector('[data-testid="consumer-print-boundary"]')?.textContent,
    ).not.toContain('Koszt');
    const internal = host.querySelector('[data-testid="label-internal-overview"]');
    expect(internal?.textContent).toContain('Koszt');
    expect(internal?.textContent).toContain('Baza techniczna');
    expect(internal?.textContent).not.toContain('Składniki');
    expect(internal?.textContent).not.toContain('Wartości odżywcze');
    expect(host.textContent).not.toContain('none_declared');
  });

  it('opens the complete Settings state inside the same two-view workspace', async () => {
    await renderWorkspace();
    expect(host.querySelector('[data-active-label-view="label"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="label-workspace"]')?.getAttribute('data-run-id')).toBe(
      'run-label-workspace',
    );
    expect(host.querySelectorAll('[data-testid^="label-workspace-dot-"]')).toHaveLength(2);
    const edit = button('Ustawienia');
    expect(edit).not.toBeUndefined();
    await act(async () => edit!.click());
    const editor = host.querySelector('[data-testid="label-settings-view"]');
    expect(host.querySelector('[data-active-label-view="settings"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="label-run-editor"]')).toBeNull();
    expect(editor?.querySelector('[role="dialog"]')).toBeNull();
    expect(editor?.innerHTML).toContain('min-h-11');
    expect(editor?.textContent).toContain('Jurysdykcja / profil');
    expect(editor?.textContent).toContain('Zapisz jako domyślne');
    expect(editor?.textContent).toContain('Kopie');
    expect(editor?.textContent).toContain('LOT · nadawany automatycznie');
    expect(editor?.textContent).toContain('Wymagane pola profilu UE są zawsze aktywne');
    expect(editor?.querySelector('[data-testid="optional-label-fields"] input')).not.toBeNull();

    const us = [...editor!.querySelectorAll('button')].find((button) =>
      button.textContent?.startsWith('USA'),
    );
    expect(us?.disabled).toBe(true);
    const uk = [...editor!.querySelectorAll('button')].find(
      (button) => button.textContent === 'UK',
    );
    await act(async () => uk!.click());
    const apply = [...editor!.querySelectorAll('button')].find(
      (button) => button.textContent === 'Zastosuj',
    );
    await act(async () => {
      apply!.click();
      await Promise.resolve();
    });
    expect(host.querySelector('[data-active-label-view="label"]')).not.toBeNull();
    expect(
      host.querySelector('[data-testid="label-consumer-preview"]')?.getAttribute('data-market'),
    ).toBe('UK');
    expect(
      host
        .querySelector('[data-testid="label-consumer-preview"]')
        ?.getAttribute('data-label-layout'),
    ).toBe('uk_declaration');
    expect(host.querySelector('[data-testid="label-market-indicator"]')?.textContent).toContain(
      '🇬🇧',
    );
  });

  it('locks required fields and persists an optional toggle through a reload', async () => {
    const repository = await renderWorkspace();
    const openSettings = () => button('Ustawienia');

    await act(async () => openSettings()!.click());
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
      (button) => button.textContent === 'Zastosuj',
    )!;
    await act(async () => {
      apply.click();
      await Promise.resolve();
    });
    expect((await repository.getAccountProfile())?.enabledOptionalFields).not.toContain('origin');

    await act(async () => {
      root.render(<></>);
      root.render(<LabelWorkspace snapshot={completedSnapshot()} repository={repository} />);
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => openSettings()!.click());
    editor = host.querySelector('[data-testid="label-settings-view"]')!;
    const reloadedOrigin = [
      ...editor.querySelectorAll('[data-testid="optional-label-fields"] label'),
    ]
      .find((label) => label.textContent?.includes('Pochodzenie'))!
      .querySelector('input')!;
    expect(reloadedOrigin.checked).toBe(false);
  });

  it('marks exactly the preflight-missing required fields and updates the one live count', async () => {
    await renderWorkspace();
    await act(async () => button('Ustawienia')!.click());
    const settings = host.querySelector('[data-testid="label-settings-view"]')!;
    const missingCount = () =>
      settings.querySelector('[data-testid="label-settings-missing-count"]')?.textContent ?? '';
    const missingFields = () => settings.querySelectorAll('[data-missing-required="true"]');

    expect(missingCount()).toContain('Brakuje 7 wymaganych informacji');
    expect(missingFields()).toHaveLength(5);
    expect(
      [...missingFields()].map((field) => field.getAttribute('data-label-field')).sort(),
    ).toEqual(['allergens', 'date_mark', 'legal_product_name', 'operator', 'storage']);

    const fill = async (field: string, values: string[]) => {
      const inputs = [
        ...settings.querySelectorAll<HTMLInputElement>(`[data-label-field="${field}"] input`),
      ].filter((input) => input.type !== 'checkbox');
      await act(async () => {
        inputs.forEach((input, index) => setInputValue(input, values[index] ?? values[0]!));
      });
    };

    await fill('legal_product_name', ['Ice cream']);
    expect(missingCount()).toContain('Brakuje 6 wymaganych informacji');
    await act(async () =>
      settings.querySelector<HTMLInputElement>('[data-label-field="allergens"] input')!.click(),
    );
    await fill('operator', ['Gellatti Laboratory', '1 Test Street']);
    await fill('storage', ['Keep frozen']);
    await fill('date_mark', ['2026-09-24']);

    expect(missingCount()).toContain('Brakuje 2 wymaganych informacji');
    expect(missingFields()).toHaveLength(0);
  });

  it('uses accessible dots and Cancel returns without applying the draft', async () => {
    await renderWorkspace();
    const settingsDot = host.querySelector<HTMLButtonElement>(
      '[data-testid="label-workspace-dot-settings"]',
    )!;
    expect(settingsDot.getAttribute('aria-current')).toBeNull();
    await act(async () => settingsDot.click());
    expect(settingsDot.getAttribute('aria-current')).toBe('step');

    const settings = host.querySelector('[data-testid="label-settings-view"]')!;
    const uk = [...settings.querySelectorAll('button')].find(
      (candidate) => candidate.textContent === 'UK',
    )!;
    await act(async () => uk.click());
    await act(async () => button('Anuluj')!.click());

    expect(host.querySelector('[data-active-label-view="label"]')).not.toBeNull();
    expect(
      host.querySelector('[data-testid="label-consumer-preview"]')?.getAttribute('data-market'),
    ).toBe('EU');

    await act(async () => button('Ustawienia')!.click());
    expect(
      host.querySelector('[data-testid="label-settings-view"] [data-market-active="true"]')
        ?.textContent,
    ).toBe('UE');
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-testid="label-workspace-dot-label"]')!.click(),
    );
    expect(host.querySelector('[data-active-label-view="label"]')).not.toBeNull();
  });

  it('opens the same Settings state from a deep link and supports guarded mobile swipe', async () => {
    await renderWorkspace('settings');
    const workspace = host.querySelector('[data-testid="label-workspace"]')!;
    expect(workspace.getAttribute('data-active-label-view')).toBe('settings');
    expect(
      workspace.querySelector('[data-testid="label-settings-view"] [data-market-active="true"]')
        ?.textContent,
    ).toBe('UE');

    await swipe(workspace, 80, 170);
    expect(workspace.getAttribute('data-active-label-view')).toBe('label');
    await swipe(workspace, 260, 130);
    expect(workspace.getAttribute('data-active-label-view')).toBe('settings');

    const settingsInput = workspace.querySelector<HTMLInputElement>(
      '[data-testid="label-settings-view"] input',
    )!;
    await swipe(settingsInput, 90, 200);
    expect(workspace.getAttribute('data-active-label-view')).toBe('settings');
  });
});
