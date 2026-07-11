/**
 * Save-flow tests (spec §9/§11/§12, §16): candidate mapping honesty (unknown stays
 * null, NO PAC/POD, NO status invention), the mocked EXISTING import called exactly
 * once, dedup enforced BEFORE save, duplicate resolutions per allowedActions,
 * idempotent save, red flags preserved (PI Verified never granted), and the typed
 * Mapper post-save handoff with a read-only basement.
 *
 * The import service is vi.mock'ed — NOTHING here can reach a live database.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import type { ProductRow } from '@/data/products/productRow';
import type { ProductImportSummary } from '@/services/productCatalogImport';
import type { ProductIntakeSession, ReviewedField } from '../intakeContracts';
import { OCR_ENGINE_INFO } from '../reviewState';

vi.mock('@/services/productCatalogImport', () => ({
  importProductCatalog: vi.fn(),
}));

import { importProductCatalog } from '@/services/productCatalogImport';
import {
  assessCandidate,
  buildEnrichmentHandoff,
  buildSessionCandidate,
  concatenatedOcrText,
  createSaveFlowState,
  OCR_INTAKE_EVIDENCE_SCHEMA,
  runPostSaveMatching,
  SaveFlowError,
  saveIntakeSession,
  sessionBasis,
} from './saveFlow';
import { markReadyToSave } from './intakeSession';
import {
  absentField,
  evidence,
  resolvedField,
  reviewSession,
} from './__fixtures__/builders';
import type { ExistingProductForDedup } from './duplicateCheck';

const importMock = vi.mocked(importProductCatalog);

const okSummary = (productId = 'prod-new-1'): ProductImportSummary => ({
  total: 1,
  created: 1,
  existingDuplicates: 0,
  inBatchDuplicates: 0,
  skipped: 0,
  failed: 0,
  productIds: [productId],
  productCodes: ['PR-ING-000123'],
  warnings: [],
  rowResults: [{ rowIndex: 0, outcome: 'created', productId, productCode: 'PR-ING-000123', warnings: [] }],
});

/** A fully reviewed field set for a typical label (per-100g basis). */
const fullFields = (): ReviewedField[] => [
  resolvedField('product_name', 'Vanilla Dessert Base'),
  resolvedField('brand', 'Polar Foods'),
  resolvedField('package_size', '500'),
  resolvedField('package_unit', 'g'),
  resolvedField('ean_code', '8480000610928'),
  resolvedField('country', 'España'),
  resolvedField('nutrition_basis', 'per_100g'),
  resolvedField('energy_kcal', '368'),
  resolvedField('fat', '15.3'),
  resolvedField('saturated_fat', '9.8'),
  resolvedField('carbohydrate', '52.1'),
  resolvedField('sugars', '48.2'),
  resolvedField('protein', '4.5'),
  resolvedField('salt', '0.28'),
  resolvedField('sodium', '0.11'), // evidence only — must NEVER map
  resolvedField('allergens_text', 'milk'),
  resolvedField('claim_vegan', 'false'),
  absentField('fibre'),
];

const readySession = (fields = fullFields(), texts = ['Vanilla Dessert Base\nBrand: Polar Foods', 'NUTRITION per 100g']) =>
  markReadyToSave(reviewSession('session-1', fields, texts));

beforeEach(() => {
  importMock.mockReset();
  importMock.mockResolvedValue(okSummary());
});

