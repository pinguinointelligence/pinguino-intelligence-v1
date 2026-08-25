/**
 * §37 — a scan that started in „Dodaj składnik" has to end in the recipe, without the
 * owner closing the scanner and typing the name of the product in their hand. What it
 * must NOT do is invent a door: the recipe accepts a current Mapper identity and
 * nothing else, and a scanned product goes through that same boundary.
 */
import { describe, expect, it } from 'vitest';
import type { CatalogProductSearchHit } from '@/features/global-catalog/contracts';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import {
  currentCatalogArticleId,
  currentMapperCatalogId,
  engineIngredientForCatalogSelection,
  filterCurrentMapperCatalogHits,
  scannedProductRecipeTarget,
} from './mapperOnlyCatalog';

const hit = (overrides: Partial<CatalogProductSearchHit> = {}): CatalogProductSearchHit => ({
  id: 'e1b3f4a0-0000-4000-8000-000000000001',
  currentVersionId: 'v1b3f4a0-0000-4000-8000-000000000001',
  entityKind: 'pi_base',
  status: 'pi_base',
  displayName: 'MLEKO 3,2%',
  originalName: null,
  originalLanguage: null,
  brand: null,
  canonicalFamily: null,
  category: 'dairy',
  mappedIngredientId: 'PI-ING-000123',
  markets: [],
  retailers: [],
  eans: ['5900497010115'],
  aliases: [],
  favorite: false,
  recentlyUsedAt: null,
  usableInBase: true,
  usableAsTopping: true,
  missingFields: [],
  invalidFields: [],
  verificationMethod: 'pi_base',
  publicData: {},
  ...overrides,
});

const scanned = { id: 'PR-ING-006306', displayName: 'MLEKO 3,2%', barcode: '5900497010115' };

const ownProductProfile = {
  productAccuracy: 94,
  productIntelligence: { engineUsable: true },
  technicalComposition: {
    water: 51,
    totalSolids: 49,
    fat: 11,
    protein: 24,
    carbohydrate: 13,
    sugars: 0.5,
    sucrose: 0.5,
    glucose: 0,
    dextrose: 0,
    fructose: 0,
    lactose: 0,
    polyols: 0,
    fibre: 0,
    salt: 0.2,
    alcohol: 0,
    energyKcal: 250,
    podValue: 0.5,
    pacValue: 0.5,
  },
};

/** A minimal current Mapper row used only to prove it is not the PR line's physics. */
const mapperRow = {
  ingredient_id: 'PI-ING-000123',
  ingredient_name_display: 'MILK 3.2%',
  ingredient_name_internal: 'MILK 3.2%',
  ingredient_category: 'dairy',
  ingredient_subcategory: 'milk',
  verification_status: 'Verified',
  dataset_version: 'v1.0',
  approved_for_base: true,
  water_percent: 88.2,
  total_solids_percent: 11.8,
  fat_percent: 3.2,
  protein_percent: 3.3,
  carbohydrate_percent: 4.7,
  total_sugars_percent: 4.7,
  lactose_percent: 4.7,
  salt_percent: 0.1,
  kcal_per_100g: 60,
  pod_value: 16,
  pac_value: 10,
  de_value: null,
  cost_per_kg: 1.1,
  currency: 'EUR',
  data_confidence_percent: 95,
} as unknown as IngredientRow;

