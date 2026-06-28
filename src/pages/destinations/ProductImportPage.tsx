/**
 * Product catalog upload page (Mapper Slice D5C4A) — the first in-app CSV intake UI.
 *
 * ONE unified flow for every source (generic / Mercadona / Colin); the selector only
 * stamps source_type. The page composes the existing machinery and reimplements none of
 * it: parseProductTable (pure) for the preview, importProductCatalog (via runProductImport,
 * no options → matching stays off) for the write. CSV is read as text in the browser only
 * (no upload, no storage bucket). Parsing is open; the Import action requires a signed-in
 * user (the products write is owner-scoped) and otherwise opens the existing auth modal.
 */
import { useState } from 'react';
import { DestinationSection, DestinationSurface } from '@/components/shared/DestinationSurface';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/Button';
import { copy } from '@/copy/en';
import { cn } from '@/lib/cn';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { useAuthStore } from '@/stores/authStore';
import type { ProductIntakeResult, ProductIntakeSource } from '@/data/products/productTableParser';
import { canImport, canParse, DEFAULT_SOURCE, parseIntake, readCsvFile } from './productImportController';
import { runProductImport, type RunImportResult } from './runProductImport';
import { ImportActionBar, ImportSummaryView, ParsePreview, SourceSelect } from './productImportView';

const c = copy.productsImport;

const fieldClass =
  'w-full rounded-md border border-ivory/15 bg-shell-raised px-3 py-2 font-mono text-sm text-ivory placeholder:text-ivory/30 transition-colors focus:border-ivory/40 focus:outline-none';

export function ProductImportPage() {
  const available = useAuthStore((state) => state.available);
  const isSignedIn = useAuthStore((state) => state.status === 'authed');
  const openAuthModal = useAuthModalStore((state) => state.open);

  const [source, setSource] = useState<ProductIntakeSource>(DEFAULT_SOURCE);
  const [csvText, setCsvText] = useState('');
  const [result, setResult] = useState<ProductIntakeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [importResult, setImportResult] = useState<RunImportResult | null>(null);

  const reset = () => {
    setResult(null);
    setImportResult(null);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setCsvText(await readCsvFile(file));
    reset();
  };

  const onParse = () => {
    setResult(parseIntake(csvText, source));
    setImportResult(null);
  };

  const onImport = async () => {
    if (!result) return;
    setBusy(true);
    const outcome = await runProductImport(result.candidates);
    setBusy(false);
    setImportResult(outcome);
  };

  return (
    <DestinationSurface eyebrow={c.eyebrow} title={c.title} blurb={c.blurb}>
      <div className="space-y-12">
        <DestinationSection label={c.sourceLabel}>
          <SourceSelect
            value={source}
            onChange={(next) => {
              setSource(next);
              reset();
            }}
          />
        </DestinationSection>

        <DestinationSection label={c.inputLabel}>
          <textarea
            value={csvText}
            onChange={(event) => setCsvText(event.target.value)}
            rows={8}
            spellCheck={false}
            placeholder={c.pastePlaceholder}
            className={fieldClass}
          />
          <div className="mt-4 flex flex-wrap items-center gap-5">
            <label className="cursor-pointer text-sm text-ivory/60 underline decoration-ivory/30 underline-offset-4 transition-colors hover:text-ivory">
              <input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(event) => {
                  void onFile(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
              {c.fileLabel}
            </label>
            <Button
              variant="ivory"
              size="sm"
              onClick={onParse}
              disabled={!canParse(csvText)}
              className={cn(!canParse(csvText) && 'opacity-50')}
            >
              {c.parse}
            </Button>
          </div>
        </DestinationSection>

        <DestinationSection label={c.previewLabel}>
          {result ? <ParsePreview result={result} /> : <EmptyState title={c.emptyPreview} />}
        </DestinationSection>

        <DestinationSection label={c.resultLabel}>
          <ImportActionBar
            available={available}
            isSignedIn={isSignedIn}
            canImport={canImport({ isSignedIn, result })}
            busy={busy}
            onImport={() => {
              void onImport();
            }}
            onSignIn={openAuthModal}
          />
          {importResult ? (
            importResult.ok ? (
              <div className="mt-8">
                <ImportSummaryView summary={importResult.summary} />
              </div>
            ) : (
              <p className="mt-6 text-sm leading-relaxed text-status-risky">
                {c.importError} {importResult.error}
              </p>
            )
          ) : null}
        </DestinationSection>
      </div>
    </DestinationSurface>
  );
}
