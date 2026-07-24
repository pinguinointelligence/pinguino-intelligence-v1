/**
 * Owner / QA diagnostic panel (owner P0 — canonical Pro workbench).
 *
 * A compact, collapsed read-out of the REAL resolved state reaching the Engine, so the owner can
 * confirm on staging that every visible choice lands on the correct Engine input. Pro-gated
 * (technicalView) — a normal customer never sees it. It reads ONLY already-computed values from
 * the live canonical recipe store + the same `RecipeResult`/`CorrectionResult` the surface renders;
 * it runs no extra Engine call and exposes no secrets, credentials, weights or source.
 */
import { useMemo } from 'react';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { copy } from '@/copy/en';
import { useAccess } from '@/access/useAccess';
import { selectTargetBand, type CorrectionResult, type RecipeInput, type RecipeResult } from '@/engine';
import { useRecipeStore } from '@/stores/recipeStore';
import { MAX_SOLVER_ROUNDS, type IterationDiagnostics } from '@/features/constraint-studio/applyPipeline';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { buildLockReport } from '@/features/constraint-studio/recalcDiagnosis';
import { assessStabilizerDosage } from '@/features/formulation/stabilizerDosage';
import { classifyViolationBands } from '@/features/formulation/violationBands';
import { detectClassifications, type VisibleProductType } from './productType';

const d = copy.studio.diagnostic;

const isEngineReady = (input: RecipeInput['items'][number]): boolean => {
  const c = input.ingredient.composition;
  return c.solids_percent > 0 || c.water_percent > 0 || c.alcohol_percent > 0;
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <dt className="shrink-0 text-[0.7rem] tracking-label text-ivory/40 uppercase">{label}</dt>
      <dd className="min-w-0 truncate text-right font-mono text-xs text-ivory/80 tabular-nums">{value}</dd>
    </div>
  );
}

