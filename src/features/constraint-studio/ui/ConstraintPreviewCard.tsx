/**
 * §19.1 Preview card — the old→new diff of a staged proposal. The section owns
 * store wiring; local state only reveals presentation details. Apply is explicit;
 * cancel restores nothing because the preview never touched the recipe (§19.2).
 */
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { NonProductionBadge } from '@/features/design-review/NonProductionMarker';
import {
  constraintStudioCopy as copy,
  formatGramsDeltaPl,
  formatGramsPl,
} from '../constraintStudioCopy';
import {
  mainObjectiveSummaryPl,
  multiMainPreservationSummaryPl,
} from '../mainObjectivePresentation';
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
    // Historical field name; the sign follows the visible Twardość control:
    // negative = softer, positive = firmer.
    targets.softness < 0 ? 'miększe' : targets.softness > 0 ? 'twardsze' : null,
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

function changesLabel(count: number): string {
  if (count === 1) return '1 zmiana';
  if (count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14)) {
    return `${count} zmiany`;
  }
  return `${count} zmian`;
}

function DiffRow({ line }: { line: PreviewLineDiff }) {
  const note = lineNote(line);
  const delta =
    line.kind === 'changed' && line.beforeGrams !== null && line.afterGrams !== null
      ? formatGramsDeltaPl(line.afterGrams - line.beforeGrams)
      : null;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5">
      <span className="min-w-0 truncate text-sm font-medium text-black">{line.name}</span>
      <span className="flex shrink-0 flex-wrap items-baseline justify-end gap-x-2 gap-y-0.5 font-mono text-sm tabular-nums">
        {line.kind === 'unchanged' ? (
          <span className="text-black/65">{formatGramsPl(line.beforeGrams ?? 0)}</span>
        ) : (
          <>
            <span className="text-black/65" data-testid="preview-from-grams">
              {line.beforeGrams === null ? '—' : formatGramsPl(line.beforeGrams)}
            </span>
            <span aria-hidden className="text-black/65">
              →
            </span>
            <span className="font-semibold text-black">
              {line.afterGrams === null ? '—' : formatGramsPl(line.afterGrams)}
            </span>
          </>
        )}
        {delta ? (
          <span
            className={cn(
              'rounded-full px-1.5 py-0.5 text-[10px] font-medium',
              delta.startsWith('+')
                ? 'bg-education-ivory text-black/65'
                : 'bg-stone-100 text-black/65',
            )}
          >
            {delta}
          </span>
        ) : null}
        {note ? (
          <span
            className={cn(
              'basis-full text-right font-sans text-[0.625rem] tracking-[0.04em] uppercase',
              line.locked ? 'text-status-risky' : 'text-black/65',
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
  showTechnicalDetails = false,
  showCloseControl = false,
  applyPending = false,
}: {
  preview: ConstraintPreview;
  onApply: () => void;
  onCancel: () => void;
  /** Account-Access admin only. Customer previews never mount diagnostic copy. */
  showTechnicalDetails?: boolean;
  /** Modal chrome; the embedded Constraint Studio card keeps its surrounding controls. */
  showCloseControl?: boolean;
  /** Canonical Apply revalidation is running outside the UI event loop. */
  applyPending?: boolean;
}) {
  const [showUnchanged, setShowUnchanged] = useState(false);
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
  const changedLines = mainLines.filter((line) => line.kind !== 'unchanged');
  const unchangedLines = mainLines.filter((line) => line.kind === 'unchanged');
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
  const multiMainSummary = multiMainPreservationSummaryPl(preview);
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
  const score = preview.directionAssessment?.active ? preview.directionAssessment.score : null;
  const requiresSourceValidation = preview.formulation?.templateStatus === 'reference_derived';
  const summaryMessage = diagnostic
    ? 'Ta propozycja wymaga ponownej walidacji.'
    : requiresSourceValidation
      ? 'Dane profilu wymagają ponownej walidacji.'
      : preview.directionAssessment?.reached
        ? 'Receptura spełnia wybrany profil.'
        : changedLines.length > 0
          ? 'Gotowe. Sprawdź korektę i zastosuj ją, jeśli Ci odpowiada.'
          : 'Receptura nie wymaga zmian.';
  const mainCount = preview.proposedInput.items.filter((item) => item.lock_type === 'main').length;

  return (
    <section
      aria-label="Proponowane zmiany receptury"
      className="rounded-[14px] border border-black/10 bg-white px-3 py-3 text-black [--color-charcoal:#191a1d] [--color-ivory:#202124] [--color-shell:#f5f3ee] [color-scheme:light] sm:px-4 sm:py-4"
      data-testid="preview-customer-view"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold leading-tight text-black sm:text-lg">
          Proponowane zmiany receptury
        </h2>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden rounded-full border border-black/10 bg-stone-100 px-2.5 py-1 text-[0.625rem] font-semibold tracking-[0.08em] text-black/65 uppercase sm:inline-flex">
            {preview.titlePl}
          </span>
          {showCloseControl ? (
            <button
              type="button"
              aria-label="Zamknij podgląd zmian"
              onClick={onCancel}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/15 text-black/65 transition-colors hover:border-black/35 hover:bg-stone-100 hover:text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-soft"
              data-testid="preview-close"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
                <path
                  d="m6 6 8 8M14 6l-8 8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          ) : null}
        </div>
      </div>

      <div
        className={cn(
          'mt-3 grid items-center gap-3 rounded-[12px] border px-3 py-3',
          diagnostic
            ? 'border-status-risky/25 bg-status-risky/[0.055]'
            : 'border-gold-soft/45 bg-[#f8f4ec]',
          score !== null ? 'grid-cols-[auto_minmax(0,1fr)]' : 'grid-cols-1',
        )}
        data-testid="preview-summary"
      >
        {score !== null ? (
          <div
            className="flex h-12 min-w-16 items-center justify-center rounded-[10px] border border-gold-soft/60 bg-white px-3 font-mono text-lg font-semibold text-black tabular-nums"
            data-testid="preview-score"
          >
            {score} / 10
          </div>
        ) : null}
        <div className="min-w-0">
          <p className="text-sm font-medium leading-snug text-black">{summaryMessage}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <span className="rounded-full border border-black/10 bg-white/80 px-2 py-0.5 text-[11px] font-medium text-black/65">
              {changesLabel(changedLines.length)}
            </span>
            {mainCount > 0 ? (
              <span className="rounded-full border border-gold-soft/45 bg-white/80 px-2 py-0.5 text-[11px] font-medium text-black/65">
                {mainCount} {mainCount === 1 ? 'składnik główny' : 'składniki główne'}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {preview.substitution ? (
        <p
          className="mt-3 rounded-[10px] border border-black/10 bg-stone-100 px-3 py-2 text-xs text-black/65"
          data-testid="preview-customer-substitution"
        >
          <span className="font-medium text-black">Zamiana:</span> {preview.substitution.fromName} →{' '}
          {preview.substitution.toName}
        </p>
      ) : null}

      {preview.safetyLockConflict ? (
        <p
          className="mt-3 rounded-[10px] border border-gold-soft/35 bg-[#f8f4ec] px-3 py-2 text-xs text-black/65"
          data-testid="preview-customer-lock-change"
        >
          <span className="font-medium text-black">Zmiana zablokowanej ilości:</span>{' '}
          {preview.safetyLockConflict.ingredientName} ·{' '}
          <span className="font-mono tabular-nums">
            {formatGramsPl(preview.safetyLockConflict.beforeGrams)} →{' '}
            {formatGramsPl(preview.safetyLockConflict.requiredGrams)}
          </span>
        </p>
      ) : null}

      <section className="mt-4" aria-labelledby="preview-change-list-title">
        <div className="flex items-center justify-between gap-3">
          <h3
            id="preview-change-list-title"
            className="text-[0.6875rem] font-semibold tracking-[0.1em] text-black/65 uppercase"
          >
            Zmiany składników
          </h3>
          {unchangedLines.length + zeroLines.length > 0 ? (
            <button
              type="button"
              aria-expanded={showUnchanged}
              onClick={() => setShowUnchanged((current) => !current)}
              className="rounded-md px-1.5 py-1 text-xs font-medium text-black/65 transition-colors hover:bg-stone-100 hover:text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-soft"
              data-testid="preview-toggle-unchanged"
            >
              {showUnchanged ? 'Ukryj bez zmian' : 'Pokaż bez zmian'}
            </button>
          ) : null}
        </div>
        <div className="mt-2 divide-y divide-black/10 overflow-hidden rounded-[12px] border border-black/10 bg-white px-3">
          {changedLines.length > 0 ? (
            changedLines.map((line) => <DiffRow key={line.lineId} line={line} />)
          ) : (
            <p className="py-3 text-sm text-black/65">Brak zmian w gramaturach składników.</p>
          )}
          {showUnchanged
            ? [...unchangedLines, ...zeroLines].map((line) => (
                <DiffRow key={line.lineId} line={line} />
              ))
            : null}
        </div>
      </section>

      {diagnostic ? (
        <p
          className="mt-3 rounded-[10px] border border-status-risky/25 bg-status-risky/[0.045] px-3 py-2.5 text-xs leading-relaxed text-black/65"
          role="status"
          data-testid="preview-customer-diagnostic"
        >
          Sprawdź dane receptury i przelicz ją ponownie przed zastosowaniem.
        </p>
      ) : null}

      {showTechnicalDetails ? (
        <details
          className="mt-4 rounded-[12px] border border-ivory/10 bg-shell/35"
          data-testid="preview-technical-details"
        >
          <summary className="cursor-pointer list-none px-3 py-2.5 text-xs font-semibold text-ivory/65 marker:content-none">
            <span className="inline-flex items-center gap-2">
              <span aria-hidden className="text-gold-soft">
                +
              </span>
              Szczegóły techniczne
            </span>
          </summary>
          <div className="border-t border-ivory/10 px-3 pb-3">
            {preview.substitution ? (
              <div
                className="mt-3 rounded-lg bg-white/[0.045] px-3 py-2.5 text-xs leading-relaxed text-ivory/80"
                data-testid="preview-substitution"
              >
                <span className="font-semibold text-ivory">Zweryfikowana zamiana:</span>{' '}
                {preview.substitution.fromName} → {preview.substitution.toName}.
                {preview.substitution.changesMainIdentity
                  ? ' Zmienia tożsamość składnika głównego i wymaga wyraźnej zgody przed zastosowaniem.'
                  : ' Rola technologiczna i reguły bezpieczeństwa zostaną ponownie sprawdzone przed zastosowaniem.'}
              </div>
            ) : null}

            {preview.safetyLockConflict ? (
              <div
                className="mt-3 rounded-lg border border-status-risky/40 bg-status-risky/10 px-3 py-2.5 text-xs leading-relaxed text-ivory/80"
                data-testid="preview-safety-lock-conflict"
              >
                <span className="font-semibold text-status-risky">
                  {preview.safetyLockConflict.reason === 'product_dosage'
                    ? 'Blokada przekracza zatwierdzony zakres systemu stabilizatora:'
                    : 'Blokada wymusza twardo nieprawidłową recepturę:'}
                </span>{' '}
                {preview.safetyLockConflict.ingredientName} ma blokadę{' '}
                {formatGramsPl(preview.safetyLockConflict.beforeGrams)}. Ten podgląd proponuje
                jawnie zmianę blokady na {formatGramsPl(preview.safetyLockConflict.requiredGrams)} —{' '}
                {preview.safetyLockConflict.reason === 'constraint_feasibility'
                  ? 'wartość potwierdzoną przez zatwierdzone reguły obliczeń'
                  : preview.safetyLockConflict.boundary === 'maximum'
                    ? 'zatwierdzone maksimum'
                    : 'zatwierdzone minimum'}
                . Nic nie zmieni się bez użycia „Zastosuj zmiany”.
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

            {multiMainSummary ? (
              <p
                className="mt-3 text-xs font-medium leading-relaxed text-ivory/75"
                data-testid="preview-multi-main-preserved"
              >
                {multiMainSummary}
              </p>
            ) : null}

            {selectedDirection ? (
              <div
                className="mt-3 rounded-lg bg-white/[0.045] px-3 py-2.5 text-xs leading-relaxed text-ivory/80"
                data-testid="preview-direction-reason"
              >
                <span className="font-semibold text-ivory">Wybrany kierunek:</span>{' '}
                {selectedDirection}. Zmieniliśmy tylko dozwolone składniki; blokady
                gramowe, procentowe, role Główne i wykluczenia pozostają nienaruszalne.
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
                    ✓ Obliczenia sprawdzone ponownie
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-ivory/65">
                  Dokładne ilości w gramach są gotowe. Wszystkie wymagane warunki zostały ponownie
                  sprawdzone dla wartości widocznych poniżej.
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-ivory/70">
                  <div className="rounded-xl bg-black/15 px-3 py-2">
                    <dt>Dokładne obliczenie</dt>
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
                Sprawdzane przed zastosowaniem
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
                  className={`font-mono text-lg tabular-nums ${preview.directionAssessment.reached && !diagnostic ? 'text-status-ideal' : 'text-gold-soft'}`}
                >
                  {preview.directionAssessment.score ?? '—'}/10
                </span>
                <p className="text-xs leading-relaxed text-ivory/70">
                  {preview.directionAssessment.reached
                    ? diagnostic
                      ? 'Kierunek osiągnięty tylko w podglądzie diagnostycznym. Receptura nadal nie jest gotowa do zastosowania.'
                      : score === 10
                        ? 'Gellattissimo! Wybrany profil osiągnięty.'
                        : 'Wybrany profil osiągnięty.'
                    : 'Najbliższy bezpieczny profil — zaakceptowany świadomie przed tym podglądem.'}
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
                        ? copy.preview.diagnosticReferenceDerived(
                            preview.formulation?.templateId ?? '—',
                          )
                        : diagnosticReason === 'protein_claim_residual'
                          ? 'Wynik jest bezpieczny, ale nie spełnia deklaracji „wysoka zawartość białka”. Zastosowanie pozostaje zablokowane.'
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

            {/* Protein v2: protein % is an OUTPUT. There is no target column any
          more — the card reports what the candidate actually contains and
          whether that still earns the product's claim. */}
            {preview.proteinFormulation?.applicable ? (
              <div
                className="mt-3 grid grid-cols-2 gap-3 border border-ivory/15 px-3 py-2.5"
                data-testid="preview-protein-content"
              >
                <div>
                  <p className="text-[0.65rem] tracking-[0.08em] text-ivory/60 uppercase">
                    Białko po zmianie
                  </p>
                  <p
                    className="mt-1 font-mono text-sm tabular-nums text-ivory"
                    data-testid="preview-protein-actual"
                  >
                    {preview.proteinFormulation.actualPercent?.toFixed(1)}%
                  </p>
                </div>
                <div>
                  <p className="text-[0.65rem] tracking-[0.08em] text-ivory/60 uppercase">
                    Wysoka zawartość białka
                  </p>
                  <p
                    className={`mt-1 font-mono text-sm tabular-nums ${preview.proteinFormulation.qualification.qualified ? 'text-status-ideal' : 'text-status-risky'}`}
                  >
                    {preview.proteinFormulation.qualification.energySharePercent?.toFixed(0)}%
                    energii
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
                  outcome.violationsBefore === outcome.violationsAfter &&
                  residualDiagnostics.length > 0
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

            {(preview.userIntent?.material.length ?? 0) > 0 ? (
              <div
                className="mt-3 rounded-md border border-amber-300/30 bg-amber-200/5 px-3 py-2.5"
                data-testid="preview-user-intent-deviation"
              >
                <p className="text-[0.65rem] font-medium tracking-[0.08em] text-amber-100/80 uppercase">
                  {copy.preview.userIntentDeviationHeading}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-ivory/80">
                  {copy.preview.userIntentDeviationNote}
                </p>
                <div className="mt-1.5">
                  {(preview.userIntent?.material ?? []).map((deviation) => (
                    <p
                      key={deviation.lineId}
                      className="py-0.5 text-[12px] leading-relaxed text-ivory/75"
                      data-testid="preview-user-intent-deviation-line"
                    >
                      {copy.preview.userIntentDeviationLine(
                        deviation.ingredientName,
                        formatGramsPl(deviation.baselineGrams),
                        formatGramsPl(deviation.proposedGrams),
                      )}
                    </p>
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
                    {copy.preview.residualWarning(
                      formatGramsPl(Math.abs(afterBatch - targetBatch)),
                    )}
                  </p>
                ) : (
                  <p data-testid="preview-batch-ok">{copy.preview.totalsOk}</p>
                )
              ) : null}
              <p>
                {copy.preview.outOfBandDelta(preview.violationsBefore, preview.violationsAfter)}
              </p>
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
          </div>
        </details>
      ) : null}

      <div className="sticky bottom-0 -mx-3 mt-4 flex flex-col-reverse gap-2 border-t border-black/10 bg-white/95 px-3 pt-3 pb-1 backdrop-blur sm:-mx-4 sm:flex-row sm:px-4">
        {diagnostic ? (
          <button
            type="button"
            disabled
            aria-disabled="true"
            data-testid="preview-apply-disabled"
            className="inline-flex min-h-11 flex-1 cursor-not-allowed items-center justify-center rounded-[10px] border border-black/10 bg-stone-100 px-4 py-2.5 text-sm font-semibold text-black/65"
          >
            {copy.preview.applyDisabledDiagnostic}
          </button>
        ) : (
          <button
            type="button"
            onClick={onApply}
            disabled={applyPending}
            aria-busy={applyPending}
            data-testid="preview-apply"
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-[10px] bg-black px-4 py-2.5 text-sm font-semibold text-white shadow-pro-sm transition-transform hover:-translate-y-px hover:bg-charcoal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-soft disabled:cursor-wait disabled:opacity-70 disabled:hover:translate-y-0"
          >
            {applyPending ? 'Zastosowywanie…' : 'Zastosuj zmiany'}
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          data-testid="preview-cancel"
          className="inline-flex min-h-11 items-center justify-center rounded-[10px] border border-black/15 px-4 py-2.5 text-sm font-medium text-black transition-colors hover:border-black/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-soft sm:min-w-28"
        >
          Wróć
        </button>
      </div>
    </section>
  );
}
