/**
 * The unknown-product lifecycle as ONE state-transition sequence (owner step 4), plus the provenance
 * audit (step 5) and non-vacuous conflict cases (step 6). One code, one identity, every stage.
 */
import { describe, expect, it } from 'vitest';
import type { ScanImportV2Result } from '../contracts';
import { continueDiscovery } from '../discovery/discovery';
import type { Fact } from '../discovery/contracts';
import { runScanImportV2 } from '../pipeline';
import { scan } from './codeIdentity.test';
import { FakeDiscovery } from './fakeDiscovery';
import { ctx, ports, product } from './fakes';

const GTIN = '4305615614434';
const IMG = [
  {
    assetId: 'label-1',
    mime: 'image/jpeg',
    base64: 'AAAA',
    source: 'camera_manual' as const,
    originalMime: 'image/jpeg',
    transformations: [],
    qualityScore: 0.9,
  },
];

describe('Unknown product — one lifecycle, one identity (state journey)', () => {
  it('walks CONFIRMED CODE → discovery → evidence → candidate → incomplete → SKU → completion → rescan without ever changing identity', async () => {
    const d = new FakeDiscovery();
    d.provider.set(GTIN, {
      displayName: 'Magnesium + Calcium + D3 Brausetabletten',
      brand: 'altapharma',
      countryOfOrigin: 'DE',
      sourceType: 'web_search',
      url: 'https://www.rossmann.de/p/4305615614434',
    });
    d.label.set(GTIN, {
      displayName: 'altapharma Magnesium + Calcium + D3',
      brand: 'altapharma',
      ingredientsText: 'Säuerungsmittel Citronensäure, Magnesiumcarbonat…',
      energyKcal: 12,
      countryOfOrigin: 'DE',
    });
    const p = ports({ discovery: d } as never);
    p.catalog.rows = [];
    const trail: {
      step: string;
      kind: string;
      stage?: string;
      identity: string;
      sessionId?: string;
      productId?: string;
      requestId?: string;
    }[] = [];
    const record = (step: string, r: ScanImportV2Result) => {
      const identity =
        'identity' in r && r.identity
          ? `${r.identity.symbology}:${r.identity.canonicalGtin13}`
          : 'n/a';
      trail.push({
        step,
        kind: r.kind,
        stage: 'stage' in r ? (r as { stage: string }).stage : undefined,
        identity,
        sessionId: 'sessionId' in r ? (r as { sessionId?: string }).sessionId : undefined,
        productId: 'product' in r && r.product ? r.product.productId : undefined,
        requestId: r.kind === 'discovery_requested' ? r.requestId : undefined,
      });
      return r;
    };

    // 1. confirmed code → identity preserved, discovery started, external evidence attached
    const start = record(
      'scan #1 (online)',
      await runScanImportV2(scan(GTIN), ctx({ now: 1_000 }), p),
    );
    expect(start).toMatchObject({
      kind: 'discovered_pending',
      stage: 'commercial_identity_hypothesis',
      canonical: false,
      engineReady: false,
    });
    const session = d.sessions.get(GTIN)!;
    // 2. durable candidate BEFORE the label (request), then continuity on a fresh scan
    const requested = record(
      'request candidate',
      await continueDiscovery(
        session,
        { type: 'request' },
        ctx({ now: 1_100, productCountry: 'DE' }),
        d,
      ),
    );
    expect(requested.kind).toBe('discovery_requested');
    d.sessions.clear(); // new browser / app state
    const rescan1 = record(
      'scan #2 (new session)',
      await runScanImportV2(scan(GTIN), ctx({ now: 2_000 }), p),
    );
    expect(rescan1).toMatchObject({ kind: 'discovery_requested', requestId: `REQ-${GTIN}` });
    // 3. label evidence attached to the same identity; conflicts retained visibly
    const s2 = d.sessions.get(GTIN) ?? session;
    await d.research(s2.identity, ctx({ now: 2_100 })); // the session carries the earlier research
    const labelled = record(
      'label evidence',
      await continueDiscovery(
        d.sessions.get(GTIN)!,
        { type: 'label', images: IMG },
        ctx({ now: 2_200 }),
        d,
      ),
    );
    expect(labelled).toMatchObject({ kind: 'discovered_pending', stage: 'evidence_collected' });
    if (labelled.kind === 'discovered_pending') {
      expect(
        labelled.ledger.conflicts.find((c) => c.field === 'identity.displayName'),
      ).toMatchObject({ retained: 'label' });
      expect(labelled.ledger.identity.name).toBe('altapharma Magnesium + Calcium + D3');
    }
    // 4. technical profile: the authority decides; nothing invented
    const noFamily = record(
      'finalize without family',
      await continueDiscovery(
        d.sessions.get(GTIN)!,
        { type: 'finalize', input: {} },
        ctx({ now: 2_300 }),
        d,
      ),
    );
    expect(noFamily.kind).toBe('needs_confirmation');
    const created = record(
      'finalize with family',
      await continueDiscovery(
        d.sessions.get(GTIN)!,
        { type: 'finalize', input: { customerFamily: 'technical' } },
        ctx({ now: 2_400 }),
        d,
      ),
    );
    expect(created).toMatchObject({
      kind: 'discovered_exact',
      engineReady: false,
      product: {
        entityKind: 'customer_provisional',
        displayName: 'altapharma Magnesium + Calcium + D3',
      },
    });
    const productId = created.kind === 'discovered_exact' ? created.product.productId : '';
    // 5. rescan returns the SAME lifecycle identity (linked provisional), still not engine-ready
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
    p.importer.central.set(GTIN, { productId, accounts: new Set(['user-1']) });
    const rescan2 = record(
      'scan #3 (after SKU)',
      await runScanImportV2(scan(GTIN), ctx({ now: 3_000, surface: 'HOME' }), p),
    );
    expect(rescan2).toMatchObject({
      kind: 'needs_confirmation',
      reason: 'behaviour_review',
      product: { productId },
    });
    // 6. later completion through the canonical authority → same identity, now usable
    p.behaviour.outcomes.set(productId, 'classified');
    const rescan3 = record(
      'scan #4 (after completion, PRO)',
      await runScanImportV2(scan(GTIN), ctx({ now: 4_000, surface: 'PRO' }), p),
    );
    expect(rescan3).toMatchObject({
      kind: 'resolved_exact',
      product: { productId },
      behaviour: { outcome: 'classified' },
      import: { productId, created: false },
    });
    // 7. invariants over the whole trail
    expect(new Set(trail.map((t) => t.identity))).toEqual(new Set([`EAN-13:${GTIN}`]));
    expect(new Set(trail.filter((t) => t.productId).map((t) => t.productId))).toEqual(
      new Set([productId]),
    );
    expect(new Set(trail.filter((t) => t.requestId).map((t) => t.requestId))).toEqual(
      new Set([`REQ-${GTIN}`]),
    );
    expect(d.created.size).toBe(1);
    expect(d.requests.size).toBe(1);
    expect(trail.map((t) => t.kind)).toEqual([
      'discovered_pending',
      'discovery_requested',
      'discovery_requested',
      'discovered_pending',
      'needs_confirmation',
      'discovered_exact',
      'needs_confirmation',
      'resolved_exact',
    ]);
  });
});

