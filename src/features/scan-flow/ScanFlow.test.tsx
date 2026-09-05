// @vitest-environment jsdom
/**
 * The shared scan flow as the customer experiences it, over the SAME fake ports that proved
 * Scan Import 2.0: known product → the exact product is handed to the recipe; unknown product →
 * internet evidence → label photograph → the authority names the plain facts still missing → the
 * customer types them → a private local product is created → it can go into the recipe; catalogue
 * mode shows a known product as already existing.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FakeDiscovery } from '@/scan-import-v2/__tests__/fakeDiscovery';

vi.mock('@/services/scanImportV2', async () => {
  const fakes = await import('@/scan-import-v2/__tests__/fakes');
  const { FakeDiscovery } = await import('@/scan-import-v2/__tests__/fakeDiscovery');
  const discovery = new FakeDiscovery();
  const p = fakes.ports({ discovery });
  (globalThis as Record<string, unknown>)['__scanFlowFakes'] = { discovery };
  return {
    createScanImportV2AppPorts: () => p,
    getScanImportV2AccountId: async () => 'user-1',
  };
});
vi.mock('./scanCoreCapture', () => ({
  ScanCoreCapture: { supported: () => false },
  describeCaptureError: () => 'no camera',
}));

import { ScanFlow } from './ScanFlow';

const fakes = () =>
  (globalThis as Record<string, unknown>)['__scanFlowFakes'] as { discovery: FakeDiscovery };

const UNKNOWN = '4006381333931'; // valid EAN-13, absent from the fake catalogue

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(proto.prototype, 'value')!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('ScanFlow (jsdom, fake ports)', () => {
  let host: HTMLDivElement;
  let root: Root;
  const text = () => host.textContent ?? '';
  const button = (label: string) =>
    [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === label) ?? null;
  const typeCode = async (code: string) => {
    const input = host.querySelector<HTMLInputElement>(
      'input[aria-label="Kod kreskowy z opakowania"]',
    )!;
    await act(async () => setValue(input, code));
    await act(async () => {
      button('Sprawdź')!.click();
    });
    await flush();
  };

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it('recipe mode: a known code hands the exact product to the recipe', async () => {
    const onResolved = vi.fn();
    await act(async () => {
      root.render(
        <ScanFlow mode="recipe" onResolved={onResolved} resolveLabel="Dodaj do receptury" />,
      );
    });
    expect(text()).toContain('Wpisz kod z opakowania');
    await typeCode('8402001047251');
    expect(text()).toContain('Znaleziono produkt');
    expect(text()).toContain('Hacendado');
    await act(async () => {
      button('Dodaj do receptury')!.click();
    });
    expect(onResolved).toHaveBeenCalledTimes(1);
    expect(onResolved.mock.calls[0]![0]).toMatchObject({
      barcode: '8402001047251',
      engineReady: true,
      entityKind: 'commercial_product',
    });
    expect(text()).not.toMatch(/\b(PAC|POD|NPAC|Mapper|ProductBehavior)\b/);
  });

  it('catalogue mode: a known code is shown as already existing, never duplicated', async () => {
    await act(async () => {
      root.render(<ScanFlow mode="catalog" />);
    });
    await typeCode('8402001047251');
    expect(text()).toContain('nie tworzymy duplikatu');
    expect(button('Dodaj do receptury')).toBeNull();
  });

  it('recipe mode: unknown → internet → label → plain fields → private product → recipe', async () => {
    const { discovery } = fakes();
    discovery.provider.set(UNKNOWN, {
      displayName: 'Stabilo Test Pen',
      brand: 'Stabilo',
      sourceType: 'manufacturer',
    });
    discovery.label.set(UNKNOWN, { energyKcal: 300 }); // the label gives energy but no ingredients
    discovery.authorityEngineUsable.set(`CA-${UNKNOWN}`, true);
    const onResolved = vi.fn();
    await act(async () => {
      root.render(
        <ScanFlow mode="recipe" onResolved={onResolved} resolveLabel="Dodaj do receptury" />,
      );
    });
    await typeCode(UNKNOWN);
    // internet evidence collected, the label is still needed
    expect(text()).toContain('Zrób zdjęcie etykiety');
    expect(discovery.calls).toContain(`research:${UNKNOWN}`);
    // label photograph
    const capture = host.querySelector<HTMLInputElement>('input[type="file"][capture]')!;
    const file = new File([new Uint8Array([1, 2, 3])], 'label.jpg', { type: 'image/jpeg' });
    Object.defineProperty(capture, 'files', { value: [file] });
    await act(async () => {
      capture.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();
    await flush();
    expect(discovery.calls, text()).toContain(`analyze:${UNKNOWN}:1`);
    // the authority asked for the product family first
    expect(text()).toContain('Co to za produkt?');
    await act(async () => {
      button('Inne')!.click();
    });
    await flush();
    // still missing: only the plain field the label did not give (ingredients)
    expect(text()).toContain('Uzupełnij brakujące dane z etykiety');
    expect(text()).toContain('Skład (z etykiety)');
    expect(text()).not.toContain('Energia'); // the label already gave it
    expect(text()).not.toMatch(/\b(PAC|POD|NPAC|Mapper|ProductBehavior)\b/);
    const ingredients = host.querySelector<HTMLTextAreaElement>('textarea')!;
    await act(async () => setValue(ingredients, 'cukier, mąka pszenna, olej'));
    await act(async () => {
      button('Zapisz jako mój produkt')!.click();
    });
    await flush();
    // saved as the customer's private product, then handed to the recipe
    expect(text()).toContain('Zapisano jako Twój produkt');
    expect(discovery.created.get(UNKNOWN)).toMatchObject({ productId: `CA-${UNKNOWN}` });
    await act(async () => {
      button('Dodaj do receptury')!.click();
    });
    expect(onResolved).toHaveBeenCalledTimes(1);
    expect(onResolved.mock.calls[0]![0]).toMatchObject({
      id: `CA-${UNKNOWN}`,
      barcode: UNKNOWN,
      engineReady: true,
    });
  });
});
