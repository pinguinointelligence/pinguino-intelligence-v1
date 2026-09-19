import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { customerProductProfileProposal } from '../../../supabase/functions/_shared/customerProductProfile';
import {
  validateIntimportProductProfileProposal,
  type IntimportMapperAuthorityRow,
} from '../../../supabase/functions/_shared/intimportWholeProfileAuthority';
import { productSemanticEvidenceFromScanResult } from '../../../supabase/functions/_shared/productScanner';
import { loadMapperKnowledgeRows } from '../product-intelligence/__dryrun__/mapperFixture';
import {
  classifyProductSemantics,
  type ProductSemanticFamily,
} from '../product-intelligence/productRecognition';

const DANONE_EAN = '8410500018870';
const HACENDADO_EAN = '8480000510716';
const MILKA_EAN = '7622210669315';

const danoneConflictScan = () => ({
  identity: {
    displayName: 'Yogur natural',
    originalName: 'Yogur natural',
    brand: 'Danone',
    category: 'Plain yogurts',
    subcategory: null as string | null,
    variant: null as string | null,
    explicitlyUnbranded: false,
  },
  barcodes: [{ value: DANONE_EAN, format: 'EAN_13' }],
  package: {
    netQuantity: null as number | null,
    unit: null as string | null,
    netQuantityText: '400 g (4 x 120 g)',
  },
  nutrition: {
    basis: 'per_100g',
    energyKcal: 73,
    fat: 3,
    carbohydrate: 4.2,
    sugars: 4.2,
    fibre: null as number | null,
    protein: 3.5,
    salt: 0.1,
  },
  ingredientsText: 'Leche, leche desnatada, nata, fermentos lacticos.',
  conflicts: [
    {
      field: 'package.netQuantity',
      labelValue: 400 as string | number | null,
      externalValue: 480 as string | number | null,
      retainedSource: null as string | null,
    },
  ],
  evidence: [] as unknown[],
  externalSources: [
    {
      sourceType: 'barcode_registry',
      url: `https://world.openfoodfacts.org/api/v2/product/${DANONE_EAN}.json`,
      title: 'Yogur natural · Danone',
      fieldsUsed: [
        'identity.displayName',
        'identity.brand',
        'identity.category',
        'ingredientsText',
        'package.netQuantity',
        'nutrition.basis',
        'nutrition.energyKcal',
        'nutrition.fat',
        'nutrition.carbohydrate',
        'nutrition.sugars',
        'nutrition.protein',
        'nutrition.salt',
      ],
      sourceStatedEan: DANONE_EAN,
      sourceAuthorityClass: 'STRUCTURED_PRODUCT_DATABASE',
    },
  ],
});

type MutableScan = ReturnType<typeof danoneConflictScan>;

const recognitionFor = (scan: MutableScan, family: ProductSemanticFamily = 'dairy_liquid') => {
  const recognitionEvidence = productSemanticEvidenceFromScanResult(scan as never);
  const deterministic = classifyProductSemantics(recognitionEvidence);
  return {
    recognitionEvidence,
    recognition: {
      ...deterministic,
      classificationSource: 'CUSTOMER_CONFIRMED' as const,
      productArchetype: 'NORMAL_INGREDIENT' as const,
      ingredientFamily: family,
      physicalForm: 'LIQUID' as const,
      intendedUsageRole: 'BASE_ONLY' as const,
      compatibleMapperCategories: family === 'dairy_liquid' ? ['dairy'] : ['chocolate'],
      isTechnicalProduct: false,
      isDosageDependent: false,
      confidence: 0.8,
      modelRequired: false,
      modelReasonCodes: [],
    },
  };
};

const runPipeline = (
  scan: MutableScan,
  userConfirmedFields: string[] = [],
  family?: ProductSemanticFamily,
) => {
  const { recognitionEvidence, recognition } = recognitionFor(scan, family);
  const proposal = customerProductProfileProposal({
    scanResult: scan,
    recognitionEvidence,
    recognition,
    userConfirmedFields: userConfirmedFields as never,
  });
  const { rows } = loadMapperKnowledgeRows();
  const profile = proposal
    ? validateIntimportProductProfileProposal({
        origin: 'CUSTOMER_ADDED',
        proposedMapperIngredientId: null,
        ...proposal,
        rows: rows as unknown as IntimportMapperAuthorityRow[],
      })
    : null;
  return { proposal, profile };
};

