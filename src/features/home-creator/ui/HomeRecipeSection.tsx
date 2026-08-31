/**
 * §52–§62 — the live HOME recipe.
 *
 * WHAT IS DELIBERATELY ABSENT (§52): percentages, PI-ING codes, product ids, POD/PAC/
 * NPAC, solids, kcal, cost, supplier and regulatory data. None of those values is read
 * by this component — they are not hidden with CSS, they never enter the render.
 *
 * §54 + owner-locked row, 2026-08-31. Every line carries the FINAL editing control:
 *
 *     ingredient | [ − ] [ grams/value ] [ + ] [ CLOSED lock ] [ ⋯ ]
 *
 * A Demo line shows the mask INSIDE the value segment — `••• g` — so the geometry is
 * identical whether or not grams are visible: revealing them changes the DATA, never the
 * control. The masked string is a constant with no digits in it (pinned by a copy test),
 * so no code path can leak a real gram through the placeholder, and operating a masked
 * control routes to the existing entitlement behaviour instead of doing nothing.
 *
 * The control is the shared PRO `DirectNumberControl`; HOME performs no arithmetic.
 */
import { useState } from 'react';
import { cn } from '@/lib/cn';
import type { EngineIngredient, RecipeItem } from '@/engine';
import type {
  RecipeToppingIngredient,
  RecipeToppingItem,
} from '@/features/recipe-composition/recipeCompositionPersistence';
import { ProductPickerPopover } from '@/features/ingredient-builder/ProductPickerPopover';
import type { IngredientLibrary } from '@/features/ingredient-builder/ingredientLibrary';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence/contracts';
import type { RecipeMatchScorePresentation } from '@/features/recipe-score';
import { DirectNumberControl } from '@/features/ingredient-builder/DirectNumberControl';
import { useRecipeStore } from '@/stores/recipeStore';
import { useHomeBehaviorContext } from '../useHomeBehaviorContext';
import { homeCreatorCopy } from '../homeCreatorCopy';
import {
  HOME_SWEETNESS_ORDER,
  projectSweetnessForDisplay,
  type HomeSweetness,
} from '../homeSweetness';
import { HomeRecalculate } from './HomeRecalculate';
import { HomeSection } from './HomeSection';

const SWEETNESS_LABEL: Readonly<Record<HomeSweetness, string>> = {
  less: homeCreatorCopy.sweetness.less,
  balanced: homeCreatorCopy.sweetness.balanced,
  sweeter: homeCreatorCopy.sweetness.sweeter,
};

/**
 * The FINAL recipe-editing control, owner-locked 2026-08-31:
 *
 *   [ − ] [ grams/value ] [ + ] [ CLOSED lock ]      then the row's [ ⋯ ]
 *
 * It is the shared PRO `DirectNumberControl` — same four-segment geometry, same 44 px
 * targets, same single closed padlock in BOTH lock states (state is colour, never a
 * different glyph), same orange focus. HOME contributes no arithmetic: `−`/`+` and the
 * value field all route to `setPlannedGrams`, and the padlock to `setLockType`.
 *
 * When grams are entitlement-hidden the geometry does NOT change. The `•••` renders
 * INSIDE the value segment and every numeric interaction routes to the existing
 * paywall/auth behaviour, so the customer sees the final editor from the beginning and
 * only the DATA becomes available later.
 */