export function OwnerDiagnosticPanel({
  result,
  input,
  corrections,
}: {
  result: RecipeResult;
  input: RecipeInput;
  corrections: CorrectionResult;
}) {
  const { technicalView } = useAccess();
  const visibleProductType = useRecipeStore((s) => s.visibleProductType) as VisibleProductType;
  const servingModeId = useRecipeStore((s) => s.servingModeId);
  const constraints = useConstraintStudioStore((s) => s.constraints);
  const blocked = useConstraintStudioStore((s) => s.blocked);
  const preview = useConstraintStudioStore((s) => s.preview);
  const previewIssue = useConstraintStudioStore((s) => s.previewIssue);
  const excludedIds = useRecipeStore((s) => s.excludedIngredientIds);

  const info = useMemo(() => {
    const detected = detectClassifications(input.items);
    // Confirm the band cell resolves for this profile×temperature (read-only integrity check).
    selectTargetBand(input.category, input.target_temperature_c);
    const npac = result.indicators.find((i) => i.key === 'npac');
    const lockReport = buildLockReport(input, constraints);
    const unresolved = input.items.filter((item) => !isEngineReady(item)).map((item) => item.id);
    const detectedList = (
      [
        detected.chocolate && d.class.chocolate,
        detected.fruit && d.class.fruit,
        detected.nut && d.class.nut,
        detected.alcohol && d.class.alcohol,
      ].filter(Boolean) as string[]
    );
    // Owner P0 NIGHTLY (A9) — hard vs soft remaining violations by band
    // provenance + the profile's band source (read-only classification).
    const bands = classifyViolationBands(input);
    return {
      detectedList: detectedList.length > 0 ? detectedList.join(', ') : d.none,
      cellLabel: `${input.category} @ −${Math.abs(input.target_temperature_c)}°C (${npac?.band_status ?? '—'})`,
      fallback: npac?.temperature_fallback || npac?.category_fallback ? d.yes : d.no,
      bandSourceLabel:
        bands.bandSource === 'category_fallback'
          ? d.bandSourceCategoryFallback
          : bands.temperatureFallback
            ? d.bandSourceTemperatureFallback
            : d.bandSourceNative,
      hardViolations: bands.hardMetrics,
      softViolations: bands.softMetrics,
      lockedCount: lockReport.filter((r) => !r.adjustable).length,
      unresolved,
      optimizerCode:
        corrections.proposals.length > 0 ? d.optimizer.hasProposals : d.optimizer.noProposal,
      verification: blocked ? d.verify.blocked : preview ? d.verify.previewStaged : d.verify.idle,
    };
  }, [input, result, corrections, constraints, blocked, preview]);

  // Owner P0 NIGHTLY (A9) — formulation QA truth: role trace with exact
  // candidate ids, solver invocation proof, fallback provenance and the final
  // classification. Reads ONLY already-computed store/preview state.
  const qa = useMemo(() => {
    const roleTrace =
      preview?.formulation?.roleTrace ??
      (previewIssue?.code === 'missing_required_role' ? (previewIssue.roleTrace ?? []) : []);
    const roleTraceLabel =
      roleTrace.length > 0
        ? roleTrace
            .map(
              (row) =>
                `${row.role}→${row.outcome}` +
                (row.toolboxId ? `(${row.toolboxId}${row.mapperId ? `=${row.mapperId}` : ''})` : ''),
            )
            .join('; ')
        : d.none;
    const solverRuns =
      previewIssue && 'solverInvocations' in previewIssue && previewIssue.solverInvocations !== undefined
        ? String(previewIssue.solverInvocations)
        : preview?.autoBalance
          ? String(preview.autoBalance.solverRounds)
          : d.none;
    const fallbackInvoked =
      preview?.formulation?.localFallback === true || previewIssue?.code === 'best_safe_result'
        ? d.yes
        : d.no;
    const finalClassification = preview
      ? d.classificationPreview
      : previewIssue
        ? previewIssue.code === 'best_safe_result'
          ? d.classificationBestSafe
          : previewIssue.code
        : blocked
          ? blocked.code
          : d.classificationIdle;
    return { roleTraceLabel, solverRuns, fallbackInvoked, finalClassification };
  }, [preview, previewIssue, blocked]);

  // Owner P0 NIGHTLY (FAILURE 2 + Phase 9) — iteration diagnostics + the
  // approved stabilizer-dosage assessment. Reads ONLY already-computed
  // preview/failure state and the live input; explicit units everywhere.
  const iterationQa = useMemo(() => {
    const iteration: IterationDiagnostics | undefined =
      preview?.iteration ??
      (previewIssue && 'iteration' in previewIssue ? previewIssue.iteration : undefined);
    if (!iteration) {
      return { count: d.none, trajectory: d.none, stop: d.none };
    }
    const count =
      `${iteration.solverInvocations} / ${MAX_SOLVER_ROUNDS}` +
      (iteration.capped ? ` (${d.iterationCapReached})` : '');
    const trajectory =
      iteration.rounds.map((round) => String(round.violations)).join(' → ') +
      ' (severity ' +
      iteration.rounds.map((round) => round.severityPoints.toFixed(2)).join(' → ') +
      ')';
    const stop = iteration.stopDetail
      ? `${iteration.stopReason} (${iteration.stopDetail})`
      : iteration.stopReason;
    return { count, trajectory, stop };
  }, [preview, previewIssue]);

  const stabilizerQa = useMemo(() => {
    const assessments = assessStabilizerDosage(input);
    if (assessments.length === 0) {
      return { dosage: d.none, provenance: d.none };
    }
    const statusLabel = {
      within_window: d.stabilizerWithinWindow,
      below_window: d.stabilizerBelowWindow,
      above_window: d.stabilizerAboveWindow,
      no_approved_window: d.stabilizerNoWindow,
    } as const;
    const dosage = assessments
      .map((a) => {
        const pct = a.percentOfTotalMix === null ? '—' : `${a.percentOfTotalMix.toFixed(2)} %`;
        const window = a.window
          ? `okno ${a.window.minPercentOfTotalMix}–${a.window.maxPercentOfTotalMix} % mieszanki (${a.window.mapperId})`
          : statusLabel.no_approved_window;
        return `${a.ingredientName} ${a.grams.toFixed(2)} g = ${pct} · ${window} · ${statusLabel[a.status]}`;
      })
      .join('; ');
    // Provenance truth: a formulation preview's stabilizer amount is the
    // template-controlled seed — labelled UNRESOLVED on reference_derived
    // templates (never presented as scientifically endorsed).
    const provenance = preview?.formulation
      ? preview.formulation.templateStatus === 'reference_derived'
        ? d.stabilizerSeedUnresolved
        : d.stabilizerSeedApproved
      : d.stabilizerUserDraft;
    return { dosage, provenance };
  }, [input, preview]);

  if (!technicalView) return null;

  return (
    <details className="rounded-md border border-ivory/10 bg-ivory/[0.02] px-4 py-3" data-testid="owner-diagnostic">
      <summary className="cursor-pointer">
        <SectionLabel>{d.title}</SectionLabel>
      </summary>
      <dl className="mt-3 divide-y divide-ivory/5">
        <Row label={d.visibleType} value={copy.studio.goal.productTypes[visibleProductType]} />
        <Row label={d.internalProfile} value={input.category} />
        <Row label={d.detected} value={info.detectedList} />
        <Row label={d.qualityTier} value={copy.studio.goal.modes[input.mode].name} />
        <Row label={d.servingMode} value={servingModeId ?? d.none} />
        <Row label={d.internalTemp} value={`−${Math.abs(input.target_temperature_c)} °C`} />
        <Row label={d.bandCell} value={info.cellLabel} />
        <Row label={d.fallbackFlag} value={info.fallback} />
        <Row label={d.batch} value={`${Math.round(input.target_batch_grams)} g`} />
        <Row label={d.ingredientCount} value={String(input.items.length)} />
        <Row label={d.unresolved} value={info.unresolved.length === 0 ? '0' : info.unresolved.join(', ')} />
        <Row label={d.activeLocks} value={String(info.lockedCount)} />
        <Row label={d.engineVersion} value={result.engine_version} />
        <Row label={d.configVersion} value={result.config_version} />
        <Row label={d.optimizerResult} value={info.optimizerCode} />
        <Row label={d.verifyResult} value={info.verification} />
        {/* Owner P0 (formulation runtime) — screenshot-ready without devtools. */}
        <Row label={d.dataSource} value={d.dataSourceDraft} />
        <Row
          label={d.formulationMode}
          value={preview?.formulation ? preview.formulation.mode : previewIssue ? d.none : d.notRun}
        />
        <Row label={d.templateId} value={preview?.formulation?.templateId ?? d.none} />
        <Row
          label={d.missingRoles}
          value={
            preview?.formulation && preview.formulation.missingRoles.length > 0
              ? preview.formulation.missingRoles.join(', ')
              : d.none
          }
        />
        <Row
          label={d.addedByPi}
          value={
            preview?.formulation && preview.formulation.added.length > 0
              ? preview.formulation.added.map((a) => `${a.name} ${Math.round(a.grams)} g`).join(', ')
              : d.none
          }
        />
        <Row label={d.excluded} value={excludedIds.length > 0 ? excludedIds.join(', ') : d.none} />
        <Row
          label={d.rejectionCode}
          value={previewIssue ? previewIssue.code : blocked ? blocked.code : d.none}
        />
        {/* Owner P0 NIGHTLY (Agent A, A9) — formulation QA truth rows. */}
        <Row label={d.bandSource} value={info.bandSourceLabel} />
        <Row
          label={d.hardViolations}
          value={info.hardViolations.length > 0 ? info.hardViolations.join(', ') : d.none}
        />
        <Row
          label={d.softViolations}
          value={info.softViolations.length > 0 ? info.softViolations.join(', ') : d.none}
        />
        <Row label={d.roleTrace} value={qa.roleTraceLabel} />
        <Row label={d.solverRuns} value={qa.solverRuns} />
        <Row label={d.fallbackInvoked} value={qa.fallbackInvoked} />
        <Row label={d.finalClassification} value={qa.finalClassification} />
        {/* Owner P0 NIGHTLY (FAILURE 2) — honest iteration diagnostics. */}
        <Row label={d.iterationCount} value={iterationQa.count} />
        <Row label={d.iterationTrajectory} value={iterationQa.trajectory} />
        <Row label={d.iterationStop} value={iterationQa.stop} />
        {/* Owner Phase 9 — approved stabilizer dosage (explicit units). */}
        <Row label={d.stabilizerDosage} value={stabilizerQa.dosage} />
        <Row label={d.stabilizerDosageProvenance} value={stabilizerQa.provenance} />
      </dl>
    </details>
  );
}