const hacendadoScan = (): MutableScan => {
  const scan = danoneConflictScan();
  scan.identity = {
    ...scan.identity,
    displayName: 'Queso fresco batido desnatado 0% MG Hacendado',
    originalName: 'Queso fresco batido desnatado 0% MG Hacendado',
    brand: 'Hacendado',
    category: 'Lácteos, Quesos, Queso fresco, Quark',
  };
  scan.barcodes = [{ value: HACENDADO_EAN, format: 'EAN_13' }];
  scan.package = { netQuantity: 500, unit: 'g', netQuantityText: '500 g' };
  scan.nutrition = {
    basis: 'per_100g',
    energyKcal: 46,
    fat: 0.5,
    carbohydrate: 3.5,
    sugars: 3.5,
    fibre: 0,
    protein: 8,
    salt: 0.1,
  };
  scan.ingredientsText = 'Leche desnatada pasteurizada, fermentos lácticos.';
  scan.conflicts = [];
  scan.externalSources = [
    {
      sourceType: 'retailer',
      url: `https://tienda.mercadona.es/product/${HACENDADO_EAN}`,
      title: 'Queso fresco batido desnatado Hacendado 500 g',
      fieldsUsed: [...scan.externalSources[0]!.fieldsUsed],
      sourceStatedEan: HACENDADO_EAN,
      sourceAuthorityClass: 'OFFICIAL_PRIVATE_LABEL',
    },
  ];
  return scan;
};

const milkaScan = (): MutableScan => {
  const scan = danoneConflictScan();
  scan.identity = {
    ...scan.identity,
    displayName: 'Milka Choco Brownie',
    originalName: 'Milka Choco Brownie',
    brand: 'Milka',
    category: 'Chocolate snack',
  };
  scan.barcodes = [{ value: MILKA_EAN, format: 'EAN_13' }];
  scan.package = { netQuantity: 150, unit: 'g', netQuantityText: '150 g' };
  scan.nutrition = {
    basis: 'per_100g',
    energyKcal: 500,
    fat: 25,
    carbohydrate: 60,
    sugars: 40,
    fibre: 2,
    protein: 6,
    salt: 0.3725,
  };
  scan.ingredientsText = 'Cukier, mąka pszenna, tłuszcz kakaowy, kakao, sól.';
  scan.conflicts = [];
  scan.externalSources = [
    {
      sourceType: 'barcode_registry',
      url: `https://world.openfoodfacts.org/api/v2/product/${MILKA_EAN}.json`,
      title: 'Milka Choco Brownie',
      fieldsUsed: [...scan.externalSources[0]!.fieldsUsed],
      sourceStatedEan: MILKA_EAN,
      sourceAuthorityClass: 'STRUCTURED_PRODUCT_DATABASE',
    },
  ];
  return scan;
};

