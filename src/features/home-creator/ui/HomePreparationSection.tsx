/**
 * §SOL-040 — the last stage of the HOME journey: the customer weighs the recipe out.
 *
 * It is a checklist over the recipe the customer already has. No engine call, no durable
 * production run, no technical dashboard (§67): the grams come from the recipe lines, the wording
 * from `homeCreatorCopy.preparation`, and ticking a step is local to this screen.
 */
import { useMemo, useState } from 'react';
import type { RecipeItem } from '@/engine';
import type { RecipeToppingItem } from '@/features/recipe-composition/recipeCompositionPersistence';
import { cn } from '@/lib/cn';
import { homeCreatorCopy } from '../homeCreatorCopy';
import { homePreparationComplete, homePreparationSteps } from '../homePreparationSteps';
import { HomeSection } from './HomeSection';

export function HomePreparationSection({
  items,
  toppings,
  canSeeGrams,
  onBack,
}: {
  items: readonly RecipeItem[];
  toppings: readonly RecipeToppingItem[];
  canSeeGrams: boolean;
  onBack?: (() => void) | null;
}) {
  const steps = useMemo(() => homePreparationSteps(items, toppings), [items, toppings]);
  const [weighed, setWeighed] = useState<ReadonlySet<string>>(new Set());
  const done = homePreparationComplete(steps, weighed);
  const toggle = (lineId: string) =>
    setWeighed((current) => {
      const next = new Set(current);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  const firstTopping = steps.find((step) => step.stage === 'topping')?.lineId ?? null;

  return (
    <HomeSection id="preparation" onBack={onBack} data-testid="home-section-preparation">
      <h2 className="text-[22px] font-semibold" style={{ color: 'var(--g-ink)' }}>
        {homeCreatorCopy.preparation.title}
      </h2>
      <ul className="mt-6 flex flex-col" data-testid="home-preparation-steps">
        {steps.map((step) => (
          <li key={step.lineId}>
            {/* the add-ons go in after churning — the copy says so once, above the first one */}
            {step.lineId === firstTopping ? (
              <p
                className="mb-3 mt-6 text-[13px]"
                data-testid="home-preparation-topping-stage"
                style={{ color: 'var(--g-muted-ink)' }}
              >
                {homeCreatorCopy.preparation.toppingStage}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => toggle(step.lineId)}
              data-testid="home-preparation-step"
              data-weighed={weighed.has(step.lineId) ? 'true' : 'false'}
              aria-pressed={weighed.has(step.lineId)}
              className={cn(
                'flex min-h-[52px] w-full items-center justify-between gap-3 border-b px-1 text-left',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40',
              )}
              style={{ borderColor: 'var(--g-line)' }}
            >
              <span
                className={cn('text-[15px]', weighed.has(step.lineId) && 'line-through opacity-60')}
                style={{ color: 'var(--g-ink)' }}
              >
                {step.name}
              </span>
              <span className="text-[15px] tabular-nums" style={{ color: 'var(--g-muted-ink)' }}>
                {step.grams === null
                  ? '—'
                  : `${canSeeGrams ? Math.round(step.grams) : homeCreatorCopy.recipe.maskedGramsValue} ${homeCreatorCopy.recipe.grams}`}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {done ? (
        <p
          className="mt-8 text-[18px] font-semibold"
          data-testid="home-preparation-done"
          style={{ color: 'var(--g-ink)' }}
        >
          {homeCreatorCopy.preparation.done}
        </p>
      ) : null}
    </HomeSection>
  );
}
