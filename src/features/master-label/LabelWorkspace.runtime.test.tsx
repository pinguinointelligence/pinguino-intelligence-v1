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

  async function renderWorkspace() {
    const repository = inMemoryLabelRepository('owner-label-workspace');
    await repository.saveAccountProfile({
      ...defaultAccountLabelProfile('owner-label-workspace'),
      businessName: 'Gellatti Laboratory',
      logoPath: 'owner-label-workspace/logo.png',
    });
    await act(async () => {
      root.render(<LabelWorkspace snapshot={completedSnapshot()} repository={repository} />);
      await Promise.resolve();
      await Promise.resolve();
    });
    return repository;
  }

  it('shows one market-driven preview with ACTUAL overview outside the print boundary', async () => {
    await renderWorkspace();
    expect(host.querySelector('[data-workspace-mode="run"]')).not.toBeNull();
    expect(host.textContent).toContain('Gelato faktyczne');
    expect(host.textContent).toContain('Gellatti Laboratory');
    expect(host.textContent).toContain('Masa netto');
    expect(host.textContent).toContain('Składniki');
    expect(host.textContent).toContain('Wartości odżywcze');
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
    expect(host.querySelector('[data-testid="consumer-lot"]')?.textContent).toMatch(
      /^LOT-20260824-/,
    );
    expect(
      host.querySelector('[data-testid="consumer-print-boundary"]')?.textContent,
    ).not.toContain('Koszt');
    expect(host.textContent).not.toContain('none_declared');
  });

  it('uses the shared bottom-sheet editor on mobile with 44px controls', async () => {
    await renderWorkspace();
    const edit = [...host.querySelectorAll('button')].find(
      (button) => button.textContent === 'Ustawienia',
    );
    expect(edit).not.toBeUndefined();
    await act(async () => edit!.click());
    const editor = host.querySelector('[data-testid="label-run-editor"]');
    expect(editor?.getAttribute('data-placement')).toBe('responsive');
    expect(editor?.className).toContain('justify-end');
    expect(editor?.className).toContain('sm:place-items-center');
    expect(editor?.querySelector('[role="dialog"]')).not.toBeNull();
    expect(editor?.innerHTML).toContain('min-h-11');
    expect(editor?.textContent).toContain('Jurysdykcja / profil');
    expect(editor?.textContent).toContain('Zapisz jako domyślne');
    expect(editor?.textContent).toContain('Kopie');
    expect(editor?.textContent).toContain('LOT · nadawany automatycznie');
    expect(editor?.textContent).toContain('Wymagane pola profilu UE są zawsze aktywne');
    expect(editor?.querySelector('[data-testid="optional-label-fields"] input')).not.toBeNull();

    const us = [...editor!.querySelectorAll('button')].find(
      (button) => button.textContent === 'USA',
    );
    await act(async () => us!.click());
    const apply = [...editor!.querySelectorAll('button')].find(
      (button) => button.textContent === 'Zastosuj',
    );
    await act(async () => {
      apply!.click();
      await Promise.resolve();
    });
    expect(
      host.querySelector('[data-testid="label-consumer-preview"]')?.getAttribute('data-market'),
    ).toBe('US');
    expect(
      host
        .querySelector('[data-testid="label-consumer-preview"]')
        ?.getAttribute('data-label-layout'),
    ).toBe('market_review');
    expect(host.querySelector('[data-testid="label-market-indicator"]')?.textContent).toContain(
      '🇺🇸',
    );
  });

  it('locks required fields and persists an optional toggle through a reload', async () => {
    const repository = await renderWorkspace();
    const openSettings = () =>
      [...host.querySelectorAll('button')].find((button) => button.textContent === 'Ustawienia');

    await act(async () => openSettings()!.click());
    let editor = host.querySelector('[data-testid="label-run-editor"]')!;
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

    const saveDefault = [...editor.querySelectorAll('label')]
      .find((label) => label.textContent?.includes('Zapisz jako domyślne'))!
      .querySelector('input')!;
    await act(async () => saveDefault.click());
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
    editor = host.querySelector('[data-testid="label-run-editor"]')!;
    const reloadedOrigin = [
      ...editor.querySelectorAll('[data-testid="optional-label-fields"] label'),
    ]
      .find((label) => label.textContent?.includes('Pochodzenie'))!
      .querySelector('input')!;
    expect(reloadedOrigin.checked).toBe(false);
  });
});
