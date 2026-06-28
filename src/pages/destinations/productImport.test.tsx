import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SurfaceToneContext } from '@/components/ui/surface';
import { copy } from '@/copy/en';
import type { ProductImportSummary } from '@/services/productCatalogImport';

/** Mock the ONE service the page writes through, so no DB/Supabase is loaded. */
const h = vi.hoisted(() => ({ importProductCatalog: vi.fn() }));
vi.mock('@/services/productCatalogImport', () => ({ importProductCatalog: h.importProductCatalog }));

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
  ImportSummaryView,
  ParsePreview,
} from './productImportView';
import { ProductImportPage } from './ProductImportPage';

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
    { rowIndex: 1, outcome: 'created', productId: 'id-1', productCode: 'PR-ING-000001', warnings: [] },
    { rowIndex: 2, outcome: 'existing', productId: 'old-1', productCode: 'PR-ING-000099', warnings: [] },
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
    expect(parseIntake(CSV_ONE, 'generic').candidates[0]!.insert.source_type).toBe('catalog_import');
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
    expect(text).toMatch(/Total rows\s+2\b/);
    expect(text).toMatch(/Skipped\s+1\b/);
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
    expect(text).toMatch(/Created\s+1\b/); // count value beside its label
    expect(text).toMatch(/Failed\s+1\b/);
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
      <ImportActionBar available={false} isSignedIn={false} canImport={false} busy={false} onImport={noop} onSignIn={noop} />,
    );
    expect(visibleText(html)).toContain(c.unavailable);
  });
  it('shows a "Sign in to import" action when signed out', () => {
    const html = shellRender(
      <ImportActionBar available isSignedIn={false} canImport={false} busy={false} onImport={noop} onSignIn={noop} />,
    );
    expect(visibleText(html)).toContain(c.signIn);
  });
  it('disables Import when signed in but nothing is importable, enables it otherwise', () => {
    const disabled = shellRender(
      <ImportActionBar available isSignedIn canImport={false} busy={false} onImport={noop} onSignIn={noop} />,
    );
    expect(disabled).toContain('disabled');
    const enabled = shellRender(
      <ImportActionBar available isSignedIn canImport busy={false} onImport={noop} onSignIn={noop} />,
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

describe('runProductImport — service seam (runMatch stays off)', () => {
  it('calls importProductCatalog exactly once with the candidates and NO options object', async () => {
    const summary = makeSummary();
    h.importProductCatalog.mockResolvedValue(summary);
    const candidates = parseIntake(CSV_ONE, 'generic').candidates;
    const result = await runProductImport(candidates);
    expect(result).toEqual({ ok: true, summary });
    expect(h.importProductCatalog).toHaveBeenCalledTimes(1);
    expect(h.importProductCatalog).toHaveBeenCalledWith(candidates);
    expect(h.importProductCatalog.mock.calls[0]).toHaveLength(1); // no second (options) argument
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
});

describe('Parse CSV enablement + visibility (bugfix)', () => {
  it('canParse is true for any non-whitespace CSV text (paste path enables Parse)', () => {
    expect(canParse('Group,Subcategory\nA,B')).toBe(true);
    expect(canParse(CSV_ONE)).toBe(true);
  });

  it('canParse is false for empty or whitespace-only text (Parse stays disabled)', () => {
    expect(canParse('')).toBe(false);
    expect(canParse('   \n\t  ')).toBe(false);
  });

  it('file-loaded CSV text also enables Parse (file path → same predicate)', async () => {
    const text = await readCsvFile(new File(['Brand,Product Name\nB,N'], 'x.csv', { type: 'text/csv' }));
    expect(canParse(text)).toBe(true);
  });

  it('parse enablement does not depend on auth — signed-out users can still parse/preview', () => {
    // canParse is a pure function of the text only; the page renders the textarea + Parse
    // button regardless of auth (smoke render below is the signed-out, auth-unavailable case).
    const html = shellRender(<ProductImportPage />);
    expect(html).toContain('Parse CSV');
    expect(html).toContain('<textarea');
  });

  it('the Parse button is shell-visible (ivory variant), not the dark ghost-on-shell look', () => {
    const html = shellRender(<ProductImportPage />);
    const m = html.match(/<button[^>]*>Parse CSV<\/button>/);
    expect(m, 'Parse CSV button present').not.toBeNull();
    const btn = m![0];
    expect(btn.includes('bg-ivory'), 'uses the shell-visible ivory variant').toBe(true);
    expect(btn.includes('border-ink/15'), 'must NOT use the paper-tone ghost border on the shell').toBe(false);
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