function GramControl({
  lineId,
  name,
  grams,
  locked,
  canSeeGrams,
  onBlocked,
}: {
  lineId: string;
  name: string;
  grams: number;
  locked: boolean;
  canSeeGrams: boolean;
  onBlocked: () => void;
}) {
  return (
    <DirectNumberControl
      value={grams}
      step={1}
      min={0}
      decimals={0}
      suffix={homeCreatorCopy.recipe.grams}
      ariaLabel={`${name} — ${homeCreatorCopy.recipe.gramsFieldLabel}`}
      testId={`home-grams-${lineId}`}
      widthPreset="grams"
      density="responsive"
      onChange={(next) => useRecipeStore.getState().setPlannedGrams(lineId, next)}
      {...(canSeeGrams
        ? {}
        : {
            maskedValue: homeCreatorCopy.recipe.maskedGramsValue,
            maskedLabel: homeCreatorCopy.recipe.maskedGramsLabel,
            onMaskedInteract: onBlocked,
          })}
      lockSegment={{
        pressed: locked,
        ariaLabel: `${name} — ${homeCreatorCopy.recipe.lockLabel}`,
        title: homeCreatorCopy.recipe.lockLabel,
        suffix: 'g',
        testId: `home-lock-${lineId}`,
        onToggle: () =>
          useRecipeStore.getState().setLockType(lineId, locked ? 'unlocked' : 'grams'),
      }}
    />
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
  library,
  onAddIngredient,
  onAddTopping,
  onGramsBlocked,
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
  /** §56: the SAME Pro picker, in a simpler HOME presentation. */
  library: IngredientLibrary;
  onAddIngredient: (ingredient: EngineIngredient, behavior?: ProductBehaviorSnapshot) => void;
  /** Entitlement route when a masked gram control is operated. */
  onGramsBlocked: () => void;
  onAddTopping: (ingredient: RecipeToppingIngredient, behavior?: ProductBehaviorSnapshot) => void;
  onSave: () => void;
  onLetsMakeIt: () => void;
  onShare: () => void;
  canShare: boolean;
  onBack?: (() => void) | null;
}) {
  const activeSweetness = projectSweetnessForDisplay(sweetnessStored as -2 | -1 | 0 | 1 | 2);

  const {
    accountId: behaviorAccountId,
    productProfile: behaviorProfile,
    temperatureC: behaviorTemperatureC,
    mode: behaviorMode,
  } = useHomeBehaviorContext();

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
            <GramControl
              lineId={item.id}
              name={item.ingredient.name}
              grams={item.planned_grams}
              locked={item.lock_type === 'grams'}
              canSeeGrams={canSeeGrams}
              onBlocked={onGramsBlocked}
            />
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
            <GramControl
              lineId={topping.id}
              name={topping.ingredient.name}
              grams={topping.planned_grams}
              locked={false}
              canSeeGrams={canSeeGrams}
              onBlocked={onGramsBlocked}
            />
            <RowMenu onRemove={() => onRemoveItem(topping.id)} />
          </li>
        ))}
      </ul>

      {/* OWNER CORRECTION (HOME-UX-ADD-INGREDIENT, 2026-08-31): after the first
          ingredient it was not obvious how to add another. The add controls existed,
          but far below — past sweetness, past Przelicz, past a paragraph — so they read
          as unrelated to the list. They now sit immediately after the last row.

          ONE affordance for the section, not one per row, and it stays put at 1, 2 or
          3+ ingredients because it is a sibling of the list, not part of it. The button
          IS the canonical `ProductPickerPopover` trigger — HOME adds no selection
          logic — rendered in the Designbook round icon-button variant. The visible
          label is a desktop-only hint; the accessible name comes from the trigger. */}
      <div
        className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-2"
        data-testid="home-add-controls"
      >
        <span className="inline-flex items-center gap-2" data-testid="home-add-ingredient">
          <ProductPickerPopover
            library={library}
            scope="BASE_FORMULATION"
            triggerVariant="icon"
            behaviorContext={{
              accountId: behaviorAccountId,
              productProfile: behaviorProfile,
              temperatureC: behaviorTemperatureC,
              mode: behaviorMode,
            }}
            triggerLabel={homeCreatorCopy.recipe.addIngredient}
            onAdd={(ingredient, behavior) => onAddIngredient(ingredient, behavior)}
          />
          <span
            aria-hidden
            className="max-sm:hidden text-[13px]"
            style={{ color: 'var(--g-text-secondary)' }}
          >
            {homeCreatorCopy.recipe.addIngredient}
          </span>
        </span>
        {/* Toppings get the analogous affordance wherever toppings are offered. HOME has
            no toppings-availability gate today — the topping picker has always been
            rendered unconditionally — so this follows the SAME availability rather than
            inventing a new rule. Recorded as HOME-UX-TOPPING-GATE. */}
        <span className="inline-flex items-center gap-2" data-testid="home-add-topping">
          <ProductPickerPopover
            library={library}
            scope="POST_PROCESS_ADDON"
            triggerVariant="icon"
            behaviorContext={{
              accountId: behaviorAccountId,
              productProfile: behaviorProfile,
              temperatureC: behaviorTemperatureC,
              mode: behaviorMode,
            }}
            triggerLabel={homeCreatorCopy.recipe.addTopping}
            onAdd={(ingredient, behavior) => onAddTopping(ingredient, behavior)}
          />
          <span
            aria-hidden
            className="max-sm:hidden text-[13px]"
            style={{ color: 'var(--g-text-secondary)' }}
          >
            {homeCreatorCopy.recipe.addTopping}
          </span>
        </span>
      </div>

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

      {/* §60: the existing Recalculate → Preview → Apply workflow, plainly worded. */}
      <HomeRecalculate />

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
