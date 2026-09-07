import { describe, expect, it } from 'vitest';
import { productSemanticEvidenceFromScanResult } from '../../../supabase/functions/_shared/productScanner';
import {
  finalizeProductProductionAccuracy,
  validateIntimportProductProfileProposal,
  type IntimportMapperAuthorityRow,
} from '../../../supabase/functions/_shared/intimportWholeProfileAuthority';
import { customerProductProfileProposal } from '../../../supabase/functions/_shared/customerProductProfile';
import { loadMapperKnowledgeRows } from '../product-intelligence/__dryrun__/mapperFixture';
import { classifyProductSemantics } from '../product-intelligence/productRecognition';
import {
  SPORT_001_EAN,
  SPORT_002_EAN,
  sport001ScanResult,
  sport002ScanResult,
  withAuthority,
} from './__fixtures__/ownerScanSessions';

/*
  THE OWNER'S REPLAY, RUN HERE.

  The same chain the owner replayed against staging, on the same two secured sessions:

    productSemanticEvidenceFromScanResult
      -> customerProductProfileProposal
      -> validateIntimportProductProfileProposal   (full canonical Mapper)
      -> finalizeProductProductionAccuracy

  Sport 001  session 6b8f1040-82c9-4ec6-9871-70171c7d06cf   EAN 7340222800457
  Sport 002  session 3375f79a-1070-4ea6-a1f3-49c4be1ee3ee   EAN 7340222800464

  Nothing is typed by hand, the photograph is not used as a data source, and there is no branch
  anywhere on a brand, an EAN or a Mapper donor id.

  This file exists to make a mismatch VISIBLE field by field rather than arguable. It prints the
  whole component vector on failure instead of asserting a single number, because the instruction
  is to find the seam that lost the data, never to tune points until they agree.
*/
const OFF = 'world.openfoodfacts.org';
const ECI = 'elcorteingles.es';
const LTC = 'latiendaencasa.es';
const VW = 'vitaminwell.com';

/** The classes classifySourceAuthority assigns server-side for these domains. */
const SERVER_CLASSES = {
  [OFF]: 'STRUCTURED_PRODUCT_DATABASE',
  [ECI]: 'AUTHORITATIVE_RETAILER',
  [LTC]: 'AUTHORITATIVE_RETAILER',
  [VW]: 'OFFICIAL_MANUFACTURER',
} as const;

/** What the server writes once it has matched the page's own barcode to the scanned code. */
const statedEanFor = (ean: string) => ({ [ECI]: ean, [LTC]: ean });

const runPipeline = (scanResult: ReturnType<typeof sport002ScanResult>) => {
  const semanticEvidence = productSemanticEvidenceFromScanResult(scanResult as never);
  const recognition = classifyProductSemantics(semanticEvidence);
  const proposal = customerProductProfileProposal({
    scanResult,
    recognitionEvidence: semanticEvidence,
    recognition,
  });
  if (!proposal) return { proposal: null, profile: null, recognition, semanticEvidence };
  const { rows } = loadMapperKnowledgeRows();
  const authority = validateIntimportProductProfileProposal({
    origin: 'CUSTOMER_ADDED',
    proposedMapperIngredientId: null,
    ...proposal,
    rows: rows as unknown as IntimportMapperAuthorityRow[],
  });
  return { proposal, profile: authority, recognition, semanticEvidence };
};

const vector = (profile: unknown) => {
  const p = profile as {
    productAccuracyAssessment?: { components?: Record<string, { earnedPoints: number }> };
  } | null;
  const c = p?.productAccuracyAssessment?.components ?? {};
  return {
    recognition: c.recognition?.earnedPoints ?? null,
    nutrition: c.nutrition?.earnedPoints ?? null,
    enginePhysics: c.enginePhysics?.earnedPoints ?? null,
    ingredientsEvidence: c.ingredientsEvidence?.earnedPoints ?? null,
    productBehavior: c.productBehavior?.earnedPoints ?? null,
    ean: c.ean?.earnedPoints ?? null,
  };
};

const profileOf = (profile: unknown) =>
  profile as {
    productAccuracy?: number;
    engineUsable?: boolean;
    productAccuracyAssessment?: { criticalBlockers?: string[] };
  } | null;

