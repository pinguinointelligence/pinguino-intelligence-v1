import { describe, expect, it } from 'vitest';
import type { ServerResolvedProductBehavior } from './contracts';
import {
  productBehaviorSnapshotFingerprint,
  snapshotServerResolvedProductBehavior,
} from './productBehaviorResolver';
import { productBehaviorModuleGate } from './productBehaviorAccess';
import { productBehaviorBlockedMessage } from '@/services/productIntelligence';

const resolved = (
  overrides: Partial<ServerResolvedProductBehavior> = {},
): ServerResolvedProductBehavior => ({
  schemaVersion: 1,
  resolverVersion: 'server-resolver-v1',
  entityKind: 'catalog_product_version',
  productId: 'product-1',
  productVersionId: 'version-1',
  factsFingerprint: 'facts-1',
  catalogStatus: 'verified',
  provenance: 'ocr',
  behaviorBindingId: 'binding-1',
  behaviorBindingVersion: 'classifier-v1',
  taxonomyVersion: 'taxonomy-v1',
  mapperIngredientId: 'PI-ING-001553',
  familyId: 'fruit',
  subfamilyId: 'berry',
  formId: 'fresh',
  mainEligibility: 'MAIN_PROFILE_SPECIFIC',
  veganEligibility: 'verified',
  proteinBehavior: 'neutral',
  processBehavior: { decision: 'COLD_PROCESS_OK' },
  approvedLiquidDairyCarrier: false,
  context: {
    accountId: 'account-1',
    productProfile: 'milk_gelato',
    temperatureC: -12,
    mode: 'optimal',
    processScope: 'BASE_FORMULATION',
    requestedRole: 'MAIN',
    module: 'MAIN',
  },
  module: 'MAIN',
  state: 'eligible',
  moduleEligibility: {
    BASE_RECIPE: 'eligible', MAIN: 'eligible', OPTIMAL: 'eligible', ECO: 'eligible',
    MONITOR: 'eligible', SAVE: 'eligible', PRODUCTION: 'eligible',
  },
  mainPolicy: {
    policyId: 'main-berry-fresh-dairy', policyVersion: '2', familyId: 'fruit',
    subfamilyId: 'berry', formId: 'fresh', basis: 'FRUIT_EQUIVALENT',
    ecoFloorPercent: 25, optimalCeilingPercent: 35, hardLimitPercent: 45,
    mainEquivalentFactor: 1, requiresLiquidDairyCarrier: true,
    liquidDairyCarrierFloorPercent: 30, approvedMixedFamilyIds: [],
    evidenceStatus: 'owner_provisional',
  },
  sharedFacts: {
    schemaVersion: 1,
    technicalComposition: { water: 86, totalSolids: 14 },
    nutritionPer100g: null,
    allergens: null,
    processEvidence: [],
    profileEligibility: ['milk_gelato'],
    veganEligibility: 'verified',
    proteinBehavior: 'neutral',
    referencePrice: { pricePerKg: 5, currency: 'EUR', sourceVersion: 'mapper-v1' },
  },
  privateOverlay: {
    favorite: true, recentAt: null, privatePricePerKg: 4, privatePriceCurrency: 'EUR',
    supplier: 'Private supplier', note: 'Private note', stock: 2,
  },
  warnings: [],
  blockReasons: [],
  ...overrides,
});

