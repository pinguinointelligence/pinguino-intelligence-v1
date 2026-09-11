import { describe, expect, it } from 'vitest';
import { customerProductProfileProposal } from '../../../supabase/functions/_shared/customerProductProfile';
import {
  validateIntimportProductProfileProposal,
  type IntimportMapperAuthorityRow,
} from '../../../supabase/functions/_shared/intimportWholeProfileAuthority';
import { scanResultFromLookupFacts } from '../../../supabase/functions/_shared/productScanner';
import { loadMapperKnowledgeRows } from '../product-intelligence/__dryrun__/mapperFixture';
import { validateProductBehaviorAuthority } from '../product-intelligence/productBehaviorAuthority';
import { classifyProductSemantics } from '../product-intelligence/productRecognition';
import { classifyRemainingGaps } from '../scan-flow/scanFlowLogic';
import { productSemanticEvidenceFromScanResult } from '../../../supabase/functions/_shared/productScanner';

const EAN = '8480000510716';
const URL = `https://tienda.mercadona.es/product/${EAN}`;
const fact = (field: string, value: string) => ({
  field,
  value,
  sourceUrl: URL,
  sourceAuthorityClass: 'OFFICIAL_PRIVATE_LABEL',
  sourceTitle: 'Queso fresco batido desnatado Hacendado 500 g',
  sourceStatedEan: EAN,
  sourceEanConfirmationMethod: 'page_text',
  sourceEanConfirmedAt: '2026-09-11T00:00:00.000Z',
});

describe('Hacendado Queso 8480000510716 rescue-first regression', () => {
  it('SCN-QUESO-01 keeps the complete exact-product evidence and never classifies physics as photo-solvable', () => {
    const scan = scanResultFromLookupFacts([
      fact('productName', 'Queso fresco batido desnatado'),
      fact('brand', 'Hacendado'),
      fact('productCategory', 'Queso fresco batido, lácteo fermentado'),
      fact('productDescription', 'Producto lácteo desnatado de consistencia cremosa.'),
      fact('netQuantity', '500 g'),
      fact('ingredients', 'Leche desnatada pasteurizada y fermentos lácticos'),
      fact('allergens', 'Leche'),
      fact('nutritionBasis', 'por 100 g'),
      fact('energyKj', '194 kJ'),
      fact('energyKcal', '46 kcal'),
      fact('fat', '0,2 g'),
      fact('saturatedFat', '0,1 g'),
      fact('carbohydrate', '3,8 g'),
      fact('sugars', '3,8 g'),
      fact('fiber', '0 g'),
      fact('protein', '8 g'),
      fact('salt', '0,10 g'),
      fact('manufacturer', 'Mercadona S.A.'),
      fact('countryOfOrigin', 'España'),
      fact('technicalParameters', 'Producto pasteurizado; conservar refrigerado.'),
    ])!;
    scan.barcodes = [{ value: EAN, format: 'EAN_13' }];
    const evidence = productSemanticEvidenceFromScanResult(scan);
    const deterministic = classifyProductSemantics(evidence);
    // Exact persisted Recognition from the accepted phone forensic. The deterministic classifier
    // asks its server model for this Spanish product; the model resolved these semantics at 0.80.
    const recognition = {
      ...deterministic,
      classificationSource: 'SERVER_MODEL' as const,
      productArchetype: 'NORMAL_INGREDIENT' as const,
      ingredientFamily: 'dairy_liquid' as const,
      physicalForm: 'LIQUID' as const,
      intendedUsageRole: 'BASE_ONLY' as const,
      compatibleMapperCategories: ['dairy'],
      isTechnicalProduct: false,
      isDosageDependent: false,
      confidence: 0.8,
      modelRequired: false,
      modelReasonCodes: [],
    };
    const proposal = customerProductProfileProposal({
      scanResult: scan,
      recognitionEvidence: evidence,
      recognition,
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
    const behavior = profile
      ? validateProductBehaviorAuthority({ productProfile: profile, behaviorRows: [] })
      : null;
    const blockers = profile?.productAccuracyAssessment.criticalBlockers ?? [];

    expect(scan).toMatchObject({
      identity: { displayName: 'Queso fresco batido desnatado', brand: 'Hacendado' },
      package: { netQuantity: 500, unit: 'g' },
      ingredientsText: 'Leche desnatada pasteurizada y fermentos lácticos',
      nutrition: { basis: 'per_100g', energyKcal: 46, protein: 8 },
    });
    expect(recognition).toMatchObject({
      ingredientFamily: 'dairy_liquid',
      physicalForm: 'LIQUID',
      intendedUsageRole: 'BASE_ONLY',
      modelRequired: false,
    });
    expect(profile).not.toBeNull();
    expect(behavior).toMatchObject({ familyId: 'dairy', formId: 'liquid' });
    expect(behavior?.profilePermissions).toMatchObject({ BASE_RECIPE: false, PRODUCTION: false });
    expect(classifyRemainingGaps(blockers).photoSolvable).toEqual([]);
    expect(classifyRemainingGaps(blockers).photoCannotSolve).toEqual(blockers);
  });
});
