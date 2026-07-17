import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { IvoryLogoMark } from '@/components/shared/IvoryLogoMark';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { StatusChip } from '@/components/shared/StatusChip';
import { SurfaceToneContext } from '@/components/ui/surface';
import { copy } from '@/copy/en';
import { useAccess } from '@/access/useAccess';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { useAuthStore } from '@/stores/authStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { SaveRecipeDialog } from '@/features/recipes/SaveRecipeDialog';
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
import { PIPanel } from '@/features/pi-panel/PIPanel';
import { PresetSelector } from '@/features/studio/PresetSelector';
import { StudioModeToggle } from '@/features/studio/StudioModeToggle';
import { StudioSummary } from '@/features/studio/StudioSummary';
import { useStudioResult } from '@/features/studio/useStudioResult';
import { LockedCalculatorPreview } from '@/features/studio/locked/LockedCalculatorPreview';
import { LockedNutritionPreview } from '@/features/studio/locked/LockedNutritionPreview';
import { LockedPIPreview } from '@/features/studio/locked/LockedPIPreview';
import { LockedScorePreview } from '@/features/studio/locked/LockedScorePreview';
import { DEFAULT_PRESET } from '@/data/demoPresets';

const { studio } = copy;

export function StudioPage({ forceDemo = false }: { forceDemo?: boolean }) {
  const setPlan = useSessionStore((state) => state.setPlan);
  const loadPreset = useRecipeStore((state) => state.loadPreset);
  // Free Preview (demo/free) locks exact values; Pro unlocks the full calculator + panels.
  const { plan, fullFormula, technicalView, exactCorrectionGrams } = useAccess();
  const { result, corrections, input } = useStudioResult();
  // Production optimization preview (Slice 15) — computed on explicit click, never persisted.
  const [optimizationView, setOptimizationView] = useState<OptimizationPreviewView | null>(null);

  const mode = useRecipeStore((state) => state.mode);
  const category = useRecipeStore((state) => state.category);
  const temperatureC = useRecipeStore((state) => state.target_temperature_c);
  const batchGrams = useRecipeStore((state) => state.target_batch_grams);

  const authStatus = useAuthStore((state) => state.status);
  const openAuthModal = useAuthModalStore((state) => state.open);
  const [saveOpen, setSaveOpen] = useState(false);

  // Anonymous users are prompted to sign in; signed-in users get the save dialog.
  const onSaveClick = () => {
    if (authStatus === 'authed') setSaveOpen(true);
    else openAuthModal();
  };

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
    <SurfaceToneContext.Provider value="shell">
      <div className="min-h-screen bg-shell text-ivory [color-scheme:dark]">
        <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-6">
          <Link to="/" className="flex items-center gap-3">
            <IvoryLogoMark size={24} tone="ivory" />
            <span className="text-sm font-light tracking-wordmark">{copy.brand.name}</span>
          </Link>
          <div className="flex items-center gap-4">
            <StatusChip status={plan} />
            <StudioModeToggle />
            <button
              type="button"
              onClick={onSaveClick}
              className="inline-flex items-center justify-center rounded-md border border-ivory/20 px-5 py-2.5 text-sm font-medium text-ivory transition-colors hover:border-ivory/40"
            >
              {copy.recipes.save}
            </button>
            <Link
              to="/"
              className="text-sm text-ivory/60 underline decoration-ivory/25 underline-offset-4 transition-colors hover:text-ivory"
            >
              {studio.back}
            </Link>
          </div>
        </header>

        {/* The save dialog is a white modal — keep it on the paper tone. */}
        {saveOpen ? (
          <SurfaceToneContext.Provider value="paper">
            <SaveRecipeDialog onClose={() => setSaveOpen(false)} />
          </SurfaceToneContext.Provider>
        ) : null}

        <main className="mx-auto max-w-6xl px-6 pt-6 pb-24">
          <div className="flex flex-col gap-5 border-b border-ivory/10 pb-6">
            <div className="flex flex-col gap-2">
              <SectionLabel>
                {studio.eyebrow} · {studio.engineTag}
              </SectionLabel>
              <StudioSummary
                mode={mode}
                category={category}
                temperatureC={temperatureC}
                batchGrams={batchGrams}
              />
            </div>
            <PresetSelector />
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
              {technicalView ? <PIPanel result={result} /> : <LockedPIPreview />}
              {technicalView ? <NutritionCostScorePanel result={result} /> : <LockedNutritionPreview />}
              <CorrectionPanel corrections={corrections} onUpgrade={onUpgrade} />

              {/* Conversational Assistant Shell (PL-first, deterministic): collects
                  recipe intent through the locked question script and builds a read-only
                  intent draft. No LLM, no persistence, no recipe mutation. */}
              <StudioAssistantShell />

              {/* User-Flow guidance layer (PL-first, read-only): explains the current
                  situation from existing state — no saves, no applies, no auto-actions. */}
              <StudioFlowGuidePanel view={optimizationView} />

              {/* Production optimization preview (Slice 15): runs the real solver + Base Engine rerun
                  on the LIVE recipe when the user clicks. Capability-gated (demo/free redacted, Pro full
                  grams + before/after); the DEV debug trace stays gated to dev builds via
                  `{ dev: import.meta.env.DEV }`. Pure preview — it NEVER saves, applies, persists, or
                  mutates the recipe, and the global engine target bands are unchanged. */}
              <div className="space-y-3 border-t border-ivory/10 pt-6">
                <div className="flex flex-col gap-1">
                  <SectionLabel>Optimization preview</SectionLabel>
                  <p className="text-xs leading-relaxed text-ivory/40">
                    Preview only — nothing is saved and corrections are not applied automatically. Engine
                    target bands are temperature-aware; the regulator-shadow comparison remains available.
                    {!exactCorrectionGrams ? ' Exact grams available on Pro.' : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setOptimizationView(previewOptimization({ recipe: input, intent: studioIntentFromRecipe(input) }))
                  }
                  className="inline-flex w-full items-center justify-center rounded-md border border-ivory/20 px-4 py-2.5 text-sm font-medium text-ivory transition-colors hover:border-ivory/40"
                >
                  Preview optimization
                </button>
                {optimizationView ? (
                  <>
                    <OptimizationPreviewPanel
                      view={optimizationView}
                      policy={optimizationDisplayPolicy({ exactCorrectionGrams, technicalView }, { dev: import.meta.env.DEV })}
                    />
                    {/* Slice 24 — the FIRST write control: signed-in Pro may persist an
                        accepted correction as ONE immutable audit record (unsigned users
                        see a sign-in note; signed-in Free sees nothing). Explicit click
                        only; the recipe itself is never changed. */}
                    <SaveCorrectionControl view={optimizationView} recipe={input} />
                  </>
                ) : null}
              </div>

              {/* IF9/IF10 branch previews (Slice 21): paid-gated, explicit-click, local
                  non-persisted inputs, redacted by plan. Preview only — nothing is
                  applied, no inventory is changed, no recipe is saved. */}
              <BranchWorkflowPreviews
                recipe={input}
                capabilities={{ exactCorrectionGrams, technicalView }}
              />
            </div>
          </div>
        </main>
      </div>
    </SurfaceToneContext.Provider>
  );
}