describe('buildSessionCandidate — honest mapping through the EXISTING contract', () => {
  it('maps resolved identity + nutrition through mapRowToProductInsert', () => {
    const { candidate, basis, eanSource } = buildSessionCandidate(readySession());
    expect(basis).toBe('per_100g');
    expect(eanSource).toBe('ocr');
    const { insert } = candidate;
    expect(insert.product_name_display).toBe('Vanilla Dessert Base');
    expect(insert.brand).toBe('Polar Foods');
    expect(insert.package_size).toBe('500 g'); // size + unit combined
    expect(insert.ean_code).toBe('8480000610928'); // string, verbatim
    expect(insert.country).toBe('España');
    expect(insert.kcal_per_100g).toBe(368);
    expect(insert.fat_percent).toBe(15.3);
    expect(insert.saturated_fat_percent).toBe(9.8);
    expect(insert.carbohydrate_percent).toBe(52.1);
    expect(insert.total_sugars_percent).toBe(48.2);
    expect(insert.protein_percent).toBe(4.5);
    expect(insert.salt_percent).toBe(0.28);
    expect(insert.allergens).toBe('milk');
    expect(insert.vegan).toBe('false');
    expect(insert.source_type).toBe('label_scan');
  });

  it('UNKNOWN stays null: marked_unknown and absent fields never invent a value', () => {
    const fields = fullFields().map((f) =>
      f.fieldKey === 'brand' ? { ...f, reviewStatus: 'marked_unknown' as const, chosenCandidate: null } : f,
    );
    const { candidate } = buildSessionCandidate(readySession(fields));
    expect(candidate.insert.brand).toBeUndefined();
    expect(candidate.insert.fiber_percent).toBeUndefined(); // absent field
    expect(candidate.insert.supplier).toBeUndefined(); // no field at all
  });

  it('an UNRESOLVED field (needs_confirmation / conflict) contributes nothing', () => {
    const fields = fullFields().map((f) =>
      f.fieldKey === 'salt' ? { ...f, reviewStatus: 'needs_confirmation' as const, chosenCandidate: null } : f,
    );
    // session still in review (gate would refuse); the builder is pure and honest anyway
    const { candidate } = buildSessionCandidate(reviewSession('session-1', fields));
    expect(candidate.insert.salt_percent).toBeUndefined();
  });

  it('NEVER populates PAC/POD, status, or any verification field', () => {
    const { candidate } = buildSessionCandidate(readySession());
    expect(candidate.insert.pac_value).toBeUndefined();
    expect(candidate.insert.pod_value).toBeUndefined();
    expect(candidate.insert.status).toBeUndefined();
    expect(candidate.insert.de_value).toBeUndefined();
    expect(candidate.insert.reviewed_by).toBeUndefined();
  });

  it('sodium evidence is recorded but NEVER mapped (and never converted to salt)', () => {
    const noSalt = fullFields().filter((f) => f.fieldKey !== 'salt');
    const { candidate } = buildSessionCandidate(readySession(noSalt));
    expect(candidate.insert.salt_percent).toBeUndefined(); // sodium 0.11 did NOT become salt
    const audit = candidate.insert.extracted_json as { fields: ReviewedField[] };
    expect(audit.fields.some((f) => f.fieldKey === 'sodium')).toBe(true); // evidence kept
  });

  it('the manual EAN (explicit human input) WINS over OCR ean evidence', () => {
    const session: ProductIntakeSession = { ...readySession(), manualEan: '7622210449283' };
    const { candidate, eanSource } = buildSessionCandidate(session);
    expect(candidate.insert.ean_code).toBe('7622210449283');
    expect(eanSource).toBe('manual');
  });

  it('an edited value overrides the OCR candidates', () => {
    const fields = fullFields().map((f) =>
      f.fieldKey === 'product_name'
        ? { ...f, reviewStatus: 'edited' as const, editedValue: 'Vanilla Base Corrected', chosenCandidate: null }
        : f,
    );
    const { candidate } = buildSessionCandidate(readySession(fields));
    expect(candidate.insert.product_name_display).toBe('Vanilla Base Corrected');
  });

  it('serving_only basis maps NO numeric fields (flagged, never converted)', () => {
    const fields = fullFields().map((f) =>
      f.fieldKey === 'nutrition_basis' ? resolvedField('nutrition_basis', 'serving_only') : f,
    );
    const { candidate, basis } = buildSessionCandidate(readySession(fields));
    expect(basis).toBe('serving_only');
    expect(candidate.insert.fat_percent).toBeUndefined();
    expect(candidate.insert.kcal_per_100g).toBeUndefined();
    expect(candidate.status).toBe('warning');
    expect(candidate.warnings.join(' ')).toMatch(/NOT mapped/);
    expect(candidate.insert.product_name_display).toBe('Vanilla Dessert Base'); // identity still flows
  });

  it('per_100ml maps numbers WITH the density caveat', () => {
    const fields = fullFields().map((f) =>
      f.fieldKey === 'nutrition_basis' ? resolvedField('nutrition_basis', 'per_100ml') : f,
    );
    const { candidate } = buildSessionCandidate(readySession(fields));
    expect(candidate.insert.fat_percent).toBe(15.3);
    expect(candidate.warnings.join(' ')).toMatch(/density NOT applied/);
  });

  it('an unrecognized basis value degrades to unknown (honest, not guessed)', () => {
    const fields = fullFields().map((f) =>
      f.fieldKey === 'nutrition_basis' ? resolvedField('nutrition_basis', 'per_serving_of_3') : f,
    );
    expect(sessionBasis(reviewSession('session-1', fields))).toBe('unknown');
  });

  it('detected_text = concatenated raw OCR of successful runs, in image order', () => {
    const session = readySession();
    expect(concatenatedOcrText(session)).toBe('Vanilla Dessert Base\nBrand: Polar Foods\n\nNUTRITION per 100g');
    const { candidate } = buildSessionCandidate(session);
    expect(candidate.insert.detected_text).toBe('Vanilla Dessert Base\nBrand: Polar Foods\n\nNUTRITION per 100g');
  });

  it('extracted_json carries the FULL v2 evidence audit (schema, engine, session, fields)', () => {
    const session = readySession();
    const { candidate } = buildSessionCandidate(session);
    const audit = candidate.insert.extracted_json as Record<string, unknown>;
    expect(audit.schema).toBe(OCR_INTAKE_EVIDENCE_SCHEMA);
    expect(OCR_INTAKE_EVIDENCE_SCHEMA).toBe('pinguino.ocr_intake_evidence.v2');
    expect(audit.engine).toEqual(OCR_ENGINE_INFO);
    expect(audit.sessionId).toBe('session-1');
    expect(audit.fields).toEqual(session.fields); // verbatim audit — nothing dropped
    expect((audit.images as unknown[]).length).toBe(2);
    expect(Object.keys(audit.ocrRuns as Record<string, unknown>)).toEqual(['img-1', 'img-2']);
    expect(audit.eanSource).toBe('ocr');
    expect(audit.manualEan).toBeNull();
  });
});

