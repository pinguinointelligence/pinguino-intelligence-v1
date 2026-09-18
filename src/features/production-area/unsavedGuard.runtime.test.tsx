// @vitest-environment jsdom
/**
 * PAKIET PRODUKCJA V3 §1.5 + „Niezapisane dane” scenarios — the one unsaved-changes question.
 *
 * A registered area form with unsaved changes is asked about before the section bar, the ☰
 * drawer or HOME | PRO leave it. „Zostań” keeps the draft; „Odrzuć zmiany” calls ONLY the
 * form's discard; „Zapisz i przejdź” leaves only after the form's own save reports ok. Nothing
 * unsaved → no question at all. `beforeunload` is armed only while something is unsaved.
 */
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '@/features/shell/AppShell';
import { useProCoreAccessStore } from '@/features/pro-core/proCoreAccessStore';
import { useAuthStore } from '@/stores/authStore';
import { ProductionAreaSurface } from './ProductionAreaSurface';
import { clearProductionAreaMemory } from './productionAreaMemory';
import { resetUnsavedGuardForTests, type UnsavedSaveResult } from './unsavedGuard';
import { useRegisterUnsaved } from './useRegisterUnsaved';

const saveImpl = vi.fn<(value: string) => Promise<UnsavedSaveResult>>();
const discardSpy = vi.fn();

function FakeMachineForm() {
  const [saved, setSaved] = useState('450');
  const [draft, setDraft] = useState('450');
  const [message, setMessage] = useState<string | null>(null);
  useRegisterUnsaved({
    id: 'test-machine-form',
    label: 'Maszyna',
    dirty: draft !== saved,
    save: async () => {
      const result = await saveImpl(draft);
      if (result.ok) setSaved(draft);
      else setMessage('save-failed');
      return result;
    },
    discard: () => {
      discardSpy();
      setDraft(saved);
    },
  });
  return (
    <div>
      <input
        aria-label="Mój domyślny wsad"
        data-testid="fake-batch"
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
      />
      {message ? <p role="alert">{message}</p> : null}
    </div>
  );
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="probe" data-path={`${location.pathname}${location.search}`} />;
}

const setValue = (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('the Produkcja unsaved-changes question', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    useAuthStore.setState({
      status: 'authed',
      user: { id: 'guard-owner', email: 'guard@example.test', displayName: null },
      available: true,
    });
    useProCoreAccessStore.setState({ devPersona: 'pro' });
    clearProductionAreaMemory();
    resetUnsavedGuardForTests();
    saveImpl.mockReset();
    discardSpy.mockReset();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/machine']}>
          <Routes>
            <Route
              path="/machine"
              element={
                <ProductionAreaSurface section="machine" title="Ustawienia maszyny">
                  <FakeMachineForm />
                </ProductionAreaSurface>
              }
            />
            <Route
              path="/products"
              element={<ProductionAreaSurface section="products">katalog</ProductionAreaSurface>}
            />
            <Route path="/recipes" element={<AppShell>Receptury</AppShell>} />
            <Route path="/home" element={<AppShell>HOME</AppShell>} />
            <Route path="/pro/recipe" element={<AppShell>PRO</AppShell>} />
          </Routes>
          <LocationProbe />
        </MemoryRouter>,
      );
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    useProCoreAccessStore.setState({ devPersona: null });
    resetUnsavedGuardForTests();
  });

  const path = () => host.querySelector('[data-testid="probe"]')?.getAttribute('data-path');
  const dialog = () => document.querySelector('[data-testid="unsaved-changes-dialog"]');
  const batch = () => host.querySelector<HTMLInputElement>('[data-testid="fake-batch"]');
  const productsLink = () =>
    host.querySelector<HTMLAnchorElement>('[data-testid="production-area-section-products"]')!;
  const click = async (element: Element | null) => {
    expect(element).not.toBeNull();
    await act(async () => {
      (element as HTMLElement).click();
      await Promise.resolve();
    });
  };
  const edit = async (value: string) => act(async () => setValue(batch()!, value));

  it('nothing unsaved → the section bar leaves at once, no question', async () => {
    await click(productsLink());
    expect(dialog()).toBeNull();
    expect(path()).toBe('/products');
  });

  it('marks the section and asks on the bar; „Zostań” keeps the draft and the place', async () => {
    await edit('520');
    expect(host.querySelector('[data-testid="production-area-section-unsaved"]')).not.toBeNull();
    await click(productsLink());
    expect(dialog()).not.toBeNull();
    expect(dialog()!.textContent).toContain('Masz niezapisane zmiany');
    expect(dialog()!.textContent).toContain('Maszyna: zmiany nie są jeszcze zapisane.');
    await click(document.querySelector('[data-testid="unsaved-changes-stay"]'));
    expect(dialog()).toBeNull();
    expect(path()).toBe('/machine');
    expect(batch()!.value).toBe('520');
    expect(saveImpl).not.toHaveBeenCalled();
    expect(discardSpy).not.toHaveBeenCalled();
  });

  it('„Odrzuć zmiany” drops only the form draft, then leaves', async () => {
    await edit('520');
    await click(productsLink());
    await click(document.querySelector('[data-testid="unsaved-changes-discard"]'));
    expect(discardSpy).toHaveBeenCalledTimes(1);
    expect(saveImpl).not.toHaveBeenCalled();
    expect(path()).toBe('/products');
  });

  it('„Zapisz i przejdź” leaves only after the form save reports ok', async () => {
    saveImpl.mockResolvedValue({ ok: true });
    await edit('520');
    await click(productsLink());
    await click(document.querySelector('[data-testid="unsaved-changes-save"]'));
    expect(saveImpl).toHaveBeenCalledWith('520');
    expect(path()).toBe('/products');
    expect(dialog()).toBeNull();
  });

  it('„Zapisz i przejdź” with a failed save: no move, draft kept, the form shows its message', async () => {
    saveImpl.mockResolvedValue({ ok: false });
    await edit('520');
    await click(productsLink());
    await click(document.querySelector('[data-testid="unsaved-changes-save"]'));
    expect(dialog()).toBeNull();
    expect(path()).toBe('/machine');
    expect(batch()!.value).toBe('520');
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('save-failed');
  });

  it('the ☰ drawer asks too', async () => {
    await edit('520');
    await click(host.querySelector('[data-testid="app-nav-trigger"]'));
    await click(document.querySelector('[data-testid="app-nav-item-recipes"]'));
    expect(dialog()).not.toBeNull();
    expect(path()).toBe('/machine');
    await click(document.querySelector('[data-testid="unsaved-changes-discard"]'));
    expect(path()).toBe('/recipes?tab=mine');
  });

  it('HOME | PRO asks too, and switches after the answer', async () => {
    await edit('520');
    await click(host.querySelector('[data-testid="home-pro-switch-home"]'));
    expect(dialog()).not.toBeNull();
    expect(path()).toBe('/machine');
    await click(document.querySelector('[data-testid="unsaved-changes-stay"]'));
    expect(path()).toBe('/machine');
    await click(host.querySelector('[data-testid="home-pro-switch-home"]'));
    await click(document.querySelector('[data-testid="unsaved-changes-discard"]'));
    expect(path()).toBe('/home');
  });

  it('arms beforeunload only while something is unsaved', async () => {
    const unload = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(unload()).toBe(false);
    await edit('520');
    expect(unload()).toBe(true);
    await edit('450');
    expect(unload()).toBe(false);
  });
});
