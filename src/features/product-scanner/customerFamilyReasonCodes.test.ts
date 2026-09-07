/**
 * THE OWNER'S FAMILY ANSWER, ENTERED THROUGH THE PATH THAT LOST IT.
 *
 * `ownerScanReplay.test.ts` replays the same two sessions and is green — but it runs
 * `classifyProductSemantics` and goes straight on to the Mapper. It never calls
 * `applyCustomerProductFamily`, which is the one step the owner's phone actually went through, and
 * that is exactly why a green suite did not protect him.
 *
 * Staging, 2026-09-07 18:08 UTC, EAN 7340222800464. Recognition named no family, so the flow asked
 * the customer, the customer answered "beverage" — and the recognition persisted on the session was:
 *
 *     classificationSource       CUSTOMER_CONFIRMED
 *     productArchetype           NORMAL_INGREDIENT      <- resolved by the family answer
 *     physicalForm               LIQUID                 <- resolved by the family answer
 *     intendedUsageRole          BASE_ONLY              <- resolved by the family answer
 *     dosage.semantics           NONE                   <- resolved
 *     compatibleMapperCategories []                     <- empty, with the family now known
 *     modelReasonCodes           ["ARCHETYPE_UNKNOWN", "FORM_UNKNOWN"]   <- both untrue
 *
 * `modelRequired` is derived from that list and is a hard gate in BOTH
 * `productProductionAccuracy` (PRODUCT_SEMANTICS_UNRESOLVED) and `productBehaviorAuthority`
 * (unknown_requires_review). So the product was blocked, and the UI asked the customer to
 * photograph a label whose answer the flow was already holding.
 *
 * ENTERING THE PATH AT ALL. `applyCustomerProductFamily` returns untouched when the family is
 * already known, so a session only reaches it when recognition named none — which on these two
 * fixtures is the state with no manufacturer category. `withoutTheFieldsThatNameTheFamily` removes
 * exactly those two fields and nothing else; every remaining value, including the whole nutrition
 * table and the ingredient list, is the owner's own session data.
 */
import { describe, expect, it } from 'vitest';
import { productSemanticEvidenceFromScanResult } from '../../../supabase/functions/_shared/productScanner';
import {
  classifyProductSemantics,
  validateProductSemanticModelOutput,
  type ProductSemanticClassification,
} from '../product-intelligence/productRecognition';
import {
  SPORT_002_EAN,
  sport001ScanResult,
  sport002ScanResult,
} from './__fixtures__/ownerScanSessions';
import { applyCustomerProductFamily, resolveCustomerProductFamily } from './customerProductFamily';

// The two sessions are different articles, so their literal shapes differ (001 declares no
// country of origin, 002 does). Both are scan results and both go down the same path.
type ScanResult = ReturnType<typeof sport001ScanResult> | ReturnType<typeof sport002ScanResult>;

/**
 * The same scan, as it stands before any source has named a category for it: the state in which
 * the flow legitimately has to ask the customer which family this is.
 */
const withoutTheFieldsThatNameTheFamily = (result: ScanResult) => ({
  ...result,
  identity: { ...result.identity, category: null },
  productionDeclarations: { ...result.productionDeclarations, technicalParametersText: null },
});

const unresolvedRecognition = (result: ScanResult): ProductSemanticClassification =>
  classifyProductSemantics(
    productSemanticEvidenceFromScanResult(withoutTheFieldsThatNameTheFamily(result) as never),
  );

/** What the semantic report shows, so a failure names the seam instead of a boolean. */
const report = (recognition: ProductSemanticClassification) => ({
  classificationSource: recognition.classificationSource,
  ingredientFamily: recognition.ingredientFamily,
  productArchetype: recognition.productArchetype,
  physicalForm: recognition.physicalForm,
  intendedUsageRole: recognition.intendedUsageRole,
  dosageSemantics: recognition.dosage.semantics,
  compatibleMapperCategories: recognition.compatibleMapperCategories,
  modelRequired: recognition.modelRequired,
  modelReasonCodes: recognition.modelReasonCodes,
});