describe('Provenance audit of the resulting lifecycle object', () => {
  it('every important fact answers VALUE / SOURCE / AUTHORITY / TIME / CONFIDENCE / CONFLICT; readiness names its authority', async () => {
    const d = new FakeDiscovery();
    d.provider.set(GTIN, {
      displayName: 'Magnesium + Calcium + D3',
      brand: 'ALTAPHARMA GMBH',
      countryOfOrigin: 'DE',
      sourceType: 'manufacturer',
      url: 'https://altapharma.example/p',
    });
    d.label.set(GTIN, {
      displayName: 'altapharma Magnesium + Calcium + D3',
      brand: 'altapharma',
      ingredientsText: 'Citronensäure, Magnesiumcarbonat',
      energyKcal: 12,
      countryOfOrigin: 'DE',
    });
    const p = ports({ discovery: d } as never);
    p.catalog.rows = [];
    await runScanImportV2(scan(GTIN), ctx({ now: 5_000 }), p);
    const r = await continueDiscovery(
      d.sessions.get(GTIN)!,
      { type: 'label', images: IMG },
      ctx({ now: 5_100 }),
      d,
    );
    expect(r.kind).toBe('discovered_pending');
    if (r.kind !== 'discovered_pending') return;
    const byField = new Map(r.ledger.facts.map((f) => [f.field, f]));
    const expectFact = (field: string, want: Partial<Fact>) => {
      const f = byField.get(field);
      expect(f, field).toBeDefined();
      expect(f, field).toMatchObject(want);
      expect(f!.recordedAt, `${field} time`).not.toBeNull();
      expect(f!.authority, `${field} authority`).not.toBeNull();
    };
    expectFact('barcode', {
      value: GTIN,
      source: 'barcode',
      authority: 'scan-core',
      confidence: 'high',
    });
    expectFact('symbology', { value: 'EAN-13', source: 'barcode', authority: 'scan-core' });
    expectFact('identity.displayName', {
      value: 'altapharma Magnesium + Calcium + D3',
      source: 'label',
      authority: 'product-scan-analyze',
      confidence: 'high',
    });
    expectFact('identity.brand', { value: 'altapharma', source: 'label', confidence: 'high' });
    expectFact('identity.countryOfOrigin', { value: 'DE' });
    expectFact('ingredientsText', { source: 'label', authority: 'product-scan-analyze' });
    expectFact('nutrition.energyKcal', { value: 12, source: 'label' });
    // conflicts answer "who said what" for the brand and the name
    expect(r.ledger.conflicts.map((c) => c.field).sort()).toEqual([
      'identity.brand',
      'identity.displayName',
    ]);
    expect(r.ledger.conflicts.find((c) => c.field === 'identity.brand')).toMatchObject({
      values: [
        { value: 'altapharma', source: 'label' },
        { value: 'ALTAPHARMA GMBH', source: 'manufacturer' },
      ],
      retained: 'label',
    });
    // ledger context: gtin, symbology, session, time
    expect(r.ledger).toMatchObject({ gtin: GTIN, symbology: 'EAN-13', sessionId: `sess-${GTIN}` });
    expect(r.ledger.recordedAt).not.toBeNull();
    // technical readiness is a separate, authority-owned fact
    expect(r).toMatchObject({ engineReady: false, canonical: false });
    const created = await continueDiscovery(
      d.sessions.get(GTIN)!,
      { type: 'finalize', input: { customerFamily: 'technical' } },
      ctx({ now: 5_200 }),
      d,
    );
    expect(created).toMatchObject({
      kind: 'discovered_exact',
      readiness: { engineReady: false },
      behaviour: { outcome: 'unknown_requires_review' },
    });
    if (created.kind === 'discovered_exact')
      expect(created.readiness.note).toMatch(/authority|incomplete/);
  });
  it('a value without provenance is not a fact (never silently canonical)', async () => {
    const { buildLedger } = await import('../discovery/ledger');
    const { identifyCode } = await import('../codeIdentity');
    const id = identifyCode(scan(GTIN));
    if (!id.ok) throw new Error(id.reason);
    const ledger = buildLedger(
      id.identity,
      {
        identity: { displayName: 'Guessed name', brand: 'Guessed brand' },
        nutrition: { energyKcal: 99 },
      },
      [],
    );
    expect(ledger.facts.map((f) => f.field)).toEqual(['barcode', 'symbology']);
    expect(ledger.identity).toEqual({ name: 'Guessed name', brand: 'Guessed brand' }); // a hypothesis, visibly separate from facts
  });
});

