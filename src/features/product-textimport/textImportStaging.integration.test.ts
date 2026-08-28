import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { validateBarcode } from '@/features/product-scanner/barcode';
import { adaptTextImportRow, type TextImportRow } from './textImportAdapter';
import {
  existingEanHandoff,
  resolvedEanHandoff,
  textImportEanQuery,
  type TextImportScannerHandoff,
} from './textImportEanResolver';
import type { TextImportEanResolverResult } from './eanResolverContract';

const runStaging = process.env.TEXTIMPORT_STAGING_PROOF === 'true' ? it : it.skip;
const evidenceFields = [
  'identity.displayName',
  'identity.brand',
  'package.netQuantity',
  'nutrition.energyKcal',
  'nutrition.fat',
  'nutrition.carbohydrate',
  'nutrition.protein',
  'nutrition.salt',
  'ingredientsText',
  'allergensText',
].join(';');

const shared = {
  'Country Code': 'PL',
  Category: 'Bakery & sweets',
  Brand: 'Baitz',
  Manufacturer: 'not_found',
  'Net Quantity Unit': 'g',
  'Nutrition Basis': '100 g',
  'EAN / GTIN': 'not_found',
  'Country of Origin': 'not_found',
  'Professional Dosage': 'not_applicable',
  'Technical Parameters': 'not_applicable',
  'Primary Source URL': 'https://www.biedronka.pl/pl/baitz',
  'Evidence Source Type': 'retailer',
  'Evidence Source URL': 'https://www.biedronka.pl/pl/baitz',
  'Evidence Fields': evidenceFields,
} as const;

const rows: TextImportRow[] = [
  {
    rowIndex: 1,
    cells: {
      ...shared,
      'Product ID': 'PL-BIE-00162',
      'Product Name Original':
        'Baton w czekoladzie mlecznej z wiórkami kokosowymi Baitz Choco Cocos',
      'Variant Original': 'kokos',
      'Net Quantity Value': '50',
      'Ingredients Original':
        'czekolada mleczna 27% (cukier, tłuszcz kakaowy, mleko pełne w proszku, miazga kakaowa, emulgator: lecytyny ze słonecznika, ekstrakt waniliowy), cukier, wiórki kokosowe 24,5%, syrop glukozowy, serwatka w proszku (z mleka), substancje stabilizujące: gliceryna, inwertaza; może zawierać zboża zawierające gluten, soję, sezam, orzeszki arachidowe i inne orzechy',
      Allergens: 'mleko; zboża zawierające gluten; soja; orzeszki ziemne; orzechy; sezam',
      'Energy kJ': '2013',
      'Energy kcal': '481',
      'Fat g': '25',
      'Saturated Fat g': '20',
      'Carbohydrates g': '58',
      'Sugars g': '50',
      'Fibre g': '4',
      'Protein g': '4.1',
      'Salt g': '0.07',
      'Evidence Source Title':
        'Baton w czekoladzie mlecznej z wiórkami kokosowymi Baitz Choco Cocos',
    },
  },
  {
    rowIndex: 2,
    cells: {
      ...shared,
      'Product ID': 'PL-BIE-00158',
      'Product Name Original': 'Caramel & Peanuts Waffle Baitz',
      'Variant Original': 'karmel i orzeszki ziemne',
      'Net Quantity Value': '73',
      'Ingredients Original':
        'cukier, wafel z kremem kakaowym [mąka pszenna, tłuszcz palmowy, cukier, serwatka w proszku (z mleka), kakao w proszku o obniżonej zawartości tłuszczu 3,2%, mleko w proszku odtłuszczone, olej rzepakowy, sól, emulgator: lecytyny; substancja spulchniająca: węglany sodu], tłuszcz kakaowy, mleko w proszku pełne, nadzienie karmelowe [syrop glukozowy, mleko zagęszczone słodzone (mleko, cukier), syrop cukru inwertowanego, tłuszcz kokosowy, olej rzepakowy, tłuszcz mleczny, emulgatory: mono- i diglicerydy kwasów tłuszczowych, lecytyny; sól, cukier palony], orzeszki arachidowe 5,9%, miazga kakaowa, serwatka w proszku (z mleka), tłuszcze roślinne (palmowy, shea), kawałki orzeszków arachidowych, mleko w proszku odtłuszczone, pasta z orzechów laskowych, tłuszcz mleczny, emulgator: lecytyny (z soi), sól, naturalny aromat orzeszka arachidowego (zawiera orzeszki arachidowe), naturalny aromat; może zawierać inne orzechy i jaja',
      Allergens: 'mleko; orzeszki ziemne; orzechy laskowe; orzechy; jaja',
      'Energy kJ': '2182',
      'Energy kcal': '523',
      'Fat g': '31',
      'Saturated Fat g': '17',
      'Carbohydrates g': '52',
      'Sugars g': '44',
      'Fibre g': '1.9',
      'Protein g': '7.4',
      'Salt g': '0.41',
      'Evidence Source Title': 'Caramel & Peanuts Waffle Baitz',
    },
  },
  {
    rowIndex: 3,
    cells: {
      ...shared,
      'Product ID': 'PL-BIE-00163',
      'Product Name Original':
        'Chrupiące herbatniki Baitz Czeko Sandwich z nadzieniem z czekolady mlecznej',
      'Variant Original': 'nadzienie z czekolady mlecznej',
      'Net Quantity Value': '168',
      'Ingredients Original': 'not_found',
      Allergens: 'not_found',
      'Energy kJ': '2152',
      'Energy kcal': '514',
      'Fat g': '26',
      'Saturated Fat g': '14',
      'Carbohydrates g': '64',
      'Sugars g': '32',
      'Fibre g': '0.8',
      'Protein g': '6.7',
      'Salt g': '0.43',
      'Evidence Source Title':
        'Chrupiące herbatniki Baitz Czeko Sandwich z nadzieniem z czekolady mlecznej',
    },
  },
];

