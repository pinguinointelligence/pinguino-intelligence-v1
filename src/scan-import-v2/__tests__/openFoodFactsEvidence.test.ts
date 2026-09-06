/**
 * Exact-GTIN registry evidence — the three owner QA codes (2026-09-05), replayed from the registry's
 * own answers (fixtures recorded from the public API), plus the failure modes.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  createOpenFoodFactsEvidencePort,
  evidenceFromProduct,
  familyFromEvidence,
  identityFromEvidence,
} from '../adapters/openFoodFactsEvidence';
import { identifyCode } from '../codeIdentity';
import { ctx } from './fakes';
import { scan } from './codeIdentity.test';

const VITAMIN_WELL = {
  code: '7340222800464',
  product_name: 'Sport 002',
  brands: 'Vitamin Well',
  serving_size: '1 bottle (500 ml)',
  categories_tags: [],
  nutriments: {
    'energy-kcal_100g': 1.2,
    fat_100g: 0,
    carbohydrates_100g: 0,
    sugars_100g: 0,
    proteins_100g: 0,
    salt_100g: 0.1175,
  },
};
const MILKA = {
  code: '7622210669315',
  product_name: 'Choco brownie',
  brands: 'Milka',
  quantity: '150 g (6 * 25 g)',
  product_quantity_unit: 'g',
  categories_tags: [
    'en:snacks',
    'en:sweet-snacks',
    'en:biscuits-and-cakes',
    'en:cakes',
    'en:brownies',
  ],
  pnns_groups_2: 'Biscuits and cakes',
  ingredients_text_es: 'Azúcar, HUEVO, grasa de palma, harina de TRIGO, pasta de cacao',
  allergens_tags: ['en:eggs', 'en:gluten', 'en:milk', 'en:soybeans'],
  nutriments: {
    'energy-kcal_100g': 467.5,
    fat_100g: 27,
    'saturated-fat_100g': 12,
    carbohydrates_100g: 50,
    sugars_100g: 38,
    proteins_100g: 5,
    salt_100g: 0.3725,
    fiber_100g: 1.7,
  },
};
const CACAO = {
  code: '8410109121551',
  product_name: 'Cacao puro desgrasado en polvo',
  brands: 'la chocolatera',
  quantity: '265 g',
  categories_tags: [
    'en:cocoa-and-its-products',
    'en:cocoa-and-chocolate-powders',
    'en:cocoa-powders',
  ],
  nutriments: {
    'energy-kcal_100g': 375,
    fat_100g: 16,
    carbohydrates_100g: 16.3,
    proteins_100g: 25.5,
    salt_100g: 0.03,
  },
};

const fetchFor = (records: Record<string, unknown>, status = 200) =>
  vi.fn(async (url: string) => {
    const code = /product\/(\d+)\.json/.exec(url)?.[1] ?? '';
    const product = records[code];
    if (!product) return { ok: false, status: 404, json: async () => ({ status: 0 }) } as Response;
    return {
      ok: status === 200,
      status,
      json: async () => ({ status: 1, code, product }),
    } as Response;
  }) as unknown as typeof fetch;

const identity = (code: string, symbology: 'EAN-13' | 'UPC-A' = 'EAN-13') => {
  const r = identifyCode(scan(code, symbology));
  if (!r.ok) throw new Error('fixture code invalid');
  return r.identity;
};

describe('exact-GTIN registry evidence', () => {
  it('queries by the canonical code only and returns verbatim facts with their source', async () => {
    const fetchImpl = fetchFor({ '7622210669315': MILKA });
    const port = createOpenFoodFactsEvidencePort({ fetchImpl });
    const ev = await port.research(identity('7622210669315'), ctx({ now: 5 }));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(
      String((fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]![0]),
    ).toMatch(/\/api\/v2\/product\/7622210669315\.json\?fields=/);
    const facts = Object.fromEntries(
      (ev as { facts: { field: string; value: string }[] }).facts.map((f) => [f.field, f.value]),
    );
    expect(facts['identity.displayName']).toBe('Choco brownie');
    expect(facts['identity.brand']).toBe('Milka');
    expect(facts['identity.quantity']).toBe('150 g (6 * 25 g)');
    expect(facts['nutrition.energyKcal']).toBe('467.5');
    expect(facts['allergensText']).toBe('eggs, gluten, milk, soybeans');
    expect((ev as { facts: { sourceUrl: string }[] }).facts[0]!.sourceUrl).toBe(
      'https://world.openfoodfacts.org/product/7622210669315',
    );
    expect((ev as { confidence: number }).confidence).toBe(0.9);
  });

  it('an unknown code is no evidence (null), a broken registry is an error the pipeline classifies', async () => {
    const port = createOpenFoodFactsEvidencePort({ fetchImpl: fetchFor({}) });
    expect(await port.research(identity('4006381333931'), ctx())).toBeNull();
    const broken = createOpenFoodFactsEvidencePort({
      fetchImpl: fetchFor({ '4006381333931': MILKA }, 503),
    });
    await expect(broken.research(identity('4006381333931'), ctx())).rejects.toThrow(
      /openfoodfacts_http_503/,
    );
  });

  it('owner case 7340222800464 → Vitamin Well Sport 002, a beverage, identified without asking', () => {
    const ev = evidenceFromProduct(VITAMIN_WELL, '7340222800464', 1, 'u');
    const web = identityFromEvidence(ev)!;
    expect(web.displayName).toBe('Sport 002');
    expect(web.brand).toBe('Vitamin Well');
    expect(web.family).toBe('beverage');
    expect(web.productFields).toMatchObject({
      identity: { displayName: 'Sport 002', brand: 'Vitamin Well' },
      nutrition: { energyKcal: 1.2, fat: 0, basis: 'per_100g' },
    });
  });

  it('owner case 7622210669315 → Milka Choco brownie with label facts prefilled from the registry', () => {
    const web = identityFromEvidence(evidenceFromProduct(MILKA, '7622210669315', 1, 'u'))!;
    expect(web.displayName).toBe('Choco brownie');
    expect(web.brand).toBe('Milka');
    expect(web.family).toBe('other'); // a cake is not one of the ice-cream families
    expect(web.hasNutrition).toBe(true);
    expect(web.hasIngredients).toBe(true);
    expect(web.productFields).toMatchObject({
      ingredientsText: MILKA.ingredients_text_es,
      allergensText: 'eggs, gluten, milk, soybeans',
      nutrition: {
        energyKcal: 467.5,
        fat: 27,
        saturatedFat: 12,
        carbohydrate: 50,
        sugars: 38,
        protein: 5,
        salt: 0.3725,
        fibre: 1.7,
        basis: 'per_100g',
      },
    });
  });

  it('owner control 8410109121551 → cocoa family (used only if the catalogue did not know it)', () => {
    expect(familyFromEvidence(evidenceFromProduct(CACAO, '8410109121551', 1, 'u'))).toBe(
      'cocoa_chocolate',
    );
  });

  it('no name → no identity; categories decide the family before units and names do', () => {
    expect(identityFromEvidence(evidenceFromProduct({ brands: 'X' }, '1', 1, 'u'))).toBeNull();
    expect(identityFromEvidence(null)).toBeNull();
    expect(
      familyFromEvidence(
        evidenceFromProduct({ product_name: 'Milk', categories_tags: ['en:dairies'] }, '1', 1, 'u'),
      ),
    ).toBe('dairy');
    expect(
      familyFromEvidence(
        evidenceFromProduct({ product_name: 'Cola', quantity: '330 ml' }, '1', 1, 'u'),
      ),
    ).toBe('beverage');
    expect(
      familyFromEvidence(evidenceFromProduct({ product_name: 'Mystery' }, '1', 1, 'u')),
    ).toBeNull();
  });
});
