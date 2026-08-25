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
import { useEffect, useMemo, useRef, useState } from 'react';
import { copy } from '@/copy/en';
import { calculateRecipe } from '@/engine';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useRecipeStore } from '@/stores/recipeStore';
import { recipeFitForInput } from '@/features/protein-gelato/proteinAuthority';
import {
  constraintStudioCopy,
  formatGramsPl,
} from '@/features/constraint-studio/constraintStudioCopy';
import {
  applyPreviewWithServerAuthority,
  createExplicitStandardRemovalPreviewWithServerAuthority,
  isUndoAvailable,
  runPiRecalculationWithTerminal,
  unlockConstraintAndRecalculate,
  useConstraintStudioStore,
  type PreviewIssue,
  type RecalculationTerminalState,
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
import type { RescueIngredientAdvice } from '@/features/constraint-studio/rescueIngredientAdvisor';
import {
  productBehaviorIssuesSupportWorkingCopyRefresh,
  refreshCurrentRecipeBehaviorWorkingCopy,
} from '@/features/product-intelligence/refreshRecipeBehaviorWorkingCopy';

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
      if (issue.code === 'no_proposal' && issue.directionTargetUnreached === true) {
        return customerPreviewIssueMessagePl(issue);
      }
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
  onReturnToRecipe,
  onChooseOtherProduct,
  onCompleteProductData,
  onRefreshProductBehavior,
  refreshingProductBehavior,
  productBehaviorRefreshError,
  onUnlockAndPreview,
  onRemoveStandardAndPreview,
  terminal,
  rescueAdvice = null,
  onAddRescueIngredient,
}: {
  issue: PreviewIssue;
  input: RecipeInput;
  constraints: ConstraintSet;
  servingModeId: string | null;
  onReturnToRecipe: (lineId: string | null) => void;
  onChooseOtherProduct: () => void;
  onCompleteProductData: () => void;
  onRefreshProductBehavior: () => void;
  refreshingProductBehavior: boolean;
  productBehaviorRefreshError: string | null;
  onUnlockAndPreview: (lineId: string) => void;
  onRemoveStandardAndPreview: (lineId: string) => void;
  terminal: RecalculationTerminalState;
  rescueAdvice?: RescueIngredientAdvice | null;
  onAddRescueIngredient?: () => void;
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

  if (issue.code === 'standard_presence_removal_required') {
    const metricLabel =
      constraintStudioCopy.diagnosis.metricLabels[issue.limitingMetric] ?? issue.limitingMetric;
    return (
      <div className="space-y-3" data-testid="pro-recalc-standard-removal-required">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-ivory">
            Ten składnik trzeba usunąć albo zmienić.
          </p>
          <p className="text-sm leading-relaxed text-ivory/85">{issue.messagePl}</p>
        </div>
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-xs text-ivory/70">
          <dt>Aktualna ilość</dt>
          <dd className="font-mono tabular-nums">{formatGramsPl(issue.currentGrams)}</dd>
          <dt>Najlepsza próba bez usuwania</dt>
          <dd className="font-mono tabular-nums">
            {formatGramsPl(issue.bestAttemptedNonZeroGrams)}
          </dd>
          <dt>Ograniczający parametr</dt>
          <dd>{metricLabel}</dd>
          <dt>Akceptowany zakres</dt>
          <dd className="font-mono tabular-nums">
            {issue.acceptedMin === null || issue.acceptedMax === null
              ? '—'
              : `${issue.acceptedMin}–${issue.acceptedMax}`}
          </dd>
        </dl>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-ivory px-4 py-2 text-sm font-semibold text-shell transition-colors hover:bg-ivory/90"
            data-testid="pro-recalc-remove-standard-preview"
            onClick={() => onRemoveStandardAndPreview(issue.lineId)}
          >
            Usuń składnik i pokaż podgląd
          </button>
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ivory/20 px-4 py-2 text-sm font-medium text-ivory transition-colors hover:border-ivory/40"
            data-testid="pro-recalc-return-from-standard-removal"
            onClick={() => onReturnToRecipe(issue.lineId)}
          >
            Wróć do receptury
          </button>
        </div>
      </div>
    );
  }

  // Owner P0 (full formulation): honest structured states with their exact
  // messages — no lock table (locks are not the cause). Owner Agent 3:
  // `impossible_under_constraints` carries its complete message (conflicting
  // constraint + engine-verified nearest feasible value) the same way.
  const productBehaviorRefreshable =
    issue.code === 'product_behavior_invalid' &&
    productBehaviorIssuesSupportWorkingCopyRefresh(issue.productBehaviorIssues ?? []);
  const productBehaviorNeedsProductActions =
    issue.code === 'product_behavior_invalid' &&
    !productBehaviorRefreshable &&
    (terminal.state === 'PRODUCT_DATA_REQUIRED' || terminal.state === 'MAPPER_BINDING_REQUIRED');

  if (
    issue.code === 'unsupported_profile' ||
    issue.code === 'practicalization_blocked' ||
    issue.code === 'missing_prices' ||
    issue.code === 'missing_required_role' ||
    issue.code === 'vegan_ingredient_conflict' ||
    issue.code === 'vegan_profile_constraint' ||
    issue.code === 'impossible_under_constraints' ||
    issue.code === 'product_behavior_invalid'
  ) {
    return (
      <div className="space-y-2" data-testid="pro-recalc-diagnosis" data-code={issue.code}>
        {productBehaviorRefreshable && issue.code === 'product_behavior_invalid' ? (
          <div className="space-y-1" data-testid="pro-recalc-product-behavior-refresh-copy">
            <p className="text-sm leading-relaxed text-ivory/90">
              Dane produktów w tej wersji są nieaktualne.
            </p>
            <p className="text-xs leading-relaxed text-ivory/70">
              Dotyczy: {[
                ...new Set(issue.productBehaviorIssues?.map((entry) => entry.lineName) ?? []),
              ].join(', ')}. Historyczna wersja pozostanie bez zmian.
            </p>
          </div>
        ) : (
          <p className="text-sm leading-relaxed text-ivory/85">
            {customerPreviewIssueMessagePl(issue)}
          </p>
        )}
        <p className="text-xs text-ivory/60" data-testid="pro-recalc-unchanged">
          {d.unchanged}
        </p>
        {issue.code === 'missing_required_role' && issue.role === 'product_dose' ? (
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ivory/20 px-4 py-2 text-sm font-medium text-ivory transition-colors hover:border-ivory/40"
            data-testid="pro-recalc-return-to-product-dose"
            onClick={() => onReturnToRecipe(issue.lineIds?.[0] ?? null)}
          >
            Wróć do receptury
          </button>
        ) : null}
        {issue.code === 'impossible_under_constraints' ? (
          <div className="flex flex-wrap gap-2">
            {issue.conflict ? (
              <button
                type="button"
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-ivory px-4 py-2 text-sm font-semibold text-shell transition-colors hover:bg-ivory/90"
                data-testid="pro-recalc-unlock-and-preview"
                onClick={() => onUnlockAndPreview(issue.conflict!.lineId)}
              >
                Odblokuj i pokaż podgląd
              </button>
            ) : null}
            <button
              type="button"
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ivory/20 px-4 py-2 text-sm font-medium text-ivory transition-colors hover:border-ivory/40"
              data-testid="pro-recalc-return-to-locks"
              onClick={() => onReturnToRecipe(issue.conflict?.lineId ?? null)}
            >
              Wróć do receptury
            </button>
          </div>
        ) : null}
        {productBehaviorRefreshable ? (
          <div className="space-y-2" data-testid="pro-recalc-product-behavior-refresh">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-ivory px-4 py-2 text-sm font-semibold text-shell transition-colors hover:bg-ivory/90 disabled:cursor-wait disabled:opacity-60"
                data-testid="pro-recalc-refresh-product-behavior"
                disabled={refreshingProductBehavior}
                onClick={onRefreshProductBehavior}
              >
                {refreshingProductBehavior
                  ? 'Tworzę nową wersję roboczą…'
                  : 'Utwórz nową wersję z aktualnymi danymi produktów'}
              </button>
              <button
                type="button"
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ivory/20 px-4 py-2 text-sm font-medium text-ivory transition-colors hover:border-ivory/40"
                disabled={refreshingProductBehavior}
                onClick={() => onReturnToRecipe(null)}
              >
                Wróć do receptury
              </button>
            </div>
            {productBehaviorRefreshError ? (
              <p className="text-xs leading-relaxed text-status-risky" role="alert">
                {productBehaviorRefreshError}
              </p>
            ) : null}
          </div>
        ) : null}
        {productBehaviorNeedsProductActions ? (
          <div className="flex flex-wrap gap-2" data-testid="pro-recalc-product-data-actions">
            <button
              type="button"
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ivory/20 px-4 py-2 text-sm font-medium text-ivory transition-colors hover:border-ivory/40"
              onClick={onChooseOtherProduct}
            >
              Wybierz inny produkt
            </button>
            <button
              type="button"
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ivory/20 px-4 py-2 text-sm font-medium text-ivory transition-colors hover:border-ivory/40"
              onClick={onCompleteProductData}
            >
              Uzupełnij dane produktu
            </button>
            <button
              type="button"
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ivory/20 px-4 py-2 text-sm font-medium text-ivory transition-colors hover:border-ivory/40"
              onClick={() => onReturnToRecipe(issue.violations[0]?.lineIds[0] ?? null)}
            >
              Wróć do receptury
            </button>
          </div>
        ) : null}
        {!(
          (issue.code === 'missing_required_role' && issue.role === 'product_dose') ||
          issue.code === 'impossible_under_constraints' ||
          productBehaviorRefreshable ||
          productBehaviorNeedsProductActions
        ) ? (
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ivory/20 px-4 py-2 text-sm font-medium text-ivory transition-colors hover:border-ivory/40"
            data-testid="pro-recalc-return-to-recipe"
            onClick={() => onReturnToRecipe(null)}
          >
            Wróć do receptury
          </button>
        ) : null}
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

      {rescueAdvice ? (
        <RescueAdviceHint advice={rescueAdvice ?? null} onAddIngredient={onAddRescueIngredient} />
      ) : null}
      <p className="text-xs text-ivory/60" data-testid="pro-recalc-unchanged">
        {d.unchanged}
      </p>
      <button
        type="button"
        className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ivory/20 px-4 py-2 text-sm font-medium text-ivory transition-colors hover:border-ivory/40"
        data-testid="pro-recalc-return-to-recipe"
        onClick={() => onReturnToRecipe(null)}
      >
        Wróć do receptury
      </button>
    </div>
  );
}

/**
 * Owner 2026-08-22 — simulation-proven rescue ingredient hint. Rendered ONLY
 * when the advisor proved that adding ONE approved ingredient materially
 * improves the legal result. PI never adds it: the user adds it through the
 * normal "Dodaj składnik" flow and runs a NEW Preview.
 */
export function RescueAdviceHint({
  advice,
  onAddIngredient,
}: {
  advice: RescueIngredientAdvice | null;
  onAddIngredient?: () => void;
}) {
  if (!advice) return null;
  return (
    <div
      className="rounded-md border border-ivory/15 bg-ivory/[0.05] px-3 py-3"
      data-testid="direction-rescue-advice"
      data-ingredient={advice.candidate.canonicalIngredientId}
    >
      <p className="text-xs font-medium text-ivory">
        Możliwy kolejny krok: {advice.candidate.namePl}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-ivory/70">{advice.reasonPl}</p>
      <p className="mt-1 text-xs leading-relaxed text-ivory/70">
        PI nie doda tego składnika automatycznie. Wróć do receptury, wybierz „Dodaj składnik”, dodaj
        zweryfikowany produkt i uruchom PI ponownie — nowy Preview musi nadal potwierdzić twardość,
        zamrożenie, ciała stałe oraz wszystkie bezpieczne zakresy.
      </p>
      {onAddIngredient ? (
        <button
          type="button"
          onClick={onAddIngredient}
          data-testid="direction-rescue-add-ingredient"
          className="mt-2 min-h-11 rounded-lg border border-ivory/20 px-4 py-2.5 text-sm font-medium text-ivory"
        >
          Wróć i dodaj składnik
        </button>
      ) : null}
    </div>
  );
}

export function DirectionBestDecision({
  candidate,
  onAccept,
  onBack,
  rescueAdvice = null,
  onAddRescueIngredient,
}: {
  candidate: import('@/features/constraint-studio/applyPipeline').ConstraintPreview;
  onAccept: () => void;
  onBack: () => void;
  rescueAdvice?: RescueIngredientAdvice | null;
  onAddRescueIngredient?: () => void;
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
      <RescueAdviceHint advice={rescueAdvice} onAddIngredient={onAddRescueIngredient} />
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
  const [refreshingProductBehavior, setRefreshingProductBehavior] = useState(false);
  const [productBehaviorRefreshError, setProductBehaviorRefreshError] = useState<string | null>(
    null,
  );
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
        if (useConstraintStudioStore.getState().recalculationTerminal?.state === 'WORKING') return;
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
  const rescueAdvice = useConstraintStudioStore((s) => s.rescueAdvice);
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
      directionTargets,
      directionTargetsActive,
      items,
    ],
  );

  const undoAvailable = isUndoAvailable(history[history.length - 1], currentInput, constraints);

  const returnToProductDose = (lineId: string | null) => {
    onClose();
    if (!lineId) return;
    window.requestAnimationFrame(() => {
      const control = Array.from(
        document.querySelectorAll<HTMLElement>('[data-testid^="row-grams-control-"]'),
      ).find((element) => element.dataset.testid === `row-grams-control-${lineId}`);
      control?.querySelector<HTMLElement>('[role="spinbutton"]')?.focus();
    });
  };

  const openBaseProductPicker = () => {
    onClose();
    window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLButtonElement>(
          '[data-picker-scope="BASE_FORMULATION"] button[aria-haspopup="dialog"]',
        )
        ?.click();
    });
  };

  const goToProductData = () => {
    window.location.assign('/products/scan');
  };

  const goToSettings = () => {
    onClose();
    window.requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent('pinguino:profile-settings-required'));
    });
  };

  const unlockAndPreview = (lineId: string) => {
    void unlockConstraintAndRecalculate(lineId);
  };

  const refreshProductBehavior = () => {
    if (refreshingProductBehavior) return;
    setRefreshingProductBehavior(true);
    setProductBehaviorRefreshError(null);
    void (async () => {
      try {
        const result = await refreshCurrentRecipeBehaviorWorkingCopy();
        if (!result.ok) {
          const names = [...new Set(result.issues.map((issue) => issue.lineName))];
          const suffix = names.length > 0 ? ` Dotyczy: ${names.join(', ')}.` : '';
          setProductBehaviorRefreshError(
            result.code === 'current_authority_unresolved' ||
              result.code === 'current_authority_invalid'
              ? `Nie udało się potwierdzić aktualnych danych wszystkich produktów.${suffix}`
              : result.code === 'recipe_changed'
                ? 'Receptura zmieniła się podczas odświeżania. Uruchom tę operację ponownie.'
                : result.code === 'authentication_required'
                  ? 'Zaloguj się ponownie i uruchom tę operację jeszcze raz.'
                  : result.code === 'saved_version_required'
                    ? 'Ta operacja wymaga otwartej, zapisanej wersji receptury.'
                    : 'Nie udało się utworzyć nowej wersji roboczej. Receptura pozostała bez zmian.',
          );
          return;
        }
        await runPiRecalculationWithTerminal();
      } catch {
        setProductBehaviorRefreshError(
          'Nie udało się odświeżyć danych produktów. Receptura pozostała bez zmian.',
        );
      } finally {
        setRefreshingProductBehavior(false);
      }
    })();
  };

  if (!open) return null;

  // One-screen workbench (owner 2026-07-24): the recalculation is a COMPACT OVERLAY
  // (520–720 px), never a giant page section. Zastosuj closes the overlay — the
  // editor + LIVE Monitor update in place and the bottom action bar carries the
  // applied confirmation + Cofnij. Same store pipeline, same testids.
  return (
    // Above the mobile preview bar and the score/Przelicz strip (z-60): a
    // BLOCKING dialog must never be overlapped by the controls it blocks. The
    // bar was introduced after this overlay and silently outranked it.
    <div className="fixed inset-0 z-[80]" data-testid="pro-recalc-overlay">
      <button
        type="button"
        aria-label={r.close}
        onClick={recalculationTerminal?.state === 'WORKING' ? undefined : onClose}
        disabled={recalculationTerminal?.state === 'WORKING'}
        className="absolute inset-0 h-full w-full bg-black/60 motion-safe:animate-[appFadeIn_150ms_ease-out]"
      />
      <section
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={r.title}
        data-testid="pro-recalc-panel"
        data-terminal-state={recalculationTerminal?.state ?? 'IDLE'}
        className="absolute left-1/2 top-1/2 max-h-[88vh] w-[min(680px,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-white/10 bg-shell px-4 py-4 text-ivory shadow-pro-md [--color-charcoal:#191a1d] [--color-ivory:#efe9dc] [--color-shell:#191a1d] [color-scheme:dark] sm:px-5 sm:py-5"
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium tracking-label text-ivory/60 uppercase">{r.title}</p>
          <button
            type="button"
            onClick={onClose}
            disabled={recalculationTerminal?.state === 'WORKING'}
            data-testid="pro-recalc-close"
            className="min-h-11 rounded-lg border border-ivory/20 px-3 py-1.5 text-xs font-medium text-ivory transition-colors hover:border-ivory/40 disabled:cursor-wait disabled:opacity-50"
          >
            {r.close}
          </button>
        </div>

        <div className="mt-3 space-y-3">
          {recalculationTerminal?.state === 'WORKING' ? (
            <p
              className="text-sm leading-relaxed text-ivory/80"
              role="status"
              aria-live="polite"
              data-testid="pro-recalc-working"
            >
              PI przelicza recepturę…
            </p>
          ) : null}

          {recalculationTerminal?.state === 'SETTINGS_CONFIRMATION_REQUIRED' ? (
            <div className="space-y-2" data-testid="pro-recalc-settings-required">
              <p className="text-sm leading-relaxed text-ivory/85" role="alert">
                Najpierw potwierdź ustawienia receptury.
              </p>
              <button
                type="button"
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ivory/20 px-4 py-2 text-sm font-medium text-ivory transition-colors hover:border-ivory/40"
                onClick={goToSettings}
              >
                Przejdź do ustawień
              </button>
            </div>
          ) : null}

          {recalculationTerminal?.state === 'BLOCKED_WITH_EXACT_ACTION' &&
          recalculationTerminal.messagePl &&
          !previewIssue ? (
            <div className="space-y-2" data-testid="pro-recalc-exact-action-block">
              <p className="text-sm leading-relaxed text-ivory/85" role="alert">
                {recalculationTerminal.messagePl}
              </p>
              <button
                type="button"
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ivory/20 px-4 py-2 text-sm font-medium text-ivory transition-colors hover:border-ivory/40"
                onClick={
                  recalculationTerminal.action === 'choose_product'
                    ? openBaseProductPicker
                    : onClose
                }
              >
                {recalculationTerminal.action === 'choose_product'
                  ? 'Wybierz produkt'
                  : 'Wróć do receptury'}
              </button>
            </div>
          ) : null}

          {blocked ? (
            <BlockedApplyNotice blocked={blocked} onDismiss={store.dismissBlocked} />
          ) : null}

          {previewIssue && recalculationTerminal ? (
            <RecalcDiagnosisView
              issue={previewIssue}
              input={currentInput}
              constraints={constraints}
              servingModeId={servingModeId}
              onReturnToRecipe={returnToProductDose}
              onChooseOtherProduct={openBaseProductPicker}
              onCompleteProductData={goToProductData}
              onRefreshProductBehavior={refreshProductBehavior}
              refreshingProductBehavior={refreshingProductBehavior}
              productBehaviorRefreshError={productBehaviorRefreshError}
              onUnlockAndPreview={unlockAndPreview}
              onRemoveStandardAndPreview={(lineId) => {
                void createExplicitStandardRemovalPreviewWithServerAuthority(lineId);
              }}
              terminal={recalculationTerminal}
              rescueAdvice={rescueAdvice}
              onAddRescueIngredient={() => {
                store.cancelPreview();
                openBaseProductPicker();
              }}
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
              rescueAdvice={rescueAdvice}
              onAddRescueIngredient={() => {
                store.cancelPreview();
                openBaseProductPicker();
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