describe('red flags + status (spec §11) — OCR never yields PI Verified', () => {
  it('runs the EXISTING detector: sweetener text red-flags the candidate', () => {
    const fields = [
      resolvedField('product_name', 'Postre proteina con maltitol'),
      resolvedField('brand', 'Polar Foods'),
      resolvedField('nutrition_basis', 'per_100g'),
    ];
    const { candidate } = buildSessionCandidate(readySession(fields, ['Postre proteina con maltitol y edulcorante']));
    const assessment = assessCandidate(candidate);
    const codes = assessment.redFlags.map((f) => f.code);
    expect(codes).toContain('sweetener_or_polyol');
    expect(codes).toContain('protein_fortified');
    expect(assessment.blocksAutoVerify).toBe(true);
  });

  it('the EXISTING status policy recommends draft for a fresh OCR candidate — never PI Verified', () => {
    const assessment = assessCandidate(buildSessionCandidate(readySession()).candidate);
    expect(assessment.statusDecision.recommended_status).toBe('draft');
    expect(assessment.statusDecision.customer_label).toBeNull();
    expect(assessment.statusDecision.recommended_status).not.toBe('pi_verified');
  });

  it('red flags override confidence: even a clean high-confidence read stays unverified', () => {
    const fields = [
      resolvedField('product_name', 'Sirope sin azucar', 'img-1', {
        candidates: [evidence('Sirope sin azucar', 'img-1', { extractionConfidence: 99, normalizationConfidence: 99 })],
      }),
      resolvedField('nutrition_basis', 'per_100g'),
      resolvedField('sugars', '9'),
    ];
    const { candidate } = buildSessionCandidate(readySession(fields, ['Sirope sin azucar']));
    const assessment = assessCandidate(candidate);
    expect(assessment.blocksAutoVerify).toBe(true);
    expect(assessment.redFlags.map((f) => f.code)).toContain('sugar_free_claim');
    expect(assessment.statusDecision.recommended_status).toBe('draft');
  });
});

