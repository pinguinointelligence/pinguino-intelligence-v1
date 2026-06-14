import { useEffect } from 'react';
import { Link } from 'react-router';
import { IvoryLogoMark } from '@/components/shared/IvoryLogoMark';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { StatusChip } from '@/components/shared/StatusChip';
import { copy } from '@/copy/en';
import { useAccess } from '@/access/useAccess';
import { useSessionStore } from '@/stores/sessionStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { CorrectionPanel } from '@/features/corrections/CorrectionPanel';
import { GoalSetup } from '@/features/recipe-goal/GoalSetup';
import { IngredientBuilder } from '@/features/ingredient-builder/IngredientBuilder';
import { NutritionCostScorePanel } from '@/features/pi-panel/NutritionCostScorePanel';
import { OverallScoreCard } from '@/features/pi-panel/OverallScoreCard';
import { PIPanel } from '@/features/pi-panel/PIPanel';
import { PresetSelector } from '@/features/studio/PresetSelector';
import { StudioModeToggle } from '@/features/studio/StudioModeToggle';
import { StudioSummary } from '@/features/studio/StudioSummary';
import { useStudioResult } from '@/features/studio/useStudioResult';
import { DEFAULT_PRESET } from '@/data/demoPresets';

const { studio } = copy;

export function StudioPage({ forceDemo = false }: { forceDemo?: boolean }) {
  const setPlan = useSessionStore((state) => state.setPlan);
  const loadPreset = useRecipeStore((state) => state.loadPreset);
  const { plan } = useAccess();
  const { result, corrections } = useStudioResult();

  const mode = useRecipeStore((state) => state.mode);
  const category = useRecipeStore((state) => state.category);
  const temperatureC = useRecipeStore((state) => state.target_temperature_c);
  const batchGrams = useRecipeStore((state) => state.target_batch_grams);

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
    <div className="min-h-screen bg-paper text-ink">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-6">
        <Link to="/" className="flex items-center gap-3">
          <IvoryLogoMark size={24} tone="ink" />
          <span className="text-sm font-light tracking-wordmark">{copy.brand.name}</span>
        </Link>
        <div className="flex items-center gap-4">
          <StatusChip status={plan} />
          <StudioModeToggle />
          <Link
            to="/"
            className="text-sm text-stone-600 underline decoration-stone-300 underline-offset-4 transition-colors hover:text-ink"
          >
            {studio.back}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pt-6 pb-24">
        <div className="flex flex-col gap-5 border-b border-ink/5 pb-6">
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
          {/* Left: goal + ingredient builder */}
          <div className="space-y-6">
            <GoalSetup />
            <IngredientBuilder
              items={result.items}
              totalBatchG={result.total_batch_g}
              targetBatchG={batchGrams}
            />
          </div>

          {/* Right: live engine output (sticky, self-scrolling lab rail) */}
          <div className="space-y-6 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto lg:pr-1">
            <OverallScoreCard result={result} mode={mode} />
            <PIPanel result={result} />
            <NutritionCostScorePanel result={result} />
            <CorrectionPanel corrections={corrections} onUpgrade={onUpgrade} />
          </div>
        </div>
      </main>
    </div>
  );
}
