import type { ReactNode } from 'react';
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

/**
 * Diagnostics belong one fold down. The owner's question is „ile mam, ile jest
 * gotowych" — counts about how the source file was written answer a different
 * one, and printed side by side they read as competing verdicts.
 */
function Details({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="group border-t border-ivory/10 pt-4">
      <summary className="cursor-pointer list-none text-xs tracking-label text-ivory/50 uppercase transition-colors hover:text-ivory/80">
        {label}
      </summary>
      <div className="mt-5 space-y-6">{children}</div>
    </details>
  );
}

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
  const failedRows = summary.rowResults.filter((row) => row.outcome === 'failed');
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-5">
        <CountStat label="Nowe produkty" value={summary.created} />
        <CountStat label="Ponownie użyte" value={summary.existingDuplicates} />
        <CountStat label="Duplikaty w pliku" value={summary.inBatchDuplicates} />
        <CountStat label="Pominięte" value={summary.skipped} />
        <CountStat label="Błędy" value={summary.failed} />
      </div>
      <p className="text-sm text-ivory/50">
        Nadane kody produktów: <MetricValue value={summary.productCodes.length} precision={0} />
      </p>
      <WarningList label="Ostrzeżenia" items={summary.warnings} empty="Brak ostrzeżeń." />
      {failedRows.length > 0 ? (
        <div data-testid="intimport-failed-rows">
          <SectionLabel tone="ivory">Błędy — {failedRows.length}</SectionLabel>
          <ul className="mt-3 divide-y divide-ivory/10">
            {failedRows.map((row) => (
              <li key={row.rowIndex} className="py-2 text-sm leading-relaxed text-ivory/70">
                <span className="font-mono text-ivory/40">#{row.rowIndex}</span>{' '}
                <span className="text-status-risky">{rowReason(row)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {/* Row-by-row is a reference, not the answer: a finished import is five
          numbers, and 820 lines underneath them would bury the five. */}
      <Details label="Wszystkie wiersze">
        <ul className="divide-y divide-ivory/10">
          {summary.rowResults.map((row) => (
            <li key={row.rowIndex} className="flex items-center justify-between gap-4 py-2 text-sm">
              <span className="font-mono text-ivory/40">#{row.rowIndex}</span>
              <span className="min-w-0 flex-1 truncate text-ivory/60">{rowReason(row)}</span>
              <span className="shrink-0 text-ivory/70">{c.outcomes[row.outcome]}</span>
            </li>
          ))}
        </ul>
      </Details>
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
  EXISTING: 'Już w katalogu',
  READY: 'Komplet danych',
  // „Need enrichment" read as a blocker. Online data is optional, and the file
  // simply does not state everything.
  ENRICHMENT_REQUIRED: 'Można wzbogacić online',
  REVIEW_REQUIRED: 'Wymaga decyzji',
  INVALID: 'Niepoprawny wiersz',
  DUPLICATE: 'Duplikaty',
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
        <span className="tracking-label text-ivory uppercase">
          {s.rows} {s.rows === 1 ? 'wiersz' : 'wierszy'}
        </span>
        <span className={result.headerOk ? 'text-ivory/60' : 'text-status-risky'}>
          {result.headerOk
            ? '36/36 kolumn rozpoznanych'
            : 'Nagłówek nie odpowiada oficjalnemu kontacktowi kolumn'}
        </span>
        <span>Kraj: {s.countries.length > 0 ? s.countries.join(', ') : '—'}</span>
      </div>

      {attention.length > 0 ? (
        <div data-testid="intimport-decisions">
          <SectionLabel tone="ivory">Wymagają decyzji — {attention.length}</SectionLabel>
          <ul className="mt-3 divide-y divide-ivory/10">
            {attention.map((candidate) => (
              <li key={candidate.rowIndex} className="py-2 text-sm leading-relaxed text-ivory/70">
                <span className="text-ivory/80">{candidate.displayName ?? '—'}</span>
                <span className="block text-ivory/50">{candidate.reasons.join(' · ')}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {headerProblems.length > 0 ? (
        <WarningList label="Nagłówek" items={headerProblems} empty="" />
      ) : null}

      {/* Hundreds of identical "missing nutrition" lines describe the source
          FILE, not a decision the owner has to make. They stay available and
          stop shouting. */}
      <Details label="Szczegóły danych źródłowych">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <CountStat label="Unikalne produkty" value={s.uniqueProducts} />
          <CountStat label={ROW_STATE_LABEL.EXISTING} value={s.existing} />
          <CountStat label={ROW_STATE_LABEL.DUPLICATE} value={s.duplicates} />
          <CountStat label="Komplet danych w pliku" value={s.ready} />
          <CountStat label="Braki w pliku" value={s.enrichmentRequired} />
          <CountStat label={ROW_STATE_LABEL.REVIEW_REQUIRED} value={s.reviewRequired} />
          <CountStat label={ROW_STATE_LABEL.INVALID} value={s.invalid} />
        </div>
        <p className="text-sm leading-relaxed text-ivory/60">
          Te liczby opisują kompletność samego pliku źródłowego — nie gotowość dla Engine, którą
          Product Intelligence wylicza powyżej.
        </p>
        <WarningList label="Braki w danych źródłowych" items={reasonLines} empty="Brak braków." />
        <WarningList label="Ostrzeżenia" items={warningLines} empty="Brak ostrzeżeń." />
      </Details>
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
  const readiness = summary.valueReadiness;
  const engineReady = readiness ? readiness.READY + readiness.ESTIMATED_READY : null;
  return (
    <div className="space-y-8" data-testid="intimport-local-intelligence">
      <SectionLabel tone="ivory">Analiza</SectionLabel>
      {/* The owner's five questions, and nothing competing with them. */}
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-5">
        <CountStat label="Produkty" value={summary.products} />
        {engineReady !== null ? <CountStat label="Gotowe dla Engine" value={engineReady} /> : null}
        {readiness ? <CountStat label="Do uzupełnienia" value={readiness.REVIEW} /> : null}
        <CountStat label="Już w katalogu" value={summary.existingExact} />
        <CountStat label="Wymagają decyzji" value={summary.reviewRequired} />
      </div>

      {readiness ? (
        <p
          className="text-sm leading-relaxed text-ivory/60"
          data-testid="intimport-value-readiness"
        >
          Gotowe dla Engine trafiają do katalogu z kompletną kompozycją. Pozostałe też zostaną
          zapisane — z całą wiedzą, którą już mamy — i będą gotowe po uzupełnieniu danych.
          {summary.selfContradictory
            ? ` ${summary.selfContradictory} produkt(ów) ma wzajemnie sprzeczne wartości źródłowe i wymaga poprawki w pliku.`
            : ''}
        </p>
      ) : null}

      <Details label="Szczegóły analizy">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <CountStat label="Zmierzone — gotowe" value={readiness?.READY ?? 0} />
          <CountStat label="Oszacowane ≥85% — gotowe" value={readiness?.ESTIMATED_READY ?? 0} />
          <CountStat label="Mapper uzupełnił ≥1 pole" value={summary.mapperContributed ?? 0} />
          <CountStat label="Dopasowania rodziny Mappera" value={summary.familyMatches} />
          <CountStat label="Pewne bez internetu" value={summary.readyLocalNoWeb} />
          <CountStat label="Można wzbogacić online" value={needsWeb} />
          <CountStat label="Maks. zapytań zewnętrznych" value={summary.estimatedMaxExternalCalls} />
        </div>
        <p className="text-sm leading-relaxed text-ivory/60">
          Wzbogacanie online jest opcjonalne i dotyczy wyłącznie brakujących pól. Nie warunkuje
          zapisu do katalogu.
        </p>
      </Details>

      {progress ? (
        <p className="text-sm text-ivory/70" data-testid="intimport-enrichment-progress">
          Wzbogacanie {progress.processed} / {progress.total} · zapytań: {progress.callsUsed}
        </p>
      ) : null}

      {runSummary ? (
        <div className="space-y-2" data-testid="intimport-enrichment-result">
          <SectionLabel tone="ivory">Wynik wzbogacania</SectionLabel>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            <CountStat label="Sprawdzone online" value={runSummary.webAttempted} />
            <CountStat label="Pominięte ≥90%" value={runSummary.webSkippedHighConfidence} />
            <CountStat label="Z pamięci podręcznej" value={runSummary.cacheHits} />
            <CountStat label="Zapytania zewnętrzne" value={runSummary.callsUsed} />
            <CountStat label="Gotowe do importu" value={runSummary.importEligible} />
            <CountStat label="Do uzupełnienia" value={runSummary.finalReviewRequired} />
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

      {/* Web evidence enriches a product; it never decides whether the catalogue
          may hold it. Import is the primary action and waits on no external call. */}
      <div className="space-y-3">
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

/**
 * What the import is doing, while it does it.
 *
 * Sequential canonical ingest runs about a row per second, so a real catalogue
 * takes many minutes. A single "Importowanie…" over that span is
 * indistinguishable from a hang, and the owner has no way to tell progress from
 * paralysis. This shows the counts moving, the row in flight, and how long ago
 * the last one landed.
 */
export function ImportProgressView({
  progress,
  lastUpdateAt,
  done = false,
  stopped = null,
}: {
  progress: {
    processed: number;
    total: number;
    created: number;
    existing: number;
    skipped: number;
    failed: number;
    currentName: string | null;
  };
  /** Wall-clock of the last completed row, or null before the first one lands. */
  lastUpdateAt: string | null;
  done?: boolean;
  stopped?: { reason: string; remaining: number } | null;
}) {
  const pct = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;
  const heading = stopped
    ? 'IMPORT ZATRZYMANY'
    : done
      ? 'IMPORT ZAKOŃCZONY'
      : 'IMPORTOWANIE PRODUKTÓW';
  return (
    <div className="space-y-4" data-testid="intimport-progress">
      <SectionLabel tone="ivory">{heading}</SectionLabel>
      <p className="text-sm text-ivory/70">
        Przetworzono {progress.processed} / {progress.total} — {pct}%
      </p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-ivory/10">
        <div
          className={cn('h-full rounded-full', stopped ? 'bg-status-risky' : 'bg-ivory/70')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-5">
        <CountStat label="Utworzono" value={progress.created} />
        <CountStat label="Ponownie użyto" value={progress.existing} />
        <CountStat label="Pominięto" value={progress.skipped} />
        <CountStat label="Nieudane" value={progress.failed} />
        <CountStat label="Pozostało" value={Math.max(0, progress.total - progress.processed)} />
      </div>
      {!done && !stopped ? (
        <p className="text-sm text-ivory/60">
          {progress.currentName ? `Bieżący produkt: ${progress.currentName}` : 'Przetwarzanie…'}
        </p>
      ) : null}
      {!done && !stopped ? (
        <p className="text-xs text-[#8a7f6d]" data-testid="intimport-progress-heartbeat">
          {lastUpdateAt === null
            ? 'Oczekiwanie na odpowiedź serwera…'
            : `Ostatnia aktualizacja: ${lastUpdateAt}`}
        </p>
      ) : null}
      {stopped ? (
        <div className="space-y-1" data-testid="intimport-progress-stopped">
          <p className="text-sm text-status-risky">Powód: {stopped.reason}</p>
          <p className="text-xs text-[#8a7f6d]">
            {stopped.remaining} wierszy nie zostało przetworzonych. Po usunięciu przyczyny można
            bezpiecznie wznowić — produkty już zapisane nie zostaną utworzone ponownie.
          </p>
        </div>
      ) : null}
    </div>
  );
}
