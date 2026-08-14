/**
 * PINGÜINO Pro — the workbar-level recalculation panel (owner P0, 2026-07-22).
 *
 * „Przelicz z PI" in the sticky workbar initiates the REAL canonical recalculation —
 * change recipe → Przelicz z PI → Podgląd → „Zastosuj zmiany" / „Anuluj" → optional „Cofnij"
 * → „Zapisz nową wersję". It is a SECOND VIEW over the ONE constraint-studio session store
 * (createOptimizePreview / applyPreview / cancelPreview / undoLastApply): no new optimizer, no
 * second apply pipeline, and the boundary rule (constraintStudioStore = the only recipe writer)
 * stays intact. Preview rows render through the same pure ConstraintPreviewCard; failures render
 * the same honest Polish messages; a verify-failed apply renders the same BlockedApplyNotice.
 */
import { useEffect, useMemo, useRef } from 'react';
import { copy } from '@/copy/en';
import { calculateRecipe } from '@/engine';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useRecipeStore } from '@/stores/recipeStore';
import { recipeFitForInput } from '@/features/protein-gelato/proteinTarget';
import {
  constraintStudioCopy,
  formatGramsPl,
} from '@/features/constraint-studio/constraintStudioCopy';
import {
  applyPreviewWithServerAuthority,
  isUndoAvailable,
  useConstraintStudioStore,
  type PreviewIssue,
} from '@/features/constraint-studio/constraintStudioStore';
import {
  diagnoseRecalcFailure,
  isAllLocked,
  type RecalcDiagnosis,
} from '@/features/constraint-studio/recalcDiagnosis';
import {
  customerOptimizerNoSolutionPl,
  customerPreviewIssueMessagePl,
  customerStopReasonPl,
} from '@/features/constraint-studio/customerConstraintStudioPresentation';
import { BlockedApplyNotice } from '@/features/constraint-studio/ui/BlockedApplyNotice';
import { ConstraintPreviewCard } from '@/features/constraint-studio/ui/ConstraintPreviewCard';
import type { RecipeInput } from '@/engine';
import type { ConstraintSet } from '@/features/recipe-constraints';

const r = copy.proWorkbar.recalcPanel;
const d = constraintStudioCopy.diagnosis;
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The headline for a classified failure — proven by the lock report below it. */
function diagnosisMessage(diagnosis: RecalcDiagnosis, issue: PreviewIssue): string {
  switch (diagnosis.code) {
    case 'temperature_route_mismatch':
      return d.temperatureMismatch;
    case 'recipe_input_incomplete':
      return d.incomplete;
    case 'constraint_verification_failed': {
      // Owner P0 (definitive fail): a produced-but-REJECTED candidate renders the
      // exact required rejection sentence PLUS the proven detail (metrics), never
      // a bare generic message.
      if (issue.code === 'unsafe_proposal') {
        const labels = (issue.violatedMetrics ?? []).map(
          (metric) => d.metricLabels[metric] ?? metric,
        );
        return (
          constraintStudioCopy.previewIssue.unsafeProposal +
          (labels.length > 0 ? ` Parametry poza zakresem: ${labels.join(', ')}.` : '')
        );
      }
      return d.verificationFailed;
    }
    case 'locked_constraints_conflict':
      return isAllLocked(diagnosis)
        ? d.allLocked
        : d.withLocks(diagnosis.lockedCount, diagnosis.totalCount);
    case 'no_active_locks':
      return d.noActiveLocks;
    case 'optimizer_no_solution': {
      // The PROVEN failure: solver invocation count + the exact violated metrics.
      const labels = (diagnosis.violatedMetrics ?? []).map(
        (metric) => d.metricLabels[metric] ?? metric,
      );
      return customerOptimizerNoSolutionPl(labels);
    }
    default:
      return customerPreviewIssueMessagePl(issue);
  }
}

/** Owner P0 NIGHTLY Phase 7(b) — the best-safe fixed point, rendered as an
 * EXPLANATORY result: honest score, soft (provisional-band) deviations, the
 * exact stop reason and the calibration status. Never a failure banner. */
