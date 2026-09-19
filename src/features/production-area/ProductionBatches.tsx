import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { WorkflowNotice } from '@/components/shared/WorkflowNotice';
import { EmptyState } from '@/components/shared/EmptyState';
import { cn } from '@/lib/cn';
import { productionBatchesLabelsCopy } from '@/copy/productionBatchesLabels';
import { useAuthStore } from '@/stores/authStore';
import { resolveProductionRepository } from '@/features/pro-core/proCoreProductionRepo';
import {
  productionLotCodeForRun,
  type ProductionSession,
} from '@/features/production-workspace/productionSession';
import { useProductionSessionStore } from '@/features/production-workspace/productionSessionStore';
import { ProductionProcessHost } from '@/features/production-workspace/ProductionProcessHost';
import { lotCodeForDisplay } from '@/features/master-label/labelPresentation';
import {
  labelSettingsReturn,
  readLabelSettingsRestore,
} from '@/features/master-label/labelSettingsNavigation';
import { resolveLabelRepository } from '@/services/labels/labelRepository';
import { NewRecipeConfirmationDialog } from '@/features/recipes/NewRecipeConfirmationDialog';
import { hasUnsavedProRecipeChanges } from '@/pages/destinations/startNewProRecipe';
import { useHomeDraftStore } from '@/features/home-creator/homeDraftStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { recipeCompositionFromState } from '@/features/recipe-composition/recipeCompositionPersistence';
import { productionVersionFingerprint } from '@/features/production-workspace/productionReadinessState';
import { productionSourceForRecipe } from '@/features/production-workspace/useProductionWorkspace';
import { useProductionHistoryPages } from './useProductionHistoryPages';
import { useInProgressRuns, type InProgressBatch } from './useInProgressRuns';
import { resumeProductionRun, type ResumeProductionRunFailure } from './resumeProductionRun';
import { openDurableRun } from './openDurableRun';
import type { DurableRunContext } from '@/features/production-workspace/useProductionWorkspace';

const c = productionBatchesLabelsCopy.batches;
const EMPTY_SESSIONS: Record<string, ProductionSession> = {};

const massFormat = new Intl.NumberFormat('pl-PL', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const wholeGrams = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 });
const dateTimeFormat = new Intl.DateTimeFormat('pl-PL', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const formatDateTime = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : dateTimeFormat.format(date);
};

/** Below `lg` the history is under the batches; from `lg` it is the right column. */
const HISTORY_IS_COLUMN_QUERY = '(min-width: 1024px)';
const historyIsColumn = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia(HISTORY_IS_COLUMN_QUERY).matches;

const RESUME_FAILURE_COPY: Record<ResumeProductionRunFailure, string> = {
  'recipe-missing': c.resumeFailed.recipeMissing,
  'version-mismatch': c.resumeFailed.versionMismatch,
  'run-missing': c.resumeFailed.runMissing,
  'plan-differs': c.resumeFailed.planDiffers,
  failed: c.resumeFailed.generic,
};

const EYEBROW =
  'font-mono text-[11px] font-semibold tracking-[0.14em] text-[var(--g-text-secondary)] uppercase';

function ChevronDown() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4" fill="none">
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Produkcja → Partie (PRO). An IA layer over existing mechanisms only:
 * „W toku” from `listRuns` + `sessionsById`, „Wróć do partii” through the saved
 * recipe version and `restoreDurableSession`, and the production history from
 * `loadCanonicalProductionHistory`, paged. Browsing never calls a production
 * store action, never starts a run and never writes a label version.
 */
