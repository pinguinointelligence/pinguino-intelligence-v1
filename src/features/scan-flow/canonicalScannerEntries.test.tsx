// @vitest-environment jsdom
/**
 * ONE CANONICAL SCANNER — the owner's acceptance matrix (decision 2026-09-06, extended the same
 * day with the seventh entry).
 *
 * Seven ways in, one component, one pipeline. Only two things are allowed to differ: the
 * `entryContext` handed to the flow, and what "back" means when the customer is done.
 *
 *   1. HOME hamburger  → Dodaj produkt          add_product        never asks the add question
 *   2. PRO  hamburger  → Dodaj produkt          add_product        never asks the add question
 *   3. HOME receptura  → Dodaj składnik → Skanuj recipe_ingredient asks it, exactly once
 *   4. PRO  receptura  → Dodaj składnik → Skanuj recipe_ingredient asks it, exactly once
 *   5. HOME            → Dodaj topping → Skanuj  recipe_topping    asks it, exactly once
 *   6. PRO             → Dodaj topping → Skanuj  recipe_topping    asks it, exactly once
 *   7. demo, nobody signed in                    guest_demo        never asks; offers HOME / PRO
 *
 * The mounting itself is proved structurally in `scanFlow.boundary.test.ts` (including the fact
 * that exactly one file in the whole app opens a camera). What is proved HERE is the behaviour the
 * customer meets, over the same fake ports that proved Scan Import 2.0.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FakeDiscovery } from '@/scan-import-v2/__tests__/fakeDiscovery';

vi.mock('@/services/scanImportV2', async () => {
  const fakes = await import('@/scan-import-v2/__tests__/fakes');
  const { FakeDiscovery } = await import('@/scan-import-v2/__tests__/fakeDiscovery');
  const discovery = new FakeDiscovery();
  const registry = new Map<string, unknown>();
  const state = { accountId: 'user-1' as string | null, research: 0 };
  const p = fakes.ports({
    discovery,
    external: {
      research: async (identity) => {
        state.research += 1;
        return registry.get(identity.canonicalGtin13) ?? null;
      },
    },
    externalTimeoutMs: 200,
  });
  (globalThis as Record<string, unknown>)['__entryFakes'] = { discovery, registry, state };
  return {
    createScanImportV2AppPorts: () => p,
    getScanImportV2AccountId: async () => state.accountId,
  };
});
vi.mock('./scanCoreCapture', () => ({
  ScanCoreCapture: { supported: () => false },
  describeCaptureError: () => 'no camera',
}));

import { ScanFlow, entryContextOf, isRecipeEntry, type ScanEntryContext } from './ScanFlow';

const fakes = () =>
  (globalThis as Record<string, unknown>)['__entryFakes'] as {
    discovery: FakeDiscovery;
    registry: Map<string, unknown>;
    state: { accountId: string | null; research: number };
  };

const KNOWN = '8402001047251'; // Hacendado, in the fake catalogue
const UNKNOWN = '4006381333931'; // valid EAN-13, in nobody's catalogue

function setValue(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('the seven entries into the one Canonical Scanner', () => {
  let host: HTMLDivElement;
  let root: Root;
  const text = () => host.textContent ?? '';
  const testid = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const button = (label: string) =>
    [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === label) ?? null;

  const flush = async () => {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
  };
  const typeCode = async (code: string) => {
    const input = host.querySelector<HTMLInputElement>(
      'input[aria-label="Kod kreskowy z opakowania"]',
    )!;
    await act(async () => setValue(input, code));
    await act(async () => button('Sprawdź')!.click());
    await flush();
    await flush();
  };
  const mount = async (props: Parameters<typeof ScanFlow>[0]) => {
    await act(async () => {
      root.render(<ScanFlow {...props} />);
    });
  };

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    fakes().state.accountId = 'user-1';
    fakes().state.research = 0;
    // one FakeDiscovery serves the whole file, so each entry starts from a clean record
    fakes().discovery.calls.length = 0;
    fakes().discovery.sessions.clear();
    sessionStorage.clear();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it('every entry resolves to exactly one of the seven contexts', () => {
    expect(entryContextOf('catalog', undefined)).toBe('add_product');
    expect(entryContextOf('recipe', undefined)).toBe('recipe_ingredient');
    expect(entryContextOf('recipe', 'recipe_topping')).toBe('recipe_topping');
    expect(entryContextOf('catalog', 'guest_demo')).toBe('guest_demo');
    const asks: ScanEntryContext[] = ['recipe_ingredient', 'recipe_topping'];
    const silent: ScanEntryContext[] = ['add_product', 'guest_demo'];
    for (const e of asks) expect(isRecipeEntry(e)).toBe(true);
    for (const e of silent) expect(isRecipeEntry(e)).toBe(false);
  });

  // ---- 1 & 2: the hamburger ------------------------------------------------------------------

  it('„Dodaj produkt" never asks whether to add a product', async () => {
    await mount({ mode: 'catalog', entryContext: 'add_product' });
    await typeCode(UNKNOWN);
    expect(text()).not.toContain('Czy chcesz go dodać?');
    expect(testid('scan-flow-ask-add')).toBeNull();
    // it went straight on with the work the menu item already asked for
    expect(fakes().discovery.calls.some((c) => c.startsWith('research:'))).toBe(true);
  });

  // ---- 3 to 6: the recipe entries ------------------------------------------------------------

  for (const entry of ['recipe_ingredient', 'recipe_topping'] as const) {
    it(`a ${entry} entry asks the question in the owner's words, and "Nie" goes back`, async () => {
      const onReturn = vi.fn();
      const onResolved = vi.fn();
      await mount({ mode: 'recipe', entryContext: entry, onResolved, onReturn });
      await typeCode(UNKNOWN);
      expect(text()).toContain('Nie mamy jeszcze tego produktu. Czy chcesz go dodać?');
      expect(button('Tak')).not.toBeNull();
      expect(button('Nie')).not.toBeNull();
      await act(async () => testid('scan-flow-ask-add-no')!.click());
      // back to where they were adding from: no product created, nothing else happened
      expect(onReturn).toHaveBeenCalledTimes(1);
      expect(onResolved).not.toHaveBeenCalled();
    });
  }

  it('"Tak" continues THE SAME scan — same code, no second camera run, no second research', async () => {
    fakes().registry.set(UNKNOWN, {
      source: 'openfoodfacts',
      fetchedAt: new Date().toISOString(),
      gtin: UNKNOWN,
      name: 'Mleko testowe',
      brand: 'Test',
    });
    await mount({ mode: 'recipe', entryContext: 'recipe_ingredient', onResolved: vi.fn() });
    await typeCode(UNKNOWN);
    const researchBefore = fakes().state.research;
    expect(text()).toContain('Nie mamy jeszcze tego produktu. Czy chcesz go dodać?');
    await act(async () => testid('scan-flow-ask-add-yes')!.click());
    await flush();
    await flush();
    // the camera is never restarted: the typed-code form would be back if it were
    expect(text()).not.toContain('Wpisz kod z opakowania');
    // and the web was not asked a second time about the same product
    expect(fakes().state.research).toBe(researchBefore);
  });

  it('the question is asked once per scan, not once per answer', async () => {
    await mount({ mode: 'recipe', entryContext: 'recipe_ingredient', onResolved: vi.fn() });
    await typeCode(UNKNOWN);
    await act(async () => testid('scan-flow-ask-add-yes')!.click());
    await flush();
    await flush();
    expect(testid('scan-flow-ask-add')).toBeNull();
  });

  // ---- 7: the signed-out demo ----------------------------------------------------------------

  describe('a signed-out visitor in the demo', () => {
    beforeEach(() => {
      fakes().state.accountId = null;
    });

    it('recognises a product that exists and offers it to the demo recipe', async () => {
      const onResolved = vi.fn();
      await mount({
        mode: 'recipe',
        entryContext: 'guest_demo',
        onResolved,
        resolveLabel: 'Dodaj do receptury',
      });
      await typeCode(KNOWN);
      expect(text()).toContain('Hacendado');
      await act(async () => button('Dodaj do receptury')!.click());
      expect(onResolved).toHaveBeenCalledTimes(1);
      // the SAME catalogue identity every other entry hands over: no duplicate is created
      expect(onResolved.mock.calls[0]?.[0]).toMatchObject({ id: 'PR-HACENDADO' });
    });

    it('never writes anything for them — no product, no discovery session, no request', async () => {
      await mount({ mode: 'recipe', entryContext: 'guest_demo', onResolved: vi.fn() });
      await typeCode(KNOWN);
      expect(fakes().discovery.calls).toEqual([]);
      await act(async () => button('Skanuj kolejny')!.click());
      await typeCode(UNKNOWN);
      // the unknown half of the flow — session, analysis, finalize — is never reached
      expect(fakes().discovery.calls).toEqual([]);
      expect(fakes().discovery.sessions.size).toBe(0);
    });

    it('is never asked whether to add a product', async () => {
      await mount({ mode: 'recipe', entryContext: 'guest_demo', onResolved: vi.fn() });
      await typeCode(UNKNOWN);
      expect(text()).not.toContain('Czy chcesz go dodać?');
      expect(testid('scan-flow-ask-add')).toBeNull();
    });

    it('spends nothing on an unknown code: no research, no label analysis', async () => {
      await mount({ mode: 'recipe', entryContext: 'guest_demo', onResolved: vi.fn() });
      await typeCode(UNKNOWN);
      expect(fakes().state.research).toBe(0);
      expect(host.querySelector('input[type="file"]')).toBeNull();
    });

    it('sees exactly one marketing screen, in the owner’s words, with three ways on', async () => {
      const onChoosePlan = vi.fn();
      const onReturn = vi.fn();
      await mount({
        mode: 'recipe',
        entryContext: 'guest_demo',
        onResolved: vi.fn(),
        onChoosePlan,
        onReturn,
      });
      await typeCode(UNKNOWN);
      expect(testid('scan-flow-guest-offer')).not.toBeNull();
      expect(text()).toContain('Tego produktu jeszcze nie mamy.');
      expect(text()).toContain('W HOME lub PRO możesz dodać własny produkt jednym skanem.');
      await act(async () => testid('scan-flow-choose-home')!.click());
      expect(onChoosePlan).toHaveBeenCalledWith('home');
      await act(async () => testid('scan-flow-choose-pro')!.click());
      expect(onChoosePlan).toHaveBeenCalledWith('pro');
      await act(async () => testid('scan-flow-back-to-demo')!.click());
      expect(onReturn).toHaveBeenCalledTimes(1);
    });

    it('is told nothing technical — no missing fields, no readiness, no Product Registry', async () => {
      await mount({ mode: 'recipe', entryContext: 'guest_demo', onResolved: vi.fn() });
      await typeCode(UNKNOWN);
      const shown = text();
      for (const forbidden of [
        'Product Registry',
        'Registry',
        'readiness',
        'engineReady',
        'weryfikac',
        'Brakuje',
        'prywatn',
      ])
        expect(shown, forbidden).not.toContain(forbidden);
    });

    it('keeps only the code they read, so choosing a plan costs no second scan', async () => {
      await mount({ mode: 'recipe', entryContext: 'guest_demo', onResolved: vi.fn() });
      await typeCode(UNKNOWN);
      expect(sessionStorage.getItem('gellatti.scan.guestCode')).toBe(UNKNOWN);
      // the code, and nothing else: no photos, no evidence, no product
      expect(Object.keys(sessionStorage).length).toBe(1);
    });

    it('and the signed-in scanner picks that code up once, then forgets it', async () => {
      await mount({ mode: 'recipe', entryContext: 'guest_demo', onResolved: vi.fn() });
      await typeCode(UNKNOWN);
      await act(async () => root.unmount());

      fakes().state.accountId = 'user-1';
      root = createRoot(host);
      await mount({ mode: 'catalog', entryContext: 'add_product' });
      await flush();
      await flush();
      expect(sessionStorage.getItem('gellatti.scan.guestCode')).toBeNull();
      expect(text()).not.toContain('Wpisz kod z opakowania');
      // the same code went on, without the customer showing the box a second time
      expect(fakes().discovery.sessions.has(UNKNOWN)).toBe(true);
    });
  });
});
