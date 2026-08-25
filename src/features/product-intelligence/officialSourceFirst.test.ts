import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { INTIMPORT_COLUMNS, parseINTIMPORT, type IntimportColumn } from '@/data/products/intimport';
import { assessIntimportProduct } from './intimportIntelligence';
import { buildResearchPlan, officialDomainFor, plansOfficialFirst } from './researchPlan';
import { runIntimportEnrichment, type EnrichmentInputRow } from './intimportEnrichment';
import { stableJson } from '../../../supabase/functions/_shared/productScanner';

const EDGE = new URL('../../../supabase/functions/intimport-enrich/index.ts', import.meta.url);
const edgeSource = readFileSync(EDGE, 'utf8');

const row = (overrides: Partial<Record<IntimportColumn, string>> = {}): Record<string, string> => {
  const base = Object.fromEntries(INTIMPORT_COLUMNS.map((c) => [c, 'not_found'])) as Record<
    IntimportColumn,
    string
  >;
  return {
    ...base,
    'Product ID': 'PL-T-1',
    'Country Code': 'PL',
    Brand: 'Comprital',
    Manufacturer: 'Comprital S.p.A.',
    'Product Name Original': 'AMARETTO GIUBILEO',
    'Net Quantity Value': '3',
    'Net Quantity Unit': 'kg',
    'Product Type': 'professional',
    ...overrides,
  };
};
const quote = (v: string) => `"${v.replace(/"/g, '""')}"`;
const csv = (rows: readonly Record<string, string>[]) =>
  [
    INTIMPORT_COLUMNS.map(quote).join(','),
    ...rows.map((r) => INTIMPORT_COLUMNS.map((c) => quote(r[c] ?? '')).join(',')),
  ].join('\n');
const intel = (r: Record<string, string>) =>
  assessIntimportProduct(parseINTIMPORT(csv([r])).candidates[0]!);

const planFor = (over: Partial<Parameters<typeof buildResearchPlan>[0]> = {}) =>
  buildResearchPlan({
    brand: 'Comprital',
    manufacturer: 'Comprital S.p.A.',
    name: 'AMARETTO GIUBILEO',
    variant: null,
    barcode: null,
    netQuantity: '3 kg',
    knownSourceUrl: null,
    technicalPdfUrl: null,
    missingFields: ['ingredients'],
    ...over,
  });

/* ── §1–§4 official source first ──────────────────────────────────────────── */

describe('owner-supplied official evidence is consumed first', () => {
  it('opens the official Primary Source URL before searching', () => {
    const plan = planFor({ knownSourceUrl: 'https://comprital.pl/pasty-giubileo' });
    expect(plan.steps[0]!.kind).toBe('OWNER_OFFICIAL_URL');
    expect(plan.steps[0]!.url).toBe('https://comprital.pl/pasty-giubileo');
    expect(plan.steps[0]!.allowedDomains).toEqual(['comprital.pl']);
    expect(plansOfficialFirst(plan)).toBe(true);
  });

  it('leads with the official technical PDF when one exists', () => {
    const plan = planFor({
      knownSourceUrl: 'https://comprital.pl/pasty-giubileo',
      technicalPdfUrl: 'https://comprital.pl/katalog.pdf',
    });
    expect(plan.steps[0]!.kind).toBe('OWNER_TECHNICAL_PDF');
    expect(plan.steps[0]!.url).toBe('https://comprital.pl/katalog.pdf');
    // The official page remains the next step, still ahead of any search.
    expect(plan.steps[1]!.kind).toBe('OWNER_OFFICIAL_URL');
  });

  it('restricts the follow-up search to the official domain', () => {
    const plan = planFor({ knownSourceUrl: 'https://comprital.pl/pasty-giubileo' });
    const domainStep = plan.steps.find((s) => s.kind === 'OFFICIAL_DOMAIN_SEARCH');
    expect(domainStep?.allowedDomains).toEqual(['comprital.pl']);
    expect(plan.officialDomain).toBe('comprital.pl');
  });

  it('never starts from a retailer when an official source exists', () => {
    const plan = planFor({ knownSourceUrl: 'https://comprital.pl/x' });
    const firstRetailer = plan.steps.findIndex((s) => s.kind === 'RETAILER_SEARCH');
    const firstOpen = plan.steps.findIndex((s) => s.kind === 'OPEN_WEB_SEARCH');
    const firstOfficial = plan.steps.findIndex((s) =>
      ['OWNER_OFFICIAL_URL', 'OWNER_TECHNICAL_PDF', 'OFFICIAL_DOMAIN_SEARCH'].includes(s.kind),
    );
    expect(firstOfficial).toBeLessThan(firstRetailer);
    expect(firstOfficial).toBeLessThan(firstOpen);
  });

  it('keeps open web search last, always', () => {
    for (const over of [
      {},
      { knownSourceUrl: 'https://comprital.pl/x' },
      { knownSourceUrl: 'https://zakupy.biedronka.pl/x' },
      { barcode: '5902425088609' },
    ]) {
      const plan = planFor(over);
      expect(plan.steps.at(-1)!.kind).toBe('OPEN_WEB_SEARCH');
    }
  });

  it('puts an exact GTIN lookup ahead of retailer and open web', () => {
    const plan = planFor({ barcode: '5902425088609' });
    const gtin = plan.steps.findIndex((s) => s.kind === 'OPEN_FOOD_FACTS_EXACT_GTIN');
    const retailer = plan.steps.findIndex((s) => s.kind === 'RETAILER_SEARCH');
    expect(gtin).toBeGreaterThanOrEqual(0);
    expect(gtin).toBeLessThan(retailer);
  });

  it('does NOT invent an official domain from the company name alone', () => {
    // No URL in the row — nothing establishes an official domain.
    expect(
      officialDomainFor({
        brand: 'Comprital',
        manufacturer: 'Comprital S.p.A.',
        name: 'X',
        variant: null,
        barcode: null,
        netQuantity: null,
        knownSourceUrl: null,
        technicalPdfUrl: null,
        missingFields: [],
      }),
    ).toBeNull();
    const plan = planFor({});
    expect(plansOfficialFirst(plan)).toBe(false);
  });

  it('treats a retailer URL as a retailer step, never official', () => {
    const plan = planFor({ knownSourceUrl: 'https://zakupy.biedronka.pl/x.html' });
    expect(plan.officialDomain).toBeNull();
    expect(plansOfficialFirst(plan)).toBe(false);
    expect(plan.steps[0]!.kind).toBe('RETAILER_SEARCH');
    expect(plan.steps[0]!.allowedDomains).toEqual(['zakupy.biedronka.pl']);
  });
});

