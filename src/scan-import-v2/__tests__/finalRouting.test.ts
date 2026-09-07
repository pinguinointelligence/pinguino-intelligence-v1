/**
 * OWNER CONTRACT 2026-09-07 — the final routing matrix.
 *
 * A product is classified as PR, PM or Unverified ONLY at the end of the existing automatic path
 * (enrichment → Product Registry lookup → Mapper Rescue → classification → behaviour → readiness →
 * the customer's chance to complete). Two gates decide, and both must hold for the shared registry:
 *
 *     finalConfidence > 85  AND  productionReady   →  PR-ING   (shared, immediately)
 *     productionReady, confidence ≤ 85             →  PM-ING READY
 *     not productionReady after the whole rescue   →  PM-ING UNVERIFIED
 *
 * 85.00 is NOT above 85. `CA-ING-*` must never be minted again.
 *
 * These run against the same fake port the rest of the Scan Import suite uses, and it applies the
 * two gates with the same arithmetic the SQL does — so the harness cannot drift from the server
 * without one of these going red.
 */
import { describe, expect, it } from 'vitest';
import { continueDiscovery } from '../discovery/discovery';
import { runScanImportV2 } from '../pipeline';
import { scan } from './codeIdentity.test';
import { FakeDiscovery } from './fakeDiscovery';
import { ctx, ports } from './fakes';

const GTIN = '4305615614434';

/**
 * Reach the point where finalize decides, through the REAL flow: an unknown code starts discovery,
 * the label supplies what it has, and only then is the route chosen. The fake owns the session, so
 * driving it any other way would test nothing.
 */
async function reachFinalize(
  over: { ready?: boolean; confidence?: number; missing?: boolean } = {},
) {
  const d = new FakeDiscovery();
  d.provider.set(GTIN, {
    displayName: 'Cola Zero Hacendado',
    brand: 'Hacendado',
    countryOfOrigin: 'ES',
    sourceType: 'manufacturer',
    url: 'https://example.invalid/cola',
  } as never);
  d.label.set(
    GTIN,
    over.missing
      ? ({ displayName: 'Cola Zero' } as never)
      : ({
          displayName: 'Cola Zero',
          brand: 'Hacendado',
          ingredientsText: 'woda, dwutlenek wegla',
          energyKcal: 0,
          countryOfOrigin: 'ES',
        } as never),
  );
  d.authorityEngineUsable.set(GTIN, over.ready ?? true);
  if (over.confidence !== undefined) d.confidence.set(GTIN, over.confidence);
  const p = ports({ discovery: d } as never);
  p.catalog.rows = [];
  await runScanImportV2(scan(GTIN), ctx(), p);
  // the label pass is what fills the session the routing then reads
  await continueDiscovery(d.sessions.get(GTIN)!, { type: 'label', images: IMG }, ctx(), d);
  return { d, p };
}

const IMG = [
  {
    assetId: 'a1',
    mime: 'image/jpeg',
    base64: 'AAAA',
    source: 'camera_manual' as const,
    originalMime: 'image/jpeg',
    transformations: [],
    qualityScore: 0.9,
  },
];

async function route(
  over: { ready?: boolean; confidence?: number; missing?: boolean } = {},
  unverified = false,
) {
  const { d } = await reachFinalize(over);
  const r = await continueDiscovery(
    d.sessions.get(GTIN)!,
    { type: unverified ? 'finalize_unverified' : 'finalize', input: { customerFamily: 'other' } },
    ctx(),
    d,
  );
  return { r, d };
}

describe('the two gates decide, and only at the end', () => {
  it('>85 and production-ready → a shared PR-ING, with no duplicate to clean up later', async () => {
    const { d } = await route({ ready: true, confidence: 85.01 });
    const created = d.created.get(GTIN)!;
    expect(created.route).toBe('PR');
    expect(created.productCode).toMatch(/^PR-ING-/);
    expect(created.productionReady).toBe(true);
  });

  it('100% and production-ready → PR-ING', async () => {
    const { d } = await route({ ready: true, confidence: 100 });
    expect(d.created.get(GTIN)!.route).toBe('PR');
  });

  it('EXACTLY 85.00 is not above 85 → PM-ING READY, not PR', async () => {
    const { d } = await route({ ready: true, confidence: 85 });
    const created = d.created.get(GTIN)!;
    expect(created.route).toBe('PM_READY');
    expect(created.productCode).toMatch(/^PM-ING-/);
    // and it is still usable: a private product with enough data works in a recipe
    expect(created.engineUsable).toBe(true);
  });

  it('below 85 but production-ready → PM-ING READY, usable privately', async () => {
    const { d } = await route({ ready: true, confidence: 40 });
    expect(d.created.get(GTIN)!.route).toBe('PM_READY');
    expect(d.created.get(GTIN)!.engineUsable).toBe(true);
  });

  it('not production-ready after the whole rescue → the completion form, NOT a classification', async () => {
    const { r, d } = await route({ ready: true, missing: true });
    // nothing was created: the customer is asked for what is missing first
    expect(d.created.get(GTIN)).toBeUndefined();
    expect(r.kind).not.toBe('discovered_exact');
  });

  it('...and only an explicit save keeps it, as PM-ING UNVERIFIED', async () => {
    const { d } = await route({ ready: true, missing: true }, true);
    const created = d.created.get(GTIN)!;
    expect(created.route).toBe('PM_UNVERIFIED');
    expect(created.productCode).toMatch(/^PM-ING-/);
    expect(created.engineUsable).toBe(false);
    expect(created.productionReady).toBe(false);
  });

  it('a high confidence cannot rescue an incomplete product', async () => {
    // >85 but not ready: readiness is a gate in its own right, not a score to be outvoted
    const { d } = await route({ ready: true, missing: true, confidence: 99 }, true);
    expect(d.created.get(GTIN)!.route).toBe('PM_UNVERIFIED');
  });

  it('scanning the same code twice creates no second record', async () => {
    const { d } = await reachFinalize({ ready: true, confidence: 90 });
    for (let i = 0; i < 3; i += 1)
      await continueDiscovery(
        d.sessions.get(GTIN)!,
        { type: 'finalize', input: { customerFamily: 'other' } },
        ctx(),
        d,
      );
    expect(d.created.size).toBe(1);
  });

  it('NO route ever mints a CA-ING article again', async () => {
    for (const over of [
      { ready: true, confidence: 90 },
      { ready: true, confidence: 85 },
      { ready: true, confidence: 10 },
    ]) {
      const { d } = await route(over);
      expect(d.created.get(GTIN)!.productCode ?? '').not.toMatch(/CA-ING/);
    }
    const { d: unready } = await route({ ready: true, missing: true }, true);
    expect(unready.created.get(GTIN)!.productCode ?? '').not.toMatch(/CA-ING/);
  });
});
