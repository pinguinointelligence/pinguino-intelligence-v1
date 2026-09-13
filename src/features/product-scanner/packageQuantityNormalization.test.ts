import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalRegistryIdentityFromScanResult } from '@/features/scan-flow/scanFlowLogic';
import type { ScanResultLike } from '@/scan-import-v2';
import {
  mergeProductScanResults,
  normalizeProductScanResult,
  scanResultFromLookupFacts,
} from '../../../supabase/functions/_shared/productScanner';

const DANONE_EAN = '8410500018870';
const HACENDADO_EAN = '8480000202949';
const REPO = resolve(import.meta.dirname, '..', '..', '..');

const fact = (
  ean: string,
  field: string,
  value: string,
  overrides: Record<string, unknown> = {},
) => ({
  field,
  value,
  sourceUrl: `https://world.openfoodfacts.org/api/v2/product/${ean}.json`,
  sourceAuthorityClass: 'STRUCTURED_PRODUCT_DATABASE',
  sourceTitle: value,
  sourceStatedEan: ean,
  sourceEanConfirmationMethod: 'url',
  sourceEanConfirmedAt: '2026-09-13T21:10:16.833Z',
  sourceReceiptId: `off:${ean}:2026-09-13T21:10:16.833Z`,
  sourceConfidence: 0.9,
  ...overrides,
});

const packageResult = (text: string, ean = DANONE_EAN) =>
  scanResultFromLookupFacts([fact(ean, 'netQuantity', text)])!;

const packageValue = (result: Record<string, unknown>) => result.package as Record<string, unknown>;

const conflicts = (result: Record<string, unknown>) =>
  result.conflicts as Array<Record<string, unknown>>;

const packageConflicts = (result: Record<string, unknown>) =>
  conflicts(result).filter((conflict) => String(conflict.field).startsWith('package.'));

