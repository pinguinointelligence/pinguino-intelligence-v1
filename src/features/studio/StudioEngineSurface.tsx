import { useEffect, useState, type ReactNode } from 'react';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { copy } from '@/copy/en';
import { useAccess } from '@/access/useAccess';
import { useSessionStore } from '@/stores/sessionStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { CorrectionPanel } from '@/features/corrections/CorrectionPanel';
import { BranchWorkflowPreviews } from '@/features/optimization/BranchWorkflowPreviews';
import { OptimizationPreviewPanel } from '@/features/optimization/OptimizationPreviewPanel';
import { SaveCorrectionControl } from '@/features/optimization/SaveCorrectionControl';
import { StudioFlowGuidePanel } from '@/features/studioFlow/StudioFlowGuidePanel';
import { StudioAssistantShell } from '@/features/studioFlow/StudioAssistantShell';
import { optimizationDisplayPolicy } from '@/features/optimization/optimizationPreviewPolicy';
import {
  previewOptimization,
  studioIntentFromRecipe,
  type OptimizationPreviewView,
} from '@/features/optimization/optimizationPreviewRunner';
import { GoalSetup } from '@/features/recipe-goal/GoalSetup';
import { ConstraintStudioSection } from '@/features/constraint-studio';
import { IngredientBuilder } from '@/features/ingredient-builder/IngredientBuilder';
import { NutritionCostScorePanel } from '@/features/pi-panel/NutritionCostScorePanel';
import { OverallScoreCard } from '@/features/pi-panel/OverallScoreCard';
import { UserMonitorPro } from '@/features/user-monitor';
import { PresetSelector } from '@/features/studio/PresetSelector';
import { engineRouteLabel } from '@/features/studio/engineRouteLabel';
import { OwnerDiagnosticPanel } from '@/features/studio/OwnerDiagnosticPanel';
import { StudioSummary } from '@/features/studio/StudioSummary';
import { useStudioResult } from '@/features/studio/useStudioResult';
import { LockedCalculatorPreview } from '@/features/studio/locked/LockedCalculatorPreview';
import { LockedNutritionPreview } from '@/features/studio/locked/LockedNutritionPreview';
import { LockedPIPreview } from '@/features/studio/locked/LockedPIPreview';
import { LockedScorePreview } from '@/features/studio/locked/LockedScorePreview';
import { ReviewMarkedModule } from '@/features/design-review/ReviewMarkedModule';
import { DEFAULT_PRESET } from '@/data/demoPresets';

const { studio } = copy;

/** One calm collapsed module of the SECONDARY section (core analysis — no red mark). */
function SecondaryModule({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <details
      data-testid={`secondary-module-${id}`}
      className="rounded-md border border-ivory/10"
    >
      <summary className="cursor-pointer list-none px-4 py-3 text-[13px] font-medium text-ivory">
        {title}
      </summary>
      <div className="px-4 pt-1 pb-4">{children}</div>
    </details>
  );
}

/**
 * StudioEngineSurface — the live Studio lab body (goal + calculator + engine rail),
 * extracted verbatim from StudioPage so the SAME real engine surface can be hosted by
 * both `/studio` (its own dark page header) and the `/pro` workspace Receptura tab
 * (S3). No engine math or gating lives here — it reads the deterministic engine result
 * and gates exact panels on `useAccess` (Free Preview → decorative locked previews are
 * mounted instead of the real panels; §22.1 Demo never receives full grams).
 */
