import { buttonClasses } from '@/components/ui/buttonStyles';
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
import { useEffect, useMemo, useRef, useState } from 'react';
import { DestinationSection, DestinationSurface } from '@/components/shared/DestinationSurface';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/Button';
import { copy } from '@/copy/en';
import { cn } from '@/lib/cn';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { useAuthStore } from '@/stores/authStore';
import type { ProductIntakeResult, ProductIntakeSource } from '@/data/products/productTableParser';
import type { IntimportResult } from '@/data/products/intimport';
import {
  planIntimportImport,
  runIntimportLocalIntelligence,
  summarizeIntimportReadiness,
  type IntimportLocalSummary,
  type IntimportProductIntelligence,
} from '@/features/product-intelligence/intimportIntelligence';
import {
  runIntimportEnrichment,
  type EnrichmentProgress,
  type EnrichmentRunSummary,
} from '@/features/product-intelligence/intimportEnrichment';
import { runIntimportSemanticClassification } from '@/features/product-intelligence/intimportSemanticClassification';
import {
  createIntimportSemanticProvider,
  createIntimportWebProvider,
} from '@/services/intimportEnrichment';
import { loadMapperKnowledge } from '@/services/mapperKnowledge';
import {
  planIntimportDedup,
  type IntimportDedupPlan,
} from '@/features/product-intelligence/intimportDedup';
import {
  IntimportSheetAmbiguousError,
  intimportWorkbookToCsv,
} from '@/data/products/intimportWorkbook';
import {
  canImport,
  canParse,
  DEFAULT_SOURCE,
  errorMessage,
  intimportToIntakeResult,
  parseIntake,
  parseIntimport,
  readCsvFile,
} from './productImportController';
import { runProductImport, type RunImportResult } from './runProductImport';
import type { ImportProgress } from '@/services/productCatalogImport';
import {
  ImportActionBar,
  CleanImportPreflightView,
  ImportProgressView,
  ImportSummaryView,
  IntimportLocalIntelligenceView,
  IntimportPreview,
  ParsePreview,
  SourceSelect,
} from './productImportView';
import {
  finishProductImportRun,
  getCleanProductImportPreflight,
  getProductImportRun,
  productImportSourceFingerprint,
  recordProductImportRowOutcome,
  rememberedProductImportRun,
  requestProductImportCancellation,
  rollbackProductImportRun,
  startCleanIntimportRun,
  type ProductImportPreflight,
  type ProductImportRunState,
} from '@/services/productImportRuns';
import { restoredImportProgress } from './productImportRunViewState';

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
  const [intimport, setIntimport] = useState<IntimportResult | null>(null);
  const [localIntelligence, setLocalIntelligence] = useState<IntimportLocalSummary | null>(null);
  const [localRows, setLocalRows] = useState<IntimportProductIntelligence[]>([]);
  const [dedupPlan, setDedupPlan] = useState<IntimportDedupPlan | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState<EnrichmentProgress | null>(null);
  const [enrichSummary, setEnrichSummary] = useState<EnrichmentRunSummary | null>(null);
  const [enrichError, setEnrichError] = useState<string | null>(null);
  const [mapperNotice, setMapperNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [importResult, setImportResult] = useState<RunImportResult | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [preflight, setPreflight] = useState<ProductImportPreflight | null>(null);
  const [preflightBusy, setPreflightBusy] = useState(false);
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const [importRun, setImportRun] = useState<ProductImportRunState | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [rollbackBusy, setRollbackBusy] = useState(false);
  const [rollbackRemaining, setRollbackRemaining] = useState<number | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const cancellationRequested = useRef(false);
  // Wall-clock of the last completed row. The page schedules nothing: progress
  // events are themselves the liveness signal, arriving about once a second, and
  // a stalled import is visible as a timestamp that stops advancing.
  const [lastProgressAt, setLastProgressAt] = useState<string | null>(null);
  // A workbook whose sheets are genuinely tied: the owner chooses, we never guess.
  const [sheetChoice, setSheetChoice] = useState<{ file: File; sheets: string[] } | null>(null);
  // The owner uploaded a file: show them the FILE, not its serialization.
  const [fileInfo, setFileInfo] = useState<{ name: string; sheet: string | null } | null>(null);
  const [importPlan, setImportPlan] = useState<{
    total: number;
    productProfileReady: number;
    /** Informational: rows whose manufacturer dosage is unproven. Not blocked. */
    dosageUnproven: number;
    review: number;
  } | null>(null);
  const readinessSummary = useMemo(
    () => (localRows.length > 0 ? summarizeIntimportReadiness(localRows) : null),
    [localRows],
  );

  const reset = () => {
    setResult(null);
    setIntimport(null);
    setLocalIntelligence(null);
    setLocalRows([]);
    setDedupPlan(null);
    setEnrichProgress(null);
    setEnrichSummary(null);
    setEnrichError(null);
    setImportResult(null);
    setProgress(null);
    setLastProgressAt(null);
    setPreflight(null);
    setPreflightError(null);
  };

  useEffect(() => {
    if (!isSignedIn) return;
    const runId = rememberedProductImportRun();
    if (!runId) return;
    void getProductImportRun(runId)
      .then((state) => {
        setImportRun(state);
        setProgress(restoredImportProgress(state));
      })
      .catch((error) => setRunError(errorMessage(error)));
  }, [isSignedIn]);

  const refreshPreflight = async () => {
    if (!isSignedIn) return;
    setPreflightBusy(true);
    setPreflightError(null);
    try {
      setPreflight(await getCleanProductImportPreflight());
    } catch (error) {
      setPreflight(null);
      setPreflightError(errorMessage(error));
    } finally {
      setPreflightBusy(false);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setSheetChoice(null);
    try {
      setCsvText(await readCsvFile(file));
      setFileInfo({ name: file.name, sheet: null });
      reset();
    } catch (error: unknown) {
      // Several sheets carry the INTIMPORT headers and none covers more of the
      // schema than the others. Guessing here would silently import the wrong
      // half of a workbook, so the owner picks.
      if (error instanceof IntimportSheetAmbiguousError) {
        setSheetChoice({ file, sheets: error.sheets });
        return;
      }
      throw error;
    }
  };

  const onPickSheet = async (sheet: string) => {
    if (!sheetChoice) return;
    const buffer = await sheetChoice.file.arrayBuffer();
    setCsvText(intimportWorkbookToCsv(buffer, sheet).csv);
    setFileInfo({ name: sheetChoice.file.name, sheet });
    setSheetChoice(null);
    reset();
  };

  // Parse is deterministic and free for every source: header validation, field parsing,
  // normalization, identity and dedupe only. No enrichment, no paid call.
  const onParse = async () => {
    if (source === 'intimport') {
      const parsed = parseIntimport(csvText);
      setIntimport(parsed);
      setResult(intimportToIntakeResult(parsed));
      // The Mapper turns what Gellatti already knows into real working values.
      // Its absence must never block the parse, so a failure here degrades to
      // identity-and-routing intelligence rather than stopping the owner.
      let mapper = null;
      try {
        mapper = await loadMapperKnowledge();
        setMapperNotice(null);
      } catch {
        setMapperNotice(
          'Mapper niedostępny — analiza bez wartości szacowanych. Wartości robocze pojawią się po ponownym wczytaniu.',
        );
      }
      // Local, Mapper-first intelligence. Deterministic and free — it decides
      // which products would ever justify an external call, before spending one.
      const analysed = runIntimportLocalIntelligence(parsed.candidates, {}, mapper);
      setLocalIntelligence(analysed.summary);
      setLocalRows(analysed.rows);
      // Who is who, before anything is written. Deterministic and free.
      setDedupPlan(planIntimportDedup(parsed.candidates));
      await refreshPreflight();
    } else {
      setIntimport(null);
      setLocalIntelligence(null);
      setDedupPlan(null);
      setMapperNotice(null);
      setResult(parseIntake(csvText, source));
    }
    setImportResult(null);
  };

  /**
   * Explicit owner action. Research starts only here — never from Parse — and
   * only for products the local stage could not settle. Every ≥90 % product is
   * skipped by the pipeline without a call.
   */
  const onEnrich = async () => {
    if (localRows.length === 0) return;
    setEnriching(true);
    setEnrichError(null);
    const importId = `intimport-${Date.now().toString(36)}`;
    const identityByKey = new Map(
      localRows.map((row) => [row.rowIndex, row.researchIdentity] as const),
    );
    const planByRow = new Map(localRows.map((row) => [row.rowIndex, row.researchPlan] as const));
    try {
      const outcome = await runIntimportEnrichment(
        localRows.map((intelligence) => ({
          intelligence,
          barcode: intelligence.researchIdentity.barcode,
        })),
        createIntimportWebProvider({
          importId,
          identityFor: (request) =>
            identityByKey.get(request.rowIndex) ?? {
              brand: null,
              manufacturer: null,
              name: request.displayName,
              variant: null,
              barcode: request.barcode,
              netQuantity: null,
              knownSourceUrl: null,
              technicalPdfUrl: null,
            },
          // Strongest available source first — never a general search when the
          // owner already supplied official evidence.
          stepFor: (request) => {
            const step = planByRow.get(request.rowIndex)?.steps[0];
            return step
              ? { kind: step.kind, url: step.url, allowedDomains: step.allowedDomains }
              : null;
          },
        }),
        undefined,
        setEnrichProgress,
      );
      const semantic = await runIntimportSemanticClassification(
        outcome.products,
        createIntimportSemanticProvider({ importId }),
      );
      // Recognition owns the compatible Mapper universe, so a semantic result
      // must be followed by a fresh local pass. This is still read-only: it
      // reloads immutable Mapper knowledge and writes no product or PI row.
      let mapper = null;
      try {
        mapper = await loadMapperKnowledge();
      } catch {
        setMapperNotice(
          'Mapper niedostępny po klasyfikacji — zachowano bezpieczny wynik sprzed ponownego dopasowania.',
        );
      }
      const reanalysed = intimport && mapper
        ? runIntimportLocalIntelligence(
            intimport.candidates,
            {},
            mapper,
            semantic.classifications,
          ).rows
        : outcome.products;
      const enrichedByRow = new Map(outcome.products.map((row) => [row.rowIndex, row] as const));
      const finalRows = reanalysed.map((row) => {
        const enriched = enrichedByRow.get(row.rowIndex);
        return enriched
          ? {
              ...row,
              evidence: enriched.evidence,
              assessment: enriched.assessment,
              enrichmentEvidenceReceipts: enriched.enrichmentEvidenceReceipts,
              semanticEvidenceReceipt: semantic.evidenceReceipts.get(row.rowIndex) ?? null,
            }
          : row;
      });
      // Import must consume the enriched assessments/evidence returned by the
      // explicit research pass. Keeping the pre-web rows here silently threw
      // away the new Product Accuracy and could admit/refuse on stale evidence.
      setLocalRows(finalRows);
      setEnrichSummary(outcome.summary);
    } catch (error) {
      setEnrichError(errorMessage(error));
    } finally {
      setEnriching(false);
    }
  };

  /**
   * Import what Product Intelligence says is usable.
   *
   * For INTIMPORT the shared resolver decides, not this page: a row is written
   * only when its composition is READY or READY_ESTIMATED, and the estimated
   * values it resolved are persisted into the canonical numeric fields with
   * their provenance. Nothing is refused for a missing dosage or process.
   *
   * `qaLimit` exists for controlled staging checks — importing a whole
   * catalogue during QA is not a test, it is a mess to clean up.
   */
  /**
   * Import every valid row, and let Product Intelligence say what each may do.
   *
   * Readiness gates ENGINE USE, not whether a product may exist. A REVIEW row
   * and a technical product are both written with everything resolved about
   * them — discarding them would lose the identity, the label evidence and the
   * enrichment already done, and force it all to be redone on the next upload.
   *
   * `qaLimit` exists for controlled staging checks: importing a whole catalogue
   * during QA is not a test, it is a mess to clean up afterwards.
   */
  const onImport = async (qaLimit?: number) => {
    if (!result) return;
    if (source === 'intimport' && preflight?.ready !== true) {
      setRunError('Czysty import wymaga PI = 2088 i PR = 0.');
      return;
    }
    let candidates = result.candidates;
    if (source === 'intimport' && localRows.length > 0) {
      const plan = planIntimportImport(localRows);
      const rows = qaLimit ? plan.rows.slice(0, qaLimit) : plan.rows;
      const byRow = new Map(rows.map((entry) => [entry.rowIndex, entry.insert]));
      const forceDistinct = new Set(
        (dedupPlan?.rows ?? [])
          .filter((entry) => entry.forceDistinct)
          .map((entry) => entry.rowIndex),
      );
      candidates = result.candidates
        .filter((candidate) => byRow.has(candidate.rowIndex))
        .map((candidate) => ({
          ...candidate,
          insert: byRow.get(candidate.rowIndex)!,
          forceDistinctIdentity: forceDistinct.has(candidate.rowIndex),
        }));
      setImportPlan({
        total: rows.length,
        productProfileReady: rows.filter((entry) => entry.engineUsable).length,
        dosageUnproven: rows.filter(
          (entry) =>
            localRows.find((local) => local.rowIndex === entry.rowIndex)?.workingValues
              ?.technicalAuthorityRequired === true,
        ).length,
        review: rows.filter((entry) => entry.state === 'REVIEW').length,
      });
    }
    let startedRun: ProductImportRunState | null = null;
    if (source === 'intimport') {
      try {
        startedRun = await startCleanIntimportRun({
          label: 'Polska — clean owner reimport',
          fileName: fileInfo?.name ?? null,
          sourceFingerprint: await productImportSourceFingerprint(csvText),
          totalRows: candidates.length,
        });
        setImportRun(startedRun);
        setRunError(null);
      } catch (error) {
        setImportResult({ ok: false, error: errorMessage(error) });
        await refreshPreflight();
        return;
      }
    }
    cancellationRequested.current = false;
    setBusy(true);
    setProgress(null);
    setLastProgressAt(null);
    const outcome = await runProductImport(candidates, {
      onProgress: (next) => {
        setProgress(next);
        setLastProgressAt(new Date().toLocaleTimeString('pl-PL'));
      },
      ...(startedRun
        ? {
            importRun: {
              id: startedRun.id,
              shouldCancel: () => cancellationRequested.current,
              recordOutcome: async (row) => {
                await recordProductImportRowOutcome({ runId: startedRun.id, ...row });
              },
            },
          }
        : {}),
    });
    if (startedRun) {
      const terminal = outcome.ok
        ? outcome.summary.cancelled
          ? 'CANCELLED'
          : outcome.summary.stopped
            ? 'FAILED'
            : 'COMPLETED'
        : cancellationRequested.current
          ? 'CANCELLED'
          : 'FAILED';
      try {
        setImportRun(await finishProductImportRun(startedRun.id, terminal));
      } catch (error) {
        setRunError(errorMessage(error));
      }
    }
    setImportResult(outcome);
    setBusy(false);
  };

  const onCancelImport = async () => {
    if (!importRun || !['IMPORTING', 'CANCELLING'].includes(importRun.status)) return;
    cancellationRequested.current = true;
    setCancelBusy(true);
    setRunError(null);
    try {
      setImportRun(await requestProductImportCancellation(importRun.id));
    } catch (error) {
      setRunError(errorMessage(error));
    } finally {
      setCancelBusy(false);
    }
  };

  const onRollbackImport = async () => {
    if (!importRun || !['CANCELLED', 'COMPLETED', 'FAILED'].includes(importRun.status)) return;
    const confirmed = window.confirm(
      `Cofnąć import ${importRun.id}?\n\n` +
        `Utworzone: ${importRun.created}\nPonownie użyte: ${importRun.reused}\n` +
        `Zaktualizowane: ${importRun.updated}\nReview: ${importRun.review}\n` +
        `Pominięte: ${importRun.skipped}\nBłędy: ${importRun.failed}\n\n` +
        'Rollback usunie wyłącznie mutacje przypisane do tego runu. PI Mapper pozostanie bez zmian.',
    );
    if (!confirmed) return;
    setRollbackBusy(true);
    setRollbackRemaining(null);
    setRunError(null);
    try {
      const state = await rollbackProductImportRun(importRun.id, (next) => {
        setImportRun(next);
        setRollbackRemaining(next.remainingRollbackRows);
      });
      setImportRun(state);
      setProgress(null);
      await refreshPreflight();
    } catch (error) {
      setRunError(errorMessage(error));
    } finally {
      setRollbackBusy(false);
    }
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
          {/* The normal owner workflow is a file. A raw textarea is the fallback
              for pasted rows, not the front door. */}
          <div className="flex flex-wrap items-center gap-5">
            <label className={cn(buttonClasses('ivory', 'md'), 'cursor-pointer')}>
              <input
                type="file"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                onChange={(event) => {
                  void onFile(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
              Wybierz plik
            </label>
            <span className="text-xs text-[#8a7f6d]">Obsługiwane formaty: .xlsx, .csv</span>
          </div>
          {fileInfo ? (
            <p className="mt-4 text-sm text-ivory/70" data-testid="intimport-file-identity">
              <span className="text-ivory">{fileInfo.name}</span>
              {fileInfo.sheet ? (
                <span className="text-ivory/50"> · arkusz {fileInfo.sheet}</span>
              ) : null}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-5">
            {sheetChoice ? (
              <div className="w-full space-y-2" data-testid="intimport-sheet-choice">
                <p className="text-xs text-[#8a7f6d]">
                  Ten skoroszyt ma kilka arkuszy z nagłówkami INTIMPORT. Wybierz właściwy:
                </p>
                <div className="flex flex-wrap gap-3">
                  {sheetChoice.sheets.map((sheet) => (
                    <button
                      key={sheet}
                      type="button"
                      onClick={() => {
                        void onPickSheet(sheet);
                      }}
                      className="rounded-md border border-ivory/20 px-3 py-1 text-xs text-ivory/80 transition-colors hover:border-ivory/50"
                    >
                      {sheet}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <Button
              variant="ivory"
              size="sm"
              onClick={() => {
                void onParse();
              }}
              disabled={!canParse(csvText)}
              className={cn(!canParse(csvText) && 'opacity-50')}
            >
              Analizuj plik
            </Button>
          </div>
          <details className="mt-6 border-t border-ivory/10 pt-4">
            <summary className="cursor-pointer list-none text-xs tracking-label text-ivory/50 uppercase transition-colors hover:text-ivory/80">
              lub wklej dane CSV
            </summary>
            <textarea
              value={csvText}
              onChange={(event) => {
                setCsvText(event.target.value);
                setFileInfo(null);
              }}
              rows={8}
              spellCheck={false}
              placeholder={c.pastePlaceholder}
              className={cn(fieldClass, 'mt-4')}
            />
          </details>
        </DestinationSection>

        <DestinationSection label={c.previewLabel}>
          {intimport ? (
            <div className="space-y-10">
              {mapperNotice ? <p className="text-xs text-[#8a7f6d]">{mapperNotice}</p> : null}
              <IntimportPreview result={intimport} />
              {dedupPlan ? (
                <div className="space-y-1 text-xs text-[#8a7f6d]">
                  <p className="text-ivory/70">
                    Tożsamość — kontrola przed zapisem: {dedupPlan.totalAccounted} z{' '}
                    {dedupPlan.totalInput} wierszy rozliczonych.
                  </p>
                  <p>Nowe produkty kanoniczne: {dedupPlan.counts.NEW_CANONICAL_PRODUCT}</p>
                  <p>Ponowne użycie istniejących: {dedupPlan.counts.EXISTING_CANONICAL_REUSE}</p>
                  <p>Dokładne duplikaty: {dedupPlan.counts.EXACT_DUPLICATE}</p>
                  <p>
                    Kolizje rozstrzygnięte jako różne produkty:{' '}
                    {dedupPlan.counts.IDENTITY_COLLISION_RESOLVED_AS_DISTINCT}
                  </p>
                  <p>
                    Do przeglądu (możliwy duplikat): {dedupPlan.counts.POSSIBLE_DUPLICATE_REVIEW}
                  </p>
                  <p>Konflikty tożsamości: {dedupPlan.counts.IDENTITY_CONFLICT}</p>
                </div>
              ) : null}
              <CleanImportPreflightView
                preflight={preflight}
                loading={preflightBusy}
                error={
                  !isSignedIn
                    ? 'Zaloguj się, aby sprawdzić stan staging przed importem.'
                    : preflightError
                }
              />
              {localIntelligence ? (
                <IntimportLocalIntelligenceView
                  summary={localIntelligence}
                  readiness={readinessSummary}
                  onEnrich={() => {
                    void onEnrich();
                  }}
                  onImport={() => {
                    void onImport();
                  }}
                  canImport={
                    canImport({ isSignedIn, result }) &&
                    preflight?.ready === true &&
                    !['IMPORTING', 'CANCELLING', 'ROLLING_BACK'].includes(
                      importRun?.status ?? '',
                    )
                  }
                  importBusy={busy}
                  busy={enriching}
                  progress={
                    enrichProgress
                      ? {
                          processed: enrichProgress.processed,
                          total: enrichProgress.total,
                          callsUsed: enrichProgress.callsUsed,
                        }
                      : null
                  }
                  runSummary={enrichSummary}
                  error={enrichError}
                />
              ) : null}
            </div>
          ) : result ? (
            <ParsePreview result={result} />
          ) : (
            <EmptyState title={c.emptyPreview} />
          )}
        </DestinationSection>

        <DestinationSection label={c.resultLabel}>
          {/* INTIMPORT's primary action lives beside its analysis, so there is
              exactly one import button on screen. Other sources keep this bar. */}
          {source === 'intimport' && localIntelligence ? null : (
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
          )}
          {progress || busy || (importRun && importRun.status !== 'ROLLED_BACK') ? (
            <div className="mt-8">
              <ImportProgressView
                progress={
                  progress ?? {
                    processed: importRun?.processed ?? 0,
                    total: importRun?.total_rows ?? importPlan?.total ?? 0,
                    created: importRun?.created ?? 0,
                    existing: importRun?.reused ?? 0,
                    skipped: importRun?.skipped ?? 0,
                    failed: importRun?.failed ?? 0,
                    currentName: null,
                  }
                }
                lastUpdateAt={lastProgressAt}
                done={importRun?.status === 'COMPLETED' || (!importRun && !busy && importResult?.ok === true)}
                cancelled={importRun?.status === 'CANCELLED'}
                cancelling={cancelBusy || importRun?.status === 'CANCELLING'}
                onCancel={
                  importRun && ['IMPORTING', 'CANCELLING'].includes(importRun.status)
                    ? () => {
                        void onCancelImport();
                      }
                    : undefined
                }
                stopped={
                  !busy && importResult?.ok === true && importResult.summary.stopped
                    ? {
                        reason: importResult.summary.stopped.reason,
                        remaining: importResult.summary.stopped.remaining,
                      }
                    : null
                }
              />
            </div>
          ) : null}
          {importRun && ['CANCELLED', 'COMPLETED', 'FAILED'].includes(importRun.status) ? (
            <div className="mt-6 space-y-3" data-testid="intimport-rollback-control">
              <button
                type="button"
                disabled={rollbackBusy}
                onClick={() => {
                  void onRollbackImport();
                }}
                className={cn(buttonClasses('ghost', 'md'), rollbackBusy && 'opacity-50')}
              >
                {rollbackBusy ? 'Cofanie importu…' : 'Cofnij import'}
              </button>
              {rollbackBusy && rollbackRemaining !== null ? (
                <p className="text-xs text-[#8a7f6d]">
                  Pozostałe mutacje do cofnięcia: {rollbackRemaining}
                </p>
              ) : null}
            </div>
          ) : null}
          {importRun?.status === 'ROLLED_BACK' ? (
            <p className="mt-6 text-sm text-status-ideal" data-testid="intimport-rolled-back">
              IMPORT COFNIĘTY · mutacje tego runu usunięte
            </p>
          ) : null}
          {runError ? <p className="mt-4 text-sm text-status-risky">{runError}</p> : null}
          {importPlan ? (
            <p className="text-xs text-[#8a7f6d]">
              Product Intelligence: przeanalizowano {importPlan.total} —{' '}
              {importPlan.productProfileReady} gotowych na poziomie profilu produktu,{' '}
              {importPlan.review} do uzupełnienia. Finalne użycie w Engine wymaga osobnej,
              serwerowej autoryzacji ProductBehavior.
              Bez informacji o dawkowaniu producenta: {importPlan.dosageUnproven} (informacyjnie —
              nie blokuje).
            </p>
          ) : null}
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
