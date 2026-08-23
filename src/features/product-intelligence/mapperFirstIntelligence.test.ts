/**
 * Mapper-first product intelligence — the properties that must not regress.
 *
 * These tests are deliberately about SAFETY rather than coverage. Every one of
 * them describes a way the layer could quietly start inventing knowledge, and
 * pins the behaviour that prevents it.
 */
import { describe, expect, it } from 'vitest';
import {
  buildMapperKnowledge,
  fieldConsensus,
  fingerprintMapperRows,
  identityTokens,
  inferMapperValues,
  similarCohort,
  CONSENSUS_BANDS,
  MAX_TOKEN_DOCUMENT_SHARE,
  MIN_FAMILY_COHORT,
  MIN_TOKEN_DISCARD_COUNT,
  type MapperKnowledgeRow,
} from './mapperValueInference';
import {
  isNeverEstimated,
  knownField,
  NEVER_ESTIMATED_FACTS,
  preferStronger,
  unknownField,
  WORKING_NUMERIC_FIELDS,
} from './productFieldTruth';
import { parseINTIMPORT } from '@/data/products/intimport';
import { runIntimportLocalIntelligence } from './intimportIntelligence';
import {
  ENGINE_REQUIRED_WORKING_FIELDS,
  ESTIMATED_READY_FLOOR,
  resolveProductWorkingValues,
} from './productWorkingValues';

const FINGERPRINT = 'b13f5db4affd9c3be5ccbe59b40920053197a3697a3fa1bd4a859406e8baed38';

/** A Mapper row with every numeric field null unless overridden. */
function mapperRow(overrides: Partial<MapperKnowledgeRow> & { ingredient_id: string }): MapperKnowledgeRow {
  const base = {
    ingredient_name_internal: 'row',
    is_active: true,
    water_percent: null,
    total_solids_percent: null,
    fat_percent: null,
    protein_percent: null,
    carbohydrate_percent: null,
    total_sugars_percent: null,
    fiber_percent: null,
    salt_percent: null,
    alcohol_percent: null,
    kcal_per_100g: null,
    pod_value: null,
    pac_value: null,
    sweetness_factor: null,
    freezing_factor: null,
  } satisfies Omit<MapperKnowledgeRow, 'ingredient_id'>;
  return { ...base, ...overrides };
}

/** Three tightly-agreeing cocoa butter rows — a family the Mapper truly knows. */
const COCOA_BUTTER = [
  mapperRow({
    ingredient_id: 'PI-ING-000101',
    ingredient_name_internal: 'Cocoa butter deodorised',
    ingredient_category: 'chocolate',
    fat_percent: 100,
    water_percent: 0,
    total_solids_percent: 100,
    protein_percent: 0,
    carbohydrate_percent: 0,
    total_sugars_percent: 0,
    salt_percent: 0,
    pod_value: 0,
    pac_value: 0,
  }),
  mapperRow({
    ingredient_id: 'PI-ING-000102',
    ingredient_name_internal: 'Cocoa butter natural',
    ingredient_category: 'chocolate',
    fat_percent: 99.5,
    water_percent: 0.2,
    total_solids_percent: 99.8,
    protein_percent: 0.2,
    carbohydrate_percent: 0.1,
    total_sugars_percent: 0,
    salt_percent: 0,
    pod_value: 0,
    pac_value: 0,
  }),
  mapperRow({
    ingredient_id: 'PI-ING-000103',
    ingredient_name_internal: 'Cocoa butter refined',
    ingredient_category: 'chocolate',
    fat_percent: 100,
    water_percent: 0,
    total_solids_percent: 100,
    protein_percent: 0,
    carbohydrate_percent: 0,
    total_sugars_percent: 0,
    salt_percent: 0,
    pod_value: 0,
    pac_value: 0,
  }),
];