const control = {
  sourceRowId: 'PL-BIE-00005',
  ean: '5900120025578',
  productId: '1f6d861a-9e39-44df-9fc1-b91c9f721c78',
  productCode: 'PR-ING-007158',
} as const;

const controlRow: TextImportRow = {
  rowIndex: 4,
  cells: {
    'Product ID': control.sourceRowId,
    'Country Code': 'PL',
    Category: 'Dairy',
    Brand: 'Mleczna Dolina',
    Manufacturer: 'Okręgowa Spółdzielnia Mleczarska w Łowiczu',
    'Product Name Original': 'Masło Ekstra bez laktozy Mleczna Dolina 82% tłuszczu; bez laktozy',
    'Variant Original': '82% tłuszczu; bez laktozy',
    'Net Quantity Value': '200',
    'Net Quantity Unit': 'g',
    'Nutrition Basis': 'not_found',
    'Ingredients Original': 'not_found',
    Allergens: 'mleko',
    'EAN / GTIN': control.ean,
    'Country of Origin': 'PL',
    'Professional Dosage': 'not_applicable',
    'Technical Parameters': 'not_applicable',
    'Primary Source URL': 'not_found',
    'Evidence Source Type': 'not_found',
    'Evidence Source URL': 'not_found',
    'Evidence Source Title': 'PL_POLAND_GELLATTI_SEMANTIC_CLASSIFIED.xlsx',
    'Evidence Fields': 'identity.displayName;identity.brand;package.netQuantity;barcodes',
  },
};

type FunctionResult = { status: number; ok: boolean; body: Record<string, unknown> };

type CanonicalAuthority = {
  versionId: string;
  version: number;
  productAccuracy: unknown;
  effectiveProfile: {
    authority: unknown;
    mapperSimilarity: unknown;
    mapperProfileBasis: unknown;
    estimatedFromMapperIds: unknown;
    engineUsable: unknown;
  };
  productAccuracyAssessment: unknown;
  blockers: unknown;
  readiness: unknown;
  productBehavior: unknown;
};

