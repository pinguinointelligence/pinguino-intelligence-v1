import { describe, expect, it } from 'vitest';
import {
  diffRegistries,
  renderDiffMarkdown,
  type DiffableRegistry,
} from '../../../scripts/countryProducts/lib/diffRegistry.mjs';

type Row = Record<string, unknown>;

const product = (productKey: string, overrides: Row = {}): Row & { productKey: string } => ({
  productKey,
  exactName: 'Dextrose 1 kg',
  brand: 'Brand',
  package: { normalizedQuantity: 1000, normalizedUnit: 'g', multipackCount: null },
  identity: { basis: 'GTIN', gtin: '4006381333931', articleCode: null },
  nutrition: {
    estimatedFields: ['sugars'],
    declared: { energyKcal: 365, sugars: null },
    workingProfile: { energyKcal: 365, sugars: 90.9 },
  },
  sourceIds: ['SRC-A'],
  readiness: { engineProfileExpectation: 'ESTIMATED_OR_MISSING_LABEL_FIELDS' },
  catalog: { decision: 'NEW_PR_REQUIRED' },
  markets: ['AA'],
  workbook: { proposalKeys: ['DEX-AA'] },
  ...overrides,
});

const selection = (selectionKey: string, overrides: Row = {}): Row & { selectionKey: string } => ({
  selectionKey,
  productKey: 'V12:DEXTROSE:GTIN-04006381333931',
  selectionState: 'RESEARCH_OPEN',
  openGapId: 'R8-900',
  availabilityEvidence: { marketEvidence: 'TXT-0000000001', offerConditions: null },
  offerChannel: null,
  route: { decision: 'ROUTE_BLOCKED' },
  ...overrides,
});

const oldRegistry: DiffableRegistry = {
  registryId: 'GELATO_BASE_V12',
  source: { workbook: 'old.xlsx', sha256: 'old' },
  sources: { 'SRC-A': { url: 'https://example.test/a' } },
  texts: { 'TXT-0000000001': 'Old market evidence' },
  products: [
    product('V12:DEXTROSE:GTIN-04006381333931'),
    product('V12:BB:MILK:NAME-0000000001', {
      exactName: 'Local milk',
      identity: { basis: 'NAME_HASH', gtin: null, articleCode: null },
      nutrition: { estimatedFields: [], declared: {}, workingProfile: {} },
      markets: ['BB'],
      workbook: { proposalKeys: ['MILK-BB'] },
    }),
  ],
  selections: [
    selection('V12:AA:DEXTROSE'),
    selection('V12:BB:MILK', { productKey: 'V12:BB:MILK:NAME-0000000001', selectionState: 'SELECTION_CLOSED', openGapId: null }),
    selection('V12:CC:CREAM', { productKey: 'V12:CREAM:GTIN-00000000000017', selectionState: 'SELECTION_CLOSED', openGapId: null }),
  ],
  openGaps: [
    { id: 'R8-900', state: 'OPEN', selectionKey: 'V12:AA:DEXTROSE', conditions: ['LABEL_DATA'], missing: 'sugars', product: 'Dextrose 1 kg' },
  ],
};

const newRegistry: DiffableRegistry = {
  registryId: 'GELATO_BASE_V13',
  source: { workbook: 'new.xlsx', sha256: 'new' },
  sources: { 'SRC-A': { url: 'https://example.test/a' }, 'SRC-B': { url: 'https://example.test/b' } },
  texts: { 'TXT-0000000001': 'Old market evidence', 'TXT-0000000002': 'New market evidence' },
  products: [
    product('V12:DEXTROSE:GTIN-04006381333931', {
      nutrition: {
        estimatedFields: [],
        declared: { energyKcal: 365, sugars: 91 },
        workingProfile: { energyKcal: 365, sugars: 91 },
      },
      sourceIds: ['SRC-A', 'SRC-B'],
      readiness: { engineProfileExpectation: 'DECLARED_PROFILE_COMPLETE' },
      markets: ['AA', 'DD'],
    }),
    product('V12:MILK:GTIN-05900820016296', {
      exactName: 'Local milk',
      markets: ['BB'],
      nutrition: { estimatedFields: [], declared: {}, workingProfile: {} },
      identity: { basis: 'GTIN', gtin: '5900820016296', articleCode: null },
      workbook: { proposalKeys: ['MILK-BB'] },
    }),
  ],
  selections: [
    selection('V12:AA:DEXTROSE', {
      selectionState: 'SELECTION_CLOSED',
      openGapId: null,
      availabilityEvidence: { marketEvidence: 'TXT-0000000002', offerConditions: null },
      route: { decision: 'ROUTE_CREATABLE_NOW' },
    }),
    selection('V12:BB:MILK', { productKey: 'V12:MILK:GTIN-05900820016296', selectionState: 'SELECTION_CLOSED', openGapId: null }),
    selection('V12:CC:CREAM', { productKey: 'V12:CREAM:GTIN-00000000000024', selectionState: 'RESEARCH_OPEN', openGapId: 'R8-901' }),
  ],
  openGaps: [
    { id: 'R8-901', state: 'OPEN', selectionKey: 'V12:CC:CREAM', conditions: ['OFFER_OR_DELIVERY'], missing: 'stock', product: 'Cream' },
  ],
};

