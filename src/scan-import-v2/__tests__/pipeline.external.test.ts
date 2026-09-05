/** exact-GTIN registry evidence travels with the discovery result, gathered in parallel with the research */
import { describe, expect, it } from 'vitest';
import type { ExternalEvidence } from '../contracts';
import { runScanImportV2 } from '../pipeline';
import { scan } from './codeIdentity.test';
import { FakeDiscovery } from './fakeDiscovery';
import { ctx, ports } from './fakes';

const UNKNOWN = '7622210669315';
const evidence: ExternalEvidence = {
  provider: 'openfoodfacts',
  queriedAt: 1,
  query: UNKNOWN,
  facts: [
    {
      field: 'identity.displayName',
      value: 'Choco brownie',
      sourceUrl: 'u',
      authority: 'barcode_registry',
    },
    { field: 'identity.brand', value: 'Milka', sourceUrl: 'u', authority: 'barcode_registry' },
  ],
  confidence: 0.9,
};

describe('pipeline — registry evidence alongside discovery', () => {
  it('a pending discovery carries the registry evidence; the server research still ran', async () => {
    const discovery = new FakeDiscovery();
    const p = ports({
      discovery,
      external: { research: async () => evidence },
      externalTimeoutMs: 100,
    });
    const r = await runScanImportV2(scan(UNKNOWN), ctx(), p);
    expect(r.kind).toBe('discovered_pending');
    if (r.kind === 'discovered_pending') expect(r.externalEvidence).toEqual(evidence);
    expect(discovery.calls).toContain(`research:${UNKNOWN}`);
  });

  it('a slow or broken registry never blocks discovery (evidence null)', async () => {
    const discovery = new FakeDiscovery();
    const slow = ports({
      discovery,
      external: { research: () => new Promise(() => undefined) },
      externalTimeoutMs: 20,
    });
    const r = await runScanImportV2(scan(UNKNOWN), ctx(), slow);
    expect(r.kind).toBe('discovered_pending');
    if (r.kind === 'discovered_pending') expect(r.externalEvidence).toBeNull();
    const broken = ports({
      discovery: new FakeDiscovery(),
      external: {
        research: async () => {
          throw new Error('boom');
        },
      },
    });
    const b = await runScanImportV2(scan(UNKNOWN), ctx(), broken);
    expect(b.kind).toBe('discovered_pending');
    if (b.kind === 'discovered_pending') expect(b.externalEvidence).toBeNull();
  });

  it('a known code never consults the registry', async () => {
    let calls = 0;
    const p = ports({
      discovery: new FakeDiscovery(),
      external: {
        research: async () => {
          calls += 1;
          return evidence;
        },
      },
    });
    const r = await runScanImportV2(scan('8402001047251'), ctx(), p);
    expect(r.kind).toBe('resolved_exact');
    expect(calls).toBe(0);
  });
});
