export * from './contracts';
export { identifyCode, gtinValid, gtinCheckDigit, expandUpce } from './codeIdentity';
export { resolveIdentity, topCandidates, strengthScore } from './resolver';
export { runScanImportV2, idempotencyKey, CONFIDENCE } from './pipeline';
export { compareWithLegacy } from './legacyComparison';
export * from './discovery/contracts';
export { buildLedger, stageFromLedger } from './discovery/ledger';
export { startDiscovery, continueDiscovery, discoveredExact } from './discovery/discovery';
export {
  createMemoryStore,
  createWebStorageStore,
  createIndexedDbStore,
} from './offline/persistentStore';
export type { KeyValueStore, WebStorageLike } from './offline/persistentStore';
export {
  createSupabaseV2Ports,
  createOfflineCache,
  candidateFromGtinRow,
  OFFLINE_CACHE_TTL_MS,
  OFFLINE_CACHE_SCHEMA,
} from './adapters/supabaseAdapters';
export { createSupabaseDiscoveryPort } from './adapters/supabaseDiscoveryAdapter';
export { fileToLabelImage, dataUrlToLabelImage, LABEL_IMAGE_TRANSFORMATIONS } from './labelImage';
export {
  createOpenFoodFactsEvidencePort,
  evidenceFromProduct,
  familyFromEvidence,
  identityFromEvidence,
  OPEN_FOOD_FACTS_PROVIDER,
  type ExactWebIdentity,
} from './adapters/openFoodFactsEvidence';