describe('Conflict cases (non-vacuous)', () => {
  it('provider A (retailer) vs provider B (manufacturer) on the brand: rank decides the retained value, both contributors stay visible, nothing else changes', async () => {
    const d = new FakeDiscovery();
    d.provider.set(GTIN, {
      displayName: 'Magnesium + Calcium + D3',
      brand: 'Rossmann',
      countryOfOrigin: 'DE',
      sourceType: 'retailer',
      url: 'https://rossmann.example',
    });
    d.secondProvider.set(GTIN, {
      brand: 'altapharma',
      sourceType: 'manufacturer',
      url: 'https://altapharma.example',
    });
    const p = ports({ discovery: d } as never);
    p.catalog.rows = [];
    const r = await runScanImportV2(scan(GTIN), ctx({ now: 6_000 }), p);
    expect(r.kind).toBe('discovered_pending');
    if (r.kind !== 'discovered_pending') return;
    const brand = r.ledger.facts.find((f) => f.field === 'identity.brand')!;
    expect(brand.value).toBe('altapharma'); // manufacturer outranks retailer (legacy source rank, applied server-side)
    expect([...brand.contributingSources].sort()).toEqual(['manufacturer', 'retailer']);
    expect(brand.confidence).toBe('low'); // the fact's primary source in the payload is the retailer entry; V2 does not upgrade it
    expect(r).toMatchObject({
      engineReady: false,
      canonical: false,
      stage: 'commercial_identity_hypothesis',
    });
    expect(d.created.size).toBe(0);
  });
  it('label says X, internet says Y: the label is retained, Y stays visible, readiness and identity unchanged; a confident provider never flips engine readiness', async () => {
    const d = new FakeDiscovery();
    d.provider.set(GTIN, {
      displayName: 'Magnesium + Calcium + D3',
      brand: 'Rossmann',
      countryOfOrigin: 'DE',
      sourceType: 'manufacturer',
    });
    d.label.set(GTIN, {
      displayName: 'altapharma Magnesium + Calcium + D3',
      brand: 'altapharma',
      ingredientsText: 'x',
      energyKcal: 12,
    });
    const p = ports({ discovery: d } as never);
    p.catalog.rows = [];
    await runScanImportV2(scan(GTIN), ctx({ now: 7_000 }), p);
    const r = await continueDiscovery(
      d.sessions.get(GTIN)!,
      { type: 'label', images: IMG },
      ctx({ now: 7_100 }),
      d,
    );
    expect(r.kind).toBe('discovered_pending');
    if (r.kind !== 'discovered_pending') return;
    expect(r.ledger.facts.find((f) => f.field === 'identity.brand')).toMatchObject({
      value: 'altapharma',
      source: 'label',
    });
    expect(r.ledger.conflicts.find((c) => c.field === 'identity.brand')).toMatchObject({
      values: [
        { value: 'altapharma', source: 'label' },
        { value: 'Rossmann', source: 'manufacturer' },
      ],
      retained: 'label',
    });
    expect(r.engineReady).toBe(false);
    const created = await continueDiscovery(
      d.sessions.get(GTIN)!,
      { type: 'finalize', input: { customerFamily: 'technical' } },
      ctx({ now: 7_200 }),
      d,
    );
    expect(created).toMatchObject({
      kind: 'discovered_exact',
      engineReady: false,
      product: { brand: 'altapharma' },
    });
  });
});