describe('Scanner 2.3 package quantity normalization', () => {
  it('SCN-2.3-PKG-01 keeps a single explicit 500 g total without conflict', () => {
    const result = packageResult('500 g');

    expect(packageValue(result)).toEqual({
      netQuantity: 500,
      unit: 'g',
      netQuantityText: '500 g',
    });
    expect(packageConflicts(result)).toEqual([]);
  });

  it('SCN-2.3-PKG-02 keeps coherent 500 g (4 x 125 g) as the explicit total', () => {
    const result = packageResult('500 g (4 x 125 g)');

    expect(packageValue(result)).toEqual({
      netQuantity: 500,
      unit: 'g',
      netQuantityText: '500 g (4 x 125 g)',
    });
    expect(packageConflicts(result)).toEqual([]);
  });

  it.each(['4 x 120 g', '4 × 120 g', '4 X 120 g', '4 * 120 g'])(
    'SCN-2.3-PKG-03 derives the package total from a count-only multipack: %s',
    (text) => {
      const result = packageResult(text);

      expect(packageValue(result)).toEqual({
        netQuantity: 480,
        unit: 'g',
        netQuantityText: text,
      });
      expect(result.warnings).toEqual(
        expect.arrayContaining(['package_quantity_derived_from_multipack']),
      );
      expect(packageConflicts(result)).toEqual([]);
    },
  );

  it('SCN-2.3-PKG-04 records 400 g (4 x 120 g) as an unresolved conflict', () => {
    const result = packageResult('400 g (4 x 120 g)');

    expect(packageValue(result)).toEqual({
      netQuantity: null,
      unit: null,
      netQuantityText: '400 g (4 x 120 g)',
    });
    expect(packageConflicts(result)).toEqual([
      {
        field: 'package.netQuantity',
        labelValue: 400,
        externalValue: 480,
        retainedSource: null,
      },
    ]);
    expect(result.warnings).toEqual(
      expect.arrayContaining(['package_quantity_conflict_unresolved']),
    );
  });

  it('SCN-2.3-PKG-05 compares 0.5 kg (4 x 125 g) after mass-unit conversion', () => {
    const result = packageResult('0.5 kg (4 x 125 g)');

    expect(packageValue(result)).toMatchObject({ netQuantity: 500, unit: 'g' });
    expect(packageConflicts(result)).toEqual([]);
  });

  it('SCN-2.3-PKG-06 keeps coherent 500 ml (4 x 125 ml)', () => {
    const result = packageResult('500 ml (4 x 125 ml)');

    expect(packageValue(result)).toMatchObject({ netQuantity: 500, unit: 'ml' });
    expect(packageConflicts(result)).toEqual([]);
  });

  it('SCN-2.3-PKG-07 never compares 500 g with 4 x 125 ml without density authority', () => {
    const result = packageResult('500 g (4 x 125 ml)');

    expect(packageValue(result)).toMatchObject({ netQuantity: 500, unit: 'g' });
    expect(packageConflicts(result)).toEqual([]);
    expect(result.warnings).toEqual(
      expect.arrayContaining(['package_quantity_multipack_dimension_not_comparable']),
    );
  });

  it('SCN-2.3-PKG-08 prevents last-token selection from making 120 g the package total', () => {
    const result = packageResult('400 g (4 x 120 g)');
    const scannerSource = readFileSync(
      resolve(REPO, 'supabase/functions/_shared/productScanner.ts'),
      'utf8',
    );

    expect(packageValue(result).netQuantity).not.toBe(120);
    expect(packageConflicts(result)).toHaveLength(1);
    expect(scannerSource).not.toContain('matches.at(-1)');
  });

  it('SCN-2.3-PKG-09 refuses first-token selection when the explicit total conflicts', () => {
    const result = packageResult('400 g (4 x 120 g)');

    expect(packageValue(result).netQuantity).not.toBe(400);
    expect(packageConflicts(result)).toEqual([
      expect.objectContaining({
        field: 'package.netQuantity',
        labelValue: 400,
        externalValue: 480,
        retainedSource: null,
      }),
    ]);
  });

  it('SCN-2.3-PKG-10 keeps Owner Danone unresolved and suppresses misleading Recognition quantity', () => {
    const result = scanResultFromLookupFacts([
      fact(DANONE_EAN, 'productName', 'Yogur natural'),
      fact(DANONE_EAN, 'brand', 'Danone'),
      fact(DANONE_EAN, 'netQuantity', '400 g (4 x 120 g)'),
    ])!;

    expect(packageValue(result).netQuantity).toBeNull();
    expect(packageConflicts(result)).toEqual([expect.objectContaining({ retainedSource: null })]);
    expect(
      canonicalRegistryIdentityFromScanResult(result as ScanResultLike, DANONE_EAN),
    ).toMatchObject({
      displayName: 'Yogur natural',
      brand: 'Danone',
      quantity: null,
    });
  });

  it('SCN-2.3-PKG-11 preserves the coherent Owner Hacendado exact-EAN control', () => {
    const result = scanResultFromLookupFacts([
      fact(HACENDADO_EAN, 'productName', 'Yogur vainilla'),
      fact(HACENDADO_EAN, 'brand', 'Hacendado'),
      fact(HACENDADO_EAN, 'netQuantity', '500 g (4 x 125 g)'),
    ])!;

    expect(packageValue(result)).toEqual({
      netQuantity: 500,
      unit: 'g',
      netQuantityText: '500 g (4 x 125 g)',
    });
    expect(packageConflicts(result)).toEqual([]);
    expect(
      canonicalRegistryIdentityFromScanResult(result as ScanResultLike, HACENDADO_EAN),
    ).toMatchObject({
      displayName: 'Yogur vainilla',
      brand: 'Hacendado',
      quantity: '500 g (4 x 125 g)',
    });
  });

  it('SCN-2.3-PKG-12 normalizes result_json and makes finalizer consume the same state', () => {
    const analyzed = packageResult('400 g (4 x 120 g)');
    const finalized = normalizeProductScanResult(analyzed);
    const finalizerSource = readFileSync(
      resolve(REPO, 'supabase/functions/product-scan-finalize/index.ts'),
      'utf8',
    );

    expect(finalized.package).toEqual(analyzed.package);
    expect(finalized.conflicts).toEqual(analyzed.conflicts);
    expect(finalizerSource).toContain('normalizeProductScanResult(');
  });

  it('SCN-2.3-PKG-13 preserves an unresolved conflict through repeated finalize normalization', () => {
    const analyzed = packageResult('400 g (4 x 120 g)');
    const finalizedOnce = normalizeProductScanResult(analyzed);
    const finalizedTwice = normalizeProductScanResult(finalizedOnce);

    expect(finalizedTwice).toEqual(finalizedOnce);
    expect(packageConflicts(finalizedTwice)).toEqual([
      expect.objectContaining({ retainedSource: null }),
    ]);
  });

  it('SCN-2.3-PKG-14 keeps resolved-conflict provenance distinct from a direct fact', () => {
    const unresolved = packageResult('400 g (4 x 120 g)');
    const resolved = structuredClone(unresolved);
    resolved.package = {
      netQuantity: 480,
      unit: 'g',
      netQuantityText: '480 g (4 x 120 g)',
    };
    resolved.conflicts = [
      {
        field: 'package.netQuantity',
        labelValue: 400,
        externalValue: 480,
        retainedSource: 'manufacturer',
      },
    ];
    resolved.warnings = ['package_quantity_resolved_from_conflict'];

    const finalized = normalizeProductScanResult(resolved);

    expect(packageValue(finalized)).toMatchObject({ netQuantity: 480, unit: 'g' });
    expect(packageConflicts(finalized)).toEqual([
      expect.objectContaining({ retainedSource: 'manufacturer' }),
    ]);
    expect(finalized.warnings).toContain('package_quantity_resolved_from_conflict');
    expect(mergeProductScanResults(null, packageResult('480 g (4 x 120 g)')).conflicts).toEqual([]);
  });
});