function BestSafeResultView({
  issue,
  input,
}: {
  issue: Extract<PreviewIssue, { code: 'best_safe_result' }>;
  input: RecipeInput;
}) {
  const b = constraintStudioCopy.bestSafe;
  // ACCEPTANCE ADDENDUM (2): the readout is the TECHNICAL fit dimension.
  const match = useMemo(() => recipeFitForInput(input, calculateRecipe(input)), [input]);
  const softLabels = issue.softViolatedMetrics.map((metric) => d.metricLabels[metric] ?? metric);
  return (
    <div className="space-y-2" data-testid="pro-recalc-best-safe">
      <p className="text-sm leading-relaxed text-ivory/90">
        {constraintStudioCopy.previewIssue.bestSafeResult}
      </p>
      <p className="text-xs leading-relaxed text-ivory/70" data-testid="pro-recalc-best-safe-score">
        {b.scoreLine(match.display, match.label)}
      </p>
      <p className="text-xs leading-relaxed text-ivory/70">
        {softLabels.length > 0 ? b.softDeviations(softLabels) : b.noSoftDeviations}
      </p>
      <p className="text-xs leading-relaxed text-ivory/60">
        {customerStopReasonPl(issue.stopReason)}
      </p>
      {/* Owner CURRENT-DRAFT P0 (Phase 4): the REAL evidence behind the stop —
          what was searched, over which of the user's own ingredients, across
          which gram range, and which metrics are still limiting. */}
      <div className="space-y-1" data-testid="pro-recalc-best-safe-evidence">
        {issue.evidence.testedCandidates.map((candidate) => (
          <p
            key={candidate.ingredientName}
            className="text-xs leading-relaxed text-ivory/70"
            data-testid="pro-recalc-tested-candidate"
          >
            {b.evidenceCandidate(
              candidate.ingredientName,
              formatGramsPl(candidate.currentGrams),
              formatGramsPl(candidate.testedFromGrams),
              formatGramsPl(candidate.testedToGrams),
            )}
          </p>
        ))}
        {issue.evidence.limitingMetrics.length > 0 ? (
          <p className="text-xs leading-relaxed text-ivory/60">
            {b.evidenceLimiting(
              issue.evidence.limitingMetrics.map((metric) => d.metricLabels[metric] ?? metric),
            )}
          </p>
        ) : null}
        {issue.evidence.provisionalProfile ? (
          <p className="text-xs leading-relaxed text-ivory/60">{b.evidenceProvisional}</p>
        ) : null}
      </div>
      <p className="text-xs leading-relaxed text-ivory/60">{b.calibration[issue.bandSource]}</p>
      {/* Template similarity is PROVENANCE ONLY — never the score, never the
          reason (owner CURRENT-DRAFT P0 Phase 4/5). */}
      <p className="text-xs leading-relaxed text-ivory/65">
        {b.templateSimilarityLabel} — {b.templateLine(issue.templateId)}
      </p>
    </div>
  );
}