describe("the owner's replay, on the real sessions", () => {
  it('loads the canonical Mapper the replay used', () => {
    const { rows, fingerprint } = loadMapperKnowledgeRows();
    expect(rows.length).toBeGreaterThan(2000);
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it(`Sport 002 (${SPORT_002_EAN}) reaches the replay's numbers`, () => {
    const { profile, recognition, proposal } = runPipeline(
      withAuthority(
        sport002ScanResult(),
        SERVER_CLASSES,
        statedEanFor(SPORT_002_EAN),
      ) as never,
    );
    // Reported first so a mismatch shows the seam, not just a total.
    const report = {
      components: vector(profile),
      family: recognition.ingredientFamily,
      form: recognition.physicalForm,
      modelRequired: recognition.modelRequired,
      compatibleMapperCategories: recognition.compatibleMapperCategories,
      donor: (profile as { mapperIngredientId?: string } | null)?.mapperIngredientId ?? null,
      provenanceFields: Object.keys(proposal?.evidenceProvenance ?? {}),
      declaredZeroes: {
        fat: proposal?.declared.fat_percent,
        carbohydrate: proposal?.declared.carbohydrate_percent,
        sugars: proposal?.declared.total_sugars_percent,
      },
    };
    expect(report).toMatchObject({
      family: 'plant_beverage',
      form: 'LIQUID',
      modelRequired: false,
      compatibleMapperCategories: ['beverage'],
    });
    // Sugar free: its published macros really are zero, and the closure must NOT fire.
    expect(report.declaredZeroes).toEqual({ fat: 0, carbohydrate: 0, sugars: 0 });
    expect(vector(profile)).toEqual({
      recognition: 7,
      nutrition: 45,
      enginePhysics: 21.8,
      ingredientsEvidence: 11,
      productBehavior: 8,
      ean: 2,
    });
    expect(profileOf(profile)?.productAccuracy).toBeCloseTo(94.8, 4);
    expect(profileOf(profile)?.engineUsable).toBe(true);
    expect(profileOf(profile)?.productAccuracyAssessment?.criticalBlockers).toEqual([]);
  });

  it(`Sport 001 (${SPORT_001_EAN}) reaches the replay's numbers`, () => {
    const { profile, recognition, proposal } = runPipeline(
      withAuthority(
        sport001ScanResult(),
        SERVER_CLASSES,
        statedEanFor(SPORT_001_EAN),
      ) as never,
    );
    const report = {
      components: vector(profile),
      family: recognition.ingredientFamily,
      form: recognition.physicalForm,
      modelRequired: recognition.modelRequired,
      compatibleMapperCategories: recognition.compatibleMapperCategories,
      provenanceFields: Object.keys(proposal?.evidenceProvenance ?? {}),
    };
    expect(report).toMatchObject({
      family: 'plant_beverage',
      form: 'LIQUID',
      modelRequired: false,
      compatibleMapperCategories: ['beverage'],
    });
    /*
      "agua, azúcar, ..." names exactly one caloric sugar, and the exact table declares 5.5 g of
      sugars. The spectrum is arithmetic, not a guess — and it is `derived`, never the customer's
      word, because the customer typed nothing.
    */
    expect(proposal?.declared.sucrose_percent).toBeCloseTo(5.5, 4);
    expect(proposal?.declaredBasis.sucrose_percent).toBe('derived');
    expect(vector(profile)).toEqual({
      recognition: 7,
      nutrition: 45,
      enginePhysics: 23.4,
      ingredientsEvidence: 11,
      productBehavior: 8,
      ean: 2,
    });
    expect(profileOf(profile)?.productAccuracy).toBeCloseTo(96.4, 4);
    expect(profileOf(profile)?.engineUsable).toBe(true);
    expect(profileOf(profile)?.productAccuracyAssessment?.criticalBlockers).toEqual([]);
  });

  it('refuses to close the spectrum when a second caloric sugar could explain it', () => {
    const twoSugars = sport001ScanResult();
    twoSugars.ingredientsText = `${twoSugars.ingredientsText}, jarabe de glucosa`;
    const { proposal } = runPipeline(
      withAuthority(twoSugars, SERVER_CLASSES, statedEanFor(SPORT_001_EAN)) as never,
    );
    expect(proposal?.declared.sucrose_percent).toBeUndefined();
  });

  it('refuses to close the spectrum without a server-confirmed source for the list', () => {
    // Same product, but no page was matched to the scanned code: nothing is confirmed.
    const { proposal } = runPipeline(withAuthority(sport001ScanResult(), {}) as never);
    expect(proposal?.declared.sucrose_percent).toBeUndefined();
  });

  it('never marks automatically fetched data as entered by the customer', () => {
    for (const result of [sport001ScanResult(), sport002ScanResult()]) {
      const { proposal } = runPipeline(withAuthority(result, SERVER_CLASSES) as never);
      expect(Object.values(proposal?.declaredBasis ?? {})).not.toContain('user_confirmed');
      expect(Object.values(proposal?.evidence.fields ?? {})).not.toContain('user_confirmed');
    }
  });
});