describe('field truth state', () => {
  it('lets VERIFIED replace ESTIMATED but never the reverse', () => {
    const estimated = knownField({
      value: 12,
      state: 'ESTIMATED',
      confidence: 0.99,
      basis: 'mapper_family_consensus',
    });
    const verified = knownField({
      value: 9,
      state: 'VERIFIED',
      confidence: 0.5,
      basis: 'product_declared',
    });

    // Confidence is irrelevant across states: a measurement outranks any guess.
    expect(preferStronger(estimated, verified).value).toBe(9);
    expect(preferStronger(verified, estimated).value).toBe(9);
  });

  it('treats UNKNOWN as replaceable by anything, and never carries a number', () => {
    const unknown = unknownField('no evidence');
    expect(unknown.value).toBeNull();
    expect(unknown.provenance.confidence).toBe(0);

    const estimated = knownField({
      value: 3,
      state: 'ESTIMATED',
      confidence: 0.1,
      basis: 'mapper_family_consensus',
    });
    expect(preferStronger(unknown, estimated).value).toBe(3);
    expect(preferStronger(estimated, unknown).value).toBe(3);
  });

  it('refuses to hold a non-finite value', () => {
    expect(knownField({ value: Number.NaN, state: 'VERIFIED', confidence: 1, basis: 'product_declared' }).value)
      .toBeNull();
  });

  it('never lists an identity or legal fact among the estimable working fields', () => {
    for (const fact of NEVER_ESTIMATED_FACTS) {
      expect(isNeverEstimated(fact)).toBe(true);
      expect(WORKING_NUMERIC_FIELDS as readonly string[]).not.toContain(fact);
    }
    // Allergens are the case that matters most: unknown must stay unknown.
    expect(isNeverEstimated('allergens')).toBe(true);
  });
});

describe('cohort consensus', () => {
  it('refuses a field whose cohort disagrees beyond its band', () => {
    const band = CONSENSUS_BANDS.fat_percent;
    const scattered = [
      mapperRow({ ingredient_id: 'a', fat_percent: 0 }),
      mapperRow({ ingredient_id: 'b', fat_percent: band * 4 }),
      mapperRow({ ingredient_id: 'c', fat_percent: band * 8 }),
      mapperRow({ ingredient_id: 'd', fat_percent: band * 12 }),
    ];
    expect(fieldConsensus(scattered, 'fat_percent', MIN_FAMILY_COHORT)).toBeNull();
  });

  it('refuses a cohort smaller than the minimum, however unanimous', () => {
    const twoIdentical = [
      mapperRow({ ingredient_id: 'a', fat_percent: 30 }),
      mapperRow({ ingredient_id: 'b', fat_percent: 30 }),
    ];
    expect(fieldConsensus(twoIdentical, 'fat_percent', MIN_FAMILY_COHORT)).toBeNull();
    expect(fieldConsensus(twoIdentical, 'fat_percent', 2)?.value).toBe(30);
  });

  it('reports lower confidence for a looser cohort than a unanimous one', () => {
    const unanimous = [
      mapperRow({ ingredient_id: 'a', fat_percent: 30 }),
      mapperRow({ ingredient_id: 'b', fat_percent: 30 }),
      mapperRow({ ingredient_id: 'c', fat_percent: 30 }),
    ];
    const loose = [
      mapperRow({ ingredient_id: 'a', fat_percent: 28 }),
      mapperRow({ ingredient_id: 'b', fat_percent: 30 }),
      mapperRow({ ingredient_id: 'c', fat_percent: 32 }),
    ];
    const tight = fieldConsensus(unanimous, 'fat_percent', 3);
    const slack = fieldConsensus(loose, 'fat_percent', 3);
    expect(tight?.tightness).toBe(1);
    expect(slack!.tightness).toBeLessThan(tight!.tightness);
  });

  it('names every Mapper row that actually contributed', () => {
    const consensus = fieldConsensus(COCOA_BUTTER, 'fat_percent', 3);
    expect(consensus?.contributors).toEqual([
      'PI-ING-000101',
      'PI-ING-000102',
      'PI-ING-000103',
    ]);
  });
});

