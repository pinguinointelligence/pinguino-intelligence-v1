/**
 * §37 — a scan that started in „Dodaj składnik" has to end in the recipe, without the
 * owner closing the scanner and typing the name of the product in their hand. What it
 * must NOT do is invent a door: the recipe accepts a current Mapper identity and
 * nothing else, and a scanned product goes through that same boundary.
 */
import { describe, expect, it } from 'vitest';
import type { CatalogProductSearchHit } from '@/features/global-catalog/contracts';
import { scannedProductRecipeTarget } from './mapperOnlyCatalog';

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
    const target = scannedProductRecipeTarget(
      [imported, duplicateOfSameMapperId],
      scanned,
      'BASE',
    );
    expect(target?.mappedIngredientId).toBe('PI-ING-000123');
    expect(target?.id).toBe(imported.id);
  });

  it('refuses a commercial product that carries no current Mapper identity', () => {
    const commercial = hit({
      entityKind: 'commercial_product',
      status: 'manual_unverified',
      mappedIngredientId: null,
    });
    expect(scannedProductRecipeTarget([commercial], scanned, 'BASE')).toBeNull();
  });

  it('refuses a row that is not usable in the scope the picker was opened for', () => {
    const toppingOnly = hit({ usableInBase: false });
    expect(scannedProductRecipeTarget([toppingOnly], scanned, 'BASE')).toBeNull();
    expect(scannedProductRecipeTarget([toppingOnly], scanned, 'TOPPING')).not.toBeNull();
  });

  it('refuses a rejected or version-less row', () => {
    expect(
      scannedProductRecipeTarget([hit({ publicData: { lifecycleRejected: true } })], scanned, 'BASE'),
    ).toBeNull();
    expect(scannedProductRecipeTarget([hit({ currentVersionId: null })], scanned, 'BASE')).toBeNull();
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
});
