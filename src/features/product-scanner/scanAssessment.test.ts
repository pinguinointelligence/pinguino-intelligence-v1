/**
 * ONE canonical assessment per scan — the contract behind the owner's regression.
 *
 * REPRODUCED LIVE, 2026-09-07, on the deployed `product-scan-finalize` (staging 416d5d90), one scan
 * session, three `preview` calls that differ in nothing but whether the request repeats the
 * customer's answers:
 *
 *   1 · answers in the request                       productAccuracy 90.0
 *   2 · SAME session, no confirmations               productAccuracy 73.4   ← what Cola Zero saved
 *   3 · answers in the request again                 productAccuracy 90.0
 *
 * Call 2 also raised `INGREDIENTS_EVIDENCE_REQUIRED` for an ingredient text that was already sitting
 * on the session. The values had been persisted; only the PROVENANCE was recomputed from one HTTP
 * request. The same shape hit the semantic classification, which is why Vitamin Well went
 * 87.8/ready → 71.9/not ready. Evidence: `~/Developer/scan-corpus/regression-2026-09-07/`.
 *
 * These tests exercise the real functions the edge function calls — not a restatement of them.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SCAN_ASSESSMENT_VERSION,
  carryForwardRecognition,
  mergeConfirmedEvidenceFields,
  readPersistedScanEvidence,
  recognitionIsResolved,
  scanAssessmentSnapshot,
  stableJson,
} from '../../../supabase/functions/_shared/scanAssessment';

const FINALIZE = readFileSync(
  join(import.meta.dirname, '..', '..', '..', 'supabase/functions/product-scan-finalize/index.ts'),
  'utf8',
);

const resolved = (over: Record<string, unknown> = {}) => ({
  authority: 'PRODUCT_RECOGNITION_V2',
  classificationSource: 'SERVER_MODEL',
  productArchetype: 'NORMAL_INGREDIENT',
  ingredientFamily: 'plant_beverage',
  physicalForm: 'LIQUID',
  intendedUsageRole: 'BASE_ONLY',
  modelRequired: false,
  ...over,
});
/** exactly the recognition Vitamin Well was saved with (session a818bd02) */
const vitaminWellFallback = resolved({
  classificationSource: 'REVIEW_REQUIRED',
  physicalForm: 'UNKNOWN',
  modelRequired: true,
  modelReasonCodes: ['DOSAGE_SEMANTICS_UNKNOWN'],
});

describe('a scan accumulates; one request never subtracts from it', () => {
  it('keeps every field the customer confirmed at any point in the scan', () => {
    // round 1: the customer typed the whole nutrition panel and the name
    const first = ['identity', 'brand', 'nutritionBasis', 'fat', 'protein', 'carbohydrate'];
    // round 2: the form now shows only what is still missing, so the request carries almost nothing
    const second = ['ingredients'];
    expect(mergeConfirmedEvidenceFields(first, second)).toEqual([...first, 'ingredients']);
    // round 3: the customer presses save and types nothing at all — the answers must still be theirs
    expect(mergeConfirmedEvidenceFields(mergeConfirmedEvidenceFields(first, second), [])).toEqual([
      ...first,
      'ingredients',
    ]);
  });

  it('is a union, not a replacement, and never duplicates', () => {
    expect(mergeConfirmedEvidenceFields(['fat'], ['fat', 'salt'])).toEqual(['fat', 'salt']);
    expect(mergeConfirmedEvidenceFields([], [])).toEqual([]);
  });

  it('reads what the session carries, and tolerates a session that carries nothing', () => {
    expect(readPersistedScanEvidence(null)).toEqual({ confirmedFields: [], recognition: null });
    expect(readPersistedScanEvidence({ scanEvidence: { confirmedFields: 'nope' } })).toEqual({
      confirmedFields: [],
      recognition: null,
    });
    expect(
      readPersistedScanEvidence({
        scanEvidence: { confirmedFields: ['fat', 7, null], recognition: resolved() },
      }).confirmedFields,
    ).toEqual(['fat']);
  });
});

