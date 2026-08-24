import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SurfaceToneContext } from '@/components/ui/surface';
import { copy } from '@/copy/en';
import type { ProductImportSummary } from '@/services/productCatalogImport';

/** Mock the ONE service the page writes through, so no DB/Supabase is loaded. */
const h = vi.hoisted(() => ({ importProductCatalog: vi.fn() }));
vi.mock('@/services/productCatalogImport', () => ({
  importProductCatalog: h.importProductCatalog,
}));

import {
  canImport,
  canParse,
  importableCount,
  parseIntake,
  readCsvFile,
} from './productImportController';
import { runProductImport } from './runProductImport';
import {
  ImportActionBar,
  CleanImportPreflightView,
  ImportProgressView,
  ImportSummaryView,
  IntimportLocalIntelligenceView,
  ParsePreview,
} from './productImportView';
import { ProductImportPage } from './ProductImportPage';
import { restoredImportProgress } from './productImportRunViewState';

const c = copy.productsImport;

const shellRender = (el: ReactElement): string =>
  renderToStaticMarkup(
    <MemoryRouter>
      <SurfaceToneContext.Provider value="shell">{el}</SurfaceToneContext.Provider>
    </MemoryRouter>,
  );
const visibleText = (html: string): string =>
  html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');

const CSV_ONE = 'brand,product name\nBabbi,Crumble';
const CSV_MIX = 'brand,product name,warehouse_id\nBabbi,Crumble,W42\n,,Z';
const CSV_SKIP = 'brand,product name,ean\n,,12345';

const makeSummary = (): ProductImportSummary => ({
  total: 3,
  created: 1,
  existingDuplicates: 1,
  inBatchDuplicates: 0,
  skipped: 0,
  failed: 1,
  productIds: ['id-1', 'old-1'],
  productCodes: ['PR-ING-000001', 'PR-ING-000099'],
  warnings: ['matching unavailable after row 2: boom'],
  rowResults: [
    {
      rowIndex: 1,
      outcome: 'created',
      productId: 'id-1',
      productCode: 'PR-ING-000001',
      warnings: [],
    },
    {
      rowIndex: 2,
      outcome: 'existing',
      productId: 'old-1',
      productCode: 'PR-ING-000099',
      warnings: [],
    },
    { rowIndex: 3, outcome: 'failed', error: 'kaboom', warnings: [] },
  ],
});

afterEach(() => vi.clearAllMocks());

describe('productImportController — parse + gating', () => {
  it('parses CSV text into honest counts (total/valid/warnings/skipped)', () => {
    const result = parseIntake(CSV_MIX, 'generic');
    expect(result.total).toBe(2);
    expect(result.warnings).toBe(1); // the unknown-column row
    expect(result.skipped).toBe(1); // the no-identity row
    expect(importableCount(result)).toBe(1);
  });

  it('reads a chosen .csv File as text in the browser (Blob.text), same result as paste', async () => {
    const file = new File([CSV_MIX], 'catalog.csv', { type: 'text/csv' });
    const text = await readCsvFile(file);
    expect(text).toBe(CSV_MIX);
    expect(parseIntake(text, 'generic').total).toBe(parseIntake(CSV_MIX, 'generic').total);
  });

  it('maps each source to its source_type (generic→catalog_import, mercadona, colin→colin_catalog)', () => {
    expect(parseIntake(CSV_ONE, 'generic').candidates[0]!.insert.source_type).toBe(
      'catalog_import',
    );
    expect(parseIntake(CSV_ONE, 'mercadona').candidates[0]!.insert.source_type).toBe('mercadona');
    expect(parseIntake(CSV_ONE, 'colin').candidates[0]!.insert.source_type).toBe('colin_catalog');
  });

  it('canImport is false before parse, false when signed out, true only when signed in with importable rows', () => {
    const result = parseIntake(CSV_MIX, 'generic');
    expect(canImport({ isSignedIn: true, result: null })).toBe(false); // before parse
    expect(canImport({ isSignedIn: false, result })).toBe(false); // signed out
    expect(canImport({ isSignedIn: true, result })).toBe(true); // signed in + importable
    const allSkip = parseIntake(CSV_SKIP, 'generic');
    expect(importableCount(allSkip)).toBe(0);
    expect(canImport({ isSignedIn: true, result: allSkip })).toBe(false); // nothing importable
  });
});

