import { describe, expect, it } from 'vitest';
import { customerProductProfileProposal } from '../../../supabase/functions/_shared/customerProductProfile';

const YOGURT_EAN = '8480000205841';
const TECHNICAL_PDF_EAN = '30028777';

const recognition = {
  ingredientFamily: 'dairy_liquid',
  isTechnicalProduct: false,
} as never;

const propose = (scanResult: Record<string, unknown>, gtin = YOGURT_EAN) =>
  customerProductProfileProposal({
    scanResult,
    recognition,
    recognitionEvidence: { gtin } as never,
  });

const yogurtResult = (overrides: Record<string, unknown> = {}) => ({
  identity: {
    displayName: 'Yogur natural con azucar de caña',
    originalName: 'Yogur natural con azucar de caña',
    brand: 'Hacendado',
    explicitlyUnbranded: false,
  },
  barcodes: [{ value: YOGURT_EAN, format: 'EAN_13' }],
  evidence: [],
  productionDeclarations: {
    waterPercent: null,
    totalSolidsPercent: null,
    technicalParametersText: 'Conservar entre 1°C y 8°C.',
  },
  externalSources: [
    {
      url: 'https://preciocesta.com/mercadona/yogur-natural-con-azucar-cana-hacendado-pack-6-20584',
      title: 'Yogur natural con azúcar de caña Hacendado. Precio en Mercadona',
      fieldsUsed: ['productionDeclarations.technicalParametersText'],
      sourceType: 'retailer',
      sourceStatedEan: YOGURT_EAN,
      sourceAuthorityClass: 'AUTHORITATIVE_RETAILER',
      sourceEanConfirmationMethod: 'json_ld',
    },
  ],
  ...overrides,
});

describe('Scanner 2.4 technical-source evidence separation', () => {
  it('SCN-2.4-TECHSRC-01 keeps the owner yogurt storage parameter without inventing a technical source', () => {
    const proposal = propose(yogurtResult());

    expect(proposal?.evidence.fields.technicalParameters).toBe('retailer');
    expect(proposal?.evidenceProvenance.technicalParameters).toMatchObject({
      source: 'retailer',
      sourceAuthorityClass: 'AUTHORITATIVE_RETAILER',
    });
    expect(proposal?.evidence.fields.technicalSource).toBeUndefined();
    expect(proposal?.evidenceProvenance.technicalSource).toBeUndefined();
    expect(proposal?.declared.water_percent).toBeUndefined();
    expect(proposal?.declared.total_solids_percent).toBeUndefined();
  });

  it('SCN-2.4-TECHSRC-02 keeps a label-declared water value without inventing a technical source', () => {
    const result = yogurtResult({
      evidence: [
        {
          field: 'productionDeclarations.waterPercent',
          source: 'label',
          directVisibility: true,
        },
      ],
      externalSources: [],
      productionDeclarations: {
        waterPercent: 87.6,
        totalSolidsPercent: null,
        technicalParametersText: null,
      },
    });
    const proposal = propose(result);

    expect(proposal?.declared.water_percent).toBe(87.6);
    expect(proposal?.evidence.fields.technicalParameters).toBe('label');
    expect(proposal?.evidence.fields.technicalSource).toBeUndefined();
  });

  it('SCN-2.4-TECHSRC-03 keeps a label-declared solids value without inventing a technical source', () => {
    const result = yogurtResult({
      evidence: [
        {
          field: 'productionDeclarations.totalSolidsPercent',
          source: 'label',
          directVisibility: true,
        },
      ],
      externalSources: [],
      productionDeclarations: {
        waterPercent: null,
        totalSolidsPercent: 12.4,
        technicalParametersText: null,
      },
    });
    const proposal = propose(result);

    expect(proposal?.declared.total_solids_percent).toBe(12.4);
    expect(proposal?.evidence.fields.technicalParameters).toBe('label');
    expect(proposal?.evidence.fields.technicalSource).toBeUndefined();
  });

  it('SCN-2.4-TECHSRC-04 retains a real exact-EAN OFFICIAL_TECHNICAL_PDF source', () => {
    // Real staging runtime shape from session 0698ebcc-f8dd-4558-a6bf-9f276f86c16c.
    const result = {
      identity: {
        displayName: 'Elle & Vire Crème Liquide Whipping Cream UHT 35% 200 ml',
        originalName: 'Elle & Vire Crème Liquide Whipping Cream UHT 35% 200 ml',
        brand: 'Elle & Vire',
        explicitlyUnbranded: false,
      },
      barcodes: [{ value: TECHNICAL_PDF_EAN, format: 'EAN_8' }],
      evidence: [],
      productionDeclarations: {
        waterPercent: null,
        totalSolidsPercent: null,
        technicalParametersText:
          'Crème Liquide Stérilisée UHT 35 % MG; conserver réfrigéré entre +2°C et +8°C.',
      },
      externalSources: [
        {
          fieldsUsed: ['productionDeclarations.technicalParametersText'],
          sourceAuthorityClass: 'OFFICIAL_TECHNICAL_PDF',
          sourceEanConfirmationMethod: 'server_enrichment_unfetchable',
          sourceStatedEan: TECHNICAL_PDF_EAN,
          sourceType: 'manufacturer',
          title: 'Elle & Vire Crèmes — Product/packaging specification PDF',
          url: 'https://savencia.kameleon-apps.com/storage/2022/09/26720909.pdf',
        },
      ],
    };
    const proposal = propose(result, TECHNICAL_PDF_EAN);

    expect(proposal?.evidence.fields.technicalSource).toBe('manufacturer');
    expect(proposal?.evidenceProvenance.technicalSource).toMatchObject({
      source: 'manufacturer',
      sourceAuthorityClass: 'OFFICIAL_TECHNICAL_PDF',
      sourceUrl: 'https://savencia.kameleon-apps.com/storage/2022/09/26720909.pdf',
    });
  });

  it.each([
    ['retailer', 'AUTHORITATIVE_RETAILER'],
    ['barcode_registry', 'STRUCTURED_PRODUCT_DATABASE'],
    ['web_search', 'OTHER_WEB'],
  ])(
    'SCN-2.4-TECHSRC-05 does not escalate %s parameter provenance into technical-source authority',
    (sourceType, sourceAuthorityClass) => {
      const base = yogurtResult();
      const result = {
        ...base,
        externalSources: [
          {
            ...base.externalSources[0],
            sourceType,
            sourceAuthorityClass,
          },
        ],
      };

      const proposal = propose(result);
      expect(proposal?.evidence.fields.technicalParameters).toBe(sourceType);
      expect(proposal?.evidence.fields.technicalSource).toBeUndefined();
      expect(proposal?.evidenceProvenance.technicalSource).toBeUndefined();
    },
  );
});