describe('saveIntakeSession — dedup enforced, one import call, idempotent', () => {
  it('saves a NEW product through the EXISTING import exactly once (runMatch off)', async () => {
    const session = readySession();
    const flow = createSaveFlowState('session-1');
    const outcome = await saveIntakeSession(session, flow, []);

    expect(outcome.result.kind).toBe('saved');
    expect(outcome.session.state).toBe('saved');
    expect(outcome.flow.savedProductId).toBe('prod-new-1');
    expect(outcome.flow.savedProductCode).toBe('PR-ING-000123');
    expect(importMock).toHaveBeenCalledTimes(1);
    const [candidates, options] = importMock.mock.calls[0]!;
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.insert.source_type).toBe('label_scan');
    expect(options).toEqual({ runMatch: false });
    if (outcome.result.kind === 'saved') {
      expect(outcome.result.postSave.step).toBe('run_existing_matcher');
      expect(outcome.result.postSave.productId).toBe('prod-new-1');
      expect(outcome.result.assessment.statusDecision.recommended_status).toBe('draft');
    }
  });

  it('is IDEMPOTENT: saving the same session twice yields ONE product, one import call', async () => {
    const session = readySession();
    const first = await saveIntakeSession(session, createSaveFlowState('session-1'), []);
    const second = await saveIntakeSession(first.session, first.flow, []);
    expect(second.result.kind).toBe('saved');
    if (second.result.kind === 'saved') {
      expect(second.result.alreadySaved).toBe(true);
      expect(second.result.productId).toBe('prod-new-1');
    }
    expect(importMock).toHaveBeenCalledTimes(1); // never a second write
    expect(second.flow.importCalls).toBe(1);
  });

  it('dedup runs BEFORE save: an exact duplicate blocks and the import is NEVER called', async () => {
    const existing: ExistingProductForDedup[] = [
      { id: 'prod-dup', ean_code_normalized: '8480000610928' },
    ];
    const outcome = await saveIntakeSession(readySession(), createSaveFlowState('session-1'), existing);
    expect(outcome.result.kind).toBe('duplicate_blocked');
    expect(outcome.session.state).toBe('duplicate_blocked');
    expect(outcome.session.duplicate?.verdict).toBe('exact_duplicate');
    expect(importMock).not.toHaveBeenCalled();
  });

  it('open_existing: no write, session closes with a pointer to the existing product', async () => {
    const existing: ExistingProductForDedup[] = [{ id: 'prod-dup', ean_code_normalized: '8480000610928' }];
    const outcome = await saveIntakeSession(readySession(), createSaveFlowState('session-1'), existing, {
      resolution: 'open_existing',
    });
    expect(outcome.result).toEqual({ kind: 'open_existing', existingProductId: 'prod-dup' });
    expect(outcome.session.state).toBe('cancelled');
    expect(importMock).not.toHaveBeenCalled();
  });

  it('update_existing_with_review: TYPED enrichment handoff, patch narrowed, NO write', async () => {
    const existing: ExistingProductForDedup[] = [{ id: 'prod-dup', ean_code_normalized: '8480000610928' }];
    const outcome = await saveIntakeSession(readySession(), createSaveFlowState('session-1'), existing, {
      resolution: 'update_existing_with_review',
    });
    expect(outcome.result.kind).toBe('enrichment_handoff');
    if (outcome.result.kind === 'enrichment_handoff') {
      expect(outcome.result.existingProductId).toBe('prod-dup');
      // ONLY the enrichment seam's label-nutrition fields — no identity, no pac/pod
      expect(outcome.result.proposedPatch).toEqual({
        fat_percent: 15.3,
        saturated_fat_percent: 9.8,
        carbohydrate_percent: 52.1,
        total_sugars_percent: 48.2,
        protein_percent: 4.5,
        salt_percent: 0.28,
        kcal_per_100g: 368,
      });
      expect(outcome.result.note).toMatch(/enrichment flow/);
    }
    expect(importMock).not.toHaveBeenCalled();
  });

  it('create_new on a LIKELY duplicate proceeds to the one import call', async () => {
    const existing: ExistingProductForDedup[] = [
      { id: 'prod-similar', brand: 'Polar Foods', product_name_display: 'Vanilla Dessert Basé', package_size: '500 g' },
    ];
    const outcome = await saveIntakeSession(readySession(), createSaveFlowState('session-1'), existing, {
      resolution: 'create_new',
    });
    expect(outcome.result.kind).toBe('saved');
    expect(importMock).toHaveBeenCalledTimes(1);
    expect(outcome.session.duplicate?.verdict).toBe('likely_duplicate'); // the assessment is kept
  });

  it('create_new on an EXACT duplicate is a TYPED refusal (locked rules)', async () => {
    const existing: ExistingProductForDedup[] = [{ id: 'prod-dup', ean_code_normalized: '8480000610928' }];
    await expect(
      saveIntakeSession(readySession(), createSaveFlowState('session-1'), existing, { resolution: 'create_new' }),
    ).rejects.toMatchObject({ name: 'SaveFlowError', code: 'action_not_allowed' });
    expect(importMock).not.toHaveBeenCalled();
  });

  it('a blocked session resumes and saves once the user chose an allowed action', async () => {
    const existing: ExistingProductForDedup[] = [
      { id: 'prod-similar', brand: 'Polar Foods', product_name_display: 'Vanilla Dessert Basé', package_size: '500 g' },
    ];
    const first = await saveIntakeSession(readySession(), createSaveFlowState('session-1'), existing);
    expect(first.result.kind).toBe('duplicate_blocked');
    const second = await saveIntakeSession(first.session, first.flow, existing, { resolution: 'create_new' });
    expect(second.result.kind).toBe('saved');
    expect(second.session.state).toBe('saved');
  });

  it('refuses to save a session that is not ready (typed wrong_state)', async () => {
    const error = await saveIntakeSession(
      reviewSession('session-1', fullFields()),
      createSaveFlowState('session-1'),
      [],
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SaveFlowError);
    expect((error as SaveFlowError).code).toBe('wrong_state');
  });

  it('refuses a flow state from ANOTHER session (cross-product guard)', async () => {
    await expect(
      saveIntakeSession(readySession(), createSaveFlowState('other-session'), []),
    ).rejects.toMatchObject({ code: 'session_mismatch' });
  });

  it('an import failure fails the session honestly (no retry loop, no silent success)', async () => {
    importMock.mockResolvedValue({
      ...okSummary(),
      created: 0,
      failed: 1,
      productIds: [],
      productCodes: [],
      rowResults: [{ rowIndex: 0, outcome: 'failed', error: 'RLS says no', warnings: [] }],
    });
    const outcome = await saveIntakeSession(readySession(), createSaveFlowState('session-1'), []);
    expect(outcome.result).toEqual({ kind: 'failed', error: 'RLS says no' });
    expect(outcome.session.state).toBe('failed');
    expect(outcome.flow.savedProductId).toBeNull();
  });

  it('an import THROW also fails the session (isolated, typed result)', async () => {
    importMock.mockRejectedValue(new Error('network down'));
    const outcome = await saveIntakeSession(readySession(), createSaveFlowState('session-1'), []);
    expect(outcome.result).toEqual({ kind: 'failed', error: 'network down' });
    expect(outcome.session.state).toBe('failed');
  });

  it('a candidate with NO usable identity is refused before any import', async () => {
    const fields = [resolvedField('nutrition_basis', 'per_100g'), resolvedField('salt', '0.2')];
    const outcome = await saveIntakeSession(readySession(fields), createSaveFlowState('session-1'), []);
    expect(outcome.result.kind).toBe('failed');
    expect(outcome.session.state).toBe('failed');
    expect(importMock).not.toHaveBeenCalled();
  });

  it('red flags are PRESERVED on the saved output (they ride along, never dropped)', async () => {
    const fields = [
      resolvedField('product_name', 'Postre con sucralosa'),
      resolvedField('brand', 'Polar'),
      resolvedField('nutrition_basis', 'per_100g'),
    ];
    const outcome = await saveIntakeSession(
      markReadyToSave(reviewSession('session-1', fields, ['Postre con sucralosa'])),
      createSaveFlowState('session-1'),
      [],
    );
    expect(outcome.result.kind).toBe('saved');
    if (outcome.result.kind === 'saved') {
      expect(outcome.result.assessment.redFlags.map((f) => f.code)).toContain('sweetener_or_polyol');
      expect(outcome.result.assessment.statusDecision.recommended_status).toBe('draft');
    }
  });
});

