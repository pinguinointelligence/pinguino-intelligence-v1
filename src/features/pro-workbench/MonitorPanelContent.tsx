/**
 * PINGÜINO Pro — the COMPLETE Monitor PI panel content (Agent M, owner B1–B6 parity).
 *
 * ONE component renders the full Monitor everywhere it appears: the always-visible
 * desktop right panel of the one-screen workbench AND the mobile bottom sheet
 * (`MonitorDrawer`). Structure (owner contract):
 *
 *  - B2 FIRST LAYER — `MonitorLiveSummary` (permanent): 1–10 score + label, status
 *    badge, truthful native/provisional/insufficient state, coverage, six quality
 *    axes, serving temperature, §20.5 TEXT statuses, one primary warning/success.
 *  - B3 DETAILED LAYER — every historical module of the pre-redesign pinned right
 *    panel, collapsible but NEVER removed: the full §14 `UserMonitorPro` (all
 *    modules forced: Zachowanie w temperaturze / Cukry / Woda / Tłuszcze / Białka /
 *    Ciała stałe / Stabilizacja+provenance / Składniki specjalne (Alkohol) / Tryb
 *    Expert), „Wartości odżywcze i koszty" (with koszt partii), „Korekty PI" and
 *    the full score card.
 *  - B4 ADVANCED — owner diagnostics (iteration count, stop reason, trajectory,
 *    band provenance, stabilizer dosage) red-marked ADVANCED via the existing
 *    `ReviewMarkedModule`; the core summary is NEVER review-marked.
 *
 * Free-Preview capability keeps the §22.1 gates: exact panels swap for the
 * decorative locked previews, the summary layer stays honest. Presentation only.
 */
import { useMemo } from 'react';
import { copy } from '@/copy/en';
import { useAccess } from '@/access/useAccess';
import type { CorrectionResult, RecipeInput, RecipeResult } from '@/engine';
import { useRecipeStore } from '@/stores/recipeStore';
import { CorrectionPanel } from '@/features/corrections/CorrectionPanel';
import { NutritionCostScorePanel } from '@/features/pi-panel/NutritionCostScorePanel';
import { OverallScoreCard } from '@/features/pi-panel/OverallScoreCard';
import { UserMonitorPro } from '@/features/user-monitor';
import { OwnerDiagnosticPanel } from '@/features/studio/OwnerDiagnosticPanel';
import { LockedNutritionPreview } from '@/features/studio/locked/LockedNutritionPreview';
import { LockedPIPreview } from '@/features/studio/locked/LockedPIPreview';
import { LockedScorePreview } from '@/features/studio/locked/LockedScorePreview';
import { ReviewMarkedModule } from '@/features/design-review/ReviewMarkedModule';
import { useSessionStore } from '@/stores/sessionStore';
import { MonitorLiveSummary } from './MonitorLiveSummary';
import { buildStabilizationProvenance } from './monitorSummaryView';

const c = copy.monitorPi;

/** One collapsible detailed section — may collapse, may NOT disappear (B3/B6:
 * native `<details>`, content always in the DOM, no height caps, no nested scroll). */
function DetailSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <details
      data-testid={`monitor-detail-${id}`}
      className="rounded-md border border-ivory/10 bg-black/20"
    >
      <summary className="cursor-pointer list-none px-3 py-2.5 text-[13px] font-medium text-ivory">
        {title}
      </summary>
      <div className="px-3 pt-1 pb-3">{children}</div>
    </details>
  );
}