describe('Scanner Section 4.3 material-conflict Rescue input contract', () => {
  it('SCN-4.3-FIX-01 preserves structured material conflict session -> proposal -> Rescue input', () => {
    const scan = danoneConflictScan();
    const { proposal, profile } = runPipeline(scan);
    const expected = [
      {
        field: 'package.netQuantity',
        labelValue: 400,
        externalValue: 480,
        retainedSource: null,
        state: 'UNRESOLVED',
        canonicalValue: null,
      },
    ];

    expect(scan.conflicts).toEqual([
      {
        field: 'package.netQuantity',
        labelValue: 400,
        externalValue: 480,
        retainedSource: null,
      },
    ]);
    expect(proposal?.materialConflictDetails).toEqual(expected);
    expect(profile?.materialConflictDetails).toEqual(expected);
  });

  it('SCN-4.3-FIX-02 does not trust an unresolved conflicted canonical field', () => {
    const scan = danoneConflictScan();
    scan.conflicts = [
      {
        field: 'nutrition.salt',
        labelValue: 0.1,
        externalValue: 0.25,
        retainedSource: null,
      },
    ];
    const { proposal, profile } = runPipeline(scan);

    expect(proposal?.declared.salt_percent).toBe(0.1);
    expect(profile?.fieldTruth.salt_percent).toBeUndefined();
    // Salt is optional in the Engine contract, so an unresolved salt conflict
    // is retained in the session but never becomes a required-field Rescue gap.
    expect(profile?.unresolvedEngineFieldReasons.salt_percent).toBeUndefined();
  });

  it('SCN-4.3-FIX-03 allows safe Rescue when the conflict is unrelated', () => {
    const { profile } = runPipeline(danoneConflictScan());

    expect(profile?.fieldTruth.total_solids_percent).toMatchObject({
      value: 11.507,
      state: 'ESTIMATED',
      algorithmVersion: 'mapper-field-rescue-v1',
    });
    expect(profile?.fieldTruth.water_percent).toMatchObject({ value: 88.493, basis: 'derived' });
  });

  it('SCN-4.3-FIX-04 fails closed when target identity evidence is conflicted', () => {
    const scan = hacendadoScan();
    scan.conflicts = [
      {
        field: 'ingredientsText',
        labelValue: 'Leche desnatada pasteurizada',
        externalValue: 'Leche desnatada pasteurizada, almidón',
        retainedSource: null,
      },
    ];
    const { profile } = runPipeline(scan);

    expect(profile?.fieldTruth.total_solids_percent).toBeUndefined();
    expect(profile?.fieldTruth.water_percent).toBeUndefined();
    expect(profile?.engineUsable).toBe(false);
    expect(profile?.unresolvedEngineFieldReasons.water_percent).toEqual(
      expect.arrayContaining([
        'RESCUE_TARGET_EVIDENCE_INSUFFICIENT',
        'RESCUE_INPUT_MATERIAL_CONFLICT:ingredientsText',
      ]),
    );
  });

  it('SCN-4.3-FIX-05 accepts only the canonical side of a resolved conflict', () => {
    const scan = danoneConflictScan();
    scan.conflicts = [
      {
        field: 'nutrition.salt',
        labelValue: 0.1,
        externalValue: 0.25,
        retainedSource: 'label',
      },
    ];
    const { proposal, profile } = runPipeline(scan);

    expect(proposal?.materialConflictDetails).toEqual([
      expect.objectContaining({
        field: 'nutrition.salt',
        state: 'RESOLVED',
        retainedSource: 'label',
        canonicalValue: 0.1,
      }),
    ]);
    expect(profile?.fieldTruth.salt_percent).toMatchObject({
      value: 0.1,
      state: 'VERIFIED',
      basis: 'product_declared',
    });
    expect(profile?.fieldTruth.salt_percent?.value).not.toBe(0.25);
  });

  it('SCN-4.3-FIX-06 keeps customer-confirmed precedence over Mapper', () => {
    const { profile } = runPipeline(milkaScan(), ['salt'], 'chocolate');

    expect(profile?.fieldTruth.salt_percent).toMatchObject({
      value: 0.3725,
      state: 'VERIFIED',
      basis: 'user_confirmed',
    });
  });

  it('SCN-4.3-FIX-07 preserves unknown water and solids before Rescue', () => {
    const { proposal } = runPipeline(hacendadoScan());

    expect(proposal?.declared.water_percent).toBeUndefined();
    expect(proposal?.declared.total_solids_percent).toBeUndefined();
  });

  it('SCN-4.3-FIX-08 prevents raw external observations bypassing canonical normalization', () => {
    const { proposal, profile } = runPipeline(danoneConflictScan());

    expect(proposal?.matchInput).not.toHaveProperty('package.netQuantity');
    expect(Object.values(proposal?.declared ?? {})).not.toContain(480);
    expect(profile?.materialConflictDetails?.[0]).toMatchObject({
      externalValue: 480,
      canonicalValue: null,
    });
    expect(Object.values(profile?.technicalComposition ?? {})).not.toContain(480);
  });

  it('SCN-4.3-FIX-09 keeps current product version as stored-fact authority', () => {
    const analyze = readFileSync(
      new URL('../../../supabase/functions/product-scan-analyze/index.ts', import.meta.url),
      'utf8',
    );

    expect(analyze).toContain('current_version_id');
    expect(analyze).toContain('stored_facts: facts');
    expect(analyze).toContain('currentVersionId: current.current_version_id');
  });

  it('SCN-4.3-FIX-10 keeps finalizer/recompute parity for conflict context', () => {
    const finalizer = readFileSync(
      new URL('../../../supabase/functions/product-scan-finalize/index.ts', import.meta.url),
      'utf8',
    );
    const authority = readFileSync(
      new URL(
        '../../../supabase/functions/_shared/intimportWholeProfileAuthority.ts',
        import.meta.url,
      ),
      'utf8',
    );

    expect(finalizer).toContain('materialConflictDetails: proposal.materialConflictDetails');
    expect(authority).toContain('materialConflictDetails: input.materialConflictDetails');
    expect(authority).toContain('materialConflictDetails: resolved.materialConflictDetails');
  });

  it('SCN-4.3-FIX-11 carries the real Danone package conflict to Rescue', () => {
    const { profile } = runPipeline(danoneConflictScan());

    expect(profile?.materialConflictDetails).toEqual([
      {
        field: 'package.netQuantity',
        labelValue: 400,
        externalValue: 480,
        retainedSource: null,
        state: 'UNRESOLVED',
        canonicalValue: null,
      },
    ]);
    expect(profile?.evidence.materialConflicts).toEqual(['package.netQuantity']);
  });

  it('SCN-4.3-FIX-12 leaves the clean Hacendado Rescue result unchanged', () => {
    const { profile } = runPipeline(hacendadoScan());

    expect(profile?.materialConflictDetails).toEqual([]);
    expect(profile?.fieldTruth.total_solids_percent).toMatchObject({
      value: 12.8041,
      state: 'ESTIMATED',
      confidence: 0.887,
      algorithmVersion: 'mapper-field-rescue-v1',
    });
    expect(profile?.fieldTruth.water_percent).toMatchObject({ value: 87.1959, basis: 'derived' });
  });

  it('SCN-4.3-FIX-13 keeps Milka customer-confirmed salt authoritative', () => {
    const { proposal, profile } = runPipeline(milkaScan(), ['salt'], 'chocolate');

    expect(proposal?.declared.salt_percent).toBe(0.3725);
    expect(proposal?.declaredBasis.salt_percent).toBe('user_confirmed');
    expect(profile?.fieldTruth.salt_percent).toMatchObject({
      value: 0.3725,
      state: 'VERIFIED',
      basis: 'user_confirmed',
    });
    expect(profile?.fieldTruth.salt_percent?.value).not.toBe(0.1);
  });
});