describe('server Product Behavior snapshot boundary', () => {
  it('names the exact technical field, Mapper id, version and module in a blocked message', () => {
    expect(productBehaviorBlockedMessage(resolved({
      state: 'blocked',
      blockReasons: [
        'missing_technical_fields:pod_value,pac_value:product-2113:PI-ING-002113:version-2113:OPTIMAL:complete_technical_fields',
      ],
    }))).toBe(
      'Dokładny produkt product-2113 · wersja version-2113 · Mapper PI-ING-002113 · moduł OPTIMAL nie ma wymaganych pól technicznych: pod_value,pac_value. Uzupełnij wskazane pola i przelicz ponownie.',
    );
  });

  it('parses approval and process reason schemas without shifting Mapper/version/module', () => {
    expect(productBehaviorBlockedMessage(resolved({
      state: 'blocked',
      blockReasons: ['approved_for_base_false:product-2113:PI-ING-002113:version-2113:BASE_RECIPE:choose_base_approved_product'],
    }))).toBe(
      'Dokładny produkt product-2113 · wersja version-2113 · Mapper PI-ING-002113 · moduł BASE_RECIPE ma approved_for_base=false. Wybierz produkt zatwierdzony dla Base.',
    );
    expect(productBehaviorBlockedMessage(resolved({
      state: 'blocked',
      blockReasons: ['approved_for_engines_false:product-2113:PI-ING-002113:version-2113:OPTIMAL:choose_engine_approved_product'],
    }))).toBe(
      'Dokładny produkt product-2113 · wersja version-2113 · Mapper PI-ING-002113 · moduł OPTIMAL ma approved_for_engines=false. Może pozostać w Base, ale PI nie wykona obliczeń; wybierz produkt zatwierdzony dla Engine.',
    );
    // A legacy `process_evidence_unknown` reason has no message any more: the
    // server no longer emits it as a blocker, and process is informational.
    expect(
      productBehaviorBlockedMessage(
        resolved({
          state: 'blocked',
          blockReasons: [
            'process_evidence_unknown:product-405:PI-ING-000405:version-405:PRODUCTION:add_process_evidence',
          ],
        }),
      ),
    ).not.toContain('dowod');
    expect(productBehaviorBlockedMessage(resolved({
      state: 'blocked',
      blockReasons: ['profile_not_approved:product-405:PI-ING-000405:version-405:ECO:change_profile_or_product'],
    }))).toBe(
      'Dokładny produkt product-405 · wersja version-405 · Mapper PI-ING-000405 · moduł ECO nie jest zgodny z bieżącym profilem. Zmień profil albo wybierz zgodny produkt.',
    );
    expect(productBehaviorBlockedMessage(resolved({
      state: 'blocked',
      blockReasons: ['module_permission_missing:product-405:PI-ING-000405:version-405:LABEL:choose_module_eligible_product'],
    }))).toBe(
      'Dokładny produkt product-405 · wersja version-405 · Mapper PI-ING-000405 · moduł LABEL nie ma uprawnienia ProductBehavior do tego modułu. Wybierz wersję kwalifikowaną dla modułu albo uzupełnij jego wymagane dane.',
    );
  });

  it('keeps stale and legacy resolver blockers exact on picker and handoff surfaces', () => {
    expect(productBehaviorBlockedMessage(resolved({
      state: 'blocked',
      blockReasons: [
        'product_version_stale:product-405:PI-ING-000405:version-405:OPTIMAL:refresh_product_data',
      ],
    }))).toContain(
      'produkt product-405 · wersja version-405 · Mapper PI-ING-000405 · moduł OPTIMAL',
    );
    expect(productBehaviorBlockedMessage(resolved({
      state: 'blocked',
      blockReasons: [
        'legacy_product_reference_unresolved:product-405:PI-ING-000405:version-405:RESTORE:repair_legacy_reference',
      ],
    }))).toContain('Napraw referencję produktu');
  });

  it('preserves Estimated Mapper provenance and never promotes legacy pi_base to Verified', () => {
    const estimated = snapshotServerResolvedProductBehavior({
      lineId: 'watermelon',
      processScope: 'BASE_FORMULATION',
      resolved: resolved({
        entityKind: 'mapper', catalogStatus: 'estimated', provenance: 'mapper',
        mapperVerificationStatus: 'Estimated',
      }),
    });
    expect(estimated.verificationState).toBe('estimated');
    expect(estimated.source).toBe('mapper');
    expect(estimated.mapperVerificationStatus).toBe('Estimated');

    const legacy = snapshotServerResolvedProductBehavior({
      lineId: 'legacy-mapper',
      processScope: 'BASE_FORMULATION',
      resolved: resolved({ entityKind: 'mapper', catalogStatus: 'pi_base', provenance: 'mapper' }),
    });
    expect(legacy.verificationState).toBe('manual_unverified');
  });
  it('freezes the exact server policy, context and module matrix', () => {
    const snapshot = snapshotServerResolvedProductBehavior({
      lineId: 'line-1', processScope: 'BASE_FORMULATION', resolved: resolved(),
    });
    expect(snapshot).toMatchObject({
      resolutionState: 'RESOLVED', productVersionId: 'version-1',
      mainPolicyId: 'main-berry-fresh-dairy', mainPolicyVersion: '2',
      ecoFloorPercent: 25, optimalCeilingPercent: 35, hardLimitPercent: 45,
      resolutionContext: { productProfile: 'milk_gelato', temperatureC: -12, mode: 'optimal' },
      moduleEligibility: { BASE_RECIPE: 'eligible', MAIN: 'eligible', OPTIMAL: 'eligible' },
    });
  });

  it('never persists the account-private overlay inside shared recipe authority', () => {
    const snapshot = snapshotServerResolvedProductBehavior({
      lineId: 'line-1', processScope: 'BASE_FORMULATION', resolved: resolved(),
    });
    expect(snapshot.sharedFacts?.referencePrice?.pricePerKg).toBe(5);
    expect(snapshot).not.toHaveProperty('privateOverlay');
    expect(JSON.stringify(snapshot)).not.toContain('Private supplier');
    expect(JSON.stringify(snapshot)).not.toContain('Private note');
  });

  it('fails write-capable module gates closed when the server denied that module', () => {
    const snapshot = snapshotServerResolvedProductBehavior({
      lineId: 'line-1', processScope: 'BASE_FORMULATION',
      resolved: resolved({ state: 'blocked', module: 'SAVE', moduleEligibility: { SAVE: 'blocked' } }),
    });
    expect(productBehaviorModuleGate({ 'line-1': snapshot }, 'SAVE', ['line-1'])).toMatchObject({
      ready: false, blockedLineIds: ['line-1'],
    });
  });

  it('includes product, policy, context and shared facts in the recipe fingerprint', () => {
    const snapshot = snapshotServerResolvedProductBehavior({
      lineId: 'line-1', processScope: 'BASE_FORMULATION', resolved: resolved(),
    });
    const first = productBehaviorSnapshotFingerprint({ 'line-1': snapshot });
    expect(productBehaviorSnapshotFingerprint({
      'line-1': { ...snapshot, mainPolicyVersion: '3' },
    })).not.toBe(first);
    expect(productBehaviorSnapshotFingerprint({
      'line-1': {
        ...snapshot,
        resolutionContext: { ...snapshot.resolutionContext!, temperatureC: -13 },
      },
    })).not.toBe(first);
    expect(productBehaviorSnapshotFingerprint({
      'line-1': {
        ...snapshot,
        sharedFacts: { ...snapshot.sharedFacts!, technicalComposition: { water: 85 } },
      },
    })).not.toBe(first);
  });
});
