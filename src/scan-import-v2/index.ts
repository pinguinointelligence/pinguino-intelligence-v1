export * from './contracts';
export { identifyCode, gtinValid, gtinCheckDigit, expandUpce } from './codeIdentity';
export { resolveIdentity, topCandidates, strengthScore } from './resolver';
export { runScanImportV2, idempotencyKey, CONFIDENCE } from './pipeline';
export { compareWithLegacy } from './legacyComparison';
export * from './discovery/contracts';
export { buildLedger, stageFromLedger } from './discovery/ledger';
export { startDiscovery, continueDiscovery, discoveredExact } from './discovery/discovery';