describe('mapper inference', () => {
  const knowledge = buildMapperKnowledge(COCOA_BUTTER, FINGERPRINT);

  it('stamps every estimate with the Mapper fingerprint and the rows behind it', () => {
    const result = inferMapperValues(
      { name: 'Masło kakaowe premium', category: 'chocolate', subcategory: 'cocoa butter' },
      knowledge,
    );
    const fat = result.fields.fat_percent;
    expect(fat?.provenance.state).toBe('ESTIMATED');
    expect(fat?.provenance.mapperFingerprint).toBe(FINGERPRINT);
    expect(fat?.provenance.mapperReferences.length).toBeGreaterThanOrEqual(MIN_FAMILY_COHORT);
    expect(fat?.provenance.algorithmVersion).toBe('mapper-first-v1');
  });

  it('treats a GTIN hit as VERIFIED identity, not an estimate', () => {
    const withCode = buildMapperKnowledge(
      [mapperRow({ ingredient_id: 'PI-ING-000900', ean_code: '5901234123457', fat_percent: 42 })],
      FINGERPRINT,
    );
    const result = inferMapperValues({ name: 'anything at all', barcode: '5901234123457' }, withCode);
    expect(result.exactRow?.ingredient_id).toBe('PI-ING-000900');
    expect(result.fields.fat_percent?.provenance.state).toBe('VERIFIED');
    expect(result.fields.fat_percent?.value).toBe(42);
  });

  it('does not let a weaker tier overwrite a stronger tier it already answered', () => {
    const withCode = buildMapperKnowledge(
      [
        mapperRow({
          ingredient_id: 'PI-ING-000900',
          ingredient_name_internal: 'Cocoa butter exact',
          ingredient_category: 'chocolate',
          ean_code: '5901234123457',
          fat_percent: 42,
        }),
        ...COCOA_BUTTER,
      ],
      FINGERPRINT,
    );
    const result = inferMapperValues(
      { name: 'Cocoa butter', category: 'chocolate', barcode: '5901234123457' },
      withCode,
    );
    // The family says ~100; the identified row says 42. Identity wins.
    expect(result.fields.fat_percent?.value).toBe(42);
    expect(result.fields.fat_percent?.provenance.basis).toBe('mapper_exact');
  });

  it('never mutates the Mapper rows it was given', () => {
    const rows = COCOA_BUTTER.map((row) => ({ ...row }));
    const snapshot = JSON.stringify(rows);
    const built = buildMapperKnowledge(rows, FINGERPRINT);
    inferMapperValues({ name: 'Cocoa butter', category: 'chocolate' }, built);
    expect(JSON.stringify(rows)).toBe(snapshot);
  });

  it('produces nothing at all for a product it has no family for', () => {
    const result = inferMapperValues(
      { name: 'Zupełnie nieznany wyrób numer siedem', category: 'unclassified' },
      knowledge,
    );
    expect(Object.keys(result.fields)).toHaveLength(0);
    expect(result.tiersUsed).toEqual([]);
  });
});

describe('working values and readiness', () => {
  const knowledge = buildMapperKnowledge(COCOA_BUTTER, FINGERPRINT);

  const cocoaButterProduct = {
    declared: {},
    declaredConfidence: 0.95,
    identity: { name: 'Masło kakaowe', category: 'chocolate', subcategory: 'cocoa butter' },
    technical: false,
    technicalAuthority: false,
  };

  it('gives an unmeasured product real working numbers the Engine can use', () => {
    const resolved = resolveProductWorkingValues(cocoaButterProduct, knowledge);
    // The value lands in the canonical field, not in a side-channel.
    expect(resolved.values.fat_percent).toBeGreaterThan(99);
    expect(resolved.engineReady).toBe(true);
    expect(resolved.readiness).toBe('ESTIMATED_READY');
    expect(resolved.engineConfidence).toBeGreaterThanOrEqual(ESTIMATED_READY_FLOOR);
  });

  it('lets a declared value override the family without discarding the family trace', () => {
    const resolved = resolveProductWorkingValues(
      { ...cocoaButterProduct, declared: { fat_percent: 96 } },
      knowledge,
    );
    expect(resolved.values.fat_percent).toBe(96);
    expect(resolved.fields.fat_percent.provenance.state).toBe('VERIFIED');
    expect(resolved.fields.fat_percent.provenance.basis).toBe('product_declared');
    // The rest of the profile still came from the Mapper.
    expect(resolved.fields.pac_value.provenance.state).toBe('ESTIMATED');
  });

  it('flags a declaration the Mapper strongly disagrees with, without acting on it', () => {
    const resolved = resolveProductWorkingValues(
      { ...cocoaButterProduct, declared: { fat_percent: 3 } },
      knowledge,
    );
    expect(resolved.values.fat_percent).toBe(3);
    expect(resolved.conflicts.map((conflict) => conflict.field)).toContain('fat_percent');
  });

  it('keeps a technical product fail-closed however good its numbers are', () => {
    const resolved = resolveProductWorkingValues(
      { ...cocoaButterProduct, technical: true, technicalAuthority: false },
      knowledge,
    );
    expect(resolved.missingEngineFields).toEqual([]);
    expect(resolved.readiness).toBe('TECHNICAL_AUTHORITY_REQUIRED');
    // The block gates use; it must not erase the composition underneath it.
    expect(resolved.valueReadiness).toBe('ESTIMATED_READY');
    expect(resolved.values.fat_percent).toBeGreaterThan(99);
  });

  it('holds an unknown product at REVIEW rather than inventing a profile', () => {
    const resolved = resolveProductWorkingValues(
      {
        ...cocoaButterProduct,
        identity: { name: 'Zupełnie nieznany wyrób numer siedem', category: 'unclassified' },
      },
      knowledge,
    );
    expect(resolved.readiness).toBe('REVIEW');
    expect(resolved.missingEngineFields.length).toBe(ENGINE_REQUIRED_WORKING_FIELDS.length);
  });

  it('closes water and total solids against each other, and marks the result derived', () => {
    const resolved = resolveProductWorkingValues(
      {
        ...cocoaButterProduct,
        identity: { name: 'Zupełnie nieznany wyrób numer siedem' },
        declared: { water_percent: 62 },
      },
      knowledge,
    );
    expect(resolved.values.total_solids_percent).toBe(38);
    expect(resolved.fields.total_solids_percent.provenance.basis).toBe('derived');
    // Exact arithmetic on a measured value is still measured.
    expect(resolved.fields.total_solids_percent.provenance.state).toBe('VERIFIED');
  });

  it('derives energy from macros but never rates it above its weakest input', () => {
    const resolved = resolveProductWorkingValues(
      {
        ...cocoaButterProduct,
        identity: { name: 'Zupełnie nieznany wyrób numer siedem' },
        declaredConfidence: 0.8,
        declared: { fat_percent: 10, protein_percent: 5, carbohydrate_percent: 20 },
      },
      knowledge,
    );
    expect(resolved.values.kcal_per_100g).toBe(190);
    expect(resolved.fields.kcal_per_100g.provenance.confidence).toBeLessThan(0.8);
  });
});

