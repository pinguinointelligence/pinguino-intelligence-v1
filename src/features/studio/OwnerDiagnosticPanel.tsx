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
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { buildLockReport } from '@/features/constraint-studio/recalcDiagnosis';
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
    return {
      detectedList: detectedList.length > 0 ? detectedList.join(', ') : d.none,
      cellLabel: `${input.category} @ −${Math.abs(input.target_temperature_c)}°C (${npac?.band_status ?? '—'})`,
      fallback: npac?.temperature_fallback || npac?.category_fallback ? d.yes : d.no,
      lockedCount: lockReport.filter((r) => !r.adjustable).length,
      unresolved,
      optimizerCode:
        corrections.proposals.length > 0 ? d.optimizer.hasProposals : d.optimizer.noProposal,
      verification: blocked ? d.verify.blocked : preview ? d.verify.previewStaged : d.verify.idle,
    };
  }, [input, result, corrections, constraints, blocked, preview]);

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
      </dl>
    </details>
  );
}