describe('ParsePreview — nothing hidden', () => {
  it('renders the actual count VALUES, the unknown-column warning, and the skipped row index + reason', () => {
    const html = shellRender(<ParsePreview result={parseIntake(CSV_MIX, 'generic')} />);
    const text = visibleText(html);
    // count VALUES render next to their labels — not just the labels (anchored: bare '2'/'1'
    // would also match row indices like #1/#2, so assert the value sits beside the metric).
    expect(text).toMatch(/Wiersze\s+2\b/);
    expect(text).toMatch(/Pominięte\s+1\b/);
    // counts are whole numbers — MetricValue precision 0 (a regression to 1 would render "2.0").
    expect(text).not.toMatch(/\d\.\d/);
    expect(text).toContain('warehouse_id'); // unknown column warning surfaced
    expect(text).toMatch(/#2\b[\s\S]*no usable identity/); // skip row index + reason, paired
  });
});

describe('ImportSummaryView', () => {
  it('renders created/existing/in-batch/skipped/failed VALUES, warnings, and row outcomes', () => {
    const html = shellRender(<ImportSummaryView summary={makeSummary()} />);
    const text = visibleText(html);
    expect(text).toMatch(/Nowe produkty\s+1\b/); // count value beside its label
    expect(text).toMatch(/Błędy\s+1\b/);
    expect(text).not.toMatch(/\d\.\d/); // whole-number counts (MetricValue precision 0)
    expect(text).toContain('matching unavailable after row 2: boom'); // batch warning shown
    expect(text).toContain('kaboom'); // failed row reason shown
    expect(text).toContain(c.outcomes.existing);
  });
});

describe('ImportActionBar — auth gating', () => {
  const noop = () => {};
  it('shows the unavailable note when auth is not configured', () => {
    const html = shellRender(
      <ImportActionBar
        available={false}
        isSignedIn={false}
        canImport={false}
        busy={false}
        onImport={noop}
        onSignIn={noop}
      />,
    );
    expect(visibleText(html)).toContain(c.unavailable);
  });
  it('shows a "Sign in to import" action when signed out', () => {
    const html = shellRender(
      <ImportActionBar
        available
        isSignedIn={false}
        canImport={false}
        busy={false}
        onImport={noop}
        onSignIn={noop}
      />,
    );
    expect(visibleText(html)).toContain(c.signIn);
  });
  it('disables Import when signed in but nothing is importable, enables it otherwise', () => {
    const disabled = shellRender(
      <ImportActionBar
        available
        isSignedIn
        canImport={false}
        busy={false}
        onImport={noop}
        onSignIn={noop}
      />,
    );
    expect(disabled).toContain('disabled');
    const enabled = shellRender(
      <ImportActionBar
        available
        isSignedIn
        canImport
        busy={false}
        onImport={noop}
        onSignIn={noop}
      />,
    );
    expect(enabled).not.toContain('disabled');
  });
  it('disables Import while an import is in flight (busy), even when importable', () => {
    const html = shellRender(
      <ImportActionBar available isSignedIn canImport busy onImport={noop} onSignIn={noop} />,
    );
    expect(html).toContain('disabled');
  });
});

describe('clean INTIMPORT safety controls', () => {
  const restoredRun = {
    id: 'run-1',
    status: 'ROLLED_BACK' as const,
    source: 'INTIMPORT' as const,
    mode: 'CLEAN_OWNER_REIMPORT' as const,
    label: 'PL Poland',
    source_file_name: 'PL_Poland.csv',
    source_fingerprint: 'a'.repeat(64),
    total_rows: 820,
    processed: 272,
    created: 3,
    reused: 267,
    updated: 267,
    review: 0,
    skipped: 0,
    failed: 2,
    remaining: 548,
    started_at: '2026-08-24T18:01:40Z',
    finished_at: '2026-08-24T18:17:00Z',
    rolled_back_at: '2026-08-24T18:45:08Z',
  };

  it('blocks clean import when PR is not zero and shows the exact catalog counts', () => {
    const text = visibleText(
      shellRender(
        <CleanImportPreflightView
          preflight={{
            pi: 2088,
            pr: 820,
            prVersions: 820,
            prBehaviorBindings: 2763,
            prMatchedBasementRelations: 428,
            ready: false,
          }}
        />,
      ),
    );
    expect(text).toContain('PI: 2088');
    expect(text).toContain('PR: 820');
    expect(text).toContain('Import zablokowany');
    expect(text).toContain('PR = 0');
  });

  it('shows the approved clean boundary only for PI=2088 / PR=0', () => {
    const text = visibleText(
      shellRender(
        <CleanImportPreflightView
          preflight={{
            pi: 2088,
            pr: 0,
            prVersions: 0,
            prBehaviorBindings: 0,
            prMatchedBasementRelations: 0,
            ready: true,
          }}
        />,
      ),
    );
    expect(text).toContain('✓ Gotowe do czystego importu');
  });

  it('renders Przerwij import beside a running progress state', () => {
    const html = shellRender(
      <ImportProgressView
        progress={{
          processed: 327,
          total: 820,
          created: 327,
          existing: 0,
          skipped: 0,
          failed: 0,
          currentName: 'Produkt',
        }}
        lastUpdateAt="20:00:00"
        onCancel={() => {}}
      />,
    );
    expect(visibleText(html)).toContain('Przerwij import');
    expect(html).toContain('intimport-cancel-action');
  });

  it('does not restore stale progress after a run has been rolled back', () => {
    expect(restoredImportProgress(restoredRun)).toBeNull();
    expect(
      restoredImportProgress({ ...restoredRun, status: 'CANCELLED', rolled_back_at: null }),
    ).toMatchObject({ processed: 272, total: 820, created: 3, existing: 267, failed: 2 });
  });
});

describe('runProductImport — service seam (runMatch stays off)', () => {
  it('calls importProductCatalog exactly once with the candidates, never enabling matching', async () => {
    const summary = makeSummary();
    h.importProductCatalog.mockResolvedValue(summary);
    const candidates = parseIntake(CSV_ONE, 'generic').candidates;
    const result = await runProductImport(candidates);
    expect(result).toEqual({ ok: true, summary });
    expect(h.importProductCatalog).toHaveBeenCalledTimes(1);
    expect(h.importProductCatalog).toHaveBeenCalledWith(candidates, undefined);
    // Progress may be forwarded, but matching must never be switched on here.
    const options = h.importProductCatalog.mock.calls[0]![1] as { runMatch?: boolean } | undefined;
    expect(options?.runMatch).toBeUndefined();
  });

  it('returns a calm error result when the service rejects (no crash)', async () => {
    h.importProductCatalog.mockRejectedValue(new Error('You must be signed in to add a product.'));
    const result = await runProductImport([]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/signed in/);
  });
});

describe('ProductImportPage — render smoke', () => {
  it('renders the intake surface with all three sources and no customer-facing "Demo"', () => {
    const html = shellRender(<ProductImportPage />);
    const text = visibleText(html);
    expect(text).toContain(c.title);
    expect(text).toContain(c.eyebrow);
    expect(text).toContain(c.blurb);
    expect(text).toContain(c.sources.generic);
    expect(text).toContain(c.sources.mercadona);
    expect(text).toContain(c.sources.colin);
    expect(text).toContain(c.parse);
    expect(text).toContain(c.emptyPreview);
    expect(/\bdemo\b/i.test(text)).toBe(false);
  });

  it('labels Product Intelligence counts as analyzed, never already persisted', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/destinations/ProductImportPage.tsx'),
      'utf8',
    );
    expect(source).toContain('Product Intelligence: przeanalizowano {importPlan.total}');
    expect(source).not.toContain('{importPlan.total} zapisanych do katalogu');
  });
});

