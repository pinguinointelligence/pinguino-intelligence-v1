import { useEffect } from 'react';
import { Link } from 'react-router';
import { IvoryLogoMark } from '@/components/shared/IvoryLogoMark';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { StatusChip } from '@/components/shared/StatusChip';
import { copy } from '@/copy/en';
import { useAccess } from '@/access/useAccess';
import { useSessionStore } from '@/stores/sessionStore';
import { CorrectionPanel } from '@/features/corrections/CorrectionPanel';
import { GoalSetup } from '@/features/recipe-goal/GoalSetup';
import { IngredientBuilder } from '@/features/ingredient-builder/IngredientBuilder';
import { NutritionCostScorePanel } from '@/features/pi-panel/NutritionCostScorePanel';
import { PIPanel } from '@/features/pi-panel/PIPanel';
import { StudioModeToggle } from '@/features/studio/StudioModeToggle';
import { useStudioResult } from '@/features/studio/useStudioResult';

const { studio } = copy;

export function StudioPage({ forceDemo = false }: { forceDemo?: boolean }) {
  const setPlan = useSessionStore((state) => state.setPlan);
  const { plan } = useAccess();
  const { result, corrections } = useStudioResult();

  // The public /demo entry is always a demo session.
  useEffect(() => {
    if (forceDemo) setPlan('demo');
  }, [forceDemo, setPlan]);

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
        <SectionLabel>{studio.eyebrow}</SectionLabel>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_minmax(360px,400px)]">
          {/* Left: goal + ingredient builder */}
          <div className="space-y-6">
            <GoalSetup />
            <IngredientBuilder items={result.items} totalBatchG={result.total_batch_g} />
          </div>

          {/* Right: live engine output (sticky lab rail) */}
          <div className="space-y-6 lg:sticky lg:top-6">
            <PIPanel result={result} />
            <NutritionCostScorePanel result={result} />
            <CorrectionPanel corrections={corrections} onUpgrade={onUpgrade} />
          </div>
        </div>
      </main>
    </div>
  );
}
