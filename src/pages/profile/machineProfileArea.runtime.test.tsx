// @vitest-environment jsdom
/**
 * PAKIET PRODUKCJA V3 §3 + „Niezapisane dane” 2–4 — Produkcja → Maszyna on the real page.
 *
 *   - no saved machine → no „Zapisz ustawienia” action (nothing to save);
 *   - „Zapisz i przejdź” with a 0 g batch → no move, the draft stays, „Podaj dodatnią liczbę
 *     gramów.”;
 *   - „Zapisz i przejdź” with a failing device save → no move, the existing save-failed
 *     message, the draft stays; the next „Zapisz ustawienia” saves;
 *   - „Odrzuć zmiany” while a batch is in progress leaves `productionSessionStore` untouched;
 *   - a failed save of the machine CHOICE is no longer silent;
 *   - „Maszyna profesjonalna” stays offered on /machine to HOME and PRO (as today).
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MACHINE_CATALOG_VERSION, NINJA_CREAMI_DELUXE_NC502EU } from '@/features/machine-catalog';
import {
  MACHINE_PREFERENCE_STORAGE_KEY,
  buildMachinePreferenceRecord,
  userScopedMachineKey,
} from '@/features/machine-onboarding';
import { useProCoreAccessStore } from '@/features/pro-core/proCoreAccessStore';
import type { ProCorePersona } from '@/features/pro-core/proCoreCapabilities';
import { clearProductionAreaMemory } from '@/features/production-area/productionAreaMemory';
import { ProductionAreaSurface } from '@/features/production-area/ProductionAreaSurface';
import { resetUnsavedGuardForTests } from '@/features/production-area/unsavedGuard';
import { useProductionSessionStore } from '@/features/production-workspace/productionSessionStore';
import { useAuthStore } from '@/stores/authStore';
import { MachineProfilePage } from './MachineProfilePage';

const OWNER = 'machine-area-owner';
const KEY = userScopedMachineKey(OWNER);

const seedMachine = () => {
  const record = buildMachinePreferenceRecord({
    profile: NINJA_CREAMI_DELUXE_NC502EU,
    isCustom: false,
    setAt: '2026-09-18T08:00:00.000Z',
    catalogVersion: MACHINE_CATALOG_VERSION,
  });
  if (record === null) throw new Error('expected a Deluxe record');
  window.localStorage.setItem(KEY, JSON.stringify(record));
};

const stored = () => JSON.parse(window.localStorage.getItem(KEY) ?? 'null');

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="probe" data-path={location.pathname} />;
}

const setValue = (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

const flush = async (ms = 0) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

describe('Produkcja → Maszyna', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    window.localStorage.clear();
    useAuthStore.setState({
      status: 'authed',
      user: { id: OWNER, email: 'machine@example.test', displayName: null },
      available: true,
    });
    clearProductionAreaMemory();
    resetUnsavedGuardForTests();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    useProCoreAccessStore.setState({ devPersona: null });
    resetUnsavedGuardForTests();
    window.localStorage.clear();
  });

  const render = async (persona: ProCorePersona = 'pro') => {
    useProCoreAccessStore.setState({ devPersona: persona });
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/machine']}>
          <Routes>
            <Route path="/machine" element={<MachineProfilePage />} />
            <Route
              path="/products"
              element={<ProductionAreaSurface section="products">katalog</ProductionAreaSurface>}
            />
          </Routes>
          <LocationProbe />
        </MemoryRouter>,
      );
    });
    await flush();
  };

  const path = () => host.querySelector('[data-testid="probe"]')?.getAttribute('data-path');
  const saveAction = () =>
    host.querySelector<HTMLButtonElement>('[data-testid="machine-settings-save"]');
  const batchField = () => {
    const label = [...host.querySelectorAll('label')].find((candidate) =>
      candidate.textContent?.includes('Mój domyślny wsad'),
    );
    const input =
      label?.querySelector('input') ??
      (label?.htmlFor ? host.querySelector<HTMLInputElement>(`#${label.htmlFor}`) : null);
    expect(input, 'the „Mój domyślny wsad” field').toBeTruthy();
    return input as HTMLInputElement;
  };
  const click = async (element: Element | null | undefined) => {
    expect(element).toBeTruthy();
    await act(async () => {
      (element as HTMLElement).click();
      await Promise.resolve();
    });
    await flush();
  };
  const leaveToProducts = async () =>
    click(host.querySelector('[data-testid="production-area-section-products"]'));
  const answer = (id: 'save' | 'discard' | 'stay') =>
    click(document.querySelector(`[data-testid="unsaved-changes-${id}"]`));
  const buttonByText = (text: string) =>
    [...host.querySelectorAll('button')].find((button) => button.textContent?.trim() === text);

  it('shows no „Zapisz ustawienia” action while no machine is saved', async () => {
    await render();
    expect(host.textContent).toContain('Nie masz jeszcze zapisanej maszyny.');
    expect(saveAction()).toBeNull();
  });

  it('„Zapisz i przejdź” with 0 g stays, keeps the draft and names the rule', async () => {
    seedMachine();
    await render();
    expect(saveAction()).not.toBeNull();
    await act(async () => setValue(batchField(), '0'));
    await leaveToProducts();
    expect(document.querySelector('[data-testid="unsaved-changes-dialog"]')).not.toBeNull();
    await answer('save');
    expect(path()).toBe('/machine');
    expect(document.querySelector('[data-testid="unsaved-changes-dialog"]')).toBeNull();
    expect(batchField().value).toBe('0');
    expect(host.textContent).toContain('Podaj dodatnią liczbę gramów.');
  });

  it('„Zapisz i przejdź” with a failed device save stays; the next save succeeds', async () => {
    seedMachine();
    await render();
    await act(async () => setValue(batchField(), '520'));

    const realSetItem = Storage.prototype.setItem;
    const failOnce = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('quota');
    });
    await leaveToProducts();
    await answer('save');
    expect(failOnce).toHaveBeenCalled();
    expect(path()).toBe('/machine');
    expect(host.textContent).toContain(
      'Nie udało się zapisać ustawień na tym urządzeniu. Spróbuj ponownie.',
    );
    expect(batchField().value).toBe('520');
    expect(stored()?.userDefaultBatchGrams ?? null).toBeNull();

    failOnce.mockImplementation(realSetItem);
    await click(saveAction());
    expect(host.textContent).toContain('Ustawienia zapisane');
    expect(stored()?.userDefaultBatchGrams).toBe(520);
    // Saved → nothing is unsaved any more: the bar leaves at once.
    await leaveToProducts();
    expect(document.querySelector('[data-testid="unsaved-changes-dialog"]')).toBeNull();
    expect(path()).toBe('/products');
  });

  it('„Odrzuć zmiany” leaves the batch in progress, its confirmations and grams untouched', async () => {
    seedMachine();
    const inProgress = {
      sessionId: 'run-in-progress',
      status: 'in_progress',
      confirmedLineIds: ['line-1'],
      draftActualGrams: { 'line-1': 212 },
    };
    useProductionSessionStore.setState({
      session: inProgress as never,
      sessionsById: { 'run-in-progress': inProgress } as never,
    });
    const before = JSON.stringify({
      session: useProductionSessionStore.getState().session,
      sessionsById: useProductionSessionStore.getState().sessionsById,
    });
    await render();
    await act(async () => setValue(batchField(), '520'));
    await leaveToProducts();
    await answer('discard');
    expect(path()).toBe('/products');
    expect(
      JSON.stringify({
        session: useProductionSessionStore.getState().session,
        sessionsById: useProductionSessionStore.getState().sessionsById,
      }),
    ).toBe(before);
    expect(stored()?.userDefaultBatchGrams ?? null).toBeNull();
    useProductionSessionStore.setState({ session: null, sessionsById: {} as never });
  });

  it('says so when saving the machine CHOICE fails — no longer silent', async () => {
    seedMachine();
    // Reduced motion: the configuring step dwells once instead of animating each line.
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) =>
        ({
          matches: query.includes('reduce'),
          media: query,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        }) as unknown as MediaQueryList,
    });
    await render();
    await click(buttonByText('Zmień maszynę'));
    await click(
      [...host.querySelectorAll('button')].find((button) =>
        button.textContent?.includes('Ninja CREAMi'),
      ),
    );
    const deluxe = [...host.querySelectorAll('[role="radio"], button')].find((node) =>
      node.textContent?.includes('NC502'),
    );
    if (deluxe) await click(deluxe);
    await flush(450);
    expect(host.textContent).toContain('Dopasuj ilość');
    // The choice saves and stays here: it no longer claims to go to a recipe.
    expect(buttonByText('Zapisz i przejdź do receptury')).toBeUndefined();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('quota');
    });
    await click(buttonByText('Zapisz'));
    expect(host.querySelector('[data-testid="machine-choice-save-failed"]')?.textContent).toBe(
      'Nie udało się zapisać ustawień na tym urządzeniu. Spróbuj ponownie.',
    );
  });

  for (const persona of ['home', 'pro'] as const) {
    it(`${persona.toUpperCase()} still sees „Maszyna profesjonalna” on /machine`, async () => {
      seedMachine();
      await render(persona);
      await click(buttonByText('Zmień maszynę'));
      expect(host.textContent).toContain('Maszyna profesjonalna');
    });
  }

  it('offers the rest of the new-recipe settings in the account, and the save scope', async () => {
    seedMachine();
    await render();
    const link = host.querySelector<HTMLAnchorElement>(
      '[data-testid="machine-recipe-defaults-link"]',
    );
    expect(link?.getAttribute('href')).toBe('/account?section=recipe');
    expect(host.querySelector('[data-testid="machine-default-scope"]')?.textContent).toContain(
      'Partia w toku',
    );
    expect(MACHINE_PREFERENCE_STORAGE_KEY.length).toBeGreaterThan(0);
  });
});
