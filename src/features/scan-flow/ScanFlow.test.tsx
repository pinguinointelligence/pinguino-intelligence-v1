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
  const registry = new Map<string, unknown>();
  const p = fakes.ports({
    discovery,
    external: { research: async (identity) => registry.get(identity.canonicalGtin13) ?? null },
    externalTimeoutMs: 200,
  });
  (globalThis as Record<string, unknown>)['__scanFlowFakes'] = { discovery, registry };
  (globalThis as Record<string, unknown>)['__scanFlowPorts'] = p;
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
  (globalThis as Record<string, unknown>)['__scanFlowFakes'] as {
    discovery: FakeDiscovery;
    registry: Map<string, unknown>;
  };

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
    expect(text()).toContain('Zrób zdjęcia etykiety');
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
    expect(text()).toContain('Uzupełnij dane z etykiety');
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

  it('owner case: an unknown code the registry identifies is saved without a label or a category question', async () => {
    const { discovery, registry } = fakes();
    const MILKA = '7622210669315';
    registry.set(MILKA, {
      provider: 'openfoodfacts',
      queriedAt: 1,
      query: MILKA,
      confidence: 0.9,
      facts: [
        {
          field: 'identity.displayName',
          value: 'Choco brownie',
          sourceUrl: 'u',
          authority: 'barcode_registry',
        },
        { field: 'identity.brand', value: 'Milka', sourceUrl: 'u', authority: 'barcode_registry' },
        {
          field: 'identity.quantity',
          value: '150 g',
          sourceUrl: 'u',
          authority: 'barcode_registry',
        },
        {
          field: 'category.tags',
          value: 'en:snacks;en:cakes;en:brownies',
          sourceUrl: 'u',
          authority: 'barcode_registry',
        },
        {
          field: 'ingredientsText',
          value: 'Azúcar, HUEVO, harina de TRIGO',
          sourceUrl: 'u',
          authority: 'barcode_registry',
        },
        {
          field: 'nutrition.energyKcal',
          value: '467.5',
          sourceUrl: 'u',
          authority: 'barcode_registry',
        },
        { field: 'nutrition.fat', value: '27', sourceUrl: 'u', authority: 'barcode_registry' },
      ],
    });
    discovery.authorityEngineUsable.set(`CA-${MILKA}`, true);
    const onResolved = vi.fn();
    await act(async () => {
      root.render(
        <ScanFlow mode="recipe" onResolved={onResolved} resolveLabel="Dodaj do receptury" />,
      );
    });
    await typeCode(MILKA);
    await flush();
    expect(text()).toContain('Rozpoznano po kodzie');
    expect(text()).toContain('Choco brownie');
    expect(text()).toContain('Milka');
    expect(text()).not.toContain('Co to za produkt?');
    expect(text()).not.toContain('Zrób zdjęcie etykiety ze składem');
    expect(text()).toContain('Zapisano jako Twój produkt');
    expect(discovery.calls.filter((c) => c.startsWith(`analyze:${MILKA}`))).toHaveLength(0);
    expect(discovery.created.get(MILKA)).toMatchObject({ productId: `CA-${MILKA}` });
    await act(async () => {
      button('Dodaj do receptury')!.click();
    });
    expect(onResolved.mock.calls[0]![0]).toMatchObject({ id: `CA-${MILKA}`, barcode: MILKA });
  });

  it('owner case 7340222800464: Vitamin Well Sport 002 is identified and saved as a beverage, no question', async () => {
    const { registry } = fakes();
    const VW = '7340222800464';
    registry.set(VW, {
      provider: 'openfoodfacts',
      queriedAt: 1,
      query: VW,
      confidence: 0.9,
      facts: [
        {
          field: 'identity.displayName',
          value: 'Sport 002',
          sourceUrl: 'u',
          authority: 'barcode_registry',
        },
        {
          field: 'identity.brand',
          value: 'Vitamin Well',
          sourceUrl: 'u',
          authority: 'barcode_registry',
        },
        {
          field: 'identity.servingSize',
          value: '1 bottle (500 ml)',
          sourceUrl: 'u',
          authority: 'barcode_registry',
        },
        {
          field: 'nutrition.energyKcal',
          value: '1.2',
          sourceUrl: 'u',
          authority: 'barcode_registry',
        },
        {
          field: 'ingredientsText',
          value: 'water, minerals',
          sourceUrl: 'u',
          authority: 'barcode_registry',
        },
      ],
    });
    await act(async () => {
      root.render(<ScanFlow mode="catalog" />);
    });
    await typeCode(VW);
    await flush();
    expect(text()).toContain('Rozpoznano po kodzie');
    expect(text()).toContain('Sport 002');
    expect(text()).toContain('Vitamin Well');
    expect(text()).not.toContain('Co to za produkt?');
    // the fake authority did not mark it engine-usable: kept privately, honest about recipe readiness
    expect(text()).toContain('Produkt zapisany prywatnie');
    expect(text()).toContain('wymaga jeszcze weryfikacji');
  });

  it('a registry identity whose family nobody can tell asks it once, with the product name shown', async () => {
    const { registry } = fakes();
    const CODE = '5449000000996';
    registry.set(CODE, {
      provider: 'openfoodfacts',
      queriedAt: 1,
      query: CODE,
      confidence: 0.9,
      facts: [
        {
          field: 'identity.displayName',
          value: 'Mystery 002',
          sourceUrl: 'u',
          authority: 'barcode_registry',
        },
        { field: 'identity.brand', value: 'Acme', sourceUrl: 'u', authority: 'barcode_registry' },
        {
          field: 'nutrition.energyKcal',
          value: '10',
          sourceUrl: 'u',
          authority: 'barcode_registry',
        },
        {
          field: 'ingredientsText',
          value: 'something',
          sourceUrl: 'u',
          authority: 'barcode_registry',
        },
      ],
    });
    await act(async () => {
      root.render(<ScanFlow mode="catalog" />);
    });
    await typeCode(CODE);
    await flush();
    expect(text()).toContain('Co to za produkt? (Mystery 002)');
    await act(async () => {
      button('Inne')!.click();
    });
    await flush();
    expect(text()).toContain('Produkt zapisany prywatnie');
  });

  it('the family question is never asked twice: an answer the authority cannot map leads to the private save', async () => {
    const { registry, discovery } = fakes();
    discovery.unmappableFamilies.add('other');
    const CODE = '5901111222235'; // fresh valid EAN-13 (no other journey marks it engine-usable)
    registry.set(CODE, {
      provider: 'openfoodfacts',
      queriedAt: 1,
      query: CODE,
      confidence: 0.9,
      facts: [
        {
          field: 'identity.displayName',
          value: 'Mystery 003',
          sourceUrl: 'u',
          authority: 'barcode_registry',
        },
        { field: 'identity.brand', value: 'Acme', sourceUrl: 'u', authority: 'barcode_registry' },
        {
          field: 'nutrition.energyKcal',
          value: '10',
          sourceUrl: 'u',
          authority: 'barcode_registry',
        },
        {
          field: 'ingredientsText',
          value: 'something',
          sourceUrl: 'u',
          authority: 'barcode_registry',
        },
      ],
    });
    await act(async () => {
      root.render(<ScanFlow mode="catalog" />);
    });
    await typeCode(CODE);
    await flush();
    expect(text()).toContain('Co to za produkt? (Mystery 003)');
    await act(async () => {
      button('Inne')!.click();
    });
    await flush();
    // asked again by the authority → the flow does NOT show the question again
    expect(text()).not.toContain('Co to za produkt?');
    expect(text()).toContain('Mystery 003');
    const save = button('Zapisz prywatnie') ?? button('Zapisz jako mój produkt');
    expect(save, text().slice(0, 400)).not.toBeNull();
    const before = text();
    await act(async () => {
      save!.click();
    });
    await flush();
    expect(text(), before.slice(0, 300)).toContain('Produkt zapisany prywatnie');
  });

  it('owner contract: a not-ready exact product is saved privately, never lost to a category or a photo loop', async () => {
    const { discovery, registry } = fakes();
    const CODE = '8411902004089'; // Cabreiroá — registry knows name + brand, nothing else
    registry.set(CODE, {
      provider: 'openfoodfacts',
      queriedAt: 1,
      query: CODE,
      confidence: 0.9,
      facts: [
        {
          field: 'identity.displayName',
          value: 'Agua mineral natural',
          sourceUrl: 'u',
          authority: 'barcode_registry',
        },
        {
          field: 'identity.brand',
          value: 'Cabreiroá',
          sourceUrl: 'u',
          authority: 'barcode_registry',
        },
        {
          field: 'identity.quantity',
          value: '50 cl',
          sourceUrl: 'u',
          authority: 'barcode_registry',
        },
      ],
    });
    await act(async () => {
      root.render(<ScanFlow mode="catalog" />);
    });
    await typeCode(CODE);
    await flush();
    // identified; the authority still misses label facts → the label step, with the private save offered
    expect(text()).toContain('Rozpoznano po kodzie');
    expect(text()).toContain('Cabreiroá');
    expect(text()).not.toContain('Co to za produkt?');
    expect(text()).not.toMatch(/MISSING_|_REQUIRED|_UNRESOLVED|roleReadiness|BASE_ONLY/);
    const save = host.querySelector<HTMLButtonElement>('[data-testid="scan-flow-save-private"]');
    expect(save).not.toBeNull();
    await act(async () => {
      save!.click();
    });
    await flush();
    expect(text()).toContain('Produkt zapisany prywatnie');
    expect(text()).toContain('wymaga jeszcze weryfikacji');
    expect(discovery.created.get(CODE)).toMatchObject({ engineUsable: false });
    expect(button('Dodaj do receptury')).toBeNull(); // catalogue mode; and never recipe-eligible
  });

  it('multi-photo: the second photo failing keeps the first one and can be retried alone', async () => {
    const { discovery } = fakes();
    const CODE = '3017620422003'; // a fresh valid EAN-13 (its fake session starts empty)
    discovery.provider.set(CODE, {
      displayName: 'Stabilo Test Pen',
      brand: 'Stabilo',
      sourceType: 'manufacturer',
    });
    discovery.label.set(CODE, { energyKcal: 300 });
    await act(async () => {
      root.render(<ScanFlow mode="catalog" />);
    });
    await typeCode(CODE);
    const sendPhoto = async () => {
      const capture = host.querySelector<HTMLInputElement>('input[type="file"][capture]')!;
      const file = new File([new Uint8Array([1, 2, 3])], 'label.jpg', { type: 'image/jpeg' });
      Object.defineProperty(capture, 'files', { value: [file], configurable: true });
      await act(async () => {
        capture.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await flush();
      await flush();
    };
    await sendPhoto(); // photo 1 → read → authority asks the family
    expect(text()).toContain('Co to za produkt?');
    await act(async () => {
      button('Inne')!.click();
    });
    await flush();
    // ingredients still missing → plain field, with the photo list still showing photo 1 as read
    expect(text()).toContain('Zdjęcie 1:');
    expect(text()).toContain('odczytane ✓');
    // photo 2 waits: later photographs go out together in the session's one remaining call
    await sendPhoto();
    expect(text()).toContain('Zdjęcie 2:');
    expect(text()).toContain('czeka');
    expect(text()).toContain('Odczytaj dodane zdjęcia (1)');
    discovery.failNextLabel = 'burst';
    await act(async () => {
      button('Odczytaj dodane zdjęcia (1)')!.click();
    });
    await flush();
    await flush();
    // the call fails (burst) — photo 1 untouched, identity kept, no generic error
    expect(text()).toContain('Za dużo analiz w krótkim czasie');
    expect(text()).toContain('odczytane ✓');
    expect(text()).not.toContain('Coś poszło nie tak');
    expect(text()).toContain('Stabilo Test Pen');
    await act(async () => {
      button('Ponów to zdjęcie')!.click();
    });
    await flush();
    await flush();
    expect(text()).not.toContain('Za dużo analiz w krótkim czasie');
    expect(text().match(/odczytane ✓/g)?.length).toBe(2);
    expect(
      discovery.calls.filter((c) => c.startsWith(`analyze:${CODE}:`)).length,
    ).toBeGreaterThanOrEqual(3);
    // the authority's two analyses are used up: a third photograph is refused honestly, without a call
    const callsBefore = discovery.calls.length;
    await sendPhoto();
    expect(text()).toContain('Zdjęcie 3:');
    expect(text()).toContain('Limit odczytów zdjęć dla tego skanu');
    expect(discovery.calls.length).toBe(callsBefore);
  });

  it('a lookup failure keeps the decoded code and retries the lookup, not the scan', async () => {
    await act(async () => {
      root.render(<ScanFlow mode="catalog" />);
    });
    const p = (globalThis as Record<string, unknown>)['__scanFlowPorts'] as ReturnType<
      typeof import('@/scan-import-v2/__tests__/fakes').ports
    >;
    const original = p.catalog.exactByKeys.bind(p.catalog);
    let failures = 1;
    p.catalog.exactByKeys = async (keys, ctx) => {
      if (failures > 0) {
        failures -= 1;
        throw new Error('connection reset');
      }
      return original(keys, ctx);
    };
    await typeCode('8402001047251');
    expect(text()).toContain('Kod został zachowany');
    expect(text()).toContain('8402001047251');
    await act(async () => {
      button('Spróbuj ponownie')!.click();
    });
    await flush();
    expect(text()).toContain('nie tworzymy duplikatu');
    expect(text()).toContain('Hacendado');
    p.catalog.exactByKeys = original;
  });
});
