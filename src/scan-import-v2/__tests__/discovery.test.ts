import { describe, expect, it } from 'vitest';
import { continueDiscovery } from '../discovery/discovery';
import { runScanImportV2 } from '../pipeline';
import { scan } from './codeIdentity.test';
import { FakeDiscovery } from './fakeDiscovery';
import { ctx, ports, product } from './fakes';
import type { ScanImportV2Result } from '../contracts';

const GTIN = '4305615614434'; // a real, previously unknown code (small gum/spice pack from the phone corpus)
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

function setup(over: { provider?: boolean; label?: boolean; conflict?: boolean } = {}) {
  const d = new FakeDiscovery();
  if (over.provider)
    d.provider.set(GTIN, {
      displayName: 'Wrigley Orbit Peppermint',
      brand: over.conflict ? 'WRIGLEY (web)' : 'Wrigley',
      countryOfOrigin: 'DE',
      sourceType: 'manufacturer',
      url: 'https://www.wrigley.example/orbit',
    });
  if (over.label)
    d.label.set(GTIN, {
      displayName: 'Orbit Peppermint',
      brand: 'Wrigley',
      ingredientsText: 'sorbitol, gum base',
      energyKcal: 165,
      countryOfOrigin: 'DE',
    });
  const p = ports({ discovery: d } as never);
  p.catalog.rows = [];
  return { d, p };
}
const pendingOf = (r: ScanImportV2Result) =>
  r.kind === 'discovered_pending'
    ? r
    : (() => {
        throw new Error(`expected discovered_pending, got ${r.kind}`);
      })();