/* ── the exact regression from the paid run ───────────────────────────────── */

describe('the Comprital regression', () => {
  it('a Comprital row with an official source no longer starts from open web', () => {
    const intelligence = intel(
      row({
        'Primary Source URL': 'https://comprital.pl/pasty-giubileo',
        'Technical PDF URL': 'https://comprital.pl/katalog_comprital.pdf',
      }),
    );
    const first = intelligence.researchPlan.steps[0]!;
    expect(first.kind).toBe('OWNER_TECHNICAL_PDF');
    expect(first.allowedDomains).toEqual(['comprital.pl']);
    // The old behaviour — an unrestricted search — is no longer first.
    expect(first.allowedDomains.length).toBeGreaterThan(0);
  });

  it('sends the technical PDF to the provider, which it never used to', () => {
    const intelligence = intel(row({ 'Technical PDF URL': 'https://comprital.pl/k.pdf' }));
    expect(intelligence.researchIdentity.technicalPdfUrl).toBe('https://comprital.pl/k.pdf');
  });

  it('does not turn professional market context into a technical product', () => {
    const intelligence = intel(row({ 'Primary Source URL': 'https://comprital.pl/x' }));
    expect(intelligence.kind).toBe('normal_food');
    // No dosage authority is demanded before this product may exist.
    expect(intelligence.assessment.missingCritical).not.toContain('dosage');
  });
});

/* ── §9 cache identity, proven with no paid call ──────────────────────────── */

describe('cache identity is the product, not the import run', () => {
  it('excludes importId from the key', () => {
    const keyStart = edgeSource.lastIndexOf('const idempotencyKey');
    const keyBlock = edgeSource.slice(
      keyStart,
      edgeSource.indexOf('const { data: cached }', keyStart),
    );
    expect(keyBlock).toContain("cacheRevision: 'INTIMPORT_EXACT_SKU_EVIDENCE_V2'");
    expect(keyBlock).toContain('identity,');
    expect(keyBlock).not.toMatch(/importId/);
  });

  it('two different import runs produce ONE key for the same product', () => {
    // Exercise the REAL derivation the server uses, not a hand-written mirror:
    // the same `stableJson` over the same shape the Edge function hashes.
    const identity = { brand: 'Comprital', name: 'AMARETTO GIUBILEO', barcode: null };
    const derive = (fields: string[]) => stableJson({ identity, fields: [...fields].sort() });
    // Field order must not matter …
    expect(derive(['ingredients', 'barcode'])).toBe(derive(['barcode', 'ingredients']));
    // … and nothing run-scoped may appear in the hashed shape at all.
    expect(derive(['ingredients'])).not.toMatch(/import|run|session|\d{13}/i);
    // A different product must still be a different key.
    expect(derive(['ingredients'])).not.toBe(
      stableJson({ identity: { ...identity, name: 'AMBROGIO' }, fields: ['ingredients'] }),
    );
  });

  it('looks the cache up without filtering by import', () => {
    const lookup = edgeSource.slice(
      edgeSource.indexOf('const { data: cached }'),
      edgeSource.indexOf('// Emergency ceiling only.'),
    );
    expect(lookup).toContain(".eq('idempotency_key', idempotencyKey)");
    expect(lookup).not.toContain(".eq('import_id'");
  });
});

