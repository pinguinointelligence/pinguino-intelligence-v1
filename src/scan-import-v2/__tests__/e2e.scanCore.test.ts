/**
 * The "connection": a real Scan Core confirmed observation (dumped from the engine on
 * claude/scan-core-phase-0, fixture) → shared contract → Scan Import 2.0 → canonical product result.
 * The modules stay independent: this file is the only place both shapes meet.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  fromScanCoreObservation,
  type ScanCoreObservationLike,
} from '@/scan-contract/confirmedScan';
import { runScanImportV2 } from '../pipeline';
import { compareWithLegacy } from '../legacyComparison';
import { ALSACE, HACENDADO, LACIATE, ctx, ports } from './fakes';
import fixtures from '../__fixtures__/scanCoreObservations.json';

const obs = fixtures as Record<string, ScanCoreObservationLike>;

describe('Scan Core → Scan Import 2.0 end to end', () => {
  it('resolves the three real products from real Scan Core observations', async () => {
    const p = ports();
    for (const [key, expected] of [
      ['hacendado', HACENDADO],
      ['laciate', LACIATE],
      ['alsaceLait', ALSACE],
    ] as const) {
      const c = fromScanCoreObservation(obs[key]!, 'fixture');
      expect(c).not.toBeNull();
      const r = await runScanImportV2(c!, ctx(), p);
      expect(r).toMatchObject({
        kind: 'resolved_exact',
        product: { productId: expected.productId },
        identity: { symbology: 'EAN-13' },
      });
    }
  });
  it('Scan Core observations carry no product data; Scan Import 2.0 imports nothing from the camera side', () => {
    for (const o of Object.values(obs)) {
      expect(Object.keys(o).sort()).toEqual([
        'barcode',
        'bestFrames',
        'kind',
        'reasons',
        'state',
        'timing',
        'trackId',
      ]);
      expect(JSON.stringify(o)).not.toMatch(/product|price|country|nutrition|mapper|behaviou?r/i);
    }
    const dir = join(import.meta.dirname, '..');
    const sources = readdirSync(dir).filter((f) => f.endsWith('.ts'));
    for (const f of sources) {
      const src = readFileSync(join(dir, f), 'utf8');
      expect(src, f).not.toMatch(
        /from ['"]@\/scan-core|from ['"]\.\.\/scan-core|scan-lab|ImageData|VideoFrame|getUserMedia/,
      );
    }
    const contract = readFileSync(
      join(import.meta.dirname, '..', '..', 'scan-contract', 'confirmedScan.ts'),
      'utf8',
    );
    expect(contract).not.toMatch(/^import /m);
  });
  it('legacy comparison harness runs on the same codes (diagnostic)', async () => {
    const p = ports();
    const rows = [];
    for (const [key, hint] of [
      ['hacendado', 'ean_13'],
      ['laciate', 'ean_13'],
      ['alsaceLait', 'ean_13'],
      ['upca', 'upc_a'],
    ] as const) {
      const c = fromScanCoreObservation(obs[key]!)!;
      const r = await runScanImportV2(c, ctx(), p);
      rows.push(compareWithLegacy(c.value, hint, p.catalog.rows, r));
    }
    expect(
      rows
        .filter((r) => r.legacy.exactProductId && r.v2.productId)
        .every((r) => r.legacy.exactProductId === r.v2.productId),
    ).toBe(true);
    expect(rows.find((r) => r.code === '036000291452')).toMatchObject({
      legacy: { format: 'UPC_A' },
      v2: { kind: 'unknown' },
    });
  });
});