export function StudioEngineSurface({
  forceDemo = false,
  onRecalc,
  recalcSlot,
}: {
  forceDemo?: boolean;
  /** Pro workspace: the in-flow „Przelicz z PI" trigger (same canonical pipeline as the workbar). */
  onRecalc?: () => void;
  /** Pro workspace: the Preview → Zastosuj/Anuluj → Cofnij panel, rendered IN the primary path. */
  recalcSlot?: ReactNode;
}) {
  const setPlan = useSessionStore((state) => state.setPlan);
  const loadPreset = useRecipeStore((state) => state.loadPreset);
  const { fullFormula, technicalView, exactCorrectionGrams } = useAccess();
  const { result, corrections, input } = useStudioResult();
  // Production optimization preview (Slice 15) — computed on explicit click, never persisted.
  const [optimizationView, setOptimizationView] = useState<OptimizationPreviewView | null>(null);

  const mode = useRecipeStore((state) => state.mode);
  const temperatureC = useRecipeStore((state) => state.target_temperature_c);
  const batchGrams = useRecipeStore((state) => state.target_batch_grams);
  const servingModeId = useRecipeStore((state) => state.servingModeId);
  const visibleProductType = useRecipeStore((state) => state.visibleProductType);

  // The header derives from the CURRENT resolved Engine route (owner P0 temperature contract) —
  // never a hardcoded engine name. Same store values buildRecipeInput hands to calculateRecipe.
  const route = engineRouteLabel(servingModeId, temperatureC);

  // The public /demo entry is always a demo session that cold-opens the curated
  // default scenario; /studio (forceDemo=false) preserves persisted edits.
  useEffect(() => {
    if (forceDemo) {
      setPlan('demo');
      loadPreset(DEFAULT_PRESET);
    }
  }, [forceDemo, setPlan, loadPreset]);

  // Internal preview only (DEV); never a subscription/payment path.
  const onUpgrade = import.meta.env.DEV ? () => setPlan('pro') : undefined;

  return (
    <main className="mx-auto max-w-4xl px-6 pt-6 pb-24">
      {/* Compact identity/context header — never a competing panel. */}
      <div className="flex flex-col gap-2 border-b border-ivory/10 pb-5">
        <SectionLabel>
          {studio.eyebrow} · {route.main}
        </SectionLabel>
        {route.detail ? (
          <p className="text-[11px] leading-none text-ivory/60" data-testid="engine-route-detail">
            {route.detail}
          </p>
        ) : null}
        <StudioSummary
          mode={mode}
          visibleProductType={visibleProductType}
          servingModeId={servingModeId}
          temperatureC={temperatureC}
          batchGrams={batchGrams}
        />
        {/* QA/demo scenarios are an internal tool (owner P0): never the default owner workspace —
            dev builds only, dead-code-eliminated from production. */}
        {import.meta.env.DEV ? <PresetSelector /> : null}
      </div>

      {/* ── PRIMARY PATH (owner P0 UX repair, 2026-07-24) — ONE top-to-bottom column:
          core setup → ingredients (hero) → Przelicz z PI → Preview → Zastosuj → save
          (save lives in the sticky workbar). No side rail competing for attention. ── */}
      <div className="mt-6 space-y-6" data-testid="pro-primary-flow">
        <GoalSetup />
        {fullFormula ? (
          <>
            <IngredientBuilder
              items={result.items}
              totalBatchG={result.total_batch_g}
              targetBatchG={batchGrams}
              demo={forceDemo}
            />
            {/* The in-flow „Przelicz z PI" — the SAME canonical pipeline the workbar
                triggers (no second optimizer); rendered only when the host wires it. */}
            {onRecalc ? (
              <button
                type="button"
                onClick={onRecalc}
                data-testid="pro-flow-recalc"
                className="inline-flex w-full items-center justify-center rounded-md bg-ink px-4 py-3 text-sm font-medium text-paper transition-colors hover:bg-ink-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
              >
                {copy.proWorkbar.recalc}
              </button>
            ) : null}
            {/* Preview → Zastosuj zmiany / Anuluj → Cofnij — IN the primary path. */}
            {recalcSlot}
          </>
        ) : (
          <LockedCalculatorPreview />
        )}
      </div>

      {/* ── SECONDARY — ONE calm section, collapsed by default: analysis modules
          (score / Monitor / nutrition / corrections) + red-marked modules awaiting
          the owner's review. Nothing removed, nothing hidden — only calmer. ── */}
      <section
        className="mt-10 border-t border-ivory/10 pt-6"
        data-testid="pro-secondary-section"
        aria-label={studio.secondary.title}
      >
        <SectionLabel>{studio.secondary.title}</SectionLabel>
        <p className="mt-1 text-xs leading-relaxed text-ivory/60">{studio.secondary.note}</p>

        <div className="mt-4 space-y-3">
          {/* Core analysis modules — calm, collapsed; technicalView gates the exact
              panels (Free Preview mounts decorative locked previews instead — §22.1). */}
          <SecondaryModule id="score" title={studio.secondary.modules.score}>
            {technicalView ? <OverallScoreCard result={result} mode={mode} /> : <LockedScorePreview />}
          </SecondaryModule>
          {/* Monitor Pro (§14): modular UserMonitorLayout panel — summary cards,
              collapsible modules with §14.4 friendly names, pin/toggle/reset. */}
          <SecondaryModule id="monitor" title={studio.secondary.modules.monitor}>
            {technicalView ? (
              <UserMonitorPro result={result} servingTemperatureC={temperatureC} />
            ) : (
              <LockedPIPreview />
            )}
          </SecondaryModule>
          <SecondaryModule id="nutrition" title={studio.secondary.modules.nutrition}>
            {technicalView ? <NutritionCostScorePanel result={result} /> : <LockedNutritionPreview />}
          </SecondaryModule>
          <SecondaryModule id="corrections" title={studio.secondary.modules.corrections}>
            <CorrectionPanel
              corrections={corrections}
              onUpgrade={onUpgrade}
              recipeIncomplete={
                input.items.length === 0 ||
                input.items.reduce((sum, item) => sum + item.planned_grams, 0) <= 0.1
              }
            />
          </SecondaryModule>

          {/* UIUX Slice E (§17–§20): locks, Preview→verify-gated Apply, §18 feasibility
              honesty, history/Undo/Explain — legacy Studio tools, red-marked for the
              owner's review. Exact-gram surface — mounted only with fullFormula
              (§22.1: Demo never receives full grams). */}
          {fullFormula ? (
            <ReviewMarkedModule
              id="studio-tools"
              title={studio.secondary.reviewMarked.studioTools}
              badge="DO PRZEGLĄDU"
              note={studio.secondary.reviewMarked.studioToolsNote}
            >
              <ConstraintStudioSection />
            </ReviewMarkedModule>
          ) : null}

          {/* Conversational Assistant Shell (PL-first, deterministic): read-only intent draft. */}
          <ReviewMarkedModule
            id="assistant"
            title={studio.secondary.reviewMarked.assistant}
            badge="OPCJONALNE"
          >
            <StudioAssistantShell />
          </ReviewMarkedModule>

          {/* User-Flow guidance layer (PL-first, read-only): explains the current situation. */}
          <ReviewMarkedModule
            id="flow-guide"
            title={studio.secondary.reviewMarked.flowGuide}
            badge="OPCJONALNE"
          >
            <StudioFlowGuidePanel view={optimizationView} />
          </ReviewMarkedModule>

          {/* Production optimization preview (Slice 15): real solver + Base Engine rerun on the
              LIVE recipe on explicit click. Pure preview — never saves/applies/persists/mutates. */}
          <ReviewMarkedModule
            id="optimization"
            title={studio.secondary.reviewMarked.optimization}
            badge="OPCJONALNE"
            note={studio.secondary.reviewMarked.optimizationNote}
          >
            <div className="space-y-3">
              <p className="text-xs leading-relaxed text-ivory/60">
                {studio.optimization.note}
                {!exactCorrectionGrams ? ` ${studio.optimization.proOnly}` : ''}
              </p>
              <button
                type="button"
                onClick={() =>
                  setOptimizationView(previewOptimization({ recipe: input, intent: studioIntentFromRecipe(input) }))
                }
                className="inline-flex w-full items-center justify-center rounded-md border border-ivory/20 px-4 py-2.5 text-sm font-medium text-ivory transition-colors hover:border-ivory/40"
              >
                {studio.optimization.run}
              </button>
              {optimizationView ? (
                <>
                  <OptimizationPreviewPanel
                    view={optimizationView}
                    policy={optimizationDisplayPolicy({ exactCorrectionGrams, technicalView }, { dev: import.meta.env.DEV })}
                  />
                  {/* Slice 24 — the FIRST write control: signed-in Pro may persist an accepted
                      correction as ONE immutable audit record. Explicit click; recipe never changed. */}
                  <SaveCorrectionControl view={optimizationView} recipe={input} />
                </>
              ) : null}
            </div>
          </ReviewMarkedModule>

          {/* IF9/IF10 branch previews (Slice 21): Batch Rescue + Stock Shortage —
              paid-gated, explicit-click, non-persisted. */}
          <ReviewMarkedModule
            id="branch-previews"
            title={studio.secondary.reviewMarked.branchPreviews}
            badge="ADVANCED / REVIEW"
            note={studio.secondary.reviewMarked.branchPreviewsNote}
          >
            <BranchWorkflowPreviews
              recipe={input}
              capabilities={{ exactCorrectionGrams, technicalView }}
            />
          </ReviewMarkedModule>

          {/* Owner/QA diagnostic — the real resolved state reaching the Engine
              (technicalView-gated inside; renders nothing for customers). */}
          <ReviewMarkedModule
            id="owner-diagnostic"
            title={studio.secondary.reviewMarked.ownerDiagnostic}
            badge="ADVANCED"
            note={studio.secondary.reviewMarked.ownerDiagnosticNote}
          >
            <OwnerDiagnosticPanel result={result} input={input} corrections={corrections} />
          </ReviewMarkedModule>
        </div>
      </section>
    </main>
  );
}