/** Failed recalculation: the classified cause + the VERIFIED per-ingredient lock report. */
function RecalcDiagnosisView({
  issue,
  input,
  constraints,
  servingModeId,
}: {
  issue: PreviewIssue;
  input: RecipeInput;
  constraints: ConstraintSet;
  servingModeId: string | null;
}) {
  // "Already in band" is not a failure — keep the friendly note, no diagnosis table.
  if (issue.code === 'already_clean') {
    return (
      <p className="text-sm leading-relaxed text-ivory/70" data-testid="pro-recalc-issue">
        {customerPreviewIssueMessagePl(issue)}
      </p>
    );
  }

  // Owner P0 NIGHTLY Phase 7(b): the BEST-SAFE FIXED POINT is an explanatory
  // result, NEVER rendered as a failure — score, soft deviations, stop reason
  // and calibration status, with the recipe unchanged and honestly usable.
  if (issue.code === 'best_safe_result') {
    return <BestSafeResultView issue={issue} input={input} />;
  }

  // Owner P0 (full formulation): honest structured states with their exact
  // messages — no lock table (locks are not the cause). Owner Agent 3:
  // `impossible_under_constraints` carries its complete message (conflicting
  // constraint + engine-verified nearest feasible value) the same way.
  if (
    issue.code === 'unsupported_profile' ||
    issue.code === 'practicalization_blocked' ||
    issue.code === 'missing_prices' ||
    issue.code === 'missing_required_role' ||
    issue.code === 'vegan_ingredient_conflict' ||
    issue.code === 'vegan_profile_constraint' ||
    issue.code === 'impossible_under_constraints'
  ) {
    return (
      <div className="space-y-2" data-testid="pro-recalc-diagnosis" data-code={issue.code}>
        <p className="text-sm leading-relaxed text-ivory/85">{customerPreviewIssueMessagePl(issue)}</p>
        <p className="text-xs text-ivory/60" data-testid="pro-recalc-unchanged">
          {d.unchanged}
        </p>
      </div>
    );
  }

  const diagnosis = diagnoseRecalcFailure({ input, constraints, issue, servingModeId });
  const lockedRows = diagnosis.lockReport.filter((row) => !row.adjustable);

  return (
    <div className="space-y-3" data-testid="pro-recalc-diagnosis" data-code={diagnosis.code}>
      <p className="text-sm leading-relaxed text-ivory/85">{diagnosisMessage(diagnosis, issue)}</p>
      {diagnosis.pouredCount > 0 ? (
        <p className="text-xs leading-relaxed text-amber-300/90">
          {d.pouredNote(diagnosis.pouredCount)}
        </p>
      ) : null}

      {lockedRows.length > 0 ? (
        <div className="rounded-md border border-ivory/15 px-3 py-3">
          <p className="text-xs font-medium tracking-label text-ivory/75 uppercase">
            {d.lockTable.heading}
          </p>
          <div className="mt-2 divide-y divide-ivory/10">
            {diagnosis.lockReport.map((row) => (
              <div
                key={row.lineId}
                data-testid="pro-recalc-lock-row"
                data-locked={!row.adjustable || undefined}
                className="flex items-baseline justify-between gap-3 py-1.5"
              >
                <span className="min-w-0 truncate text-sm text-ivory">{row.name}</span>
                <span className="flex shrink-0 items-baseline gap-2 text-xs">
                  <span className="font-mono text-ivory/70 tabular-nums">
                    {formatGramsPl(row.actualGrams ?? row.plannedGrams)}
                  </span>
                  <span className={row.adjustable ? 'text-ivory/60' : 'text-status-risky'}>
                    {d.lockTable.state[row.lockState]}
                  </span>
                  <span className="text-ivory/60">{d.lockTable.source[row.source]}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <p className="text-xs text-ivory/60" data-testid="pro-recalc-unchanged">
        {d.unchanged}
      </p>
    </div>
  );
}

function DirectionBestDecision({
  candidate,
  onAccept,
  onBack,
}: {
  candidate: import('@/features/constraint-studio/applyPipeline').ConstraintPreview;
  onAccept: () => void;
  onBack: () => void;
}) {
  const assessment = candidate.directionAssessment;
  const labels: Record<string, string> = {
    sweetness: 'Słodycz',
    softness: 'Miękkość',
    creaminess: 'Kremowość',
    flavor: 'Intensywność smaku',
  };
  const missed = assessment?.residuals.filter((residual) => !residual.reached) ?? [];
  return (
    <div
      className="space-y-3 rounded-md border border-nonprod/50 bg-nonprod/[0.06] px-4 py-4"
      data-testid="direction-best-decision"
    >
      <div>
        <p className="text-sm font-medium text-ivory">
          Nie mogę osiągnąć dokładnie wybranego celu.
        </p>
        <p className="mt-1 text-xs text-ivory/70">
          Najbliższy poprawny wynik: {assessment?.score ?? 9}/10
        </p>
      </div>
      {missed.length > 0 ? (
        <div className="space-y-1" data-testid="direction-best-residuals">
          {missed.map((residual) => (
            <p key={residual.axis} className="text-xs text-nonprod">
              {labels[residual.axis] ?? residual.axis}: cel nieosiągnięty
            </p>
          ))}
        </div>
      ) : null}
      <p className="text-xs text-ivory/65">
        Wszystkie natywne wymagania technologiczne pozostają ważne.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onAccept}
          data-testid="direction-best-accept"
          className="min-h-11 rounded-lg bg-ivory px-4 py-2.5 text-sm font-medium text-shell"
        >
          Przelicz najlepiej możliwie
        </button>
        <button
          type="button"
          onClick={onBack}
          data-testid="direction-best-back"
          className="min-h-11 rounded-lg border border-ivory/20 px-4 py-2.5 text-sm font-medium text-ivory"
        >
          Wróć
        </button>
      </div>
    </div>
  );
}

export function ProRecalcPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panelRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const previousOverflow = body.style.overflow;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    body.style.overflow = 'hidden';
    const focusables = () =>
      panelRef.current ? Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
    (focusables()[0] ?? panelRef.current)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const list = focusables();
      const first = list[0];
      const last = list[list.length - 1];
      if (!first || !last) {
        event.preventDefault();
        panelRef.current?.focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [open]);

  const preview = useConstraintStudioStore((s) => s.preview);
  const directionBestCandidate = useConstraintStudioStore((s) => s.directionBestCandidate);
  const previewIssue = useConstraintStudioStore((s) => s.previewIssue);
  const blocked = useConstraintStudioStore((s) => s.blocked);
  const history = useConstraintStudioStore((s) => s.history);
  const recalculationTerminal = useConstraintStudioStore((s) => s.recalculationTerminal);
  const constraints = useConstraintStudioStore((s) => s.constraints);
  // Actions are stable references — reading them once via getState is safe.
  const store = useConstraintStudioStore.getState();

  const mode = useRecipeStore((s) => s.mode);
  const category = useRecipeStore((s) => s.category);
  const temperatureC = useRecipeStore((s) => s.target_temperature_c);
  const batchGrams = useRecipeStore((s) => s.target_batch_grams);
  const machineCapacityGrams = useRecipeStore((s) => s.machine_capacity_grams);
  const flavorIntensity = useRecipeStore((s) => s.flavor_intensity);
  const costPriority = useRecipeStore((s) => s.cost_priority);
  const targetProteinPercent = useRecipeStore((s) => s.target_protein_percent);
  const directionTargets = useRecipeStore((s) => s.direction_targets);
  const directionTargetsActive = useRecipeStore((s) => s.direction_targets_active);
  const items = useRecipeStore((s) => s.items);
  const servingModeId = useRecipeStore((s) => s.servingModeId);

  const currentInput = useMemo(
    () =>
      buildRecipeInput({
        mode,
        category,
        target_temperature_c: temperatureC,
        target_batch_grams: batchGrams,
        machine_capacity_grams: machineCapacityGrams,
        flavor_intensity: flavorIntensity,
        cost_priority: costPriority,
        items,
        target_protein_percent: targetProteinPercent,
        direction_targets: directionTargets,
        direction_targets_active: directionTargetsActive,
      }),
    [
      mode,
      category,
      temperatureC,
      batchGrams,
      machineCapacityGrams,
      flavorIntensity,
      costPriority,
      targetProteinPercent,
      directionTargets,
      directionTargetsActive,
      items,
    ],
  );

  const undoAvailable = isUndoAvailable(history[history.length - 1], currentInput, constraints);

  if (!open) return null;

  // One-screen workbench (owner 2026-07-24): the recalculation is a COMPACT OVERLAY
  // (520–720 px), never a giant page section. Zastosuj closes the overlay — the
  // editor + LIVE Monitor update in place and the bottom action bar carries the
  // applied confirmation + Cofnij. Same store pipeline, same testids.
  return (
    <div className="fixed inset-0 z-50" data-testid="pro-recalc-overlay">
      <button
        type="button"
        aria-label={r.close}
        onClick={onClose}
        className="absolute inset-0 h-full w-full bg-black/60 motion-safe:animate-[appFadeIn_150ms_ease-out]"
      />
      <section
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={r.title}
        data-testid="pro-recalc-panel"
        className="absolute left-1/2 top-1/2 max-h-[88vh] w-[min(680px,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-white/10 bg-shell px-4 py-4 text-ivory shadow-pro-md [--color-charcoal:#191a1d] [--color-ivory:#efe9dc] [--color-shell:#191a1d] [color-scheme:dark] sm:px-5 sm:py-5"
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium tracking-label text-ivory/60 uppercase">{r.title}</p>
          <button
            type="button"
            onClick={onClose}
            data-testid="pro-recalc-close"
            className="min-h-11 rounded-lg border border-ivory/20 px-3 py-1.5 text-xs font-medium text-ivory transition-colors hover:border-ivory/40"
          >
            {r.close}
          </button>
        </div>

        <div className="mt-3 space-y-3">
          {blocked ? (
            <BlockedApplyNotice blocked={blocked} onDismiss={store.dismissBlocked} />
          ) : null}

          {previewIssue && recalculationTerminal ? (
            <RecalcDiagnosisView
              issue={previewIssue}
              input={currentInput}
              constraints={constraints}
              servingModeId={servingModeId}
            />
          ) : null}

          {directionBestCandidate && recalculationTerminal?.state === 'PREVIEW_READY' ? (
            <DirectionBestDecision
              candidate={directionBestCandidate}
              onAccept={store.acceptBestDirectionCandidate}
              onBack={() => {
                store.cancelPreview();
                onClose();
              }}
            />
          ) : null}

          {preview && recalculationTerminal?.state === 'PREVIEW_READY' ? (
            <ConstraintPreviewCard
              preview={preview}
              onApply={() => {
                void (async () => {
                  await applyPreviewWithServerAuthority();
                  // Close only after the same terminal server validation used by
                  // Constraint Studio. A stale/blocked preview stays visible.
                  const after = useConstraintStudioStore.getState();
                  if (after.preview === null && after.blocked === null) onClose();
                })();
              }}
              onCancel={() => {
                store.cancelPreview();
                onClose();
              }}
            />
          ) : null}

          {!preview && recalculationTerminal === null && undoAvailable ? (
            <div className="space-y-2" data-testid="pro-recalc-applied">
              <p className="text-sm leading-relaxed text-ivory/80">{r.applied}</p>
              <button
                type="button"
                onClick={store.undoLastApply}
                data-testid="pro-recalc-undo"
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ivory/20 px-4 py-2 text-sm font-medium text-ivory transition-colors hover:border-ivory/40"
              >
                {r.undo}
              </button>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
