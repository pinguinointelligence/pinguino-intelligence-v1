import { useEffect, useState } from 'react';
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
import { DEFAULT_PRESET } from '@/data/demoPresets';

const { studio } = copy;

/**
 * StudioEngineSurface — the live Studio lab body (goal + calculator + engine rail),
 * extracted verbatim from StudioPage so the SAME real engine surface can be hosted by
 * both `/studio` (its own dark page header) and the `/pro` workspace Receptura tab
 * (S3). No engine math or gating lives here — it reads the deterministic engine result
 * and gates exact panels on `useAccess` (Free Preview → decorative locked previews are
 * mounted instead of the real panels; §22.1 Demo never receives full grams).
 */
export function StudioEngineSurface({ forceDemo = false }: { forceDemo?: boolean }) {
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
    <main className="mx-auto max-w-6xl px-6 pt-6 pb-24">
      <div className="flex flex-col gap-5 border-b border-ivory/10 pb-6">
        <div className="flex flex-col gap-2">
          <SectionLabel>
            {studio.eyebrow} · {route.main}
          </SectionLabel>
          {route.detail ? (
            <p className="text-[11px] leading-none text-ivory/40" data-testid="engine-route-detail">
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
        </div>
        {/* Owner/QA diagnostic — the real resolved state reaching the Engine (staging Pro only). */}
        <OwnerDiagnosticPanel result={result} input={input} corrections={corrections} />
        {/* QA/demo scenarios are an internal tool (owner P0): never the default owner workspace —
            dev builds only, dead-code-eliminated from production. */}
        {import.meta.env.DEV ? <PresetSelector /> : null}
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_minmax(380px,420px)]">
        {/* Left: goal (always interactive) + the calculator (Pro-gated, do-not-mount) */}
        <div className="space-y-6">
          <GoalSetup />
          {fullFormula ? (
            <>
              <IngredientBuilder
                items={result.items}
                totalBatchG={result.total_batch_g}
                targetBatchG={batchGrams}
                demo={forceDemo}
              />
              {/* UIUX Slice E (§17–§20): locks, Preview→verify-gated Apply,
                  §18 feasibility honesty, history/Undo/Explain. Exact-gram
                  surface — mounted only with fullFormula (§22.1: Demo never
                  receives full grams). */}
              <ConstraintStudioSection />
            </>
          ) : (
            <LockedCalculatorPreview />
          )}
        </div>

        {/* Right: live engine output (sticky lab rail). technicalView gates the
            exact panels — Free Preview gets decorative locked previews instead
            (real panels + RecipeResult are never mounted). */}
        <div className="space-y-6 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto lg:pr-1">
          {technicalView ? <OverallScoreCard result={result} mode={mode} /> : <LockedScorePreview />}
          {/* Monitor Pro (§14): modular UserMonitorLayout panel — summary cards,
              collapsible modules with §14.4 friendly names, pin/toggle/reset.
              Replaces the flat 11-bar PIPanel wall (audit #15); the original
              technical table vocabulary lives on in its Expert module. */}
          {technicalView ? (
            <UserMonitorPro result={result} servingTemperatureC={temperatureC} />
          ) : (
            <LockedPIPreview />
          )}
          {technicalView ? <NutritionCostScorePanel result={result} /> : <LockedNutritionPreview />}
          <CorrectionPanel corrections={corrections} onUpgrade={onUpgrade} />

          {/* Owner P0 (canonical workbench): the assistant / flow-guide / optimization-preview /
              IF9-IF10 branch tools are SECONDARY diagnostics — clearly separated in a collapsed
              „Narzędzia zaawansowane" section so the normal workbench is the goal + ingredients +
              Monitor + corrections + the TOP „Przelicz z PI". None of them mutates the recipe. */}
          <details className="border-t border-ivory/10 pt-6" data-testid="pro-advanced-tools">
            <summary className="cursor-pointer">
              <SectionLabel>{studio.advancedTools.title}</SectionLabel>
            </summary>
            <p className="mt-1 text-xs leading-relaxed text-ivory/40">{studio.advancedTools.note}</p>

            <div className="mt-4 space-y-6">
              {/* Conversational Assistant Shell (PL-first, deterministic): read-only intent draft. */}
              <StudioAssistantShell />

              {/* User-Flow guidance layer (PL-first, read-only): explains the current situation. */}
              <StudioFlowGuidePanel view={optimizationView} />

              {/* Production optimization preview (Slice 15): real solver + Base Engine rerun on the
                  LIVE recipe on explicit click. Pure preview — never saves/applies/persists/mutates. */}
              <div className="space-y-3">
                <div className="flex flex-col gap-1">
                  <SectionLabel>{studio.optimization.title}</SectionLabel>
                  <p className="text-xs leading-relaxed text-ivory/40">
                    {studio.optimization.note}
                    {!exactCorrectionGrams ? ` ${studio.optimization.proOnly}` : ''}
                  </p>
                </div>
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

              {/* IF9/IF10 branch previews (Slice 21): paid-gated, explicit-click, non-persisted. */}
              <BranchWorkflowPreviews
                recipe={input}
                capabilities={{ exactCorrectionGrams, technicalView }}
              />
            </div>
          </details>
        </div>
      </div>
    </main>
  );
}