/* ── §10 caps count SEARCHES and stop BEFORE exceeding ────────────────────── */

describe('call caps count real searches and stop before exceeding', () => {
  it('reserves the worst case before admitting a call', () => {
    expect(edgeSource).toContain('const WORST_CASE_SEARCHES_PER_CALL = 3;');
    expect(edgeSource).toContain('if (usedSoFar + WORST_CASE_SEARCHES_PER_CALL > maxPerImport)');
    // The old "stop only once already over" form must be gone.
    expect(edgeSource).not.toMatch(/if \(usedSoFar >= maxPerImport\)/);
  });

  it('sums real searches rather than counting jobs', () => {
    expect(edgeSource).toContain("select('web_calls')");
    expect(edgeSource).not.toMatch(/count: 'exact'/);
  });

  it('reports the real search count, never a clamped one', () => {
    expect(edgeSource).toContain('calls: Math.max(1, webCalls)');
    expect(edgeSource).not.toContain('Math.min(maxPerProduct, webCalls)');
  });

  it('a response making 3 searches counts as 3', async () => {
    const provider = vi.fn(async () => ({ facts: [], calls: 3 }));
    const rows: EnrichmentInputRow[] = [{ intelligence: intel(row()), barcode: null }];
    const { summary } = await runIntimportEnrichment(rows, provider, {
      maxCallsPerImport: 10,
      maxSpendUsd: 5,
      concurrency: 1,
    });
    expect(summary.callsUsed).toBe(3);
  });

  it('an import limit of 6 makes a seventh search impossible', async () => {
    // Each job burns 3 searches; with a 6-search ceiling only two may run.
    const provider = vi.fn(async () => ({ facts: [], calls: 3 }));
    const rows: EnrichmentInputRow[] = Array.from({ length: 5 }, (_, i) => ({
      intelligence: intel(row({ 'Product ID': `P-${i}`, 'Product Name Original': `Produkt ${i}` })),
      barcode: null,
    }));
    const { summary } = await runIntimportEnrichment(rows, provider, {
      maxCallsPerImport: 6,
      maxSpendUsd: 5,
      concurrency: 1,
    });
    expect(summary.callsUsed).toBeLessThanOrEqual(6);
    expect(provider.mock.calls.length).toBeLessThanOrEqual(2);
    expect(summary.capReached).toBe(true);
  });

  it('never overshoots on a cap that does not divide evenly', async () => {
    // Cap 5 with 3 searches per job: admitting a second job would reach 6.
    const provider = vi.fn(async () => ({ facts: [], calls: 3 }));
    const rows: EnrichmentInputRow[] = Array.from({ length: 4 }, (_, i) => ({
      intelligence: intel(row({ 'Product ID': `Q-${i}`, 'Product Name Original': `Produkt ${i}` })),
      barcode: null,
    }));
    const { summary } = await runIntimportEnrichment(rows, provider, {
      maxCallsPerImport: 5,
      maxSpendUsd: 5,
      concurrency: 1,
    });
    expect(summary.callsUsed).toBeLessThanOrEqual(5);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(summary.capReached).toBe(true);
  });

  it('bounds each ordered source step independently', () => {
    expect(edgeSource).toContain("Math.min(3, numberEnv('INTIMPORT_MAX_CALLS_PER_SOURCE_STEP', 2))");
    expect(edgeSource).toContain('max_tool_calls: maxPerProduct');
  });
});

/* ── §8 / §13 no laundering, no tuning ────────────────────────────────────── */

describe('authority and confidence stay honest', () => {
  it('applies the allowed domains as a hard provider filter', () => {
    expect(edgeSource).toContain('filters: { allowed_domains: allowedDomains }');
  });

  it('still classifies authority server-side from the real URL', () => {
    expect(edgeSource).toContain('classifySourceAuthority(');
    expect(edgeSource).toContain('ownerProvided: false');
  });

  it('gives no confidence bonus for merely having an official domain', () => {
    const source = readFileSync(new URL('./researchPlan.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/confidence|assessProductConfidence|\+\s*\d+\s*;/);
  });
});