describe('a scanned product returning to the recipe', () => {
  it('matches the catalogue row by its GTIN first', () => {
    const other = hit({
      id: 'e1b3f4a0-0000-4000-8000-000000000002',
      mappedIngredientId: 'PI-ING-000999',
      eans: ['1111111111116'],
      displayName: 'MLEKO 3,2% inne',
    });
    expect(scannedProductRecipeTarget([other, hit()], scanned, 'BASE')?.mappedIngredientId).toBe(
      'PI-ING-000123',
    );
  });

  it('matches a product the scanner resolved by canonical identity when no code is known', () => {
    expect(
      scannedProductRecipeTarget(
        [hit()],
        { id: 'PI-ING-000123', displayName: 'MLEKO 3,2%', barcode: null },
        'BASE',
      )?.mappedIngredientId,
    ).toBe('PI-ING-000123');
  });

  it('reuses the row a previous INTIMPORT run created — never a second identity', () => {
    // J. Same GTIN, imported earlier: exactly one selectable row comes back.
    const imported = hit({ displayName: 'MLEKO 3,2% (INTIMPORT)' });
    const duplicateOfSameMapperId = hit({ id: 'e1b3f4a0-0000-4000-8000-000000000003' });
    const target = scannedProductRecipeTarget([imported, duplicateOfSameMapperId], scanned, 'BASE');
    expect(target?.mappedIngredientId).toBe('PI-ING-000123');
    expect(target?.id).toBe(imported.id);
  });

  it('refuses a commercial product that has no product-owned technical profile', () => {
    const commercial = hit({
      entityKind: 'commercial_product',
      status: 'manual_unverified',
      mappedIngredientId: null,
    });
    expect(scannedProductRecipeTarget([commercial], scanned, 'BASE')).toBeNull();
  });

  it('B accepts the scanned product with immutable ProductBehavior and no Mapper identity', () => {
    // The catalogue entry, behavior binding and physics belong to the scanned article.
    const overlay = hit({
      id: 'c0ffee00-0000-4000-8000-000000000009',
      entityKind: 'commercial_product',
      status: 'manual_unverified',
      displayName: 'MLEKO 3,2% Łaciate 1 l',
      productCode: 'PR-ING-006306',
      mappedIngredientId: null,
      publicData: ownProductProfile,
    });
    const target = scannedProductRecipeTarget([overlay], scanned, 'BASE');
    expect(target?.id).toBe(overlay.id);
    expect(target?.mappedIngredientId).toBeNull();
  });

  it('B keeps the scanned product beside its Mapper row instead of hiding one of them', () => {
    const overlay = hit({
      id: 'c0ffee00-0000-4000-8000-000000000009',
      entityKind: 'commercial_product',
      status: 'manual_unverified',
      displayName: 'MLEKO 3,2% Łaciate 1 l',
      productCode: 'PR-ING-006306',
      mappedIngredientId: null,
      publicData: ownProductProfile,
    });
    expect(filterCurrentMapperCatalogHits([hit(), overlay], 'BASE')).toHaveLength(2);
  });

  it('B builds the recipe line from the product-owned profile and keeps the PR identity', () => {
    const overlay = hit({
      entityKind: 'commercial_product',
      status: 'manual_unverified',
      displayName: 'MLEKO 3,2% Łaciate 1 l',
      productCode: 'PR-ING-006306',
      mappedIngredientId: null,
      publicData: ownProductProfile,
    });
    const ingredient = engineIngredientForCatalogSelection(overlay, {
      ok: true,
      kind: 'catalog_product',
      articleId: 'PR-ING-006306',
      productVersionId: overlay.currentVersionId!,
    })!;
    expect(ingredient.name).toBe('MLEKO 3,2% Łaciate 1 l');
    expect(ingredient.canonical_ingredient_id).toBe('PR-ING-006306');
    expect('composition' in ingredient && ingredient.composition.fat_percent).toBe(11);
    expect('composition' in ingredient && ingredient.composition.protein_percent).toBe(24);
    expect('pac_value' in ingredient && ingredient.pac_value).toBe(0.5);
    expect('composition' in ingredient && ingredient.composition.water_percent).toBe(51);
    expect('composition' in ingredient && ingredient.composition.water_percent)
      .not.toBe(mapperRow.water_percent);
  });

  it('keeps Baitz PR-ING-006308 distinct from PI-ING-000091 at runtime', () => {
    const baitz = hit({
      id: 'ba17caca-0000-4000-8000-000000006308',
      entityKind: 'commercial_product',
      status: 'manual_unverified',
      displayName: 'Baitz Kakao',
      productCode: 'PR-ING-006308',
      mappedIngredientId: null,
      publicData: ownProductProfile,
    });
    const ingredient = engineIngredientForCatalogSelection(baitz, {
      ok: true,
      kind: 'catalog_product',
      articleId: 'PR-ING-006308',
      productVersionId: baitz.currentVersionId!,
    })!;
    expect(ingredient.id).toBe('PR-ING-006308');
    expect(ingredient.canonical_ingredient_id).toBe('PR-ING-006308');
    expect(ingredient.canonical_ingredient_id).not.toBe('PI-ING-000091');
    expect('composition' in ingredient && ingredient.composition.fat_percent).toBe(11);
  });

  it('C refuses a blocked catalogue product however good its mapping looks', () => {
    const blocked = hit({
      entityKind: 'commercial_product',
      status: 'blocked',
      mappedIngredientId: null,
    });
    expect(scannedProductRecipeTarget([blocked], scanned, 'BASE')).toBeNull();
  });

  it('refuses a row that is not usable in the scope the picker was opened for', () => {
    const toppingOnly = hit({ usableInBase: false });
    expect(scannedProductRecipeTarget([toppingOnly], scanned, 'BASE')).toBeNull();
    expect(scannedProductRecipeTarget([toppingOnly], scanned, 'TOPPING')).not.toBeNull();
  });

  it('refuses a rejected or version-less row', () => {
    expect(
      scannedProductRecipeTarget(
        [hit({ publicData: { lifecycleRejected: true } })],
        scanned,
        'BASE',
      ),
    ).toBeNull();
    expect(
      scannedProductRecipeTarget([hit({ currentVersionId: null })], scanned, 'BASE'),
    ).toBeNull();
  });

  it('returns nothing rather than the wrong product when the code matches none of them', () => {
    expect(
      scannedProductRecipeTarget(
        [hit({ eans: ['0000000000000'], mappedIngredientId: 'PI-ING-000777' })],
        { id: 'PR-ING-000000', displayName: 'Nieznany', barcode: '5449000131805' },
        'BASE',
      ),
    ).toBeNull();
  });

  it('A a product-owned catalogue article is selectable in the scope it is usable in', () => {
    const mapped = hit({
      entityKind: 'commercial_product',
      status: 'verified',
      productCode: 'PR-ING-006306',
      mappedIngredientId: 'PI-ING-000123',
      publicData: ownProductProfile,
      usableInBase: true,
      usableAsTopping: false,
    });
    expect(currentCatalogArticleId(mapped, 'BASE')).toBe('PR-ING-006306');
    expect(currentCatalogArticleId(mapped, 'TOPPING')).toBeNull();
    expect(currentMapperCatalogId(mapped, 'BASE')).toBeNull();
  });

  it('an imported product with no identity is findable but never selectable', () => {
    const unmapped = hit({
      entityKind: 'commercial_product',
      status: 'manual_unverified',
      mappedIngredientId: null,
    });
    expect(currentMapperCatalogId(unmapped, 'BASE')).toBeNull();
    expect(scannedProductRecipeTarget([unmapped], scanned, 'BASE')).toBeNull();
  });
});
