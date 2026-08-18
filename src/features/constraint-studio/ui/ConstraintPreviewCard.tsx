/**
 * §19.1 Preview card — the old→new diff of a staged proposal. PURE view
 * (props only): the section owns store wiring. Apply is explicit; cancel
 * restores nothing because the preview never touched the recipe (§19.2).
 */
import { cn } from '@/lib/cn';
import { NonProductionBadge } from '@/features/design-review/NonProductionMarker';
import {
  constraintStudioCopy as copy,
  formatGramsDeltaPl,
  formatGramsPl,
} from '../constraintStudioCopy';
import { mainObjectiveSummaryPl } from '../mainObjectivePresentation';
import {
  customerFormulationSourcePl,
  customerSolverSourcePl,
} from '../customerConstraintStudioPresentation';
import {
  findCanonicalDuplicateIngredients,
  plannedSum,
  type ConstraintPreview,
  type PreviewLineDiff,
} from '../applyPipeline';

function directionSummary(preview: ConstraintPreview): string | null {
  if (preview.proposedInput.goals?.direction_targets_active !== true) return null;
  const targets = preview.proposedInput.goals.direction_targets;
  if (!targets) return null;
  const labels = [
    targets.sweetness < 0 ? 'mniej słodkie' : targets.sweetness > 0 ? 'bardziej słodkie' : null,
    targets.softness < 0 ? 'twardsze' : targets.softness > 0 ? 'miększe' : null,
  ].filter((label): label is string => label !== null);
  return labels.length > 0 ? labels.join(' · ') : 'środek wybranego profilu';
}

function lineNote(line: PreviewLineDiff): string {
  if (line.kind === 'added') return copy.preview.added;
  if (line.kind === 'removed') return copy.preview.removed;
  if (line.kind === 'unchanged') {
    return line.locked ? copy.preview.unchangedLocked : copy.preview.unchanged;
  }
  return line.locked ? copy.preview.lockChanged : '';
}

function DiffRow({ line }: { line: PreviewLineDiff }) {
  const note = lineNote(line);
  const delta =
    line.kind === 'changed' && line.beforeGrams !== null && line.afterGrams !== null
      ? formatGramsDeltaPl(line.afterGrams - line.beforeGrams)
      : null;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 py-2">
      <span className="min-w-0 truncate text-sm text-ivory">{line.name}</span>
      <span className="flex shrink-0 items-baseline gap-2 font-mono text-sm tabular-nums">
        {line.kind === 'unchanged' ? (
          <span className="text-ivory/70">{formatGramsPl(line.beforeGrams ?? 0)}</span>
        ) : (
          <>
            <span className="text-ivory/65">
              {line.beforeGrams === null ? '—' : formatGramsPl(line.beforeGrams)}
            </span>
            <span aria-hidden className="text-ivory/60">
              →
            </span>
            <span className="text-ivory">
              {line.afterGrams === null ? '—' : formatGramsPl(line.afterGrams)}
            </span>
          </>
        )}
        {delta ? <span className="text-xs text-ivory/65">{delta}</span> : null}
        {note ? (
          <span
            className={cn(
              'text-[0.65rem] tracking-[0.06em] uppercase',
              line.locked ? 'text-status-risky' : 'text-ivory/60',
            )}
          >
            {note}
          </span>
        ) : null}
      </span>
    </div>
  );
}