describe('a resolution the scan already reached is not thrown away', () => {
  it('reads `modelRequired` — the same gate both authorities read — and nothing else', () => {
    expect(recognitionIsResolved(resolved())).toBe(true);
    expect(recognitionIsResolved(resolved({ modelRequired: true }))).toBe(false);
    expect(recognitionIsResolved(resolved({ physicalForm: 'UNKNOWN' }))).toBe(false);
    expect(recognitionIsResolved(resolved({ ingredientFamily: 'unknown' }))).toBe(false);
    expect(recognitionIsResolved(resolved({ productArchetype: 'UNKNOWN' }))).toBe(false);
    expect(recognitionIsResolved(resolved({ intendedUsageRole: 'NEITHER_REVIEW' }))).toBe(false);
    expect(recognitionIsResolved(null)).toBe(false);
    expect(recognitionIsResolved({})).toBe(false);
  });

  it('Vitamin Well: a model that does not answer cannot un-resolve the scan', () => {
    const carried = carryForwardRecognition({
      fresh: { ...vitaminWellFallback, evidenceFingerprint: 'recognition-v2-new' },
      persisted: resolved({ evidenceFingerprint: 'recognition-v2-old' }),
    });
    expect(carried.carriedForward).toBe(true);
    expect(carried.recognition.modelRequired).toBe(false);
    expect(carried.recognition.physicalForm).toBe('LIQUID');
    // The facts changed, not their meaning. The carried semantics are rebound to the current
    // evidence package so the profile authority can validate and use them.
    expect(carried.recognition.evidenceFingerprint).toBe('recognition-v2-new');
    // and it says plainly where it came from
    expect(carried.recognition.carriedForwardFromScan).toBe(true);
  });

  it.each([
    ['physicalForm', 'POWDER'],
    ['productArchetype', 'DOSAGE_DEPENDENT_TECHNICAL'],
    ['intendedUsageRole', 'TOPPING_ONLY'],
  ])('does not carry old semantics across a material %s contradiction', (key, value) => {
    const fresh = resolved({
      [key]: value,
      modelRequired: true,
      classificationSource: 'REVIEW_REQUIRED',
    });
    const carried = carryForwardRecognition({ fresh, persisted: resolved() });
    expect(carried.carriedForward).toBe(false);
    expect(carried.recognition[key]).toBe(value);
  });

  it('a fresh RESOLVED classification always wins — this is not a cache of a verdict', () => {
    const fresh = resolved({ ingredientFamily: 'dairy_liquid' });
    const carried = carryForwardRecognition({ fresh, persisted: resolved() });
    expect(carried.carriedForward).toBe(false);
    expect(carried.recognition.ingredientFamily).toBe('dairy_liquid');
  });

  it('a customer who CORRECTS the family is not overruled by the old verdict', () => {
    // the scan's understanding of what the product IS has moved; the old resolution is stale
    const corrected = resolved({
      ingredientFamily: 'dairy_liquid',
      classificationSource: 'CUSTOMER_CONFIRMED',
      // still unresolved on another axis, so without this rule the old verdict would win
      modelRequired: true,
      modelReasonCodes: ['DOSAGE_SEMANTICS_UNKNOWN'],
    });
    const carried = carryForwardRecognition({ fresh: corrected, persisted: resolved() });
    expect(carried.carriedForward).toBe(false);
    expect(carried.recognition.ingredientFamily).toBe('dairy_liquid');
    // an unresolved family is not a correction — Vitamin Well still gets its resolution back
    const unknownFamily = resolved({ ingredientFamily: 'unknown', modelRequired: true });
    expect(
      carryForwardRecognition({ fresh: unknownFamily, persisted: resolved() }).carriedForward,
    ).toBe(true);
  });

  it('with nothing to carry, the fresh verdict stands — no invention', () => {
    expect(carryForwardRecognition({ fresh: vitaminWellFallback, persisted: null })).toEqual({
      recognition: vitaminWellFallback,
      carriedForward: false,
    });
    expect(
      carryForwardRecognition({ fresh: vitaminWellFallback, persisted: vitaminWellFallback })
        .carriedForward,
    ).toBe(false);
  });
});