describe('nearest-neighbour cohorts', () => {
  /** Twelve pastes: four pistachio, four strawberry, four hazelnut. */
  const PASTES = [
    ...[52, 53, 52.5, 53.5].map((fat, index) =>
      mapperRow({
        ingredient_id: `PI-PIS-${index}`,
        ingredient_name_internal: `Pasta pistacjowa ${index}`,
        ingredient_category: 'flavor_paste',
        fat_percent: fat,
      }),
    ),
    ...[0.4, 0.5, 0.3, 0.6].map((fat, index) =>
      mapperRow({
        ingredient_id: `PI-TRU-${index}`,
        ingredient_name_internal: `Pasta truskawkowa ${index}`,
        ingredient_category: 'flavor_paste',
        fat_percent: fat,
      }),
    ),
    ...[60, 61, 59, 62].map((fat, index) =>
      mapperRow({
        ingredient_id: `PI-ORZ-${index}`,
        ingredient_name_internal: `Pasta orzechowa ${index}`,
        ingredient_category: 'flavor_paste',
        fat_percent: fat,
      }),
    ),
  ];
  const knowledge = buildMapperKnowledge(PASTES, FINGERPRINT);

  it('selects the flavour that matches, not the whole category', () => {
    const cohort = similarCohort({ name: 'Pasta pistacjowa Bronte 100%' }, knowledge);
    expect(cohort.rows.map((row) => row.ingredient_id).sort()).toEqual([
      'PI-PIS-0',
      'PI-PIS-1',
      'PI-PIS-2',
      'PI-PIS-3',
    ]);
    // "pasta" appears in every row, so its weight is zero and it selects nothing.
    expect(similarCohort({ name: 'Pasta' }, knowledge).rows).toEqual([]);
  });

  it('estimates from the matching flavour rather than the category average', () => {
    const result = inferMapperValues({ name: 'Pasta pistacjowa Bronte' }, knowledge);
    // The category mean would be ~29; the pistachio cohort is ~52.75.
    expect(result.fields.fat_percent?.value).toBeGreaterThan(50);
    expect(result.fields.fat_percent?.provenance.basis).toBe('mapper_similar_profile');
  });

  it('discards a token only once it is common in absolute terms, not just in share', () => {
    // "pasta" is 100% of this tiny Mapper but only 12 rows, so the share rule
    // alone would wrongly discard the discriminating tokens beside it.
    expect(knowledge.documentFrequency.get('pasta')).toBe(12);
    expect(knowledge.indexedRows * MAX_TOKEN_DOCUMENT_SHARE).toBeLessThan(
      MIN_TOKEN_DISCARD_COUNT,
    );
    expect(similarCohort({ name: 'Pasta pistacjowa' }, knowledge).tokens).toContain('pistacjowa');
  });

  it('ignores tokens that are too short or purely numeric', () => {
    expect(identityTokens('Pasta 100 ml XL')).toEqual(['pasta']);
  });

  it('produces no cohort when nothing in the Mapper shares a token', () => {
    expect(similarCohort({ name: 'Kurkuma mielona ekologiczna' }, knowledge).rows).toEqual([]);
  });
});