runStaging(
  'traces at most four real Poland rows through the staging resolver and frozen Scanner',
  async () => {
    const url = process.env.STAGING_SUPABASE_URL!;
    const anonKey = process.env.STAGING_SUPABASE_ANON_KEY!;
    const email = process.env.STAGING_QA_EMAIL!;
    const password = process.env.STAGING_QA_PASSWORD!;
    expect(new URL(url).hostname).toBe('tunabqqrwabacxjcxxkz.supabase.co');
    expect(anonKey && email && password).toBeTruthy();

    const login = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const loginBody = (await login.json()) as { access_token?: string };
    expect(login.ok).toBe(true);
    expect(loginBody.access_token).toBeTruthy();
    const authorization = `Bearer ${loginBody.access_token}`;

    const invoke = async (name: string, body: unknown): Promise<FunctionResult> => {
      const response = await fetch(`${url}/functions/v1/${name}`, {
        method: 'POST',
        headers: {
          Authorization: authorization,
          apikey: anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      return {
        status: response.status,
        ok: response.ok,
        body: (await response.json()) as Record<string, unknown>,
      };
    };

    const restGet = async <T>(path: string): Promise<T> => {
      const response = await fetch(`${url}/rest/v1/${path}`, {
        headers: { Authorization: authorization, apikey: anonKey },
      });
      expect(response.ok).toBe(true);
      return (await response.json()) as T;
    };

    const record = (value: unknown): Record<string, unknown> =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};

    const canonicalAuthority = async (productId: string): Promise<CanonicalAuthority> => {
      const versions = await restGet<
        Array<{ id: string; version: number; snapshot: Record<string, unknown> }>
      >(
        `global_catalog_product_versions?product_id=eq.${productId}&order=version.desc&limit=1&select=id,version,snapshot`,
      );
      expect(versions).toHaveLength(1);
      const version = versions[0]!;
      const intelligence = record(version.snapshot.productIntelligence);
      const assessment = record(intelligence.productAccuracyAssessment);
      return {
        versionId: version.id,
        version: version.version,
        productAccuracy: version.snapshot.productAccuracy,
        effectiveProfile: {
          authority: intelligence.authority,
          mapperSimilarity: intelligence.mapperSimilarity,
          mapperProfileBasis: intelligence.mapperProfileBasis,
          estimatedFromMapperIds: intelligence.estimatedFromMapperIds,
          engineUsable: intelligence.engineUsable,
        },
        productAccuracyAssessment: intelligence.productAccuracyAssessment,
        blockers: assessment.criticalBlockers,
        readiness: record(assessment.gellattiReadiness),
        productBehavior: intelligence.productBehaviorAuthority,
      };
    };

    const currentVariants = () =>
      restGet<Array<{ id: string; product_id: string; ean: string }>>(
        `global_catalog_variants?ean=eq.${control.ean}&is_current=eq.true&select=id,product_id,ean`,
      );

    const proofRunId = `proof-${Date.now().toString(36)}`;
    const traces: Record<string, unknown>[] = [];

    const handoffToScanner = async (
      row: TextImportRow,
      handoff: TextImportScannerHandoff,
      resolverResult: TextImportEanResolverResult | { status: 'SKIPPED_VALID_EAN' },
    ) => {
      const sessionId = randomUUID();
      const barcode = validateBarcode(handoff.scannerInput.barcodes[0]!.value)!;
      const scannerEanLookupInput = {
        mode: 'ean_lookup',
        sessionId,
        images: [],
        barcode,
      } as const;
      const ingress = await invoke('product-textimport-adapt', {
        sessionId,
        adapter: {
          version: 'gellatti_textimport_adapter_v1',
          rowIndex: row.rowIndex,
          sourceRowId: handoff.sourceRowId,
        },
        result: handoff.scannerInput,
      });
      const analyze = ingress.ok
        ? await invoke('product-scan-analyze', scannerEanLookupInput)
        : null;
      let preview: FunctionResult | null = null;
      let finalization: FunctionResult | null = null;
      if (analyze?.ok && analyze.body.kind !== 'existing_product') {
        preview = await invoke('product-scan-finalize', {
          action: 'preview',
          sessionId,
          idempotencyKey: `textimport-preview-${sessionId}`,
          confirmations: { productFields: {}, packageEvidenceExhausted: true },
        });
        if (preview.ok && preview.body.kind === 'profile_preview' && preview.body.ready === true) {
          finalization = await invoke('product-scan-finalize', {
            action: 'finalize',
            sessionId,
            idempotencyKey: `textimport-finalize-${sessionId}`,
            confirmations: { productFields: {}, packageEvidenceExhausted: true },
            privateOverlay: {},
          });
        }
      }
      const canonical =
        analyze?.ok && analyze.body.kind === 'existing_product'
          ? await canonicalAuthority(String(record(analyze.body.product).id))
          : null;
      const exactFinalResult = finalization ?? preview ?? analyze ?? ingress;
      const trace = {
        row: row.cells['Product ID'],
        adapterOutput: adaptTextImportRow(row),
        resolverResult,
        exactScannerInput: handoff.scannerInput,
        exactScannerEanLookupInput: scannerEanLookupInput,
        sessionId,
        ingress,
        eanLookup: analyze,
        canonicalAuthority: canonical,
        finalizerInvocation:
          analyze?.body.kind === 'existing_product'
            ? 'SKIPPED_BY_FROZEN_SCANNER_EXISTING_PRODUCT_SHORT_CIRCUIT'
            : preview
              ? 'EXISTING_PRODUCT_SCAN_FINALIZE'
              : 'NOT_REACHED',
        finalizerPreview: preview,
        finalizerResult: finalization,
        accuracy: preview?.body.productAccuracy ?? canonical?.productAccuracy ?? null,
        accuracyAssessment:
          preview?.body.productAccuracyAssessment ?? canonical?.productAccuracyAssessment ?? null,
        blockers: preview?.body.criticalGaps ?? canonical?.blockers ?? null,
        readiness: preview
          ? {
              ready: preview.body.ready ?? null,
              engineUsable: preview.body.engineUsable ?? null,
              roleReadiness:
                (preview.body.productAccuracyAssessment as Record<string, unknown> | undefined)
                  ?.roleReadiness ?? null,
            }
          : (canonical?.readiness ?? null),
        productBehavior: preview?.body.productBehavior ?? canonical?.productBehavior ?? null,
        canonicalPrDedupe:
          analyze?.body.kind === 'existing_product'
            ? analyze.body.product
            : (finalization?.body ?? null),
        exactFinalScannerResult: exactFinalResult,
      };
      traces.push(trace);
      return trace;
    };

    for (const row of rows) {
      const adapter = adaptTextImportRow(row);
      const query = textImportEanQuery(adapter)!;
      const resolver = await invoke('product-textimport-ean-resolve', { runId: proofRunId, query });
      expect(resolver.ok).toBe(true);
      const resolverResult = resolver.body as unknown as TextImportEanResolverResult;
      expect(resolverResult.query).toEqual(query);
      expect(resolverResult.research.budget).toMatchObject({
        rowWebCallCap: 6,
        runWebCallCap: 18,
        worstCaseWebCallsPerRequest: 3,
      });
      expect(resolverResult.research.budget.rowWebCallsReserved).toBeLessThanOrEqual(6);
      expect(resolverResult.research.budget.runWebCallsReserved).toBeLessThanOrEqual(18);
      expect(resolverResult.research.providerRequestsUsed).toBeLessThanOrEqual(2);
      if (resolverResult.status === 'EAN_NOT_FOUND') {
        expect(resolverResult.research.completedSteps).toHaveLength(2);
        expect(resolverResult.searchedSteps).toEqual(resolverResult.research.completedSteps);
      }
      if (resolverResult.status === 'EAN_RESOLUTION_BLOCKED') {
        expect(resolverResult.reason).toBeTruthy();
        expect(resolverResult.blockedStep).not.toBeNull();
      }
      if (resolverResult.status === 'EAN_RESOLVED') {
        expect(validateBarcode(resolverResult.ean)?.value).toBe(resolverResult.ean);
        const handoff = resolvedEanHandoff(adapter, resolverResult);
        expect(handoff).not.toBeNull();
        await handoffToScanner(row, handoff!, resolverResult);
      } else {
        traces.push({
          row: row.cells['Product ID'],
          adapterOutput: adapter,
          resolverQuery: query,
          resolverResult,
          exactFailureStage: 'PRE_SCANNER_EAN_RESOLVER',
          exactScannerInput: null,
          exactFinalScannerResult: null,
        });
      }
    }

    const variantsBefore = await currentVariants();
    expect(variantsBefore).toHaveLength(1);
    expect(variantsBefore[0]).toMatchObject({ product_id: control.productId, ean: control.ean });

    const normalScannerInput = {
      mode: 'ean_lookup',
      sessionId: randomUUID(),
      images: [],
      barcode: validateBarcode(control.ean)!,
    } as const;
    const normalScanner = await invoke('product-scan-analyze', normalScannerInput);
    expect(normalScanner.ok).toBe(true);
    expect(normalScanner.body).toMatchObject({
      kind: 'existing_product',
      product: {
        id: control.productId,
        productCode: control.productCode,
        productAccuracy: 96,
        engineReady: true,
      },
    });
    const normalCanonicalAuthority = await canonicalAuthority(control.productId);
    expect(normalCanonicalAuthority).toMatchObject({
      productAccuracy: 96,
      effectiveProfile: {
        authority: 'PRODUCT_PROFILE_V1',
        mapperSimilarity: 0.94,
        mapperProfileBasis: 'brand_sibling',
        estimatedFromMapperIds: ['PI-ING-000176'],
        engineUsable: true,
      },
      blockers: [],
      readiness: { ready: true, status: 'BASE_READY', blockers: [] },
      productBehavior: {
        authority: 'PRODUCT_BEHAVIOR_V1',
        classificationOutcome: 'classified',
        baseRecipeEligible: true,
        toppingEligible: false,
        behaviorRole: 'STANDARD_ONLY',
        intendedUsageRole: 'BASE_ONLY',
      },
    });

    const controlAdapter = adaptTextImportRow(controlRow);
    expect(textImportEanQuery(controlAdapter)).toBeNull();
    const controlHandoff = existingEanHandoff(controlAdapter);
    expect(controlHandoff).not.toBeNull();
    const controlTrace = await handoffToScanner(controlRow, controlHandoff!, {
      status: 'SKIPPED_VALID_EAN',
    });
    const textimportScanner = controlTrace.eanLookup as FunctionResult;
    const textimportCanonicalAuthority = controlTrace.canonicalAuthority as CanonicalAuthority;
    expect(textimportScanner.body.product).toEqual(normalScanner.body.product);
    expect(textimportScanner.body.usage).toEqual(normalScanner.body.usage);
    expect(textimportCanonicalAuthority).toEqual(normalCanonicalAuthority);

    const variantsAfter = await currentVariants();
    expect(variantsAfter).toEqual(variantsBefore);

    expect(traces).toHaveLength(4);
    console.log(
      `TEXTIMPORT_STAGING_TRACE=${JSON.stringify({
        proofRunId,
        traces,
        controlParity: {
          identity: control,
          normalScanner: {
            exactScannerEanLookupInput: normalScannerInput,
            result: normalScanner,
            canonicalAuthority: normalCanonicalAuthority,
          },
          textimport: {
            adapterOutput: controlAdapter,
            exactScannerInput: controlHandoff!.scannerInput,
            result: textimportScanner,
            canonicalAuthority: textimportCanonicalAuthority,
          },
          canonicalPrReused: control.productCode,
          variantsBefore,
          variantsAfter,
          duplicatesCreated: variantsAfter.length - variantsBefore.length,
        },
      })}`,
    );
  },
  300_000,
);
