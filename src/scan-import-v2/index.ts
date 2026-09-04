export * from './contracts';
export { identifyCode, gtinValid, gtinCheckDigit, expandUpce } from './codeIdentity';
export { resolveIdentity, topCandidates, strengthScore } from './resolver';
export { runScanImportV2, idempotencyKey, CONFIDENCE } from './pipeline';
export { compareWithLegacy } from './legacyComparison';
