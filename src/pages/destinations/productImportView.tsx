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
import type {
  ProductIntakeResult,
  ProductIntakeSource,
} from '@/data/products/productTableParser';
import type { ImportRowResult, ProductImportSummary } from '@/services/productCatalogImport';
import { importPreviewRedFlags, SOURCE_OPTIONS, type IntakeRedFlagRow } from './productImportController';

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
              {row.blocksAutoVerify ? <span className="text-ivory/40"> · will not auto-verify</span> : null}
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
            <li
              key={row.rowIndex}
              className="flex items-center justify-between gap-4 py-2 text-sm"
            >
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