describe('Unknown product flow — discovery lifecycle (owner acceptance matrix)', () => {
  it('UNKNOWN VALID GTIN: discovery starts, identity preserved, no product row, no placeholder dead end', async () => {
    const { d, p } = setup();
    const r = await runScanImportV2(scan(GTIN), ctx(), p);
    expect(r).toMatchObject({
      kind: 'discovered_pending',
      stage: 'code_known',
      next: 'label_photo',
      canonical: false,
      engineReady: false,
      identity: { canonicalGtin13: GTIN, symbology: 'EAN-13' },
    });
    expect(d.created.size).toBe(0);
    expect(p.importer.calls).toBe(0);
    expect(pendingOf(r).ledger.facts.map((f) => f.source)).toEqual(['barcode', 'barcode']);
  });
  it('UNKNOWN + INTERNET EVIDENCE: facts carry provider provenance and contribute to the SAME identity/session', async () => {
    const { p } = setup({ provider: true });
    const r = pendingOf(await runScanImportV2(scan(GTIN), ctx(), p));
    expect(r.stage).toBe('commercial_identity_hypothesis');
    expect(r.ledger.identity).toEqual({ name: 'Wrigley Orbit Peppermint', brand: 'Wrigley' });
    const brand = r.ledger.facts.find((f) => f.field === 'identity.brand');
    expect(brand).toMatchObject({
      source: 'manufacturer',
      sourceUrl: 'https://www.wrigley.example/orbit',
      confidence: 'medium',
    });
    expect(r.sessionId).toBe(`sess-${GTIN}`);
    expect(r.canonical).toBe(false);
  });
  it('UNKNOWN + LABEL EVIDENCE: label facts join the same session and identity; stage becomes evidence_collected', async () => {
    const { d, p } = setup({ provider: true, label: true });
    const first = pendingOf(await runScanImportV2(scan(GTIN), ctx(), p));
    const after = await continueDiscovery(
      d.sessions.get(GTIN)!,
      { type: 'label', images: IMG },
      ctx(),
      d,
    );
    expect(after).toMatchObject({
      kind: 'discovered_pending',
      stage: 'evidence_collected',
      sessionId: first.sessionId,
      identity: first.identity,
    });
    const l = pendingOf(after).ledger;
    expect(l.facts.some((f) => f.field === 'ingredientsText' && f.source === 'label')).toBe(true);
    expect(
      l.facts.some(
        (f) => f.field === 'nutrition.energyKcal' && f.source === 'label' && f.value === 165,
      ),
    ).toBe(true);
    expect(l.sourcesUsed).toEqual(expect.arrayContaining(['barcode', 'label', 'manufacturer']));
  });
  it('LABEL / INTERNET CONFLICT: both values stay visible with their sources; no silent arbitrary winner', async () => {
    const { d, p } = setup({ provider: true, label: true, conflict: true });
    await runScanImportV2(scan(GTIN), ctx(), p);
    const after = pendingOf(
      await continueDiscovery(d.sessions.get(GTIN)!, { type: 'label', images: IMG }, ctx(), d),
    );
    expect(after.ledger.conflicts).toContainEqual({
      field: 'identity.brand',
      values: [
        { value: 'Wrigley', source: 'label' },
        { value: 'WRIGLEY (web)', source: 'manufacturer' },
      ],
      retained: 'label',
    });
    // every disagreement keeps both values and names the retained source — nothing is dropped silently
    for (const c of after.ledger.conflicts) expect(c.values).toHaveLength(2);
    expect(after.ledger.conflicts.every((c) => c.retained === 'label')).toBe(true);
    expect(after.ledger.facts.find((f) => f.field === 'identity.brand')).toMatchObject({
      value: 'Wrigley',
      source: 'label',
    });
  });
  it('FINALIZE needs the family: needs_confirmation with options, product still not created', async () => {
    const { d, p } = setup({ provider: true, label: true });
    await runScanImportV2(scan(GTIN), ctx(), p);
    await continueDiscovery(d.sessions.get(GTIN)!, { type: 'label', images: IMG }, ctx(), d);
    const r = await continueDiscovery(
      d.sessions.get(GTIN)!,
      { type: 'finalize', input: {} },
      ctx(),
      d,
    );
    expect(r).toMatchObject({
      kind: 'needs_confirmation',
      reason: 'family_confirmation',
      product: null,
    });
    expect(d.created.size).toBe(0);
  });
  it('UNKNOWN WITHOUT ENOUGH TECHNICAL DATA: authority refuses, identity + evidence preserved, nothing fabricated', async () => {
    const { d, p } = setup({ provider: true });
    await runScanImportV2(scan(GTIN), ctx(), p);
    const r = pendingOf(
      await continueDiscovery(
        d.sessions.get(GTIN)!,
        { type: 'finalize', input: { customerFamily: 'other' } },
        ctx(),
        d,
      ),
    );
    expect(r.note).toContain('not ready');
    expect(r.ledger.missingCritical).toEqual(
      expect.arrayContaining(['nutrition.energyKcal', 'ingredientsText']),
    );
    expect(r.engineReady).toBe(false);
    expect(d.created.size).toBe(0);
  });
  it('NEW EXACT SKU: finalize through the authorities creates a customer-provisional product; Engine-ready only if the authority says so', async () => {
    const { d, p } = setup({ provider: true, label: true });
    await runScanImportV2(scan(GTIN), ctx(), p);
    await continueDiscovery(d.sessions.get(GTIN)!, { type: 'label', images: IMG }, ctx(), d);
    const r = await continueDiscovery(
      d.sessions.get(GTIN)!,
      { type: 'finalize', input: { customerFamily: 'other' } },
      ctx(),
      d,
    );
    expect(r).toMatchObject({
      kind: 'discovered_exact',
      engineReady: false,
      canonical: false,
      stage: 'behaviour_bound',
      product: {
        productId: `CA-${GTIN}`,
        entityKind: 'customer_provisional',
        strength: 'provisional_linked',
        displayName: 'Orbit Peppermint',
        brand: 'Wrigley',
        engineReady: false,
      },
      behaviour: { outcome: 'unknown_requires_review' },
    });
    expect(d.created.size).toBe(1);
  });
  it('RESCAN AFTER CREATION + LATER PROFILE COMPLETION: same product identity, readiness follows the authority, no duplicate', async () => {
    const { d, p } = setup({ provider: true, label: true });
    await runScanImportV2(scan(GTIN), ctx(), p);
    await continueDiscovery(d.sessions.get(GTIN)!, { type: 'label', images: IMG }, ctx(), d);
    const created = await continueDiscovery(
      d.sessions.get(GTIN)!,
      { type: 'finalize', input: { customerFamily: 'other' } },
      ctx(),
      d,
    );
    const productId = created.kind === 'discovered_exact' ? created.product.productId : '';
    // the exact authority now returns the provisional product as linked to this account
    p.catalog.rows = [
      product({
        productId,
        ean: GTIN,
        strength: 'provisional_linked',
        entityKind: 'customer_provisional',
        productCode: 'linked:user-1',
        engineReady: false,
      }),
    ];
    p.behaviour.outcomes.set(productId, 'unknown_requires_review');
    p.importer.central.set(GTIN, { productId, accounts: new Set(['user-1']) }); // finalize already linked the account
    const rescan = await runScanImportV2(scan(GTIN), ctx({ surface: 'PRO' }), p);
    expect(rescan).toMatchObject({
      kind: 'needs_confirmation',
      reason: 'behaviour_review',
      product: { productId },
    });
    // later completion through the canonical authority (re-analysis / admin) — identity unchanged
    p.behaviour.outcomes.set(productId, 'classified');
    const later = await runScanImportV2(scan(GTIN), ctx({ surface: 'HOME', now: 99_999 }), p);
    expect(later).toMatchObject({
      kind: 'resolved_exact',
      product: { productId },
      behaviour: { outcome: 'classified' },
      import: { productId, created: false },
    });
    expect(d.created.size).toBe(1);
    expect(d.calls.filter((c) => c.startsWith('research')).length).toBe(1);
  });
  it('DURABLE DISCOVERY CANDIDATE: a product request keeps the identity across sessions/browsers; canonical = false, engine usable = false', async () => {
    const { d, p } = setup({ provider: true });
    await runScanImportV2(scan(GTIN), ctx(), p);
    const req = await continueDiscovery(
      d.sessions.get(GTIN)!,
      { type: 'request' },
      ctx({ productCountry: 'DE' }),
      d,
    );
    expect(req).toMatchObject({
      kind: 'discovery_requested',
      requestId: `REQ-${GTIN}`,
      status: 'SUBMITTED',
      canonical: false,
      engineReady: false,
      stage: 'commercial_identity_hypothesis',
    });
    const d2 = d; // new browser session: fresh pipeline call, same account
    d2.sessions.clear();
    const again = await runScanImportV2(scan(GTIN), ctx({ now: 5 }), p);
    expect(again).toMatchObject({ kind: 'discovery_requested', requestId: `REQ-${GTIN}` });
    expect(d.calls.filter((c) => c.startsWith('research')).length).toBe(1);
  });
  it('EXTERNAL PROVIDER FINDS THE UNKNOWN GTIN: still not canonical, still not a product, still not Engine-ready', async () => {
    const { d, p } = setup({ provider: true });
    const r = pendingOf(await runScanImportV2(scan(GTIN), ctx(), p));
    expect(r.canonical).toBe(false);
    expect(r.engineReady).toBe(false);
    expect(d.created.size).toBe(0);
  });
  it('PROVIDER TIMEOUT during discovery is recorded, the discovery continues (label path stays open)', async () => {
    const { d, p } = setup();
    d.providerError = 'provider_timeout';
    const r = pendingOf(await runScanImportV2(scan(GTIN), ctx(), p));
    expect(r.evidenceError).toBe('provider_timeout');
    expect(r.next).toBe('label_photo');
  });
  it('SERVER EXACT during discovery (product the client authority missed) resolves as the exact product, never a new one', async () => {
    const { d, p } = setup();
    d.serverCatalogue.set(
      GTIN,
      product({ productId: 'PR-SRV', ean: GTIN, displayName: 'Server-known' }),
    );
    const r = await runScanImportV2(scan(GTIN), ctx(), p);
    expect(r).toMatchObject({ kind: 'resolved_exact', product: { productId: 'PR-SRV' } });
    expect(d.created.size).toBe(0);
  });
  it('GUEST unknown: no discovery, honest unknown, zero sessions', async () => {
    const { d, p } = setup({ provider: true });
    const r = await runScanImportV2(scan(GTIN), ctx({ accountId: null }), p);
    expect(r.kind).toBe('unknown');
    expect(d.sessions.size).toBe(0);
  });
  it('EXACT BRANDED CODE NEVER COLLAPSES TO GENERIC: the discovered SKU keeps its label identity', async () => {
    const { d, p } = setup({ provider: true, label: true });
    await runScanImportV2(scan(GTIN), ctx(), p);
    await continueDiscovery(d.sessions.get(GTIN)!, { type: 'label', images: IMG }, ctx(), d);
    const r = await continueDiscovery(
      d.sessions.get(GTIN)!,
      { type: 'finalize', input: { customerFamily: 'other' } },
      ctx(),
      d,
    );
    expect(r.kind === 'discovered_exact' && r.product.entityKind).toBe('customer_provisional');
    expect(r.kind === 'discovered_exact' && r.product.displayName).toBe('Orbit Peppermint');
  });
});