export function MonitorPanelContent({
  result,
  servingTemperatureC,
  corrections,
  input,
}: {
  result: RecipeResult;
  servingTemperatureC: number;
  corrections: CorrectionResult;
  input: RecipeInput;
}) {
  const { technicalView } = useAccess();
  const mode = useRecipeStore((s) => s.mode);
  const setPlan = useSessionStore((s) => s.setPlan);
  // Internal preview only (DEV); never a subscription/payment path.
  const onUpgrade = import.meta.env.DEV ? () => setPlan('pro') : undefined;

  const stabilizationNote = useMemo(() => buildStabilizationProvenance(input), [input]);
  const recipeIncomplete =
    input.items.length === 0 ||
    input.items.reduce((sum, item) => sum + item.planned_grams, 0) <= 0.1;

  return (
    <div className="space-y-4" data-testid="monitor-panel-content">
      {/* Live provenance line — the Monitor always reads the CURRENT engine result. */}
      <p className="text-[10px] leading-relaxed tracking-[0.06em] text-ivory/60 uppercase">
        {c.liveNote}
      </p>

      {/* B2 — permanent summary layer (never collapsed, never review-marked). */}
      <MonitorLiveSummary result={result} servingTemperatureC={servingTemperatureC} />

      {/* B3 — the detailed layer: every historical module, collapsible below. */}
      <div className="border-t border-ivory/10 pt-3">
        <p className="text-[0.625rem] font-medium tracking-label text-ivory/65 uppercase">
          {c.sections.detailsTitle}
        </p>
        <div className="mt-2 space-y-2">
          <DetailSection id="monitor" title={copy.studio.secondary.modules.monitor}>
            {technicalView ? (
              <UserMonitorPro
                result={result}
                servingTemperatureC={servingTemperatureC}
                forceAllModules
                stabilizationProvenanceNote={stabilizationNote}
              />
            ) : (
              <LockedPIPreview />
            )}
          </DetailSection>

          <DetailSection id="nutrition" title={c.sections.nutrition}>
            {technicalView ? <NutritionCostScorePanel result={result} /> : <LockedNutritionPreview />}
          </DetailSection>

          <DetailSection id="corrections" title={c.sections.corrections}>
            <CorrectionPanel
              corrections={corrections}
              onUpgrade={onUpgrade}
              recipeIncomplete={recipeIncomplete}
            />
          </DetailSection>

          <DetailSection id="score" title={c.sections.score}>
            {technicalView ? <OverallScoreCard result={result} mode={mode} /> : <LockedScorePreview />}
          </DetailSection>
        </div>
      </div>

      {/* B4 — advanced diagnostics, red-marked; the summary above is never marked. */}
      <div className="border-t border-ivory/10 pt-3">
        <p className="text-[0.625rem] font-medium tracking-label text-ivory/65 uppercase">
          {c.sections.advancedTitle}
        </p>
        {/* PARITY VERIFICATION (owner addendum item 5 — Agent D, 2026-07-25): the
            diagnostic rows are `<dd class="truncate">`, authored for the pre-redesign
            full-width `max-w-4xl` column. Inside this 38 % Monitor column they were
            measurably CLIPPED — at 1366×768 „Dawka stabilizatora" rendered 540 px of
            sentence into a 224 px box (316 px, ~58 %, replaced by an ellipsis; the
            approved dosage window and the in-window verdict were exactly what was lost),
            and it still clipped 105 px at 1920×1080. That is content lost to layout,
            which the owner's Monitor contract forbids. The row markup belongs to another
            owner's component (`features/studio/OwnerDiagnosticPanel.tsx`), so the column
            that imposes the narrow width takes responsibility for it here: a
            presentation-only override that lets every value WRAP instead of being cut.
            Descendant-selector specificity (0,2,1) beats `.truncate` (0,1,0); no value,
            gating or diagnostic is added, removed or reworded. */}
        <div
          className="mt-2 [&_dd]:overflow-visible [&_dd]:text-left [&_dd]:break-words [&_dd]:whitespace-normal [&_dd]:text-clip"
          data-testid="monitor-advanced-unclipped"
        >
          {/* Iteration count, stop reason, trajectory, band/stabilizer provenance —
              the owner/QA truth panel (technicalView-gated inside; customers see nothing). */}
          <ReviewMarkedModule
            id="monitor-owner-diagnostic"
            title={copy.studio.secondary.reviewMarked.ownerDiagnostic}
            badge="ADVANCED"
            note={copy.studio.secondary.reviewMarked.ownerDiagnosticNote}
          >
            <OwnerDiagnosticPanel result={result} input={input} corrections={corrections} />
          </ReviewMarkedModule>
        </div>
      </div>
    </div>
  );
}
