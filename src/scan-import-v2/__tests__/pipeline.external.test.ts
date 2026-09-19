/** Authenticated discovery owns exact-GTIN evidence; a legacy client registry port is never read. */
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

describe('pipeline — server-owned registry evidence during discovery', () => {
  it('a pending discovery carries no parallel client evidence; the server research still ran', async () => {
    const discovery = new FakeDiscovery();
    let clientCalls = 0;
    const p = ports({
      discovery,
      external: {
        research: async () => {
          clientCalls += 1;
          return evidence;
        },
      },
      externalTimeoutMs: 100,
    });
    const r = await runScanImportV2(scan(UNKNOWN), ctx(), p);
    expect(r.kind).toBe('discovered_pending');
    if (r.kind === 'discovered_pending') expect(r.externalEvidence).toBeNull();
    expect(discovery.calls).toContain(`research:${UNKNOWN}`);
    expect(clientCalls).toBe(0);
  });

  it('a slow or broken legacy client registry is never started and cannot block discovery', async () => {
    const discovery = new FakeDiscovery();
    let slowCalls = 0;
    const slow = ports({
      discovery,
      external: {
        research: () => {
          slowCalls += 1;
          return new Promise(() => undefined);
        },
      },
      externalTimeoutMs: 20,
    });
    const r = await runScanImportV2(scan(UNKNOWN), ctx(), slow);
    expect(r.kind).toBe('discovered_pending');
    if (r.kind === 'discovered_pending') expect(r.externalEvidence).toBeNull();
    expect(slowCalls).toBe(0);
    let brokenCalls = 0;
    const broken = ports({
      discovery: new FakeDiscovery(),
      external: {
        research: async () => {
          brokenCalls += 1;
          throw new Error('boom');
        },
      },
    });
    const b = await runScanImportV2(scan(UNKNOWN), ctx(), broken);
    expect(b.kind).toBe('discovered_pending');
    if (b.kind === 'discovered_pending') expect(b.externalEvidence).toBeNull();
    expect(brokenCalls).toBe(0);
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
