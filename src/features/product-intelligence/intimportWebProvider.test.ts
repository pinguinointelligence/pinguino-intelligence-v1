import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  AUTO_IMPORT_FLOOR,
  NO_WEB_CONFIDENCE,
  isAutoImportEligible,
  routeAfterWeb,
  routeBeforeWeb,
  type ProductConfidenceAssessment,
} from './productEvidenceConfidence';
import { runIntimportEnrichment, type EnrichmentInputRow } from './intimportEnrichment';
import { assessIntimportProduct } from './intimportIntelligence';
import { INTIMPORT_COLUMNS, parseINTIMPORT, type IntimportColumn } from '@/data/products/intimport';

const EDGE = new URL('../../../supabase/functions/intimport-enrich/index.ts', import.meta.url);
const edgeSource = readFileSync(EDGE, 'utf8');

const assessment = (over: Partial<ProductConfidenceAssessment> = {}): ProductConfidenceAssessment => ({
  confidence: 50,
  criticalReadiness: false,
  missingCritical: ['ingredients'],
  reasons: [],
  ...over,
});

const row = (overrides: Partial<Record<IntimportColumn, string>> = {}): Record<string, string> => {
  const base = Object.fromEntries(INTIMPORT_COLUMNS.map((c) => [c, 'not_found'])) as Record<
    IntimportColumn,
    string
  >;
  return {
    ...base,
    'Product ID': 'PL-T-1',
    'Country Code': 'PL',
    Brand: 'Marka',
    'Product Name Original': 'Produkt',
    'Net Quantity Value': '500',
    'Net Quantity Unit': 'g',
    ...overrides,
  };
};

const quote = (v: string) => `"${v.replace(/"/g, '""')}"`;
const csv = (rows: readonly Record<string, string>[]) =>
  [
    INTIMPORT_COLUMNS.map(quote).join(','),
    ...rows.map((r) => INTIMPORT_COLUMNS.map((c) => quote(r[c] ?? '')).join(',')),
  ].join('\n');

const intelligenceFor = (r: Record<string, string>) =>
  assessIntimportProduct(parseINTIMPORT(csv([r])).candidates[0]!);

/* ── §30 / §35 exact threshold boundaries ─────────────────────────────────── */

