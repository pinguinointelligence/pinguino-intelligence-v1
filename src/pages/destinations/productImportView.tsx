/**
 * Presentational pieces for the D5C4A upload page. Pure + side-effect-free: they take
 * data and render it on the black shell with the existing primitives (MetricValue for
 * every count, SectionLabel, hairline lists). No service, no store, no DB — so each is
 * unit-testable via static markup. Nothing is hidden or zeroed: warnings and skipped
 * rows render in full (calibration honesty).
 */
import { MetricValue } from '@/components/shared/MetricValue';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { copy } from '@/copy/en';
import { cn } from '@/lib/cn';
import type { ProductIntakeResult, ProductIntakeSource } from '@/data/products/productTableParser';
import type { ImportRowResult, ProductImportSummary } from '@/services/productCatalogImport';
import type { IntimportResult, IntimportRowState } from '@/data/products/intimport';
import {
  importPreviewRedFlags,
  SOURCE_OPTIONS,
  type IntakeRedFlagRow,
} from './productImportController';

const c = copy.productsImport;

/** A single labelled count — mono, tabular, whole number (precision 0). */
export function CountStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[0.6rem] tracking-label text-ivory/40 uppercase">{label}</span>
      <MetricValue value={value} precision={0} size="lg" />
    </div>
  );
}