describe('Parse enablement + visibility (bugfix)', () => {
  it('canParse is true for any non-whitespace CSV text (paste path enables Parse)', () => {
    expect(canParse('Group,Subcategory\nA,B')).toBe(true);
    expect(canParse(CSV_ONE)).toBe(true);
  });

  it('canParse is false for empty or whitespace-only text (Parse stays disabled)', () => {
    expect(canParse('')).toBe(false);
    expect(canParse('   \n\t  ')).toBe(false);
  });

  it('file-loaded CSV text also enables Parse (file path → same predicate)', async () => {
    const text = await readCsvFile(
      new File(['Brand,Product Name\nB,N'], 'x.csv', { type: 'text/csv' }),
    );
    expect(canParse(text)).toBe(true);
  });

  it('parse enablement does not depend on auth — signed-out users can still parse/preview', () => {
    // canParse is a pure function of the text only; the page renders the textarea + Parse
    // button regardless of auth (smoke render below is the signed-out, auth-unavailable case).
    const html = shellRender(<ProductImportPage />);
    expect(html).toContain('Analizuj plik');
    expect(html).toContain('<textarea');
  });

  it('the Parse button is shell-visible (ivory variant), not the dark ghost-on-shell look', () => {
    const html = shellRender(<ProductImportPage />);
    const m = html.match(/<button[^>]*>Analizuj plik<\/button>/);
    expect(m, 'Analizuj plik button present').not.toBeNull();
    const btn = m![0];
    expect(btn.includes('bg-ivory'), 'uses the shell-visible ivory variant').toBe(true);
    expect(
      btn.includes('border-ink/15'),
      'must NOT use the paper-tone ghost border on the shell',
    ).toBe(false);
    // initial state: the box is empty, so Parse is correctly disabled
    expect(/\bdisabled\b/.test(btn)).toBe(true);
  });

  it('Import stays disabled until BOTH a parse exists AND the user is signed in', () => {
    const result = parseIntake(CSV_ONE, 'generic');
    expect(canImport({ isSignedIn: true, result: null })).toBe(false); // parsed not yet → disabled
    expect(canImport({ isSignedIn: false, result })).toBe(false); // signed out → disabled
    expect(canImport({ isSignedIn: true, result })).toBe(true); // both satisfied → enabled
  });
});