describe('sweetening and freezing power closure', () => {
  const knowledge = buildMapperKnowledge([], FINGERPRINT);
  const base = {
    declaredConfidence: 0.95,
    identity: { name: 'Nieznany wyrob' },
    technical: false,
    technicalAuthority: false,
  };

  it('sets POD and PAC to zero when there is no sugar and no alcohol', () => {
    const resolved = resolveProductWorkingValues(
      { ...base, declared: { total_sugars_percent: 0, alcohol_percent: 0 } },
      knowledge,
    );
    expect(resolved.values.pod_value).toBe(0);
    expect(resolved.values.pac_value).toBe(0);
    expect(resolved.fields.pac_value.provenance.basis).toBe('derived');
  });

  it('refuses that shortcut for a spirit, which has no sugar but huge freezing power', () => {
    const resolved = resolveProductWorkingValues(
      { ...base, declared: { total_sugars_percent: 0, alcohol_percent: 40 } },
      knowledge,
    );
    expect(resolved.values.pac_value).toBeNull();
    expect(resolved.values.pod_value).toBeNull();
  });

  it('refuses that shortcut when alcohol is simply unknown', () => {
    const resolved = resolveProductWorkingValues(
      { ...base, declared: { total_sugars_percent: 0 } },
      knowledge,
    );
    expect(resolved.values.pac_value).toBeNull();
  });
});

describe('cross-field plausibility', () => {
  const knowledge = buildMapperKnowledge([], FINGERPRINT);
  const base = {
    declaredConfidence: 0.95,
    identity: { name: 'Nieznany wyrob' },
    technical: false,
    technicalAuthority: false,
  };

  it('withdraws an estimate that contradicts the assembled product', () => {
    // A cohort insisting on 40% sugar inside a product declaring 5% carbohydrate
    // is not a low-confidence estimate — it is an impossible one.
    const sugary = buildMapperKnowledge(
      [
        ...[1, 2, 3].map((index) =>
          mapperRow({
            ingredient_id: `PI-SUG-${index}`,
            ingredient_name_internal: `Syrop pistacjowy ${index}`,
            total_sugars_percent: 40,
          }),
        ),
        // Distractors, so "pistacjowy" carries real weight rather than appearing
        // in every row and therefore discriminating nothing.
        ...[1, 2, 3].map((index) =>
          mapperRow({
            ingredient_id: `PI-ORZ-${index}`,
            ingredient_name_internal: `Masa orzechowa ${index}`,
            total_sugars_percent: 5,
          }),
        ),
      ],
      FINGERPRINT,
    );
    const resolved = resolveProductWorkingValues(
      { ...base, identity: { name: 'Syrop pistacjowy light' }, declared: { carbohydrate_percent: 5 } },
      sugary,
    );
    expect(resolved.values.carbohydrate_percent).toBe(5);
    expect(resolved.values.total_sugars_percent).toBeNull();
    expect(resolved.plausibilityViolations.map((v) => v.rule)).toContain(
      'sugars_within_carbohydrate',
    );
  });

  it('never withdraws a measured value to satisfy a balance', () => {
    const resolved = resolveProductWorkingValues(
      { ...base, declared: { total_sugars_percent: 40, carbohydrate_percent: 5 } },
      knowledge,
    );
    // Both are declared, so both stand — and the product is held for review.
    expect(resolved.values.total_sugars_percent).toBe(40);
    expect(resolved.values.carbohydrate_percent).toBe(5);
    expect(resolved.contradictedByDeclaration).toBe(true);
    expect(resolved.valueReadiness).toBe('REVIEW');
  });

  it('accepts a physically coherent product without complaint', () => {
    const resolved = resolveProductWorkingValues(
      {
        ...base,
        declared: {
          water_percent: 60,
          fat_percent: 10,
          protein_percent: 5,
          carbohydrate_percent: 20,
          total_sugars_percent: 18,
          salt_percent: 0.2,
          alcohol_percent: 0,
        },
      },
      knowledge,
    );
    expect(resolved.plausibilityViolations).toEqual([]);
    expect(resolved.contradictedByDeclaration).toBe(false);
  });

  it('gives alcohol its own share of the mass balance', () => {
    // 55 water + 5 solids only reaches 100 because 40% is alcohol.
    const resolved = resolveProductWorkingValues(
      {
        ...base,
        declared: { water_percent: 55, total_solids_percent: 5, alcohol_percent: 40 },
      },
      knowledge,
    );
    expect(resolved.plausibilityViolations).toEqual([]);
  });

  it('rejects energy that does not follow from the macros', () => {
    const resolved = resolveProductWorkingValues(
      {
        ...base,
        declared: {
          fat_percent: 1,
          protein_percent: 1,
          carbohydrate_percent: 1,
          kcal_per_100g: 700,
        },
      },
      knowledge,
    );
    expect(resolved.plausibilityViolations.map((v) => v.rule)).toContain('energy_matches_macros');
  });
});

