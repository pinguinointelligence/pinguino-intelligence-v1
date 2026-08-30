/**
 * §52–§62 — the live HOME recipe.
 *
 * WHAT IS DELIBERATELY ABSENT (§52): percentages, PI-ING codes, product ids, POD/PAC/
 * NPAC, solids, kcal, cost, supplier and regulatory data. None of those values is read
 * by this component — they are not hidden with CSS, they never enter the render.
 *
 * §54: a Demo line shows `🔒 ••• g`. The masked string is a constant with no digits in
 * it (pinned by a copy test), so there is no code path that could leak a real gram
 * through the placeholder.
 */
import { useState } from 'react';
import { cn } from '@/lib/cn';
import type { RecipeItem } from '@/engine';
import type { RecipeToppingItem } from '@/features/recipe-composition/recipeCompositionPersistence';
import type { RecipeMatchScorePresentation } from '@/features/recipe-score';
import { homeCreatorCopy } from '../homeCreatorCopy';
import {
  HOME_SWEETNESS_ORDER,
  projectSweetnessForDisplay,
  type HomeSweetness,
} from '../homeSweetness';
import { HomeSection } from './HomeSection';

const SWEETNESS_LABEL: Readonly<Record<HomeSweetness, string>> = {
  less: homeCreatorCopy.sweetness.less,
  balanced: homeCreatorCopy.sweetness.balanced,
  sweeter: homeCreatorCopy.sweetness.sweeter,
};

function GramCell({ grams, canSeeGrams }: { grams: number; canSeeGrams: boolean }) {
  if (!canSeeGrams) {
    return (
      <span
        className="font-mono text-[14px]"
        data-testid="home-masked-grams"
        aria-label={homeCreatorCopy.recipe.maskedGramsLabel}
        style={{ color: 'var(--g-lock)' }}
      >
        🔒 {homeCreatorCopy.recipe.maskedGrams}
      </span>
    );
  }
  return (
    <span className="font-mono text-[14px]" style={{ color: 'var(--g-ink)' }}>
      {Math.round(grams)} {homeCreatorCopy.recipe.grams}
    </span>
  );
}