export function ProductionBatches({ canViewHistory = true }: { canViewHistory?: boolean } = {}) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const ownerUserId = useAuthStore((state) => state.user?.id ?? null);
  const productionRepository = useMemo(() => resolveProductionRepository().repository, []);
  const labelRepository = useMemo(() => resolveLabelRepository(), []);

  const restore = useMemo(() => {
    const candidate = readLabelSettingsRestore(location.state);
    return candidate?.origin === 'production-history' ? candidate : null;
    // `location.key` identifies one arrival; the state object itself is stable per entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  /* OD-32: a signed-in HOME customer runs batches here, so „W toku" and „Kontynuuj partię"
     are theirs — that IS the batch the decision granted. „Historia produkcji", with its LOT
     codes, masses and label versions, is a separate PRO capability and must not arrive with
     it. Disabled here rather than merely hidden, so HOME never even reads the history or
     label repositories. */
  const history = useProductionHistoryPages({
    enabled: canViewHistory,
    ownerUserId,
    productionRepository,
    labelRepository,
    initialShown: restore?.historyShown ?? null,
  });
  const inProgress = useInProgressRuns({
    enabled: true,
    ownerUserId,
    repository: productionRepository,
  });
  const projected = useProductionSessionStore((state) => state.session);
  const completedNow =
    projected?.status === 'completed' && projected.ownerUserId === ownerUserId ? projected : null;
  /**
   * Produkcja v3 Etap 2 — „Partie" hosts the process itself, RUN-CENTRIC.
   *
   * The opened batch lives in the ADDRESS (`?run=`), and its context is built from the
   * durable run and its immutable recipe version. It is deliberately NOT read from
   * `productionSessionStore.session`: that projection belongs to the workbench and is not
   * persisted, so a refresh would lose the batch — which is exactly how the first
   * attempt at this died. Opening a batch here never writes the recipe editor.
   */
  const openedRunId = params.get('run');
  const [openedRun, setOpenedRun] = useState<{
    runId: string;
    context: DurableRunContext | null;
    error: 'failed' | null;
  } | null>(null);

  const historyRef = useRef<HTMLElement>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const [focusedRunId, setFocusedRunId] = useState<string | null>(null);

  const focusHistory = useCallback((scroll: boolean) => {
    const section = historyRef.current;
    if (!section) return;
    if (scroll && typeof section.scrollIntoView === 'function') {
      section.scrollIntoView({ block: 'start' });
    }
    section.focus({ preventScroll: true });
  }, []);

  const jumpToHistory = () => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set('tab', 'history');
        return next;
      },
      { replace: true },
    );
    focusHistory(true);
  };

  // `?tab=history` (and `/pro/history`) lands on the history, once per arrival; any other
  // arrival opens Partie at its top (the page it came from may have been scrolled).
  const landedKey = useRef<string | null>(null);
  useEffect(() => {
    if (restore || landedKey.current === location.key) return;
    landedKey.current = location.key;
    if (params.get('tab') === 'history') focusHistory(!historyIsColumn());
    else if (typeof window.scrollTo === 'function') window.scrollTo({ top: 0 });
  }, [focusHistory, location.key, params, restore]);

  // Back from a label: the same pages, the same place and the same row in focus.
  const restoredKey = useRef<string | null>(null);
  useEffect(() => {
    if (!restore || restoredKey.current === location.key || history.state === 'loading') return;
    restoredKey.current = location.key;
    if (typeof window.scrollTo === 'function') window.scrollTo({ top: restore.scrollTop });
    if (restore.focusRunId) {
      rowRefs.current.get(restore.focusRunId)?.focus({ preventScroll: true });
    }
  }, [history.state, location.key, restore]);
  // The row the reader left from stays marked until another row is chosen.
  const markedRunId = focusedRunId ?? restore?.focusRunId ?? null;

  const openLabel = (event: MouseEvent<HTMLAnchorElement>, runId: string) => {
    event.preventDefault();
    setFocusedRunId(runId);
    navigate(`/labels?run=${encodeURIComponent(runId)}`, {
      state: {
        labelSettingsReturn: labelSettingsReturn('/production', '?tab=history', window.scrollY, {
          origin: 'production-history',
          focusRunId: runId,
          historyShown: history.readCount,
        }),
      },
    });
  };

  const [pendingResume, setPendingResume] = useState<InProgressBatch | null>(null);
  const [resuming, setResuming] = useState<string | null>(null);
  const [resumeError, setResumeError] = useState<{ runId: string; message: string } | null>(null);
  const resume = async (batch: InProgressBatch) => {
    if (!ownerUserId || !productionRepository) {
      setResumeError({ runId: batch.runId, message: c.resumeFailed.generic });
      return;
    }
    setResuming(batch.runId);
    setResumeError(null);
    const result = await resumeProductionRun({
      run: batch,
      ownerUserId,
      repository: productionRepository,
    });
    setResuming(null);
    if (!result.ok) {
      setResumeError({ runId: batch.runId, message: RESUME_FAILURE_COPY[result.reason] });
      return;
    }
    navigate(result.to);
  };
  const openBatch = (runId: string) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set('run', runId);
      return next;
    });
  const closeBatch = useCallback(
    () =>
      setParams((current) => {
        const next = new URLSearchParams(current);
        next.delete('run');
        return next;
      }),
    [setParams],
  );

  /* „Kontynuuj partię": the address names the run, the run names its own recipe version.
     Nothing of the open recipe is read or written on this path. */
  const loadingRunRef = useRef<string | null>(null);
  useEffect(() => {
    if (openedRunId === null) {
      loadingRunRef.current = null;
      return;
    }
    if (loadingRunRef.current === openedRunId) return;
    // The list is refetched while the run loads, so this effect re-runs mid-flight. It
    // must NOT cancel the request it already started: the ref is what prevents a second
    // one, and a result that arrives for a run the address no longer names is discarded
    // below by `shownRun` rather than by aborting the one in progress.
    const batch = inProgress.batches.find((candidate) => candidate.runId === openedRunId) ?? null;
    if (!batch) {
      /* The batch this address names is not in progress any more — the usual way there is
         finishing it, which is a success, not an error. Waiting for a run that will never
         come back would strand „Wczytujemy partię…" on screen, so Partie returns to its
         list, where the finished batch is now the top row of the history. */
      if (inProgress.state !== 'loading') closeBatch();
      return;
    }
    if (!ownerUserId || !productionRepository) return;
    loadingRunRef.current = openedRunId;
    void openDurableRun({ run: batch, ownerUserId, repository: productionRepository }).then(
      (result) => {
        setOpenedRun({
          runId: openedRunId,
          context: result.ok ? result.context : null,
          error: result.ok ? null : 'failed',
        });
      },
    );
  }, [closeBatch, inProgress.batches, inProgress.state, openedRunId, ownerUserId, productionRepository]);

  // The state is only trusted for the run the address currently names.
  const shownRun = openedRun?.runId === openedRunId ? openedRun : null;


  const requestResume = (batch: InProgressBatch) => {
    if (hasUnsavedProRecipeChanges()) {
      setPendingResume(batch);
      return;
    }
    void resume(batch);
  };

  const batches = inProgress.batches;
  const historyCount =
    history.state === 'loading' ? '…' : history.total > 0 ? c.historyJumpCount(history.total) : '';

  return (
    <div
      className={
        canViewHistory
          ? 'lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(320px,26rem)] lg:items-start lg:gap-10'
          : undefined
      }
      data-testid="production-batches"
    >
      <div className="min-w-0">
        {canViewHistory ? (
          <button
            type="button"
            onClick={jumpToHistory}
            aria-controls="production-history"
            className="pro-focus-ring flex min-h-12 w-full items-center justify-between gap-3 border-b border-[var(--g-line)] py-3 text-left lg:hidden"
            data-testid="production-history-jump"
          >
            <span className="text-[15px] text-ink">{c.historyJump}</span>
            <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-[var(--g-text-secondary)]">
              <span className="truncate">{historyCount}</span>
              <ChevronDown />
            </span>
          </button>
        ) : null}

        <section
          className="pt-6 lg:pt-0"
          aria-label={c.regionLabel}
          data-testid="production-current"
        >
          {openedRunId !== null ? (
            <div data-testid="production-opened-run">
              <button
                type="button"
                onClick={closeBatch}
                className="pro-focus-ring mb-4 inline-flex min-h-11 items-center text-[15px] font-semibold text-ink"
                data-testid="production-opened-run-back"
              >
                {c.continueBack}
              </button>
              {shownRun?.error != null ? (
                <p className="text-sm text-status-error" role="alert">
                  {c.continueFailed}
                </p>
              ) : shownRun?.context == null ? (
                <p className="text-sm text-[var(--g-text-secondary)]" role="status">
                  {c.continuing}
                </p>
              ) : (
                <ProductionProcessHost
                  name={shownRun.context.source.recipeName}
                  runContext={shownRun.context}
                  back={null}
                  testId="production-batches"
                />
              )}
            </div>
          ) : (
            <>
          {completedNow ? (
            <div className="mb-6" data-testid="production-completed-now">
              <p className={EYEBROW}>{c.completedNow}</p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-[var(--g-line)] bg-white px-4 py-3.5">
                <div className="min-w-0">
                  <strong className="block truncate text-[15px] font-semibold text-ink">
                    {completedNow.source.recipeName}
                  </strong>
                  <span className="text-xs text-[var(--g-text-secondary)]">
                    {c.completedNowMeta(
                      completedNow.source.recipeVersionNumber,
                      formatDateTime(completedNow.completionSnapshot?.productionCompletedAt ?? ''),
                    )}
                  </span>
                </div>
                <Link
                  to={`/labels?run=${encodeURIComponent(completedNow.sessionId)}`}
                  state={{
                    labelSettingsReturn: labelSettingsReturn('/production', '', 0, {
                      origin: 'current-run',
                    }),
                  }}
                  className={buttonClasses('ghost', 'sm')}
                >
                  {c.completedNowLabel}
                </Link>
              </div>
            </div>
          ) : null}

          {batches.length > 0 ? (
            <div data-testid="production-in-progress">
              <p className={EYEBROW}>{c.inProgress}</p>
              {inProgress.state === 'local-only' ? (
                <p className="mt-2 text-xs text-[var(--g-text-secondary)]" role="status">
                  {c.inProgressLocalOnly}
                </p>
              ) : null}
              <ul className="mt-2 space-y-2">
                {batches.map((batch, index) => (
                  <li
                    key={batch.runId}
                    className="rounded-[12px] border border-[var(--g-line)] bg-white px-4 py-3.5"
                    data-in-progress-run-id={batch.runId}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <strong className="block truncate text-[15px] font-semibold text-ink">
                          {batch.recipeName ?? c.inProgressUnnamed}
                        </strong>
                        <span className="text-xs text-[var(--g-text-secondary)]">
                          {c.inProgressMeta(
                            batch.recipeVersionNumber,
                            batch.plannedBatchG === null
                              ? '—'
                              : wholeGrams.format(batch.plannedBatchG),
                            formatDateTime(batch.startedAt),
                          )}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {/* The batch itself: no editor context is replaced, so no gate. */}
                        <button
                          type="button"
                          className={buttonClasses(index === 0 ? 'primary' : 'ghost', 'sm')}
                          onClick={() => openBatch(batch.runId)}
                          data-testid="production-continue-run"
                        >
                          {c.continueBatch}
                        </button>
                        {/* The recipe: this one DOES replace it, so it keeps its gate. */}
                        <button
                          type="button"
                          className={buttonClasses('ghost', 'sm')}
                          disabled={resuming !== null}
                          onClick={() => requestResume(batch)}
                          data-testid="production-resume-run"
                        >
                          {resuming === batch.runId ? c.resuming : c.resume}
                        </button>
                      </div>
                    </div>
                    {resumeError?.runId === batch.runId ? (
                      <p className="mt-3 text-sm text-status-error" role="alert">
                        {resumeError.message}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : inProgress.state === 'loading' ? (
            <p className="text-sm text-[var(--g-text-secondary)]" role="status">
              {c.inProgressChecking}
            </p>
          ) : (
            <div data-testid="production-empty">
              <h2 className="text-[17px] font-semibold text-ink">{c.emptyTitle}</h2>
              <p className="mt-1.5 max-w-xl text-sm text-[var(--g-text-secondary)]">
                {c.emptyBodyPro}
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--g-line)] pt-4">
                <span className="text-xs text-[var(--g-text-secondary)]">
                  <strong className="block text-sm font-semibold text-ink">
                    {c.emptyDockTitle}
                  </strong>
                  {c.emptyDockPro}
                </span>
                <Link to="/recipes" className={buttonClasses('primary', 'md')}>
                  {c.pickRecipe}
                </Link>
              </div>
            </div>
          )}
            </>
          )}
        </section>
      </div>

      {canViewHistory ? (
        <section
          id="production-history"
          ref={historyRef}
          tabIndex={-1}
          aria-labelledby="production-history-heading"
          className="mt-10 scroll-mt-24 border-t border-[var(--g-line)] pt-8 focus:outline-none lg:mt-0 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8"
          data-testid="production-history"
        >
          <h2 id="production-history-heading" className="text-[17px] font-semibold text-ink">
            {c.historyTitle}
          </h2>
          <p className="mt-1 text-xs text-[var(--g-text-secondary)]">{c.historyHelper}</p>
          {history.state === 'loading' ? (
            <p className="mt-5 text-sm text-[var(--g-text-secondary)]" role="status">
              {c.historyLoading}
            </p>
          ) : null}
          {history.state === 'error' ? (
            <WorkflowNotice
              className="mt-5"
              variant="blocking"
              role="alert"
              title={c.historyErrorTitle}
              description={c.historyErrorBody}
              action={
                <button
                  type="button"
                  className={buttonClasses('ghost', 'sm')}
                  onClick={history.retry}
                >
                  {c.retry}
                </button>
              }
            />
          ) : null}
          <div className="mt-3">
            {history.entries.map(({ run, snapshot }) => {
              // The label list is ONE read for all rows; a run absent from it has no saved label.
              const versions = history.labelVersionsByRun
                ? (history.labelVersionsByRun.get(run.runId) ?? 0)
                : null;
              const lot = lotCodeForDisplay(
                snapshot.lotCode ??
                  productionLotCodeForRun(snapshot.sessionId, snapshot.productionCompletedAt),
              );
              return (
                <div
                  key={run.runId}
                  ref={(element) => {
                    if (element) rowRefs.current.set(run.runId, element);
                    else rowRefs.current.delete(run.runId);
                  }}
                  tabIndex={-1}
                  className={cn(
                    'border-b border-[var(--g-line)] py-4 focus:outline-none',
                    markedRunId === run.runId &&
                      '-mx-3 rounded-[12px] border-transparent bg-[var(--g-ivory)] px-3',
                  )}
                  data-production-run-id={run.runId}
                  data-focused={markedRunId === run.runId ? 'true' : undefined}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <strong className="block text-[15px] font-semibold text-ink">
                        {snapshot.source.recipeName}
                      </strong>
                      <p className="mt-1 text-xs text-[var(--g-text-secondary)]">
                        {c.rowWhen(
                          formatDateTime(snapshot.productionCompletedAt),
                          snapshot.source.recipeVersionNumber,
                        )}
                      </p>
                      <p
                        className="mt-0.5 text-xs text-[var(--g-text-secondary)]"
                        data-testid="production-history-label-status"
                      >
                        {versions === null ? c.rowLot(lot) : c.rowLabel(lot, versions)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="block font-mono text-base font-semibold text-ink tabular-nums">
                        {c.rowActual(massFormat.format(snapshot.actualFinalMassG))}
                      </span>
                      <span className="text-xs text-[var(--g-text-secondary)]">
                        {c.rowPlanned(massFormat.format(snapshot.originalBatchTargetG))}
                      </span>
                    </div>
                  </div>
                  <Link
                    to={`/labels?run=${encodeURIComponent(run.runId)}`}
                    onClick={(event) => openLabel(event, run.runId)}
                    className={cn(buttonClasses('ghost', 'sm'), 'mt-3')}
                    data-testid="production-history-open-label"
                  >
                    {c.openLabel}
                  </Link>
                </div>
              );
            })}
          </div>
          {history.state === 'ready' && history.total === 0 && history.entries.length === 0 ? (
            <EmptyState className="mt-5" title={c.historyEmptyTitle} body={c.historyEmptyBody} />
          ) : null}
          {history.state !== 'loading' && history.total > 0 ? (
            history.readCount < history.total ? (
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className={buttonClasses('ghost', 'sm')}
                  onClick={history.loadOlder}
                  disabled={history.olderState === 'loading'}
                  data-testid="production-history-more"
                >
                  {history.olderState === 'loading' ? c.loadingOlder : c.showOlder}
                </button>
                <span
                  className="text-xs text-[var(--g-text-secondary)]"
                  data-testid="production-history-shown"
                >
                  {c.shownOf(history.readCount, history.total)}
                </span>
              </div>
            ) : (
              <p
                className="mt-5 text-xs text-[var(--g-text-secondary)]"
                data-testid="production-history-shown"
              >
                {c.allShown(history.total)}
              </p>
            )
          ) : null}
          {history.olderState === 'error' ? (
            <p className="mt-3 text-sm text-status-error" role="alert">
              {c.historyOlderError}
            </p>
          ) : null}
        </section>
      ) : null}

      <NewRecipeConfirmationDialog
        open={pendingResume !== null}
        title={c.resumeConfirmTitle}
        description={c.resumeConfirmBody}
        confirmLabel={c.resume}
        onCancel={() => setPendingResume(null)}
        onConfirm={() => {
          const batch = pendingResume;
          setPendingResume(null);
          if (batch) void resume(batch);
        }}
      />
    </div>
  );
}

/**
 * Produkcja → Partie (HOME), Etap 1. HOME has no production history. A HOME
 * preparation that is already running is offered back where it lives; entering this page never
 * creates one.
 *
 * OD-24: it is found by the recipe the batch actually belongs to, not by the HOME draft id.
 * Before OD-24 a HOME batch was a local session addressed by `home-draft:<uuid>`; now it is the
 * same durable run PRO makes, addressed by the recipe version it was made from — so the old
 * comparison could never be true again and this card had silently stopped appearing. The source
 * comes from the ONE authority that resolves it everywhere else, so HOME cannot drift from it
 * a second time.
 */
export function HomeBatches() {
  const ownerUserId = useAuthStore((state) => state.user?.id ?? null);
  const preparationStarted = useHomeDraftStore((state) => state.preparationStarted);
  const recipe = useRecipeStore();
  const sessionsById = useProductionSessionStore((state) => state.sessionsById) ?? EMPTY_SESSIONS;
  const source = useMemo(() => {
    const input = buildRecipeInput(recipe, 'planning');
    return productionSourceForRecipe(
      recipe,
      true,
      productionVersionFingerprint(input, recipeCompositionFromState(recipe)),
    );
  }, [recipe]);
  const running =
    preparationStarted && source.recipeId !== null
      ? (Object.values(sessionsById).find(
          (session) =>
            session.status === 'in_progress' &&
            session.ownerUserId === ownerUserId &&
            session.source.recipeId === source.recipeId,
        ) ?? null)
      : null;

  if (running) {
    return (
      <section aria-label={c.regionLabel} data-testid="production-current">
        <p className={EYEBROW}>{c.inProgress}</p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-[var(--g-line)] bg-white px-4 py-3.5">
          <div className="min-w-0">
            <strong className="block truncate text-[15px] font-semibold text-ink">
              {running.source.recipeName}
            </strong>
            <span className="text-xs text-[var(--g-text-secondary)]">{c.homeRunMeta}</span>
          </div>
          <Link to="/home" className={buttonClasses('primary', 'sm')}>
            {c.homeResume}
          </Link>
        </div>
      </section>
    );
  }
  return (
    <section aria-label={c.regionLabel} data-testid="production-current">
      <div data-testid="production-empty">
        <h2 className="text-[17px] font-semibold text-ink">{c.emptyTitle}</h2>
        <p className="mt-1.5 max-w-xl text-sm text-[var(--g-text-secondary)]">{c.emptyBodyHome}</p>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--g-line)] pt-4">
          <span className="text-xs text-[var(--g-text-secondary)]">
            <strong className="block text-sm font-semibold text-ink">{c.emptyDockTitle}</strong>
            {c.emptyDockHome}
          </span>
          <Link to="/recipes" className={buttonClasses('primary', 'md')}>
            {c.pickRecipe}
          </Link>
        </div>
      </div>
    </section>
  );
}