describe('diffGelatoBaseRegistry', () => {
  const diff = diffRegistries(oldRegistry, newRegistry);

  it('reports newly completed products (open → closed)', () => {
    expect(diff.newlyCompletedProducts).toEqual([
      {
        selectionKey: 'V12:AA:DEXTROSE',
        productKey: 'V12:DEXTROSE:GTIN-04006381333931',
        kind: 'SELECTION_CLOSED',
        from: 'RESEARCH_OPEN',
        to: 'SELECTION_CLOSED',
        closedGapId: 'R8-900',
      },
    ]);
    expect(diff.openGapsClosed.map((entry) => entry.gapId)).toEqual(['R8-900']);
    expect(diff.openGapsOpened.map((entry) => entry.gapId)).toEqual(['R8-901']);
  });

  it('reports newly completed evidence: estimate replaced, sources added, identifier completed', () => {
    const kinds = diff.newlyCompletedEvidence.map((entry) => `${entry.kind}:${entry.field ?? ''}`);
    expect(kinds).toContain('ESTIMATE_REPLACED_BY_DECLARED:nutrition.sugars');
    expect(kinds).toContain('SOURCES_ADDED:sourceIds');
    expect(kinds).toContain('ENGINE_PROFILE_EXPECTATION_CHANGED:readiness');
    expect(kinds).toContain('IDENTIFIER_COMPLETED:identity.gtin');
    const sources = diff.newlyCompletedEvidence.find((entry) => entry.kind === 'SOURCES_ADDED');
    expect(sources?.to).toEqual(['https://example.test/b']);
  });

  it('reports changed verification and availability', () => {
    expect(diff.changedVerification.some((entry) => entry.kind === 'SELECTION_STATE_CHANGED' && entry.selectionKey === 'V12:CC:CREAM')).toBe(true);
    const availability = diff.changedAvailability.map((entry) => entry.kind);
    expect(availability).toContain('MARKET_ADDED');
    expect(availability).toContain('ROUTE_DECISION_CHANGED');
    const evidence = diff.changedAvailability.filter((entry) => entry.kind === 'AVAILABILITY_EVIDENCE_CHANGED');
    expect(evidence.map((entry) => entry.selectionKey)).toEqual(['V12:AA:DEXTROSE']);
    expect(evidence[0]?.from).toEqual({ marketEvidence: 'Old market evidence', offerConditions: null });
    expect(evidence[0]?.to).toEqual({ marketEvidence: 'New market evidence', offerConditions: null });
  });

  it('reports a changed exact identity when a selection switches to a different product', () => {
    expect(diff.changedExactIdentity).toEqual([
      {
        selectionKey: 'V12:CC:CREAM',
        kind: 'SELECTED_PRODUCT_CHANGED',
        from: 'V12:CREAM:GTIN-00000000000017',
        to: 'V12:CREAM:GTIN-00000000000024',
      },
    ]);
    expect(diff.addedProducts).toEqual(['V12:MILK:GTIN-05900820016296']);
    expect(diff.removedProducts).toEqual(['V12:BB:MILK:NAME-0000000001']);
  });

  it('is deterministic and independent of input order', () => {
    const reversed: DiffableRegistry = {
      ...newRegistry,
      products: [...newRegistry.products].reverse(),
      selections: [...newRegistry.selections].reverse(),
    };
    expect(diffRegistries(oldRegistry, reversed)).toEqual(diff);
    expect(renderDiffMarkdown(diffRegistries(oldRegistry, newRegistry))).toBe(renderDiffMarkdown(diff));
    expect(renderDiffMarkdown(diff)).toContain('## Newly completed products');
  });
});