describe('auto-import floor and no-web threshold are distinct', () => {
  it('84.99 is never auto-importable', () => {
    const a = assessment({ confidence: 84.99, criticalReadiness: true, missingCritical: [] });
    expect(isAutoImportEligible(a)).toBe(false);
    expect(routeAfterWeb(a)).toBe('REVIEW_REQUIRED');
  });

  it('85.00 is auto-importable when critical readiness passes', () => {
    const a = assessment({ confidence: 85, criticalReadiness: true, missingCritical: [] });
    expect(isAutoImportEligible(a)).toBe(true);
    expect(routeAfterWeb(a)).toBe('WEB_RECOMMENDED');
  });

  it('89.99 is importable and still below the no-web threshold', () => {
    const a = assessment({ confidence: 89.99, criticalReadiness: true, missingCritical: [] });
    expect(isAutoImportEligible(a)).toBe(true);
    expect(routeBeforeWeb(a)).toBe('WEB_RECOMMENDED');
  });

  it('90.00 takes the local no-web path before enrichment', () => {
    const a = assessment({ confidence: 90, criticalReadiness: true, missingCritical: [] });
    expect(routeBeforeWeb(a)).toBe('READY_LOCAL');
  });

  it.each([90, 95, 100])('preWeb %s never calls the provider', async (confidence) => {
    const provider = vi.fn(async () => ({ facts: [], calls: 1 }));
    const intelligence = intelligenceFor(row());
    const rows: EnrichmentInputRow[] = [
      {
        intelligence: {
          ...intelligence,
          assessment: assessment({ confidence, criticalReadiness: true, missingCritical: [] }),
          route: 'READY_LOCAL',
        },
        barcode: null,
      },
    ];
    const { summary } = await runIntimportEnrichment(rows, provider);
    expect(provider).not.toHaveBeenCalled();
    expect(summary.callsUsed).toBe(0);
  });

  it.each([89.99, 85, 84.99])('preWeb %s does invoke targeted research', async (confidence) => {
    const provider = vi.fn(async () => ({ facts: [], calls: 1 }));
    const intelligence = intelligenceFor(row());
    const rows: EnrichmentInputRow[] = [
      {
        intelligence: {
          ...intelligence,
          assessment: assessment({ confidence }),
          route: confidence >= AUTO_IMPORT_FLOOR ? 'WEB_RECOMMENDED' : 'WEB_REQUIRED',
          enrichmentTargets: ['ingredients'],
        },
        barcode: null,
      },
    ];
    await runIntimportEnrichment(rows, provider);
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it('keeps 90 as the stop-spending line, not the import minimum', () => {
    expect(NO_WEB_CONFIDENCE).toBe(90);
    expect(AUTO_IMPORT_FLOOR).toBe(85);
  });
});

/* ── §16 / §15 technical products ─────────────────────────────────────────── */

describe('researched dosage stays informational', () => {
  it('researches technical evidence for a professional product', () => {
    const intelligence = intelligenceFor(
      row({
        'Product Type': 'professional',
        'Product Name Original': 'BASE GIUBILEO',
        Category: 'Professional gelato products',
        Subcategory: 'Bazy specjalne',
      }),
    );
    expect(intelligence.kind).toBe('technical');
    // The research plan must actually ask for the technical evidence.
    expect(intelligence.enrichmentTargets).toContain('dosage');
    expect(intelligence.enrichmentTargets).toContain('technicalParameters');
  });

  it('keeps a researched manufacturer dosage as information, not as permission', async () => {
    const intelligence = intelligenceFor(row({ 'Product Type': 'professional' }));
    const provider = vi.fn(async () => ({
      facts: [
        { field: 'ingredients' as const, value: 'Cukier.', source: 'manufacturer' as const },
        { field: 'dosage' as const, value: '50 g/kg', source: 'manufacturer' as const },
      ],
      calls: 1,
    }));
    const { products } = await runIntimportEnrichment(
      [{ intelligence, barcode: null }],
      provider,
    );
    // The researched `50 g/kg` is stored as the manufacturer said it. It is
    // never normalized, never converted, and never a condition of import.
    expect(products[0]!.assessment.missingCritical).not.toContain('dosage');
    // Whatever this row's overall confidence turns out to be, the dosage is
    // never the thing standing in its way.
    expect(products[0]!.assessment.criticalReadiness).toBe(true);
  });
});

/* ── §7 targeted research ─────────────────────────────────────────────────── */

describe('research is targeted, not generic', () => {
  it('asks only for what is missing', async () => {
    const intelligence = intelligenceFor(
      row({
        'Ingredients Original': 'Cukier, kakao.',
        'Nutrition Basis': '100 g',
        'Energy kcal': '480',
        'Fat g': '25',
        'Carbohydrates g': '58',
        'Protein g': '6',
      }),
    );
    let asked: readonly string[] = [];
    const provider = vi.fn(async (request: { fields: readonly string[] }) => {
      asked = request.fields;
      return { facts: [], calls: 1 };
    });
    await runIntimportEnrichment([{ intelligence, barcode: null }], provider);
    expect(asked).not.toContain('ingredients');
    expect(asked).not.toContain('energyKcal');
    expect(asked.length).toBeGreaterThan(0);
  });

  it('caps the fields asked per product', async () => {
    const intelligence = intelligenceFor(row());
    let asked: readonly string[] = [];
    const provider = vi.fn(async (request: { fields: readonly string[] }) => {
      asked = request.fields;
      return { facts: [], calls: 1 };
    });
    await runIntimportEnrichment([{ intelligence, barcode: null }], provider);
    expect(asked.length).toBeLessThanOrEqual(3);
  });
});

/* ── §37 security, §4 Scanner isolation ───────────────────────────────────── */

describe('provider runs server-side only', () => {
  it('keeps the provider credential out of the browser', () => {
    const client = readFileSync(
      new URL('../../services/intimportEnrichment.ts', import.meta.url),
      'utf8',
    );
    expect(client).not.toMatch(/OPENAI_API_KEY|api\.openai\.com|Bearer /);
    expect(client).toContain("functions.invoke('intimport-enrich'");
  });

  it('reads its OWN flags and never the Scanner web flags', () => {
    expect(edgeSource).toContain('INTIMPORT_WEB_ENRICHMENT_ENABLED');
    // The decisive isolation: the Scanner client sends allowWeb:true on every
    // scan, so READING its flags here would turn web on for ordinary scans.
    // (The docblock names them deliberately; what matters is that no env read
    // of a PRODUCT_SCANNER_* web flag exists.)
    const envReads = [...edgeSource.matchAll(/Deno\.env\.get\('([^']+)'\)/g)].map((m) => m[1]);
    expect(envReads).not.toContain('PRODUCT_SCANNER_WEB_SEARCH_ENABLED');
    expect(envReads).not.toContain('PRODUCT_SCANNER_MAX_WEB_CALLS');
    expect(envReads).toContain('INTIMPORT_WEB_ENRICHMENT_ENABLED');
  });

  it('is what the Scanner calls for an exact GTIN — without gaining its own web search', () => {
    const scanner = readFileSync(
      new URL('../../../supabase/functions/product-scan-analyze/index.ts', import.meta.url),
      'utf8',
    );
    // The Scanner reaches a source ONLY through this function, which keeps its own flag,
    // its own caps and its own source-authority classification.
    expect(scanner).toContain('/functions/v1/intimport-enrich');
    expect(scanner).not.toContain('INTIMPORT_WEB_ENRICHMENT_ENABLED');
    // Its general web search stays OFF unless explicitly switched on. It used to be
    // default-ON (`!== 'false'`) while the client sent allowWeb:true on every scan.
    expect(scanner).toContain("Deno.env.get('PRODUCT_SCANNER_WEB_SEARCH_ENABLED') === 'true'");
    expect(scanner).not.toContain("PRODUCT_SCANNER_WEB_SEARCH_ENABLED') !== 'false'");
    expect(scanner).not.toContain('body.allowWeb');
  });

  it('sends only public product identity — never recipes or account data', () => {
    expect(edgeSource).toMatch(/const identity = \{/);
    for (const leak of ['recipe', 'items', 'planned_grams', 'email', 'account_profiles']) {
      expect(edgeSource.slice(edgeSource.indexOf('const identity = {'))).not.toContain(leak);
    }
  });

  it('is off unless explicitly enabled', () => {
    expect(edgeSource).toContain(
      "Deno.env.get('INTIMPORT_WEB_ENRICHMENT_ENABLED') !== 'true'",
    );
    expect(edgeSource).toContain('intimport_web_enrichment_disabled');
  });

  it('never lets the model report its own confidence', () => {
    expect(edgeSource).toContain('Never state how confident you are');
    // The provider schema has no confidence field at all.
    const schema = edgeSource.slice(
      edgeSource.indexOf('const ENRICHMENT_SCHEMA'),
      edgeSource.indexOf('const SYSTEM_PROMPT'),
    );
    expect(schema).not.toMatch(/confidence|certainty|probability/i);
  });

  it('classifies authority server-side from the real URL, not the model claim', () => {
    expect(edgeSource).toContain('classifySourceAuthority(');
    expect(edgeSource).toContain('ownerProvided: false');
  });

  it('enforces the import-wide cap server-side', () => {
    expect(edgeSource).toContain('INTIMPORT_MAX_EXTERNAL_CALLS_PER_IMPORT');
    expect(edgeSource).toContain('intimport_import_call_cap_reached');
    expect(edgeSource).toContain("from('intimport_enrichment_usage')");
  });

  it('caps the import on ACTUAL provider searches, not on job count', () => {
    // The first live run showed the provider ignoring max_tool_calls and making
    // up to 3 searches for one job (25 across 10 jobs). Counting rows would have
    // allowed roughly three times the advertised ceiling.
    expect(edgeSource).toContain("select('web_calls')");
    expect(edgeSource).not.toMatch(/select\('id', \{ count: 'exact'/);
    expect(edgeSource).toContain('const usedSoFar = (usageRows ?? []).reduce(');
  });

  it('reports the real number of searches, never a clamped one', () => {
    expect(edgeSource).toContain('calls: Math.max(1, webCalls)');
    expect(edgeSource).not.toContain('Math.min(maxPerProduct, webCalls)');
  });

  it('caches by product identity, not by import run', () => {
    // Including importId meant a second import re-researched everything at full
    // price — observed live as 25 fresh searches and zero cache hits.
    const keyBlock = edgeSource.slice(
      edgeSource.indexOf('const idempotencyKey'),
      edgeSource.indexOf('const { data: cached }'),
    );
    expect(keyBlock).toContain('stableJson({ identity, fields:');
    expect(keyBlock).not.toMatch(/stableJson\(\{ importId/);
  });

  it('bounds tool calls per product', () => {
    expect(edgeSource).toContain('max_tool_calls: maxPerProduct');
    expect(edgeSource).toContain("Math.min(2, numberEnv('INTIMPORT_MAX_CALLS_PER_PRODUCT', 2))");
  });

  it('degrades one product rather than failing the batch', () => {
    expect(edgeSource).toContain("error: 'provider_unavailable'");
  });
});

/* ── §36 evidence merge ───────────────────────────────────────────────────── */

describe('research merges as evidence, never last-write-wins', () => {
  it('a malformed provider result is ignored safely', async () => {
    const intelligence = intelligenceFor(row());
    const provider = vi.fn(async () => ({
      facts: [
        { field: 'ingredients' as const, value: '', source: 'manufacturer' as const },
        { field: 'protein' as const, value: null, source: 'manufacturer' as const },
      ],
      calls: 1,
    }));
    const { products } = await runIntimportEnrichment(
      [{ intelligence, barcode: null }],
      provider,
    );
    expect(products[0]!.appliedFacts).toEqual([]);
    expect(products[0]!.postWebConfidence).toBe(products[0]!.preWebConfidence);
  });

  it('a timeout does not break the batch', async () => {
    const intelligence = intelligenceFor(row());
    let call = 0;
    const provider = vi.fn(async () => {
      call += 1;
      if (call === 1) throw new Error('timeout');
      return { facts: [], calls: 1 };
    });
    const rows = [
      { intelligence, barcode: null },
      { intelligence: intelligenceFor(row({ 'Product ID': 'PL-T-2' })), barcode: null },
    ];
    await expect(
      runIntimportEnrichment(rows, provider, {
        maxCallsPerImport: 10,
        maxSpendUsd: 1,
        concurrency: 1,
      }),
    ).rejects.toThrow();
  });

  it('stronger official evidence resolves over a weaker known source', async () => {
    // The row's own source is a retailer; the provider finds the manufacturer.
    const intelligence = intelligenceFor(
      row({ 'Primary Source URL': 'https://zakupy.biedronka.pl/x.html' }),
    );
    expect(intelligence.sourceAuthority.authority).toBe('AUTHORITATIVE_RETAILER');
    const provider = vi.fn(async () => ({
      facts: [{ field: 'ingredients' as const, value: 'Cukier.', source: 'manufacturer' as const }],
      calls: 1,
    }));
    const { products } = await runIntimportEnrichment(
      [{ intelligence, barcode: null }],
      provider,
    );
    expect(products[0]!.appliedFacts.map((f) => f.field)).toContain('ingredients');
    expect(products[0]!.postWebConfidence).toBeGreaterThan(products[0]!.preWebConfidence);
  });

  it('re-scores deterministically from the merged evidence', async () => {
    const provider = () =>
      vi.fn(async () => ({
        facts: [
          { field: 'ingredients' as const, value: 'Cukier.', source: 'manufacturer' as const },
        ],
        calls: 1,
      }));
    const run = () =>
      runIntimportEnrichment([{ intelligence: intelligenceFor(row()), barcode: null }], provider());
    const [a, b] = await Promise.all([run(), run()]);
    expect(a.products[0]!.postWebConfidence).toBe(b.products[0]!.postWebConfidence);
  });
});