describe("the customer's family answer, on the owner's real sessions", () => {
  it('the fixtures still reach the family question the owner was asked', () => {
    for (const make of [sport001ScanResult, sport002ScanResult]) {
      const recognition = unresolvedRecognition(make());
      // Without this the assertions below would pass vacuously on the early return.
      expect(resolveCustomerProductFamily(recognition).status).toBe(
        'CUSTOMER_CONFIRMATION_REQUIRED',
      );
      expect(recognition.modelReasonCodes).toContain('FAMILY_UNKNOWN');
    }
  });

  it(`retires every code the answer resolves, on ${SPORT_002_EAN} (the owner's session)`, () => {
    const confirmed = applyCustomerProductFamily(
      unresolvedRecognition(sport002ScanResult()),
      'beverage',
    );
    expect(report(confirmed)).toEqual({
      classificationSource: 'CUSTOMER_CONFIRMED',
      ingredientFamily: 'plant_beverage',
      productArchetype: 'NORMAL_INGREDIENT',
      physicalForm: 'LIQUID',
      intendedUsageRole: 'BASE_ONLY',
      dosageSemantics: 'NONE',
      // recomputed from the family the customer just named, never carried over
      compatibleMapperCategories: ['beverage'],
      // nothing is unknown any more, so neither authority may gate on one
      modelRequired: false,
      modelReasonCodes: [],
    });
  });

  it('does the same for the second session, which is a different article', () => {
    const confirmed = applyCustomerProductFamily(
      unresolvedRecognition(sport001ScanResult()),
      'beverage',
    );
    expect(confirmed.modelReasonCodes).toEqual([]);
    expect(confirmed.modelRequired).toBe(false);
    expect(confirmed.compatibleMapperCategories).toEqual(['beverage']);
  });

  it('keeps FORM_UNKNOWN when the answered family does not settle the form', () => {
    /*
      "fruit" names an archetype but no physical form — a purée, a compote and a dried flake are
      all fruit. That uncertainty is real, so the code naming it must survive and the model must
      still be required, for the form and for nothing else.
    */
    const confirmed = applyCustomerProductFamily(
      unresolvedRecognition(sport002ScanResult()),
      'fruit',
    );
    expect(report(confirmed)).toMatchObject({
      ingredientFamily: 'fruit',
      productArchetype: 'FRUIT_PRODUCT',
      physicalForm: 'UNKNOWN',
      compatibleMapperCategories: ['fruit'],
      modelRequired: true,
      modelReasonCodes: ['FORM_UNKNOWN'],
    });
  });

  it('keeps FORM_UNKNOWN for a sweetener too, even though its archetype resolves', () => {
    const confirmed = applyCustomerProductFamily(
      unresolvedRecognition(sport002ScanResult()),
      'sweetener',
    );
    expect(confirmed.productArchetype).toBe('NORMAL_INGREDIENT');
    expect(confirmed.physicalForm).toBe('UNKNOWN');
    expect(confirmed.modelReasonCodes).toEqual(['FORM_UNKNOWN']);
    expect(confirmed.modelRequired).toBe(true);
  });

  it('leaves a code the answer cannot speak to completely untouched', () => {
    /*
      The same session, with a dosage line that states a quantity this parser cannot place as a
      dose (the 500 ml the source title itself carries). A family answer says nothing about a
      dosage, so DOSAGE_SEMANTICS_UNKNOWN must come through the merge unchanged while the codes
      the answer does resolve go.
    */
    const withADoseItCannotPlace = sport002ScanResult();
    withADoseItCannotPlace.productionDeclarations.dosageText =
      'Número de raciones por envase: 1; contenido 500 ml; Modo de empleo: Servir bien fría.';
    const recognition = unresolvedRecognition(withADoseItCannotPlace);
    expect(recognition.modelReasonCodes).toEqual([
      'ARCHETYPE_UNKNOWN',
      'FAMILY_UNKNOWN',
      'FORM_UNKNOWN',
      'DOSAGE_SEMANTICS_UNKNOWN',
    ]);

    const confirmed = applyCustomerProductFamily(recognition, 'beverage');
    expect(confirmed.modelReasonCodes).toEqual(['DOSAGE_SEMANTICS_UNKNOWN']);
    expect(confirmed.modelRequired).toBe(true);
    expect(confirmed.compatibleMapperCategories).toEqual(['beverage']);
  });

  describe('ROLE_UNKNOWN, which only the model path raises', () => {
    /** A model answer that reaches no conclusion, on the owner's own evidence. */
    const modelReachedNoConclusion = (result: ScanResult): ProductSemanticClassification => {
      const evidence = productSemanticEvidenceFromScanResult(
        withoutTheFieldsThatNameTheFamily(result) as never,
      );
      const merged = validateProductSemanticModelOutput(evidence, {
        productArchetype: 'UNKNOWN',
        ingredientFamily: 'unknown',
        physicalForm: 'UNKNOWN',
        intendedUsageRole: 'NEITHER_REVIEW',
        flavorDomain: 'UNKNOWN',
        professional: false,
        technical: false,
        dosageDependent: false,
        dosage: { semantics: 'NONE', value: null, unit: 'UNKNOWN', basis: 'UNKNOWN' },
        compatibleMapperCategories: [],
        forbiddenMapperCategories: [],
        confidence: 0.4,
        reasonCodes: ['NO_CONCLUSION'],
        evidenceRefs: ['name'],
      });
      if (!merged) throw new Error('the model answer was rejected before the merge under test');
      return merged;
    };

    it('retires it when the answered family settles the role', () => {
      const unresolved = modelReachedNoConclusion(sport002ScanResult());
      expect(unresolved.modelReasonCodes).toContain('ROLE_UNKNOWN');

      const confirmed = applyCustomerProductFamily(unresolved, 'beverage');
      expect(confirmed.intendedUsageRole).toBe('BASE_ONLY');
      expect(confirmed.modelReasonCodes).toEqual([]);
      expect(confirmed.modelRequired).toBe(false);
    });

    it('keeps it when the answered family leaves the role open', () => {
      // "technical" deliberately defaults the role to NEITHER_REVIEW: a technical additive's
      // place in a recipe is not something a family answer decides.
      const confirmed = applyCustomerProductFamily(
        modelReachedNoConclusion(sport002ScanResult()),
        'technical',
      );
      expect(confirmed.intendedUsageRole).toBe('NEITHER_REVIEW');
      expect(confirmed.modelReasonCodes).toEqual(['FORM_UNKNOWN', 'ROLE_UNKNOWN']);
      expect(confirmed.modelRequired).toBe(true);
    });
  });
});