export function ConstraintPreviewCard({
  preview,
  onApply,
  onCancel,
}: {
  preview: ConstraintPreview;
  onApply: () => void;
  onCancel: () => void;
}) {
  const beforeBatch = preview.lines.reduce((sum, line) => sum + (line.beforeGrams ?? 0), 0);
  // Applicability follows the proposal payload, not the presentation diff.
  // A stale/incomplete diff must never make an off-target payload look safe.
  const afterBatch = plannedSum(preview.proposedInput);
  // Owner P0 UX repair (truthful states): deliberate 0 g lines (unchanged, empty before AND
  // after) are DE-EMPHASIZED at the bottom with an explanatory note — never top-of-list
  // noise. Pure display split; totals above still sum over ALL lines.
  const isZeroUnchanged = (line: PreviewLineDiff) =>
    line.kind === 'unchanged' && (line.beforeGrams ?? 0) === 0 && (line.afterGrams ?? 0) === 0;
  const mainLines = preview.lines.filter((line) => !isZeroUnchanged(line));
  const zeroLines = preview.lines.filter(isZeroUnchanged);
  const batchChanged = Math.abs(afterBatch - beforeBatch) > 0.05;
  const targetBatch = preview.proposedInput.target_batch_grams;
  // Poured actuals put the recipe in production reality — the planned-batch
  // residual is only meaningful for a purely planned recipe.
  const hasActuals = preview.proposedInput.items.some((item) => item.actual_grams !== null);
  const residualExceeded = !hasActuals && Math.abs(afterBatch - targetBatch) > 0.1;
  const canonicalDuplicates = findCanonicalDuplicateIngredients(preview.proposedInput);
  const integrityDiagnostic = residualExceeded || canonicalDuplicates.length > 0;

  // ACCEPTANCE ADDENDUM (1+3): a diagnostic-only preview (hard-native residual
  // violations or an iteration-capped result) can never be applied — the
  // pipeline door enforces this structurally; the card says WHY and disables
  // the Apply control honestly (never a clickable button that fails later).
  const diagnostic = preview.diagnosticOnly === true || integrityDiagnostic;
  const hardResiduals = preview.hardResidualMetrics ?? [];
  const residualDiagnostics = preview.residualMetricDiagnostics ?? [];
  const diagnosticReason = preview.diagnosticReason;
  // Owner addendum item 4 — the trustless outcome classification.
  const outcome = preview.outcomeClassification;
  const selectedDirection = directionSummary(preview);
  const mainObjectiveSummary = mainObjectiveSummaryPl(preview);
  const protectedFacts = [
    [
      'Blokady',
      preview.proposedInput.items.filter(
        (item) =>
          item.lock_type === 'grams' ||
          item.lock_type === 'percent' ||
          item.lock_type === 'already_added' ||
          item.grams_constraint !== undefined ||
          item.percent_constraint !== undefined ||
          item.range_constraint !== undefined,
      ).length,
    ],
    ['Główne', preview.proposedInput.items.filter((item) => item.lock_type === 'main').length],
    [
      'Wymagane',
      preview.proposedInput.items.filter((item) => item.lock_type === 'required').length,
    ],
    ['Wykluczenia', preview.proposedInput.goals?.excluded_ingredient_ids?.length ?? 0],
  ] as const;

  return (
    <section
      aria-label={copy.preview.title}
      className="rounded-[22px] bg-white/[0.035] px-3 py-3 sm:px-4 sm:py-4"
    >
      <div className="flex items-center justify-between gap-3">
        <span>
          <span className="block text-[0.625rem] font-semibold tracking-[0.12em] text-gold-soft uppercase">
            Preview
          </span>
          <span className="mt-1 block text-base font-medium text-ivory">{copy.preview.title}</span>
        </span>
        <span className="rounded-full border border-ivory/15 bg-white/[0.04] px-2.5 py-1 text-[0.625rem] font-medium tracking-[0.08em] text-ivory/65 uppercase">
          {preview.titlePl}
        </span>
      </div>

      {preview.substitution ? (
        <div
          className="mt-3 rounded-lg bg-white/[0.045] px-3 py-2.5 text-xs leading-relaxed text-ivory/80"
          data-testid="preview-substitution"
        >
          <span className="font-semibold text-ivory">Zweryfikowana zamiana:</span>{' '}
          {preview.substitution.fromName} → {preview.substitution.toName}.
          {preview.substitution.changesMainIdentity
            ? ' Zmienia tożsamość składnika Głównego i wymaga jawnej zgody przed Apply.'
            : ' Rola technologiczna i reguły bezpieczeństwa pozostają sprawdzane przez Apply.'}
        </div>
      ) : null}

      {mainObjectiveSummary ? (
        <div
          className="mt-3 rounded-lg border border-gold-soft/25 bg-gold-soft/[0.055] px-3 py-2.5 text-xs leading-relaxed text-ivory/80"
          data-testid="preview-main-technical-maximum"
        >
          {mainObjectiveSummary}
        </div>
      ) : null}

      {selectedDirection ? (
        <div
          className="mt-3 rounded-lg bg-white/[0.045] px-3 py-2.5 text-xs leading-relaxed text-ivory/80"
          data-testid="preview-direction-reason"
        >
          <span className="font-semibold text-ivory">Wybrany kierunek:</span> {selectedDirection}.
          PI zmieniło wyłącznie dozwolone składniki; blokady gramowe, procentowe, role Główne i
          wykluczenia pozostają nienaruszalne.
        </div>
      ) : null}

      {preview.practicalization?.status === 'ready' ? (
        <div
          className="mt-3 rounded-[18px] border border-gold-soft/25 bg-gold-soft/[0.055] px-3 py-3"
          data-testid="preview-practical-recipe"
        >
          <div className="flex items-center justify-between gap-3">
            <strong className="text-sm text-ivory">Receptura wykonawcza · pełne gramy</strong>
            <span className="text-xs font-semibold text-status-ideal">
              ✓ Engine sprawdzony ponownie
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-ivory/65">
            Dokładny kandydat PI został przeliczony na fizyczny wektor gramowy, a POD, NPAC i
            wszystkie twarde bramki policzono ponownie dla liczb widocznych poniżej.
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-ivory/70">
            <div className="rounded-xl bg-black/15 px-3 py-2">
              <dt>Dokładny Engine</dt>
              <dd className="mt-1 font-mono tabular-nums text-ivory">
                {preview.practicalization.audit.exactTotalGrams.toFixed(3)} g
              </dd>
            </div>
            <div className="rounded-xl bg-black/15 px-3 py-2">
              <dt>Do wykonania</dt>
              <dd className="mt-1 font-mono tabular-nums text-ivory">
                {preview.practicalization.audit.executableTotalGrams.toFixed(0)} g
              </dd>
            </div>
          </dl>
        </div>
      ) : preview.practicalization?.status === 'blocked' ? (
        <div
          className="mt-3 rounded-[18px] border border-status-risky/40 bg-status-risky/10 px-3 py-3"
          data-testid="preview-practical-blocker"
        >
          <strong className="text-sm text-status-risky">
            Nie można utworzyć bezpiecznej receptury pełnogramowej
          </strong>
          <p className="mt-1 text-xs leading-relaxed text-ivory/75">
            {preview.practicalization.failure.messagePl}
          </p>
        </div>
      ) : null}

      <section
        className="mt-3 rounded-[18px] border border-ivory/12 bg-white/[0.025] px-3 py-3"
        data-testid="preview-protected-contracts"
      >
        <p className="text-[0.625rem] font-semibold tracking-[0.12em] text-ivory/65 uppercase">
          Chronione przez Apply
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {protectedFacts.map(([label, count]) => (
            <span
              key={label}
              className="rounded-full border border-ivory/12 px-2.5 py-1 text-xs text-ivory/75"
            >
              {label}: <strong className="font-mono tabular-nums text-ivory">{count}</strong>
            </span>
          ))}
          {preview.formulation?.proof?.stabilizerDoseNotePl ? (
            <span className="rounded-full border border-gold-soft/25 px-2.5 py-1 text-xs text-gold-soft">
              Stabilizator: dawka szablonowa
            </span>
          ) : null}
        </div>
      </section>

      {preview.directionAssessment?.active ? (
        <div
          className="mt-3 grid grid-cols-[auto_1fr] items-center gap-3 rounded-lg border border-gold-soft/25 bg-gold-soft/[0.06] px-3 py-2.5"
          data-testid="preview-direction-score"
        >
          <span
            className={`font-mono text-lg tabular-nums ${preview.directionAssessment.reached ? 'text-status-ideal' : 'text-gold-soft'}`}
          >
            {preview.directionAssessment.score ?? '—'}/10
          </span>
          <p className="text-xs leading-relaxed text-ivory/70">
            {preview.directionAssessment.reached
              ? 'PI osiągnęło wybrany profil.'
              : 'Najbliższy bezpieczny profil — zaakceptowany świadomie przed tym Preview.'}
          </p>
        </div>
      ) : null}

      {diagnostic ? (
        <div
          className="mt-3 rounded-md border border-status-risky/50 bg-status-risky/10 px-3 py-2.5"
          data-testid="preview-diagnostic"
        >
          <p className="text-[0.65rem] font-medium tracking-[0.08em] text-status-risky uppercase">
            {copy.preview.diagnosticBadge}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ivory/80">
            {canonicalDuplicates.length > 0
              ? copy.preview.diagnosticDuplicates(canonicalDuplicates)
              : residualExceeded
                ? copy.preview.diagnosticBatchMismatch(
                    formatGramsPl(afterBatch),
                    formatGramsPl(targetBatch),
                  )
                : diagnosticReason === 'reference_derived'
                  ? copy.preview.diagnosticReferenceDerived(preview.formulation?.templateId ?? '—')
                  : diagnosticReason === 'protein_target_residual'
                    ? 'Kandydat jest natywnie bezpieczny, ale nie osiąga wybranego celu białka. Apply pozostaje zablokowany.'
                    : hardResiduals.length > 0
                      ? copy.preview.diagnosticHardResiduals(hardResiduals)
                      : copy.preview.diagnosticIterationCap}
          </p>
          {residualDiagnostics.length > 0 ? (
            <div className="mt-3 space-y-2" data-testid="preview-residual-metric-diagnostics">
              {residualDiagnostics.map((metric) => (
                <div
                  key={metric.metric}
                  className="rounded-lg border border-ivory/12 bg-black/15 px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <strong className="text-xs text-ivory">{metric.labelPl}</strong>
                    <span className="text-[0.625rem] font-medium tracking-[0.08em] text-status-risky uppercase">
                      {metric.status === 'hard_block' ? 'Twarda blokada' : 'Wskazówka'}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-xs tabular-nums text-ivory/80">
                    Przed:{' '}
                    {metric.beforeValue === null
                      ? '—'
                      : `${metric.beforeValue.toFixed(1)}${metric.valueUnit === '%' ? '%' : ' pkt'}`}{' '}
                    · Po: {metric.proposedValue.toFixed(1)}
                    {metric.valueUnit === '%' ? '%' : ' pkt'} · Zakres:{' '}
                    {metric.acceptedMin.toFixed(1)}–{metric.acceptedMax.toFixed(1)}
                    {metric.valueUnit === '%' ? '%' : ' pkt'}
                  </p>
                  <p className="mt-1 font-mono text-xs tabular-nums text-ivory/70">
                    Dystans: {metric.distanceBefore.toFixed(1)} {metric.distanceUnit} →{' '}
                    {metric.distanceAfter.toFixed(1)} {metric.distanceUnit}
                  </p>
                  {metric.bandStatus !== null ||
                  metric.categoryFallback ||
                  metric.temperatureFallback ? (
                    <p className="mt-1 text-[0.625rem] text-ivory/55">
                      Zakres:{' '}
                      {metric.bandStatus === 'seeded'
                        ? 'zatwierdzony'
                        : metric.bandStatus === 'estimated'
                          ? 'szacowany'
                          : 'bez oznaczenia'}
                      {metric.categoryFallback ? ' · profil zastępczy' : ''}
                      {metric.temperatureFallback ? ' · temperatura zastępcza' : ''}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs leading-relaxed text-ivory/75">
                    {metric.movement === 'improved'
                      ? 'Wynik jest bliżej zakresu, ale nadal go nie osiąga.'
                      : metric.movement === 'worsened'
                        ? 'Wynik oddalił się od zatwierdzonego zakresu.'
                        : 'Odległość od zatwierdzonego zakresu nie zmieniła się.'}{' '}
                    {metric.applyDisabledReasonPl}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {preview.proteinTarget?.applicable ? (
        <div
          className="mt-3 grid grid-cols-2 gap-3 border border-ivory/15 px-3 py-2.5"
          data-testid="preview-protein-target"
        >
          <div>
            <p className="text-[0.65rem] tracking-[0.08em] text-ivory/60 uppercase">Cel białka</p>
            <p className="mt-1 font-mono text-sm tabular-nums text-ivory">
              {preview.proteinTarget.targetPercent?.toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-[0.65rem] tracking-[0.08em] text-ivory/60 uppercase">
              Wynik po zmianie
            </p>
            <p
              className={`mt-1 font-mono text-sm tabular-nums ${preview.proteinTarget.reached ? 'text-status-ideal' : 'text-status-risky'}`}
            >
              {preview.proteinTarget.actualPercent?.toFixed(1)}%
            </p>
          </div>
        </div>
      ) : null}

      {/* OWNER FINAL INTEGRATION ADDENDUM item 4 (2026-07-25) — WHAT THIS
          PREVIEW ACTUALLY DID. The wording comes from `outcomeClassification`,
          recomputed by the pipeline from the before/after inputs alone, so a
          pure batch rescale can never render the optimisation sentence and a
          verified improvement can never be reduced to „przeskalowano". */}
      {outcome.outcome !== 'no_verified_change' ? (
        <div
          className="mt-3 rounded-md border border-ivory/15 px-3 py-2.5"
          data-testid="preview-outcome"
          data-outcome={outcome.outcome}
        >
          <p className="text-[0.65rem] font-medium tracking-[0.08em] text-ivory/60 uppercase">
            {outcome.outcome === 'batch_rescale_and_optimization'
              ? copy.preview.outcome.bothHeading
              : outcome.outcome === 'batch_rescale'
                ? copy.preview.outcome.batchRescaleHeading
                : copy.preview.outcome.optimizationHeading}
          </p>
          {outcome.batchReconciled ? (
            <p
              className="mt-1 text-xs leading-relaxed text-ivory/80"
              data-testid="preview-batch-reconciled"
            >
              {outcome.compositionUnchanged
                ? copy.preview.outcome.rescaleOnlyNote(
                    formatGramsPl(outcome.beforeGrams),
                    formatGramsPl(outcome.afterGrams),
                  )
                : copy.preview.outcome.rescaleChangedCompositionNote(
                    formatGramsPl(outcome.beforeGrams),
                    formatGramsPl(outcome.afterGrams),
                  )}
            </p>
          ) : null}
          {outcome.engineImproved &&
          !(
            outcome.violationsBefore === outcome.violationsAfter && residualDiagnostics.length > 0
          ) ? (
            <p
              className="mt-1 text-xs leading-relaxed text-ivory/80"
              data-testid="preview-engine-improved"
            >
              {copy.preview.outcome.optimizationNote(
                outcome.violationsBefore,
                outcome.violationsAfter,
              )}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4">
        <p className="mb-1 text-[0.625rem] font-semibold tracking-[0.12em] text-ivory/65 uppercase">
          Proponowane zmiany
        </p>
        <div className="divide-y divide-ivory/10 rounded-lg bg-black/15 px-3">
          {mainLines.map((line) => (
            <DiffRow key={line.lineId} line={line} />
          ))}
        </div>
      </div>

      {zeroLines.length > 0 ? (
        <div
          className="mt-3 rounded-md border border-ivory/10 px-3 py-2.5"
          data-testid="preview-zero-unchanged"
        >
          <p className="text-[0.65rem] font-medium tracking-[0.08em] text-ivory/60 uppercase">
            {copy.preview.zeroUnchangedHeading}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-ivory/60">
            {copy.preview.zeroUnchangedNote}
          </p>
          <div className="mt-1">
            {zeroLines.map((line) => (
              <div
                key={line.lineId}
                className="flex items-baseline justify-between gap-3 py-1 text-[12px] text-ivory/60"
              >
                <span className="min-w-0 truncate">{line.name}</span>
                <span className="shrink-0 font-mono tabular-nums">
                  {formatGramsPl(0)} · {lineNote(line)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-3 space-y-1 border-t border-ivory/10 pt-3 text-xs text-ivory/60">
        {batchChanged ? (
          <p className="font-mono tabular-nums">
            {copy.preview.batchLine(formatGramsPl(beforeBatch), formatGramsPl(afterBatch))}
          </p>
        ) : null}
        {/* Owner P0 Phase 5 — the batch invariant, always visible. */}
        <p className="font-mono tabular-nums" data-testid="preview-totals">
          {copy.preview.totalsLine(
            formatGramsPl(beforeBatch),
            formatGramsPl(afterBatch),
            formatGramsPl(targetBatch),
          )}
        </p>
        {!hasActuals ? (
          residualExceeded ? (
            <p className="text-status-risky" data-testid="preview-residual">
              {copy.preview.residualWarning(formatGramsPl(Math.abs(afterBatch - targetBatch)))}
            </p>
          ) : (
            <p data-testid="preview-batch-ok">{copy.preview.totalsOk}</p>
          )
        ) : null}
        <p>{copy.preview.outOfBandDelta(preview.violationsBefore, preview.violationsAfter)}</p>
        {/* Owner QA (Phase 12): the EXACT source of the proposal — never mislabels a
            batch rescale as formulation. */}
        {preview.formulation ? (
          <p className="text-[0.65rem] text-ivory/60" data-testid="preview-source">
            {/* Owner P0 NIGHTLY Phase 6: name the template-seeded fallback honestly. */}
            {preview.formulation.localFallback ? `${copy.preview.localFallbackNote} ` : ''}
            {customerFormulationSourcePl(preview.formulation.templateId)}
            {preview.formulation.templateStatus === 'reference_derived'
              ? ` ${copy.preview.referenceDerivedNote}`
              : ''}
            {/* Agent 4 fixture sweep (presentation only): a reference_derived template is
                NOT approved science — the pink marker names the source + replacement. */}
            {preview.formulation.templateStatus === 'reference_derived' ? (
              <>
                {' '}
                <NonProductionBadge itemId="preview-reference-template" />
              </>
            ) : null}
          </p>
        ) : preview.autoBalance ? (
          <p className="text-[0.65rem] text-ivory/60" data-testid="preview-source">
            {preview.autoBalance.solverRounds > 0
              ? customerSolverSourcePl
              : copy.preview.sourceBatchRescale}
          </p>
        ) : null}
      </div>

      {/* Owner P0 (full formulation): toolbox additions with reasons + honest
          gaps + approved improvement suggestions. */}
      {preview.formulation && preview.formulation.added.length > 0 ? (
        <div className="mt-3 space-y-1" data-testid="preview-formulation-added">
          {preview.formulation.added.map((line) => (
            <p key={line.ingredientId} className="text-xs leading-relaxed text-ivory/70">
              {copy.preview.addedLine(line.name, formatGramsPl(line.grams))} {line.reasonPl}
            </p>
          ))}
        </div>
      ) : null}
      {preview.formulation && preview.formulation.recommendations.length > 0 ? (
        <div className="mt-3 space-y-1" data-testid="preview-formulation-recommendations">
          {preview.formulation.recommendations.map((rec) => (
            <p key={rec.role} className="text-xs leading-relaxed text-amber-200/90">
              {rec.messagePl}
            </p>
          ))}
        </div>
      ) : null}

      <div className="sticky bottom-0 -mx-3 mt-4 flex items-center gap-2 border-t border-ivory/10 bg-shell/95 px-3 pt-3 pb-1 backdrop-blur sm:-mx-4 sm:px-4">
        {diagnostic ? (
          <button
            type="button"
            disabled
            aria-disabled="true"
            data-testid="preview-apply-disabled"
            className="inline-flex flex-1 cursor-not-allowed items-center justify-center rounded-md border border-ivory/20 bg-ivory/10 px-4 py-2.5 text-sm font-medium text-ivory/70"
          >
            {copy.preview.applyDisabledDiagnostic}
          </button>
        ) : (
          <button
            type="button"
            onClick={onApply}
            data-testid="preview-apply"
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-ivory px-4 py-2.5 text-sm font-semibold text-shell shadow-pro-sm transition-transform hover:-translate-y-px hover:bg-ivory/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-soft"
          >
            {copy.preview.apply}
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          data-testid="preview-cancel"
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-ivory/20 px-4 py-2.5 text-sm font-medium text-ivory transition-colors hover:border-ivory/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-soft"
        >
          {copy.preview.cancel}
        </button>
      </div>
      {diagnostic ? null : (
        <p className="mt-2 text-xs leading-relaxed text-ivory/60">{copy.preview.applyNote}</p>
      )}
    </section>
  );
}