describe('the snapshot is the verdict, and its hash is the proof', () => {
  const input = {
    sessionId: '7d46dda7-7466-4ad7-83a3-aecbe9f07e81',
    barcode: '8402001042911',
    result: {
      identity: { displayName: 'Cola Zero', brand: 'Hacendado' },
      nutrition: { basis: 'per_100g', energyKcal: 0.5 },
      ingredientsText: 'agua carbonatada…',
      evidence: [{ field: 'nutrition.energyKcal' }],
      externalSources: [{ sourceType: 'barcode_registry' }],
    },
    confirmedFields: ['identity', 'brand', 'nutritionBasis'],
    recognition: resolved(),
    recognitionCarriedForward: false,
    behavior: { classificationOutcome: 'classified', baseRecipeEligible: true },
    profile: {
      productAccuracy: 90,
      engineUsable: true,
      profileReferenceMapperIngredientId: 'PI-ING-001876',
      productAccuracyAssessment: {
        roleReadiness: 'BASE_READY',
        criticalBlockers: [],
        gellattiReadiness: { ready: true, issues: { missing: [] } },
      },
    },
  };

  it('carries every fact the contract names', async () => {
    const snapshot = await scanAssessmentSnapshot(input);
    expect(snapshot).toMatchObject({
      assessmentVersion: SCAN_ASSESSMENT_VERSION,
      sessionId: input.sessionId,
      barcode: '8402001042911',
      identity: { displayName: 'Cola Zero', brand: 'Hacendado' },
      semanticFamily: 'plant_beverage',
      mapperDonorId: 'PI-ING-001876',
      productionReady: true,
      roleReadiness: 'BASE_READY',
      finalConfidence: 90,
      engineUsable: true,
    });
    expect(snapshot.evidence.ingredientsText).toBe(true);
    expect(snapshot.evidence.nutritionBasis).toBe('per_100g');
    expect(snapshot.assessmentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('identical evidence gives an identical verdict — the owner’s rule, as an equality', async () => {
    const a = await scanAssessmentSnapshot(input);
    const b = await scanAssessmentSnapshot({
      ...input,
      // the union's insertion order is an accident of which round answered which field
      confirmedFields: ['nutritionBasis', 'brand', 'identity'],
    });
    expect(b.assessmentHash).toBe(a.assessmentHash);
  });

  it('the hash covers the verdict, not how it was reached', async () => {
    /*
      Whether a classification was carried forward depends on whether the model answered THIS time —
      the very nondeterminism the carry-forward exists to absorb. If it moved the hash, a customer
      who typed nothing would have their save refused as stale.
    */
    const fresh = await scanAssessmentSnapshot(input);
    const carried = await scanAssessmentSnapshot({
      ...input,
      recognition: { ...input.recognition, carriedForwardFromScan: true },
      recognitionCarriedForward: true,
    });
    expect(carried.assessmentHash).toBe(fresh.assessmentHash);
    // and the trace still says plainly where it came from
    expect(carried.classificationCarriedForward).toBe(true);
    expect(fresh.classificationCarriedForward).toBe(false);
  });

  it('every fact that could change the product changes the hash', async () => {
    const base = await scanAssessmentSnapshot(input);
    const variants = [
      { confirmedFields: ['identity'] },
      { recognition: resolved({ ingredientFamily: 'dairy_liquid' }) },
      { behavior: { classificationOutcome: 'unknown_requires_review' } },
      {
        profile: {
          ...input.profile,
          productAccuracy: 73.4,
        },
      },
      {
        result: { ...input.result, nutrition: { basis: 'per_100ml', energyKcal: 0.5 } },
      },
    ];
    for (const variant of variants) {
      const changed = await scanAssessmentSnapshot({ ...input, ...variant });
      expect(changed.assessmentHash, JSON.stringify(variant).slice(0, 60)).not.toBe(
        base.assessmentHash,
      );
    }
  });

  it('stableJson sorts at every depth, so equal values hash equal', () => {
    expect(stableJson({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } })).toBe(
      stableJson({ a: { c: [3, { e: 5, f: 4 }], d: 2 }, b: 1 }),
    );
    expect(stableJson({ a: undefined, b: 1 })).toBe('{"b":1}');
  });
});

describe('the deployed handler is wired to all of it', () => {
  it('asks the profile authority with the SCAN’s confirmed fields, not one request’s', () => {
    expect(FINALIZE).toContain('userConfirmedFields: confirmedEvidenceFields');
    expect(FINALIZE).not.toContain('userConfirmedFields: corrections.confirmedEvidenceFields');
    expect(FINALIZE).toContain('mergeConfirmedEvidenceFields(');
    expect(FINALIZE).toContain('readPersistedScanEvidence(session.validation_json)');
    // and it persists the union, or the next call starts from nothing again
    expect(FINALIZE).toContain('scanEvidence: {');
    expect(FINALIZE).toContain('confirmedFields: confirmedEvidenceFields');
  });

  it('carries a resolved classification forward instead of re-deriving it every call', () => {
    expect(FINALIZE).toContain('carryForwardRecognition({');
    expect(FINALIZE).toContain('persisted: persistedScan.recognition');
    expect(FINALIZE).toContain('recognitionIsResolved(recognition)');
    // the family question is still resolved from the classification, once
    expect(FINALIZE).toContain('resolveCustomerProductFamily(recognition)');
  });

  it('builds ONE snapshot and hands the same one to preview, to the save and to the response', () => {
    expect(FINALIZE).toContain('await scanAssessmentSnapshot({');
    expect(FINALIZE).toContain('assessmentHash: assessment.assessmentHash');
    expect(FINALIZE).toContain('finalAssessment: assessment');
    // a save may persist only the verdict the customer was shown
    expect(FINALIZE).toContain('expectedAssessmentHash');
    expect(FINALIZE).toContain('scan_assessment_stale');
    expect(FINALIZE.indexOf('expectedAssessmentHash !== assessment.assessmentHash')).toBeLessThan(
      FINALIZE.indexOf("service.rpc(\n    'gellatti_upsert_customer_added_product_v1'"),
    );
  });

  it('performs one bounded accumulated-evidence research pass only after Rescue remains blocked', () => {
    const outbound = [...FINALIZE.matchAll(/fetch\(/g)];
    expect(outbound).toHaveLength(2);
    expect(FINALIZE).toContain('functions/v1/intimport-enrich');
    expect(FINALIZE).toContain('buildAccumulatedScannerEvidence({');
    expect(FINALIZE).toContain('researchFieldsForScannerGaps(');
    expect(FINALIZE).toContain('accumulatedEvidence');
    expect(FINALIZE).toContain('scanResultFromLookupFacts(');
    expect(FINALIZE).toContain('mergeProductScanResults(');
    expect(FINALIZE).not.toContain('product-scan-analyze');
    // A local hostname/provenance check is allowed; a second registry API request is not.
    expect(FINALIZE).not.toContain('/api/v2/product/');
  });

  it('a repeated finalize reports what was SAVED, not a hard-coded success', () => {
    const start = FINALIZE.indexOf("kind: 'idempotent'");
    const idempotent = FINALIZE.slice(start, FINALIZE.indexOf('});', start));
    expect(idempotent).toContain('engineUsable: savedReady');
    expect(idempotent).toContain('usableProductCreated: savedReady');
    expect(FINALIZE).toContain('gellattiReadiness');
    expect(FINALIZE).toContain('const savedReady =');
    // no branch may claim usability by fiat any more
    expect(FINALIZE).not.toMatch(/engineUsable:\s*true/);
    expect(FINALIZE).not.toMatch(/usableProductCreated:\s*true/);
  });
});