/** Segmented source selector — the only difference between customer and Colin intake. */
export function SourceSelect({
  value,
  onChange,
}: {
  value: ProductIntakeSource;
  onChange: (next: ProductIntakeSource) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={c.sourceLabel}
      className="inline-flex flex-wrap gap-1 rounded-md border border-ivory/15 p-1"
    >
      {SOURCE_OPTIONS.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.id)}
            className={cn(
              'rounded px-4 py-2 text-sm transition-colors',
              active ? 'bg-ivory text-ink' : 'text-ivory/70 hover:text-ivory',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function WarningList({ label, items, empty }: { label: string; items: string[]; empty: string }) {
  return (
    <div>
      <SectionLabel tone="ivory">{label}</SectionLabel>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-ivory/40">{empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-ivory/10">
          {items.map((line, index) => (
            <li key={`${index}-${line}`} className="py-2 text-sm leading-relaxed text-ivory/70">
              {line}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** INTERNAL red-flag preview — per-row sweetener/polyol/protein/claim/incomplete-OCR signals.
 * Admin-only signals (no percentages, no customer copy); products with these never auto-verify. */
export function RedFlagPreview({ rows }: { rows: IntakeRedFlagRow[] }) {
  return (
    <div>
      <SectionLabel tone="ivory">Red flags · internal review signals</SectionLabel>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-ivory/40">No red flags — nothing blocks auto-verify.</p>
      ) : (
        <ul className="mt-3 divide-y divide-ivory/10">
          {rows.map((row) => (
            <li key={row.rowIndex} className="py-2 text-sm leading-relaxed text-ivory/70">
              <span className="font-mono text-ivory/40">#{row.rowIndex}</span>{' '}
              <span className="text-status-risky">{row.codes.join(', ')}</span>
              {row.blocksAutoVerify ? (
                <span className="text-ivory/40"> · will not auto-verify</span>
              ) : null}
              <span className="block text-ivory/50">{row.reasons.join(' ')}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Parse preview — counts + every warning + every skipped row + internal red flags. Nothing hidden. */
export function ParsePreview({ result }: { result: ProductIntakeResult }) {
  // Warning rows only (a skip row shows its reason in the Skipped list, not here) — so the
  // list count matches the WARNINGS metric. status === 'warning' iff non-skip with warnings.
  const warningLines = result.candidates
    .filter((candidate) => candidate.status === 'warning')
    .map((candidate) => `#${candidate.rowIndex}  ${candidate.warnings.join('; ')}`);
  const skippedLines = result.candidates
    .filter((candidate) => candidate.status === 'skip')
    .map((candidate) => `#${candidate.rowIndex}  ${candidate.skipReason ?? ''}`);

  return (
    <div className="space-y-10">
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        <CountStat label={c.counts.total} value={result.total} />
        <CountStat label={c.counts.valid} value={result.valid} />
        <CountStat label={c.counts.warnings} value={result.warnings} />
        <CountStat label={c.counts.skipped} value={result.skipped} />
      </div>
      <WarningList label={c.warningsLabel} items={warningLines} empty={c.noWarnings} />
      <WarningList label={c.skippedLabel} items={skippedLines} empty={c.noSkipped} />
      <RedFlagPreview rows={importPreviewRedFlags(result)} />
    </div>
  );
}

function rowReason(row: ImportRowResult): string {
  if (row.outcome === 'skipped') return row.skipReason ?? '';
  if (row.outcome === 'failed') return row.error ?? '';
  if (row.outcome === 'in_batch_duplicate') {
    return row.duplicateOfRowIndex != null ? `→ #${row.duplicateOfRowIndex}` : '';
  }
  return row.productCode ?? '';
}

/** Import summary — created/existing/in-batch/skipped/failed counts + warnings + rows. */
export function ImportSummaryView({ summary }: { summary: ProductImportSummary }) {
  return (
    <div className="space-y-10">
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-5">
        <CountStat label={c.counts.created} value={summary.created} />
        <CountStat label={c.counts.existing} value={summary.existingDuplicates} />
        <CountStat label={c.counts.inBatch} value={summary.inBatchDuplicates} />
        <CountStat label={c.counts.skipped} value={summary.skipped} />
        <CountStat label={c.counts.failed} value={summary.failed} />
      </div>
      <p className="text-sm text-ivory/50">
        {c.codesCreated}: <MetricValue value={summary.productCodes.length} precision={0} />
      </p>
      <WarningList label={c.warningsLabel} items={summary.warnings} empty={c.noWarnings} />
      <div>
        <SectionLabel tone="ivory">{c.rowResultsLabel}</SectionLabel>
        <ul className="mt-3 divide-y divide-ivory/10">
          {summary.rowResults.map((row) => (
            <li key={row.rowIndex} className="flex items-center justify-between gap-4 py-2 text-sm">
              <span className="font-mono text-ivory/40">#{row.rowIndex}</span>
              <span className="min-w-0 flex-1 truncate text-ivory/60">{rowReason(row)}</span>
              <span className="shrink-0 text-ivory/70">{c.outcomes[row.outcome]}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * The import action area. Parsing/preview is open to everyone; only this action is
 * auth-gated (createProductWithIdentity requires a signed-in owner). Signed out → a
 * "Sign in to import" button that opens the existing auth modal.
 */
export function ImportActionBar({
  available,
  isSignedIn,
  canImport,
  busy,
  onImport,
  onSignIn,
}: {
  available: boolean;
  isSignedIn: boolean;
  canImport: boolean;
  busy: boolean;
  onImport: () => void;
  onSignIn: () => void;
}) {
  if (!available) {
    return <p className="text-sm text-ivory/50">{c.unavailable}</p>;
  }
  if (!isSignedIn) {
    return (
      <div className="flex flex-wrap items-center gap-4">
        <p className="text-sm text-ivory/60">{c.signInNote}</p>
        <button type="button" className={buttonClasses('ivory', 'sm')} onClick={onSignIn}>
          {c.signIn}
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      disabled={!canImport || busy}
      onClick={onImport}
      className={cn(buttonClasses('ivory', 'md'), (!canImport || busy) && 'opacity-50')}
    >
      {c.import}
    </button>
  );
}

/** Aggregate repeated messages into "message · ×N" so a big file cannot spam the preview. */
function aggregate(lines: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const line of lines) counts.set(line, (counts.get(line) ?? 0) + 1);
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([line, count]) => (count > 1 ? `${line} · ×${count}` : line));
}

/** Message with the row-specific parts generalized, so repeats actually collapse. */
function messageShape(message: string): string {
  return message.replace(/row \d+/g, 'another row').replace(/"[^"]*"/g, '"…"');
}

const ROW_STATE_LABEL: Record<IntimportRowState, string> = {
  EXISTING: 'Existing',
  READY: 'Ready',
  ENRICHMENT_REQUIRED: 'Need enrichment',
  REVIEW_REQUIRED: 'Need review',
  INVALID: 'Invalid',
  DUPLICATE: 'Duplicates',
};

/**
 * INTIMPORT parse preview — the compact, honest summary of one official 36-column file.
 * Counts are exact; repeated messages are aggregated with a count rather than listed
 * hundreds of times. Nothing here performs or implies a paid call.
 */
export function IntimportPreview({ result }: { result: IntimportResult }) {
  const s = result.summary;
  const headerProblems = [
    ...result.missingColumns.map((column) => `missing official column "${column}"`),
    ...result.unexpectedColumns.map((column) => `unknown column "${column}" ignored`),
  ];
  const warningLines = aggregate(
    result.candidates.flatMap((candidate) => candidate.warnings.map(messageShape)),
  );
  const reasonLines = aggregate(
    result.candidates
      .filter((candidate) => candidate.state !== 'READY')
      .flatMap((candidate) => candidate.reasons.map(messageShape)),
  );
  const attention = result.candidates.filter(
    (candidate) => candidate.state === 'REVIEW_REQUIRED' || candidate.state === 'INVALID',
  );

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm text-ivory/60">
        <span className="tracking-label text-ivory uppercase">Format: {result.format}</span>
        <span>Country: {s.countries.length > 0 ? s.countries.join(', ') : '—'}</span>
        <span className={result.headerOk ? 'text-ivory/60' : 'text-status-risky'}>
          {result.headerOk
            ? 'All 36 official columns recognized'
            : 'Header does not match the official contract'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        <CountStat label="Rows" value={s.rows} />
        <CountStat label="Unique products" value={s.uniqueProducts} />
        <CountStat label={ROW_STATE_LABEL.EXISTING} value={s.existing} />
        <CountStat label={ROW_STATE_LABEL.DUPLICATE} value={s.duplicates} />
        <CountStat label={ROW_STATE_LABEL.READY} value={s.ready} />
        <CountStat label={ROW_STATE_LABEL.ENRICHMENT_REQUIRED} value={s.enrichmentRequired} />
        <CountStat label={ROW_STATE_LABEL.REVIEW_REQUIRED} value={s.reviewRequired} />
        <CountStat label={ROW_STATE_LABEL.INVALID} value={s.invalid} />
      </div>

      {headerProblems.length > 0 ? (
        <WarningList label="Header" items={headerProblems} empty="" />
      ) : null}

      <WarningList label="Why rows are not ready" items={reasonLines} empty="Every row is ready." />
      <WarningList label="Warnings" items={warningLines} empty="No warnings." />

      <div>
        <SectionLabel tone="ivory">Rows needing a decision</SectionLabel>
        {attention.length === 0 ? (
          <p className="mt-3 text-sm text-ivory/40">None — no row needs a human decision.</p>
        ) : (
          <ul className="mt-3 divide-y divide-ivory/10">
            {attention.map((candidate) => (
              <li key={candidate.rowIndex} className="py-2 text-sm leading-relaxed text-ivory/70">
                <span className="font-mono text-ivory/40">#{candidate.rowIndex}</span>{' '}
                <span className="text-ivory/80">{candidate.displayName ?? '—'}</span>{' '}
                <span className="text-status-risky">{ROW_STATE_LABEL[candidate.state]}</span>
                <span className="block text-ivory/50">{candidate.reasons.join(' · ')}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * INTIMPORT local-intelligence result (§15) — what Gellatti worked out from its
 * own knowledge, BEFORE any external call. This is the screen the owner reads to
 * decide whether to spend anything at all.
 */
export function IntimportLocalIntelligenceView({
  summary,
  onEnrich,
  onImport,
  canImport = false,
  importBusy = false,
  busy = false,
  progress,
  runSummary = null,
  error = null,
}: {
  summary: {
    products: number;
    existingExact: number;
    readyLocalNoWeb: number;
    webRecommended: number;
    webRequired: number;
    reviewRequired: number;
    familyMatches: number;
    estimatedMaxExternalCalls: number;
    /** Null when no Mapper was available, so the counts are simply absent. */
    valueReadiness?: { READY: number; ESTIMATED_READY: number; REVIEW: number } | null;
    mapperContributed?: number;
    selfContradictory?: number;
  };
  onEnrich?: () => void;
  /** Import everything the local analysis accounted for. No external call. */
  onImport?: () => void;
  canImport?: boolean;
  importBusy?: boolean;
  busy?: boolean;
  progress?: { processed: number; total: number; callsUsed: number } | null;
  runSummary?: {
    webAttempted: number;
    webSkippedHighConfidence: number;
    cacheHits: number;
    callsUsed: number;
    capReached: boolean;
    importEligible: number;
    finalReviewRequired: number;
  } | null;
  error?: string | null;
}) {
  const needsWeb = summary.webRecommended + summary.webRequired;
  return (
    <div className="space-y-6" data-testid="intimport-local-intelligence">
      <SectionLabel tone="ivory">Local intelligence result</SectionLabel>
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        <CountStat label="Products" value={summary.products} />
        <CountStat label="Existing exact" value={summary.existingExact} />
        <CountStat label="Ready ≥90% — no web" value={summary.readyLocalNoWeb} />
        <CountStat label="85–89.99% — web recommended" value={summary.webRecommended} />
        <CountStat label="<85% — web required" value={summary.webRequired} />
        <CountStat label="Review required" value={summary.reviewRequired} />
        <CountStat label="Mapper family matches" value={summary.familyMatches} />
        <CountStat label="Max external calls" value={summary.estimatedMaxExternalCalls} />
      </div>

      <p className="text-sm leading-relaxed text-ivory/60">
        {summary.readyLocalNoWeb} product(s) already reach the no-web threshold and will be skipped
        entirely. Enrichment would look at {needsWeb} product(s), only for the fields that are
        actually missing.
      </p>

      {summary.valueReadiness ? (
        <div className="space-y-3" data-testid="intimport-value-readiness">
          <SectionLabel tone="ivory">Engine composition (Mapper-first)</SectionLabel>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            <CountStat label="Measured — ready" value={summary.valueReadiness.READY} />
            <CountStat
              label="Estimated ≥85% — ready"
              value={summary.valueReadiness.ESTIMATED_READY}
            />
            <CountStat label="Composition review" value={summary.valueReadiness.REVIEW} />
            <CountStat label="Mapper supplied ≥1 field" value={summary.mapperContributed ?? 0} />
          </div>
          <p className="text-sm leading-relaxed text-ivory/60">
            Composition readiness is reported separately from technical dosage authority: a
            professional product can have a complete profile and still be blocked from dosing, and
            the reverse is equally valid.
            {summary.selfContradictory
              ? ` ${summary.selfContradictory} product(s) declare values that contradict each other and need a source fix.`
              : ''}
          </p>
        </div>
      ) : null}

      {progress ? (
        <p className="text-sm text-ivory/70" data-testid="intimport-enrichment-progress">
          Enrichment {progress.processed} / {progress.total} · {progress.callsUsed} external call(s)
        </p>
      ) : null}

      {runSummary ? (
        <div className="space-y-2" data-testid="intimport-enrichment-result">
          <SectionLabel tone="ivory">Internet research result</SectionLabel>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            <CountStat label="Researched" value={runSummary.webAttempted} />
            <CountStat label="Skipped ≥90%" value={runSummary.webSkippedHighConfidence} />
            <CountStat label="Cache hits" value={runSummary.cacheHits} />
            <CountStat label="External calls" value={runSummary.callsUsed} />
            <CountStat label="Import eligible" value={runSummary.importEligible} />
            <CountStat label="Needs review" value={runSummary.finalReviewRequired} />
          </div>
          {runSummary.capReached ? (
            <p className="text-sm text-status-risky">
              Osiągnięto limit wywołań importu — pozostałe produkty czekają na decyzję.
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p
          className="text-sm leading-relaxed text-status-risky"
          data-testid="intimport-enrichment-error"
        >
          {error}
        </p>
      ) : null}

      <div className="space-y-3">
        {/* Web evidence enriches a product; it does not decide whether the
            catalogue may hold it. Import is the primary action and never waits
            on an external call. */}
        <p className="text-sm leading-relaxed text-ivory/60">
          „Web required" oznacza tylko, że dane można jeszcze wzbogacić w internecie — nie blokuje
          importu. Wszystkie rozliczone produkty można zaimportować od razu: gotowe kompozycyjnie
          trafiają do Product Catalog jako gotowe dla Engine, pozostałe trafiają do katalogu bez
          gotowości dla Engine.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          {onImport ? (
            <button
              type="button"
              disabled={!canImport || importBusy}
              onClick={onImport}
              data-testid="intimport-direct-import-action"
              className={cn(
                buttonClasses('ivory', 'md'),
                (!canImport || importBusy) && 'opacity-50',
              )}
            >
              {importBusy ? 'Importowanie…' : 'Importuj produkty'}
            </button>
          ) : null}
          {onEnrich ? (
            <button
              type="button"
              disabled={busy || needsWeb === 0}
              onClick={onEnrich}
              data-testid="intimport-enrich-action"
              className={cn(buttonClasses('ghost', 'md'), (busy || needsWeb === 0) && 'opacity-50')}
            >
              {busy ? 'Wzbogacanie…' : 'Opcjonalnie wzbogać dane'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
