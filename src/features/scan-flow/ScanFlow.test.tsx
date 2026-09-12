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

function touch(el: HTMLElement, type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel') {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const point = { clientX: 24, clientY: type === 'touchmove' ? 80 : 24, identifier: 1 };
  Object.defineProperty(
    event,
    type === 'touchend' || type === 'touchcancel' ? 'changedTouches' : 'touches',
    {
      value: [point],
    },
  );
  el.dispatchEvent(event);
}

function mobileTap(el: HTMLElement) {
  touch(el, 'touchstart');
  touch(el, 'touchend');
  // A real browser synthesizes click only after a completed stationary touch gesture.
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
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
  /**
   * A recipe entry asks exactly one question before an unknown product is created (owner,
   * 2026-09-06). Answering "Tak" continues THE SAME scan — no second camera run, no second research.
   */
  const answerAddYes = async () => {
    expect(text()).toContain('Nie mamy jeszcze tego produktu. Czy chcesz go dodać?');
    await act(async () => {
      button('Tak')!.click();
    });
    await flush();
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
    discovery.authorityEngineUsable.set(UNKNOWN, true);
    discovery.confidence.set(UNKNOWN, 85); // ready, but not above the shared-PR threshold
    const onResolved = vi.fn();
    await act(async () => {
      root.render(
        <ScanFlow mode="recipe" onResolved={onResolved} resolveLabel="Dodaj do receptury" />,
      );
    });
    await typeCode(UNKNOWN);
    await answerAddYes();
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
    expect(discovery.created.get(UNKNOWN)).toMatchObject({
      productId: `PM-${UNKNOWN}`,
      route: 'PM_READY',
    });
    await act(async () => {
      button('Dodaj do receptury')!.click();
    });
    expect(onResolved).toHaveBeenCalledTimes(1);
    expect(onResolved.mock.calls[0]![0]).toMatchObject({
      id: `PM-${UNKNOWN}`,
      barcode: UNKNOWN,
      engineReady: true,
    });
  });

  it('SCN-REAL-A: complete internet facts + accepted Rescue finish without photo', async () => {
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
    discovery.authorityEngineUsable.set(MILKA, true);
    const onResolved = vi.fn();
    await act(async () => {
      root.render(
        <ScanFlow mode="recipe" onResolved={onResolved} resolveLabel="Dodaj do receptury" />,
      );
    });
    await typeCode(MILKA);
    await answerAddYes();
    await flush();
    expect(text()).toContain('Rozpoznano po kodzie');
    expect(text()).toContain('Choco brownie');
    expect(text()).toContain('Milka');
    expect(text()).not.toContain('Co to za produkt?');
    expect(text()).not.toContain('Zrób zdjęcie etykiety ze składem');
    expect(text()).toContain('Zapisano w katalogu produktów');
    expect(text()).not.toContain('widoczny tylko na Twoim koncie');
    expect(discovery.calls.filter((c) => c.startsWith(`analyze:${MILKA}`))).toHaveLength(0);
    expect(discovery.created.get(MILKA)).toMatchObject({
      productId: `PR-${MILKA}`,
      route: 'PR',
    });
    await act(async () => {
      button('Dodaj do receptury')!.click();
    });
    expect(onResolved.mock.calls[0]![0]).toMatchObject({ id: `PR-${MILKA}`, barcode: MILKA });
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
    expect(text()).toContain('Zapisano jako Twój produkt');
  });

  it('SCN-REAL-B / SOL-052: a real missing label fact requests only that photo evidence', async () => {
    const { discovery, registry } = fakes();
    const code = '7350042718481';
    const finalizeCount = discovery.finalizeInputs.length;
    registry.set(code, {
      provider: 'openfoodfacts',
      queriedAt: 1,
      query: code,
      confidence: 0.9,
      facts: [
        {
          field: 'identity.displayName',
          value: 'Vitamin well',
          sourceUrl: `https://world.openfoodfacts.org/product/${code}`,
          authority: 'barcode_registry',
        },
        {
          field: 'identity.brand',
          value: 'Vitamin Well AB',
          sourceUrl: `https://world.openfoodfacts.org/product/${code}`,
          authority: 'barcode_registry',
        },
        {
          field: 'nutrition.energyKcal',
          value: '17',
          sourceUrl: `https://world.openfoodfacts.org/product/${code}`,
          authority: 'barcode_registry',
        },
        {
          field: 'category.tags',
          value: 'en:beverages',
          sourceUrl: `https://world.openfoodfacts.org/product/${code}`,
          authority: 'barcode_registry',
        },
      ],
    });
    await act(async () => {
      root.render(<ScanFlow mode="catalog" />);
    });
    await typeCode(code);
    await flush();
    expect(text()).toContain('Brakuje składu. Zrób zdjęcie tej części etykiety.');
    expect(text()).not.toContain('Brakuje dokładnej nazwy wariantu');
    expect(text()).not.toContain('Nazwa produktu (z etykiety)');
    expect(text()).not.toContain('Energia (kcal)');
    expect(text()).not.toContain('Wartości podane na');
    expect(discovery.finalizeInputs).toHaveLength(finalizeCount + 1);
    expect(discovery.finalizeInputs.at(-1)).toMatchObject({
      customerFamily: 'beverage',
      automaticEvidence: {
        source: 'barcode_registry',
        exactGtin: code,
        productFields: {
          identity: { displayName: 'Vitamin well', brand: 'Vitamin Well AB' },
          nutrition: { energyKcal: 17 },
        },
      },
    });
    expect(discovery.finalizeInputs.at(-1)?.confirmations).toBeUndefined();
    expect(discovery.created.has(code)).toBe(false);
  });

  it('SCN-REAL-C/G: technical-only gaps skip photo, accept one exact answer, and resume', async () => {
    const { discovery, registry } = fakes();
    const code = '8480000510716';
    registry.set(code, {
      provider: 'openfoodfacts',
      queriedAt: 1,
      query: code,
      confidence: 0.9,
      facts: [
        {
          field: 'identity.displayName',
          value: 'Queso fresco batido desnatado',
          sourceUrl: `https://world.openfoodfacts.org/product/${code}`,
          authority: 'barcode_registry',
        },
        {
          field: 'identity.brand',
          value: 'Hacendado',
          sourceUrl: `https://world.openfoodfacts.org/product/${code}`,
          authority: 'barcode_registry',
        },
        {
          field: 'identity.quantity',
          value: '500 g',
          sourceUrl: `https://world.openfoodfacts.org/product/${code}`,
          authority: 'barcode_registry',
        },
        {
          field: 'category.tags',
          value: 'en:dairy;en:cheeses',
          sourceUrl: `https://world.openfoodfacts.org/product/${code}`,
          authority: 'barcode_registry',
        },
        {
          field: 'nutrition.basis',
          value: 'per_100g',
          sourceUrl: `https://world.openfoodfacts.org/product/${code}`,
          authority: 'barcode_registry',
        },
        {
          field: 'nutrition.energyKcal',
          value: '46',
          sourceUrl: `https://world.openfoodfacts.org/product/${code}`,
          authority: 'barcode_registry',
        },
        {
          field: 'ingredientsText',
          value: 'Leche desnatada pasteurizada y fermentos lácticos',
          sourceUrl: `https://world.openfoodfacts.org/product/${code}`,
          authority: 'barcode_registry',
        },
      ],
    });
    discovery.notReadyMissing.set(code, ['MISSING_TOTAL_SOLIDS_PERCENT', 'MISSING_WATER_PERCENT']);
    discovery.notReadyReasons.set(code, ['UNRESOLVED_SWEETENING_FREEZING_PATH']);
    discovery.authorityEngineUsable.set(code, true);
    discovery.confidence.set(code, 90);

    await act(async () => root.render(<ScanFlow mode="catalog" />));
    await typeCode(code);
    await flush();

    expect(text()).toContain('Queso fresco batido desnatado');
    expect(text()).toContain('Nie udało nam się potwierdzić tej wartości');
    expect(text()).toContain('Sucha masa produktu');
    expect(text()).not.toContain('Zrób zdjęcie etykiety');
    expect(host.querySelectorAll('input[type="file"]')).toHaveLength(0);

    const answer = host.querySelector<HTMLInputElement>('input[inputmode="decimal"]')!;
    await act(async () => setValue(answer, '12,4'));
    await act(async () => button('Zapisz jako mój produkt')!.click());
    await flush();

    const last = discovery.finalizeInputs.at(-1);
    expect(last?.confirmations).toMatchObject({
      evidenceOrigin: 'customer_action',
      productFields: { productionDeclarations: { totalSolidsPercent: 12.4 } },
    });
    expect(text()).toContain('Zapisano');
    expect(discovery.created.get(code)?.productionReady).toBe(true);
    expect(discovery.calls.filter((call) => call.startsWith(`analyze:${code}`))).toHaveLength(0);
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
    expect(text()).toContain('Zapisano jako Twój produkt');
  });

  it('SCN-MOBILE-FAMILY-01: Hanuta exact product category touch persists once without scroll selection', async () => {
    const { discovery, registry } = fakes();
    const code = '8000500272480';
    registry.set(code, {
      provider: 'openfoodfacts',
      queriedAt: 1,
      query: code,
      confidence: 0.9,
      facts: [
        {
          field: 'identity.displayName',
          value: 'Hanuta Minis',
          sourceUrl: 'u',
          authority: 'barcode_registry',
        },
        {
          field: 'identity.brand',
          value: 'Ferrero Hanuta',
          sourceUrl: 'u',
          authority: 'barcode_registry',
        },
        {
          field: 'identity.quantity',
          value: '242 g',
          sourceUrl: 'u',
          authority: 'barcode_registry',
        },
        {
          field: 'nutrition.energyKcal',
          value: '542',
          sourceUrl: 'u',
          authority: 'barcode_registry',
        },
        {
          field: 'ingredientsText',
          value: 'hazelnuts, cocoa, wafer',
          sourceUrl: 'u',
          authority: 'barcode_registry',
        },
      ],
    });
    const originalFinalize = discovery.finalize.bind(discovery);
    let releaseSelectedFinalize!: () => void;
    const selectedFinalizeGate = new Promise<void>((resolve) => {
      releaseSelectedFinalize = resolve;
    });
    const finalizeSpy = vi
      .spyOn(discovery, 'finalize')
      .mockImplementation(async (session, input, ctx, saveUnverified) => {
        if (input.customerFamily === 'nut_paste') await selectedFinalizeGate;
        return originalFinalize(session, input, ctx, saveUnverified);
      });

    await act(async () => root.render(<ScanFlow mode="catalog" />));
    await typeCode(code);
    await flush();

    const option = button('Orzechy / pasty')!;
    const callsBeforeGesture = finalizeSpy.mock.calls.length;
    await act(async () => {
      touch(option, 'touchstart');
      touch(option, 'touchmove');
      touch(option, 'touchcancel');
    });
    expect(option.getAttribute('aria-pressed')).toBe('false');
    expect(finalizeSpy).toHaveBeenCalledTimes(callsBeforeGesture);

    await act(async () => {
      mobileTap(option);
      mobileTap(option);
      await Promise.resolve();
    });

    expect(option.getAttribute('aria-pressed')).toBe('true');
    expect(option.className).toContain('bg-ink');
    expect(
      finalizeSpy.mock.calls.filter(([, input]) => input.customerFamily === 'nut_paste'),
    ).toHaveLength(1);

    releaseSelectedFinalize();
    await flush();
    expect(text()).toContain('Zapisano jako Twój produkt');
    expect(text()).not.toContain('Co to za produkt?');
    expect(discovery.finalizeInputs.at(-1)?.customerFamily).toBe('nut_paste');
  });
});