describe('enrichment handoff builder (seam decision, spec §9)', () => {
  it('narrows to the seam ENRICHABLE_FIELDS only — identity and pac/pod can never appear', () => {
    const { candidate } = buildSessionCandidate(readySession());
    const handoff = buildEnrichmentHandoff(candidate, 'prod-x');
    expect(Object.keys(handoff.proposedPatch).sort()).toEqual([
      'carbohydrate_percent',
      'fat_percent',
      'kcal_per_100g',
      'protein_percent',
      'salt_percent',
      'saturated_fat_percent',
      'total_sugars_percent',
    ]);
  });

  it('a serving-only candidate hands off an EMPTY patch (nothing was mapped, nothing invented)', () => {
    const fields = fullFields().map((f) =>
      f.fieldKey === 'nutrition_basis' ? resolvedField('nutrition_basis', 'serving_only') : f,
    );
    const { candidate } = buildSessionCandidate(readySession(fields));
    expect(buildEnrichmentHandoff(candidate, 'prod-x').proposedPatch).toEqual({});
  });
});

describe('Mapper post-save handoff (spec §12) — read-only basement', () => {
  const basement = (over: Partial<IngredientRow>): IngredientRow =>
    ({
      ingredient_id: 'BAS-1',
      ingredient_name_internal: 'vanilla dessert base',
      ingredient_name_display: 'Vanilla Dessert Base',
      brand: '',
      ean_code: '',
      ingredient_category: '',
      verification_status: 'Verified',
      pac_value: null,
      pod_value: null,
      ...over,
    }) as IngredientRow;

  const savedProduct = (over: Partial<ProductRow>): ProductRow =>
    ({
      id: 'prod-new-1',
      product_name_display: 'Vanilla Dessert Base',
      product_name_internal: null,
      product_category: null,
      brand: null,
      ean_code: null,
      barcode: null,
      pac_value: null,
      pod_value: null,
      ...over,
    }) as ProductRow;

  it('invokes the EXISTING pure matcher; missing pac/pod routes to review, never invented', () => {
    const rows = Object.freeze([basement({})]) as unknown as IngredientRow[];
    const result = runPostSaveMatching(savedProduct({}), rows);
    expect(result.match_method).toBe('exact_normalized_name');
    expect(result.matched_basement_id).toBe('BAS-1');
    // product lacks pac/pod and the reference also lacks them → needs_review (honest)
    expect(result.mapper_status).toBe('needs_review');
    expect(result.missing_fields).toEqual(['pac_value', 'pod_value']);
  });

  it('NEVER mutates the injected basement rows (frozen fixture proof)', () => {
    const row = basement({});
    const frozen = Object.freeze(row);
    const rows = Object.freeze([frozen]) as unknown as IngredientRow[];
    const before = JSON.stringify(rows);
    runPostSaveMatching(savedProduct({}), rows);
    expect(JSON.stringify(rows)).toBe(before);
  });

  it('no basement rows → unmatched, honestly (no invention, no fallback write)', () => {
    const result = runPostSaveMatching(savedProduct({}), []);
    expect(result.mapper_status).toBe('unmatched');
    expect(result.match_method).toBe('no_confident_match');
    expect(result.matched_basement_id).toBeNull();
  });
});
