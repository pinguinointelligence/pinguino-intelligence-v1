import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const edge = readFileSync(
  resolve(process.cwd(), 'supabase/functions/catalog-submit/index.ts'),
  'utf8',
);

describe('INTIMPORT evidence stays server-authoritative', () => {
  it('rejects invented evidence vocabulary and browser-supplied final accuracy', () => {
    expect(edge).toContain(
      'if (Object.keys(rawProposal).some((key) => !allowedProposalKeys.has(key))) return null;',
    );
    expect(edge).toContain(
      'if (Object.keys(rawEvidence).some((key) => !allowedEvidenceKeys.has(key))) return null;',
    );
    expect(edge).toContain('!EVIDENCE_SOURCES.has(source as EvidenceSource)');
    expect(edge).not.toContain("'manufacturer_verified'");
    expect(edge).not.toContain("'label_verified'");
    expect(edge).not.toMatch(/allowedProposalKeys[\s\S]{0,500}'productAccuracy'/);
  });

  it('credits web evidence only through the user-owned usage ledger and exact request hash', () => {
    expect(edge).toContain(".from('intimport_enrichment_usage')");
    expect(edge).toContain(".eq('user_id', input.actorUserId)");
    expect(edge).toContain(".in('idempotency_key', receipts)");
    expect(edge).toContain('const expectedV2Receipt = await sha256Text(');
    expect(edge).toContain('const expectedLegacyReceipt = await sha256Text(');
    expect(edge).toContain('const storedRequestIdentity = objectValue(result.requestIdentity);');
    expect(edge).toContain('discoveredBarcodes.has(normalizedCurrentBarcode)');
    expect(edge).toMatch(
      /receipt\s*!==\s*\(Object\.keys\(researchStep\)\.length\s*>\s*0\s*\?\s*expectedV2Receipt\s*:\s*expectedLegacyReceipt\)/,
    );
    expect(edge).toContain('fact.sourceAuthorityClass !== authority.authority');
    expect(edge).toContain('fact.evidenceSource !== authority.evidenceSource');
  });

  it('rebuilds and compares evidence before invoking the deterministic server scorer', () => {
    expect(edge).toContain('const trustedEvidence = await trustedIntimportEvidence({');
    expect(edge).toContain(
      'if (stableJson(evidence) !== stableJson(input.proposal.evidence)) return null;',
    );
    expect(edge).toContain('evidence: trustedEvidence.evidence');
  });
});