describe('INTIMPORT direct import is never gated by web enrichment', () => {
  /** A file where almost every row could still be enriched from the web. */
  const summary = {
    products: 820,
    existingExact: 0,
    readyLocalNoWeb: 3,
    webRecommended: 0,
    webRequired: 817,
    reviewRequired: 0,
    familyMatches: 229,
    estimatedMaxExternalCalls: 817,
  } as never;

  it('offers Importuj produkty as a live action while 817 rows are web-required', () => {
    const html = shellRender(
      <IntimportLocalIntelligenceView
        summary={summary}
        onEnrich={() => {}}
        onImport={() => {}}
        canImport
      />,
    );
    expect(html).toContain('intimport-direct-import-action');
    expect(visibleText(html)).toContain('Importuj produkty');
    // The import action must NOT be disabled just because the web could add more.
    const button = html.slice(html.indexOf('intimport-direct-import-action') - 300);
    expect(button.slice(0, 400)).not.toContain('disabled');
  });

  it('demotes enrichment to an optional, clearly-labelled action', () => {
    const text = visibleText(
      shellRender(
        <IntimportLocalIntelligenceView
          summary={summary}
          onEnrich={() => {}}
          onImport={() => {}}
          canImport
        />,
      ),
    );
    expect(text).toContain('Opcjonalnie wzbogać dane');
    expect(text).not.toContain('Wzbogać i przygotuj import');
  });

  it('never presents online data as a precondition for importing', () => {
    const text = visibleText(
      shellRender(
        <IntimportLocalIntelligenceView
          summary={summary}
          onEnrich={() => {}}
          onImport={() => {}}
          canImport
        />,
      ),
    );
    // The old wording made 817 rows look blocked. Nothing on the primary
    // summary may read as a requirement to go online.
    expect(text).not.toContain('WEB REQUIRED');
    expect(text).not.toContain('Wymagany internet');
    // The fixture carries no readiness, so assert the summary that always
    // renders — and that the import action is offered regardless.
    expect(text).toContain('Przeanalizowano');
    expect(text).toContain('Importuj produkty');
  });

  it('never labels ESTIMATED_READY at 72.8% as Engine-ready', () => {
    const text = visibleText(
      shellRender(
        <IntimportLocalIntelligenceView
          summary={{
            products: 1,
            existingExact: 0,
            readyLocalNoWeb: 0,
            webRecommended: 0,
            webRequired: 1,
            reviewRequired: 0,
            identityConflicts: 3,
            familyMatches: 0,
            estimatedMaxExternalCalls: 3,
            valueReadiness: { READY: 0, ESTIMATED_READY: 1, REVIEW: 0 },
          }}
          readiness={{
            sourceAnalyzed: 1,
            workingProfileComplete: 1,
            productAccuracyPass: 0,
            criticalPhysicsResolved: 1,
            productProfileReady: 0,
            productBehaviorAuthorityPass: 0,
            engineReady: 0,
            review: 1,
            blocked: 0,
            other: 0,
          }}
        />,
      ),
    );
    expect(text).toMatch(/Kompletna kompozycja robocza\s+1/);
    expect(text).toMatch(/Gotowe dla Engine\s+0/);
    expect(text).toMatch(/Product Accuracy ≥85%\s+0/);
    expect(text).toMatch(/Konflikty \/ decyzje\s+3/);
    expect(text).not.toContain('Oszacowane ≥85% — gotowe');
  });
});