describe('INTIMPORT wiring', () => {
  const CSV_HEADER =
    'Product ID,Country Code,Category,Subcategory,Product Type,Brand,Product Name Original,' +
    'Product Name English,Variant Original,Variant English,Manufacturer,Net Quantity Value,' +
    'Net Quantity Unit,Package Count,Ingredients Original,Ingredients English,Allergens,' +
    'Nutrition Basis,Energy kJ,Energy kcal,Fat g,Saturated Fat g,Carbohydrates g,Sugars g,' +
    'Fibre g,Protein g,Salt g,EAN / GTIN,Country of Origin,Professional Dosage,' +
    'Technical Parameters,Technical PDF URL,Primary Source URL,Product Status,Checked At,Notes';

  const row = (name: string, category: string) =>
    `PL-TEST-1,PL,${category},cocoa butter,retail,TestBrand,${name},,,,TestCo,1,kg,1,,,,` +
    'not_found,,,,,,,,,,,,,,,,';

  const knowledge = buildMapperKnowledge(COCOA_BUTTER, FINGERPRINT);

  it('attaches real working values to each product when a Mapper is supplied', () => {
    const parsed = parseINTIMPORT(`${CSV_HEADER}\n${row('Maslo kakaowe', 'Chocolate & cocoa')}`);
    const { rows, summary } = runIntimportLocalIntelligence(parsed.candidates, {}, knowledge);

    expect(rows[0].workingValues).not.toBeNull();
    expect(rows[0].workingValues!.values.fat_percent).toBeGreaterThan(99);
    // Composition readiness is reported on its own axis.
    expect(summary.valueReadiness).toEqual({ READY: 0, ESTIMATED_READY: 1, REVIEW: 0 });
    expect(summary.mapperContributed).toBe(1);
  });

  it('still works, without inventing values, when no Mapper is available', () => {
    const parsed = parseINTIMPORT(`${CSV_HEADER}\n${row('Maslo kakaowe', 'Chocolate & cocoa')}`);
    const { rows, summary } = runIntimportLocalIntelligence(parsed.candidates);

    expect(rows[0].workingValues).toBeNull();
    // Absent counts, not zeroed counts: "we did not look" is not "nothing found".
    expect(summary.valueReadiness).toBeNull();
    expect(rows[0].route).toBeTruthy();
  });
});

describe('runtime mapper fingerprint', () => {
  it('is stable across row order and blind to inactive rows', () => {
    const a = fingerprintMapperRows(COCOA_BUTTER);
    const b = fingerprintMapperRows([...COCOA_BUTTER].reverse());
    expect(a).toBe(b);
    expect(
      fingerprintMapperRows([
        ...COCOA_BUTTER,
        mapperRow({ ingredient_id: 'PI-OFF-1', is_active: false }),
      ]),
    ).toBe(a);
  });

  it('changes when the Mapper actually changes', () => {
    expect(
      fingerprintMapperRows([...COCOA_BUTTER, mapperRow({ ingredient_id: 'PI-NEW-1' })]),
    ).not.toBe(fingerprintMapperRows(COCOA_BUTTER));
  });
});
