// @vitest-environment jsdom
/**
 * PAKIET PRODUKCJA V3 §3 — Konto → „Ustawienia receptury” no longer owns the machine.
 *
 * Produkcja → Maszyna is the ONE place of the default machine and batch. This card keeps the
 * product type, serving mode, strategy, sweetness and softness, and:
 *
 *   1. renders neither „Maszyna / styl produkcji” nor „Partia bazy · g” — only the link to
 *      Produkcja · Maszyna;
 *   2. WITH an account row, a save of serving / sweetness carries that row's machine fields
 *      1:1 (payload of `upsertUserRecipeDefault`);
 *   3. WITHOUT a row, a save while a Ninja recipe is open does NOT make the Ninja the account
 *      default (it used to, silently, through `profileSnapshotFromState`), and `startNewRecipe`
 *      opens exactly as it did before the save.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/userRecipeDefaults', () => ({
  listUserRecipeDefaults: vi.fn(),
  upsertUserRecipeDefault: vi.fn(),
}));

import { listUserRecipeDefaults, upsertUserRecipeDefault } from '@/services/userRecipeDefaults';
import type { UserRecipeDefaultRow } from '@/services/userRecipeDefaults';
import { useAuthStore } from '@/stores/authStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { AccountRecipeDefaults } from './AccountRecipeDefaults';
import { DEFAULT_DIRECTION_TARGETS, useRecipeProfileStore } from './recipeProfileStore';
import type { ProfileSettingsSnapshot } from './recipeProfileStore';

const OWNER = 'defaults-owner';

const MACHINE_FIELDS = [
  'machineKind',
  'machineId',
  'machineLabel',
  'machineTechnology',
  'homeFormulationModuleId',
  'machineCapacityGrams',
  'targetBatchGrams',
  'batchSource',
] as const;

const pickMachine = (settings: Partial<ProfileSettingsSnapshot>) =>
  Object.fromEntries(MACHINE_FIELDS.map((field) => [field, settings[field]]));

const ninjaRow: ProfileSettingsSnapshot = {
  visibleProductType: 'gelato',
  mode: 'classic',
  formulationStrategy: 'optimal',
  targetBatchGrams: 430,
  batchSource: 'USER_OVERRIDE',
  machineKind: 'home',
  machineId: 'ninja-creami-nc302eu',
  machineLabel: 'Ninja CREAMi NC302EU',
  machineTechnology: 'respin',
  homeFormulationModuleId: null,
  servingModeId: 'temp_minus_13',
  targetTemperatureC: -13,
  machineCapacityGrams: 473,
  directionTargets: DEFAULT_DIRECTION_TARGETS,
};

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

describe('Konto → Ustawienia receptury leaves the machine to Produkcja → Maszyna', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    useAuthStore.setState({
      status: 'authed',
      user: { id: OWNER, email: null, displayName: null },
      available: true,
    });
    useRecipeProfileStore.getState().resetForTests();
    useRecipeProfileStore.getState().setMachineAccountDefault(null, null);
    useRecipeStore.getState().resetToDemo();
    vi.mocked(listUserRecipeDefaults).mockReset();
    vi.mocked(upsertUserRecipeDefault).mockReset();
    vi.mocked(upsertUserRecipeDefault).mockResolvedValue(undefined);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  const render = async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <AccountRecipeDefaults />
        </MemoryRouter>,
      );
    });
    await flush();
  };

  const selectServing = async (value: string) => {
    const select = [...host.querySelectorAll('label')]
      .find((label) => label.textContent?.startsWith('Tryb serwowania'))
      ?.querySelector('select');
    expect(select).toBeTruthy();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(
        select,
        value,
      );
      select!.dispatchEvent(new Event('change', { bubbles: true }));
    });
  };

  const save = async () => {
    const button = [...host.querySelectorAll('button')].find(
      (candidate) => candidate.textContent?.trim() === 'Zapisz ustawienia domyślne',
    );
    expect(button).toBeTruthy();
    await act(async () => button!.click());
    await flush();
  };

  it('1. renders no machine or batch control — only the link to Produkcja · Maszyna', async () => {
    vi.mocked(listUserRecipeDefaults).mockResolvedValue([]);
    await render();
    expect(host.textContent).not.toContain('Maszyna / styl produkcji');
    expect(host.textContent).not.toContain('Partia bazy · g');
    const link = host.querySelector<HTMLAnchorElement>(
      '[data-testid="account-recipe-defaults-machine-link"]',
    );
    expect(link?.getAttribute('href')).toBe('/machine');
    expect(link?.textContent).toContain('Maszyna i domyślny wsad');
    expect(link?.textContent).toContain('Produkcja · Maszyna');
    // What stays here: product type, serving, strategy, sweetness, softness, save.
    expect(host.textContent).toContain('Tryb serwowania');
    expect(host.textContent).toContain('Strategia');
    expect(host.textContent).toContain('Słodycz');
    expect(host.textContent).toContain('Miękkość');
    expect(host.textContent).toContain('Zapisz ustawienia domyślne');
  });

  it('2. with an account row, a serving save carries the row machine fields 1:1', async () => {
    const row: UserRecipeDefaultRow = {
      owner_user_id: OWNER,
      product_context_key: 'gelato',
      settings: ninjaRow,
      updated_at: '2026-09-18T08:00:00.000Z',
    };
    vi.mocked(listUserRecipeDefaults).mockResolvedValue([row]);
    await render();
    await selectServing('temp_minus_12');
    await save();

    expect(upsertUserRecipeDefault).toHaveBeenCalledTimes(1);
    const [owner, product, payload] = vi.mocked(upsertUserRecipeDefault).mock.calls[0]!;
    expect(owner).toBe(OWNER);
    expect(product).toBe('gelato');
    expect(pickMachine(payload)).toEqual(pickMachine(ninjaRow));
    expect(payload.servingModeId).toBe('temp_minus_12');
  });

  it('3. without a row, an open Ninja recipe never becomes the account default machine', async () => {
    vi.mocked(listUserRecipeDefaults).mockResolvedValue([]);
    // An open Ninja recipe — what the old draft copied into a new row.
    const openNinja = {
      machineKind: 'home' as const,
      machineId: 'ninja-creami-nc302eu',
      machineLabel: 'Ninja CREAMi NC302EU',
      machineTechnology: 'respin' as const,
      machine_capacity_grams: 473,
      target_batch_grams: 430,
      batch_source: 'MACHINE_DEFAULT' as const,
    };

    // What a new recipe opens with today, with no row for the account.
    useRecipeStore.getState().startNewRecipe('gelato');
    const before = useRecipeStore.getState();
    const beforeStart = {
      target_batch_grams: before.target_batch_grams,
      batch_source: before.batch_source,
      machine_capacity_grams: before.machine_capacity_grams,
      machineId: before.machineId,
    };
    useRecipeStore.setState(openNinja);

    await render();
    await save();

    expect(upsertUserRecipeDefault).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(upsertUserRecipeDefault).mock.calls[0]![2];
    expect(payload.machineKind).toBe('professional');
    expect(payload.machineId).toBeNull();
    expect(payload.machineCapacityGrams).toBeNull();
    expect(payload.batchSource).toBe('PROFESSIONAL_DEFAULT');
    expect(payload.machineLabel).not.toContain('Ninja');

    // The recipe that was open is untouched by the save…
    expect(useRecipeStore.getState().machineId).toBe('ninja-creami-nc302eu');
    // …and the next new recipe opens exactly as it did before the save.
    useRecipeStore.getState().startNewRecipe('gelato');
    const after = useRecipeStore.getState();
    expect({
      target_batch_grams: after.target_batch_grams,
      batch_source: after.batch_source,
      machine_capacity_grams: after.machine_capacity_grams,
      machineId: after.machineId,
    }).toEqual(beforeStart);
    expect(after.machineKind).not.toBe('home');
  });
});