function RowMenu({
  onRemove,
  onSubstitute,
  onUnavailable,
}: {
  onRemove: () => void;
  onSubstitute?: () => void;
  onUnavailable?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label={homeCreatorCopy.recipe.rowMenu}
        aria-expanded={open}
        data-testid="home-row-menu"
        onClick={() => setOpen((value) => !value)}
        className="flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
        style={{ color: 'var(--g-menu-dots)' }}
      >
        <svg width="16" height="4" viewBox="0 0 16 4" aria-hidden="true">
          <circle cx="2" cy="2" r="1.6" fill="currentColor" />
          <circle cx="8" cy="2" r="1.6" fill="currentColor" />
          <circle cx="14" cy="2" r="1.6" fill="currentColor" />
        </svg>
      </button>
      {open ? (
        <div
          className="absolute right-0 top-11 z-20 min-w-[210px] overflow-hidden rounded-[10px] border shadow-sm"
          style={{ borderColor: 'var(--g-line)', background: '#ffffff' }}
          data-testid="home-row-menu-panel"
        >
          {onSubstitute ? (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onSubstitute();
              }}
              className="block w-full px-4 py-3 text-left text-[14px] hover:bg-black/[0.04]"
              style={{ color: 'var(--g-ink)' }}
            >
              {homeCreatorCopy.recipe.findSubstitute}
            </button>
          ) : null}
          {onUnavailable ? (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onUnavailable();
              }}
              className="block w-full px-4 py-3 text-left text-[14px] hover:bg-black/[0.04]"
              style={{ color: 'var(--g-ink)' }}
            >
              {homeCreatorCopy.recipe.dontHaveThis}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onRemove();
            }}
            className="block w-full px-4 py-3 text-left text-[14px] hover:bg-black/[0.04]"
            style={{ color: 'var(--g-ink)' }}
          >
            {homeCreatorCopy.recipe.remove}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function HomeRecipeSection({
  name,
  onNameChange,
  score,
  machineLine,
  items,
  toppings,
  crownLineIds,
  canSeeGrams,
  sweetnessStored,
  onSweetness,
  onRemoveItem,
  onSubstitute,
  onUnavailable,
  onAddIngredient,
  onAddTopping,
  onSave,
  onLetsMakeIt,
  onShare,
  canShare,
  onBack,
}: {
  name: string;
  onNameChange: (name: string) => void;
  score: RecipeMatchScorePresentation;
  machineLine: string;
  items: readonly RecipeItem[];
  toppings: readonly RecipeToppingItem[];
  crownLineIds: readonly string[];
  canSeeGrams: boolean;
  sweetnessStored: number;
  onSweetness: (choice: HomeSweetness) => void;
  onRemoveItem: (lineId: string) => void;
  onSubstitute: (lineId: string) => void;
  onUnavailable: (lineId: string) => void;
  onAddIngredient: () => void;
  onAddTopping: () => void;
  onSave: () => void;
  onLetsMakeIt: () => void;
  onShare: () => void;
  canShare: boolean;
  onBack?: (() => void) | null;
}) {
  const activeSweetness = projectSweetnessForDisplay(sweetnessStored as -2 | -1 | 0 | 1 | 2);

  return (
    <HomeSection id="recipe" onBack={onBack} fill={false} data-testid="home-section-recipe">
      {/* §53: the proposed name is a plain editable field — no separate naming step. */}
      <input
        value={name}
        onChange={(event) => onNameChange(event.target.value)}
        aria-label={homeCreatorCopy.recipe.nameLabel}
        placeholder={homeCreatorCopy.recipe.namePlaceholder}
        data-testid="home-recipe-name"
        className="w-full bg-transparent text-[24px] leading-tight font-semibold tracking-[-0.02em] outline-none sm:text-[28px]"
        style={{ color: 'var(--g-ink)' }}
      />

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {/* §59: the existing 1–10 authority, never re-derived here. */}
        <span
          className="inline-flex items-center gap-1.5 text-[13px]"
          data-testid="home-recipe-score"
          aria-label={score.ariaText}
          style={{ color: score.score !== null ? 'var(--g-score-green)' : 'var(--g-text-muted)' }}
        >
          <span className="font-mono text-[15px] font-semibold">{score.display}</span>
          <span style={{ color: 'var(--g-text-muted)' }}>{score.label}</span>
        </span>
        <span
          className="text-[13px]"
          data-testid="home-recipe-machine-line"
          style={{ color: 'var(--g-text-muted)' }}
        >
          {machineLine}
        </span>
      </div>

      {/* §54 the rows: name, grams, Crown, Topping marker. Nothing else. */}
      <ul
        className="mt-6 divide-y"
        style={{ borderColor: 'var(--g-line-quiet)' }}
        data-testid="home-recipe-lines"
      >
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-center gap-3 py-2.5"
            style={{ borderColor: 'var(--g-line-quiet)' }}
            data-testid="home-recipe-line"
          >
            <span className="min-w-0 flex-1 truncate text-[15px]" style={{ color: 'var(--g-ink)' }}>
              {item.ingredient.name}
              {crownLineIds.includes(item.id) ? (
                <span
                  className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-[0.1em]"
                  data-testid="home-crown-marker"
                  style={{ background: 'var(--g-ink)', color: '#ffffff' }}
                >
                  {homeCreatorCopy.recipe.crown.toUpperCase()}
                </span>
              ) : null}
            </span>
            <GramCell grams={item.planned_grams} canSeeGrams={canSeeGrams} />
            <RowMenu
              onRemove={() => onRemoveItem(item.id)}
              onSubstitute={() => onSubstitute(item.id)}
              onUnavailable={() => onUnavailable(item.id)}
            />
          </li>
        ))}
        {toppings.map((topping) => (
          <li
            key={topping.id}
            className="flex items-center gap-3 py-2.5"
            style={{ borderColor: 'var(--g-line-quiet)' }}
            data-testid="home-recipe-topping"
          >
            <span className="min-w-0 flex-1 truncate text-[15px]" style={{ color: 'var(--g-ink)' }}>
              {topping.ingredient.name}
              <span
                className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-[0.1em]"
                data-testid="home-topping-marker"
                style={{ background: 'var(--g-stepper-face)', color: 'var(--g-text-muted)' }}
              >
                {homeCreatorCopy.recipe.topping.toUpperCase()}
              </span>
            </span>
            <GramCell grams={topping.planned_grams} canSeeGrams={canSeeGrams} />
            <RowMenu onRemove={() => onRemoveItem(topping.id)} />
          </li>
        ))}
      </ul>

      {/* §61/§62 sweetness — three choices over the existing Direction axis. */}
      <div className="mt-6" data-testid="home-sweetness">
        <p
          className="text-[11px] font-bold tracking-[0.12em] uppercase"
          style={{ color: 'var(--g-text-muted)' }}
        >
          {homeCreatorCopy.sweetness.label}
        </p>
        <div
          role="radiogroup"
          aria-label={homeCreatorCopy.sweetness.label}
          className="mt-2 inline-flex overflow-hidden rounded-full border p-0.5"
          style={{ borderColor: 'var(--g-line)', background: 'var(--g-ivory)' }}
        >
          {HOME_SWEETNESS_ORDER.map((choice) => {
            const active = choice === activeSweetness;
            return (
              <button
                key={choice}
                type="button"
                role="radio"
                aria-checked={active}
                data-testid={`home-sweetness-${choice}`}
                onClick={() => onSweetness(choice)}
                className="min-h-[40px] rounded-full px-4 text-[13px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
                style={
                  active
                    ? { background: 'var(--g-ink)', color: '#ffffff' }
                    : { background: 'transparent', color: 'var(--g-ink)' }
                }
              >
                {SWEETNESS_LABEL[choice]}
              </button>
            );
          })}
        </div>
      </div>

      {/* §57 */}
      <p className="mt-8 text-[15px]" style={{ color: 'var(--g-text-secondary)' }}>
        {homeCreatorCopy.recipe.anythingElse}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onAddIngredient}
          data-testid="home-add-ingredient"
          className="min-h-[44px] rounded-full border px-4 text-[14px] focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
          style={{ borderColor: 'var(--g-line)', color: 'var(--g-ink)' }}
        >
          + {homeCreatorCopy.recipe.addIngredient}
        </button>
        <button
          type="button"
          onClick={onAddTopping}
          data-testid="home-add-topping"
          className="min-h-[44px] rounded-full border px-4 text-[14px] focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
          style={{ borderColor: 'var(--g-line)', color: 'var(--g-ink)' }}
        >
          + {homeCreatorCopy.recipe.addTopping}
        </button>
      </div>

      <div className="mt-10 flex flex-col gap-2.5">
        <button
          type="button"
          onClick={onLetsMakeIt}
          data-testid="home-lets-make-it"
          className="inline-flex min-h-[52px] w-full items-center justify-center rounded-full px-6 text-[15px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
          style={{ background: 'var(--g-ink)', color: '#ffffff' }}
        >
          {homeCreatorCopy.recipe.letsMakeIt}
        </button>
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onSave}
            data-testid="home-save-recipe"
            className={cn(
              'inline-flex min-h-[48px] flex-1 items-center justify-center rounded-full border px-5 text-[14px]',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40',
            )}
            style={{ borderColor: 'var(--g-line)', color: 'var(--g-ink)' }}
          >
            {homeCreatorCopy.recipe.save}
          </button>
          {/* §52: Share appears only when the recipe is actually eligible. */}
          {canShare ? (
            <button
              type="button"
              onClick={onShare}
              data-testid="home-share-community"
              className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-full border px-5 text-[14px] focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
              style={{ borderColor: 'var(--g-line)', color: 'var(--g-ink)' }}
            >
              {homeCreatorCopy.recipe.shareWithCommunity}
            </button>
          ) : null}
        </div>
      </div>
    </HomeSection>
  );
}
